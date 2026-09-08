import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken } from "firebase/messaging"; // ✅ FCM Messaging import

// Your actual Firebase configuration keys
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
export const storage = getStorage(app); // পোস্টের ভিডিওর জন্য — Firestore-এর ১MB ডকুমেন্ট লিমিট এড়াতে
export const messaging = getMessaging(app); // ✅ FCM Messaging export

// ✅ VAPID Key — Firebase Console থেকে generate করা
const VAPID_KEY = "BOtoloi6y3lWsPJzu0LYjrAkzwJuRxCo-ni4U0MU3BdUa2wdxbyJX34HdXYbbHsH_gd5QCd9weG-CNNAxudU5Og";

// ✅ FCM Token পাওয়ার ফাংশন
export async function getFCMToken() {
  try {
    const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (currentToken) {
      console.log('✅ FCM Token:', currentToken);
      return currentToken;
    } else {
      console.log('❌ No FCM Token available');
      return null;
    }
  } catch (err) {
    console.error('❌ FCM Token error:', err);
    return null;
  }
}
