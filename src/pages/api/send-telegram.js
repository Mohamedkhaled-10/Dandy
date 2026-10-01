export const prerender = false;

import { getClientIp, getTelegramRateLimiter } from '../../utils/rate-limit.js';

export async function POST({ request }) {
  try {
    const clientIp = getClientIp(request);

    // تطبيق Rate Limiting عبر Upstash Redis (20 إشعاراً في الدقيقة) بمبدأ Fail Open
    try {
      const telegramLimiter = getTelegramRateLimiter();
      if (telegramLimiter) {
        const { success, limit, remaining, reset } = await telegramLimiter.limit(clientIp);
        if (!success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'تم تجاوز الحد المسموح من إشعارات التيليجرام.'
          }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset)
            }
          });
        }
      }
    } catch (redisErr) {
      console.warn(`[RATE-LIMIT WARNING - FAIL OPEN] Upstash Redis check failed in send-telegram for IP ${clientIp}:`, redisErr?.message || redisErr);
    }

    // مبدأ Fail Closed: التحقق الصارم من وجود INTERNAL_API_SECRET في البيئة أولاً
    const expectedSecret = process.env.INTERNAL_API_SECRET ? process.env.INTERNAL_API_SECRET.trim() : null;
    if (!expectedSecret) {
      console.error('Security Alert (Fail Closed): INTERNAL_API_SECRET is missing or empty in environment. Rejecting request.');
      return new Response(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'غير مصرح: الخدمة غير مهيأة لاستقبال الطلبات (Fail Closed).'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const incomingSecret = (request.headers.get('x-internal-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '').trim();

    if (!incomingSecret || incomingSecret !== expectedSecret) {
      return new Response(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'غير مصرح: نقطة الإشعارات مخصصة للاستدعاءات الداخلية فقط.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json().catch(() => ({}));
    const { order, orderId, lowStockAlert, productName, remainingQty } = body || {};

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

    let message = '';
    if (lowStockAlert) {
      message = `⚠️ *تنبيه مخزون منخفض في متجر داندي!*
────────────────
📦 *المنتج:* ${productName || '-'}
📉 *الكمية المتبقية:* ${remainingQty ?? 0}
⏱ *الوقت:* ${new Date().toLocaleString('ar-EG')}

🔗 *إدارة المنتجات:*
https://dandy-ebon.vercel.app/dashboard-product`;
    } else {
      const dateText = order?.timestamp
        ? new Date(order.timestamp).toLocaleString('ar-EG')
        : new Date().toLocaleString('ar-EG');

      message = `🔔 *طلب جديد في متجر داندي!*
────────────────
👤 *العميل\\ة:* ${order?.name || '-'}
📞 *رقم الهاتف:* ${order?.phone || '-'}
📍 *المحافظة:* ${order?.governorate || '-'}
📦 *العنوان:* ${order?.address || '-'}
💰 *كود الفاتورة:* ${order?.invoiceCode || orderId}
⏱ *الوقت:* ${dateText}

🔗 *تفاصيل الطلب:*
https://dandy-ebon.vercel.app/dashboard-order`;
    }

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
