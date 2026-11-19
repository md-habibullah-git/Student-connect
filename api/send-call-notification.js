// File Name: api/send-call-notification.js

import admin from 'firebase-admin';

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (err) {
  console.error('FIREBASE_SERVICE_ACCOUNT parse error:', err);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    token, 
    callerName, 
    callType, 
    roomId,
    // ✅ নতুন — global call detection (default false → backward compatible)
    isGlobalCall = false,
  } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Push token is required' });
  }

  try {
    // ✅ Global call হলে আলাদা title/body
    const finalTitle = isGlobalCall
      ? `📞 ${callerName || 'Student'} started a group call`
      : `📞 ${callerName || 'Student'} is calling...`;

    const finalBody = isGlobalCall
      ? `👥 ${callType === 'video' ? '📹 Video' : '🎙️ Audio'} conference`
      : `${callType === 'video' ? '📹 Video' : '🎙️ Audio'} call`;

    const message = {
      token: token,
      // ✅ data-only — notification block নেই
      data: {
        // ✅ Global call হলে type 'global_call', নাহলে 'incoming_call'
        type: isGlobalCall ? 'global_call' : 'incoming_call',
        callType: callType || 'audio',
        roomId: roomId || '',
        callerName: callerName || 'Student',
        title: finalTitle,
        body: finalBody,
      },
      android: {
        priority: 'high',
        ttl: 60000,
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'background',
        },
        payload: {
          aps: {
            'content-available': 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    return res.status(200).json({ success: true, response });
  } catch (err) {
    console.error('Call notification error:', err);
    return res.status(500).json({ error: err.message });
  }
}
