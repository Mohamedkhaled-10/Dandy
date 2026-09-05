export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { order, orderId } = body || {};

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_IDS) {
      console.warn('TELEGRAM_TOKEN or TELEGRAM_CHAT_ID not configured in environment. Notification simulated.');
      return new Response(JSON.stringify({
        success: true,
        simulated: true,
        message: 'Notification simulated because Telegram tokens are not configured in .env'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const dateText = order?.timestamp
      ? new Date(order.timestamp).toLocaleString('ar-EG')
      : new Date().toLocaleString('ar-EG');

    const message = `🔔 *طلب جديد في متجر داندي!*
────────────────
👤 *العميل\\ة:* ${order?.name || '-'}
📞 *رقم الهاتف:* ${order?.phone || '-'}
📍 *المحافظة:* ${order?.governorate || '-'}
📦 *العنوان:* ${order?.address || '-'}
💰 *كود الفاتورة:* ${order?.invoiceCode || orderId}
⏱ *الوقت:* ${dateText}

🔗 *تفاصيل الطلب:*
https://dandy-ebon.vercel.app/pages/dashboard/dashboard-order.html`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

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
        const errorData = await response.json().catch(() => ({}));
        console.error(`Telegram API error for Chat ID ${chatId}:`, errorData);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in send-telegram endpoint:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function ALL() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
