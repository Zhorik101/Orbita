package ru.mirea.orbita;

public class SdoPortalLinksTest {
    public static void main(String[] args) {
        String course="https://online-edu.mirea.ru/course/view.php?id=42";
        check(SdoPortalLinks.bookmark(course + "&sesskey=hidden#section").equals(course));
        check(SdoPortalLinks.bookmark(course+"&id=12").isEmpty());
        check(SdoPortalLinks.bookmark("https://online-edu.mirea.ru/mod/assign/view.php?id=2").contains("/mod/assign/"));
        check(SdoPortalLinks.trusted("https://sso.mirea.ru/realms/mirea"));
        check(!SdoPortalLinks.portal("https://sso.mirea.ru/realms/mirea"));
        check(!SdoPortalLinks.trusted("https://online-edu.mirea.ru.example.org/my/"));
        check(!SdoPortalLinks.trusted("https://user@online-edu.mirea.ru/"));
        check(!SdoPortalLinks.trusted("http://online-edu.mirea.ru/"));
        check(!SdoPortalLinks.trusted("https://online-edu.mirea.ru:444/"));
        check(SdoPortalLinks.directFile("https://online-edu.mirea.ru/pluginfile.php/1/mod_resource/content/1/notes.pdf"));
        check(!SdoPortalLinks.directFile("https://online-edu.mirea.ru/login/index.php"));
        check(!SdoPortalLinks.directFile("https://example.org/pluginfile.php/1/mod_resource/content/notes.pdf"));
        String file="https://online-edu.mirea.ru/pluginfile.php/1/mod_assign/introattachment/0/Work%201.pdf";
        check(SdoPortalLinks.fileLink(file+"?token=hidden#top").equals(file));
        check(SdoPortalLinks.fileLink(file.replace("Work%201.pdf","%2e%2e/Secret.pdf")).isEmpty());
        check(SdoPortalLinks.fileLink(file.replace("Work%201.pdf","folder%2fSecret.pdf")).isEmpty());
        System.out.println("PASS portal origin, bookmark redaction and file endpoint allowlist");
    }
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
}
