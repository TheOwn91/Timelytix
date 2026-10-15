package de.timelytix.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Brücke zur Web-App (src/lib/widget.ts): Auszug fürs Widget ablegen, gemerkte Aktionen abholen. */
@CapacitorPlugin(name = "TimelytixWidget")
public class WidgetPlugin extends Plugin {
    private static volatile WidgetPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    /** Aktion aus Widget/Benachrichtigung: die geöffnete App holt sie sofort ab. */
    static void onNativeAction() {
        WidgetPlugin p = instance;
        if (p != null) p.notifyListeners("actions", new JSObject());
    }

    @PluginMethod
    public void sync(PluginCall call) {
        String snapshot = call.getString("snapshot");
        boolean changed = snapshot != null && WidgetState.saveFromApp(getContext(), snapshot);
        // Nur neu zeichnen, wenn sich etwas geändert hat (die App legt den Auszug bei jeder Änderung ab)
        if (changed) TimeWidgetProvider.updateAll(getContext());
        JSObject ret = new JSObject();
        ret.put("changed", changed);
        call.resolve(ret);
    }

    @PluginMethod
    public void takeActions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("actions", WidgetState.takeActions(getContext()));
        call.resolve(ret);
    }
}
