package de.timelytix.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Brücke zur Web-App (src/lib/native.ts): Anzeige „Zeit läuft“ zeigen, entfernen, abfragen. */
@CapacitorPlugin(name = "RunningNotice")
public class RunningNoticePlugin extends Plugin {
    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getString("title", "Timelytix");
        String body = call.getString("body", "");
        RunningNotice.show(getContext(), title, body, Boolean.TRUE.equals(call.getBoolean("quiet", false)));
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        RunningNotice.hide(getContext());
        call.resolve();
    }

    @PluginMethod
    public void isShown(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("shown", RunningNotice.isShown(getContext()));
        call.resolve(ret);
    }
}
