// src/utils/rate-limit.js
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

let redisInstance = null;

export function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
}

export function getRedis() {
  if (!redisInstance && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisInstance;
}

// 1. إنشاء الطلبات: 10 طلبات في الدقيقة لكل IP (تراعي شبكات المحمول المصرية ومشاركة الـ IP عبر CGNAT)
export function getOrderRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    prefix: 'ratelimit:create-order',
  });
}

// 2. إشعارات التيليجرام: 20 إشعاراً في الدقيقة (حماية Telegram Bot API من قيود التيليجرام للرسائل السريعة)
export function getTelegramRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '60 s'),
    prefix: 'ratelimit:send-telegram',
  });
}

// 3. ربط طلبات العميل: 5 محاولات في الدقيقة لكل IP
export function getLinkOrdersRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),
    prefix: 'ratelimit:link-orders',
  });
}

// 4. محاولات تسجيل الدخول والتحقق: 10 محاولات في الدقيقة لكل IP
export function getAuthRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    prefix: 'ratelimit:auth',
  });
}

// تسجيل محاولات تسجيل الدخول الفاشلة لرصد Brute Force
export async function recordFailedLogin(email, ip, reason = 'invalid_credentials') {
  try {
    const redis = getRedis();
    const timestamp = Date.now();
    const cleanEmail = (email || 'unknown').toLowerCase().trim();

    console.warn(`[SECURITY - BRUTE FORCE DETECT] Failed login attempt for: ${cleanEmail} from IP: ${ip} (Reason: ${reason})`);

    if (redis) {
      // 1. حفظ في سجل تدقيق العمليات (قائمة آخر 1000 محاولة فاشلة)
      const auditEntry = JSON.stringify({
        email: cleanEmail,
        ip,
        reason,
        timestamp,
        date: new Date(timestamp).toISOString()
      });
      await redis.lpush('audit:failed_logins', auditEntry);
      await redis.ltrim('audit:failed_logins', 0, 999);

      // 2. زيادة عداد الفشل لهذا البريد الإلكتروني مع انتهاء صلاحية 24 ساعة
      const emailKey = `failed_login:email:${cleanEmail}`;
      await redis.hincrby(emailKey, 'count', 1);
      await redis.hset(emailKey, { lastAttempt: timestamp, lastIp: ip });
      await redis.expire(emailKey, 86400);

      // 3. زيادة عداد الفشل لهذا الـ IP مع انتهاء صلاحية 24 ساعة
      const ipKey = `failed_login:ip:${ip}`;
      await redis.hincrby(ipKey, 'count', 1);
      await redis.hset(ipKey, { lastAttempt: timestamp, lastTarget: cleanEmail });
      await redis.expire(ipKey, 86400);
    }
  } catch (err) {
    console.error('Error recording failed login attempt:', err);
  }
}
