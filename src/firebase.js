// File Name: src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken } from "firebase/messaging";
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: "AIzaSyB_kkFWUwfTzjBZsc6V9ui2dE4qHrMp9nY",
  authDomain: "student-connect-ffa4a.firebaseapp.com",
  projectId: "student-connect-ffa4a",
  storageBucket: "student-connect-ffa4a.firebasestorage.app",
  messagingSenderId: "952632040307",
  appId: "1:952632040307:web:3a5ef238ff5ab81e920306",
  measurementId: "G-N0EKF3LZD9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ✅ FCM Messaging — শুধু Web-এর জন্য
let messaging = null;
try {
  if (!Capacitor.isNativePlatform()) {
    messaging = getMessaging(app);
  }
} catch (err) {
  console.log('FCM Messaging not available on native');
}
export { messaging };

// ✅ VAPID Key (Web only)
const VAPID_KEY = "BOtoloi6y3lWsPJzu0LYjrAkzwJuRxCo-ni4U0MU3BdUa2wdxbyJX34HdXYbbHsH_gd5QCd9weG-CNNAxudU5Og";

/**
 * ✅ FCM Token — শুধু Web-এর জন্য
 *
 * Native-এ token handle করে `src/pushNotifications.js` → initPushNotifications()
 * কারণ Native-এ Capacitor PushNotifications plugin সরাসরি registration listener
 * দিয়ে token দেয় এবং সেখানে Firestore-এ save-ও করা হয়।
 */
export async function getFCMToken() {
  // Native-এ এই function use হবে না
  if (Capacitor.isNativePlatform()) {
    console.log('🔔 Native platform — token is handled in pushNotifications.js');
    return null;
  }

  // Web
  if (!messaging) {
    console.error('❌ Messaging not initialized (Web)');
    return null;
  }

  try {
    const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (currentToken) {
      console.log('✅ Web FCM Token:', currentToken);
      return currentToken;
    }
    console.warn('❌ Web FCM token empty');
    return null;
  } catch (err) {
    console.error('❌ Web FCM Token error:', err);
    return null;
  }
}
