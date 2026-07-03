const crypto = require('crypto');

// دالة لتشفير البيانات بصيغة SHA256 كما يطلب فيسبوك
const hashData = (data) => {
  if (!data) return undefined;
  return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
};

module.exports = async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // استخدام الأسماء الصحيحة التي قمت أنت بإنشائها في Vercel
    const PIXEL_ID = process.env.META_PIXEL_ID;
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

    // فحص المتغيرات بشكل آمن لمنع الانهيار
    if (!PIXEL_ID || !ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: 'Missing Meta credentials in Environment Variables',
        diagnostics: { pixelIdExists: !!PIXEL_ID, accessTokenExists: !!ACCESS_TOKEN }
      });
    }

    const { eventName, eventData, userData, eventId } = req.body;
    
    // جلب الـ IP والـ User Agent الخاص بالعميل مباشرة من السيرفر لضمان الدقة
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const clientUserAgent = req.headers['user-agent'] || '';

    // تجهيز بيانات المستخدم وتصفية الـ IP في حال وجود بروكسي
    const hashedUserData = {
      client_ip_address: clientIp.split(',')[0].trim(),
      client_user_agent: clientUserAgent,
      fbp: userData?.fbp || null,
      fbc: userData?.fbc || null,
    };

    // تشفير البيانات الحساسة إن وجدت (مثل حدث الشراء)
    if (userData?.em) hashedUserData.em = [hashData(userData.em)];
    if (userData?.ph) {
      let phone = userData.ph.replace(/[^0-9]/g, '');
      if (phone.startsWith('01')) phone = '2' + phone; // إضافة كود مصر الدولي إذا كان مفقوداً
      hashedUserData.ph = [hashData(phone)];
    }

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_source_url: req.headers.referer || "https://dandy-ebon.vercel.app/",
          event_id: eventId, // الربط لمنع التكرار
          user_data: hashedUserData,
          custom_data: eventData || {},
        },
      ],
    };

    // إرسال الطلب إلى خوادم فيسبوك الرسمية
    const fbResponse = await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      return res.status(400).json({ error: 'Meta API Rejected Request', details: fbResult });
    }

    return res.status(200).json({ success: true, fbResult });

  } catch (error) {
    // حماية السيرفر من الانهيار وإرجاع تفاصيل الخطأ بدقة
    return res.status(500).json({ error: 'Server Crash', message: error.message });
  }
};