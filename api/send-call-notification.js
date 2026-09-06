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

  const { token, callerName, callType, roomId } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Push token is required' });
  }

  try {
    const message = {
      token: token,
      notification: {
        title: '📞 Incoming Call',
        body: `${callerName || 'Student'} is calling you...`,
      },
      data: {
        type: 'incoming_call',
        callType: callType || 'audio',
        roomId: roomId || '',
        callerName: callerName || 'Student',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'call_channel',
          priority: 'high',
          visibility: 'public',
        },
      },
      apns: {
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
    console.error('Call notification error:', err);
    return res.status(500).json({ error: err.message });
  }
}
