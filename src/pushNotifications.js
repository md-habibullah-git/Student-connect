// File Name: src/pushNotifications.js

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth, messaging } from './firebase';
import { doc, setDoc } from 'firebase/firestore';   // ← setDoc import
import { getToken, onMessage } from 'firebase/messaging';

// =====================================================
// ✅ initPushNotifications
// =====================================================
export async function initPushNotifications() {
  console.log('🔔 initPushNotifications called');
  console.log('🔔 Is Native Platform:', Capacitor.isNativePlatform());

  try {
    // ============================================
    // NATIVE ONLY
    // ============================================
    if (Capacitor.isNativePlatform()) {
      console.log('🔔 Creating notification channels...');

      try {
        await PushNotifications.createChannel({
          id: 'call_channel',
          name: 'Call Notifications',
          description: 'Incoming call notifications',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
        });

        await PushNotifications.createChannel({
          id: 'message_channel',
          name: 'Message Notifications',
          description: 'New message notifications',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        });
      } catch (chErr) {
        console.warn('🔔 Channel create warning:', chErr);
      }

      const permStatus = await PushNotifications.requestPermissions();
      console.log('🔔 Permission status:', JSON.stringify(permStatus));

      if (permStatus.receive !== 'granted') {
        console.log('🔔 Native permission denied');
        return;
      }

      await PushNotifications.register();

      // ---- Token listener ----
      PushNotifications.addListener('registration', async (token) => {
        console.log('🔔 Native push token received:', token.value);
        await saveToken(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('🔔 Registration error:', err);
      });

      // ---- Foreground notification ----
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('🔔 Native notification received:', notification);

        const data = notification.data || {};

        if (data.type === 'cancel_call') {
          window.dispatchEvent(new CustomEvent('cancel-call', {
            detail: { roomId: data.roomId }
          }));
          return;
        }

        if (data.type === 'incoming_call') {
          window.dispatchEvent(new CustomEvent('incoming-call', {
            detail: {
              type: 'personal',
              roomId: data.roomId,
              callerName: data.callerName || 'Student',
              callType: data.callType || 'audio'
            }
          }));
        }

        if (data.type === 'global_call') {
          window.dispatchEvent(new CustomEvent('incoming-call', {
            detail: {
              type: 'global',
              callerName: data.callerName || 'Student'
            }
          }));
        }
      });

      // ---- Notification tap ----
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const data = notification.notification.data;
        if (data && data.type === 'incoming_call' && data.roomId) {
          window.location.href = `/chat/${data.roomId}/${encodeURIComponent(data.callerName || 'Student')}`;
        }
        if (data && data.type === 'global_call') {
          window.location.href = '/chat/global/Global-Chatroom';
        }
      });

      return;
    }

    // ============================================
    // WEB ONLY
    // ============================================
    console.log('🔔 Web platform — requesting notification permission...');

    if (!('Notification' in window)) {
      console.log('🔔 Notification API not supported');
      return;
    }

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission !== 'granted') {
      console.log('🔔 Web notification permission denied');
      return;
    }

    if (!messaging) {
      console.log('🔔 Messaging not initialized');
      return;
    }

    const vapidKey = "BOtoloi6y3lWsPJzu0LYjrAkzwJuRxCo-ni4U0MU3BdUa2wdxbyJX34HdXYbbHsH_gd5QCd9weG-CNNAxudU5Og";

    try {
      const webToken = await getToken(messaging, { vapidKey });
      if (webToken) {
        console.log('🔔 Web FCM token received:', webToken);
        await saveToken(webToken);
      } else {
        console.warn('🔔 Web FCM token empty');
      }
    } catch (err) {
      console.error('🔔 Web token error:', err);
    }

    // Web foreground handler
    onMessage(messaging, (payload) => {
      console.log('🔔 Web foreground notification received:', payload);
      const data = payload.data || {};

      if (data.type === 'cancel_call') {
        window.dispatchEvent(new CustomEvent('cancel-call', {
          detail: { roomId: data.roomId }
        }));
        return;
      }

      if (data.type === 'incoming_call') {
        window.dispatchEvent(new CustomEvent('incoming-call', {
          detail: {
            type: 'personal',
            roomId: data.roomId,
            callerName: data.callerName || 'Student',
            callType: data.callType || 'audio'
          }
        }));
      }

      if (data.type === 'global_call') {
        window.dispatchEvent(new CustomEvent('incoming-call', {
          detail: {
            type: 'global',
            callerName: data.callerName || 'Student'
          }
        }));
      }
    });
  } catch (err) {
    console.error('🔔 Push notification error:', err);
  }
}

// =====================================================
// ✅ Token Save — setDoc merge (document না থাকলেও তৈরি হবে)
// =====================================================
async function saveToken(token) {
  const currentUid = auth.currentUser?.uid;
  console.log('🔔 saveToken — uid:', currentUid, 'token:', token ? '✅' : '❌');

  if (!currentUid) {
    console.warn('🔔 No logged-in user — skip token save');
    return;
  }
  if (!token) {
    console.warn('🔔 Empty token — skip save');
    return;
  }

  try {
    await setDoc(
      doc(db, "users", currentUid),
      {
        uid: currentUid,                       // ← rules-এর জন্য জরুরি
        pushToken: token,
        pushTokenUpdatedAt: Date.now(),
        pushTokenPlatform: Capacitor.getPlatform(),
      },
      { merge: true }                          // ← existing data রক্ষা করবে
    );
    console.log('✅ Push token saved to Firestore!');
  } catch (saveErr) {
    console.error('🔔 Error saving push token:', saveErr);
  }
}

// =====================================================
// ✅ sendPushNotification — Message notification
// =====================================================
export async function sendPushNotification(token, title, body, data = {}) {
  if (!token) {
    console.warn('sendPushNotification: no token');
    return;
  }
  try {
    const res = await fetch('/api/send-push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title, body, data }),
    });
    const json = await res.json().catch(() => ({}));
    console.log('📤 send-push-notification response:', json);
  } catch (err) {
    console.error('Send push error:', err);
  }
}

// =====================================================
// ✅ sendCallNotification
// =====================================================
export async function sendCallNotification(token, callerName, callType, roomId, options = {}) {
  if (!token) return;
  try {
    const { isGlobalCall = false } = options;
    await fetch('/api/send-call-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, callerName, callType, roomId, isGlobalCall }),
    });
  } catch (err) {
    console.error('Send call notification error:', err);
  }
}

// =====================================================
// ✅ sendCancelCallNotification
// =====================================================
export async function sendCancelCallNotification(token, roomId) {
  if (!token) return;
  try {
    const response = await fetch('/api/cancel-call-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, roomId }),
    });
    const result = await response.json();
    console.log('✅ Cancel call notification sent:', result);
  } catch (err) {
    console.error('❌ Send cancel call notification error:', err);
  }
}
