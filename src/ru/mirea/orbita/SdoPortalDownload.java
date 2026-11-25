package ru.mirea.orbita;

import android.webkit.CookieManager;
import android.webkit.URLUtil;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import javax.net.ssl.HttpsURLConnection;

final class SdoPortalDownload {
    private static final long MAX = 100L * 1024 * 1024;
    record Document(File file, String name, String mime) {}
    private SdoPortalDownload() {}

    static Document fetch(String url, String agent, String disposition, File cache, BooleanSupplier cancelled) throws IOException {
        for (int redirects=0;redirects<5;redirects++) {
            if (cancelled.getAsBoolean() || !SdoPortalLinks.directFile(url)) throw new IOException();
            var connection=(HttpsURLConnection)URI.create(url).toURL().openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(15000);
                connection.setRequestProperty("Accept-Encoding","identity");
                if (agent!=null && !agent.isEmpty()) connection.setRequestProperty("User-Agent",agent);
                String cookie=CookieManager.getInstance().getCookie(url);
                if (cookie!=null && !cookie.isEmpty()) connection.setRequestProperty("Cookie",cookie);
                int status=connection.getResponseCode();
                if (status==301||status==302||status==303||status==307||status==308) {
                    String location=connection.getHeaderField("Location");
                    if (location==null) throw new IOException();
                    url=URI.create(url).resolve(location).toString();
                    continue;
                }
                if (status!=200) throw new IOException();
                String serverDisposition=connection.getHeaderField("Content-Disposition");
                String mime=connection.getContentType();
                if (mime==null) throw new IOException();
                mime=mime.split(";",2)[0].trim().toLowerCase(Locale.ROOT);
                if (mime.contains("html")||mime.contains("xml")&&!mime.contains("openxmlformats")) throw new IOException();
                String name=URLUtil.guessFileName(url,serverDisposition==null?disposition:serverDisposition,mime)
                    .replace('/','_').replace('\\','_').replaceAll("\\p{Cntrl}","_");
                String documentMime=type(name);
                if (documentMime.isEmpty() || !mime.equals(documentMime) && !mime.equals("application/octet-stream")
                    && !mime.equals("binary/octet-stream") && !mime.equals("application/x-zip-compressed")) throw new IOException();
                if (name.length()>160) name=name.substring(0,150)+name.substring(name.lastIndexOf('.'));
                long expected=connection.getContentLengthLong();
                if (expected>MAX || cache.getUsableSpace()<Math.max(expected,0)+8388608L) throw new IOException();
                File staged=File.createTempFile("sdo-portal-",".part",cache);
                boolean success=false;
                try (var in=connection.getInputStream();var out=new FileOutputStream(staged)) {
                    long size=copy(in,out,cancelled);
                    if (size<=0 || expected>=0 && expected!=size) throw new IOException();
                    out.flush();
                    if (!matchingHeader(staged,documentMime)) throw new IOException();
                    success=true;
                    return new Document(staged,name,documentMime);
                } finally { if (!success) staged.delete(); }
            } finally { connection.disconnect(); }
        }
        throw new IOException();
    }

    private static String type(String name) {
        String extension=name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
        return switch(extension) {
            case "pdf" -> "application/pdf";
            case "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "doc" -> "application/msword";
            case "ppt" -> "application/vnd.ms-powerpoint";
            case "txt" -> "text/plain";
            case "zip" -> "application/zip";
            case "rar" -> "application/vnd.rar";
            case "7z" -> "application/x-7z-compressed";
            default -> "";
        };
    }

    private static boolean matchingHeader(File file,String mime) throws IOException {
        try(var in=new java.io.FileInputStream(file)) {
            byte[] bytes=new byte[1024];
            int size=in.read(bytes);
            if(size<1)return false;
            String prefix=new String(bytes,0,size,java.nio.charset.StandardCharsets.US_ASCII);
            if(mime.equals("application/pdf"))return prefix.contains("%PDF-");
            if(mime.contains("openxmlformats")||mime.equals("application/zip"))return prefix.startsWith("PK");
            String text=prefix.trim().toLowerCase(Locale.ROOT);
            return !text.startsWith("<!doctype html")&&!text.startsWith("<html")&&!text.startsWith("<form");
        }
    }
    static long copy(InputStream in,OutputStream out,BooleanSupplier cancelled) throws IOException {
        var buffer=new byte[32768];
        long seen=0;
        int read;
        while((read=in.read(buffer))!=-1){
            seen+=read;
            if(seen>MAX||cancelled.getAsBoolean())throw new IOException();
            out.write(buffer,0,read);
        }
        return seen;
    }
}
