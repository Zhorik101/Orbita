package ru.mirea.orbita;

final class ScannerPreviewGeometry {
    record Size(int width, int height) {}

    private ScannerPreviewGeometry() {}

    static Size cover(int width, int height, int viewWidth, int viewHeight, boolean rotated) {
        int displayWidth = rotated ? height : width;
        int displayHeight = rotated ? width : height;
        float scale = Math.max(viewWidth / (float) displayWidth, viewHeight / (float) displayHeight);
        return new Size(Math.round(displayWidth * scale), Math.round(displayHeight * scale));
    }

    static Size crop(int frameWidth, int frameHeight, Size display, float target, boolean rotated) {
        int width = Math.round(frameWidth * target / (rotated ? display.height() : display.width()));
        int height = Math.round(frameHeight * target / (rotated ? display.width() : display.height()));
        return new Size(Math.min(frameWidth, Math.max(1, width)), Math.min(frameHeight, Math.max(1, height)));
    }
}
