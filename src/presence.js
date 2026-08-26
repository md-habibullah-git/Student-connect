// src/presence.js
//
// একটা ইউজারের "online" ফ্ল্যাগ শুধু লেখার সময় true হলেই যথেষ্ট না —
// ব্রাউজার/অ্যাপ ক্র্যাশ করলে বা জোর করে বন্ধ হয়ে গেলে (beforeunload বা
// Capacitor-এর appStateChange কোনোটাই ফায়ার না হলে) এই ফ্ল্যাগ চিরতরে
// "true" আটকে থেকে যেতে পারে — কারণ Firestore-এ Realtime Database-এর
// onDisconnect()-এর মতো সার্ভার-সাইড টাইমআউট সুবিধা নেই।
//
// তাই দেখানোর সময় শুধু `online === true` না দেখে, `lastSeen` কতটা
// সাম্প্রতিক তাও চেক করা হয় — GlobalAlerts.jsx নিয়মিত (প্রতি ৬০ সেকেন্ডে)
// lastSeen আপডেট করে (heartbeat) যতক্ষণ ইউজার সত্যিই অ্যাক্টিভ। অনেকক্ষণ
// (STALE_THRESHOLD_MS-এর বেশি) হার্টবিট না এলে সেই ইউজারকে অফলাইন হিসেবেই
// দেখানো হয়, ডেটাবেসে যা-ই লেখা থাকুক না কেন।

export const STALE_THRESHOLD_MS = 2 * 60 * 1000; // ২ মিনিট (heartbeat প্রতি ৬০ সেকেন্ডে, তাই এটা যথেষ্ট মার্জিন দেয়)

export function isUserOnline(userData) {
  if (!userData || userData.online !== true) return false;
  if (!userData.lastSeen) return false;
  return (Date.now() - userData.lastSeen) < STALE_THRESHOLD_MS;
}
