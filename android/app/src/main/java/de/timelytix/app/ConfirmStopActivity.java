package de.timelytix.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

/** Rückfrage „Zeit beenden?“ als kleines Fenster über dem Startbildschirm (aus Widget und Benachrichtigung). */
public class ConfirmStopActivity extends AppCompatActivity {
    static PendingIntent pending(Context context) {
        Intent i = new Intent(context, ConfirmStopActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(context, 10, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WidgetState s = WidgetState.load(this);
        if (s == null || s.running == null) {
            finish();
            return;
        }
        WidgetState.Project p = s.project(s.running.projectId);
        long net = s.netMs(System.currentTimeMillis()) / 60000;
        String detail = (p != null ? p.name + " · " : "") + "seit " + WidgetState.fmtTime(s.running.start)
            + String.format(java.util.Locale.GERMANY, " · %d:%02d h gearbeitet", net / 60, net % 60);
        new AlertDialog.Builder(this)
            .setTitle("Zeit beenden?")
            .setMessage(detail)
            .setNegativeButton("Abbrechen", null)
            .setPositiveButton("Beenden", (d, w) -> WidgetActions.perform(this, WidgetActions.STOP, null))
            .setOnDismissListener(d -> finish())
            .show();
    }
}
