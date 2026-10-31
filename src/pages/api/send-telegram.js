export const prerender = false;

import { getClientIp, getTelegramRateLimiter } from '../../utils/rate-limit.js';
import { sendTelegramNotification } from '../../utils/telegram.js';

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

    const result = await sendTelegramNotification({
      order,
      orderId,
      lowStockAlert,
      productName,
      remainingQty
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : (result.simulated ? 200 : 502),
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in send-telegram endpoint:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', message: error?.message }), {
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
