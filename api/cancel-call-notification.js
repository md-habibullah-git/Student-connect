// File Name: api/cancel-call-notification.js

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

  const { token, roomId } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Push token is required' });
  }

  try {
    const message = {
      token: token,
      data: {
        type: 'cancel_call',
        roomId: roomId || '',
      },
      android: {
        priority: 'high',
        ttl: 10000,
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
    console.error('Cancel notification error:', err);
    return res.status(500).json({ error: err.message });
  }
}
