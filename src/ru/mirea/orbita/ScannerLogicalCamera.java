package ru.mirea.orbita;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Range;
import android.util.Size;
import android.view.Surface;
import java.util.Arrays;

/** Lens selection via Android's logical rear camera on devices exposing optical zoom ranges. */
final class ScannerLogicalCamera {
    interface Client {
        void frame(byte[] data, int width, int height);
        void failed();
    }

    private final CameraManager manager;
    private final String id;
    final Range<Float> range;
    final int orientation;
    final Size frameSize;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private CameraDevice device;
    private CameraCaptureSession session;
    private CaptureRequest.Builder request;
    private ImageReader reader;
    private Surface display;
    private int generation;
    private long lastFrame;
    private float zoom = 1;

    private ScannerLogicalCamera(CameraManager manager, String id, Range<Float> range, int orientation, Size size) {
        this.manager = manager;
        this.id = id;
        this.range = range;
        this.orientation = orientation;
        frameSize = size;
    }

    static ScannerLogicalCamera find(Context context) {
        if (Build.VERSION.SDK_INT < 30) return null;
        var manager = context.getSystemService(CameraManager.class);
        try {
            for (String id : manager.getCameraIdList()) {
                var camera = manager.getCameraCharacteristics(id);
                if (!Integer.valueOf(CameraCharacteristics.LENS_FACING_BACK).equals(camera.get(CameraCharacteristics.LENS_FACING))
                    || camera.getPhysicalCameraIds().size() < 2) continue;
                var range = camera.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE);
                var map = camera.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
                Integer orientation = camera.get(CameraCharacteristics.SENSOR_ORIENTATION);
                if (range == null || map == null || orientation == null || (range.getLower() >= 1 && range.getUpper() < 2)) continue;
                Size[] displaySizes = map.getOutputSizes(SurfaceTexture.class);
                Size[] yuvSizes = map.getOutputSizes(ImageFormat.YUV_420_888);
                if (displaySizes == null || yuvSizes == null) continue;
                Size size = null;
                for (Size candidate : yuvSizes) {
                    if (candidate.getWidth() * candidate.getHeight() > 1280 * 960
                        || !Arrays.asList(displaySizes).contains(candidate)) continue;
                    if (size == null || Math.abs(candidate.getWidth() * candidate.getHeight() - 640 * 480)
                        < Math.abs(size.getWidth() * size.getHeight() - 640 * 480)) size = candidate;
                }
                if (size != null) return new ScannerLogicalCamera(manager, id, range, orientation, size);
            }
        } catch (Exception ignored) {}
        return null;
    }

    @SuppressLint("MissingPermission")
    @SuppressWarnings("deprecation")
    void open(SurfaceTexture texture, Client client) {
        close();
        int opened = generation;
        try {
            texture.setDefaultBufferSize(frameSize.getWidth(), frameSize.getHeight());
            display = new Surface(texture);
            reader = ImageReader.newInstance(frameSize.getWidth(), frameSize.getHeight(), ImageFormat.YUV_420_888, 2);
            reader.setOnImageAvailableListener(images -> {
                try (var image = images.acquireLatestImage()) {
                    long now = android.os.SystemClock.elapsedRealtime();
                    if (image == null || opened != generation || now - lastFrame < 130) return;
                    lastFrame = now;
                    var plane = image.getPlanes()[0];
                    var buffer = plane.getBuffer();
                    int width = image.getWidth(), height = image.getHeight();
                    byte[] y = new byte[width * height];
                    for (int row = 0; row < height; row++) {
                        buffer.position(row * plane.getRowStride());
                        buffer.get(y, row * width, width);
                    }
                    handler.post(() -> {
                        if (opened == generation) client.frame(y, width, height);
                    });
                } catch (RuntimeException ignored) {}
            }, handler);
            manager.openCamera(id, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice camera) {
                    if (opened != generation) {camera.close();return;}
                    device = camera;
                    try {
                        request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                        request.addTarget(display);
                        request.addTarget(reader.getSurface());
                        camera.createCaptureSession(Arrays.asList(display, reader.getSurface()), new CameraCaptureSession.StateCallback() {
                            @Override public void onConfigured(CameraCaptureSession capture) {
                                if (opened != generation) {capture.close();return;}
                                session = capture;
                                try {repeat();} catch (Exception error) {client.failed();}
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession capture) {
                                capture.close();
                                if (opened == generation) client.failed();
                            }
                        },handler);
                    } catch (Exception error) {client.failed();}
                }
                @Override public void onDisconnected(CameraDevice camera) {
                    camera.close();
                    if (opened == generation) client.failed();
                }
                @Override public void onError(CameraDevice camera, int error) {onDisconnected(camera);}
            },handler);
        } catch (Exception error) {client.failed();}
    }

    float zoom() {return zoom;}
    void zoom(float value) {
        zoom = range.clamp(value);
        try {repeat();} catch (Exception ignored) {}
    }
    private void repeat() throws android.hardware.camera2.CameraAccessException {
        if (session == null || request == null || Build.VERSION.SDK_INT < 30) return;
        request.set(CaptureRequest.CONTROL_ZOOM_RATIO, zoom);
        session.setRepeatingRequest(request.build(), null, handler);
    }

    void close() {
        generation++;
        if (session != null) session.close();
        if (device != null) device.close();
        if (reader != null) reader.close();
        if (display != null) display.release();
        session = null;
        device = null;
        reader = null;
        display = null;
        request = null;
    }
}
