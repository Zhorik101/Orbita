package ru.mirea.orbita;

public class ScannerPreviewGeometryTest {
    public static void main(String[] args) {
        var portrait = ScannerPreviewGeometry.cover(640,480,360,720,true);
        check(portrait,540,720);
        check(ScannerPreviewGeometry.crop(640,480,portrait,270,true),240,240);
        var landscape = ScannerPreviewGeometry.cover(640,480,720,360,false);
        check(landscape,720,540);
        check(ScannerPreviewGeometry.crop(640,480,landscape,270,false),240,240);
        for (int sensor : new int[]{0, 90, 180, 270}) {
            for (int display : new int[]{0, 90, 180, 270}) {
                checkTexture(sensor, display, 360, 720);
                checkTexture(sensor, display, 720, 360);
            }
        }
        System.out.println("PASS camera preview aspect ratio and square QR crop");
    }

    private static void checkTexture(int sensor, int display, int viewWidth, int viewHeight) {
        int frameWidth = 640, frameHeight = 480;
        var transform = ScannerPreviewGeometry.textureTransform(frameWidth, frameHeight,
            viewWidth, viewHeight, sensor, display);
        if (transform.rotation() != -display) throw new AssertionError(transform);
        float preRotationWidth = transform.scaleX() * viewWidth;
        float preRotationHeight = transform.scaleY() * viewHeight;
        float mappedWidth = display % 180 == 0 ? preRotationWidth : preRotationHeight;
        float mappedHeight = display % 180 == 0 ? preRotationHeight : preRotationWidth;
        boolean swapsAxes = (sensor - display) % 180 != 0;
        int uprightWidth = swapsAxes ? frameHeight : frameWidth;
        int uprightHeight = swapsAxes ? frameWidth : frameHeight;
        near(mappedWidth / uprightWidth, mappedHeight / uprightHeight, 0.001f);
        near(Math.min(mappedWidth / viewWidth, mappedHeight / viewHeight), 1f, 0.001f);
        float finder = 0.74f * Math.min(viewWidth, viewHeight);
        var crop = transform.crop(frameWidth, frameHeight, finder);
        if (crop.width() != crop.height()) throw new AssertionError(crop);
        near(crop.width() * mappedWidth / uprightWidth, finder, transform.pixelsPerFramePixel() / 2 + 0.001f);
    }

    private static void near(float actual, float expected, float tolerance) {
        if (Math.abs(actual - expected) > tolerance) throw new AssertionError(actual + " != " + expected);
    }

    private static void check(ScannerPreviewGeometry.Size size,int width,int height) {
        if (size.width()!=width || size.height()!=height) throw new AssertionError(size);
    }
}
