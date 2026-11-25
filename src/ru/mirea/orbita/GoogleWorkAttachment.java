package ru.mirea.orbita;

import android.accounts.Account;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.provider.OpenableColumns;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Adds a Google Drive file to an existing synced Calendar event. */
final class GoogleWorkAttachment {
    private static final int PICK = 711, AUTHORIZE = 712;
    private static final int MAX_FILE = 200 * 1024 * 1024;
    private static final int CHUNK = 4 * 1024 * 1024;
    private static final String FILE_TYPES = "Можно прикреплять только PDF, офисные документы, текстовые файлы и фото.";
    private static final String API = "https://www.googleapis.com";
    private static final String CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    interface Listener { void report(String id, String message, boolean trashed); }
    private final Activity activity;
    private final ExecutorService executor;
    private final Listener listener;
    private String workId, authorizationAccount;
    private Uri file;
    private boolean busy, trashMode;

    GoogleWorkAttachment(Activity activity, ExecutorService executor, Listener listener) {
        this.activity = activity; this.executor = executor; this.listener = listener;
    }

    private SharedPreferences storage() { return activity.getSharedPreferences("google-work-files", Context.MODE_PRIVATE); }

    String info(String id) {
        if (!validId(id)) return "{}";
        try {
            return new JSONObject(storage().getString(id, "{}"))
                .put("selected", storage().contains("source:"+id)).toString();
        } catch (org.json.JSONException invalid) { return "{}"; }
    }

    void save(Bundle out) {
        if (workId != null && !busy) { out.putString("attachmentWork", workId); out.putBoolean("attachmentTrash",trashMode); out.putString("attachmentFile", file == null ? null : file.toString()); out.putString("attachmentAccount", authorizationAccount); }
    }

    void restore(Bundle in) {
        if (in == null) return;
        workId = in.getString("attachmentWork");
        authorizationAccount = in.getString("attachmentAccount");
        trashMode = in.getBoolean("attachmentTrash");
        String uri = in.getString("attachmentFile");
        file = uri == null ? null : Uri.parse(uri);
    }

    void start(String id, boolean retry) { start(id,retry,null); }

    void start(String id, boolean retry, Uri libraryFile) {
        if (!validId(id)) return;
        if (busy || workId != null) { listener.report(id,"Дождись завершения операции с файлом.",false); return; }
        try { attachmentState(id); }
        catch (Exception unavailable) { listener.report(id, unavailable.getMessage(),false); return; }
        workId = id;
        if (retry) {
            String selected=storage().getString("source:"+id,null);
            file=selected==null?null:Uri.parse(selected);
            authorize();
            return;
        }
        if (libraryFile != null) {
            file=libraryFile;
            try { readFileInfo(file); }
            catch (Exception invalid) { finish(invalid instanceof Failure?invalid.getMessage():"Файл из библиотеки недоступен."); return; }
            if (!storage().edit().putString("source:"+id,file.toString()).commit()) {
                finish("Не удалось сохранить выбранный файл для синхронизации.");
                return;
            }
            authorize();
            return;
        }
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES,WorkFileTypes.pickerTypes());
        try { activity.startActivityForResult(pick, PICK); }
        catch (RuntimeException unavailable) { finish("Не удалось открыть выбор файлов."); }
    }

    void startTrash(String id) {
        if (!validId(id)) return;
        if (busy || workId != null) { listener.report(id,"Дождись завершения операции с файлом.",false); return; }
        try { completedAttachment(id); }
        catch (Exception invalid) { listener.report(id,invalid.getMessage(),false); return; }
        workId=id;
        trashMode=true;
        authorize();
    }

    private JSONObject completedAttachment(String id) throws Exception {
        JSONObject state=new JSONObject(activity.getSharedPreferences("orbita",0).getString("state","{}"));
        JSONObject task=WidgetTasks.find(state,id);
        if(task==null||!task.optBoolean("done"))throw new Failure("Эта задача больше не числится выполненной.");
        JSONObject cached=new JSONObject(storage().getString(id,"{}"));
        JSONArray files=cached.optJSONArray("files");
        if(cached.optString("account").isEmpty() ||
           ((files==null||files.length()==0)&&cached.optJSONObject("pending")==null))
            throw new Failure("У задачи нет файлов, загруженных Орбитой на Диск.");
        return cached;
    }

    private void trashAttachments(String id,String token) throws Exception {
        JSONObject cached=completedAttachment(id);
        JSONArray files=cached.optJSONArray("files");
        if(files==null)files=new JSONArray();
        while(files.length()>0){
            trashFile(files.getJSONObject(0),token);
            files.remove(0);
            if(!storage().edit().putString(id,cached.toString()).commit())
                throw new Failure("Файл в корзине, но Орбита не смогла сохранить состояние. Попробуй снова.");
        }
        JSONObject pending=cached.optJSONObject("pending");
        if(pending!=null){
            trashFile(pending,token);
            cached.remove("pending");
        }
        String source=storage().getString("source:"+id,null);
        if(!storage().edit().putString(id,cached.toString()).remove("source:"+id).commit())
            throw new Failure("Файлы в корзине, но Орбита не смогла сохранить состояние.");
        if(source!=null)try{
            activity.getContentResolver().releasePersistableUriPermission(Uri.parse(source),Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }catch(SecurityException ignored){}
    }

    private static void trashFile(JSONObject file,String token) throws Exception {
        String id=file.getString("id");
        if(!id.matches("[a-zA-Z0-9_-]{1,200}"))throw new Failure("Не удалось определить файл на Google Диске.");
        try {
            JSONObject result=request("PATCH",API+"/drive/v3/files/"+Uri.encode(id)+"?fields=id,trashed",
                token,"application/json; charset=UTF-8","{\"trashed\":true}".getBytes(StandardCharsets.UTF_8));
            if(!result.optBoolean("trashed"))throw new Failure("Диск не подтвердил перенос файла в корзину.");
        } catch (Exception failure) {
            throw new Failure("Не удалось перенести файл в корзину Диска. Задача сохранена. Проверь доступ к файлу и повтори.");
        }
    }

    boolean onResult(int request, int result, Intent data) {
        if (request != PICK && request != AUTHORIZE) return false;
        if (workId == null) return true;
        if (result != Activity.RESULT_OK || data == null) {
            finish(request==AUTHORIZE?"Вход не завершён. Если Google показал 403, добавь этот аккаунт в Test users проекта Orbita.":"Выбор файла отменён.");
            return true;
        }
        if (request == PICK) {
            file = data.getData();
            if (file == null || !"content".equals(file.getScheme())) finish("Не удалось прочитать выбранный файл.");
            else {
                try { readFileInfo(file); }
                catch (Exception invalid) { finish(invalid instanceof Failure?invalid.getMessage():"Не удалось прочитать выбранный файл.");return true; }
                try {
                    activity.getContentResolver().takePersistableUriPermission(file,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    storage().edit().putString("source:"+workId,file.toString()).commit();
                } catch (SecurityException ignored) {}
                authorize();
            }
        } else {
            try { authorized(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)); }
            catch (Exception failure) { finish("Google не предоставил доступ к Календарю и Диску."); }
        }
        return true;
    }

    private void authorize() {
        try {
            String account=trashMode?completedAttachment(workId).getString("account"):selectedCalendar(attachmentState(workId)).account();
            authorizationAccount=account;
            java.util.List<Scope> scopes=trashMode?java.util.Collections.singletonList(new Scope(DRIVE_SCOPE)):
                Arrays.asList(new Scope(CALENDAR_SCOPE),new Scope(DRIVE_SCOPE));
            AuthorizationRequest request=AuthorizationRequest.builder()
                .setAccount(new Account(account,"com.google")).setRequestedScopes(scopes).build();
            Identity.getAuthorizationClient(activity).authorize(request)
                .addOnSuccessListener(activity, this::authorized)
                .addOnFailureListener(activity, failure -> finish("Не удалось подключиться к Google. Проверь, добавлен ли аккаунт в тестировщики Орбиты."));
        } catch (Exception unavailable) {
            String message=unavailable.getMessage();
            if(!trashMode&&storage().contains("source:"+workId))message=(message==null?"":message+" ")+"Файл выбран. После синхронизации нажми «Повторить прикрепление».";
            finish(message);
        }
    }

    private void authorized(AuthorizationResult result) {
        if (result.hasResolution()) {
            try {
                android.app.PendingIntent approval = result.getPendingIntent();
                if (approval == null) throw new IllegalStateException();
                activity.startIntentSenderForResult(approval.getIntentSender(), AUTHORIZE, null, 0, 0, 0);
            } catch (Exception unavailable) { finish("Не удалось открыть окно согласия Google."); }
            return;
        }
        final String token = result.getAccessToken();
        if (token == null || token.isEmpty()) { finish("Google не предоставил доступ к Календарю и Диску."); return; }
        final String id = workId;
        final Uri picked = file;
        final boolean trash=trashMode;
        final String account=authorizationAccount;
        busy = true;
        if(!trash)listener.report(id, "Проверяем, появилось ли событие в Google…",false);
        executor.execute(() -> {
            String message;
            boolean success=false;
            try {
                if(trash){trashAttachments(id,token);message="Вложения перенесены в корзину Диска.";}
                else {attach(id,picked,token,account);message="Файл прикреплён в Google Календаре.";}
                success=true;
            }
            catch (Failure problem) { message = problem.getMessage(); }
            catch (Exception problem) { message = trash?"Не удалось перенести вложения в корзину. Задача сохранена.":"Не удалось прикрепить файл. Проверь интернет и попробуй снова."; }
            final String report=message;
            final boolean trashed=trash&&success;
            activity.runOnUiThread(() -> finish(report,trashed));
        });
    }

    private void finish(String message) { finish(message,false); }

    private void finish(String message,boolean trashed) {
        String id = workId;
        workId = null; authorizationAccount = null; file = null; busy = false; trashMode=false;
        if (id != null && !activity.isDestroyed()) listener.report(id, message == null ? "Не удалось выполнить операцию с файлом." : message,trashed);
    }

    private static boolean validId(String id) { return id != null && id.matches("[a-zA-Z0-9_-]{1,160}"); }
    private static final class Failure extends Exception { Failure(String message) { super(message); } }
    private static final class Event {
        final String account, calendar, remoteId, day;
        Event(String account, String calendar, String remoteId, String day) {
            this.account=account; this.calendar=calendar; this.remoteId=remoteId; this.day=day;
        }
        String url() { return API+"/calendar/v3/calendars/"+Uri.encode(calendar)+"/events/"+Uri.encode(remoteId); }
    }

    private JSONObject attachmentState(String id) throws Exception {
        JSONObject state = new JSONObject(activity.getSharedPreferences("orbita", 0).getString("state","{}"));
        JSONObject task = WidgetTasks.find(state,id), config=state.optJSONObject("calendarAutoSync");
        if (task == null || task.optBoolean("done") || task.optString("dueISO").isEmpty())
            throw new Failure("Вложение можно добавить к незавершённой задаче со сроком.");
        if (config == null || !config.optBoolean("tasks") || !CalendarImport.allowed(activity))
            throw new Failure("Включи синхронизацию задач с Google Календарём в настройках.");
        return state;
    }

    private record CalendarTarget(long id, String account, String name) {}

    private CalendarTarget selectedCalendar(JSONObject state) throws Exception {
        long calendarId=state.getJSONObject("calendarAutoSync").optLong("id",-1);
        String account, calendar;
        Uri calendarUri=android.content.ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI,calendarId);
        try(Cursor cursor=activity.getContentResolver().query(calendarUri,new String[]{"account_name","account_type","name"},null,null,null)){
            if(cursor==null || !cursor.moveToFirst() || !"com.google".equals(cursor.getString(1)))
                throw new Failure("Выбранный Google Календарь недоступен.");
            account=cursor.getString(0);calendar=cursor.getString(2);
        }
        if (account==null || account.isEmpty()) throw new Failure("Выбранный Google-аккаунт недоступен.");
        return new CalendarTarget(calendarId, account, calendar == null || calendar.isEmpty() ? account : calendar);
    }

    private Event findSyncedEvent(String id, String authorizedAccount) throws Exception {
        JSONObject state=attachmentState(id);
        JSONObject task=WidgetTasks.find(state,id);
        CalendarTarget target=selectedCalendar(state);
        if (!target.account().equals(authorizedAccount)) {
            throw new Failure("Выбран другой Google-аккаунт. Повтори прикрепление для нового аккаунта.");
        }
        String tag="orbita://schedule/tasks/"+CalendarImport.hash(id);
        try(Cursor cursor=activity.getContentResolver().query(CalendarContract.Events.CONTENT_URI,new String[]{"_sync_id"},
                "calendar_id=? AND customAppPackage=? AND customAppUri=? AND deleted=0",
                new String[]{Long.toString(target.id()),activity.getPackageName(),tag},null)){
            if(cursor!=null && cursor.moveToFirst()){
                String syncId=cursor.getString(0);
                if(syncId!=null && !syncId.isEmpty())return new Event(target.account(),target.name(),syncId,task.optString("dueISO"));
            }
        }
        return null;
    }

    private Event awaitSyncedEvent(String id, String account) throws Exception {
        final long deadline = android.os.SystemClock.elapsedRealtime() + 10000;
        for (long delay = 400; ; delay = Math.min(delay * 2, 2000)) {
            if (activity.isDestroyed() || Thread.currentThread().isInterrupted()) {
                throw new Failure("Операция прервана. Выбранный файл можно прикрепить повторно.");
            }
            Event event = findSyncedEvent(id, account);
            if (event != null) return event;
            long remaining = deadline - android.os.SystemClock.elapsedRealtime();
            if (remaining <= 0) {
                throw new Failure("Google ещё не получил событие. Файл не загружен. Когда событие появится в Google Календаре, нажми «Повторить».");
            }
            try {
                Thread.sleep(Math.min(delay, remaining));
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new Failure("Ожидание прервано. Выбранный файл можно прикрепить повторно.");
            }
        }
    }

    private void attach(String id, Uri picked, String token, String account) throws Exception {
        Event target=awaitSyncedEvent(id, account);
        JSONObject google=request("GET",target.url(),token,null,null);
        if(!target.day.equals(google.optJSONObject("start") == null ? "" : google.getJSONObject("start").optString("date")))
            throw new Failure("Дата события в Google ещё не обновилась. Попробуй после синхронизации.");
        JSONObject cached=new JSONObject(storage().getString(id,"{}"));
        JSONArray attachedFiles=cached.optJSONArray("files");
        if(attachedFiles==null)attachedFiles=new JSONArray();
        JSONObject attachment;
        if(picked!=null){
            if(cached.optJSONObject("pending")!=null)throw new Failure("Сначала повтори прикрепление предыдущего файла.");
            String sourceKey = (activity.getPackageName()+".materials").equals(picked.getAuthority())
                ? CalendarImport.hash(picked.getEncodedPath()) : "";
            attachment=null;
            if (!sourceKey.isEmpty() && target.account.equals(cached.optString("account"))) {
                for (int i=0;i<attachedFiles.length();i++) {
                    JSONObject existing=attachedFiles.optJSONObject(i);
                    if (existing!=null && sourceKey.equals(existing.optString("sourceKey"))) {
                        attachment=existing;
                        break;
                    }
                }
            }
            if (attachment==null) {
                attachment=upload(picked,token);
                if (!sourceKey.isEmpty()) attachment.put("sourceKey",sourceKey);
            }
            cached.put("pending",attachment).put("files",attachedFiles).put("account",target.account);
            if(!storage().edit().putString(id,cached.toString()).remove("source:"+id).commit())throw new Failure("Не удалось сохранить данные файла. Загруженный файл остался на Диске.");
            try { activity.getContentResolver().releasePersistableUriPermission(picked,Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (SecurityException ignored) {}
        }else{
            attachment=cached.optJSONObject("pending");
            if(attachment==null)throw new Failure("Нет файла, ожидающего прикрепления.");
            if(!target.account.equals(cached.optString("account")))throw new Failure("Для закрепления файла выбери тот же Google-аккаунт, в который он загружен.");
        }
        JSONArray links=google.optJSONArray("attachments");
        if(links==null)links=new JSONArray();
        String fileId=attachment.getString("id"), link=attachment.getString("url");
        boolean exists=false;
        for(int i=0;i<links.length();i++){
            JSONObject item=links.optJSONObject(i);
            if(item!=null && (fileId.equals(item.optString("fileId")) || link.equals(item.optString("fileUrl"))))exists=true;
        }
        if(!exists){
            JSONArray writable=new JSONArray();
            for(int i=0;i<links.length();i++){
                JSONObject item=links.optJSONObject(i);
                if(item==null || item.optString("fileUrl").isEmpty())continue;
                JSONObject existing=new JSONObject().put("fileUrl",item.getString("fileUrl"));
                for(String key:new String[]{"title","mimeType","iconLink"})
                    if(item.has(key)&&!item.isNull(key))existing.put(key,item.getString(key));
                writable.put(existing);
            }
            if(writable.length()>=25)throw new Failure("В событии уже 25 вложений. Файл сохранён на Google Диске.");
            writable.put(new JSONObject().put("fileUrl",link));
            byte[] body=new JSONObject().put("attachments",writable).toString().getBytes(StandardCharsets.UTF_8);
            request("PATCH",target.url()+"?supportsAttachments=true",token,"application/json; charset=UTF-8",body,google.optString("etag"));
        }
        boolean seen=false;
        for(int i=0;i<attachedFiles.length();i++)
            if(fileId.equals(attachedFiles.getJSONObject(i).optString("id")))seen=true;
        if(!seen)attachedFiles.put(attachment);
        cached.remove("pending");
        storage().edit().putString(id,cached.put("files",attachedFiles).toString()).apply();
    }

    private static final class FileInfo {
        final String name, mime;
        FileInfo(String name,String mime){this.name=name;this.mime=mime;}
    }

    private FileInfo readFileInfo(Uri uri) throws Exception {
        String name="Вложение Орбиты";
        try(Cursor cursor=activity.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){
            if(cursor!=null&&cursor.moveToFirst()){
                if(!cursor.isNull(0))name=cursor.getString(0);
                if(!cursor.isNull(1)&&cursor.getLong(1)>MAX_FILE)throw new Failure("Файл больше 200 МБ.");
            }
        }
        String mime=WorkFileTypes.allowedMime(name,activity.getContentResolver().getType(uri));
        if(mime==null)throw new Failure(FILE_TYPES);
        return new FileInfo(name,mime);
    }

    private JSONObject upload(Uri uri, String token) throws Exception {
        FileInfo info=readFileInfo(uri);
        String name=info.name,mime=info.mime;
        JSONObject metadata = new JSONObject().put("name", name).put("mimeType", mime);
        JSONObject uploaded;
        try (InputStream stream = activity.getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new Failure("Не удалось прочитать выбранный файл.");
            java.io.PushbackInputStream input = new java.io.PushbackInputStream(stream);
            int first = input.read();
            if (first < 0) {
                String boundary = "orbita_" + UUID.randomUUID().toString().replace("-", "");
                byte[] empty = ("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                    + metadata + "\r\n--" + boundary + "\r\nContent-Type: " + mime
                    + "\r\n\r\n\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
                uploaded = request("POST", API + "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
                    token, "multipart/related; boundary=" + boundary, empty);
            } else {
                input.unread(first);
                uploaded = uploadChunks(input, beginUpload(metadata, mime, token), mime, token);
            }
        }
        String id=uploaded.getString("id");
        return new JSONObject().put("id",id).put("name",uploaded.optString("name",name))
            .put("url",uploaded.optString("webViewLink","https://drive.google.com/open?id="+Uri.encode(id)));
    }

    private static URL beginUpload(JSONObject metadata, String mime, String token) throws Exception {
        URL url = new URL(API + "/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink");
        HttpsURLConnection connection = uploadConnection(url, token, "POST");
        try {
            byte[] json = metadata.toString().getBytes(StandardCharsets.UTF_8);
            connection.setRequestProperty("Content-Type","application/json; charset=UTF-8");
            connection.setRequestProperty("X-Upload-Content-Type",mime);
            send(connection,json,0,json.length);
            int code=connection.getResponseCode();
            if (code != 200 && code != 201) throw uploadFailure(code);
            String location=connection.getHeaderField("Location");
            if (location == null) throw new Failure("Диск не вернул адрес загрузки.");
            URL session=new URL(location);
            // An upload session URL is sensitive. Only send it and the token back to Google's API.
            if(!"https".equals(session.getProtocol())
                || !("www.googleapis.com".equals(session.getHost()) || "upload.googleapis.com".equals(session.getHost()))
                || session.getUserInfo()!=null || (session.getPort()!=-1&&session.getPort()!=443)
                || !"/upload/drive/v3/files".equals(session.getPath()))
                throw new Failure("Диск вернул неизвестный адрес загрузки.");
            return session;
        } finally { connection.disconnect(); }
    }

    private static JSONObject uploadChunks(java.io.PushbackInputStream input, URL session, String mime, String token) throws Exception {
        byte[] chunk=new byte[CHUNK];
        long offset=0;
        while (true) {
            int size=0;
            while (size<chunk.length) {
                int count=input.read(chunk,size,chunk.length-size);
                if(count<0)break;
                if(count==0)continue;
                size+=count;
            }
            int next=input.read();
            if(next>=0)input.unread(next);
            long end=offset+size;
            if(end>MAX_FILE || (end==MAX_FILE && next>=0))throw new Failure("Файл больше 200 МБ.");
            String total=next<0?Long.toString(end):"*";
            int at=0, attempts=0;
            while(at<size){
                UploadReply reply;
                try {
                    reply=sendChunk(session,mime,token,chunk,at,size-at,
                        "bytes "+(offset+at)+"-"+(end-1)+"/"+total);
                } catch (java.io.IOException temporary) {
                    if(++attempts>3)throw temporary;
                    reply=sendChunk(session,mime,token,chunk,0,0,"bytes */"+total);
                }
                if(reply.file!=null)return reply.file;
                if(reply.bytes<offset+at||reply.bytes>end)throw new Failure("Диск вернул неверное смещение файла.");
                if(reply.bytes==offset+at&&++attempts>3)throw new Failure("Диск не подтвердил загрузку части файла.");
                at=(int)(reply.bytes-offset);
            }
            if(next<0){
                UploadReply status=sendChunk(session,mime,token,chunk,0,0,"bytes */"+total);
                if(status.file!=null)return status.file;
                throw new Failure("Диск ещё не подтвердил загрузку файла. Попробуй снова.");
            }
            offset=end;
        }
    }

    private static final class UploadReply {
        final JSONObject file;
        final long bytes;
        UploadReply(JSONObject file,long bytes){this.file=file;this.bytes=bytes;}
    }

    private static UploadReply sendChunk(URL session,String mime,String token,byte[] data,int at,int size,String range) throws Exception {
        HttpsURLConnection connection=uploadConnection(session,token,"PUT");
        try{
            connection.setRequestProperty("Content-Type",mime);
            connection.setRequestProperty("Content-Range",range);
            send(connection,data,at,size);
            int code=connection.getResponseCode();
            if(code==200||code==201)return new UploadReply(readJson(connection),0);
            if(code==308){
                String received=connection.getHeaderField("Range");
                if(received==null)return new UploadReply(null,0);
                if(!received.matches("bytes=0-[0-9]{1,12}"))throw new Failure("Диск вернул неверный диапазон файла.");
                return new UploadReply(null,Long.parseLong(received.substring(8))+1);
            }
            if(code==429||code>=500)throw new java.io.IOException("Temporary upload error: "+code);
            throw uploadFailure(code);
        }finally{connection.disconnect();}
    }

    private static HttpsURLConnection uploadConnection(URL url,String token,String method) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);connection.setReadTimeout(60000);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization","Bearer "+token);
        connection.setRequestProperty("Accept","application/json");
        return connection;
    }

    private static void send(HttpsURLConnection connection,byte[] data,int at,int size) throws java.io.IOException {
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(size);
        try(OutputStream output=connection.getOutputStream()){output.write(data,at,size);}
    }

    private static Failure uploadFailure(int code) {
        if(code==401||code==403)return new Failure("Google отклонил загрузку. Проверь доступ к Диску и свободное место.");
        if(code==404||code==410)return new Failure("Сеанс загрузки истёк. Выбери файл заново.");
        return new Failure("Диск не принял файл. Попробуй снова.");
    }

    private static JSONObject readJson(HttpsURLConnection connection) throws Exception {
        try(InputStream input=connection.getInputStream();ByteArrayOutputStream response=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int count;
            while((count=input.read(buffer))!=-1){
                if(response.size()+count>2000000)throw new java.io.IOException("Response too large");
                response.write(buffer,0,count);
            }
            return new JSONObject(response.toString("UTF-8"));
        }
    }

    private static JSONObject request(String method,String url,String token,String type,byte[] payload) throws Exception {
        return request(method,url,token,type,payload,"");
    }

    private static JSONObject request(String method,String url,String token,String type,byte[] payload,String etag) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)new URL(url).openConnection();
        try{
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);connection.setReadTimeout(35000);
            try { connection.setRequestMethod(method); }
            catch (java.net.ProtocolException unsupported) {
                if (!"PATCH".equals(method)) throw unsupported;
                connection.setRequestMethod("POST");
                connection.setRequestProperty("X-HTTP-Method-Override","PATCH");
            }
            if (!etag.isEmpty()) connection.setRequestProperty("If-Match",etag);
            connection.setRequestProperty("Authorization","Bearer "+token);
            connection.setRequestProperty("Accept","application/json");
            if(payload!=null){
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type",type);
                connection.setFixedLengthStreamingMode(payload.length);
                try(OutputStream output=connection.getOutputStream()){output.write(payload);}
            }
            int code=connection.getResponseCode();
            if(code==401||code==403)throw new Failure("Google отклонил доступ. Проверь разрешения Календаря и Диска.");
            if(code==412)throw new Failure("Событие изменилось во время загрузки. Нажми «Повторить прикрепление».");
            if(code==404)throw new Failure("Событие ещё не найдено в Google Календаре. Повтори после синхронизации.");
            if(code<200||code>=300)throw new Failure("Google не принял запрос. Если файл загружен, воспользуйся повтором прикрепления.");
            return readJson(connection);
        }finally{connection.disconnect();}
    }
}
