export const prerender = false;

// src/pages/api/link-customer-orders.js
// Links unclaimed guest orders strictly by Firebase-verified account email (never phone alone).
import { getAdminDb, getAdminAuth } from '../../utils/firebase-admin.ts';
import { getClientIp, getLinkOrdersRateLimiter } from '../../utils/rate-limit.js';
import { isValidEmail } from '../../utils/email-service.ts';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      ...extraHeaders
    }
  });
}

function extractBearerToken(request) {
  const authHeader =
    request?.headers?.get?.('authorization') ||
    request?.headers?.get?.('Authorization') ||
    '';
  if (typeof authHeader !== 'string') return null;
  const match = authHeader.trim().match(/^Bearer\s+([^\s]+)$/i);
  return match && match[1] ? match[1].trim() : null;
}

function normalizeEmailForMatch(rawEmail) {
  if (typeof rawEmail !== 'string') return '';
  return rawEmail.trim().toLowerCase();
}

export async function POST({ request, _deps = undefined }) {
  try {
    const clientIp = getClientIp(request);

    // Rate limiting (Fail Open to avoid locking legitimate users if Redis is degraded)
    if (!_deps?.skipRateLimit) {
      try {
        const linkLimiter = _deps?.linkLimiter !== undefined ? _deps.linkLimiter : getLinkOrdersRateLimiter();
        if (linkLimiter) {
          const { success, limit, remaining, reset } = await linkLimiter.limit(clientIp);
          if (!success) {
            return jsonResponse(
              {
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'تم تجاوز الحد المسموح من طلبات ربط الحساب. يرجى الانتظار دقيقة والمحاولة لاحقًا.'
              },
              429,
              {
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset)
              }
            );
          }
        }
      } catch (redisErr) {
        console.warn('[LinkCustomerOrders] Rate limiter fallback (fail open):', redisErr?.code || 'redis_err');
      }
    }

    let adminAuth = _deps?.adminAuth !== undefined ? _deps.adminAuth : null;
    let adminDb = _deps?.adminDb !== undefined ? _deps.adminDb : null;

    if (!adminAuth && !_deps?.simulateMissingAuth) {
      try {
        adminAuth = getAdminAuth();
      } catch {
        adminAuth = null;
      }
    }
    if (!adminDb && !_deps?.simulateMissingDb) {
      try {
        adminDb = getAdminDb();
      } catch {
        adminDb = null;
      }
    }

    if (!adminAuth || !adminDb) {
      return jsonResponse(
        {
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'خدمة ربط الطلبات غير متاحة مؤقتاً.'
        },
        503
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    if (!isPlainObject(body)) {
      body = {};
    }

    // Never accept uid or email from body; extract idToken from body or Bearer header
    const idToken =
      typeof body.idToken === 'string' && body.idToken.trim()
        ? body.idToken.trim()
        : extractBearerToken(request);

    if (!idToken) {
      return jsonResponse(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'رمز التحقق مطلوب لربط الطلبات.'
        },
        401
      );
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authErr) {
      console.warn('[LinkCustomerOrders] Invalid or expired token:', authErr?.code || 'invalid_token');
      return jsonResponse(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'انتهت جلسة تسجيل الدخول أو الرمز غير صالح.'
        },
        401
      );
    }

    const uid = typeof decodedToken?.uid === 'string' ? decodedToken.uid.trim() : '';
    if (!uid) {
      return jsonResponse(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'تعذر التحقق من هوية الحساب.'
        },
        401
      );
    }

    // Strict verified-email requirement for guest order linking ONLY
    if (decodedToken.email_verified !== true) {
      return jsonResponse(
        {
          success: false,
          linked: false,
          linkedCount: 0,
          error: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'ربط الطلبات السابقة بالحساب يتطلب توثيق البريد الإلكتروني أولاً. يمكنكِ متابعة استخدام حسابكِ بشكل طبيعي.'
        },
        403
      );
    }

    const rawTokenEmail = typeof decodedToken.email === 'string' ? decodedToken.email.trim() : '';
    const verifiedEmail = normalizeEmailForMatch(rawTokenEmail);
    if (!verifiedEmail || !isValidEmail(verifiedEmail)) {
      return jsonResponse(
        {
          success: false,
          linked: false,
          linkedCount: 0,
          error: 'VERIFIED_EMAIL_INVALID',
          message: 'لا يوجد بريد إلكتروني صالح موثق على الحساب لربط الطلبات السابقة.'
        },
        400
      );
    }

    // Query candidate guest orders matching verified email (check normalized lowercase and exact trimmed casing)
    const emailQueryTargets = new Set([verifiedEmail]);
    if (rawTokenEmail && rawTokenEmail !== verifiedEmail) {
      emailQueryTargets.add(rawTokenEmail);
    }

    const candidateOrderIds = new Set();
    for (const targetEmail of emailQueryTargets) {
      const snap = await adminDb
        .ref('orders')
        .orderByChild('email')
        .equalTo(targetEmail)
        .once('value');
      if (snap.exists()) {
        const ordersObj = snap.val();
        if (isPlainObject(ordersObj)) {
          for (const [orderId, orderData] of Object.entries(ordersObj)) {
            if (!isPlainObject(orderData)) continue;
            const orderEmail = normalizeEmailForMatch(orderData.email);
            if (!orderEmail || !isValidEmail(orderEmail) || orderEmail !== verifiedEmail) continue;
            if (!orderData.customerId) {
              candidateOrderIds.add(orderId);
            }
          }
        }
      }
    }

    let linkedCount = 0;
    let skippedOwnedByOther = 0;

    for (const orderId of candidateOrderIds) {
      const orderRef = adminDb.ref(`orders/${orderId}`);
      let txOutcome = 'skipped';

      const tx = await orderRef.transaction((current) => {
        txOutcome = 'skipped';
        if (!isPlainObject(current)) return undefined;

        const currentEmail = normalizeEmailForMatch(current.email);
        if (!currentEmail || !isValidEmail(currentEmail) || currentEmail !== verifiedEmail) {
          return undefined;
        }

        // Never overwrite an existing owner (even if racing with another account)
        if (current.customerId) {
          txOutcome = current.customerId === uid ? 'already_mine' : 'owned_by_other';
          return undefined;
        }

        txOutcome = 'linked';
        return {
          ...current,
          customerId: uid,
          linkedAt: new Date().toISOString(),
          linkedByMethod: 'verified_email'
        };
      });

      if (tx?.committed && txOutcome === 'linked') {
        linkedCount++;
      } else if (txOutcome === 'owned_by_other') {
        skippedOwnedByOther++;
      }
    }

    return jsonResponse(
      {
        success: true,
        linkedCount,
        skippedOwnedByOther,
        message:
          linkedCount > 0
            ? `تم ربط ${linkedCount} طلب/طلبات سابقة بحسابكِ عبر البريد الإلكتروني الموثق بنجاح.`
            : 'لا توجد طلبات ضيوف جديدة مطابقة للبريد الموثق للربط.'
      },
      200
    );
  } catch (err) {
    console.error('[LinkCustomerOrders Error]:', err?.code || 'link_orders_failed');
    return jsonResponse(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: 'حدث خطأ أثناء محاولة ربط الطلبات السابقة.'
      },
      500
    );
  }
}

export async function ALL() {
  return jsonResponse(
    {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'الطريقة غير مسموح بها'
    },
    405,
    { Allow: 'POST' }
  );
}
