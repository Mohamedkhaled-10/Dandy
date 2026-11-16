export const prerender = false;

// src/pages/api/coupons/analytics.js
// Protected Admin-Only Coupon Analytics & CSV Export API (GROUP 2A.7)
// Reads orders and settings/coupons via Firebase Admin only. Zero writes. Zero customer PII.

import { getAdminDb } from '../../../utils/firebase-admin.ts';
import { verifyAdminRequest, adminUnauthorizedResponse } from '../../../utils/admin-auth.js';
import {
  aggregateCouponAnalytics,
  buildCouponAnalyticsCsv,
  parseAnalyticsFilters,
  VALID_CSV_DATASETS
} from '../../../utils/coupon-analytics.ts';

const ORDERS_RTDB_PATH = 'orders';
const COUPONS_RTDB_PATH = 'settings/coupons';

const PRIVATE_NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...PRIVATE_NO_CACHE_HEADERS,
      ...extraHeaders
    }
  });
}

function methodNotAllowedResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'الطريقة غير مسموح بها. يُسمح بطلبات GET فقط.'
    },
    405,
    { Allow: 'GET' }
  );
}

const SUPPORTED_QUERY_KEYS = new Set([
  'period',
  'from',
  'to',
  'couponId',
  'categorySlug',
  'status',
  'scope',
  'discountType',
  'format',
  'dataset'
]);

export async function GET({ request, _deps = undefined }) {
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    const unauthRes = adminUnauthorizedResponse(authResult);
    return new Response(unauthRes.body, {
      status: unauthRes.status,
      headers: {
        ...Object.fromEntries(unauthRes.headers.entries()),
        ...PRIVATE_NO_CACHE_HEADERS
      }
    });
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_REQUEST_URL',
        message: 'رابط الطلب غير صالح.'
      },
      400
    );
  }

  for (const key of url.searchParams.keys()) {
    if (!SUPPORTED_QUERY_KEYS.has(key)) {
      return jsonResponse(
        {
          success: false,
          error: 'UNSUPPORTED_QUERY_PARAMETER',
          message: 'معامل البحث المرسل غير مدعوم.'
        },
        400
      );
    }
  }

  const rawFormat = (url.searchParams.get('format') || '').trim().toLowerCase();
  if (rawFormat && rawFormat !== 'json' && rawFormat !== 'csv') {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_EXPORT_FORMAT',
        message: 'صيغة التصدير المطلوبة غير مدعومة.'
      },
      400
    );
  }

  const rawDataset = (url.searchParams.get('dataset') || '').trim().toLowerCase();
  if (rawDataset && !VALID_CSV_DATASETS.includes(rawDataset)) {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_EXPORT_DATASET',
        message: 'نوع بيانات التصدير المطلوب غير مدعوم.'
      },
      400
    );
  }

  const isCsvExport = rawFormat === 'csv';
  const csvDataset = isCsvExport ? (rawDataset || 'coupons') : null;

  const nowMs =
    typeof _deps?.nowMs === 'number' && Number.isFinite(_deps.nowMs)
      ? _deps.nowMs
      : typeof _deps?.getNowMs === 'function'
        ? _deps.getNowMs()
        : Date.now();

  const rawFilters = {
    period: url.searchParams.get('period') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    couponId: url.searchParams.get('couponId') ?? undefined,
    categorySlug: url.searchParams.get('categorySlug') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    scope: url.searchParams.get('scope') ?? undefined,
    discountType: url.searchParams.get('discountType') ?? undefined
  };

  const filterValidation = parseAnalyticsFilters(rawFilters, nowMs);
  if (!filterValidation.valid) {
    return jsonResponse(
      {
        success: false,
        error: filterValidation.error,
        message: filterValidation.message
      },
      400
    );
  }

  let db = null;
  try {
    db = _deps && 'adminDb' in _deps ? _deps.adminDb : getAdminDb();
  } catch {
    db = null;
  }
  if (!db) {
    return jsonResponse(
      {
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'تعذر الاتصال بخدمة قاعدة البيانات الإدارية.'
      },
      503
    );
  }

  try {
    const [ordersSnap, couponsSnap] = await Promise.all([
      db.ref(ORDERS_RTDB_PATH).once('value'),
      db.ref(COUPONS_RTDB_PATH).once('value')
    ]);

    const ordersVal = ordersSnap && typeof ordersSnap.val === 'function' ? ordersSnap.val() : null;
    const couponsVal = couponsSnap && typeof couponsSnap.val === 'function' ? couponsSnap.val() : null;

    const report = aggregateCouponAnalytics({
      orders: ordersVal || {},
      rawCoupons: couponsVal || {},
      filters: rawFilters,
      nowMs,
      includeAllUsesForCsv: isCsvExport && csvDataset === 'uses'
    });

    if (isCsvExport && csvDataset) {
      const { filename, csvContent } = buildCouponAnalyticsCsv({
        report,
        dataset: csvDataset
      });
      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          ...PRIVATE_NO_CACHE_HEADERS
        }
      });
    }

    return jsonResponse(report, 200);
  } catch (err) {
    console.error('[Coupon Analytics API] Error generating report:', err?.code || err?.message || 'unknown_error');
    return jsonResponse(
      {
        success: false,
        error: 'ANALYTICS_FETCH_FAILED',
        message: 'تعذر تحميل تحليلات الكوبونات في الوقت الحالي.'
      },
      503
    );
  }
}

export async function POST() {
  return methodNotAllowedResponse();
}

export async function PUT() {
  return methodNotAllowedResponse();
}

export async function PATCH() {
  return methodNotAllowedResponse();
}

export async function DELETE() {
  return methodNotAllowedResponse();
}

export async function ALL() {
  return methodNotAllowedResponse();
}
