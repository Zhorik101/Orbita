package ru.mirea.orbita;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.time.LocalDate;
import java.time.ZoneId;
import org.json.JSONArray;
import org.json.JSONObject;

public class WorkReminder extends BroadcastReceiver {
    private static final String ACTION = "ru.mirea.orbita.WORK_DUE";
    private static final String CHANNEL = "work-due";
    private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");

    private static JSONArray tasks(Context context) throws Exception {
        JSONObject state = new JSONObject(context.getSharedPreferences("orbita", 0).getString("state", "{}"));
        JSONArray tasks = state.optJSONArray("tasks");
        return tasks == null ? new JSONArray() : tasks;
    }

    static long reminderTime(JSONObject task) {
        if (task == null || task.optBoolean("done") || task.optString("workId").isEmpty()) return 0;
        try {
            LocalDate due = LocalDate.parse(task.optString("dueISO"));
            switch (task.optString("deadlineReminder")) {
                case "evening": return due.minusDays(1).atTime(19, 0).atZone(MOSCOW).toInstant().toEpochMilli();
                case "morning": return due.atTime(8, 0).atZone(MOSCOW).toInstant().toEpochMilli();
                default: return 0;
            }
        } catch (java.time.DateTimeException invalid) { return 0; }
    }

    private static final String DAILY = "ru.mirea.orbita.WORK_DAILY";
    private static final String DAILY_CHANNEL = "work-daily";

    private static JSONObject dailyConfig(Context context) throws Exception {
        return new JSONObject(context.getSharedPreferences("orbita", 0).getString("state", "{}"))
            .optJSONObject("dailyWorkReminder");
    }

    private static java.time.LocalTime dailyTime(JSONObject config) {
        if (config == null || !config.optBoolean("enabled")) return null;
        try { return java.time.LocalTime.parse(config.optString("time", "19:00")); }
        catch (java.time.DateTimeException invalid) { return null; }
    }

    static long nextDaily(java.time.ZonedDateTime now, java.time.LocalTime time, String lastDay) {
        java.time.ZonedDateTime next = now.toLocalDate().atTime(time).atZone(now.getZone());
        if (!next.isAfter(now) || now.toLocalDate().toString().equals(lastDay)) next = now.toLocalDate().plusDays(1).atTime(time).atZone(now.getZone());
        return next.toInstant().toEpochMilli();
    }

    private static PendingIntent dailyAlarm(Context context) {
        return PendingIntent.getBroadcast(context, 4105, new Intent(context, WorkReminder.class).setAction(DAILY),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static java.util.List<JSONObject> pendingWork(Context context) throws Exception {
        JSONArray all = tasks(context);
        java.util.List<JSONObject> active = new java.util.ArrayList<>();
        for (int i = 0; i < all.length(); i++) {
            JSONObject task = all.optJSONObject(i);
            if (task != null && !task.optBoolean("done")) active.add(task);
        }
        active.sort(java.util.Comparator.comparing(task -> task.optString("dueISO").isEmpty() ? "9999" : task.optString("dueISO")));
        return active;
    }

    private static void scheduleDaily(Context context, AlarmManager manager) throws Exception {
        java.time.LocalTime time = dailyTime(dailyConfig(context));
        SharedPreferences history = context.getSharedPreferences("work-reminders", 0);
        PendingIntent alarm = dailyAlarm(context);
        if (time == null || !LessonReminder.allowed(context) || pendingWork(context).isEmpty()) { manager.cancel(alarm); history.edit().remove("dailyScheduled").apply(); return; }
        long next = nextDaily(java.time.ZonedDateTime.now(), time, history.getString("lastDailyDate", ""));
        long scheduled = history.getLong("dailyScheduled", 0);
        // Keep an already due alarm when another save occurs while Android delays delivery.
        if (scheduled <= System.currentTimeMillis() && scheduled > System.currentTimeMillis() - 6 * 3600000L
            && time.toString().equals(history.getString("dailyScheduledTime", ""))
            && !LocalDate.now().toString().equals(history.getString("lastDailyDate", ""))) return;
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarm);
        history.edit().putLong("dailyScheduled", next).putString("dailyScheduledTime", time.toString()).apply();
    }

    private static void sendDaily(Context context) throws Exception {
        SharedPreferences history = context.getSharedPreferences("work-reminders", 0);
        history.edit().remove("dailyScheduled").apply();
        String today = LocalDate.now().toString();
        if (dailyTime(dailyConfig(context)) == null || !LessonReminder.allowed(context)
            || today.equals(history.getString("lastDailyDate", ""))) return;
        java.util.List<JSONObject> pending = pendingWork(context);
        if (pending.isEmpty()) return;
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < Math.min(pending.size(),3); i++) {
            JSONObject task = pending.get(i);
            if(i>0)body.append('\n');
            body.append(task.optString("text","Задача"));
            if(!task.optString("subject").isEmpty())body.append(" · ").append(task.optString("subject"));
            if(!task.optString("dueISO").isEmpty())body.append(" · ").append(task.optString("due"));
        }
        if(pending.size()>3)body.append("\nЕщё задач: ").append(pending.size()-3);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(DAILY_CHANNEL,"Ежедневный список задач",NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(context,MainActivity.class).setAction(DAILY).putExtra("page","tasks")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context,4105,open,PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        manager.notify("work-daily",4105,new Notification.Builder(context,DAILY_CHANNEL).setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Незавершённые задачи · "+pending.size()).setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(tap).setAutoCancel(true).build());
        history.edit().putString("lastDailyDate",today).apply();
    }

    private static PendingIntent alarm(Context context) {
        return PendingIntent.getBroadcast(context, 4104, new Intent(context, WorkReminder.class).setAction(ACTION),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static synchronized void schedule(Context context) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        if (manager == null) return;
        try { scheduleDaily(context,manager); } catch (Exception ignored) {}
        try {
            SharedPreferences history = context.getSharedPreferences("work-reminders", 0);
            JSONArray tasks = tasks(context);
            long next = Long.MAX_VALUE, now = System.currentTimeMillis();
            boolean allowed = LessonReminder.allowed(context);
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject task = tasks.optJSONObject(i);
                long at = reminderTime(task);
                if (!allowed || at == 0 || history.getLong(task.optString("workId"), 0) == at) continue;
                if (at < now - 30 * 60000L) continue;
                next = Math.min(next, Math.max(at, now + 1000));
            }
            PendingIntent alarm = alarm(context);
            if (next == Long.MAX_VALUE) manager.cancel(alarm);
            else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarm);
        } catch (Exception ignored) {}
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (DAILY.equals(intent.getAction())) {
            try { sendDaily(context); } catch (Exception ignored) {}
            schedule(context);
            return;
        }
        if (!ACTION.equals(intent.getAction())) {
            context.getSharedPreferences("work-reminders",0).edit().remove("dailyScheduled").apply();
        }
        if (ACTION.equals(intent.getAction()) && LessonReminder.allowed(context)) {
            try {
                NotificationManager manager = context.getSystemService(NotificationManager.class);
                manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Сроки работ", NotificationManager.IMPORTANCE_DEFAULT));
                SharedPreferences history = context.getSharedPreferences("work-reminders", 0);
                JSONArray tasks = tasks(context);
                long now = System.currentTimeMillis();
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject task = tasks.optJSONObject(i);
                    long at = reminderTime(task);
                    if (at == 0 || at > now + 1000 || at < now - 12 * 3600000L) continue;
                    String id = task.optString("workId");
                    if (history.getLong(id, 0) == at) continue;
                    int notification = id.hashCode();
                    Intent open = new Intent(context, MainActivity.class).setAction("ru.mirea.orbita.DUE." + id)
                        .putExtra("page", "tasks").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent tap = PendingIntent.getActivity(context, notification, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    manager.notify("work-due", notification, new Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_launcher)
                        .setContentTitle(task.optString("text")).setContentText(task.optString("subject") + " · Сдать " + task.optString("due"))
                        .setContentIntent(tap).setAutoCancel(true).build());
                    history.edit().putLong(id, at).apply();
                }
            } catch (Exception ignored) {}
        }
        schedule(context);
    }
}
