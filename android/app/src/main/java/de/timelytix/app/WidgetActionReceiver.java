package de.timelytix.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Knöpfe in Widget und Benachrichtigung: Start, Pause, Weiter, Beenden. */
public class WidgetActionReceiver extends BroadcastReceiver {
    static final String ACTION = "de.timelytix.app.WIDGET_ACTION";
    private static final String EXTRA_TYPE = "type";

    static PendingIntent pending(Context context, String type) {
        Intent i = new Intent(context, WidgetActionReceiver.class)
            .setAction(ACTION + "." + type)
            .putExtra(EXTRA_TYPE, type);
        return PendingIntent.getBroadcast(context, type.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String type = intent.getStringExtra(EXTRA_TYPE);
        if (type == null) return;
        WidgetActions.perform(context, type, null);
    }
}
