package ru.mirea.orbita;

import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

final class CompletionFeedback {
    private CompletionFeedback() {}

    static boolean allowed(Context context) {
        try {
            JSONObject state = new JSONObject(context.getSharedPreferences("orbita", Context.MODE_PRIVATE).getString("state", "{}"));
            JSONObject effects = state.optJSONObject("completionEffects");
            if (effects != null && !effects.optBoolean("sound", true)) return false;
            AudioManager audio = (AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
            NotificationManager notifications = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            return audio != null && audio.getRingerMode() == AudioManager.RINGER_MODE_NORMAL
                && audio.getStreamVolume(AudioManager.STREAM_SYSTEM) > 0
                && notifications.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL;
        } catch (Exception unavailable) {
            return false;
        }
    }

    static void play(Context context) {
        if (!allowed(context)) return;
        MediaPlayer player = new MediaPlayer();
        try {
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            try (android.content.res.AssetFileDescriptor sound = context.getResources().openRawResourceFd(R.raw.task_ding)) {
                player.setDataSource(sound.getFileDescriptor(),sound.getStartOffset(),sound.getLength());
            }
            player.setVolume(.65f,.65f);
            player.prepare();
            player.start();
            new Handler(Looper.getMainLooper()).postDelayed(player::release, 800);
        } catch (Exception unavailable) {
            player.release();
        }
    }
}
