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

// 5. محاولات تسجيل دخول الأدمن الخاصة: 5 محاولات في 5 دقائق لكل IP
export function getAdminAuthRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '300 s'),
    prefix: 'ratelimit:admin-auth',
  });
}

// 6. استعلام فواتير العملاء العامة: 60 استعلاماً في 10 دقائق لكل IP
export function getInvoiceRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '600 s'),
    prefix: 'ratelimit:public-invoice',
  });
}

export function getGeneralRateLimiter() {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '600 s'),
    prefix: 'ratelimit:general',
  });
}

// ذاكرة مؤقتة للحظر والإغلاق المؤقت (In-Memory Fallback)
const memoryAdminAttempts = new Map();

export async function checkAdminRateLimitAndLockout(ip, email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const now = Date.now();

  // 1. فحص Upstash Redis المتقدم
  try {
    const redis = getRedis();
    const adminLimiter = getAdminAuthRateLimiter();
    if (redis && adminLimiter) {
      const { success, limit, remaining, reset } = await adminLimiter.limit(`admin:${ip}`);
      if (!success) {
        return {
          allowed: false,
          reason: 'RATE_LIMIT_EXCEEDED',
          message: 'تم تجاوز الحد المسموح من محاولات دخول المشرف. يرجى الانتظار 5 دقائق ثم المحاولة مجددًا.',
          limit,
          remaining,
          reset
        };
      }
    }
  } catch (err) {
    console.warn(`[RATE-LIMIT WARNING] Redis admin rate limiter error for IP ${ip}:`, err?.message || err);
  }

  // 2. فحص نافذة الحظر المؤقت بذاكرة التطبيق
  const windowMs = 5 * 60 * 1000; // 5 دقائق
  const key = `${ip}:${cleanEmail}`;
  const history = memoryAdminAttempts.get(key) || [];
  const recentHistory = history.filter(ts => now - ts < windowMs);
  memoryAdminAttempts.set(key, recentHistory);

  if (recentHistory.length >= 5) {
    const oldest = recentHistory[0];
    const waitSec = Math.ceil((windowMs - (now - oldest)) / 1000);
    return {
      allowed: false,
      reason: 'LOCKED_OUT',
      message: `تم حظر محاولات تسجيل الدخول المؤقتة لكثرة المحاولات الخاطئة. يرجى الانتظار ${waitSec} ثانية ثم المحاولة مجددًا.`
    };
  }

  return { allowed: true };
}

// تسجيل محاولات تسجيل الدخول الفاشلة لرصد Brute Force
export async function recordFailedLogin(email, ip, reason = 'invalid_credentials') {
  try {
    const timestamp = Date.now();
    const cleanEmail = (email || 'unknown').toLowerCase().trim();

    console.warn(`[SECURITY - BRUTE FORCE DETECT] Failed login attempt for: ${cleanEmail} from IP: ${ip} (Reason: ${reason})`);

    // تحديث ذاكرة المحاولات المحلية
    const key = `${ip}:${cleanEmail}`;
    const history = memoryAdminAttempts.get(key) || [];
    history.push(timestamp);
    memoryAdminAttempts.set(key, history);

    const redis = getRedis();
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

// تسجيل محاولات تسجيل الدخول الناجحة للمشرفين واقتطاع العدادات
export async function recordSuccessfulLogin(email, ip) {
  try {
    const cleanEmail = (email || 'unknown').toLowerCase().trim();
    const timestamp = Date.now();

    console.info(`[SECURITY - SUCCESSFUL LOGIN] Successful login for: ${cleanEmail} from IP: ${ip}`);

    // إعادة تعيين محاولات الذاكرة المحلية
    const key = `${ip}:${cleanEmail}`;
    memoryAdminAttempts.delete(key);

    const redis = getRedis();
    if (redis) {
      const auditEntry = JSON.stringify({
        email: cleanEmail,
        ip,
        timestamp,
        date: new Date(timestamp).toISOString(),
        type: 'SUCCESS'
      });
      await redis.lpush('audit:successful_logins', auditEntry);
      await redis.ltrim('audit:successful_logins', 0, 999);
    }
  } catch (err) {
    console.error('Error recording successful login:', err);
  }
}
