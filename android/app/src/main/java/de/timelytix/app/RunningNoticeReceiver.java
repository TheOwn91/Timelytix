package de.timelytix.app;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Weggewischt oder Handy neu gestartet: Anzeige „Zeit läuft“ wieder zeigen, solange die Zeit läuft. */
public class RunningNoticeReceiver extends BroadcastReceiver {
    static final String ACTION_DISMISSED = "de.timelytix.app.RUNNING_NOTICE_DISMISSED";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ForgotReminder.ACTION.equals(action)) {
            ForgotReminder.onAlarm(context, intent);
            return;
        }
        // „Wecker und Erinnerungen“ erlaubt bzw. entzogen: Wecker von Widget und Erinnerung neu stellen
        if (AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
            TimeWidgetProvider.updateAll(context);
            ForgotReminder.reschedule(context);
            return;
        }
        if (ACTION_DISMISSED.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            RunningNotice.restore(context);
        }
        // Neustart bzw. Update: Wecker sind weg – Erinnerung einer im Widget gestarteten Zeit neu einplanen
        // (hat die App übernommen, stellt das Plugin seine eigene wieder her und diese bleibt still)
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ForgotReminder.schedule(context, WidgetState.load(context));
        }
    }
}
