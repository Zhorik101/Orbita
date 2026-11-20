package ru.mirea.orbita;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

public class OrbitWidget extends AppWidgetProvider {
    private static boolean updateQueued;

    static synchronized void requestUpdate(Context context) {
        if (updateQueued) return;
        updateQueued = true;
        Context app = context.getApplicationContext();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            synchronized (OrbitWidget.class) { updateQueued = false; }
            updateAll(app);
        }, 80);
    }

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (TaskWidgetView.COMPLETE.equals(action) || TaskWidgetView.UNDO.equals(action)) {
            if (!"tasks".equals(kind()) && !"deadlines".equals(kind())) return;
            boolean changed = WidgetTasks.act(context.getSharedPreferences("orbita", Context.MODE_PRIVATE),
                intent.getStringExtra("workId"), intent.getLongExtra(WidgetTasks.REVISION, -1),
                TaskWidgetView.COMPLETE.equals(action));
            if (changed && TaskWidgetView.COMPLETE.equals(action)) CompletionFeedback.play(context);
            updateAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    protected String kind() { return "day"; }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id, kind(), getClass());
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id, kind(), getClass());
    }
    public static void updateAll(Context context) {
        ScheduleWatch.configure(context);
        WorkReminder.schedule(context);
        CalendarSync.requestTasks(context);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        Class<?>[] types = { NextClassWidget.class, DayScheduleWidget.class, TasksWidget.class, DeadlineWidget.class };
        String[] kinds = { "next", "day", "tasks", "deadlines" };
        for (int i=0; i<types.length; i++) for (int id : manager.getAppWidgetIds(new ComponentName(context, types[i]))) render(context, manager, id, kinds[i], types[i]);
    }
    private static int color(String hex, int fallback) {
        try { return hex.matches("#[0-9a-fA-F]{6}") ? Color.parseColor(hex) : fallback; } catch(Exception e) { return fallback; }
    }
    private static boolean dark(int background) {
        return .2126*linear(Color.red(background))+.7152*linear(Color.green(background))+.0722*linear(Color.blue(background)) < .179;
    }
    private static double contrast(int a, int b) {
        double la = Color.luminance(a) + .05, lb = Color.luminance(b) + .05;
        return Math.max(la, lb) / Math.min(la, lb);
    }
    private static double linear(int channel) { double c=channel/255.; return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4); }
    private static int mix(int a,int b,float t) { return Color.rgb(Math.round(Color.red(a)*(1-t)+Color.red(b)*t),Math.round(Color.green(a)*(1-t)+Color.green(b)*t),Math.round(Color.blue(a)*(1-t)+Color.blue(b)*t)); }
    private static String format(String pattern,Date date) {
        SimpleDateFormat f=new SimpleDateFormat(pattern,new Locale("ru")); f.setTimeZone(TimeZone.getTimeZone("Europe/Moscow"));return f.format(date);
    }
    static int minutes(String time) {
        try { String[] parts=time.split(":");int h=Integer.parseInt(parts[0]),m=Integer.parseInt(parts[1]);return h>=0&&h<24&&m>=0&&m<60?h*60+m:-1; } catch(Exception e){return -1;}
    }
    private static String join(String a,String b) { return a.isEmpty()?b:b.isEmpty()?a:a+" · "+b; }
    private static void row(Context context,RemoteViews parent,String time,String title,String detail,int text,int muted,int accent,PendingIntent open,boolean roomy) {
        RemoteViews r=new RemoteViews(context.getPackageName(),R.layout.widget_row);
        r.setViewVisibility(R.id.row_time,time.isEmpty()?View.GONE:View.VISIBLE);
        r.setTextViewText(R.id.row_time,time);r.setTextViewText(R.id.row_title,title);r.setTextViewText(R.id.row_detail,detail);
        r.setTextColor(R.id.row_time,accent);r.setTextColor(R.id.row_title,text);r.setTextColor(R.id.row_detail,muted);
        r.setInt(R.id.row_title,"setMaxLines",roomy?2:1);
        r.setViewVisibility(R.id.row_detail,detail.isEmpty()?View.GONE:View.VISIBLE);
        r.setOnClickPendingIntent(R.id.row_root,open);
        parent.addView(R.id.widget_rows,r);
    }
    static synchronized String actionKey(Context context) {
        android.content.SharedPreferences prefs=context.getSharedPreferences("widget-actions",Context.MODE_PRIVATE);
        String key=prefs.getString("key",null);
        if(key==null){
            key=java.util.UUID.randomUUID().toString();
            prefs.edit().putString("key",key).apply();
        }
        return key;
    }

    static PendingIntent taskAction(Context context,int widgetId,String action,String workId){
        boolean quick = action.startsWith("add") || "edit".equals(action);
        Intent intent=new Intent(context,quick ? QuickTaskActivity.class : MainActivity.class)
            .setAction("ru.mirea.orbita.widget."+action+"."+workId)
            .putExtra("widgetAction",action).putExtra("workId",workId)
            .putExtra("widgetKey",actionKey(context)).putExtra("page","tasks")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (quick) intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        return PendingIntent.getActivity(context,widgetId,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }

    private static void render(Context context, AppWidgetManager manager, int id, String kind, Class<?> receiver) {
        JSONObject state;
        try { state=new JSONObject(WidgetTasks.read(context.getSharedPreferences("orbita",Context.MODE_PRIVATE))); }catch(Exception e){state=new JSONObject();}
        Bundle options=manager.getAppWidgetOptions(id);
        boolean landscape=context.getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE;
        int height=options.getInt(landscape?AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT:AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,210);
        int width=options.getInt(landscape?AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH:AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,250);
        if(height<=0)height=210;if(width<=0)width=250;
        boolean compact=height<170,roomy=height>=250 && width>=220;
        int bg=0xfff2f4f9,accent=0xff6487b5;
        String theme=state.optString("theme");
        boolean systemDark=(context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
        if("dark".equals(theme)||(theme.isEmpty()&&systemDark)){bg=0xff101116;accent=0xffa9c4ff;}
        else if("violet".equals(theme)){accent=0xff7960c9;}
        else if("green".equals(theme)){accent=0xff668360;}
        else if("pink".equals(theme)){accent=0xffb77c97;}
        JSONObject custom=state.optJSONObject("customAppearance");
        boolean customMode = "custom".equals(state.optString("appearanceMode")) && custom != null;
        if (customMode) {
            bg = CustomColors.background(color(custom.optString("background"), bg));
            accent = CustomColors.accent(color(custom.optString("accent"), accent), bg, CustomColors.panel(bg));
        }
        boolean isDark=dark(bg);int text=isDark?0xfff4f4f6:0xff17191e,muted=mix(bg,text,.68f);
        // A pale accent on a pale background must still be readable as small text.
        int labelAccent=mix(accent,text,isDark?.15f:.4f);
        boolean deadlines = "deadlines".equals(kind);
        boolean taskList = deadlines || "tasks".equals(kind);
        RemoteViews views = new RemoteViews(context.getPackageName(), taskList ? R.layout.widget_task_list : R.layout.widget);
        int surface = customMode ? CustomColors.panel(bg) : mix(bg, text, .045f);
        for (int i=0; i<12 && contrast(labelAccent, surface)<4.5; i++) labelAccent = mix(labelAccent, text, .25f);
        views.setInt(R.id.widget_surface, "setColorFilter", surface);
        Intent intent = new Intent(context, MainActivity.class)
            .setAction("ru.mirea.orbita.widget.OPEN." + kind)
            .putExtra("page", taskList ? "tasks" : "pairs")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!taskList) intent.putExtra("widgetAction", "schedule").putExtra("widgetKey", actionKey(context));
        PendingIntent open = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root,open);
        Date now=new Date();int current=minutes(format("HH:mm",now));String today=format("yyyy-MM-dd",now);
        if (taskList) {
            TaskWidgetView.bind(context, views, state, deadlines, receiver, id, width, height,
                java.time.LocalDate.parse(today), text, muted, labelAccent, open);
            manager.updateAppWidget(id, views);
            return;
        }
        views.removeAllViews(R.id.widget_rows);
        JSONObject own=state.optJSONObject("pinnedGroup");if(own==null)own=state.optJSONObject("officialGroup");
        String group=own==null?state.optString("group","Выбери группу"):own.optString("title",state.optString("group"));
        String heading,body="",footer="";int progress=-1;
        views.setTextViewText(R.id.widget_group,join(group,format("EEE, d MMM",now)));
        int capacity=Math.max(1,Math.min(8,(height-92)/(roomy?61:compact?33:48)));
        JSONArray source=state.optJSONArray("widgetLessons");List<JSONObject> lessons=new ArrayList<JSONObject>();
        JSONObject week = state.optJSONObject("widgetDays");
        boolean ready;
        if (week != null) {
            String expectedGroup = own == null ? "" : own.optInt("target") + ":" + own.optString("id");
            source = week.optJSONArray(today);
            ready = source != null && expectedGroup.equals(state.optString("widgetGroupKey"));
        } else ready = today.equals(state.optString("widgetDate"));
        ready = ready && state.optLong("widgetUpdated", 0) > 0;
        if(ready&&source!=null)for(int i=0;i<source.length();i++){JSONObject l=source.optJSONObject(i);if(l!=null&&minutes(l.optString("start"))>=0&&minutes(l.optString("end"))>=0)lessons.add(l);}
        Collections.sort(lessons,new Comparator<JSONObject>(){public int compare(JSONObject a,JSONObject b){return a.optString("start").compareTo(b.optString("start"));}});
        heading=kind.equals("next")?"Ближайшая пара":"Сегодня";
        if (ready && !kind.equals("next")) heading += " · " + lessons.size();
        if(!ready){body="Открой Орбиту для загрузки расписания";footer="Нет актуальных данных · Открыть ↗";}
        else if(kind.equals("next")){
            JSONObject next=null;for(JSONObject l:lessons)if(minutes(l.optString("end"))>current){next=l;break;}
            if(next==null){body=lessons.isEmpty()?"Сегодня без занятий":"Пары на сегодня закончились";footer="Открыть расписание ↗";}
            else {
                int start=minutes(next.optString("start")),end=minutes(next.optString("end"));boolean active=start<=current;
                heading=active?"Идёт · до "+next.optString("end"):"Начало в "+next.optString("start");
                body=next.optString("title");
                String detail=join(next.optString("room"),next.optString("campus"));
                if(roomy)detail=join(detail,next.optString("teacher"));
                row(context,views,next.optString("start")+"\n"+next.optString("end"),compact?next.optString("room"):detail,roomy?next.optString("type"):"",text,muted,labelAccent,open,false);
                if(active)progress=Math.max(0,Math.min(100,(current-start)*100/Math.max(1,end-start)));
                footer="На "+format("HH:mm",now)+" · данные "+format("d MMM, HH:mm",new Date(state.optLong("widgetUpdated")));
            }
        } else {
            for(int i=0;i<Math.min(capacity,lessons.size());i++){
                JSONObject l=lessons.get(i);boolean active=minutes(l.optString("start"))<=current&&minutes(l.optString("end"))>current;
                String detail=join(l.optString("room"),roomy?l.optString("teacher"):l.optString("type"));
                row(context,views,l.optString("start")+(compact?"":"\n"+l.optString("end")),(active?"Сейчас · ":"")+l.optString("title"),compact?"":detail,text,muted,labelAccent,open,roomy);
            }
            if(lessons.isEmpty())body="Сегодня без занятий";
            footer=lessons.size()>capacity?"Ещё "+(lessons.size()-capacity)+" · Открыть расписание ↗":"Данные: "+format("d MMM, HH:mm",new Date(state.optLong("widgetUpdated")));
        }
        views.setTextViewText(R.id.widget_title,heading);views.setTextViewText(R.id.widget_body,body);views.setTextViewText(R.id.widget_footer,footer);
        views.setViewVisibility(R.id.widget_body,body.isEmpty()?View.GONE:View.VISIBLE);
        views.setViewVisibility(R.id.widget_group,height<145?View.GONE:View.VISIBLE);
        views.setViewVisibility(R.id.widget_footer,height<130?View.GONE:View.VISIBLE);
        views.setInt(R.id.widget_body,"setMaxLines",height<130?1:compact?2:roomy?4:3);
        views.setTextViewTextSize(R.id.widget_body,android.util.TypedValue.COMPLEX_UNIT_SP,compact?14:18);
        views.setViewVisibility(R.id.widget_progress,progress>=0&&!compact?View.VISIBLE:View.GONE);
        if(progress>=0)views.setProgressBar(R.id.widget_progress,100,progress,false);
        views.setTextColor(R.id.widget_title,labelAccent);views.setTextColor(R.id.widget_group,muted);views.setTextColor(R.id.widget_body,text);views.setTextColor(R.id.widget_footer,muted);views.setTextColor(R.id.widget_refresh,labelAccent);
        Intent refresh=new Intent(context,receiver).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS,new int[]{id});
        views.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(context,id,refresh,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(id,views);
    }
}
