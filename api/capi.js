import crypto from 'crypto';

// دالة لتشفير البيانات بصيغة SHA256 كما يطلب فيسبوك
const hashData = (data) => {
  if (!data) return undefined;
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { eventName, eventData, userData, eventId } = req.body;
  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing Meta credentials in Environment Variables' });
  }

  try {
    // تجهيز بيانات المستخدم
    const hashedUserData = {
      client_ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      client_user_agent: req.headers['user-agent'],
      fbp: userData?.fbp,
      fbc: userData?.fbc,
    };

    // تشفير الإيميل ورقم الهاتف إن وجدوا (خاصة في حدث الشراء Purchase)
    if (userData?.em) hashedUserData.em = [hashData(userData.em)];
    if (userData?.ph) {
      // إزالة أي رموز من رقم الهاتف والتأكد من وجود كود الدولة
      let phone = userData.ph.replace(/[^0-9]/g, '');
      if (phone.startsWith('01')) phone = '2' + phone; // إضافة كود مصر إذا كان مفقوداً
      hashedUserData.ph = [hashData(phone)];
    }

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_id: eventId, // الأهم لمنع التكرار (Deduplication)
          user_data: hashedUserData,
          custom_data: eventData || {},
        },
      ],
    };

    const response = await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('CAPI Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}