package ru.mirea.orbita;

public class ScannerPreviewGeometryTest {
    public static void main(String[] args) {
        var portrait = ScannerPreviewGeometry.cover(640,480,360,720,true);
        check(portrait,540,720);
        check(ScannerPreviewGeometry.crop(640,480,portrait,270,true),240,240);
        var landscape = ScannerPreviewGeometry.cover(640,480,720,360,false);
        check(landscape,720,540);
        check(ScannerPreviewGeometry.crop(640,480,landscape,270,false),240,240);
        System.out.println("PASS camera preview aspect ratio and square QR crop");
    }

    private static void check(ScannerPreviewGeometry.Size size,int width,int height) {
        if (size.width()!=width || size.height()!=height) throw new AssertionError(size);
    }
}
