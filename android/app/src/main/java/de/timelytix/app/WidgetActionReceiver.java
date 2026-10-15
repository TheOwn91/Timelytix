package de.timelytix.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Knöpfe in Widget und Benachrichtigung, die ohne Rückfrage wirken (Start, Pause, Weiter). */
public class WidgetActionReceiver extends BroadcastReceiver {
    static final String ACTION = "de.timelytix.app.WIDGET_ACTION";
    private static final String EXTRA_TYPE = "type";
    private static final String EXTRA_PROJECT = "projectId";

    static PendingIntent pending(Context context, String type, String projectId) {
        Intent i = new Intent(context, WidgetActionReceiver.class)
            .setAction(ACTION + "." + type)
            .putExtra(EXTRA_TYPE, type);
        if (projectId != null) i.putExtra(EXTRA_PROJECT, projectId);
        return PendingIntent.getBroadcast(context, type.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String type = intent.getStringExtra(EXTRA_TYPE);
        if (type == null || WidgetActions.STOP.equals(type)) return;
        WidgetActions.perform(context, type, intent.getStringExtra(EXTRA_PROJECT));
    }
}
