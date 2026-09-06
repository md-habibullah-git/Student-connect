import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
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
