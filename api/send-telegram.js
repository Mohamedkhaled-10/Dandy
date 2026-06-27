// api/send-telegram.js

export default async function handler(req, res) {
  // السماح بطلبات POST فقط لحماية الرابط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order, orderId } = req.body;

    // جلب التوكن والـ Chat ID من متغيرات البيئة السرية في Vercel
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ error: 'Server configuration missing tokens' });
    }

    const dateText = order.timestamp 
      ? new Date(order.timestamp).toLocaleString('ar-EG') 
      : new Date().toLocaleString('ar-EG');

    const message = `🔔 *طلب جديد في متجر داندي!*
────────────────
👤 *العميلة:* ${order.name || '-'}
📞 *رقم الهاتف:* ${order.phone || '-'}
📍 *المحافظة:* ${order.governorate || '-'}
📦 *العنوان:* ${order.address || '-'}
💰 *كود الفاتورة:* ${order.invoiceCode || orderId}
⏱ *الوقت:* ${dateText}`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(502).json({ error: 'Telegram API error', details: errorData });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}