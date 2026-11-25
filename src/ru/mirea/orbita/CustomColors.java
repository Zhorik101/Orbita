package ru.mirea.orbita;

import android.graphics.Color;

final class CustomColors {
    private CustomColors() {}

    static int mix(int from, int to, double amount) {
        return Color.rgb(
            (int) Math.round(Color.red(from) * (1 - amount) + Color.red(to) * amount),
            (int) Math.round(Color.green(from) * (1 - amount) + Color.green(to) * amount),
            (int) Math.round(Color.blue(from) * (1 - amount) + Color.blue(to) * amount)
        );
    }

    static int background(int color) {
        int max = Math.max(Color.red(color), Math.max(Color.green(color), Color.blue(color)));
        int min = Math.min(Color.red(color), Math.min(Color.green(color), Color.blue(color)));
        float luminance = Color.luminance(color);
        double amount = Math.max(Math.max(0, (max - min - 96) / 180.0),
            luminance > .09 && luminance < .48 ? .65 : 0);
        return mix(color, luminance < .179 ? 0xff101218 : 0xfff5f6fa, amount);
    }

    static int panel(int background) {
        return mix(background, Color.WHITE, Color.luminance(background) < .179 ? .10 : .60);
    }

    static int accent(int color, int background, int panel) {
        int text = Color.luminance(background) < .179 ? Color.WHITE : 0xff111318;
        for (int i = 0; i < 12 && (contrast(color, background) < 4.5 || contrast(color, panel) < 4.5); i++) {
            color = mix(color, text, .2);
        }
        return color;
    }

    private static double contrast(int first, int second) {
        float a = Color.luminance(first), b = Color.luminance(second);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }
}
