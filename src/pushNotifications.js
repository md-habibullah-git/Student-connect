import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { LocalNotifications } from '@capacitor/local-notifications';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    // ✅ Android Notification Channel তৈরি করুন
    await PushNotifications.createChannel({
      id: 'call_channel',
      name: 'Call Notifications',
      description: 'Incoming call notifications',
      importance: 5, // MAX importance
      visibility: 1, // PUBLIC
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

    const permStatus = await PushNotifications.requestPermissions();
    
    if (permStatus.receive === 'granted') {
      await PushNotifications.register();
      
      PushNotifications.addListener('registration', async (token) => {
        console.log('Push token:', token.value);
        const currentUid = auth.currentUser?.uid;
        if (currentUid) {
          await updateDoc(doc(db, "users", currentUid), {
            pushToken: token.value,
          });
        }
      });
      
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Notification received:', notification);
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
    }
  } catch (err) {
    console.error('Push notification error:', err);
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
