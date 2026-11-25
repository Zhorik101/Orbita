package ru.mirea.orbita;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Matrix;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.TextureView;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@SuppressWarnings("deprecation")
public final class AttendanceScannerActivity extends Activity implements SurfaceHolder.Callback {
    private static final int CAMERA_PERMISSION = 310;
    private static final String INITIAL_HINT = "Наведи камеру на QR-код посещения Пульса";
    private final QRCodeReader reader = new QRCodeReader();
    private Camera camera;
    private SurfaceView preview;
    private TextureView logicalPreview;
    private ScannerLogicalCamera logicalCamera;
    private FrameLayout cameraFrame;
    private boolean logicalRunning;
    private int displayedWidth, displayedHeight;
    private ScannerPreviewGeometry.TextureTransform logicalTransform;
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) {}
        @Override public void onDisplayRemoved(int id) {}
        @Override public void onDisplayChanged(int id) {
            var display = logicalPreview.getDisplay();
            if (display != null && display.getDisplayId() == id) fitPreview();
        }
    };
    private TextView hint;
    private final List<Integer> rearCameras = new ArrayList<>();
    private int selectedCamera;
    private int zoomIndex;
    private Button cameraSwitch;
    private View finder;
    private ImageView scannerImage;
    private static final int PICK_SCANNER_IMAGE = 311;
    private List<Integer> zoomRatios;
    private Camera.Size frameSize;
    private boolean rotatedPreview;
    private float pinchTarget = 100;
    private boolean resumed, scanAccepted;
    private Button permissionAction;
    private boolean surfaceReady;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff171922);
        getWindow().setStatusBarColor(0xff171922);
        getWindow().setNavigationBarColor(0xff171922);
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        Button close = new Button(this);
        close.setText("‹");
        close.setContentDescription("Закрыть сканер");
        close.setAllCaps(false);
        close.setTextColor(Color.WHITE);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setOnClickListener(view -> finish());
        toolbar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(54)));
        TextView title = new TextView(this);
        title.setText("QR посещения");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Camera.CameraInfo info = new Camera.CameraInfo();
        for (int id = 0; id < Camera.getNumberOfCameras(); id++) {
            Camera.getCameraInfo(id, info);
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) rearCameras.add(id);
        }
        if (rearCameras.size() < 2) logicalCamera = ScannerLogicalCamera.find(this);
        cameraSwitch = new Button(this);
        cameraSwitch.setAllCaps(false);
        cameraSwitch.setTextColor(Color.WHITE);
        cameraSwitch.setBackgroundColor(Color.TRANSPARENT);
        cameraSwitch.setContentDescription("Переключить модуль камеры");
        cameraSwitch.setVisibility(rearCameras.size() > 1 || logicalCamera != null ? View.VISIBLE : View.GONE);
        cameraSwitch.setOnClickListener(view -> switchCamera());
        updateCameraLabel();
        toolbar.addView(cameraSwitch, new LinearLayout.LayoutParams(-2, dp(52)));
        Button imageButton = new Button(this);
        imageButton.setText("Картинка");
        imageButton.setAllCaps(false);
        imageButton.setTextColor(Color.WHITE);
        imageButton.setBackgroundColor(Color.TRANSPARENT);
        imageButton.setOnClickListener(view -> chooseScannerImage());
        toolbar.addView(imageButton, new LinearLayout.LayoutParams(-2, dp(52)));
        root.addView(toolbar);

        cameraFrame = new FrameLayout(this);
        preview = new SurfaceView(this);
        preview.getHolder().addCallback(this);
        cameraFrame.addView(preview, new FrameLayout.LayoutParams(-1, -1));
        logicalPreview = new TextureView(this);
        logicalPreview.setVisibility(logicalCamera == null ? View.GONE : View.VISIBLE);
        if (logicalCamera != null) preview.setVisibility(View.GONE);
        cameraFrame.addView(logicalPreview, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        logicalPreview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) {startPreview();}
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) {fitPreview();}
            @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) {}
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) {if(logicalRunning)stopPreview();return true;}
        });
        cameraFrame.addOnLayoutChangeListener((view,left,top,right,bottom,ol,ot,or,ob) -> {
            if (right-left!=or-ol || bottom-top!=ob-ot) fitPreview();
        });
        finder = new View(this) {
            private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

            @Override protected void onDraw(Canvas canvas) {
                float size = finderSize();
                float x = (getWidth() - size) / 2, y = (getHeight() - size) / 2;
                RectF target = new RectF(x, y, x + size, y + size);
                canvas.save();
                android.graphics.Path window = new android.graphics.Path();
                window.addRoundRect(target, dp(18), dp(18), android.graphics.Path.Direction.CW);
                canvas.clipOutPath(window);
                canvas.drawColor(0x99000000);
                canvas.restore();
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(dp(3));
                paint.setColor(0xffcabaff);
                canvas.drawRoundRect(target, dp(18), dp(18), paint);
            }
        };
        cameraFrame.addView(finder, new FrameLayout.LayoutParams(-1, -1));
        scannerImage = new ImageView(this);
        scannerImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        scannerImage.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        var imagePosition = new FrameLayout.LayoutParams(dp(88), dp(88), Gravity.BOTTOM | Gravity.END);
        imagePosition.setMargins(dp(10), dp(10), dp(14), dp(14));
        cameraFrame.addView(scannerImage, imagePosition);
        showScannerImage();
        ScaleGestureDetector pinch = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScaleBegin(ScaleGestureDetector detector) {
                if (logicalRunning) {pinchTarget = logicalCamera.zoom();return true;}
                if (zoomRatios == null) return false;
                pinchTarget = zoomRatios.get(zoomIndex);
                return true;
            }

            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (logicalRunning) {
                    pinchTarget = logicalCamera.range.clamp(pinchTarget * detector.getScaleFactor());
                    logicalCamera.zoom(pinchTarget);
                    return true;
                }
                if (zoomRatios == null || camera == null) return false;
                pinchTarget = Math.max(100, Math.min(zoomRatios.get(zoomRatios.size() - 1),
                    pinchTarget * detector.getScaleFactor()));
                int nearest = 0;
                for (int i = 1; i < zoomRatios.size(); i++) {
                    if (Math.abs(zoomRatios.get(i) - pinchTarget) < Math.abs(zoomRatios.get(nearest) - pinchTarget)) nearest = i;
                }
                applyZoom(nearest);
                return true;
            }
        });
        finder.setOnTouchListener((view, event) -> {
            pinch.onTouchEvent(event);
            return true;
        });
        root.addView(cameraFrame, new LinearLayout.LayoutParams(-1, 0, 1));

        hint = new TextView(this);
        hint.setText(INITIAL_HINT);
        hint.setGravity(Gravity.CENTER);
        hint.setTextColor(Color.WHITE);
        hint.setPadding(dp(16), dp(18), dp(16), dp(18));
        root.addView(hint, new LinearLayout.LayoutParams(-1, -2));
        permissionAction = new Button(this);
        permissionAction.setAllCaps(false);
        permissionAction.setText("Разрешить камеру");
        permissionAction.setVisibility(View.GONE);
        permissionAction.setOnClickListener(view -> {
            if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
            } else {
                startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getPackageName(), null)));
            }
        });
        root.addView(permissionAction, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
    }

    private void chooseScannerImage() {
        new AlertDialog.Builder(this).setTitle("Оформление сканера")
            .setItems(new String[]{"Выбрать картинку", "Убрать картинку"}, (dialog, which) -> {
                if (which == 1) {
                    saveScannerImage(null);
                    return;
                }
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*")
                    .addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(pick, PICK_SCANNER_IMAGE);
            }).show();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_SCANNER_IMAGE || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            saveScannerImage(uri);
        } catch (SecurityException ignored) {
            hint.setText("Не удалось открыть картинку");
        }
    }

    private void saveScannerImage(Uri uri) {
        var prefs = getSharedPreferences("orbita", MODE_PRIVATE);
        String previous = prefs.getString("scanner_image_uri", "");
        String next = uri == null ? "" : uri.toString();
        if (!previous.isEmpty() && !previous.equals(next)) {
            try {
                getContentResolver().releasePersistableUriPermission(Uri.parse(previous), Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {}
        }
        prefs.edit().putString("scanner_image_uri", next).apply();
        showScannerImage();
    }

    private void showScannerImage() {
        String saved = getSharedPreferences("orbita", MODE_PRIVATE).getString("scanner_image_uri", "");
        scannerImage.setImageDrawable(null);
        scannerImage.setVisibility(View.GONE);
        if (saved.isEmpty()) return;
        Uri uri = Uri.parse(saved);
        var options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try {
            try (var in = getContentResolver().openInputStream(uri)) {
                BitmapFactory.decodeStream(in, null, options);
            }
            if (options.outWidth <= 0 || options.outHeight <= 0) return;
            options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            try (var in = getContentResolver().openInputStream(uri)) {
                var bitmap = BitmapFactory.decodeStream(in, null, options);
                if (bitmap == null) return;
                scannerImage.setImageBitmap(bitmap);
                scannerImage.setVisibility(View.VISIBLE);
            }
        } catch (IOException | SecurityException ignored) {}
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        getSystemService(DisplayManager.class).registerDisplayListener(displayListener, null);
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            permissionAction.setVisibility(View.GONE);
        startPreview();
    }

    @Override protected void onPause() {
        resumed = false;
        getSystemService(DisplayManager.class).unregisterDisplayListener(displayListener);
        stopPreview();
        super.onPause();
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != CAMERA_PERMISSION) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            permissionAction.setVisibility(View.GONE);
            startPreview();
        } else {
            hint.setText("Для сканирования QR нужен доступ к камере.");
            permissionAction.setVisibility(View.VISIBLE);
        }
    }

    @Override public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
        startPreview();
    }

    @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}

    @Override public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
        stopPreview();
    }

    private void startPreview() {
        if (!resumed || scanAccepted || checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return;
        if (logicalCamera != null) {
            if (logicalRunning || !logicalPreview.isAvailable()) return;
            logicalRunning = true;
            fitPreview();
            logicalCamera.open(logicalPreview.getSurfaceTexture(), new ScannerLogicalCamera.Client() {
                @Override public void frame(byte[] data, int width, int height) {decodeFrame(data,width,height);}
                @Override public void failed() {
                    stopPreview();
                    logicalCamera = null;
                    logicalPreview.setVisibility(View.GONE);
                    preview.setVisibility(View.VISIBLE);
                    cameraSwitch.setVisibility(rearCameras.size()>1 ? View.VISIBLE : View.GONE);
                    updateCameraLabel();
                    startPreview();
                }
            });
            return;
        }
        if (!surfaceReady || camera != null) return;
        if (rearCameras.isEmpty()) {
            hint.setText("На устройстве нет задней камеры");
            return;
        }
        int rear = rearCameras.get(selectedCamera);
        Camera.CameraInfo info = new Camera.CameraInfo();
        Camera.getCameraInfo(rear, info);
        try {
            camera = Camera.open(rear);
            Camera.Parameters parameters = camera.getParameters();
            List<Camera.Size> sizes = parameters.getSupportedPreviewSizes();
            Camera.Size size = parameters.getPreviewSize();
            long distance = Long.MAX_VALUE;
            for (Camera.Size candidate : sizes) {
                long next = Math.abs((long) candidate.width * candidate.height - 640L * 480);
                if (next >= distance) continue;
                size = candidate;
                distance = next;
            }
            parameters.setPreviewSize(size.width, size.height);
            if (parameters.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))
                parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            camera.setParameters(parameters);
            frameSize = size;
            rotatedPreview = info.orientation % 180 != 0;
            fitPreview();
            camera.setDisplayOrientation(info.orientation);
            zoomRatios = parameters.isZoomSupported() ? parameters.getZoomRatios() : null;
            zoomIndex = zoomRatios == null ? 0 : parameters.getZoom();
            camera.setPreviewDisplay(preview.getHolder());
            camera.startPreview();
            hint.setText(INITIAL_HINT);
            camera.setOneShotPreviewCallback(this::scanFrame);
        } catch (IOException | RuntimeException error) {
            stopPreview();
            hint.setText("Камеру не удалось открыть. Закрой другие приложения, использующие камеру.");
        }
    }

    private void fitPreview() {
        if (cameraFrame == null || cameraFrame.getWidth() <= 0 || cameraFrame.getHeight() <= 0) return;
        if (logicalCamera == null) {
            if (frameSize == null) return;
            var size = ScannerPreviewGeometry.cover(frameSize.width, frameSize.height,
                cameraFrame.getWidth(), cameraFrame.getHeight(), rotatedPreview);
            displayedWidth = size.width();
            displayedHeight = size.height();
            preview.setLayoutParams(new FrameLayout.LayoutParams(displayedWidth, displayedHeight, Gravity.CENTER));
            return;
        }

        int width = logicalPreview.getWidth(), height = logicalPreview.getHeight();
        var display = logicalPreview.getDisplay();
        if (width <= 0 || height <= 0 || display == null) return;
        int displayDegrees = switch (display.getRotation()) {
            case Surface.ROTATION_90 -> 90;
            case Surface.ROTATION_180 -> 180;
            case Surface.ROTATION_270 -> 270;
            default -> 0;
        };
        var frame = logicalCamera.frameSize;
        logicalTransform = ScannerPreviewGeometry.textureTransform(frame.getWidth(), frame.getHeight(),
            width, height, logicalCamera.orientation, displayDegrees);
        Matrix matrix = new Matrix();
        matrix.setScale(logicalTransform.scaleX(), logicalTransform.scaleY(), width / 2f, height / 2f);
        matrix.postRotate(logicalTransform.rotation(), width / 2f, height / 2f);
        logicalPreview.setTransform(matrix);
    }

    private void switchCamera() {
        if (logicalCamera != null) {
            float wide = logicalCamera.range.getLower();
            float current = logicalCamera.zoom();
            float next = current < 0.95f ? 1 : current < 1.95f && logicalCamera.range.getUpper() >= 2
                ? 2 : wide < 1 ? wide : 1;
            logicalCamera.zoom(next);
            updateCameraLabel();
            return;
        }
        if (rearCameras.size() < 2) return;
        int previous = selectedCamera;
        selectedCamera = (selectedCamera + 1) % rearCameras.size();
        stopPreview();
        startPreview();
        if (camera == null && resumed && surfaceReady
            && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            selectedCamera = previous;
            startPreview();
            hint.setText("Этот модуль камеры сейчас недоступен");
        }
        updateCameraLabel();
    }

    private void updateCameraLabel() {
        if (logicalCamera != null) {
            cameraSwitch.setText(logicalCamera.zoom() < 1 ? "Широкая" : logicalCamera.zoom() >= 2 ? "Дальняя" : "Основная");
        } else {
            cameraSwitch.setText("Камера " + (selectedCamera + 1) + "/" + rearCameras.size());
        }
    }

    private void applyZoom(int index) {
        if (camera == null || zoomIndex == index) return;
        try {
            Camera.Parameters settings = camera.getParameters();
            settings.setZoom(index);
            camera.setParameters(settings);
            zoomIndex = index;
        } catch (RuntimeException ignored) {}
    }

    private void scanFrame(byte[] data, Camera source) {
        if (camera != source) return;
        decodeFrame(data,frameSize.width,frameSize.height);
        preview.postDelayed(() -> {
            if (camera == source) source.setOneShotPreviewCallback(this::scanFrame);
        }, 130);
    }

    private void decodeFrame(byte[] data, int width, int height) {
        if (!resumed || scanAccepted) return;
        boolean geometryReady = logicalRunning ? logicalTransform != null : displayedWidth > 0 && displayedHeight > 0;
        if (data != null && data.length >= width * height && geometryReady) {
            try {
                float target = finderSize();
                var crop = logicalRunning ? logicalTransform.crop(width, height, target)
                    : ScannerPreviewGeometry.crop(width,height,
                    new ScannerPreviewGeometry.Size(displayedWidth,displayedHeight),target,rotatedPreview);
                int cropWidth = crop.width(), cropHeight = crop.height();
                var frame = new PlanarYUVLuminanceSource(data, width, height,
                    (width - cropWidth) / 2, (height - cropHeight) / 2, cropWidth, cropHeight, false);
                String decoded = reader.decode(new BinaryBitmap(new HybridBinarizer(frame))).getText();
                Uri link = Uri.parse(decoded);
                if (PulseGradesActivity.isAttendanceLink(link)) {
                    scanAccepted = true;
                    stopPreview();
                    startActivity(new Intent(this, PulseGradesActivity.class)
                        .setData(link)
                        .putExtra("background", getIntent().getIntExtra("background", 0xff171922)));
                    finish();
                    return;
                }
                hint.setText("Нужен QR-код посещения Пульса МИРЭА");
            } catch (ReaderException ignored) {
                // The next frame may have a readable code.
            }
        }
    }

    private void stopPreview() {
        if (logicalCamera != null && logicalRunning) logicalCamera.close();
        logicalRunning = false;
        logicalTransform = null;
        Camera active = camera;
        camera = null;
        if (active != null) active.release();
    }

    private float finderSize() {
        return Math.min(dp(300), Math.min(finder.getWidth(), finder.getHeight()) * .74f);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
