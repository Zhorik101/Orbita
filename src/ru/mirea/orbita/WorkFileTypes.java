package ru.mirea.orbita;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;

final class WorkFileTypes {
    private static final Map<String,String> TYPES = new LinkedHashMap<>();
    static {
        add("model/stl", "stl");
        add("application/pdf", "pdf");
        add("application/msword", "doc");
        add("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");
        add("application/vnd.ms-excel", "xls");
        add("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx");
        add("application/vnd.ms-powerpoint", "ppt");
        add("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx");
        add("application/vnd.oasis.opendocument.text", "odt");
        add("application/vnd.oasis.opendocument.spreadsheet", "ods");
        add("application/vnd.oasis.opendocument.presentation", "odp");
        add("application/rtf", "rtf");
        add("text/plain", "txt");
        add("text/markdown", "md");
        add("text/csv", "csv");
        add("image/jpeg", "jpg", "jpeg");
        add("image/png", "png");
        add("image/webp", "webp");
        add("image/gif", "gif");
        add("image/heic", "heic");
        add("image/heif", "heif");
        add("image/avif", "avif");
        add("image/bmp", "bmp");
        add("image/tiff", "tiff", "tif");
    }

    private WorkFileTypes() {}
    private static void add(String mime,String... extensions) {
        for(String extension:extensions) TYPES.put(extension,mime);
    }

    static String[] pickerTypes() {
        return new LinkedHashSet<>(TYPES.values()).toArray(new String[0]);
    }

    static String allowedMime(String name, String reported) {
        String mime = reported == null ? "" : reported.split(";",2)[0].trim().toLowerCase(Locale.ROOT);
        String filename = name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
        int dot=filename.lastIndexOf('.');
        String extension=dot<0?"":filename.substring(dot+1);
        if (mime.contains("android.package") || extension.matches("apk|apks|xapk|apkm|aab|exe|msi|dex")) return null;
        String expected=TYPES.get(extension);
        if (expected == null) return dot < 0 && TYPES.containsValue(mime) ? mime : null;
        if (mime.isEmpty() || "application/octet-stream".equals(mime) || mime.equals(expected)) return expected;
        if ("rtf".equals(extension) && "text/rtf".equals(mime)) return expected;
        if ("csv".equals(extension) && ("text/plain".equals(mime) || "application/vnd.ms-excel".equals(mime))) return expected;
        if ("md".equals(extension) && "text/plain".equals(mime)) return expected;
        return null;
    }
}
