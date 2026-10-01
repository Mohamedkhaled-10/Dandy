export const prerender = false;

// src/pages/api/verify-turnstile.js
import { verifyTurnstileToken } from '../../utils/turnstile.js';
import { getClientIp, getAuthRateLimiter, recordFailedLogin } from '../../utils/rate-limit.js';

export async function POST({ request }) {
  try {
    const clientIp = getClientIp(request);
    const body = await request.json().catch(() => ({}));
    const { token, action, email, reason } = body || {};

    // 1. تسجيل المحاولات الفاشلة لتسجيل الدخول (Failed login attempts tracking)
    if (action === 'report-failed-login') {
      await recordFailedLogin(email, clientIp, reason || 'failed_credentials');
      return new Response(JSON.stringify({
        success: true,
        recorded: true,
        message: 'Failed login recorded for security monitoring.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. تطبيق Rate Limiting عبر Upstash Redis لمحاولات التحقق وتسجيل الدخول بمبدأ Fail Open
    try {
      const authLimiter = getAuthRateLimiter();
      if (authLimiter) {
        const { success, limit, remaining, reset } = await authLimiter.limit(clientIp);
        if (!success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار دقيقة واحدة ثم المحاولة مجددًا.'
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
      console.warn(`[RATE-LIMIT WARNING - FAIL OPEN] Upstash Redis check failed in verify-turnstile for IP ${clientIp}:`, redisErr?.message || redisErr);
    }

    // 3. التحقق من وجود التوكن
    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'MISSING_CAPTCHA_TOKEN',
        message: 'يرجى إكمال اختبار التحقق البشري (CAPTCHA) أولاً.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. التحقق السيرفري من التوكن عبر Cloudflare Turnstile siteverify
    const result = await verifyTurnstileToken(token, clientIp);
    if (!result.success) {
      return new Response(JSON.stringify({
        success: false,
        error: result.error || 'CAPTCHA_FAILED',
        message: result.message || 'فشل التحقق الأمني من الكابتشا. يرجى إعادة المحاولة.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'تم التحقق بنجاح'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in verify-turnstile endpoint:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ في خدمة التحقق.'
    }), {
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
