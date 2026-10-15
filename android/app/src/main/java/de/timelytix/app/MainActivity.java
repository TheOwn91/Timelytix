package de.timelytix.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RunningNoticePlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(DisplayPlugin.class);
        super.onCreate(savedInstanceState);
        // Die WebView vergrößert bei großer Systemschrift sonst nur den Text (Kästen und Abstände bleiben gleich –
        // alles wirkt gequetscht). Stattdessen skaliert die App die ganze Oberfläche gleichmäßig (src/lib/uiScale.ts).
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
