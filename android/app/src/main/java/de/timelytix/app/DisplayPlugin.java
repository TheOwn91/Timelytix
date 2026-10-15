package de.timelytix.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Schriftgröße aus den Android-Einstellungen (1.0 = Standard) für die Anzeigegröße der App (src/lib/uiScale.ts). */
@CapacitorPlugin(name = "TimelytixDisplay")
public class DisplayPlugin extends Plugin {
    @PluginMethod
    public void fontScale(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("fontScale", (double) getContext().getResources().getConfiguration().fontScale);
        call.resolve(ret);
    }
}
