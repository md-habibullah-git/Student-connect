// File Name: src/pushNotifications.js

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

export async function initPushNotifications() {
  // ✅ Debug log
  console.log('🔔 initPushNotifications called');
  console.log('🔔 Is Native Platform:', Capacitor.isNativePlatform());
  
  if (!Capacitor.isNativePlatform()) {
    console.log('🔔 Not native platform, returning');
    return;
  }
  
  try {
    console.log('🔔 Creating notification channels...');
    
    // Android Notification Channels
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

    console.log('🔔 Requesting permissions...');
    const permStatus = await PushNotifications.requestPermissions();
    console.log('🔔 Permission status:', JSON.stringify(permStatus));
    
    if (permStatus.receive === 'granted') {
      console.log('🔔 Permission granted, registering...');
      await PushNotifications.register();
      
      PushNotifications.addListener('registration', async (token) => {
        console.log('🔔 Push token received:', token.value);
        const currentUid = auth.currentUser?.uid;
        console.log('🔔 Current UID:', currentUid);
        if (currentUid) {
          try {
            await updateDoc(doc(db, "users", currentUid), {
              pushToken: token.value,
            });
            console.log('🔔 Push token saved to Firestore!');
          } catch (saveErr) {
            console.error('🔔 Error saving push token:', saveErr);
          }
        }
      });
      
      PushNotifications.addListener('registrationError', (err) => {
        console.error('🔔 Registration error:', err);
      });
      
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('🔔 Notification received:', notification);
      });
      
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const data = notification.notification.data;
        if (data && data.type === 'incoming_call' && data.roomId) {
          window.location.href = `/chat/${data.roomId}/${encodeURIComponent(data.callerName || 'Student')}`;
        }
        if (data && data.type === 'global_call') {
          window.location.href = '/chat/global/Global-Chatroom';
        }
      });
    } else {
      console.log('🔔 Permission denied');
    }
  } catch (err) {
    console.error('🔔 Push notification error:', err);
  }
}

export async function sendPushNotification(token, title, body, data = {}) {
  if (!token) return;
  try {
    await fetch('/api/send-push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title, body, data }),
    });
  } catch (err) {
    console.error('Send push error:', err);
  }
}

export async function sendCallNotification(token, callerName, callType, roomId) {
  if (!token) return;
  try {
    await fetch('/api/send-call-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, callerName, callType, roomId }),
    });
  } catch (err) {
    console.error('Send call notification error:', err);
  }
}
