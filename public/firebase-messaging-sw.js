importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB_kkFWUwfTzjBZsc6V9ui2dE4qHrMp9nY",
  authDomain: "student-connect-ffa4a.firebaseapp.com",
  projectId: "student-connect-ffa4a",
  storageBucket: "student-connect-ffa4a.firebasestorage.app",
  messagingSenderId: "952632040307",
  appId: "1:952632040307:web:3a5ef238ff5ab81e920306"
});

const messaging = firebase.messaging();

// Background message handler (Web)
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'Student Connect';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data || {};
  
  if (data.type === 'incoming_call' && data.roomId) {
    clients.openWindow(`/chat/${data.roomId}/${encodeURIComponent(data.callerName || 'Student')}`);
  } else if (data.type === 'global_call') {
    clients.openWindow('/chat/global/Global-Chatroom');
  } else {
    clients.openWindow('/');
  }
});
