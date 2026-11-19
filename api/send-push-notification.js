// File Name: api/send-push-notification.js

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

  const { token, title, body, data } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Push token is required' });
  }

  try {
    const isCall = data?.type === 'incoming_call' || data?.type === 'global_call';
    
    const finalTitle = title || (isCall ? '📞 Incoming Call' : 'Student Connect');
    const finalBody = body || (isCall ? 'Someone is calling you' : 'You have a new notification');

    // ✅ Data payload-এ title/body যোগ করুন — Native service এগুলো পড়বে
    const enrichedData = {
      ...(data || {}),
      title: finalTitle,
      body: finalBody,
    };

    const message = {
      token: token,
      notification: {
        title: finalTitle,
        body: finalBody,
      },
      data: enrichedData,
      android: {
        priority: 'high',
        ttl: isCall ? 30000 : 3600000, // ✅ Call = 30s, Message = 1 hour
        notification: {
          sound: 'default',
          channelId: isCall ? 'call_channel' : 'message_channel',
          priority: 'high',
          visibility: 'public',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': isCall ? 'alert' : 'alert',
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    return res.status(200).json({ success: true, response });
  } catch (err) {
    console.error('Push notification error:', err);
    return res.status(500).json({ error: err.message });
  }
}
