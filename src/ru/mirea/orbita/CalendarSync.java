package ru.mirea.orbita;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

final class CalendarSync {
    private static final java.util.concurrent.ScheduledExecutorService queue = Executors.newSingleThreadScheduledExecutor();
    private static ScheduledFuture<?> pending;
    private CalendarSync() {}

    private static SharedPreferences status(Context context) {
        return context.getSharedPreferences("calendar-auto-sync", 0);
    }

    private static JSONObject state(Context context) throws Exception {
        return new JSONObject(context.getSharedPreferences("orbita", 0).getString("state", "{}"));
    }

    static boolean enabled(Context context, String kind) {
        try {
            JSONObject config = state(context).optJSONObject("calendarAutoSync");
            return config != null && config.optLong("id", -1) >= 0 && config.optBoolean(kind);
        } catch (Exception invalid) { return false; }
    }

    static String statusText(Context context) { return status(context).getString("message", ""); }

    private static synchronized void publish(Context context, JSONObject payload, String kind) {
        try {
            JSONObject current = state(context);
            JSONObject config = current.optJSONObject("calendarAutoSync");
            if (config == null || !config.optBoolean(kind) || config.optLong("id", -1) < 0) return;
            if (!CalendarImport.allowed(context)) throw new SecurityException("Разреши доступ к календарю");
            if ("pairs".equals(kind)) {
                JSONObject own = current.optJSONObject("pinnedGroup");
                if (own == null) own = current.optJSONObject("officialGroup");
                if (own == null || !("1:" + own.optLong("id")).equals(payload.optString("scope"))) return;
            }
            long destination = config.optLong("id");
            JSONArray available = new JSONObject(CalendarImport.calendars(context)).optJSONArray("calendars");
            boolean google = false;
            for (int i = 0; available != null && i < available.length(); i++) {
                JSONObject calendar = available.getJSONObject(i);
                if (calendar.optLong("id", -1) == destination && "com.google".equals(calendar.optString("accountType"))) {
                    google = true;
                    break;
                }
            }
            if (!google) throw new IllegalStateException("Google Calendar unavailable");
            payload.put("calendar", destination);
            CalendarImport.perform(context, payload.toString());
            status(context).edit().putString("message", "Записи переданы календарю Android").apply();
        } catch (Exception unavailable) {
            status(context).edit().putString("message", "Не удалось обновить календарь. Проверь доступ и выбранный аккаунт.").apply();
        }
    }

    static void pairs(Context context, String payload) {
        pairs(context, payload, () -> {});
    }

    static void pairs(Context context, String payload, Runnable finished) {
        if (payload == null || payload.length() > 4000000 || !enabled(context,"pairs")) { finished.run(); return; }
        Context app = context.getApplicationContext();
        queue.execute(() -> {
            try { publish(app, new JSONObject(payload), "pairs"); }
            catch (org.json.JSONException ignored) {}
            finally { finished.run(); }
        });
    }

    static synchronized void requestTasks(Context context) {
        if (!enabled(context,"tasks")) return;
        Context app = context.getApplicationContext();
        if (pending != null) pending.cancel(false);
        pending = queue.schedule(() -> {
            try { publish(app, taskPayload(state(app)), "tasks"); }
            catch (Exception ignored) {}
        }, 300, TimeUnit.MILLISECONDS);
    }

    private static String taskCalendarTitle(JSONObject task) {
        String kind = task.optString("kind").trim();
        String title = task.optString("text", "Работа").trim();
        String subject = task.optString("subject").trim();
        if ("Органическая химия".equalsIgnoreCase(subject)) subject = "Органика";
        else if ("Информационные технологии в химии".equalsIgnoreCase(subject)) subject = "ИТ в химии";
        String badge;
        switch (kind) {
            case "Лабораторная": badge = "📌 [Сдать лаб]"; break;
            case "Практическая": badge = "📌 [Сдать практ]"; break;
            case "Чертёж": badge = "📌 [Сдать чертёж]"; break;
            case "Конспект": badge = "📌 [Сдать консп]"; break;
            case "Контрольная": badge = "📌 [Контр]"; break;
            case "Отчёт": badge = "📌 [Сдать отчёт]"; break;
            case "Домашнее задание": badge = "📌 [Сдать ДЗ]"; break;
            case "Курсовая": badge = "📌 [Сдать курс]"; break;
            case "Подготовка к зачёту": badge = "📌 [К зачёту]"; break;
            case "Презентация": badge = "📌 [Сдать през]"; break;
            default: return "📌 [Срок] " + title + (subject.isEmpty() || "Личное".equals(subject) ? "" : " · " + subject);
        }
        String details = title.equals(kind) ? "" : title.startsWith(kind + " ") ? title.substring(kind.length()).trim() : title;
        if (subject.isEmpty() || "Личное".equals(subject)) {
            return badge + " " + (details.isEmpty() ? kind : details);
        }
        return badge + " " + subject + (details.isEmpty() ? "" : " " + details);
    }

    static JSONObject taskPayload(JSONObject state) throws Exception {
        JSONArray events = new JSONArray(), tasks = state.optJSONArray("tasks");
        long from = Long.MAX_VALUE, to = 0;
        for (int i = 0; tasks != null && i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null || task.optBoolean("done") || task.optString("workId").isEmpty()) continue;
            LocalDate date;
            try { date = LocalDate.parse(task.optString("dueISO")); }
            catch (java.time.DateTimeException invalid) { continue; }
            if (date.getYear() < 1971 || date.getYear() > 2200) continue;
            long start = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
            long end = start + 86400000;
            from = Math.min(from, start);
            to = Math.max(to, end);
            String source=SdoPortalLinks.bookmark(task.optString("sdoUrl"));
            events.put(new JSONObject().put("uid",task.optString("workId")).put("start",start).put("end",end)
                .put("title",taskCalendarTitle(task)).put("description",
                    task.optString("text","Работа") + "\n" + task.optString("subject") + "\n" + task.optString("comment")
                    + (source.isEmpty()?"":"\nСДО: "+source)));
        }
        return new JSONObject().put("scope","tasks").put("events",events)
            .put("from",events.length()==0?86400000L:from).put("to",events.length()==0?172800000L:to);
    }
}
