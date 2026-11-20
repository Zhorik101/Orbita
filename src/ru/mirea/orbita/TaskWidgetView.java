package ru.mirea.orbita;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

final class TaskWidgetView {
    static final String COMPLETE = "ru.mirea.orbita.widget.COMPLETE_WORK";
    static final String UNDO = "ru.mirea.orbita.widget.UNDO_WORK";
    private static final DateTimeFormatter SHORT_DATE = DateTimeFormatter.ofPattern("dd.MM", Locale.ROOT);

    private TaskWidgetView() {}

    private static LocalDate due(JSONObject task) {
        try {
            return LocalDate.parse(task.optString("dueISO"));
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    private static String dueLabel(JSONObject task, LocalDate today) {
        LocalDate date = due(task);
        if (date == null) {
            String legacy = task.optString("due");
            return "Без срока".equals(legacy) ? "" : legacy;
        }
        if (date.isEqual(today)) return "Сегодня";
        if (date.isEqual(today.plusDays(1))) return "Завтра";
        return (date.isBefore(today) ? "Просрочено · " : "До ") + date.format(SHORT_DATE);
    }

    private static PendingIntent mark(Context context, Class<?> receiver, int widgetId, JSONObject task, String action) {
        String id = task.optString("workId");
        long revision = task.optLong(WidgetTasks.REVISION);
        Uri identity = new Uri.Builder().scheme("orbita-widget").authority("work")
            .appendPath(id).appendPath(Long.toString(revision)).build();
        Intent intent = new Intent(context, receiver).setAction(action).setData(identity)
            .putExtra("workId", id).putExtra(WidgetTasks.REVISION, revision);
        return PendingIntent.getBroadcast(context, widgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent complete(Context context, Class<?> receiver, int widgetId, JSONObject state, JSONObject task) {
        if (!WidgetCelebrationActivity.shouldCelebrate(state, task)) return mark(context, receiver, widgetId, task, COMPLETE);
        String id = task.optString("workId");
        long revision = task.optLong(WidgetTasks.REVISION);
        Intent intent = new Intent(context, WidgetCelebrationActivity.class)
            .setData(new Uri.Builder().scheme("orbita-widget").authority("celebrate").appendPath(id)
                .appendPath(Long.toString(revision)).build())
            .putExtra("workId", id).putExtra(WidgetTasks.REVISION, revision)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        return PendingIntent.getActivity(context, widgetId, intent, PendingIntent.FLAG_IMMUTABLE);
    }

    static void bind(Context context, RemoteViews views, JSONObject state, boolean deadlines,
                     Class<?> receiver, int id, int width, int height, LocalDate today,
                     int text, int muted, int accent, PendingIntent open) {
        List<JSONObject> active = new ArrayList<>();
        JSONArray tasks = state.optJSONArray("tasks");
        for (int i = 0; tasks != null && i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task != null && !task.optBoolean("done") && (!deadlines || due(task) != null)) active.add(task);
        }
        active.sort(Comparator.comparing(TaskWidgetView::due, Comparator.nullsLast(Comparator.naturalOrder())));

        String undoId = context.getSharedPreferences("orbita", Context.MODE_PRIVATE).getString(WidgetTasks.UNDO_ID, null);
        JSONObject last = WidgetTasks.find(state, undoId);
        boolean canUndo = last != null && last.optBoolean("done") && (!deadlines || due(last) != null);
        views.setViewVisibility(R.id.task_widget_undo, canUndo ? View.VISIBLE : View.GONE);
        if (canUndo) {
            views.setTextColor(R.id.task_widget_undo, accent);
            views.setContentDescription(R.id.task_widget_undo, "Отменить выполнение: " + last.optString("text"));
            views.setOnClickPendingIntent(R.id.task_widget_undo, mark(context, receiver, id, last, UNDO));
        }

        String title = deadlines ? "Дедлайны" : "Задачи";
        if (!canUndo || width >= 230) title += " · " + active.size();
        views.setTextViewText(R.id.widget_title, title);
        views.setTextColor(R.id.widget_title, text);
        views.setInt(R.id.task_widget_add, "setColorFilter", accent);
        PendingIntent add = OrbitWidget.taskAction(context, id, deadlines ? "addDue" : "add", "");
        views.setOnClickPendingIntent(R.id.task_widget_add, add);
        views.setTextColor(R.id.task_widget_presets, accent);
        views.setOnClickPendingIntent(R.id.task_widget_presets,
            OrbitWidget.taskAction(context, id, deadlines ? "addDuePreset" : "addPreset", ""));

        boolean large = height >= 225 && width >= 215;
        float fontScale = context.getResources().getConfiguration().fontScale;
        int rowHeight = Math.max(44, (int)Math.ceil((large ? 49 : 33) * fontScale + 7));
        int available = Math.max(0, height - 56);
        int capacity = Math.max(1, available / rowHeight);
        boolean showFooter = active.size() > capacity && available >= rowHeight + 24;
        if (showFooter) capacity = Math.max(1, (available - 24) / rowHeight);

        views.removeAllViews(R.id.widget_rows);
        for (int i = 0; i < Math.min(capacity, active.size()); i++) {
            JSONObject task = active.get(i);
            String taskId = task.optString("workId");
            String name = task.optString("text");
            String subject = task.optString("subject");
            String date = dueLabel(task, today);
            String detail = date.isEmpty() ? subject : subject.isEmpty() ? date : date + " · " + subject;
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_task_row);
            row.setTextViewText(R.id.row_title, name);
            row.setTextViewText(R.id.row_detail, detail);
            row.setTextColor(R.id.row_title, text);
            row.setTextColor(R.id.row_detail, muted);
            row.setViewVisibility(R.id.row_detail, detail.isEmpty() ? View.GONE : View.VISIBLE);
            String comment = task.optString("comment");
            if (large && !comment.isEmpty()) {
                row.setViewVisibility(R.id.task_widget_comment, View.VISIBLE);
                row.setTextViewText(R.id.task_widget_comment, comment);
                row.setTextColor(R.id.task_widget_comment, muted);
            }
            row.setInt(R.id.task_widget_check, "setColorFilter", accent);
            row.setContentDescription(R.id.task_widget_check, "Выполнить: " + name + " · " + subject);
            row.setOnClickPendingIntent(R.id.task_widget_check, complete(context, receiver, id, state, task));
            row.setContentDescription(R.id.task_widget_edit, "Изменить: " + name + " · " + detail);
            row.setOnClickPendingIntent(R.id.task_widget_edit, OrbitWidget.taskAction(context, id, "edit", taskId));
            views.addView(R.id.widget_rows, row);
        }

        views.setViewVisibility(R.id.widget_body, active.isEmpty() ? View.VISIBLE : View.GONE);
        if (active.isEmpty()) {
            String empty = deadlines ? "Нет работ со сроком" : tasks == null || tasks.length() == 0 ? "Пока нет задач" : "Все работы выполнены";
            views.setTextViewText(R.id.widget_body, empty);
            views.setTextColor(R.id.widget_body, muted);
            views.setOnClickPendingIntent(R.id.widget_body, add);
        }
        views.setViewVisibility(R.id.widget_footer, showFooter ? View.VISIBLE : View.GONE);
        if (showFooter) {
            views.setTextViewText(R.id.widget_footer, "Ещё " + (active.size() - capacity) + " · Все задачи ›");
            views.setTextColor(R.id.widget_footer, accent);
            views.setOnClickPendingIntent(R.id.widget_footer, open);
        }
    }
}
