package ru.mirea.orbita;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.WindowManager;
import java.util.Random;
import org.json.JSONObject;

/** A launcher tap can briefly show this transparent activity above the desktop. */
public class WidgetCelebrationActivity extends Activity {
    static boolean shouldCelebrate(JSONObject state, JSONObject task) {
        JSONObject effects = state.optJSONObject("completionEffects");
        return task.optBoolean("major", "Курсовая".equals(task.optString("kind")))
            && (effects == null || effects.optBoolean("confetti", true))
            && android.animation.ValueAnimator.areAnimatorsEnabled();
    }

    @Override protected void onCreate(Bundle restored) {
        super.onCreate(restored);
        if (restored != null) { finish(); return; }
        SharedPreferences prefs = getSharedPreferences("orbita", MODE_PRIVATE);
        String id = getIntent().getStringExtra("workId");
        boolean celebrate = false;
        try {
            JSONObject state = new JSONObject(WidgetTasks.read(prefs));
            JSONObject task = WidgetTasks.find(state, id);
            celebrate = task != null && shouldCelebrate(state, task);
        } catch (org.json.JSONException ignored) {}
        if (!WidgetTasks.act(prefs, id, getIntent().getLongExtra(WidgetTasks.REVISION, -1), true)) {
            OrbitWidget.updateAll(this);
            finish();
            return;
        }
        CompletionFeedback.play(this);
        OrbitWidget.updateAll(this);
        if (!celebrate) { finish(); return; }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
        View view = new Confetti(this);
        setContentView(view);
        view.postDelayed(this::finish, 1250);
    }

    private static final class Confetti extends View {
        private static final int[] COLORS = {0xffa9c4ff, 0xfff39cc4, 0xfff6d66e, 0xff7cdbb8};
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final long started = SystemClock.uptimeMillis();
        private final float[][] particles = new float[55][4];

        Confetti(Context context) {
            super(context);
            Random random = new Random();
            for (float[] piece : particles) {
                piece[0] = (random.nextFloat() - .5f) * 1.4f;
                piece[1] = -.36f - random.nextFloat() * .35f;
                piece[2] = random.nextFloat() * 360;
                piece[3] = (random.nextFloat() - .5f) * 620;
            }
        }

        @Override protected void onDraw(Canvas canvas) {
            float t = (SystemClock.uptimeMillis() - started) / 1000f;
            if (t >= 1.25f) return;
            float density = getResources().getDisplayMetrics().density;
            for (int i = 0; i < particles.length; i++) {
                float[] piece = particles[i];
                canvas.save();
                canvas.translate(getWidth() * (.5f + piece[0] * t),
                    getHeight() * (.53f + piece[1] * t + .55f * t * t));
                canvas.rotate(piece[2] + piece[3] * t);
                paint.setColor(COLORS[i % COLORS.length]);
                paint.setAlpha((int)(255 * Math.min(1, (1.25f - t) * 3)));
                canvas.drawRect(-3 * density, -5 * density, 3 * density, 5 * density, paint);
                canvas.restore();
            }
            postInvalidateOnAnimation();
        }
    }
}
