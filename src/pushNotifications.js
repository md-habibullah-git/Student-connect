import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { db, auth, getFCMToken, messaging } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

export async function initPushNotifications() {
  console.log('🔔 initPushNotifications called');
  console.log('🔔 Is Native Platform:', Capacitor.isNativePlatform());
  
  try {
    // ✅ Native Android Notification Channels
    if (Capacitor.isNativePlatform()) {
      console.log('🔔 Creating notification channels...');
      
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
    }
    
    // ✅ Web Notification Permission
    if (!Capacitor.isNativePlatform()) {
      console.log('🔔 Web platform — requesting notification permission...');
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }
    
    console.log('🔔 Requesting push permissions...');
    const permStatus = await PushNotifications.requestPermissions();
    console.log('🔔 Permission status:', JSON.stringify(permStatus));
    
    if (permStatus.receive === 'granted') {
      console.log('🔔 Permission granted, registering...');
      
      if (Capacitor.isNativePlatform()) {
        await PushNotifications.register();
      }
      
      // ✅ Token save function — দুটো platform-ই handle করবে
      const saveToken = async (token) => {
        const currentUid = auth.currentUser?.uid;
        if (currentUid && token) {
          try {
            await updateDoc(doc(db, "users", currentUid), {
              pushToken: token,
              pushTokenUpdatedAt: new Date().getTime(),
              pushTokenPlatform: Capacitor.getPlatform(),
            });
            console.log('✅ Push token saved to Firestore!');
          } catch (saveErr) {
            console.error('🔔 Error saving push token:', saveErr);
          }
        }
      };
      
      // ✅ Native: Capacitor Push Token listener
      if (Capacitor.isNativePlatform()) {
        PushNotifications.addListener('registration', async (token) => {
          console.log('🔔 Native push token received:', token.value);
          await saveToken(token.value);
        });
        
        PushNotifications.addListener('registrationError', (err) => {
          console.error('🔔 Registration error:', err);
        });
      }
      
      // ✅ Web: FCM Token generate করুন
      if (!Capacitor.isNativePlatform() && messaging) {
        const vapidKey = "BOtoloi6y3lWsPJzu0LYjrAkzwJuRxCo-ni4U0MU3BdUa2wdxbyJX34HdXYbbHsH_gd5QCd9weG-CNNAxudU5Og";
        
        try {
          const webToken = await getToken(messaging, { vapidKey });
          if (webToken) {
            console.log('🔔 Web FCM token received:', webToken);
            await saveToken(webToken);
          }
        } catch (err) {
          console.error('🔔 Web token error:', err);
        }
        
        // ✅ Web foreground message handler
        onMessage(messaging, (payload) => {
          console.log('🔔 Web foreground notification received:', payload);
          
          const data = payload.data || {};
          
          if (data.type === 'incoming_call') {
            const ringtoneEvent = new CustomEvent('incoming-call', {
              detail: {
                type: 'personal',
                roomId: data.roomId,
                callerName: data.callerName || 'Student',
                callType: data.callType || 'audio'
              }
            });
            window.dispatchEvent(ringtoneEvent);
          }
          
          if (data.type === 'global_call') {
            const ringtoneEvent = new CustomEvent('incoming-call', {
              detail: {
                type: 'global',
                callerName: data.callerName || 'Student'
              }
            });
            window.dispatchEvent(ringtoneEvent);
          }
        });
      }
      
      // ✅ Native foreground notification handler
      if (Capacitor.isNativePlatform()) {
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('🔔 Native notification received:', notification);
          
          const data = notification.data || {};
          
          if (data.type === 'incoming_call') {
            const ringtoneEvent = new CustomEvent('incoming-call', {
              detail: {
                type: 'personal',
                roomId: data.roomId,
                callerName: data.callerName || 'Student',
                callType: data.callType || 'audio'
              }
            });
            window.dispatchEvent(ringtoneEvent);
          }
          
          if (data.type === 'global_call') {
            const ringtoneEvent = new CustomEvent('incoming-call', {
              detail: {
                type: 'global',
                callerName: data.callerName || 'Student'
              }
            });
            window.dispatchEvent(ringtoneEvent);
          }
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
