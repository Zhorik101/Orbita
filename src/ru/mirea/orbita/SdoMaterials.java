package ru.mirea.orbita;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/** Private copies of documents explicitly selected through Android's document picker. */
final class SdoMaterials {
    private static final int IMPORT = 760, EXPORT = 761;
    private static final long FILE_LIMIT = 100L * 1024 * 1024;
    private static final long LIBRARY_LIMIT = 500L * 1024 * 1024;
    private static final Map<String, String> TYPES = new java.util.LinkedHashMap<>();
    static {
        TYPES.put("pdf", "application/pdf");
        TYPES.put("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        TYPES.put("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        TYPES.put("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        TYPES.put("txt", "text/plain");
        TYPES.put("zip", "application/zip");
        TYPES.put("rar", "application/vnd.rar");
        TYPES.put("7z", "application/x-7z-compressed");
        TYPES.put("doc", "application/msword");
        TYPES.put("ppt", "application/vnd.ms-powerpoint");
    }
    private static final class ImportFailure extends IOException {
        ImportFailure(String message) { super(message); }
    }
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private final Activity activity;
    private final SharedPreferences store;
    private final File root;
    private final Consumer<String> callback;
    private volatile boolean cancelled, busy;
    private String exporting = "";

    SdoMaterials(Activity activity, Consumer<String> callback) {
        this.activity = activity;
        this.callback = callback;
        store = activity.getSharedPreferences("orbita_sdo_files", Activity.MODE_PRIVATE);
        root = new File(activity.getFilesDir(), "sdo-materials");
        IO.execute(() -> {
            var files = root.listFiles((dir, name) -> name.startsWith("incoming-") && name.endsWith(".part"));
            if (files != null) for (File file : files) file.delete();
        });
    }

    void save(Bundle out) { out.putString("sdoExport", exporting); }
    void restore(Bundle in) { if (in != null) exporting = in.getString("sdoExport", ""); }

    private File file(String id, JSONObject details) {
        String extension = details.optString("extension");
        return id.matches("[a-f0-9]{64}") && TYPES.containsKey(extension)
            ? new File(root, id + "." + extension) : null;
    }

    private JSONObject metadata(String id) {
        try { return new JSONObject(store.getString(id, "")); }
        catch (Exception error) { return new JSONObject(); }
    }

    String list() {
        var results = new JSONArray();
        for (String id : store.getAll().keySet()) {
            var details = metadata(id);
            var item = file(id, details);
            if (item != null && item.isFile() && item.length() == details.optLong("size")) results.put(details);
        }
        return results.toString();
    }

    void choose() {
        if (busy) return;
        try {
            activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .setType("*/*").addCategory(Intent.CATEGORY_OPENABLE)
                .putExtra(Intent.EXTRA_MIME_TYPES, TYPES.values().toArray(new String[0]))
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true), IMPORT);
        } catch (RuntimeException error) { finish("Не удалось открыть выбор документов.", new JSONArray()); }
    }

    void open(String id) {
        try {
            var details = metadata(id);
            var item = file(id, details);
            if (item == null || !item.isFile()) throw new IOException();
            var uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".materials", item,
                details.getString("name"));
            var intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, TYPES.get(details.getString("extension")))
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
        } catch (Exception error) { finish("Файл недоступен или на телефоне нет приложения для его формата.", new JSONArray()); }
    }

    void export(String id) {
        if (busy || !exporting.isEmpty()) return;
        try {
            var details = metadata(id);
            var item = file(id, details);
            if (item == null || !item.isFile()) throw new IOException();
            exporting = id;
            activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .setType(TYPES.get(details.getString("extension"))).addCategory(Intent.CATEGORY_OPENABLE)
                .putExtra(Intent.EXTRA_TITLE, details.getString("name")), EXPORT);
        } catch (Exception error) {
            exporting = "";
            finish("Не удалось открыть экспорт файла.", new JSONArray());
        }
    }

    void remove(String payload) {
        if (payload == null || payload.length() > 34000) return;
        IO.execute(() -> {
            try {
                JSONArray ids = new JSONArray(payload);
                if (ids.length() > 500) return;
                int removed = 0, failed = 0;
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.optString(i);
                    if (!id.matches("[a-f0-9]{64}")) continue;
                    var item = file(id, metadata(id));
                    if (item == null || (item.exists() && !item.delete())) { failed++; continue; }
                    if (store.edit().remove(id).commit()) removed++;
                    else failed++;
                }
                finish("Удалено локальных копий: " + removed + (failed > 0 ? ". Ошибок: " + failed : "."), new JSONArray());
            } catch (Exception error) { finish("Не удалось удалить локальные копии.", new JSONArray()); }
        });
    }

    void cancel() { cancelled = true; }

    boolean onResult(int request, int result, Intent data) {
        if (request != IMPORT && request != EXPORT) return false;
        String source = exporting;
        if (request == EXPORT) exporting = "";
        if (result != Activity.RESULT_OK || data == null) {
            if (request == IMPORT) finish("", new JSONArray());
            return true;
        }
        var selected = new ArrayList<Uri>();
        ClipData items = data.getClipData();
        if (request == IMPORT && items != null) {
            for (int i = 0; i < items.getItemCount(); i++) selected.add(items.getItemAt(i).getUri());
        } else if (data.getData() != null) selected.add(data.getData());
        if (selected.isEmpty() || selected.size() > 32 || selected.stream().anyMatch(uri ->
                uri == null || !"content".equals(uri.getScheme()))) {
            finish("Выбери от 1 до 32 документов через системный выбор файлов.", new JSONArray());
            return true;
        }
        cancelled = false;
        busy = true;
        IO.execute(() -> {
            try {
                if (request == EXPORT) {
                    exportTo(source, selected.get(0));
                    finish("Файл экспортирован.", new JSONArray());
                } else importAll(selected);
            } catch (Exception error) {
                finish("Не удалось завершить операцию с файлом.", new JSONArray());
            } finally { busy = false; }
        });
        return true;
    }

    private void exportTo(String id, Uri to) throws Exception {
        var item = file(id, metadata(id));
        try {
            if (item == null || !item.isFile()) throw new IOException();
            try (var in = new FileInputStream(item); var out = activity.getContentResolver().openOutputStream(to, "wt")) {
                copy(in, out, null);
            }
        } catch (Exception error) {
            try { DocumentsContract.deleteDocument(activity.getContentResolver(), to); } catch (Exception ignored) {}
            throw error;
        }
    }

    private void importAll(ArrayList<Uri> selected) {
        int failed = 0, index = 0;
        String firstError = "";
        var accepted = new JSONArray();
        for (Uri uri : selected) {
            if (cancelled) break;
            progress(++index, selected.size());
            try { accepted.put(importOne(uri)); }
            catch (ImportFailure error) {
                if (!cancelled) { failed++; if (firstError.isEmpty()) firstError = error.getMessage(); }
            } catch (Exception error) { if (!cancelled) failed++; }
        }
        finish((cancelled ? "Импорт отменён. " : "") + "Доступно в библиотеке: " + accepted.length() + "."
            + (failed > 0 ? " Ошибок: " + failed + ". " + firstError : ""), accepted);
    }

    private String importOne(Uri uri) throws Exception {
        String name = "";
        long expected = -1;
        try (var cursor = activity.getContentResolver().query(uri,
                new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                name = cursor.getString(0);
                if (!cursor.isNull(1)) expected = cursor.getLong(1);
            }
        }
        if (name == null) throw new ImportFailure("У файла нет названия.");
        name = name.replaceAll("[/\\\\\\p{Cntrl}]", "_").trim();
        int dot = name.lastIndexOf('.');
        String extension = dot > 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        if (!TYPES.containsKey(extension)) throw new ImportFailure("Формат файла не поддерживается.");
        if (name.length() > 160) name = name.substring(0, Math.min(dot, 150)) + "." + extension;
        if (expected > FILE_LIMIT) throw new ImportFailure("Один файл может занимать до 100 МБ.");
        if (!root.isDirectory() && !root.mkdirs()) throw new ImportFailure("Библиотека недоступна.");
        if (root.getUsableSpace() < Math.max(expected, 0) + 8L * 1024 * 1024) throw new ImportFailure("На устройстве не хватает места.");
        var temp = File.createTempFile("incoming-", ".part", root);
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            long size;
            try (var in = activity.getContentResolver().openInputStream(uri); var out = new FileOutputStream(temp)) {
                size = copy(in, out, digest);
                if (size <= 0 || expected >= 0 && size != expected) throw new ImportFailure("Файл пуст или прочитан не полностью.");
                out.getFD().sync();
            }
            var hash = new StringBuilder();
            for (byte value : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", value & 255));
            String id = hash.toString();
            var existing = file(id, metadata(id));
            if (existing != null && existing.isFile() && existing.length() == size) return id;
            long used = 0;
            var stored = root.listFiles((dir, filename) -> !filename.endsWith(".part"));
            if (stored != null) for (File item : stored) used += item.length();
            if (used + size > LIBRARY_LIMIT) throw new ImportFailure("Лимит библиотеки — 500 МБ.");
            var details = new JSONObject().put("id", id).put("name", name).put("extension", extension)
                .put("size", size).put("updated", System.currentTimeMillis());
            var item = file(id, details);
            if (item == null || !temp.renameTo(item)) throw new ImportFailure("Не удалось сохранить копию.");
            if (!store.edit().putString(id, details.toString()).commit()) {
                item.delete();
                throw new ImportFailure("Не удалось сохранить запись библиотеки.");
            }
            return id;
        } finally { temp.delete(); }
    }

    private long copy(InputStream in, OutputStream out, MessageDigest digest) throws IOException {
        if (in == null || out == null) throw new IOException();
        byte[] buffer = new byte[32 * 1024];
        long size = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            if (cancelled) throw new IOException();
            size += read;
            if (size > FILE_LIMIT) throw new ImportFailure("Один файл может занимать до 100 МБ.");
            if (digest != null) digest.update(buffer, 0, read);
            out.write(buffer, 0, read);
        }
        return size;
    }

    private void progress(int index, int length) {
        notifyJs("window.orbitaSdoProgress?.(" + index + "," + length + ")");
    }

    private void finish(String message, JSONArray ids) {
        notifyJs("window.orbitaSdoFilesChanged?.(" + JSONObject.quote(message) + "," + ids + ")");
    }

    private void notifyJs(String script) {
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing() && !activity.isDestroyed()) callback.accept(script);
        });
    }
}
