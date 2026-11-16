export const prerender = false;

// src/pages/api/submit-review.js
import { getAdminDb, getAdminAuth } from '../../utils/firebase-admin.ts';
import { normalizeOrderStatus } from '../../utils/email-service.ts';

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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: SECURITY_HEADERS
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

function isValidRtdbKey(val) {
  return typeof val === 'string' && val.trim().length > 0 && val.trim().length <= 128 && !/[.#$\[\]/]/.test(val.trim());
}

/**
 * Checks whether cleanProductId exists in the purchased order's products list
 * (supports top-level items and nested Pink Friday collection items).
 */
function orderContainsProduct(orderData, cleanProductId) {
  const rawProducts = orderData?.products;
  const list = Array.isArray(rawProducts)
    ? rawProducts
    : (isPlainObject(rawProducts) ? Object.values(rawProducts) : []);

  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const rawItemPid = item.id || item.productId || '';
    const cleanItemPid = String(rawItemPid).split('::')[0].trim();
    if (cleanItemPid && cleanItemPid === cleanProductId) {
      return true;
    }

    if (Array.isArray(item.items)) {
      for (const sub of item.items) {
        if (!isPlainObject(sub)) continue;
        const subPid = String(sub.productId || sub.id || '').split('::')[0].trim();
        if (subPid && subPid === cleanProductId) {
          return true;
        }
      }
    }
  }
  return false;
}

function computeAggregates(reviewsMap) {
  const items = isPlainObject(reviewsMap) ? Object.values(reviewsMap).filter(isPlainObject) : [];
  const reviewCount = items.length;
  const sumRatings = items.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const avgRating = reviewCount > 0 ? Math.round((sumRatings / reviewCount) * 10) / 10 : 0;
  return { avgRating, reviewCount };
}

export async function POST({ request, _deps = undefined }) {
  try {
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
          message: 'خدمة التقييمات غير متاحة مؤقتاً.'
        },
        503
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
          message: 'صيغة البيانات المرسلة غير صالحة.'
        },
        400
      );
    }

    if (!isPlainObject(body)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_JSON',
          message: 'صيغة البيانات المرسلة غير صالحة.'
        },
        400
      );
    }

    const { productId, rating, comment, orderId, invoiceCode } = body;
    const idToken = typeof body.idToken === 'string' && body.idToken.trim()
      ? body.idToken.trim()
      : extractBearerToken(request);

    // 1. Verify Firebase ID token via Admin SDK
    if (!idToken || typeof idToken !== 'string') {
      return jsonResponse(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'يجب تسجيل الدخول لإرسال التقييم.'
        },
        401
      );
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authErr) {
      console.warn('[SubmitReview] Token verification failed:', authErr?.code || 'invalid_token');
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_TOKEN',
          message: 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.'
        },
        401
      );
    }

    const customerId = decodedToken?.uid;
    if (!customerId || !isValidRtdbKey(customerId)) {
      return jsonResponse(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'تعذر التحقق من هوية الحساب.'
        },
        401
      );
    }

    // 2. Validate productId & rating
    if (!isValidRtdbKey(productId)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'معرف المنتج مطلوب وغير صالح.'
        },
        400
      );
    }
    const cleanProductId = productId.trim().split('::')[0].trim();
    if (!isValidRtdbKey(cleanProductId)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_PRODUCT_ID',
          message: 'معرف المنتج مطلوب وغير صالح.'
        },
        400
      );
    }

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_RATING',
          message: 'التقييم يجب أن يكون عددًا صحيحًا بين 1 و 5 نجوم.'
        },
        400
      );
    }

    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 1000) : '';

    // 3. Resolve target order authoritatively from DB (supports orderId key + legacy DNY-* invoiceCode)
    const rawOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const rawInvoiceCode = typeof invoiceCode === 'string' ? invoiceCode.trim() : '';

    let resolvedOrderId = null;
    let orderData = null;

    if (rawOrderId && rawOrderId !== 'N/A' && !rawOrderId.toUpperCase().startsWith('DNY-')) {
      if (!isValidRtdbKey(rawOrderId)) {
        return jsonResponse(
          {
            success: false,
            error: 'INVALID_ORDER_ID',
            message: 'معرف الطلب غير صالح.'
          },
          400
        );
      }
      const orderSnap = await adminDb.ref(`orders/${rawOrderId}`).once('value');
      const val = orderSnap.val();
      if (isPlainObject(val)) {
        resolvedOrderId = rawOrderId;
        orderData = val;
      }
    } else {
      const lookupCode = (rawInvoiceCode || rawOrderId).trim().toUpperCase();
      if (!lookupCode || lookupCode === 'N/A' || !/^DNY-[A-Z0-9-]{3,24}$/.test(lookupCode)) {
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_ID_REQUIRED',
            message: 'معرف الطلب مطلوب للتحقق من أحقية التقييم.'
          },
          400
        );
      }

      const querySnap = await adminDb
        .ref('orders')
        .orderByChild('invoiceCode')
        .equalTo(lookupCode)
        .once('value');
      const matches = querySnap.val();

      if (isPlainObject(matches)) {
        const entries = Object.entries(matches).filter(([, v]) => isPlainObject(v));
        const ownedMatch = entries.find(([, v]) => v.customerId === customerId);
        const chosen = ownedMatch || entries[0];
        if (chosen) {
          resolvedOrderId = chosen[0];
          orderData = chosen[1];
        }
      }
    }

    if (!resolvedOrderId || !isPlainObject(orderData)) {
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: 'لم يتم العثور على الطلب المحدد.'
        },
        404
      );
    }

    // 4. Verify strict order ownership
    if (orderData.customerId !== customerId) {
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_OWNERSHIP_REQUIRED',
          message: 'غير مصرح بتقييم منتجات طلب لا يعود لحسابكِ.'
        },
        403
      );
    }

    // 5. Verify canonical delivered status using project's canonical status normalizer
    const canonicalStatus = normalizeOrderStatus(orderData.status);
    if (canonicalStatus !== 'تم التوصيل') {
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_NOT_DELIVERED',
          message: 'يمكن تقييم المنتج فقط بعد تسليم الطلب (تم التوصيل).'
        },
        403
      );
    }

    // 6. Verify product belongs to the verified order
    if (!orderContainsProduct(orderData, cleanProductId)) {
      return jsonResponse(
        {
          success: false,
          error: 'PRODUCT_NOT_IN_ORDER',
          message: 'هذا المنتج غير موجود ضمن منتجات الطلب المحدد.'
        },
        403
      );
    }

    // 7. Verify product exists in catalog
    const productSnap = await adminDb.ref(`products/${cleanProductId}`).once('value');
    if (!productSnap.exists || !productSnap.exists()) {
      return jsonResponse(
        {
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: 'المنتج غير موجود.'
        },
        404
      );
    }

    // 8. Derive trusted customer name strictly from DB profile / verified order / token (NEVER trust client body)
    let trustedCustomerName = '';
    try {
      const custNameSnap = await adminDb.ref(`customers/${customerId}/name`).once('value');
      const dbName = custNameSnap.val();
      if (typeof dbName === 'string' && dbName.trim()) {
        trustedCustomerName = dbName.trim().slice(0, 100);
      }
    } catch {
      // non-fatal fallback below
    }

    if (!trustedCustomerName && typeof orderData.name === 'string' && orderData.name.trim()) {
      trustedCustomerName = orderData.name.trim().slice(0, 100);
    }
    if (!trustedCustomerName) {
      const tokenName =
        (typeof decodedToken.name === 'string' && decodedToken.name.trim()) ||
        (typeof decodedToken.email === 'string' && decodedToken.email.includes('@')
          ? decodedToken.email.split('@')[0]
          : '');
      trustedCustomerName = (tokenName || 'عميلة داندي').trim().slice(0, 100);
    }

    // 9. Atomic CAS transaction on reviews/$productId so concurrent edits/submissions never duplicate or drop reviews
    const nowMs = Date.now();
    const productReviewsRef = adminDb.ref(`reviews/${cleanProductId}`);
    let committedReview = null;

    const tx = await productReviewsRef.transaction((currentReviews) => {
      const map = isPlainObject(currentReviews) ? { ...currentReviews } : {};
      const existing = isPlainObject(map[customerId]) ? map[customerId] : null;
      const reviewEntry = {
        rating: ratingNum,
        comment: cleanComment,
        customerName: trustedCustomerName,
        orderId: resolvedOrderId,
        createdAt: existing && Number.isFinite(Number(existing.createdAt)) ? Number(existing.createdAt) : nowMs,
        updatedAt: nowMs
      };
      committedReview = reviewEntry;
      map[customerId] = reviewEntry;
      return map;
    });

    if (!tx?.committed) {
      return jsonResponse(
        {
          success: false,
          error: 'REVIEW_CONFLICT',
          message: 'تعذر حفظ التقييم بسبب تحديث متزامن. يرجى المحاولة مرة أخرى.'
        },
        409
      );
    }

    if (typeof _deps?.beforeProductAggregateUpdate === 'function') {
      await _deps.beforeProductAggregateUpdate({ cleanProductId, customerId, adminDb });
    }

    // 10. Compute aggregates & converge products/$productId against the latest committed reviews map
    let { avgRating, reviewCount } = computeAggregates(tx.snapshot?.val?.() || {});
    await adminDb.ref(`products/${cleanProductId}`).update({ avgRating, reviewCount });

    // Post-write verify-and-converge read to guarantee zero stale aggregates under concurrency
    const latestReviewsSnap = await productReviewsRef.once('value');
    const latestAgg = computeAggregates(latestReviewsSnap.val() || {});
    if (latestAgg.avgRating !== avgRating || latestAgg.reviewCount !== reviewCount) {
      avgRating = latestAgg.avgRating;
      reviewCount = latestAgg.reviewCount;
      await adminDb.ref(`products/${cleanProductId}`).update({ avgRating, reviewCount });
    }

    return jsonResponse(
      {
        success: true,
        data: {
          review: committedReview,
          avgRating,
          reviewCount
        },
        message: 'تم حفظ التقييم بنجاح وتحديث بيانات المنتج.'
      },
      200
    );
  } catch (err) {
    console.error('[SubmitReview Error]:', err?.code || err?.message || 'submit_review_failed');
    return jsonResponse(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: 'حدث خطأ في معالجة التقييم على السيرفر.'
      },
      500
    );
  }
}

export async function ALL() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'الطريقة غير مسموح بها'
    }),
    {
      status: 405,
      headers: { ...SECURITY_HEADERS, Allow: 'POST' }
    }
  );
}
