const crypto = require('crypto');

// دالة لتشفير البيانات بصيغة SHA256 كما يطلب فيسبوك (مُعدّلة لتتحمل أي نوع بيانات)
const hashData = (data) => {
  if (!data) return undefined;
  // تحويل البيانات إلى نص بأمان لمنع الانهيار إذا أرسلها المتصفح كرقَم
  const secureString = String(data).trim().toLowerCase();
  return crypto.createHash('sha256').update(secureString).digest('hex');
};

module.exports = async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { eventName, eventData, userData, eventId } = req.body || {};
    const PIXEL_ID = process.env.META_PIXEL_ID;
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

    // إذا كانت المتغيرات ناقصة، سنرسل خطأ تفصيلياً لنعرف أيهما مفقود
    if (!PIXEL_ID || !ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: 'Missing Meta credentials in Environment Variables',
        diagnostics: { 
          META_PIXEL_ID_FOUND: !!PIXEL_ID, 
          META_ACCESS_TOKEN_FOUND: !!ACCESS_TOKEN 
        },
        tip: 'If you just added them, you MUST run a "Redeploy" on Vercel Dashboard.'
      });
    }

    // تجهيز بيانات المستخدم
    const hashedUserData = {
      client_ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      client_user_agent: req.headers['user-agent'] || '',
      fbp: userData?.fbp || null,
      fbc: userData?.fbc || null,
    };

    // تشفير الإيميل ورقم الهاتف إن وجدوا بأمان
    if (userData?.em) {
      hashedUserData.em = [hashData(userData.em)];
    }
    
    if (userData?.ph) {
      // تحويل رقم الهاتف لنص أولاً لضمان عمل الـ replace بأمان
      let phone = String(userData.ph).replace(/[^0-9]/g, '');
      if (phone.startsWith('01')) phone = '2' + phone; // إضافة كود مصر إذا كان مفقوداً
      hashedUserData.ph = [hashData(phone)];
    }

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_source_url: req.headers.referer || "https://dandy-ebon.vercel.app/",
          event_id: eventId, // لمنع التكرار
          user_data: hashedUserData,
          custom_data: eventData || {},
        },
      ],
    };

    // إرسال البيانات إلى فيسبوك
    const response = await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    // إذا رفض فيسبوك البيانات (مثلاً الـ Token غير صحيح أو منتهي)
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Meta API Rejected Request', details: result });
    }

    return res.status(200).json({ success: true, result });
    
  } catch (error) {
    // التقاط أي خطأ برمي برمجياً وإرساله للمتصفح فوراً لمعاينته
    return res.status(500).json({ error: 'Server Catch Crash', message: error.message });
  }
};