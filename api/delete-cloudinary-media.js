// frontend/api/delete-cloudinary-media.js
//
// Vercel Serverless Function — Cloudinary থেকে একটা asset নিরাপদে মুছে দেয়।
// Cloudinary-এর delete API সবসময় API Secret দিয়ে সাইন করা রিকোয়েস্ট চায়,
// আর সেই secret কখনোই ব্রাউজারের কোডে রাখা যাবে না (নাহলে যে কেউ সব ফাইল
// মুছে দিতে পারবে)। তাই এই একটা ছোট সার্ভার-সাইড এন্ডপয়েন্ট — শুধু এখানেই
// secret ব্যবহার হয়, ফ্রন্টএন্ড শুধু public_id পাঠায়।
//
// প্রয়োজনীয় সেটআপ (Vercel Dashboard → Project → Settings → Environment
// Variables-এ এই তিনটা যোগ করতে হবে):
//   CLOUDINARY_CLOUD_NAME  = hvdnthrl
//   CLOUDINARY_API_KEY     = (Cloudinary কনসোল → Settings → API Keys থেকে)
//   CLOUDINARY_API_SECRET  = (একই জায়গা থেকে — এটা গোপন রাখবেন, কখনো
//                             frontend কোডে/গিটে কমিট করবেন না)

import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { publicId, resourceType } = req.body || {};
  if (!publicId) {
    return res.status(400).json({ error: 'publicId is required' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('Missing Cloudinary environment variables on the server');
    return res.status(500).json({ error: 'Server is not configured for Cloudinary deletion' });
  }

  const type = resourceType === 'video' ? 'video' : 'image';
  const timestamp = Math.round(Date.now() / 1000);

  // Cloudinary-এর নিয়ম অনুযায়ী স্বাক্ষর তৈরি: sorted params + api_secret-এর SHA-1
  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

  try {
    const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${type}/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        public_id: publicId,
        api_key: apiKey,
        timestamp: String(timestamp),
        signature,
      }),
    });
    const data = await cloudinaryRes.json();

    // "not found" মানে এটা আগে থেকেই মোছা (হয়তো Cloudinary কনসোল থেকে সরাসরি) —
    // সেটাও কার্যত সফল হিসেবেই ধরা হচ্ছে, কারণ শেষ পর্যন্ত ফাইলটা নেই
    if (data.result === 'ok' || data.result === 'not found') {
      return res.status(200).json({ success: true, result: data.result });
    }
    return res.status(500).json({ error: data.result || 'Cloudinary deletion failed' });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
    return res.status(500).json({ error: 'Failed to reach Cloudinary' });
  }
}
