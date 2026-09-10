// File Name: frontend/android/app/src/main/java/com/studentconnect/app/MyFirebaseMessagingService.java

package com.studentconnect.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
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
    private static final String CHANNEL_ID = "call_channel";

    // ✅ Custom Ringtone-এর জন্য static variables
    private static Ringtone activeRingtone = null;
    private static Handler ringtoneHandler = null;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "From: " + remoteMessage.getFrom());

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");

        String title = remoteMessage.getNotification() != null ?
            remoteMessage.getNotification().getTitle() : "Student Connect";
        String body = remoteMessage.getNotification() != null ?
            remoteMessage.getNotification().getBody() : "Incoming call";

        // ✅ Data payload থেকেও title/body নিন (data-only message support)
        if (data.get("title") != null) title = data.get("title");
        if (data.get("body") != null) body = data.get("body");

        // ✅ Call notification-এ ringtone বাজান (app killed হলেও বাজবে)
        if ("incoming_call".equals(type) || "global_call".equals(type)) {
            playRingtone();
        }

        showNotification(title, body, data);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed token: " + token);
    }

    // ✅ Custom Ringtone play function
    private void playRingtone() {
        try {
            // আগের ringtone থাকলে stop করুন
            stopRingtone();

            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            activeRingtone = RingtoneManager.getRingtone(getApplicationContext(), ringtoneUri);

            if (activeRingtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    activeRingtone.setLooping(true); // ✅ Loop করে বাজবে
                }
                activeRingtone.play();
                Log.d(TAG, "Ringtone started");

                // ✅ 30 seconds পরে ringtone stop
                ringtoneHandler = new Handler();
                ringtoneHandler.postDelayed(() -> {
                    stopRingtone();
                    Log.d(TAG, "Ringtone stopped after 30s");
                }, 30000);
            }
        } catch (Exception e) {
            Log.e(TAG, "Ringtone error: " + e.getMessage());
        }
    }

    // ✅ Ringtone stop function
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

    private void showNotification(String title, String body, Map<String, String> data) {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        createNotificationChannel(notificationManager);

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);

        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }

        // ✅ FLAG_UPDATE_CURRENT — duplicate intent problem fix
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

        // ✅ Call-এর জন্য Fullscreen Intent
        boolean isCall = "incoming_call".equals(data.get("type")) || "global_call".equals(data.get("type"));

        NotificationCompat.Builder notificationBuilder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setOngoing(isCall) // ✅ Call-এর জন্য ongoing (swipe করে remove হবে না)
                .setSound(defaultSoundUri)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setContentIntent(pendingIntent);

        // ✅ Fullscreen intent — lock screen-এ call UI দেখাবে
        if (isCall) {
            notificationBuilder.setFullScreenIntent(pendingIntent, true);
        }

        notificationManager.notify((int) System.currentTimeMillis(), notificationBuilder.build());
    }

    private void createNotificationChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Call Notifications",
                NotificationManager.IMPORTANCE_MAX
            );
            channel.setDescription("Incoming call notifications");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 500, 250, 500, 250, 500});
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), null);
            notificationManager.createNotificationChannel(channel);
        }
    }
}
