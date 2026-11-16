export const prerender = false;

// src/pages/api/order-attempt-status.js
// Safe, non-duplicating idempotency inspection & crash-recovery endpoint.
// Never creates a new PENDING lock or new order.
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getAdminApp } from '../../utils/firebase-admin.ts';
import {
  getSafeClientIp,
  extractAstroClientAddress,
  checkServerRateLimit
} from '../../utils/server-rate-limit.ts';
import { parseEncryptionKey } from '../../utils/invoice-token.ts';
import {
  isValidUuidV4,
  computeOrderRequestFingerprint,
  inspectOrRecoverOrderAttempt
} from '../../utils/order-idempotency.ts';
import { validateCouponCode, roundCurrency } from '../../utils/coupons.ts';
import { sendOrderNotification } from '../../utils/email-service.ts';
import {
  dispatchTelegramOutboxNotification,
  dispatchMakeWebhookOutboxNotification
} from '../../utils/notifications-outbox.ts';
import { sendTelegramNotification } from '../../utils/telegram.js';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      ...extraHeaders
    }
  });
}

function serviceUnavailableResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      canResetAttempt: false,
      message: 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة بعد قليل.'
    },
    503
  );
}

async function runRecoveredPostCommitNotifications({
  orderData,
  orderId,
  invoiceAccessToken,
  adminDb,
  _deps = null
}) {
  try {
    const sendEmailFn = _deps?.sendOrderNotification || sendOrderNotification;
    const sendTgFn = _deps?.sendTelegramNotification || sendTelegramNotification;
    const emailTimeoutMs =
      typeof _deps?.emailTimeoutMs === 'number' && _deps.emailTimeoutMs > 0
        ? _deps.emailTimeoutMs
        : 4500;

    await Promise.allSettled([
      Promise.resolve()
        .then(() =>
          sendEmailFn({
            order: orderData,
            orderId,
            eventType: 'ORDER_CONFIRMATION',
            invoiceAccessToken,
            adminDb,
            timeoutMs: emailTimeoutMs,
            ...(_deps?.encryptionKey !== undefined ? { encryptionKey: _deps.encryptionKey } : {})
          })
        )
        .catch(() => null),
      Promise.resolve()
        .then(() =>
          dispatchTelegramOutboxNotification({
            orderId,
            orderData,
            adminDb,
            sendTelegramFn: sendTgFn,
            timeoutMs: 4000
          })
        )
        .catch(() => null),
      Promise.resolve()
        .then(() =>
          dispatchMakeWebhookOutboxNotification({
            orderId,
            orderData,
            adminDb,
            fetchFn: _deps?.fetch || globalThis.fetch,
            makeWebhookUrl: _deps?.makeWebhookUrl !== undefined ? _deps.makeWebhookUrl : process.env.MAKE_WEBHOOK_URL,
            timeoutMs: _deps?.makeTimeoutMs || 4000
          })
        )
        .catch(() => null)
    ]);
  } catch {
    // Isolate post-commit notification errors completely
  }
}

export async function POST(context) {
  const { request, _deps = null } = context || {};
  const clientAddress = extractAstroClientAddress(context);

  try {
    const contentType = (request?.headers?.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_CONTENT_TYPE',
          canResetAttempt: false,
          message: 'نوع المحتوى غير مدعوم، يرجى إرسال JSON.'
        },
        415
      );
    }

    let adminDb = _deps?.adminDb || null;
    if (!adminDb && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        adminDb = getDatabase(getAdminApp());
      } catch {
        adminDb = null;
      }
    }

    const ipCtx = {
      request,
      clientAddress,
      ...(_deps?.ipContext && typeof _deps.ipContext === 'object' ? _deps.ipContext : {})
    };
    const clientIp = getSafeClientIp(ipCtx);
    if (!clientIp) {
      return serviceUnavailableResponse();
    }

    const injectedRedis =
      _deps?.redis !== undefined
        ? _deps.redis
        : (_deps?.orderLimiter !== undefined ? _deps.orderLimiter : undefined);

    const rateLimitResult = await checkServerRateLimit({
      namespace: 'orderAttemptStatus',
      key: clientIp,
      maxRequests: 30,
      windowMs: 60_000,
      adminDb,
      ...(injectedRedis !== undefined ? { redis: injectedRedis } : {})
    });

    if (!rateLimitResult.allowed) {
      if (!rateLimitResult.available || rateLimitResult.reason === 'store_unavailable') {
        return serviceUnavailableResponse();
      }
      return jsonResponse(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          canResetAttempt: false,
          message: 'تم تجاوز الحد المسموح للتحقق من حالة الطلب. يرجى الانتظار قليلاً.'
        },
        429,
        {
          ...(rateLimitResult.retryAfterSeconds
            ? { 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterSeconds)) }
            : {})
        }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_JSON',
          canResetAttempt: false,
          message: 'صيغة البيانات المرسلة غير صالحة.'
        },
        400
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_JSON',
          canResetAttempt: false,
          message: 'صيغة البيانات المرسلة غير صالحة.'
        },
        400
      );
    }

    const clientRequestId = typeof body.clientRequestId === 'string' ? body.clientRequestId.trim() : '';
    if (!isValidUuidV4(clientRequestId)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_CLIENT_REQUEST_ID',
          canResetAttempt: false,
          message: 'معرف الطلب غير صالح.'
        },
        400
      );
    }

    if (!adminDb) {
      return serviceUnavailableResponse();
    }

    try {
      parseEncryptionKey(_deps?.encryptionKey);
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'SERVER_CONFIG_ERROR',
          canResetAttempt: false,
          message: 'إعدادات الأمان على السيرفر غير مكتملة.'
        },
        500
      );
    }

    const customer = body.customer && typeof body.customer === 'object' && !Array.isArray(body.customer)
      ? body.customer
      : {};
    const items = Array.isArray(body.items) ? body.items : [];
    const name = typeof customer.name === 'string' ? customer.name.trim() : '';
    const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
    const email = typeof customer.email === 'string' ? customer.email.trim() : 'N/A';
    const governorate = typeof customer.governorate === 'string' ? customer.governorate.trim() : '';
    const city = typeof customer.city === 'string' ? customer.city.trim() : '';
    const address = typeof customer.address === 'string' ? customer.address.trim() : '';

    let requestedCouponCode = null;
    if (typeof body.couponCode === 'string' && body.couponCode.trim() !== '') {
      const check = validateCouponCode(body.couponCode);
      requestedCouponCode = check.valid && check.normalizedCode ? check.normalizedCode : body.couponCode.trim().toUpperCase();
    }

    const adminAuth =
      _deps?.adminAuth !== undefined
        ? _deps.adminAuth
        : (process.env.FIREBASE_SERVICE_ACCOUNT ? getAuth(getAdminApp()) : null);

    let customerId = null;
    if (body.idToken && adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(body.idToken);
        customerId = decoded.uid || null;
      } catch {
        customerId = null;
      }
    }

    const requestFingerprint = computeOrderRequestFingerprint({
      name,
      phone,
      email,
      governorate,
      city,
      address,
      customerId,
      couponCode: requestedCouponCode,
      items
    });

    const outcome = await inspectOrRecoverOrderAttempt({
      clientRequestId,
      requestFingerprint,
      adminDb,
      encryptionKey: _deps?.encryptionKey,
      commitLeaseMs: _deps?.commitLeaseMs,
      ttlMs: _deps?.idempotencyTtlMs,
      nowMs: typeof _deps?.now === 'function' ? _deps.now() : undefined,
      beforeVerifyMaterialization: _deps?.beforeVerifyMaterialization
    });

    if (outcome.state === 'COMPLETED') {
      return jsonResponse({
        ...outcome.payload,
        state: 'COMPLETED',
        recovered: outcome.recovered,
        canResetAttempt: false
      }, 200);
    }

    if (outcome.state === 'RECOVERED_COMMITTING') {
      const commitPayload = outcome.commitRecord.commitPayload;
      await runRecoveredPostCommitNotifications({
        orderData: commitPayload.orderData,
        orderId: commitPayload.orderId,
        invoiceAccessToken: outcome.invoiceAccessToken,
        adminDb,
        _deps
      });

      const recoveredCoupon = commitPayload.orderData?.coupon;
      const recoveredCouponFields =
        recoveredCoupon && typeof recoveredCoupon === 'object' && recoveredCoupon.code && Number(recoveredCoupon.discountAmount) > 0
          ? {
              couponCode: String(recoveredCoupon.code),
              couponDiscountAmount: roundCurrency(Number(recoveredCoupon.discountAmount))
            }
          : {};

      return jsonResponse(
        {
          success: true,
          state: 'COMPLETED',
          recovered: true,
          canResetAttempt: false,
          orderId: commitPayload.orderId,
          invoiceCode: commitPayload.invoiceCode,
          subtotal: commitPayload.orderData.subtotal,
          ...recoveredCouponFields,
          shippingFee: commitPayload.orderData.shippingFee,
          totalAmount: commitPayload.orderData.totalAmount,
          invoiceAccessToken: outcome.invoiceAccessToken,
          message: 'تم تأكيد طلبك بنجاح'
        },
        200
      );
    }

    if (outcome.state === 'IN_PROGRESS') {
      return jsonResponse(
        {
          success: true,
          state: 'IN_PROGRESS',
          stage: outcome.stage,
          retryAfterSeconds: outcome.retryAfterSeconds,
          canResetAttempt: false,
          message: 'لا يزال الطلب قيد الاستكمال على السيرفر، يرجى الانتظار بضع ثوانٍ.'
        },
        200
      );
    }

    if (outcome.state === 'SAFE_TO_RESET') {
      return jsonResponse(
        {
          success: true,
          state: 'SAFE_TO_RESET',
          reason: outcome.reason,
          canResetAttempt: true,
          message: 'لم يتم إنشاء طلب لهذا المعرف؛ يمكنكِ بدء محاولة طلب جديدة بأمان.'
        },
        200
      );
    }

    if (outcome.state === 'CONFLICT') {
      return jsonResponse(
        {
          success: true,
          state: 'CONFLICT',
          previousOrderExists: outcome.previousOrderExists,
          canResetAttempt: true,
          message: outcome.previousOrderExists
            ? 'تم تعديل بيانات الطلب عن المحاولة السابقة المكتملة؛ يمكنكِ بدء محاولة جديدة أو التحقق من تتبع الطلب.'
            : 'تم تعديل بيانات الطلب عن المحاولة السابقة؛ يمكنكِ بدء محاولة جديدة بأمان.'
        },
        200
      );
    }

    if (outcome.state === 'EXPIRED') {
      return jsonResponse(
        {
          success: true,
          state: 'EXPIRED',
          canResetAttempt: false,
          message: 'انتهت صلاحية هذا المعرف. يرجى مراجعة بريدكِ أو صفحة تتبع الطلب قبل إنشاء طلب جديد.'
        },
        200
      );
    }

    if (outcome.state === 'DELETED') {
      return jsonResponse(
        {
          success: false,
          state: 'DELETED',
          error: 'ORDER_DELETED',
          canResetAttempt: false,
          message: 'تم حذف هذا الطلب إدارياً ولا يمكن إعادة إنشائه بنفس المعرف.'
        },
        409
      );
    }

    return serviceUnavailableResponse();
  } catch (err) {
    console.error('[OrderAttemptStatus] Internal error:', err?.code || err?.message || 'error');
    return serviceUnavailableResponse();
  }
}

export async function ALL() {
  return jsonResponse(
    {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'الطريقة غير مسموح بها.'
    },
    405,
    { Allow: 'POST' }
  );
}
