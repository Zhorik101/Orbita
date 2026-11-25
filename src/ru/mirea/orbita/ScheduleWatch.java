package ru.mirea.orbita;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

public class ScheduleWatch extends JobService {
    private static final int JOB = 4103;
    private static final String ORIGIN = "https://orbita-schedule.local/";
    private static final String PAGE = ORIGIN + "schedule-background.html";
    private JobParameters current;
    private WebView engine;
    private Runnable timeout;
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());

    private static SharedPreferences data(Context context) {
        return context.getSharedPreferences("schedule-watch", MODE_PRIVATE);
    }

    private static JSONObject ownGroup(Context context) throws Exception {
        JSONObject state = new JSONObject(context.getSharedPreferences("orbita", MODE_PRIVATE).getString("state", "{}"));
        JSONObject group = state.optJSONObject("pinnedGroup");
        if (group == null) group = state.optJSONObject("officialGroup");
        return (state.optBoolean("scheduleChangePush") || CalendarSync.enabled(context, "pairs")) && group != null && group.optInt("target") == 1 && group.optLong("id") > 0
            ? group : null;
    }

    static void configure(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        try {
            if (ownGroup(context) == null) { scheduler.cancel(JOB); return; }
            if (scheduler.getPendingJob(JOB) != null) return;
            scheduler.schedule(new JobInfo.Builder(JOB, new ComponentName(context, ScheduleWatch.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(30 * 60 * 1000L).setPersisted(true).build());
        } catch (Exception ignored) {}
    }

    static synchronized void baseline(Context context, String key, String raw) {
        try {
            JSONObject own = ownGroup(context);
            if (own == null || !key.equals("1:" + own.optLong("id")) || raw == null
                || raw.length() > 8000000 || !raw.contains("BEGIN:VCALENDAR")) return;
            SharedPreferences prefs = data(context);
            SharedPreferences.Editor edit = prefs.edit();
            if (!key.equals(prefs.getString("key", ""))) edit.remove("changes");
            edit.putString("key", key).putString("raw", raw).putLong("version", prefs.getLong("version", 0) + 1).apply();
        } catch (Exception ignored) {}
    }

    static synchronized String inbox(Context context) {
        try {
            SharedPreferences prefs = data(context);
            JSONArray changes = new JSONArray(prefs.getString("changes", "[]"));
            if (changes.length() == 0) return "{}";
            return new JSONObject().put("key", prefs.getString("key", ""))
                .put("raw", prefs.getString("raw", "")).put("updated", prefs.getLong("updated", 0))
                .put("changes", changes).toString();
        } catch (Exception invalid) { return "{}"; }
    }

    static synchronized void acknowledge(Context context, long stamp) {
        SharedPreferences prefs = data(context);
        if (prefs.getLong("updated", -1) == stamp) prefs.edit().remove("changes").apply();
    }

    @Override public boolean onStartJob(JobParameters parameters) {
        final JSONObject group;
        try { group = ownGroup(this); } catch (Exception invalid) { return false; }
        if (group == null) return false;
        current = parameters;
        SharedPreferences prefs = data(this);
        String key = "1:" + group.optLong("id");
        long version = prefs.getLong("version", 0);
        String before = key.equals(prefs.getString("key", "")) ? prefs.getString("raw", "") : "";
        new Thread(() -> {
            try {
                String after = fetch(group.optLong("id"));
                main.post(() -> {
                    if (current != parameters) return;
                    if (before.equals(after) && !CalendarSync.enabled(this, "pairs")) { finishCheck(false); return; }
                    compare(parameters, group, key, version, before, after);
                });
            } catch (Exception offline) {
                main.post(() -> { if (current == parameters) finishCheck(true); });
            }
        }, "mirea-schedule-check").start();
        return true;
    }

    private static String fetch(long group) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection)new URL(
            "https://schedule-of.mirea.ru/schedule/api/ical/Group/" + group + "?includeMeta=true").openConnection();
        try {
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "text/calendar");
            if (connection.getResponseCode() != 200) throw new java.io.IOException("Calendar unavailable");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 8000000) throw new java.io.IOException("Calendar too large");
                    bytes.write(buffer, 0, count);
                }
                return bytes.toString("UTF-8");
            }
        } finally { connection.disconnect(); }
    }

    private void compare(JobParameters parameters, JSONObject group, String key, long version, String before, String after) {
        try {
            engine = new WebView(this);
            engine.getSettings().setJavaScriptEnabled(true);
            engine.getSettings().setBlockNetworkLoads(false);
            engine.getSettings().setAllowContentAccess(false);
            engine.getSettings().setAllowFileAccess(false);
            timeout = () -> { if (current == parameters) finishCheck(true); };
            main.postDelayed(timeout, 20000);
            engine.setWebViewClient(new WebViewClient() {
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    if (PAGE.equals(url) || (ORIGIN + "schedule-engine.js").equals(url) || (ORIGIN + "vendor/ical.js").equals(url)) {
                        try {
                            return new android.webkit.WebResourceResponse(url.endsWith(".js") ? "application/javascript" : "text/html",
                                "UTF-8", getAssets().open(url.substring(ORIGIN.length())));
                        } catch (java.io.IOException ignored) {}
                    }
                    return new android.webkit.WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                        java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
                }

                @Override public void onPageFinished(WebView view, String url) {
                    if (current != parameters || !PAGE.equals(url)) return;
                    String next = JSONObject.quote(after);
                    String calendar = "null";
                    if (CalendarSync.enabled(ScheduleWatch.this, "pairs")) {
                        String subgroup = "";
                        JSONObject variants = null;
                        JSONArray hiddenVariants = null;
                        try {
                            JSONObject state = new JSONObject(getSharedPreferences("orbita", MODE_PRIVATE).getString("state", "{}"));
                            JSONObject choices = state.optJSONObject("subgroups");
                            if (choices != null) subgroup = choices.optString(key);
                            JSONObject allVariants = state.optJSONObject("lessonVariants");
                            if (allVariants != null) variants = allVariants.optJSONObject(key);
                            JSONObject hidden = state.optJSONObject("hiddenLessonVariants");
                            if (hidden != null) hiddenVariants = hidden.optJSONArray(key);
                        } catch (Exception ignored) {}
                        calendar = "calendarSyncPairsPayload(" + next + "," + group + "," + JSONObject.quote(subgroup) + ",new Date()," + (variants == null ? "null" : variants.toString()) + "," + (hiddenVariants == null ? "null" : hiddenVariants.toString()) + ")";
                    }
                    String delta = before.isEmpty() || before.equals(after) ? "[]" :
                        "scheduleDiff(scheduleSnapshot(" + JSONObject.quote(before) + "),scheduleSnapshot(" + next + "))";
                    String script = "(()=>{try{scheduleSnapshot(" + next + ");return {changes:" + delta
                        + ",calendar:" + calendar + "}}catch(e){return null}})()";
                    view.evaluateJavascript(script, result -> {
                        if (current != parameters) return;
                        try {
                            JSONObject parsed = new JSONObject(result);
                            applyChanges(group, key, version, after, parsed.getJSONArray("changes"));
                            JSONObject calendarPayload = parsed.optJSONObject("calendar");
                            if (calendarPayload != null && data(ScheduleWatch.this).getLong("version", 0) == version + 1
                                && after.equals(data(ScheduleWatch.this).getString("raw", "")))
                                CalendarSync.pairs(ScheduleWatch.this, calendarPayload.toString(),
                                    () -> main.post(() -> { if (current == parameters) finishCheck(false); }));
                            else finishCheck(false);
                        } catch (Exception invalid) { finishCheck(true); }
                    });
                }
            });
            engine.loadUrl(PAGE);
        } catch (Exception unavailable) { finishCheck(true); }
    }

    private void applyChanges(JSONObject group, String key, long version, String raw, JSONArray delta) throws Exception {
        SharedPreferences prefs = data(this);
        synchronized (ScheduleWatch.class) {
            JSONObject own = ownGroup(this);
            if (own == null || own.optLong("id") != group.optLong("id") || prefs.getLong("version", 0) != version) return;
            long stamp = System.currentTimeMillis();
            JSONArray previous = key.equals(prefs.getString("key", "")) ? new JSONArray(prefs.getString("changes", "[]")) : new JSONArray();
            JSONArray inbox = new JSONArray();
            for (int i = 0; i < delta.length() && inbox.length() < 100; i++)
                inbox.put(delta.getJSONObject(i).put("backgroundId", stamp + "-" + i).put("target", group).put("at", stamp).put("read", false));
            for (int i = 0; i < previous.length() && inbox.length() < 100; i++) inbox.put(previous.getJSONObject(i));
            prefs.edit().putString("key", key).putString("raw", raw).putString("changes", inbox.toString())
                .putLong("version", version + 1).putLong("updated", stamp).commit();
        }
        JSONObject state = new JSONObject(getSharedPreferences("orbita", MODE_PRIVATE).getString("state", "{}"));
        if (delta.length() == 0 || !state.optBoolean("scheduleChangePush") || !LessonReminder.allowed(this)) return;
        JSONObject change = delta.getJSONObject(0);
        JSONObject old = change.optJSONObject("before"), now = change.optJSONObject("after");
        String title = change.optString("kind") + " · " + (now != null ? now : old).optString("title");
        String body = (old == null ? "" : "Было: " + describe(old))
            + (now == null ? "" : (old == null ? "" : "\n") + "Стало: " + describe(now));
        if (delta.length() > 1) body += "\nДругие изменения: " + (delta.length() - 1);
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("schedule-changes", "Изменения расписания", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(this, MainActivity.class).putExtra("page", "pairs").putExtra("showChanges", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 992, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        manager.notify(992, new Notification.Builder(this, "schedule-changes").setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(tap).setAutoCancel(true).build());
    }

    private static String describe(JSONObject row) {
        return row.optString("date") + " · " + row.optString("start") + "–" + row.optString("end")
            + " · " + row.optString("room") + " " + row.optString("campus");
    }

    private void clear() {
        current = null;
        if (engine != null) {
            if (timeout != null) main.removeCallbacks(timeout);
            engine.destroy();
            engine = null;
        }
        timeout = null;
    }

    private void finishCheck(boolean retry) {
        JobParameters parameters = current;
        clear();
        if (parameters != null) jobFinished(parameters, retry);
    }

    @Override public boolean onStopJob(JobParameters parameters) { clear(); return true; }
}
