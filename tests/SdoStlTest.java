package ru.mirea.orbita;

import java.nio.file.Files;

public class SdoStlTest {
    public static void main(String[] args) throws Exception {
        if (!SdoPortalDownload.acceptedMime("application/pdf", "application/force-download")
            || SdoPortalDownload.acceptedMime("application/pdf", "text/html")) throw new AssertionError();
        var file = Files.createTempFile("orbita-model-", ".stl");
        try {
            var binary = new byte[134];
            binary[80] = 1;
            Files.write(file, binary);
            check(file, true);
            Files.write(file, java.util.Arrays.copyOf(binary, 133));
            check(file, false);
            Files.writeString(file, "solid demo\n facet normal 0 0 1\n outer loop\n vertex 0 0 0\nendsolid\n");
            check(file, true);
            Files.writeString(file, "<html>Требуется вход</html>");
            check(file, false);
            System.out.println("PASS binary and text STL headers, truncated file and HTML rejection");
        } finally { Files.delete(file); }
    }

    private static void check(java.nio.file.Path file, boolean expected) throws Exception {
        if (SdoPortalDownload.matchingHeader(file.toFile(), "model/stl") != expected) throw new AssertionError();
    }
}
