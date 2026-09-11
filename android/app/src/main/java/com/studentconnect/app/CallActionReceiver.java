// File Name: frontend/android/app/src/main/java/com/studentconnect/app/CallActionReceiver.java

package com.studentconnect.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class CallActionReceiver extends BroadcastReceiver {
    private static final String TAG = "CallActionReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "CallActionReceiver action: " + action);

        // ✅ যেকোনো action-এ ringtone + notification বন্ধ
        MyFirebaseMessagingService.stopRingtoneFromOutside(context);

        if (MyFirebaseMessagingService.ACTION_ACCEPT_CALL.equals(action)) {
            String roomId = intent.getStringExtra("roomId");
            String callerName = intent.getStringExtra("callerName");
            String callType = intent.getStringExtra("callType");

            Log.d(TAG, "Accept pressed — opening app with roomId: " + roomId);

            Intent openApp = new Intent(context, MainActivity.class);
            openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            openApp.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            openApp.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            openApp.putExtra("type", "incoming_call");
            openApp.putExtra("roomId", roomId);
            openApp.putExtra("callerName", callerName);
            openApp.putExtra("callType", callType);
            openApp.putExtra("autoAccept", true);
            context.startActivity(openApp);
        } else if (MyFirebaseMessagingService.ACTION_DECLINE_CALL.equals(action)) {
            Log.d(TAG, "Decline pressed — call rejected");
        }
    }
}
