package ru.mirea.orbita;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class SdoPortalActivity extends Activity {
    static final int REQUEST = 764;
    private static final int SAVE_FILE = 765;
    private static final ExecutorService DOWNLOADS = Executors.newSingleThreadExecutor();
    private static boolean isolated;
    private WebView portal;
    private TextView status;
    private Button bookmark, cancel;
    private volatile boolean cancelled;
    private File pendingFile;
    private boolean transferring;
    private String startUrl;
    private boolean mainPageFailed, automaticSync;
    private int navigationVersion;
    private record SyncPage(String url, String course) {}
    private final java.util.ArrayDeque<SyncPage> syncQueue = new java.util.ArrayDeque<>();
    private final java.util.HashSet<String> queued = new java.util.HashSet<>();
    private final org.json.JSONArray syncResults = new org.json.JSONArray();
    private SyncPage syncPage;
    private int visited, skipped, resultSize;
    private boolean batch;
    private static final int MAX_SYNC_PAGES = 120;
    private static final int MAX_SYNC_RESULT = 160_000;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        automaticSync = getIntent().getBooleanExtra("sync",false);
        startUrl = getIntent().getStringExtra("url");
        batch = automaticSync && "https://online-edu.mirea.ru/my/courses.php".equals(startUrl);
        if (!SdoPortalLinks.portal(startUrl)) startUrl = SdoPortalLinks.HOME;
        if (Build.VERSION.SDK_INT < 28) { openBrowser(startUrl); finish(); return; }
        if (!isolated) {
            WebView.setDataDirectorySuffix("mirea_sdo");
            isolated = true;
        }
        if (saved != null) {
            String pending = saved.getString("sdoPortalTemp", "");
            if (pending.matches("sdo-portal-[0-9]+\\.part")) pendingFile = new File(stagingFolder(), pending);
        }

        var root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        var bar = new LinearLayout(this);
        bar.addView(button("Назад", v -> goBack()));
        bar.addView(button("Браузер", v -> openBrowser(safePortalPage())));
        bookmark = button("Сохранить ссылку", v -> saveBookmark());
        bar.addView(bookmark);
        root.addView(bar);
        var actions = new LinearLayout(this);
        actions.addView(button("Обновить", v -> portal.reload()));
        actions.addView(button("Выйти", v -> clearSession()));
        actions.addView(button("Импорт ссылок", v -> importVisibleLinks(false,0,navigationVersion)));
        cancel = button("Отменить загрузку", v -> { cancelled = true; showStatus("Отменяем загрузку…"); });
        cancel.setVisibility(View.GONE);
        actions.addView(cancel);
        root.addView(actions);
        status = new TextView(this);
        status.setPadding(16,8,16,8);
        status.setVisibility(View.GONE);
        root.addView(status);
        if (batch) root.addView(button("Завершить и сохранить найденное", v -> finishSync()));
        portal = new WebView(this);
        WebSettings settings = portal.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(portal, false);
        portal.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && !SdoPortalLinks.trusted(request.getUrl().toString())) {
                    return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                }
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !SdoPortalLinks.trusted(request.getUrl().toString());
                String url = request.getUrl().toString();
                if (SdoPortalLinks.trusted(url)) return false;
                if ("https".equalsIgnoreCase(request.getUrl().getScheme()) && request.hasGesture()) openBrowser(url);
                else showStatus("Переход за пределы портала. Если вход не открывается, используй браузер.");
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                navigationVersion++;
                bookmark.setEnabled(false);
                mainPageFailed = false;
                if (!SdoPortalLinks.trusted(url)) view.stopLoading();
            }
            @Override public void onPageFinished(WebView view, String url) {
                bookmark.setEnabled(!mainPageFailed && !SdoPortalLinks.bookmark(url).isEmpty());
                if (automaticSync && !mainPageFailed && SdoPortalLinks.portal(url)) {
                    String path = java.net.URI.create(url).getPath();
                    String requested = SdoPortalLinks.bookmark(startUrl);
                    boolean validPage = syncPage != null
                        ? syncPage.url().equals(SdoPortalLinks.bookmark(url))
                        : requested.contains("/course/view.php?")
                        ? requested.equals(SdoPortalLinks.bookmark(url))
                        : "/my/".equals(path) || "/my/courses.php".equals(path);
                    if (validPage) {
                        int version = navigationVersion;
                        showStatus(syncPage == null ? "Обновляем каталог по открытой странице СДО…"
                            : "СДО: проверено страниц " + visited + ", в очереди " + (syncQueue.size()+1));
                        view.postDelayed(() -> importVisibleLinks(true,0,version),900);
                    }
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showPortalError();
                    if (batch && syncPage != null) finishSync();
                }
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                if (request.isForMainFrame()) showPortalError();
            }
        });
        portal.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (automaticSync) return;
            if (!SdoPortalLinks.directFile(url)) {
                showStatus("Этот файл доступен через официальный браузер.");
                return;
            }
            new AlertDialog.Builder(this).setTitle("Сохранить файл СДО?")
                .setMessage("Орбита получит один документ с портала. После загрузки выбери, куда его сохранить.")
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Скачать", (dialog, which) -> download(url, agent, disposition))
                .show();
        });
        root.addView(portal, new LinearLayout.LayoutParams(-1, 0, 1));
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(true);
        setContentView(root);
        String file = SdoPortalLinks.fileLink(startUrl);
        if (!file.isEmpty() && saved == null) download(file, settings.getUserAgentString(), null);
        else if (batch || saved == null || portal.restoreState(saved)==null) portal.loadUrl(startUrl);
    }

    private Button button(String title, View.OnClickListener action) {
        var button = new Button(this);
        button.setText(title); button.setAllCaps(false); button.setOnClickListener(action);
        return button;
    }
    private void showPortalError() {
        mainPageFailed = true;
        bookmark.setEnabled(false);
        showStatus("СДО не загрузилось. Обнови страницу или открой её в браузере.");
    }
    private String safePortalPage() {
        String current = portal == null ? "" : SdoPortalLinks.bookmark(portal.getUrl());
        return current.isEmpty() ? startUrl : current;
    }
    private void openBrowser(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (RuntimeException error) { if (status != null) showStatus("На телефоне нет браузера для этой ссылки."); }
    }
    private void saveBookmark() {
        String url = SdoPortalLinks.bookmark(portal.getUrl());
        if (url.isEmpty() || mainPageFailed) return;
        String title = portal.getTitle();
        title = title == null ? "" : title.trim();
        if (title.length() > 180) title = title.substring(0,180);
        setResult(RESULT_OK,new Intent().putExtra("sdoUrl",url).putExtra("sdoTitle",title));
        finish();
    }
    private void importVisibleLinks(boolean auto,int attempt,int version) {
        if (isFinishing() || isDestroyed() || version != navigationVersion || auto && !automaticSync) return;
        String page = portal.getUrl();
        if (!SdoPortalLinks.portal(page) || mainPageFailed) return;
        String course = SdoPortalLinks.bookmark(page);
        boolean inside = course.contains("/course/view.php?");
        String path = java.net.URI.create(page).getPath();
        boolean attachments = path.equals("/mod/assign/view.php") || path.equals("/mod/folder/view.php");
        if (!inside && !attachments && !"/my/".equals(path) && !"/my/courses.php".equals(path)) {
            showStatus("Открой «Мои курсы» или конкретный курс СДО для импорта ссылок.");
            return;
        }
        // This reads only links that the official page already displays. There is no page-to-app bridge.
        String script = """
            (() => {
              const inside = location.pathname === '/course/view.php';
              const attachments = ['/mod/assign/view.php','/mod/folder/view.php'].includes(location.pathname);
              if (location.origin !== 'https://online-edu.mirea.ru' ||
                  (!inside && !attachments && !['/my/','/my/courses.php'].includes(location.pathname))) return '';
              const seen = new Set(), links = [];
              const catalog = attachments ? document.querySelector('#region-main, [role="main"], main') : !inside && document.querySelector('[data-region="courses-view"],[data-region="myoverview"],.block_myoverview');
              for (const anchor of (catalog || document).querySelectorAll('a[href]')) {
                if (links.length >= 100) break;
                if (!anchor.getClientRects().length || getComputedStyle(anchor).visibility === 'hidden') continue;
                let url;
                try { url = new URL(anchor.href); } catch { continue; }
                if (url.origin !== location.origin || url.username || url.password) continue;
                const file = (inside || attachments) && /^[/]pluginfile[.]php[/][0-9]+[/](mod_assign[/]introattachment|mod_folder[/]content|mod_resource[/]content|mod_page[/]content|course[/]section)[/].+/.test(url.pathname);
                const valid = inside ? /^\\/mod\\/[a-z][a-z0-9_]{0,38}\\/view\\.php$/.test(url.pathname) : url.pathname === '/course/view.php';
                const ids = url.searchParams.getAll('id');
                if (!file && (attachments || !valid || ids.length !== 1 || !/^[0-9]{1,15}$/.test(ids[0]))) continue;
                const href = url.origin + url.pathname + (file ? '' : '?id=' + ids[0]);
                const title = (anchor.innerText || anchor.getAttribute('aria-label') || '').trim().slice(0,180);
                if (!title || seen.has(href)) continue;
                seen.add(href);
                const section = (anchor.closest('li.section,[data-sectionid]')?.querySelector('h2,h3,h4')?.innerText || '').trim().slice(0,100);
                links.push({url:href,title,section});
              }
              return links;
            })()
            """;
        portal.evaluateJavascript(script, raw -> {
            if (isFinishing() || isDestroyed() || version != navigationVersion || !page.equals(portal.getUrl())) return;
            try {
                var rawLinks = new org.json.JSONArray(raw);
                var links = new org.json.JSONArray();
                var seen = new java.util.HashSet<String>();
                for (int i=0;i<Math.min(100,rawLinks.length());i++) {
                    var item = rawLinks.optJSONObject(i);
                    if (item==null) continue;
                    String url=SdoPortalLinks.bookmark(item.optString("url"));
                    String file = inside || attachments ? SdoPortalLinks.fileLink(item.optString("url")) : "";
                    if (!file.isEmpty()) url=file;
                    String title=limited(item.optString("title"),180);
                    if (url.isEmpty()||title.isEmpty()||(file.isEmpty()&&(attachments||inside==url.contains("/course/view.php?")))||!seen.add(url)) continue;
                    links.put(new org.json.JSONObject().put("url",url).put("title",title).put("section",limited(item.optString("section"),100)));
                }
                if (links.length()==0 && !(auto && syncPage != null)) {
                    if (auto && attempt<10) portal.postDelayed(() -> importVisibleLinks(true,attempt+1,version),900);
                    else showStatus("На странице пока нет видимых ссылок. Проверь вход и фильтры СДО.");
                    return;
                }
                var payload = new org.json.JSONObject().put("course",inside?course:"").put("title",limited(portal.getTitle(),180)).put("links",links);
                if (auto && batch) {
                    if (syncPage == null) {
                        appendSyncResult(payload);
                        for (int i=0;i<links.length();i++) {
                            String url=links.getJSONObject(i).getString("url");
                            enqueueSync(url,url);
                        }
                    } else if (attachments) {
                        payload.put("course",syncPage.course()).put("parent",syncPage.url());
                        appendSyncResult(payload);
                    } else {
                        appendSyncResult(payload);
                        for (int i=0;i<links.length();i++) {
                            String url=links.getJSONObject(i).getString("url");
                            if (url.contains("/mod/assign/view.php?") || url.contains("/mod/folder/view.php?")) {
                                enqueueSync(url,syncPage.course());
                            }
                        }
                    }
                    advanceSync();
                    return;
                }
                if (auto) {
                    automaticSync=false;
                    setResult(RESULT_OK,new Intent().putExtra("sdoImport",payload.toString()));
                    finish();
                    return;
                }
                new AlertDialog.Builder(this).setTitle("Импортировать ссылки в Орбиту?")
                    .setMessage("Найдено видимых ссылок: " + links.length() + ".")
                    .setNegativeButton("Отмена",null).setPositiveButton("Импортировать",(dialog,which)->{
                        setResult(RESULT_OK,new Intent().putExtra("sdoImport",payload.toString()));
                        finish();
                    }).show();
            } catch (Exception error) {
                showStatus("Не удалось прочитать ссылки открытой страницы.");
                if (auto && syncPage != null) { skipped++; advanceSync(); }
            }
        });
    }
    private void appendSyncResult(org.json.JSONObject payload) {
        int size = payload.toString().length();
        if (resultSize + size > MAX_SYNC_RESULT) { skipped++; return; }
        syncResults.put(payload);
        resultSize += size;
    }

    private void enqueueSync(String url,String course) {
        if (!queued.add(url)) return;
        if (queued.size() > MAX_SYNC_PAGES) { skipped++; return; }
        syncQueue.addLast(new SyncPage(url,course));
    }

    private void advanceSync() {
        if (!automaticSync || isFinishing()) return;
        if (syncPage != null) visited++;
        syncPage = syncQueue.pollFirst();
        if (syncPage == null) { finishSync(); return; }
        SyncPage next = syncPage;
        // Use the signed-in WebView sequentially. No downloads are started by the scan.
        portal.postDelayed(() -> {
            if (!automaticSync || isFinishing() || syncPage != next) return;
            portal.loadUrl(next.url());
            portal.postDelayed(() -> {
                if (!automaticSync || isFinishing() || syncPage != next) return;
                if (!SdoPortalLinks.portal(portal.getUrl()) || portal.getUrl().contains("/login/")) {
                    finishSync();
                    return;
                }
                skipped++;
                advanceSync();
            },15000);
        },600);
    }

    private void finishSync() {
        if (!automaticSync || isFinishing()) return;
        automaticSync=false;
        try {
            String payload = new org.json.JSONObject().put("pages",syncResults)
                .put("skipped",skipped + syncQueue.size() + (syncPage == null ? 0 : 1)).toString();
            setResult(RESULT_OK,new Intent().putExtra("sdoImport",payload));
        } catch (org.json.JSONException ignored) {}
        finish();
    }

    private static String limited(String value,int limit) {
        if (value==null) return "";
        value=value.trim();
        return value.substring(0,Math.min(value.length(),limit));
    }

    private void clearSession() {
        new AlertDialog.Builder(this).setTitle("Выйти из СДО в Орбите?")
            .setMessage("Локальные материалы сохранятся. Сессия системного браузера управляется отдельно.")
            .setNegativeButton("Отмена",null).setPositiveButton("Выйти",(dialog,which)->{
                portal.stopLoading();
                CookieManager.getInstance().removeAllCookies(success -> {
                    CookieManager.getInstance().flush();
                    android.webkit.WebStorage.getInstance().deleteAllData();
                    portal.clearCache(true);
                    portal.clearHistory();
                    portal.loadUrl(startUrl);
                    showStatus("Сессия встроенного СДО очищена.");
                });
            }).show();
    }
    private void showStatus(String text) { status.setText(text); status.setVisibility(View.VISIBLE); }
    private void goBack() {
        if (automaticSync && syncPage != null) { finishSync(); return; }
        if (portal != null && portal.canGoBack()) portal.goBack();
        else finish();
    }
    @Override public void onBackPressed() { goBack(); }
    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (portal != null) portal.saveState(out);
        if (pendingFile != null) out.putString("sdoPortalTemp",pendingFile.getName());
    }

    private void download(String url,String agent,String disposition) {
        if (transferring || pendingFile != null) return;
        transferring=true;
        cancelled=false;
        cancel.setVisibility(View.VISIBLE);
        showStatus("Скачиваем документ…");
        DOWNLOADS.execute(()->{
            SdoPortalDownload.Document result=null;
            try {
                result=SdoPortalDownload.fetch(url,agent,disposition,stagingFolder(),()->cancelled);
            } catch (Exception ignored) {}
            final SdoPortalDownload.Document document=result;
            runOnUiThread(()->{
                transferring=false;
                cancel.setVisibility(View.GONE);
                if (isFinishing() || isDestroyed() || cancelled) {
                    if (document!=null) document.file().delete();
                    if (!isDestroyed()) showStatus("Загрузка отменена.");
                    return;
                }
                if (document==null) { showStatus("Не удалось получить документ. Проверь вход в СДО или попробуй через браузер."); return; }
                pendingFile=document.file();
                new AlertDialog.Builder(this).setTitle("Документ скачан")
                    .setMessage("Сохрани его в библиотеку Орбиты или выбери папку на устройстве.")
                    .setNegativeButton("Отмена",(dialog,which)->discardPending())
                    .setNeutralButton("Экспорт файла",(dialog,which)->saveOutside(document))
                    .setPositiveButton("В библиотеку",(dialog,which)->sendToLibrary(document))
                    .setOnCancelListener(dialog->discardPending()).show();
            });
        });
    }
    private File stagingFolder() {
        var directory=new File(getCacheDir(),"sdo-portal-downloads");
        if (!directory.isDirectory()) directory.mkdirs();
        return directory;
    }
    private void discardPending() {
        if (pendingFile!=null) pendingFile.delete();
        pendingFile=null;
    }
    private void saveOutside(SdoPortalDownload.Document document) {
        try {
            startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(document.mime())
                .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,document.name()),SAVE_FILE);
        } catch(RuntimeException error) { discardPending(); showStatus("Не удалось открыть сохранение файла."); }
    }
    private void sendToLibrary(SdoPortalDownload.Document document) {
        try {
            Uri source=androidx.core.content.FileProvider.getUriForFile(this,getPackageName()+".materials",document.file(),document.name());
            setResult(RESULT_OK,new Intent().putExtra("sdoDocument",source.toString()));
            pendingFile=null;
            finish();
        } catch(RuntimeException error) { discardPending(); showStatus("Не удалось передать документ в библиотеку."); }
    }

    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if (request!=SAVE_FILE) return;
        File source=pendingFile;
        pendingFile=null;
        Uri destination=data==null?null:data.getData();
        if (source==null) return;
        if (result!=RESULT_OK || destination==null || !"content".equals(destination.getScheme())) { source.delete(); return; }
        DOWNLOADS.execute(()->{
            boolean saved=false;
            try (var input=new java.io.FileInputStream(source);var output=getContentResolver().openOutputStream(destination,"wt")){
                if (output!=null) { SdoPortalDownload.copy(input,output,()->false); saved=true; }
            } catch (Exception ignored) {}
            finally { source.delete(); }
            final boolean success=saved;
            runOnUiThread(()->{
                if (!isFinishing()&&!isDestroyed()) showStatus(success?"Документ сохранён. Добавить его в библиотеку можно через «Импорт файлов».":"Не удалось записать документ.");
            });
        });
    }
    @Override protected void onDestroy() {
        cancelled=true;
        if (isFinishing()&&pendingFile!=null) pendingFile.delete();
        if (portal!=null) { portal.stopLoading(); portal.destroy(); }
        super.onDestroy();
    }
}
