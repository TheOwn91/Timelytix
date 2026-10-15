package de.timelytix.app;

import android.content.res.Resources;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Farben vom Hintergrundbild (Material You, ab Android 12): die Farbpaletten des Systems für die Web-App
 * (src/lib/theme.ts), z. B. „accent1_600“ → „#3f5f90“.
 */
@CapacitorPlugin(name = "TimelytixTheme")
public class ThemePlugin extends Plugin {
    private static final String[] PALETTES = { "accent1", "accent2", "neutral1", "neutral2" };
    private static final int[] TONES = { 0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 };

    @PluginMethod
    public void colors(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        ret.put("available", available);
        if (available) {
            Resources system = Resources.getSystem();
            for (String palette : PALETTES) {
                for (int tone : TONES) {
                    String name = "system_" + palette + "_" + tone;
                    int id = system.getIdentifier(name, "color", "android");
                    if (id == 0) continue;
                    int color = getContext().getColor(id);
                    ret.put(palette + "_" + tone, String.format("#%06x", color & 0xffffff));
                }
            }
        }
        call.resolve(ret);
    }
}
