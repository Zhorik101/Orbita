package ru.mirea.orbita;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.JavascriptInterface;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.ArrayList;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;

public class MainActivity extends Activity {
    protected WebView web;
    private String pendingCalendar;
    private ProfileBackupFiles backupFiles;
    private SdoMaterials sdoMaterials;
    private GoogleWorkAttachment attachments;
    private volatile int topInset, bottomInset, keyboardInset;
    private boolean pageReady;
    private String pendingBackupScript, pendingSdoPortalScript;
    private final java.util.concurrent.ExecutorService scheduleNetwork=java.util.concurrent.Executors.newFixedThreadPool(2);
    private static final String ORIGIN = "https://orbita.local/";

    private android.content.SharedPreferences preferences;
    private final android.content.SharedPreferences.OnSharedPreferenceChangeListener widgetListener =
        (prefs, key) -> {
            if (WidgetTasks.REVISION.equals(key)) syncWidgetTasks();
            if ("mirea_attendance_revision".equals(key) && pageReady && web != null && !isFinishing())
                web.evaluateJavascript("window.orbitaRefreshAttendance?.()", null);
        };

    private void syncWidgetTasks() {
        if (pageReady && web != null && !isFinishing())
            web.evaluateJavascript("window.orbitaSyncWidgetTasks && window.orbitaSyncWidgetTasks()", null);
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        attachments = new GoogleWorkAttachment(this, scheduleNetwork, (id,message,trashed) -> {
            if (web != null) web.evaluateJavascript("window.orbitaAttachmentResult?.("+JSONObject.quote(id)+","+JSONObject.quote(message)+","+trashed+")",null);
        });
        attachments.restore(savedInstanceState);
        backupFiles = new ProfileBackupFiles(this, scheduleNetwork, script -> {
            if (pageReady && web != null) web.evaluateJavascript(script, null);
            else pendingBackupScript = script;
        });
        backupFiles.restore(savedInstanceState);
        sdoMaterials = new SdoMaterials(this, script -> {
            if (pageReady && web != null) web.evaluateJavascript(script, null);
            else if (script.startsWith("window.orbitaSdoDownloaded")) pendingSdoPortalScript = script;
        });
        sdoMaterials.restore(savedInstanceState);

        preferences = getSharedPreferences("orbita", Context.MODE_PRIVATE);
        preferences.registerOnSharedPreferenceChangeListener(widgetListener);
        if (android.os.Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            android.view.WindowManager.LayoutParams params=getWindow().getAttributes();
            params.layoutInDisplayCutoutMode=android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
            getWindow().setNavigationBarDividerColor(android.graphics.Color.TRANSPARENT);
        }
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        applySystemAppearance(false);
        web = new WebView(this);
        web.setBackgroundColor(0xff000000);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        web.addJavascriptInterface(new LocalStore(), "OrbitaAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (!(ORIGIN+"index.html").equals(url)) return;
                pageReady=true;
                onEngineReady();
                publishInsets();
                syncWidgetTasks();
                importScheduleChanges();
                dispatchAppIntent();
                if (pendingSdoPortalScript != null) {
                    view.evaluateJavascript(pendingSdoPortalScript, null);
                    pendingSdoPortalScript = null;
                }
                if (pendingBackupScript != null) {
                    view.evaluateJavascript(pendingBackupScript, null);
                    pendingBackupScript = null;
                }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "orbita.local".equals(uri.getHost())) {
                    String path = uri.getPath();
                    if (path == null || path.equals("/")) path = "/index.html";
                    if (path.contains("..") || path.contains("\\")) return emptyResponse();
                    try {
                        InputStream input = getAssets().open(path.substring(1));
                        String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "application/javascript" : path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
                        return new WebResourceResponse(mime, "UTF-8", input);
                    } catch (Exception e) { return emptyResponse(); }
                }
                return emptyResponse();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "orbita.local".equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }
        });
        setContentView(web);
        web.setOnApplyWindowInsetsListener(new android.view.View.OnApplyWindowInsetsListener() {
            @Override public android.view.WindowInsets onApplyWindowInsets(android.view.View view, android.view.WindowInsets insets) {
                float density=getResources().getDisplayMetrics().density;
                if (android.os.Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                    topInset=Math.round(bars.top/density);bottomInset=Math.round(bars.bottom/density);
                    keyboardInset=Math.round(insets.getInsets(android.view.WindowInsets.Type.ime()).bottom/density);
                } else {
                    topInset=Math.round(insets.getSystemWindowInsetTop()/density);
                    int bottom=Math.round(insets.getSystemWindowInsetBottom()/density);
                    if (bottom>120) keyboardInset=bottom;
                    else {bottomInset=bottom;keyboardInset=0;}
                }
                publishInsets();
                return insets;
            }
        });
        web.requestApplyInsets();
        web.loadUrl(ORIGIN + "index.html");
    }
    protected void onEngineReady() {}
    private void applySystemAppearance(boolean light) {
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        int flags=android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (light) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(flags);
        if (android.os.Build.VERSION.SDK_INT >= 30 && getWindow().getInsetsController()!=null) {
            int mask=android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(light?mask:0,mask);
        }
    }
    private String insetsJson() { return "{\"top\":"+topInset+",\"bottom\":"+bottomInset+",\"keyboard\":"+keyboardInset+"}"; }
    private void publishInsets() {
        if (pageReady && web!=null) web.evaluateJavascript("window.orbitaInsets="+insetsJson()+";if(window.orbitaSetInsets)window.orbitaSetInsets(window.orbitaInsets)",null);
    }
    private void importScheduleChanges() {
        if (pageReady && web != null) web.evaluateJavascript("window.orbitaImportSchedule?.()", null);
    }

    public class LocalStore {
        @JavascriptInterface public void trashCompletedWorkFiles(String id) {
            runOnUiThread(() -> attachments.startTrash(id));
        }
        @JavascriptInterface public String workAttachments(String id) { return attachments.info(id); }
        @JavascriptInterface public void attachWorkFile(String id, boolean retry) {
            runOnUiThread(() -> attachments.start(id,retry));
        }
        @JavascriptInterface public void attachSdoWorkFile(String workId,String fileId) {
            if (!validSdoId(fileId)) return;
            runOnUiThread(() -> {
                Uri source=sdoMaterials.attachmentUri(fileId);
                if (source!=null) attachments.start(workId,false,source);
            });
        }
        @JavascriptInterface public String scheduleInbox() { return ScheduleWatch.inbox(MainActivity.this); }
        @JavascriptInterface public void ackScheduleInbox(long stamp) { ScheduleWatch.acknowledge(MainActivity.this, stamp); }
        @JavascriptInterface public void scheduleBaseline(String key, String raw) { ScheduleWatch.baseline(MainActivity.this, key, raw); }
        @JavascriptInterface public String taskPresets(boolean subject) { return WidgetTasks.presets(preferences, subject); }
        @JavascriptInterface public boolean addTaskPreset(boolean subject, String name) { return WidgetTasks.addPreset(preferences, subject, name); }
        @JavascriptInterface public void completionSound() { CompletionFeedback.play(MainActivity.this); }
        @JavascriptInterface public String teamAuth() { return TeamConnection.read(MainActivity.this); }
        @JavascriptInterface public boolean saveTeamAuth(String payload) { return TeamConnection.write(MainActivity.this,payload); }
        @JavascriptInterface public void teamRequest(final String id,final String method,final String path,final String body) {
            if(id==null||!id.matches("[a-zA-Z0-9_-]{1,64}")||path==null||method==null||body!=null&&body.length()>65536)return;
            final String sessionSnapshot=TeamConnection.read(MainActivity.this);
            scheduleNetwork.execute(new Runnable(){@Override public void run(){final String response=TeamConnection.request(MainActivity.this,method,path,body,sessionSnapshot).toString();runOnUiThread(new Runnable(){@Override public void run(){if(web!=null)web.evaluateJavascript("window.orbitaTeamResponse&&window.orbitaTeamResponse("+JSONObject.quote(id)+","+response+")",null);}});}});
        }
        @JavascriptInterface public void shareTeamInvite(final String link) {
            if(link==null||link.length()>1000||!link.startsWith("https://"))return;
            runOnUiThread(new Runnable(){@Override public void run(){try{startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"Приглашение в команду Орбиты: "+link),"Пригласить в команду"));}catch(Exception ignored){}}});
        }

        @JavascriptInterface public void copyStudyText(String value) {
            if (value==null || value.length()>32000) return;
            runOnUiThread(() -> {
                var board=(android.content.ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);
                board.setPrimaryClip(android.content.ClipData.newPlainText("Учебная задача",value));
            });
        }
        @JavascriptInterface public void shareStudyText(String value,String provider) {
            if (value==null || value.trim().isEmpty() || value.length()>32000) return;
            String target = switch (provider==null?"":provider) {
                case "chatgpt" -> "com.openai.chatgpt";
                case "gemini" -> "com.google.android.apps.bard";
                case "claude" -> "com.anthropic.claude";
                default -> "";
            };
            runOnUiThread(() -> {
                var send=new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,value);
                if (!target.isEmpty()) {
                    try { startActivity(new Intent(send).setPackage(target)); return; }
                    catch (android.content.ActivityNotFoundException | SecurityException unavailable) {}
                }
                startActivity(Intent.createChooser(send,"Поделиться учебной задачей"));
            });
        }
        @JavascriptInterface public void openSdoPortal(String url) { launchSdoPortal(url,false,""); }
        @JavascriptInterface public void syncSdoPortal(String url) { launchSdoPortal(url,true,""); }
        @JavascriptInterface public void downloadSdoMaterial(String url,String id) {
            if (id == null || !id.matches("sdo_[a-f0-9]{32}")) return;
            if (SdoPortalLinks.fileLink(url).isEmpty() && !SdoPortalLinks.bookmark(url).contains("/mod/resource/view.php?")) return;
            launchSdoPortal(url,false,id);
        }
        private void launchSdoPortal(String url,boolean sync,String downloadId) {
            if (!SdoPortalLinks.portal(url)) return;
            String page = SdoPortalLinks.bookmark(url);
            if (page.isEmpty() && !sync) page = SdoPortalLinks.fileLink(url);
            if (page.isEmpty()) page = "https://online-edu.mirea.ru/my/courses.php".equals(url) ? url : SdoPortalLinks.HOME;
            String target = page;
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this,SdoPortalActivity.class)
                .putExtra("url",target).putExtra("sync",sync).putExtra("sdoDownloadId",downloadId),SdoPortalActivity.REQUEST));
        }
        @JavascriptInterface public String sdoFiles() { return sdoMaterials.list(); }
        @JavascriptInterface public void importSdoFiles() { runOnUiThread(sdoMaterials::choose); }
        @JavascriptInterface public void cancelSdoImport() { sdoMaterials.cancel(); }
        @JavascriptInterface public void openSdoFile(String id) { if (validSdoId(id)) runOnUiThread(() -> sdoMaterials.open(id)); }
        @JavascriptInterface public void exportSdoFile(String id) { if (validSdoId(id)) runOnUiThread(() -> sdoMaterials.export(id)); }
        @JavascriptInterface public void saveSdoToDownloads(String id) {
            if (validSdoId(id)) runOnUiThread(() -> sdoMaterials.saveToDownloads(id));
        }
        @JavascriptInterface public void deleteSdoFiles(String payload) { sdoMaterials.remove(payload); }
        private boolean validSdoId(String id) { return id != null && id.matches("[a-f0-9]{64}"); }

        @JavascriptInterface public void syncCalendarPairs(String payload) { CalendarSync.pairs(MainActivity.this, payload); }
        @JavascriptInterface public String calendarSyncStatus() { return CalendarSync.statusText(MainActivity.this); }
        @JavascriptInterface public String calendarTargets() { return CalendarImport.calendars(MainActivity.this); }
        @JavascriptInterface public void requestCalendarAccess() { runOnUiThread(new Runnable(){@Override public void run(){requestPermissions(new String[]{"android.permission.READ_CALENDAR","android.permission.WRITE_CALENDAR"},991);}}); }
        @JavascriptInterface public void saveControlCalendar(int requestId, String payload) {
            if (payload == null || payload.length() > 16000) return;
            scheduleNetwork.execute(() -> {
                org.json.JSONObject result;
                try {
                    result = CalendarImport.saveControlEvent(MainActivity.this, payload);
                } catch (Exception error) {
                    result = new org.json.JSONObject();
                    try {
                        String message = error instanceof IllegalArgumentException || error instanceof IllegalStateException
                            ? error.getMessage() : "Не удалось записать событие в календарь";
                        result.put("ok", false).put("error", message);
                    } catch (org.json.JSONException ignored) {}
                }
                String reply = result.toString();
                runOnUiThread(() -> {
                    if (web != null) web.evaluateJavascript("window.orbitaControlCalendarResult&&window.orbitaControlCalendarResult("
                        + requestId + "," + reply + ")", null);
                });
            });
        }
        @JavascriptInterface public void directCalendarExport(final String payload) {
            if(payload==null||payload.length()>4000000)return;
            scheduleNetwork.execute(new Runnable(){@Override public void run(){org.json.JSONObject result;
                try{result=CalendarImport.perform(MainActivity.this,payload);}catch(Exception e){result=new org.json.JSONObject();try{result.put("ok",false);result.put("error",e.getMessage()==null?"Не удалось завершить импорт. Повтори попытку: уже добавленные пары не продублируются.":e.getMessage());}catch(Exception ignored){}}
                final String json=result.toString();runOnUiThread(new Runnable(){@Override public void run(){if(web!=null)web.evaluateJavascript("window.orbitaCalendarExportResult&&window.orbitaCalendarExportResult("+json+")",null);}});
            }});
        }

        @JavascriptInterface public void scheduleChanged(String summary) {
            if(summary==null||summary.length()>1500||!LessonReminder.allowed(MainActivity.this))return;
            android.app.NotificationManager manager=(android.app.NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new android.app.NotificationChannel("schedule-changes","Изменения расписания",android.app.NotificationManager.IMPORTANCE_DEFAULT));
            Intent open=new Intent(MainActivity.this,MainActivity.class).putExtra("page","pairs").putExtra("showChanges",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
            android.app.PendingIntent click=android.app.PendingIntent.getActivity(MainActivity.this,992,open,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);
            manager.notify(992,new android.app.Notification.Builder(MainActivity.this,"schedule-changes").setSmallIcon(R.drawable.ic_launcher).setContentTitle("Расписание изменилось").setContentText(summary).setStyle(new android.app.Notification.BigTextStyle().bigText(summary)).setContentIntent(click).addAction(new android.app.Notification.Action.Builder((android.graphics.drawable.Icon)null,"Проверить расписание",click).build()).setAutoCancel(true).build());
        }
        @JavascriptInterface public boolean notificationsAllowed() { return LessonReminder.allowed(MainActivity.this); }
        @JavascriptInterface public void lessonReminders(String payload) { if(payload!=null&&payload.length()<1500000)LessonReminder.save(MainActivity.this,payload); }
        @JavascriptInterface public void requestLessonNotificationPermission() { runOnUiThread(new Runnable(){@Override public void run(){if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},990);else if(!LessonReminder.allowed(MainActivity.this)){Intent settings=new Intent("android.settings.APP_NOTIFICATION_SETTINGS").putExtra("android.provider.extra.APP_PACKAGE",getPackageName());startActivity(settings);}}}); }

        @JavascriptInterface public void scheduleRequest(final String requestId, final String operation, final String argument, final int target) {
            if(requestId==null || !requestId.matches("[a-zA-Z0-9_-]{1,64}") || argument==null || argument.length()>120) return;
            scheduleNetwork.execute(new Runnable() { @Override public void run() {
                org.json.JSONObject result=new org.json.JSONObject();
                javax.net.ssl.HttpsURLConnection connection=null;
                try {
                    String path;
                    if("search".equals(operation)) path="/schedule/api/search?match="+java.net.URLEncoder.encode(argument,"UTF-8")+"&limit=100";
                    else if("ical".equals(operation) && target>=1 && target<=3 && argument.matches("[0-9]{1,12}")) path="/schedule/api/ical/"+new String[]{"", "Group", "Teacher", "Auditorium"}[target]+"/"+argument+"?includeMeta=true";
                    else throw new java.io.IOException("Неверный запрос");
                    connection=(javax.net.ssl.HttpsURLConnection)new java.net.URL("https://schedule-of.mirea.ru"+path).openConnection();
                    connection.setConnectTimeout(15000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);
                    connection.setRequestProperty("Accept","application/json,text/calendar");
                    int status=connection.getResponseCode();if(status!=200)throw new java.io.IOException("Сервер МИРЭА: HTTP "+status);
                    java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();
                    try(java.io.InputStream input=connection.getInputStream()) {byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){if(output.size()+count>8000000)throw new java.io.IOException("Слишком большой ответ");output.write(buffer,0,count);}}
                    result.put("ok",true);result.put("body",output.toString("UTF-8"));
                } catch(Exception error){try{result.put("ok",false);result.put("error",error.getMessage()==null?"Не удалось подключиться к МИРЭА":error.getMessage());}catch(Exception ignored){}}
                finally{if(connection!=null)connection.disconnect();}
                final String script="window.orbitaApiResult&&window.orbitaApiResult("+org.json.JSONObject.quote(requestId)+","+result.toString()+")";
                runOnUiThread(new Runnable(){@Override public void run(){if(web!=null&&!isFinishing())web.evaluateJavascript(script,null);}});
            } });
        }
        @JavascriptInterface public String insets() { return insetsJson(); }
        @JavascriptInterface public void appearance(final String background, final boolean light) {
            if (background == null || !background.matches("#[0-9a-fA-F]{6}")) return;
            runOnUiThread(new Runnable() { @Override public void run() {
                applySystemAppearance(light);
            } });
        }
        @JavascriptInterface public boolean launcherIcon(String variant) {
            String[] variants = {"violet", "blue", "green", "rose", "amber", "dark"};
            String[] aliases = {"LauncherViolet", "LauncherBlue", "LauncherGreen", "LauncherRose", "LauncherAmber", "LauncherDark"};
            int selected = java.util.Arrays.asList(variants).indexOf(variant);
            if (selected < 0) return false;
            PackageManager manager = getPackageManager();
            int flags = PackageManager.DONT_KILL_APP;
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    var changes = new ArrayList<PackageManager.ComponentEnabledSetting>();
                    for (int i = 0; i < aliases.length; i++) {
                        ComponentName component = new ComponentName(getPackageName(), getPackageName() + "." + aliases[i]);
                        int next = i == selected ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
                        int current = manager.getComponentEnabledSetting(component);
                        boolean enabled = current == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            || (current == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && i == 0);
                        if (enabled != (i == selected)) changes.add(new PackageManager.ComponentEnabledSetting(component, next, flags));
                    }
                    if (!changes.isEmpty()) manager.setComponentEnabledSettings(changes);
                } else {
                    for (int offset = 0; offset < aliases.length; offset++) {
                        int i = (selected + offset) % aliases.length;
                        ComponentName component = new ComponentName(getPackageName(), getPackageName() + "." + aliases[i]);
                        int current = manager.getComponentEnabledSetting(component);
                        boolean enabled = current == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            || (current == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && i == 0);
                        if (enabled != (i == selected)) manager.setComponentEnabledSetting(component,
                            i == selected ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED, flags);
                    }
                }
                return true;
            } catch (RuntimeException error) {
                return false;
            }
        }
        @JavascriptInterface public void openAttendanceScanner(String background) {
            int color = background != null && background.matches("#[0-9a-fA-F]{6}")
                ? android.graphics.Color.parseColor(background) : 0xff171922;
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, AttendanceScannerActivity.class)
                .putExtra("background", color)));
        }

        @JavascriptInterface public void checkMireaServices(int requestId) {
            scheduleNetwork.execute(() -> {
                int sso = MireaAcademicApi.serviceStatus("https://sso.mirea.ru/realms/mirea/.well-known/openid-configuration");
                int pulse = MireaAcademicApi.serviceStatus(MireaAcademicApi.ORIGIN + "/");
                String session = "login";
                String cookie = android.webkit.CookieManager.getInstance().getCookie(MireaAcademicApi.ORIGIN + "/");
                if (cookie != null && PulseGradesActivity.hasSession(cookie)) {
                    try {
                        new MireaAcademicApi(cookie).verifySession();
                        session = "active";
                    } catch (MireaAcademicApi.SignInRequired ignored) {
                        session = "expired";
                    } catch (java.io.IOException ignored) {
                        session = "unknown";
                    }
                }
                String result = "window.orbitaMireaServices?.(" + requestId + "," + sso + "," + pulse + "," + JSONObject.quote(session) + ")";
                runOnUiThread(() -> {
                    if (web != null && !isFinishing() && !isDestroyed()) web.evaluateJavascript(result, null);
                });
            });
        }

        @JavascriptInterface public void loadMireaDailyMarks(int requestId, String day) {
            if (day == null || !day.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return;
            scheduleNetwork.execute(() -> {
                JSONObject result = new JSONObject();
                try {
                    String cookie = android.webkit.CookieManager.getInstance().getCookie(MireaAcademicApi.ORIGIN + "/");
                    if (cookie == null || !PulseGradesActivity.hasSession(cookie)) throw new MireaAcademicApi.SignInRequired();
                    String session = mireaSessionKey(cookie);
                    var marks = new MireaAcademicApi(cookie).dailyMarks(java.time.LocalDate.parse(day));
                    if (!session.equals(currentMireaSessionKey())) throw new MireaAcademicApi.SignInRequired();
                    var rows = new org.json.JSONArray();
                    for (var mark : marks) {
                        rows.put(new JSONObject().put("subject", mark.subject()).put("start", mark.start()).put("type", mark.type())
                            .put("disciplineId", mark.disciplineId()).put("lessonId", mark.lessonId()).put("subgroup", mark.subgroup()).put("teacher", mark.teacher()));
                    }
                    result.put("entries", rows);
                } catch (Exception error) {
                    try { result.put("error", error instanceof MireaAcademicApi.SignInRequired ? "login"
                        : error instanceof MireaAcademicApi.AttendanceFailure failure ? failure.code : "network"); }
                    catch (org.json.JSONException ignored) {}
                }
                android.util.Log.i("OrbitaAttendance", "request=" + requestId + " method=daily stage=day-entries journals=0 parsed="
                    + (result.optJSONArray("entries") == null ? 0 : result.optJSONArray("entries").length())
                    + " code=" + result.optString("error", "ok"));
                String callback = "window.orbitaMireaDailyMarks?.(" + requestId + "," + result + ")";
                runOnUiThread(() -> {
                    if (web != null && !isFinishing() && !isDestroyed()) web.evaluateJavascript(callback, null);
                });
            });
        }

        @JavascriptInterface public void loadMireaAttendance(int requestId, String discipline) {
            scheduleNetwork.execute(() -> {
                JSONObject result = new JSONObject();
                String session = currentMireaSessionKey();
                int journals = 0, parsed = 0;
                String code = "ok", stage = "session";
                try {
                    String cookie = android.webkit.CookieManager.getInstance().getCookie(MireaAcademicApi.ORIGIN + "/");
                    if (session.isEmpty() || !session.equals(mireaSessionKey(cookie))) throw new MireaAcademicApi.SignInRequired();
                    stage = "journal-entries";
                    var view = new MireaAcademicApi(cookie).attendance(discipline);
                    journals = view.journals();
                    if (!session.equals(currentMireaSessionKey())) throw new MireaAcademicApi.SignInRequired();
                    var attendance = view.details();
                    if (attendance != null) {
                        var rows = new org.json.JSONArray();
                        for (var entry : attendance.entries()) {
                            rows.put(new JSONObject().put("start", entry.start()).put("type", entry.type()).put("subgroup", entry.subgroup()).put("teacher", entry.teacher()));
                        }
                        parsed = attendance.total();
                        code = attendance.partial() ? "partial" : parsed == 0 ? "empty" : "ok";
                        result.put("entries", rows).put("present", attendance.present()).put("absent", attendance.absent())
                            .put("excused", attendance.excused()).put("total", parsed).put("partial", attendance.partial());
                    } else {
                        code = view.error();
                        result.put("error", code);
                    }
                    if (!view.summaries().isEmpty()) {
                        stage = "journal-summary";
                        var summaries = new org.json.JSONArray();
                        for (var summary : view.summaries()) summaries.put(new JSONObject().put("present", summary.present())
                            .put("absent", summary.absent()).put("excused", summary.excused()).put("total", summary.total()));
                        result.put("summaries", summaries);
                        code = "summary";
                    }
                } catch (Exception error) {
                    if (error instanceof MireaAcademicApi.AttendanceFailure failure) {
                        code = failure.code;
                        stage = failure.stage;
                        journals = failure.journals;
                    } else code = error instanceof MireaAcademicApi.SignInRequired ? "login" : "network";
                    try { result.put("error", code); } catch (org.json.JSONException ignored) {}
                }
                android.util.Log.i("OrbitaAttendance", "request=" + requestId + " journals=" + journals
                    + " parsed=" + parsed + " stage=" + stage + " method=" + ("journal-summary".equals(stage) ? "summary" : "detail") + " code=" + code);
                String callback = "window.orbitaMireaAttendance?.(" + requestId + "," + result + ")";
                runOnUiThread(() -> {
                    if (web == null || isFinishing() || isDestroyed()) return;
                    if (session.equals(currentMireaSessionKey())) web.evaluateJavascript(callback, null);
                    else web.evaluateJavascript("window.orbitaRefreshMireaGrades?.()", null);
                });
            });
        }

        private String mireaSessionKey(String cookie) {
            if (cookie == null) return "";
            var parts = new java.util.ArrayList<String>();
            for (String part : cookie.split(";")) {
                if (PulseGradesActivity.hasSession(part)) parts.add(part.trim());
            }
            if (parts.isEmpty()) return "";
            java.util.Collections.sort(parts);
            try {
                byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(
                    String.join(";", parts).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                return android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP);
            } catch (java.security.NoSuchAlgorithmException error) {
                return "";
            }
        }

        private String currentMireaSessionKey() {
            return mireaSessionKey(android.webkit.CookieManager.getInstance().getCookie(MireaAcademicApi.ORIGIN + "/"));
        }

        @JavascriptInterface public String cachedMireaGrades() {
            String session = currentMireaSessionKey();
            if (session.isEmpty() || !session.equals(preferences.getString("mirea_grades_session", ""))) return "";
            return preferences.getString("mirea_grades_cache", "");
        }

        @JavascriptInterface public void loadMireaGrades(int requestId) {
            scheduleNetwork.execute(() -> {
                JSONObject result = new JSONObject();
                String session = "";
                try {
                    String cookie = android.webkit.CookieManager.getInstance().getCookie(MireaAcademicApi.ORIGIN + "/");
                    session = mireaSessionKey(cookie);
                    if (session.isEmpty()) throw new MireaAcademicApi.SignInRequired();
                    var courses = new MireaAcademicApi(cookie).grades();
                    int term = courses.stream().mapToInt(MireaAcademicApi.Course::term).max().orElse(0);
                    var rows = new org.json.JSONArray();
                    for (var course : courses) {
                        var categories = new org.json.JSONArray();
                        for (var category : course.categories()) {
                            categories.put(new JSONObject().put("name", category.name()).put("points", category.points())
                                .put("maximum", category.maximum()));
                        }
                        rows.put(new JSONObject().put("id", course.id()).put("name", course.name()).put("term", course.term()).put("total", course.total())
                            .put("maximum", course.maximum()).put("attendance", course.attendance()).put("categories", categories)
                            .put("threshold", course.threshold()).put("thresholdName", course.thresholdName())
                            .put("present", course.present()).put("lessons", course.lessons()));
                    }
                    if (!session.equals(currentMireaSessionKey())) throw new MireaAcademicApi.SignInRequired();
                    result.put("courses", rows).put("term", term).put("schema", 2).put("updated", System.currentTimeMillis());
                    preferences.edit().putString("mirea_grades_session", session)
                        .putString("mirea_grades_cache", result.toString()).apply();
                } catch (Exception error) {
                    if (error instanceof MireaAcademicApi.SignInRequired
                        && session.equals(preferences.getString("mirea_grades_session", ""))) {
                        preferences.edit().remove("mirea_grades_session").remove("mirea_grades_cache").apply();
                    }
                    try {
                        result.put("error", error instanceof MireaAcademicApi.SignInRequired ? "login" : "network");
                    } catch (org.json.JSONException ignored) {}
                }
                String callback = "window.orbitaMireaGrades?.(" + requestId + "," + result + ")";
                runOnUiThread(() -> {
                    if (web != null && !isFinishing() && !isDestroyed()) web.evaluateJavascript(callback, null);
                });
            });
        }

        @JavascriptInterface public void openPulseGrades(String background, boolean account) {
            int color = background != null && background.matches("#[0-9a-fA-F]{6}")
                ? android.graphics.Color.parseColor(background) : 0xff171922;
            runOnUiThread(() -> startActivityForResult(new Intent(MainActivity.this, PulseGradesActivity.class)
                .putExtra("background", color).putExtra("account", account), 730));
        }

        @JavascriptInterface public void exportProfileBackup(String content) {
            runOnUiThread(() -> backupFiles.exportFile(content));
        }
        @JavascriptInterface public void importProfileBackup() {
            runOnUiThread(() -> backupFiles.importFile());
        }
        @JavascriptInterface public void exportCalendar(String content) {
            if (content == null || content.length()>500000 || !content.startsWith("BEGIN:VCALENDAR")) return;
            pendingCalendar = content;
            runOnUiThread(new Runnable() { @Override public void run() {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/calendar").putExtra(Intent.EXTRA_TITLE,"mirea-schedule.ics");
                try { startActivityForResult(intent,701); } catch (Exception e) { android.widget.Toast.makeText(MainActivity.this,"Не удалось открыть выбор файла",android.widget.Toast.LENGTH_SHORT).show(); }
            } });
        }
        @JavascriptInterface public String read() { return WidgetTasks.read(preferences); }
        @JavascriptInterface public String widgetTaskChanges(long since) { return WidgetTasks.changesSince(preferences, since); }
        @JavascriptInterface public String writeState(String json) {
            String result = WidgetTasks.saveFromApp(preferences, json);
            if (result != null) OrbitWidget.requestUpdate(MainActivity.this);
            return result;
        }
        @JavascriptInterface public boolean write(String json) { return writeState(json) != null; }
        @JavascriptInterface public boolean pin(String type) {
            final Class<?> provider = "next".equals(type) ? NextClassWidget.class : "tasks".equals(type) ? TasksWidget.class : "deadlines".equals(type) ? DeadlineWidget.class : "day".equals(type) ? DayScheduleWidget.class : null;
            if (provider == null) return false;
            final AppWidgetManager manager = AppWidgetManager.getInstance(MainActivity.this);
            if (!manager.isRequestPinAppWidgetSupported()) return false;
            runOnUiThread(new Runnable() { @Override public void run() { manager.requestPinAppWidget(new ComponentName(MainActivity.this,provider),null,null); } });
            return true;
        }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (pageReady) dispatchAppIntent();
    }
    private void dispatchAppIntent() {
        if (!pageReady || web==null) return;
        Intent intent=getIntent();
        Uri invite=intent.getData();
        if(invite!=null&&"orbita".equals(invite.getScheme())&&"join".equals(invite.getHost())) {
            web.evaluateJavascript("window.acceptTeamInvitation&&window.acceptTeamInvitation("+JSONObject.quote(invite.toString())+")",null);
            intent.setData(null);
        }
        String destination=intent.getStringExtra("page");
        if(destination!=null) {
            web.evaluateJavascript("showPage("+JSONObject.quote(destination)+")",null);
            intent.removeExtra("page");
        }
        String action=intent.getStringExtra("widgetAction");
        if(action!=null && OrbitWidget.actionKey(this).equals(intent.getStringExtra("widgetKey"))){
            intent.removeExtra("widgetAction");
            if ("schedule".equals(action)) web.evaluateJavascript("openWidgetSchedule()",null);
            if ("add".equals(action) || "addDue".equals(action) || "edit".equals(action)) {
                String id = intent.getStringExtra("workId");
                web.evaluateJavascript("openWidgetWork("+JSONObject.quote(action)+","+
                    JSONObject.quote(id == null ? "" : id)+")", null);
            }
            if("complete".equals(action)){
                String id=JSONObject.quote(intent.getStringExtra("workId"));
                web.evaluateJavascript("(()=>{const i=state.tasks.findIndex(t=>t.workId==="+id+"&&!t.done);if(i>=0)changeWork(i,'done')})()",null);
            }
        }
        if(intent.getBooleanExtra("showChanges",false)) {
            web.evaluateJavascript("if(typeof openScheduleChanges==='function')openScheduleChanges()",null);
            intent.removeExtra("showChanges");
        }
    }
    @Override protected void onResume() { super.onResume(); importScheduleChanges(); syncWidgetTasks(); OrbitWidget.requestUpdate(this); }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        WorkReminder.schedule(this);
        if(requestCode==991&&web!=null)web.evaluateJavascript("window.orbitaCalendarAccessChanged&&window.orbitaCalendarAccessChanged()",null);
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        attachments.save(out);
        backupFiles.save(out);
        sdoMaterials.save(out);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode == 730 && web != null) {
            web.evaluateJavascript("window.orbitaRefreshMireaGrades?.()", null);
            return;
        }

        if (requestCode == SdoPortalActivity.REQUEST) {
            if (resultCode == RESULT_CANCELED && data != null) {
                String source=data.getStringExtra("sdoDownloadId");
                if (source != null) {
                    String script="window.cancelStudyDownload?.("+JSONObject.quote(source)+")";
                    if (pageReady && web!=null) web.evaluateJavascript(script,null);
                    else pendingSdoPortalScript=script;
                }
            }
            if (resultCode == RESULT_OK && data != null) {
                String document = data.getStringExtra("sdoDocument");
                if (document != null) {
                    sdoMaterials.importPortalDocument(document,data.getStringExtra("sdoDownloadId"));
                    return;
                }
                String payload = data.getStringExtra("sdoImport");
                String url = SdoPortalLinks.bookmark(data.getStringExtra("sdoUrl"));
                String title = data.getStringExtra("sdoTitle");
                String script = payload != null && payload.length() <= 170000
                    ? "window.orbitaSdoPortalImport?.(" + JSONObject.quote(payload) + ")"
                    : url.isEmpty() ? "" : "window.orbitaSdoPortalBookmark?.(" +
                        JSONObject.quote(url) + "," + JSONObject.quote(title == null ? "" : title) + ")";
                if (!script.isEmpty()) {
                    if (pageReady && web != null) web.evaluateJavascript(script, null);
                    else pendingSdoPortalScript = script;
                }
            }
            return;
        }
        if (sdoMaterials.onResult(requestCode,resultCode,data)) return;
        if (backupFiles.onResult(requestCode,resultCode,data)) return;
        if (attachments.onResult(requestCode,resultCode,data)) return;
        if (requestCode!=701) return;
        String content = pendingCalendar; pendingCalendar = null;
        if (resultCode!=RESULT_OK || data==null || data.getData()==null || content==null) return;
        try (java.io.OutputStream output = getContentResolver().openOutputStream(data.getData())) {
            if (output==null) throw new java.io.IOException("Missing output");
            output.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            android.widget.Toast.makeText(this,"Расписание сохранено",android.widget.Toast.LENGTH_SHORT).show();
        } catch (Exception e) { android.widget.Toast.makeText(this,"Не удалось сохранить календарь",android.widget.Toast.LENGTH_SHORT).show(); }
    }
    private WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(()=>{const dialogs=document.querySelectorAll('dialog[open]');const m=dialogs[dialogs.length-1];if(m&&m.open){m.close();return 'handled'}if(typeof handleAppBack==='function'&&handleAppBack())return 'handled';if(typeof page!=='undefined'&&page!=='schedule'){showPage('schedule');return 'handled'}return 'exit'})()", new android.webkit.ValueCallback<String>() { @Override public void onReceiveValue(String result) { if (!"\"handled\"".equals(result)) finish(); } });
    }
    @Override protected void onDestroy() { preferences.unregisterOnSharedPreferenceChangeListener(widgetListener);scheduleNetwork.shutdownNow();if (web != null) {web.destroy();web=null;} super.onDestroy(); }
}
