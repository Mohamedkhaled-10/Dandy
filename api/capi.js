export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const pixelId = process.env.FB_PIXEL_ID;

    // فحص إذا كانت المتغيرات مفقودة وإرجاع إجابة واضحة للمتصفح
    if (!accessToken || !pixelId) {
      return res.status(500).json({ 
        error: 'Environment Variables Missing', 
        details: `FB_ACCESS_TOKEN setup: ${!!accessToken}, FB_PIXEL_ID setup: ${!!pixelId}. Did you trigger a Redeploy after adding them?` 
      });
    }

    const { eventName, eventData, userData, eventId } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const clientUserAgent = req.headers['user-agent'] || '';

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "website",
          event_source_url: req.headers.referer || "https://dandy-ebon.vercel.app/",
          user_data: {
            client_ip_address: clientIp.split(',')[0].trim(),
            client_user_agent: clientUserAgent,
            fbp: userData?.fbp || null,
            fbc: userData?.fbc || null,
          },
          custom_data: eventData || {}
        }
      ]
    };

    // إرسال البيانات لفيسبوك
    const fbResponse = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
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
    // إرسال تفاصيل الانهيار البرمجي كاملة إلى المتصفح لمعاينتها فوراً
    return res.status(500).json({ error: 'Server Crash', message: error.message, stack: error.stack });
  }
}