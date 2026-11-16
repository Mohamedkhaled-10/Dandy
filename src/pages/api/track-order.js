export const prerender = false;

// src/pages/api/track-order.js
import { getAdminDb } from '../../utils/firebase-admin.ts';
import {
  getSafeClientIp,
  extractAstroClientAddress,
  checkServerRateLimit
} from '../../utils/server-rate-limit.ts';
import { normalizeEgyptianPhone, phonesMatch, extractFirstName } from '../../utils/phone.ts';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

const INVOICE_CODE_REGEX = /^DNY-[A-Z0-9-]{3,24}$/;

function methodNotAllowedResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'الطريقة غير مسموح بها'
    }),
    {
      status: 405,
      headers: {
        ...SECURITY_HEADERS,
        'Allow': 'POST'
      }
    }
  );
}

function serviceUnavailableResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      message: 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة بعد قليل.'
    }),
    {
      status: 503,
      headers: SECURITY_HEADERS
    }
  );
}

function rateLimitFailureResponse(rateLimitResult, exceededMessage) {
  if (!rateLimitResult || !rateLimitResult.available || rateLimitResult.reason === 'store_unavailable') {
    return serviceUnavailableResponse();
  }

  const headers = { ...SECURITY_HEADERS };
  if (
    typeof rateLimitResult.retryAfterSeconds === 'number' &&
    Number.isFinite(rateLimitResult.retryAfterSeconds) &&
    rateLimitResult.retryAfterSeconds > 0
  ) {
    headers['Retry-After'] = String(Math.ceil(rateLimitResult.retryAfterSeconds));
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: exceededMessage
    }),
    {
      status: 429,
      headers
    }
  );
}

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function normalizeInvoiceCode(rawCode) {
  if (typeof rawCode !== 'string') return null;
  const trimmed = rawCode.trim().toUpperCase();
  if (trimmed.length < 5 || trimmed.length > 28) return null;
  return INVOICE_CODE_REGEX.test(trimmed) ? trimmed : null;
}

function buildTrackedOrderWhitelist(rawOrder) {
  const whitelistedProducts = Array.isArray(rawOrder.products)
    ? rawOrder.products
        .filter((p) => isPlainObject(p))
        .map((p) => ({
          name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'منتج داندي',
          quantity: Number.isFinite(Number(p.quantity)) && Number(p.quantity) > 0
            ? Math.floor(Number(p.quantity))
            : 1
        }))
    : [];

  const tracked = {
    invoiceCode: String(rawOrder.invoiceCode || ''),
    firstName: extractFirstName(rawOrder.name),
    governorate: typeof rawOrder.governorate === 'string' ? rawOrder.governorate : '',
    city: typeof rawOrder.city === 'string' ? rawOrder.city : '',
    status: typeof rawOrder.status === 'string' && rawOrder.status.trim() ? rawOrder.status : 'جديد',
    products: whitelistedProducts,
    createdAt: rawOrder.createdAt || rawOrder.timestamp || null
  };

  if (typeof rawOrder.shippingStatus === 'string' && rawOrder.shippingStatus.trim()) {
    tracked.shippingStatus = rawOrder.shippingStatus.trim();
  }
  if (typeof rawOrder.shippingCompany === 'string' && rawOrder.shippingCompany.trim()) {
    tracked.shippingCompany = rawOrder.shippingCompany.trim();
  }
  if (
    (typeof rawOrder.lastStatusUpdate === 'string' && rawOrder.lastStatusUpdate.trim()) ||
    typeof rawOrder.lastStatusUpdate === 'number'
  ) {
    tracked.lastStatusUpdate = rawOrder.lastStatusUpdate;
  }

  const stageDates = {};
  for (const key of ['processingAt', 'shippedAt', 'deliveredAt', 'cancelledAt']) {
    if (
      (typeof rawOrder[key] === 'string' && rawOrder[key].trim()) ||
      typeof rawOrder[key] === 'number'
    ) {
      stageDates[key] = rawOrder[key];
    }
  }
  if (Object.keys(stageDates).length > 0) {
    tracked.stageDates = stageDates;
  }

  return tracked;
}

export async function POST(context) {
  const { request, _deps = null } = context || {};
  const clientAddress = extractAstroClientAddress(context);

  try {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'INVALID_CONTENT_TYPE',
          message: 'نوع المحتوى غير مدعوم، يرجى إرسال JSON.'
        }),
        { status: 415, headers: SECURITY_HEADERS }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'طلب غير صالح'
        }),
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    if (!isPlainObject(body)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'صيغة الطلب غير صالحة'
        }),
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    let adminDb = _deps?.adminDb || null;
    if (!adminDb && !_deps?.simulateMissingDb) {
      try {
        adminDb = getAdminDb();
      } catch {
        adminDb = null;
      }
    }

    // 1. Trusted Client IP + Fail-Closed Per-IP Rate Limit (15 requests / 10 min per IP)
    const clientIp = getSafeClientIp({
      request,
      clientAddress,
      ...(_deps?.ipContext || {})
    });
    if (!clientIp) {
      return serviceUnavailableResponse();
    }

    const ipRateLimit = await checkServerRateLimit({
      namespace: 'trackOrderIp',
      key: clientIp,
      maxRequests: 15,
      windowMs: 10 * 60 * 1000,
      adminDb,
      redis: _deps?.redis
    });

    if (!ipRateLimit.allowed) {
      return rateLimitFailureResponse(
        ipRateLimit,
        'تم تجاوز الحد المسموح من محاولات التتبع. يرجى المحاولة لاحقاً.'
      );
    }

    // 2. Strict input extraction & validation (ignore customerId, orderId, status, etc.)
    const invoiceCode = normalizeInvoiceCode(body.invoiceCode);
    const normalizedPhone = normalizeEgyptianPhone(body.phone);

    if (!invoiceCode || !normalizedPhone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'INVALID_INPUT',
          message: 'يرجى إدخال كود الفاتورة ورقم الهاتف بشكل صحيح.'
        }),
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // 3. Fail-Closed Per-target invoiceCode Rate Limit (6 attempts / 10 min per invoiceCode)
    const codeRateLimit = await checkServerRateLimit({
      namespace: 'trackOrderCode',
      key: invoiceCode,
      maxRequests: 6,
      windowMs: 10 * 60 * 1000,
      adminDb,
      redis: _deps?.redis
    });

    if (!codeRateLimit.allowed) {
      return rateLimitFailureResponse(
        codeRateLimit,
        'تم تجاوز الحد المسموح من المحاولات لهذا الطلب. يرجى المحاولة لاحقاً.'
      );
    }

    if (!adminDb) {
      console.error('[TrackOrder Error]: Firebase Admin DB is unavailable');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'SERVER_ERROR',
          message: 'حدث خطأ أثناء تتبع الطلب. يرجى المحاولة لاحقاً.'
        }),
        { status: 500, headers: SECURITY_HEADERS }
      );
    }

    // 4. Query orders strictly indexed by invoiceCode via Firebase Admin SDK
    const snap = await adminDb
      .ref('orders')
      .orderByChild('invoiceCode')
      .equalTo(invoiceCode)
      .once('value');

    const matchingMap = snap && typeof snap.val === 'function' ? snap.val() : null;
    let matchedOrder = null;

    if (isPlainObject(matchingMap)) {
      for (const orderRecord of Object.values(matchingMap)) {
        if (!isPlainObject(orderRecord)) continue;
        if (phonesMatch(normalizedPhone, orderRecord.phone)) {
          matchedOrder = orderRecord;
          break;
        }
      }
    }

    // Uniform generic error to prevent invoiceCode enumeration
    if (!matchedOrder) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND_OR_MISMATCH',
          message: 'تعذر العثور على الطلب أو بيانات التحقق غير مطابقة.'
        }),
        { status: 404, headers: SECURITY_HEADERS }
      );
    }

    // 5. Return strict whitelist only
    const whitelistedOrder = buildTrackedOrderWhitelist(matchedOrder);

    return new Response(
      JSON.stringify({
        success: true,
        order: whitelistedOrder
      }),
      { status: 200, headers: SECURITY_HEADERS }
    );
  } catch (err) {
    console.error('[TrackOrder Error]:', err?.message || 'unexpected_error');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'SERVER_ERROR',
        message: 'حدث خطأ أثناء تتبع الطلب. يرجى المحاولة لاحقاً.'
      }),
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

export async function GET() {
  return methodNotAllowedResponse();
}

export async function ALL() {
  return methodNotAllowedResponse();
}
