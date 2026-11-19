// File Name: frontend/android/app/src/main/java/com/studentconnect/app/NotificationActionReceiver.java

package com.studentconnect.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NotificationActionReceiver";

    public static final String ACTION_NOTIFICATION_DISMISSED =
        "com.studentconnect.app.NOTIFICATION_DISMISSED";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "NotificationActionReceiver action: " + action);

        if (ACTION_NOTIFICATION_DISMISSED.equals(action)) {
            // ✅ Notification swipe/dismiss হলে ringtone বন্ধ
            Log.d(TAG, "Notification dismissed — stopping ringtone");
            MyFirebaseMessagingService.stopRingtoneFromOutside(context);
        }
    }
}
