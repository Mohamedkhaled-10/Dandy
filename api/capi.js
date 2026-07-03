export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const pixelId = process.env.FB_PIXEL_ID;

    // التحقق من وجود المتغيرات البيئية حتى لا ينهار السيرفر
    if (!accessToken || !pixelId) {
      console.error("Missing Meta Environment Variables on Vercel");
      return res.status(500).json({ error: 'Server misconfiguration: Missing Meta credentials.' });
    }

    const { eventName, eventData, userData, eventId } = req.body;

    // جلب الـ IP والـ User Agent الخاص بالعميل مباشرة من طلب السيرفر (أكثر دقة)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const clientUserAgent = req.headers['user-agent'] || '';

    // تجهيز البيانات بالصيغة الرسمية التي يطلبها فيسبوك CAPI
    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000), // تحويل الوقت لثوانٍ
          event_id: eventId,
          action_source: "website",
          event_source_url: req.headers.referer || "https://dandy-ebon.vercel.app/",
          user_data: {
            client_ip_address: clientIp.split(',')[0].trim(), // تصفية الـ IP في حال وجود بروكسي
            client_user_agent: clientUserAgent,
            fbp: userData?.fbp || null,
            fbc: userData?.fbc || null,
          },
          custom_data: eventData || {}
        }
      ]
    };

    // إرسال البيانات إلى خوادم فيسبوك
    const fbResponse = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const fbResult = await fbResponse.json();

    // إذا رفض فيسبوك البيانات، نرجع الخطأ بدون أن ينهار السيرفر
    if (!fbResponse.ok) {
      console.error("Meta CAPI Error Response:", fbResult);
      return res.status(fbResponse.status).json({ error: 'Meta API rejected request', details: fbResult });
    }

    return res.status(200).json({ success: true, fbResult });

  } catch (error) {
    // التقاط أي خطأ غير متوقع وطباعته في الـ Logs
    console.error("Internal Server Error in CAPI handler:", error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}