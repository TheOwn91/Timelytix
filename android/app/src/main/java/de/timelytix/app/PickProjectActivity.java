package de.timelytix.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

/** Arbeitgeber fürs Widget wählen (kleines Fenster, archivierte fehlen schon im Auszug der App). */
public class PickProjectActivity extends AppCompatActivity {
    private AlertDialog dialog;

    static PendingIntent pending(Context context) {
        Intent i = new Intent(context, PickProjectActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(context, 11, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WidgetState s = WidgetState.load(this);
        if (s == null || s.running != null || s.projects.isEmpty()) {
            finish();
            return;
        }
        String[] names = new String[s.projects.size()];
        int checked = -1;
        WidgetState.Project shown = s.shown();
        for (int i = 0; i < names.length; i++) {
            WidgetState.Project p = s.projects.get(i);
            names[i] = p.name.isEmpty() ? "Ohne Namen" : p.name;
            if (shown != null && p.id.equals(shown.id)) checked = i;
        }
        dialog = new AlertDialog.Builder(this)
            .setTitle("Arbeitgeber wählen")
            .setSingleChoiceItems(names, checked, (d, which) -> {
                WidgetActions.perform(this, WidgetActions.SELECT, s.projects.get(which).id);
                d.dismiss();
            })
            .setNegativeButton("Abbrechen", null)
            .setOnDismissListener(d -> finish())
            .show();
    }

    @Override
    protected void onDestroy() {
        // z. B. beim Drehen: Fenster schließen, statt es zurückzulassen
        if (dialog != null) {
            dialog.setOnDismissListener(null);
            dialog.dismiss();
        }
        super.onDestroy();
    }
}
