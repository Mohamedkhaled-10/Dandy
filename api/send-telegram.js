// api/send-telegram.js

export default async function handler(req, res) {
  // السماح بطلبات POST فقط لحماية الرابط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order, orderId } = req.body;

    // جلب التوكن والـ Chat IDs من متغيرات البيئة السرية في Vercel
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_IDS) {
      return res.status(500).json({ error: 'Server configuration missing tokens' });
    }

    const dateText = order.timestamp
      ? new Date(order.timestamp).toLocaleString('ar-EG')
      : new Date().toLocaleString('ar-EG');

    const message = `🔔 *طلب جديد في متجر داندي!*
────────────────
👤 *العميل\\ة:* ${order.name || '-'}
📞 *رقم الهاتف:* ${order.phone || '-'}
📍 *المحافظة:* ${order.governorate || '-'}
📦 *العنوان:* ${order.address || '-'}
💰 *كود الفاتورة:* ${order.invoiceCode || orderId}
⏱ *الوقت:* ${dateText}

🔗 *تفاصيل الطلب:*
https://dandy-ebon.vercel.app/pages/dashboard/dashboard-order.html`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    // دعم أكثر من Chat ID مفصولين بفاصلة ,
    const chatIds = TELEGRAM_CHAT_IDS
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    for (const chatId of chatIds) {
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown"
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Telegram API error for Chat ID ${chatId}:`, errorData);
      }
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}