package ru.mirea.orbita;

final class ScannerPreviewGeometry {
    record Size(int width, int height) {}

    record TextureTransform(float scaleX, float scaleY, int rotation, float pixelsPerFramePixel) {
        Size crop(int frameWidth, int frameHeight, float finderSize) {
            int side = Math.max(1, Math.round(finderSize / pixelsPerFramePixel));
            return new Size(Math.min(frameWidth, side), Math.min(frameHeight, side));
        }
    }

    private ScannerPreviewGeometry() {}

    static TextureTransform textureTransform(int width, int height, int viewWidth, int viewHeight,
                                             int sensorDegrees, int displayDegrees) {
        // Camera2's SurfaceTexture already applies the sensor orientation.
        boolean sensorSwapsAxes = sensorDegrees % 180 != 0;
        int textureWidth = sensorSwapsAxes ? height : width;
        int textureHeight = sensorSwapsAxes ? width : height;
        boolean displaySwapsAxes = displayDegrees % 180 != 0;
        int uprightWidth = displaySwapsAxes ? textureHeight : textureWidth;
        int uprightHeight = displaySwapsAxes ? textureWidth : textureHeight;
        float scale = Math.max(viewWidth / (float) uprightWidth, viewHeight / (float) uprightHeight);
        // Undo TextureView's default stretch, then rotate around its center.
        return new TextureTransform(textureWidth * scale / viewWidth, textureHeight * scale / viewHeight,
            -displayDegrees, scale);
    }

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
