package de.timelytix.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Weggewischt oder Handy neu gestartet: Anzeige „Zeit läuft“ wieder zeigen, solange die Zeit läuft. */
public class RunningNoticeReceiver extends BroadcastReceiver {
    static final String ACTION_DISMISSED = "de.timelytix.app.RUNNING_NOTICE_DISMISSED";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_DISMISSED.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            RunningNotice.restore(context);
        }
    }
}
