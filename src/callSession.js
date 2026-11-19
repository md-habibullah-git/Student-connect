// src/callSession.js
//
// একটা ছোট shared module — সক্রিয় (active/connected) পার্সোনাল কলের
// RTCPeerConnection ও MediaStream এই module-এ ধরে রাখা হয়। এতে
// PersonalChat.jsx থেকে অন্য পেজে চলে গেলেও (Back চাপলে, অন্য চ্যাট খুললে
// ইত্যাদি) কলটা বন্ধ হয়ে যায় না — কারণ এই অবজেক্টগুলো React কম্পোনেন্টের
// lifecycle-এর বাইরে থাকে। GlobalAlerts.jsx (যেটা পুরো অ্যাপে একবারই মাউন্ট
// হয়) এখান থেকে state পড়ে সব জায়গায় একটা ছোট "call in progress" bubble
// দেখাতে পারে, এবং কল সত্যিই শেষ হলে (remote hangup বা status "ended")
// এই session-টাও পরিষ্কার করে দেয়।

// --- পার্সোনাল (1:1) কল ---
let session = null;
const listeners = new Set();

export function getActiveCallSession() {
  return session;
}

export function setActiveCallSession(next) {
  session = next;
  listeners.forEach((fn) => fn(session));
}

export function clearActiveCallSession() {
  session = null;
  listeners.forEach((fn) => fn(null));
}

export function subscribeActiveCallSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- গ্লোবাল (গ্রুপ) কল ---
// এখানে একটা mutable অবজেক্ট রাখা হয় যার ভেতরে সব peer connection/stream
// থাকে — GlobalChat.jsx সরাসরি এই অবজেক্টের ভেতরের maps ব্যবহার করে (নিজের
// আলাদা local ref না রেখে), যাতে পেজ আনমাউন্ট/রিমাউন্ট হলেও একই অবজেক্ট
// রেফারেন্স ধরে রাখা যায় এবং কল চলতেই থাকে।
let globalSession = null;
const globalListeners = new Set();

export function getActiveGlobalCallSession() {
  return globalSession;
}

export function setActiveGlobalCallSession(next) {
  globalSession = next;
  globalListeners.forEach((fn) => fn(globalSession));
}

export function clearActiveGlobalCallSession() {
  globalSession = null;
  globalListeners.forEach((fn) => fn(null));
}

export function subscribeActiveGlobalCallSession(fn) {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}
