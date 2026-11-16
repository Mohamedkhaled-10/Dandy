export const prerender = false;

// src/pages/api/admin/telegram-test.js
// Dedicated protected Admin endpoint for diagnosing Telegram Bot & Group Connectivity
import { verifyAdminRequest, adminUnauthorizedResponse } from '../../../utils/admin-auth.js';
import { getClientIp, getAdminAuthRateLimiter } from '../../../utils/rate-limit.js';
import { diagnoseTelegramSetup } from '../../../utils/telegram.js';

// In-memory rate limiting fallback for admin diagnostics (max 5 diagnostic runs per 5 minutes)
const diagMemoryRateLimit = new Map();

async function checkDiagnosticsRateLimit(clientIp) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;

  // 1. Upstash Redis rate limiter if available
  try {
    const adminLimiter = getAdminAuthRateLimiter();
    if (adminLimiter) {
      const res = await adminLimiter.limit(`diag:telegram:${clientIp}`);
      if (!res.success) {
        return {
          allowed: false,
          message: 'تم تجاوز معدل استدعاء اختبار التيليجرام. يرجى الانتظار بضع دقائق.'
        };
      }
    }
  } catch (err) {
    console.warn('[DIAG-RATE-LIMIT] Redis check failed (Fail Open to memory fallback):', err?.message);
  }

  // 2. Local memory fallback
  const history = diagMemoryRateLimit.get(clientIp) || [];
  const recent = history.filter(ts => now - ts < windowMs);
  diagMemoryRateLimit.set(clientIp, recent);

  if (recent.length >= 6) {
    return {
      allowed: false,
      message: 'تم تجاوز الحد المسموح من اختبارات التيليجرام (حد أقصى 6 محاولات كل 5 دقائق).'
    };
  }

  recent.push(now);
  diagMemoryRateLimit.set(clientIp, recent);
  return { allowed: true };
}

export async function POST({ request, _deps = undefined }) {
  const clientIp = getClientIp(request);

  // 1. Strict Admin Authentication Guard (Bearer Firebase ID token for verified admin@dandy.com)
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    return adminUnauthorizedResponse(authResult);
  }

  // 2. Rate Limiting Check
  const rateLimitCheck = await checkDiagnosticsRateLimit(clientIp);
  if (!rateLimitCheck.allowed) {
    return new Response(JSON.stringify({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: rateLimitCheck.message
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 3. Run full server-side diagnostic: getMe -> getChat -> getChatMember -> test sendMessage
    // Uses ONLY server environment variables. Does NOT allow arbitrary user message text.
    // Masks sensitive token & internal secrets completely.
    const diagnostic = await diagnoseTelegramSetup({ timeoutMs: 6000 });

    const httpStatus = diagnostic.allSuccessful ? 200 : (diagnostic.anySuccessful ? 207 : 502);

    return new Response(JSON.stringify({
      success: diagnostic.allSuccessful,
      status: diagnostic.status,
      bot: diagnostic.bot,
      chats: diagnostic.chats,
      message: diagnostic.message,
      testedAt: new Date().toISOString()
    }), {
      status: httpStatus,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Telegram Admin Diag] Unexpected exception:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'DIAGNOSTIC_EXECUTION_ERROR',
      message: error?.message || 'حدث خطأ أثناء تنفيذ التشخيص'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function ALL() {
  return new Response(JSON.stringify({ error: 'Method not allowed. Use POST with Admin Authorization header.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
