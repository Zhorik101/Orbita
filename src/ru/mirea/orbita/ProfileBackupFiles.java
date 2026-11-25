package ru.mirea.orbita;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

final class ProfileBackupFiles {
    private static final int EXPORT = 740, IMPORT = 741;
    private static final int LIMIT = 2_000_000;
    private final Activity activity;
    private final Executor executor;
    private final Consumer<String> javascript;
    private File pendingExport;

    ProfileBackupFiles(Activity activity, Executor executor, Consumer<String> javascript) {
        this.activity = activity;
        this.executor = executor;
        this.javascript = javascript;
    }

    void save(Bundle out) {
        if (pendingExport != null) out.putString("orbitaBackupFile", pendingExport.getName());
    }

    void restore(Bundle in) {
        if (in == null) return;
        String filename = in.getString("orbitaBackupFile", "");
        if (filename.matches("orbita-export-[0-9]+\\.json")) {
            pendingExport = new File(activity.getCacheDir(), filename);
        }
    }

    void exportFile(String json) {
        if (json == null || json.length() > LIMIT || pendingExport != null) return;
        byte[] content = json.getBytes(StandardCharsets.UTF_8);
        if (content.length > LIMIT) {
            report("Резервная копия превышает 2 МБ.");
            return;
        }
        try {
            pendingExport = File.createTempFile("orbita-export-", ".json", activity.getCacheDir());
            try (var stream = new FileOutputStream(pendingExport)) { stream.write(content); }
            activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, "orbita-backup.json"), EXPORT);
        } catch (Exception error) {
            if (pendingExport != null) pendingExport.delete();
            pendingExport = null;
            report("Не удалось открыть сохранение резервной копии.");
        }
    }

    void importFile() {
        try {
            activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), IMPORT);
        } catch (Exception error) {
            report("Не удалось открыть выбор файла.");
        }
    }

    boolean onResult(int request, int result, Intent data) {
        if (request != EXPORT && request != IMPORT) return false;
        File source = request == EXPORT ? pendingExport : null;
        if (request == EXPORT) pendingExport = null;
        Uri uri = data == null ? null : data.getData();
        if (result != Activity.RESULT_OK || uri == null || !"content".equals(uri.getScheme())) {
            if (source != null) source.delete();
            return true;
        }
        executor.execute(() -> {
            try {
                if (request == EXPORT) {
                    if (source == null || !source.isFile()) throw new IOException();
                    try (var in = new FileInputStream(source); var out = activity.getContentResolver().openOutputStream(uri, "wt")) {
                        if (out == null) throw new IOException();
                        byte[] buffer = new byte[8192];
                        int count;
                        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    }
                    report("Резервная копия сохранена.");
                } else {
                    var bytes = new ByteArrayOutputStream();
                    try (var in = activity.getContentResolver().openInputStream(uri)) {
                        if (in == null) throw new IOException();
                        byte[] buffer = new byte[8192];
                        int count;
                        while ((count = in.read(buffer)) != -1) {
                            if (bytes.size() + count > LIMIT) throw new IOException();
                            bytes.write(buffer, 0, count);
                        }
                    }
                    String json = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
                    deliver("window.orbitaImportBackup?.(" + JSONObject.quote(json) + ")");
                }
            } catch (Exception error) {
                report(request == EXPORT ? "Не удалось сохранить резервную копию." : "Не удалось прочитать JSON-файл размером до 2 МБ.");
            } finally {
                if (source != null) source.delete();
            }
        });
        return true;
    }

    private void report(String text) {
        deliver("toast(" + JSONObject.quote(text) + ")");
    }

    private void deliver(String source) {
        activity.runOnUiThread(() -> {
            if (!activity.isDestroyed() && !activity.isFinishing()) javascript.accept(source);
        });
    }
}
