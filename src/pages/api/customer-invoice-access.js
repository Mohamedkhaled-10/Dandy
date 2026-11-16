export const prerender = false;

// src/pages/api/customer-invoice-access.js
import { getAdminDb, getAdminAuth } from '../../utils/firebase-admin.ts';
import {
  getSafeClientIp,
  extractAstroClientAddress,
  checkServerRateLimit
} from '../../utils/server-rate-limit.ts';
import {
  getOrCreateInvoiceToken,
  isValidInvoiceTokenFormat
} from '../../utils/invoice-token.ts';

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

function methodNotAllowedResponse() {
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

function unauthorizedResponse(message = 'غير مصرح بالوصول. يرجى تسجيل الدخول مرة أخرى.') {
  return jsonResponse(
    {
      success: false,
      error: 'UNAUTHORIZED',
      message
    },
    401
  );
}

function notFoundOrForbiddenResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'ORDER_NOT_FOUND_OR_FORBIDDEN',
      message: 'تعذر العثور على الفاتورة المطلوبة.'
    },
    404
  );
}

function serviceUnavailableResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      message: 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة بعد قليل.'
    },
    503
  );
}

function rateLimitFailureResponse(rateLimitResult) {
  if (!rateLimitResult || !rateLimitResult.available || rateLimitResult.reason === 'store_unavailable') {
    return serviceUnavailableResponse();
  }

  const headers = {};
  if (
    typeof rateLimitResult.retryAfterSeconds === 'number' &&
    Number.isFinite(rateLimitResult.retryAfterSeconds) &&
    rateLimitResult.retryAfterSeconds > 0
  ) {
    headers['Retry-After'] = String(Math.ceil(rateLimitResult.retryAfterSeconds));
  }

  return jsonResponse(
    {
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار قليلاً.'
    },
    429,
    headers
  );
}

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function extractBearerToken(request) {
  const authHeader = request?.headers?.get('authorization') || request?.headers?.get('Authorization') || '';
  if (typeof authHeader !== 'string') return null;
  const match = authHeader.trim().match(/^Bearer\s+([^\s]+)$/i);
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  if (token.length < 10 || token.length > 8192) return null;
  return token;
}

function validateOrderId(rawOrderId) {
  if (typeof rawOrderId !== 'string') return null;
  const trimmed = rawOrderId.trim();
  if (!trimmed || trimmed.length > 128 || /[.#$\[\]/]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export async function POST(context) {
  const { request, _deps = null } = context || {};
  const clientAddress = extractAstroClientAddress(context);

  try {
    // 1. Validate Content-Type
    const contentType = (request?.headers?.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_CONTENT_TYPE',
          message: 'نوع المحتوى غير مدعوم، يرجى إرسال JSON.'
        },
        415
      );
    }

    // 2. Parse JSON body safely
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'صيغة الطلب غير صالحة.'
        },
        400
      );
    }

    if (!isPlainObject(body)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_REQUEST',
          message: 'صيغة الطلب غير صالحة.'
        },
        400
      );
    }

    // 3. Resolve Admin DB & trusted IP + Fail-Closed Rate Limiting
    let adminDb = _deps?.adminDb || null;
    if (!adminDb && !_deps?.simulateMissingDb) {
      try {
        adminDb = getAdminDb();
      } catch {
        adminDb = null;
      }
    }

    const clientIp = getSafeClientIp({
      request,
      clientAddress,
      ...(_deps?.ipContext || {})
    });
    if (!clientIp) {
      return serviceUnavailableResponse();
    }

    const rateLimitResult = await checkServerRateLimit({
      namespace: 'customerInvoiceAccess',
      key: clientIp,
      maxRequests: 60,
      windowMs: 10 * 60 * 1000,
      adminDb,
      redis: _deps?.redis
    });

    if (!rateLimitResult.allowed) {
      return rateLimitFailureResponse(rateLimitResult);
    }

    // 4. Verify Firebase Bearer ID Token strictly
    const idToken = extractBearerToken(request);
    if (!idToken) {
      return unauthorizedResponse();
    }

    let adminAuth = _deps?.adminAuth !== undefined ? _deps.adminAuth : null;
    if (adminAuth === null && _deps?.adminAuth === undefined && !_deps?.simulateMissingAuth) {
      try {
        adminAuth = getAdminAuth();
      } catch {
        adminAuth = null;
      }
    }

    if (!adminAuth || typeof adminAuth.verifyIdToken !== 'function') {
      console.error('[CustomerInvoiceAccess Error]: Firebase Admin Auth is unavailable');
      return jsonResponse(
        {
          success: false,
          error: 'SERVER_ERROR',
          message: 'تعذر التحقق من جلسة المستخدم حالياً. يرجى المحاولة لاحقاً.'
        },
        500
      );
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return unauthorizedResponse('انتهت صلاحية الجلسة أو بيانات الدخول غير صالحة. يرجى تسجيل الدخول مرة أخرى.');
    }

    const uid = typeof decodedToken?.uid === 'string' ? decodedToken.uid.trim() : '';
    if (!uid) {
      return unauthorizedResponse();
    }

    // 5. Validate requested orderId strictly
    const orderId = validateOrderId(body.orderId);
    if (!orderId) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_ORDER_ID',
          message: 'معرف الطلب غير صالح.'
        },
        400
      );
    }

    if (!adminDb || typeof adminDb.ref !== 'function') {
      console.error('[CustomerInvoiceAccess Error]: Firebase Admin DB is unavailable');
      return jsonResponse(
        {
          success: false,
          error: 'SERVER_ERROR',
          message: 'حدث خطأ أثناء فتح الفاتورة. يرجى المحاولة لاحقاً.'
        },
        500
      );
    }

    // 6. Verify Order Exists AND Belongs to Authenticated User (Anti-Enumeration: identical 404 for missing vs non-owned)
    const orderSnap = await adminDb.ref(`orders/${orderId}`).once('value');
    const orderRecord = orderSnap && typeof orderSnap.val === 'function' ? orderSnap.val() : null;

    if (!orderSnap?.exists?.() || !isPlainObject(orderRecord)) {
      return notFoundOrForbiddenResponse();
    }

    const orderOwnerUid =
      typeof orderRecord.customerId === 'string' ? orderRecord.customerId.trim() : '';
    if (!orderOwnerUid || orderOwnerUid !== uid) {
      return notFoundOrForbiddenResponse();
    }

    // 7. Retrieve existing encrypted invoice token (with safe lazy creation/migration for legacy orders)
    const invoiceAccessToken = await getOrCreateInvoiceToken(orderId, adminDb, {
      ...(_deps?.encryptionKey !== undefined ? { encryptionKey: _deps.encryptionKey } : {})
    });

    if (!isValidInvoiceTokenFormat(invoiceAccessToken)) {
      throw new Error('INVALID_TOKEN_GENERATED');
    }

    return jsonResponse(
      {
        success: true,
        invoiceAccessToken
      },
      200
    );
  } catch (err) {
    const errMsg = err?.message || '';
    if (/revoked/i.test(errMsg)) {
      return notFoundOrForbiddenResponse();
    }

    console.error('[CustomerInvoiceAccess Error]:', err?.code || err?.name || 'unexpected_error');
    return jsonResponse(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: 'تعذر إصدار رابط الفاتورة مؤقتاً. يرجى المحاولة لاحقاً.'
      },
      500
    );
  }
}

export async function GET() {
  return methodNotAllowedResponse();
}

export async function ALL() {
  return methodNotAllowedResponse();
}
