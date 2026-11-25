package ru.mirea.orbita;

import java.net.URI;
import java.util.Set;

final class SdoPortalLinks {
    static final String HOME = "https://online-edu.mirea.ru/";
    private static final String PORTAL = "online-edu.mirea.ru";
    private static final Set<String> TRUSTED = java.util.Collections.unmodifiableSet(
        new java.util.HashSet<>(java.util.Arrays.asList(PORTAL, "sso.mirea.ru")));

    private SdoPortalLinks() {}

    static boolean trusted(String value) { return hasHost(value, TRUSTED); }
    static boolean portal(String value) { return hasHost(value, java.util.Collections.singleton(PORTAL)); }

    private static boolean hasHost(String value, Set<String> hosts) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                && hosts.contains(uri.getHost().toLowerCase(java.util.Locale.ROOT))
                && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception error) { return false; }
    }

    static String bookmark(String value) {
        if (!portal(value)) return "";
        URI uri = URI.create(value);
        String path = uri.getRawPath();
        if (!"/course/view.php".equals(path) && !path.matches("/mod/[a-z][a-z0-9_]{0,38}/view\\.php")) return "";
        String query = uri.getRawQuery(), id = null;
        if (query != null) for (String pair : query.split("&")) {
            if (!pair.startsWith("id=")) continue;
            if (id != null) return "";
            id = pair.substring(3);
        }
        return id != null && id.matches("[0-9]{1,15}") ? HOME + path.substring(1) + "?id=" + id : "";
    }

    static String fileLink(String value) {
        if (value == null || value.length() > 1000 || !directFile(value)) return "";
        String path = URI.create(value).getRawPath();
        for (String segment : path.split("/")) {
            String decoded = URI.create("https://example.invalid/" + segment).getPath().substring(1);
            if (decoded.equals(".") || decoded.equals("..") || decoded.matches(".*[\\\\/\\p{Cntrl}].*")) return "";
        }
        return HOME + path.substring(1);
    }

    static boolean directFile(String value) {
        if (!portal(value)) return false;
        return URI.create(value).getRawPath().matches("/pluginfile\\.php/[0-9]+/[a-z][a-z0-9_]+/[a-z][a-z0-9_]+/.+");
    }
}
