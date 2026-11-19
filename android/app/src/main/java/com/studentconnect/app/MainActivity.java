// File Name: frontend/android/app/src/main/java/com/studentconnect/app/MainActivity.java

package com.studentconnect.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RingtonePlugin.class);
        super.onCreate(savedInstanceState);
        Log.d(TAG, "MainActivity onCreate");

        startKeepAliveService();
        handleIntentExtras(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntentExtras(intent);
    }

    private void handleIntentExtras(Intent intent) {
        if (intent == null) return;

        String type = intent.getStringExtra("type");
        if ("incoming_call".equals(type)) {
            boolean autoAccept = intent.getBooleanExtra("autoAccept", false);
            String roomId = intent.getStringExtra("roomId");
            String callerName = intent.getStringExtra("callerName");
            String callType = intent.getStringExtra("callType");

            Log.d(TAG, "Incoming call intent — autoAccept: " + autoAccept
                + ", roomId: " + roomId
                + ", callerName: " + callerName
                + ", callType: " + callType);

            // ✅ Ringtone stop — JS side trigger (GlobalAlerts listener)
            MyFirebaseMessagingService.stopRingtoneFromOutside(getApplicationContext());

            // ✅ JS side এ event dispatch
            final String jsCode =
                "window.dispatchEvent(new CustomEvent('native-call-accept', {" +
                "  detail: {" +
                "    roomId: '" + (roomId != null ? roomId : "") + "'," +
                "    callerName: '" + (callerName != null ? callerName : "") + "'," +
                "    callType: '" + (callType != null ? callType : "audio") + "'" +
                "  }" +
                "}));";

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(jsCode, null);
                });
            }
        }
    }

    private void startKeepAliveService() {
        try {
            Intent serviceIntent = new Intent(this, KeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            Log.d(TAG, "KeepAliveService started");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start KeepAliveService: " + e.getMessage());
        }
    }
}
