// File Name: frontend/android/app/src/main/java/com/studentconnect/app/MyFirebaseMessagingService.java

package com.studentconnect.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "FCMService";
    private static final String CHANNEL_ID = "call_channel_v2";
    private static final String MESSAGE_CHANNEL_ID = "message_channel";

    // ✅ Action constants — CallActionReceiver এর সাথে match করতে হবে
    public static final String ACTION_ACCEPT_CALL = "com.studentconnect.app.ACCEPT_CALL";
    public static final String ACTION_DECLINE_CALL = "com.studentconnect.app.DECLINE_CALL";

    private static Ringtone activeRingtone = null;
    private static Handler ringtoneHandler = null;
    private static NotificationManager staticNotificationManager = null;
    private static int lastNotificationId = 1001;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "From: " + remoteMessage.getFrom());

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        Log.d(TAG, "Message type: " + type);

        // ✅ Cancel call — ringtone + notification stop
        if ("cancel_call".equals(type)) {
            Log.d(TAG, "Cancel call received — stopping ringtone");
            stopRingtoneFromOutside(getApplicationContext());
            return;
        }

        String title = remoteMessage.getNotification() != null ?
            remoteMessage.getNotification().getTitle() : "Student Connect";
        String body = remoteMessage.getNotification() != null ?
            remoteMessage.getNotification().getBody() : "";

        if (data.get("title") != null) title = data.get("title");
        if (data.get("body") != null) body = data.get("body");

        // ✅ Call হলে Native ringtone + full screen notification
        if ("incoming_call".equals(type) || "global_call".equals(type)) {
            playRingtone();
            showCallNotification(title, body, data);
            return;
        }

        // ✅ Normal message হলে simple notification
        showMessageNotification(title, body, data);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed token: " + token);
    }

    public static void stopRingtoneFromOutside(Context context) {
        Log.d(TAG, "stopRingtoneFromOutside called");
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
                Log.d(TAG, "Native ringtone stopped");
            }
            activeRingtone = null;
            if (ringtoneHandler != null) {
                ringtoneHandler.removeCallbacksAndMessages(null);
                ringtoneHandler = null;
            }

            NotificationManager nm = null;
            if (staticNotificationManager != null) {
                nm = staticNotificationManager;
            } else if (context != null) {
                nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            }
            if (nm != null) {
                nm.cancel(lastNotificationId);
                Log.d(TAG, "Call notification cancelled");
            }
        } catch (Exception e) {
            Log.e(TAG, "Stop ringtone error: " + e.getMessage());
        }
    }

    private void playRingtone() {
        try {
            stopRingtone();

            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            activeRingtone = RingtoneManager.getRingtone(getApplicationContext(), ringtoneUri);

            if (activeRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    activeRingtone.setLooping(true);
                }
                activeRingtone.play();
                Log.d(TAG, "Native ringtone started");

                ringtoneHandler = new Handler();
                ringtoneHandler.postDelayed(() -> {
                    stopRingtone();
                    Log.d(TAG, "Native ringtone stopped after 60s");
                }, 60000);
            }
        } catch (Exception e) {
            Log.e(TAG, "Ringtone error: " + e.getMessage());
        }
    }

    private void stopRingtone() {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
            activeRingtone = null;
            if (ringtoneHandler != null) {
                ringtoneHandler.removeCallbacksAndMessages(null);
                ringtoneHandler = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Stop ringtone error: " + e.getMessage());
        }
    }

    private void showCallNotification(String title, String body, Map<String, String> data) {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        staticNotificationManager = notificationManager;

        createCallChannel(notificationManager);

        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            mainIntent.putExtra(entry.getKey(), entry.getValue());
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent mainPendingIntent = PendingIntent.getActivity(this, 0, mainIntent, pendingFlags);

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setContentIntent(mainPendingIntent);

        // ✅ Lock screen-এ popup
        builder.setFullScreenIntent(mainPendingIntent, true);

        // ✅ Accept button
        Intent acceptIntent = new Intent(this, CallActionReceiver.class);
        acceptIntent.setAction(ACTION_ACCEPT_CALL);
        acceptIntent.putExtra("roomId", data.get("roomId"));
        acceptIntent.putExtra("callerName", data.get("callerName"));
        acceptIntent.putExtra("callType", data.get("callType"));
        PendingIntent acceptPending = PendingIntent.getBroadcast(
            this, 101, acceptIntent, pendingFlags
        );
        builder.addAction(android.R.drawable.ic_menu_call, "Accept", acceptPending);

        // ✅ Decline button
        Intent declineIntent = new Intent(this, CallActionReceiver.class);
        declineIntent.setAction(ACTION_DECLINE_CALL);
        declineIntent.putExtra("roomId", data.get("roomId"));
        PendingIntent declinePending = PendingIntent.getBroadcast(
            this, 102, declineIntent, pendingFlags
        );
        builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePending);

        notificationManager.notify(lastNotificationId, builder.build());
    }

    private void showMessageNotification(String title, String body, Map<String, String> data) {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                MESSAGE_CHANNEL_ID,
                "Message Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("New message alerts");
            channel.enableVibration(true);
            notificationManager.createNotificationChannel(channel);
        }

        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            mainIntent.putExtra(entry.getKey(), entry.getValue());
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent mainPendingIntent = PendingIntent.getActivity(this, 0, mainIntent, pendingFlags);

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(mainPendingIntent);

        int notifId = (int) (System.currentTimeMillis() % 10000) + 2000;
        notificationManager.notify(notifId, builder.build());
    }

    private void createCallChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                CHANNEL_ID,
                "Call Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Incoming call notifications");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
            channel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            channel.enableLights(true);
            notificationManager.createNotificationChannel(channel);
        }
    }
}
