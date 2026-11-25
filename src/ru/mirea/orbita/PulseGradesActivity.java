package ru.mirea.orbita;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;

public final class PulseGradesActivity extends Activity {
    private static final Uri PULSE = Uri.parse(MireaAcademicApi.ORIGIN);
    private final java.util.concurrent.ExecutorService network = Executors.newSingleThreadExecutor();
    private LinearLayout body;
    private WebView loginWeb;
    private Uri attendanceLink;
    private boolean accountScreen;
    private int background, foreground, accent, panel;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        attendanceLink = isAttendanceLink(getIntent().getData()) ? getIntent().getData() : null;
        accountScreen = getIntent().getBooleanExtra("account", false);
        background = getIntent().getIntExtra("background", 0xff171922);
        boolean light = Color.luminance(background) >= .179;
        foreground = light ? Color.BLACK : Color.WHITE;
        accent = light ? 0xff493095 : 0xffcabaff;
        panel = CustomColors.panel(background);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        getWindow().getDecorView().setSystemUiVisibility(light
            ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
        var root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(background);
        Button back = button("‹", this::finish);
        back.setContentDescription("Назад");
        var toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(48), dp(54)));
        toolbar.addView(label(attendanceLink != null ? "Посещение" : accountScreen ? "Учётная запись МИРЭА" : "Баллы БРС", 20, true));
        root.addView(toolbar);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        showContent();
    }

    private void showContent() {
        String cookie = session();
        if (!hasSession(cookie)) {
            showSignIn("Войди через МИРЭА, чтобы получить данные своего аккаунта.");
            return;
        }
        if (attendanceLink != null) {
            message("Подтверди личную отметку по отсканированному QR-коду.",
                "Отметить посещение", () -> submitAttendance(session()));
        } else if (accountScreen) {
            message("Сессия МИРЭА доступна на этом устройстве.", "Готово", this::finish);
        } else {
            loadGrades(cookie);
        }
    }

    private String session() {
        String value = CookieManager.getInstance().getCookie(MireaAcademicApi.ORIGIN + "/");
        return value == null ? "" : value;
    }

    static boolean hasSession(String cookie) {
        for (String item : cookie.split(";")) {
            if (item.trim().matches("Pulse\\.Auth\\.Cookie(?:C[0-9]+)?=.+")) return true;
        }
        return false;
    }

    private void showSignIn(String reason) {
        message(reason, "Войти через МИРЭА", this::startSignIn);
    }

    private void startSignIn() {
        clearBody();
        TextView status = label("Открываем вход МИРЭА…", 15, false);
        status.setPadding(dp(20), dp(15), dp(20), dp(15));
        body.addView(status);
        loginWeb = new WebView(this);
        loginWeb.getSettings().setJavaScriptEnabled(true);
        loginWeb.getSettings().setDomStorageEnabled(true);
        loginWeb.getSettings().setAllowFileAccess(false);
        loginWeb.getSettings().setAllowContentAccess(false);
        loginWeb.setVisibility(View.INVISIBLE);
        loginWeb.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !isUniversityOrigin(request.getUrl());
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                // Only the university's login form is visible. The callback is handled internally.
                boolean form = !PULSE.getHost().equals(Uri.parse(url).getHost()) && isUniversityOrigin(Uri.parse(url));
                view.setVisibility(form ? View.VISIBLE : View.INVISIBLE);
                status.setVisibility(form ? View.GONE : View.VISIBLE);
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (view != loginWeb || !PULSE.getHost().equals(Uri.parse(url).getHost())) return;
                if (hasSession(session())) {
                    CookieManager.getInstance().flush();
                    showContent();
                } else if ("/".equals(Uri.parse(url).getPath())) {
                    showSignIn("Вход не завершился. Попробуй снова.");
                }
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && view == loginWeb) showSignIn("Не удалось открыть вход МИРЭА.");
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                if (request.isForMainFrame() && view == loginWeb) showSignIn("МИРЭА вернула ошибку входа " + error.getStatusCode() + ".");
            }
        });
        body.addView(loginWeb, new LinearLayout.LayoutParams(-1, 0, 1));
        String loginUrl = PULSE.buildUpon().path("/api/auth/login")
            .appendQueryParameter("redirectUri", MireaAcademicApi.ORIGIN + "/")
            .appendQueryParameter("rememberMe", "True").build().toString();
        loginWeb.loadUrl(loginUrl);
    }

    private void loadGrades(String cookie) {
        message("Загружаем баллы…", null, null);
        network.execute(() -> {
            try {
                List<MireaAcademicApi.Course> courses = new MireaAcademicApi(cookie).grades();
                onScreen(() -> showGrades(courses));
            } catch (MireaAcademicApi.SignInRequired error) {
                onScreen(() -> showSignIn("Для загрузки баллов нужно войти заново."));
            } catch (Exception error) {
                onScreen(() -> message(failure(error), "Повторить", this::showContent));
            }
        });
    }

    private void submitAttendance(String cookie) {
        message("Отправляем личную отметку…", null, null);
        network.execute(() -> {
            try {
                boolean marked = new MireaAcademicApi(cookie).markAttendance(attendanceLink.getQueryParameter("token"));
                if (marked) getSharedPreferences("orbita", MODE_PRIVATE).edit()
                    .putLong("mirea_attendance_revision", System.currentTimeMillis()).apply();
                onScreen(() -> message(marked ? "Посещение отмечено." : "МИРЭА не подтвердила отметку. Проверь, что код ещё действует.", "Закрыть", this::finish));
            } catch (MireaAcademicApi.SignInRequired error) {
                onScreen(() -> showSignIn("Для отметки нужно войти в МИРЭА."));
            } catch (Exception error) {
                onScreen(() -> message(failure(error), "Закрыть", this::finish));
            }
        });
    }

    private static String failure(Exception error) {
        if (error instanceof java.net.SocketTimeoutException) return "МИРЭА не ответила вовремя.";
        String message = error.getMessage();
        if (message != null && message.startsWith("МИРЭА ")) return message;
        return "Не удалось получить ответ МИРЭА.";
    }

    private void showGrades(List<MireaAcademicApi.Course> courses) {
        if (courses.isEmpty()) {
            message("МИРЭА пока не вернула баллы по дисциплинам.", "Обновить", this::showContent);
            return;
        }
        int term = courses.stream().mapToInt(MireaAcademicApi.Course::term).max().orElse(0);
        clearBody();
        var scroll = new ScrollView(this);
        var list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(18), dp(10), dp(18), dp(20));
        if (term > 0) list.addView(label(term + " семестр", 16, true));
        list.addView(button("Обновить баллы", this::showContent));
        NumberFormat numbers = NumberFormat.getNumberInstance(Locale.forLanguageTag("ru-RU"));
        numbers.setMaximumFractionDigits(2);
        courses.stream().filter(course -> term == 0 || course.term() == term)
            .sorted(java.util.Comparator.comparing(MireaAcademicApi.Course::name))
            .forEach(course -> {
                var card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.setPadding(dp(17), dp(14), dp(17), dp(14));
                GradientDrawable shape = new GradientDrawable();
                shape.setCornerRadius(dp(19));
                shape.setColor(panel);
                card.setBackground(shape);
                card.addView(label(course.name(), 16, true));
                String points = course.total() == null ? "Баллы ещё не выставлены" : numbers.format(course.total()) + " балла";
                if (course.total() != null && course.maximum() != null) points = numbers.format(course.total()) + " из " + numbers.format(course.maximum());
                TextView score = label(points, 23, true);
                score.setTextColor(accent);
                score.setPadding(0, dp(8), 0, 0);
                card.addView(score);
                if (course.attendance() != null) card.addView(label("За посещение: " + numbers.format(course.attendance()), 13, false));
                var position = new LinearLayout.LayoutParams(-1, -2);
                position.bottomMargin = dp(10);
                list.addView(card, position);
            });
        scroll.addView(list);
        body.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
    }

    private void message(String text, String action, Runnable next) {
        clearBody();
        var box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(18), dp(20), dp(12));
        box.addView(label(text, 16, false));
        if (next != null) box.addView(button(action, next));
        body.addView(box);
    }

    private void clearBody() {
        WebView previous = loginWeb;
        loginWeb = null;
        body.removeAllViews();
        if (previous != null) {
            previous.stopLoading();
            previous.destroy();
        }
    }

    private void onScreen(Runnable update) {
        runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed()) update.run();
        });
    }

    private Button button(String text, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextColor(accent);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private TextView label(String text, int size, boolean bold) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(size);
        label.setTextColor(foreground);
        if (bold) label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return label;
    }

    static boolean isAttendanceLink(Uri url) {
        return url != null && isUniversityOrigin(url) && PULSE.getHost().equals(url.getHost())
            && "/selfapprove".equals(url.getEncodedPath()) && url.getFragment() == null
            && url.getEncodedQuery() != null
            && url.getEncodedQuery().matches("token=[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    }

    private static boolean isUniversityOrigin(Uri url) {
        if (!"https".equals(url.getScheme()) || url.getUserInfo() != null || url.getPort() != -1) return false;
        String host = url.getHost();
        return PULSE.getHost().equals(host) || "login.mirea.ru".equals(host) || "sso.mirea.ru".equals(host);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override protected void onDestroy() {
        clearBody();
        network.shutdownNow();
        super.onDestroy();
    }
}
