export const prerender = false;

// src/pages/api/coupons/validate.js
// Public, Guest-Friendly Coupon Validation & Preview API (GROUP 2A.6)
import { getAdminDb } from '../../../utils/firebase-admin.ts';
import {
  getSafeClientIp,
  extractAstroClientAddress,
  checkServerRateLimit
} from '../../../utils/server-rate-limit.ts';
import {
  getPublishedPinkFridayCampaign,
  getCampaignStatus,
  calculatePinkFridayPricing
} from '../../../utils/pink-friday-server.ts';
import { calculateShippingFee } from '../../../config/store-policy.ts';
import {
  validateAndResolveOrderItemVariants,
  calculateAuthoritativeItemPricing,
  validateCollectionSelectedItemsInput,
  matchCollectionClientChoice,
  validateAndResolveCollectionItemVariant
} from '../../../utils/server-variant-pricing.ts';
import {
  validateCouponCode,
  validateCouponDefinition,
  normalizeCouponCode,
  evaluateCouponEligibility,
  roundCurrency
} from '../../../utils/coupons.ts';

const COUPONS_RTDB_PATH = 'settings/coupons';

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

function serviceUnavailableResponse() {
  return jsonResponse(
    {
      success: false,
      eligible: false,
      error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      reason: 'SERVICE_TEMPORARILY_UNAVAILABLE',
      message: 'الخدمة غير متاحة مؤقتاً، يرجى المحاولة بعد قليل.'
    },
    503
  );
}

function rateLimitFailureResponse(rateLimitResult) {
  if (!rateLimitResult || !rateLimitResult.available || rateLimitResult.reason === 'store_unavailable') {
    return serviceUnavailableResponse();
  }

  const extraHeaders = {};
  if (
    typeof rateLimitResult.retryAfterSeconds === 'number' &&
    Number.isFinite(rateLimitResult.retryAfterSeconds) &&
    rateLimitResult.retryAfterSeconds > 0
  ) {
    extraHeaders['Retry-After'] = String(Math.ceil(rateLimitResult.retryAfterSeconds));
  }
  if (typeof rateLimitResult.limit === 'number') {
    extraHeaders['X-RateLimit-Limit'] = String(rateLimitResult.limit);
  }
  if (typeof rateLimitResult.remaining === 'number') {
    extraHeaders['X-RateLimit-Remaining'] = String(rateLimitResult.remaining);
  }
  if (typeof rateLimitResult.resetAt === 'number') {
    extraHeaders['X-RateLimit-Reset'] = String(rateLimitResult.resetAt);
  }

  return jsonResponse(
    {
      success: false,
      eligible: false,
      error: 'RATE_LIMIT_EXCEEDED',
      reason: 'RATE_LIMIT_EXCEEDED',
      message: 'تم تجاوز الحد المسموح من محاولات التحقق من الكوبون. يرجى الانتظار دقيقة والمحاولة مرة أخرى.'
    },
    429,
    extraHeaders
  );
}

function getNowMs(_deps) {
  if (typeof _deps?.now === 'function') {
    const val = _deps.now();
    if (Number.isFinite(val) && val > 0) return Math.trunc(val);
  }
  return Date.now();
}

function buildEligibilityRejectionMessage(reason, coupon) {
  switch (reason) {
    case 'COUPON_NOT_FOUND':
      return 'كود الخصم غير صحيح أو غير موجود.';
    case 'COUPON_DISABLED':
      return 'عذراً، كود الخصم غير مفعّل حالياً.';
    case 'COUPON_NOT_STARTED':
      return 'عذراً، لم تبدأ فترة صلاحية هذا الكوبون بعد.';
    case 'COUPON_EXPIRED':
      return 'عذراً، انتهت صلاحية كود الخصم.';
    case 'PINK_FRIDAY_NOT_COMBINABLE':
      return 'عذراً، لا يمكن استخدام كوبونات الخصم مع منتجات أو عروض Pink Friday.';
    case 'NO_ELIGIBLE_CATEGORY_ITEMS':
      return 'عذراً، لا توجد منتجات مؤهلة لهذا الكوبون في سلتكِ حالياً.';
    case 'EMPTY_ELIGIBLE_SUBTOTAL':
      return 'عذراً، لا توجد منتجات مؤهلة لهذا الكوبون في سلتكِ.';
    case 'MINIMUM_SUBTOTAL_NOT_MET':
      return `عذراً، يتطلب هذا الكوبون حداً أدنى للمنتجات المؤهلة بقيمة ${coupon?.minimumSubtotal ?? 0} ج.م.`;
    default:
      return 'عذراً، كود الخصم غير قابل للتطبيق على السلة الحالية.';
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
          eligible: false,
          error: 'INVALID_CONTENT_TYPE',
          message: 'نوع المحتوى غير مدعوم، يرجى إرسال JSON.'
        },
        415
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          eligible: false,
          error: 'INVALID_JSON',
          message: 'صيغة البيانات المرسلة غير صالحة.'
        },
        400
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse(
        {
          success: false,
          eligible: false,
          error: 'INVALID_REQUEST',
          message: 'صيغة الطلب غير صالحة.'
        },
        400
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

    // Fail-closed trusted IP + distributed rate limiting: 10 previews / 60s per IP
    const ipCtx = {
      request,
      clientAddress,
      ...(_deps?.ipContext && typeof _deps.ipContext === 'object' ? _deps.ipContext : {})
    };
    const clientIp = getSafeClientIp(ipCtx);
    if (!clientIp) {
      return serviceUnavailableResponse();
    }

    const rateLimitResult = await checkServerRateLimit({
      namespace: 'couponPreview',
      key: clientIp,
      maxRequests: 10,
      windowMs: 60_000,
      adminDb,
      ...(_deps?.redis !== undefined ? { redis: _deps.redis } : {})
    });

    if (!rateLimitResult.allowed) {
      return rateLimitFailureResponse(rateLimitResult);
    }

    // Validate coupon code format strictly
    const codeCheck = validateCouponCode(body.code);
    if (!codeCheck.valid || !codeCheck.normalizedCode) {
      return jsonResponse(
        {
          success: false,
          eligible: false,
          error: codeCheck.error || 'INVALID_COUPON_CODE',
          reason: codeCheck.error || 'INVALID_COUPON_CODE',
          message: codeCheck.message || 'يرجى إدخال كود كوبون صالح.'
        },
        400
      );
    }
    const normalizedCode = codeCheck.normalizedCode;

    // Validate non-empty items array
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.filter((it) => it && typeof it === 'object' && !Array.isArray(it));
    if (items.length === 0) {
      return jsonResponse(
        {
          success: false,
          eligible: false,
          error: 'EMPTY_CART',
          reason: 'EMPTY_CART',
          message: 'سلة المشتريات فارغة، يرجى إضافة منتجات أولاً.'
        },
        400
      );
    }

    if (!adminDb) {
      return serviceUnavailableResponse();
    }

    const nowMs = getNowMs(_deps);
    const nowDate = new Date(nowMs);

    // Fetch active Pink Friday campaign (read-only)
    let activeCampaign = null;
    try {
      const campSnap = await adminDb.ref('settings/pinkFriday/publishedActiveCampaign').once('value');
      activeCampaign = campSnap && typeof campSnap.val === 'function' ? campSnap.val() : null;
    } catch (campErr) {
      console.warn('[Coupons Validate] Could not fetch publishedActiveCampaign:', campErr?.message || campErr);
    }
    if (!activeCampaign && !_deps?.skipPublishedCampaignFallback) {
      activeCampaign = await getPublishedPinkFridayCampaign(false, { adminDb });
    }

    // Reconstruct authoritative items, prices, categories & Pink Friday flags (zero trust in client values)
    const productsMap = {};
    const evalItems = [];
    let subtotal = 0;
    let hasPinkFridayInOrder = false;

    for (const item of items) {
      if (item.type === 'collection' || item.isCollection || item.collectionId) {
        const colId = item.collectionId || item.id;
        const parsedQty =
          typeof item.quantity === 'number'
            ? item.quantity
            : typeof item.quantity === 'string' && /^\d+$/.test(item.quantity.trim())
              ? Number(item.quantity.trim())
              : 1;
        if (!colId || !Number.isSafeInteger(parsedQty) || parsedQty <= 0) {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: 'INVALID_QUANTITY',
              reason: 'INVALID_QUANTITY',
              message: 'كمية الكوليكشن غير صالحة.'
            },
            400
          );
        }

        const campStatus =
          activeCampaign && activeCampaign.enabled !== false
            ? getCampaignStatus(activeCampaign, nowDate)
            : 'disabled';

        if (campStatus !== 'active') {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: 'CAMPAIGN_COLLECTION_CONFLICT',
              reason: 'CAMPAIGN_COLLECTION_CONFLICT',
              message: 'عذراً، عروض Pink Friday غير متاحة حالياً أو انتهت صلاحيتها.'
            },
            409
          );
        }

        const rawColls = activeCampaign?.collections;
        const activeCollections = Array.isArray(rawColls)
          ? rawColls
          : (rawColls && typeof rawColls === 'object' ? Object.values(rawColls) : []);
        const collection = activeCollections.find((c) => c && String(c.id) === String(colId));

        if (!collection || collection.active === false) {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: 'CAMPAIGN_COLLECTION_CONFLICT',
              reason: 'CAMPAIGN_COLLECTION_CONFLICT',
              message: 'عذراً، كوليكشن Pink Friday المطلوب غير متاح حالياً.'
            },
            409
          );
        }

        const collectionItemsList = Array.isArray(collection.items)
          ? collection.items
          : (collection.items && typeof collection.items === 'object' ? Object.values(collection.items) : []);

        if (collectionItemsList.length === 0) {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: 'INVALID_COLLECTION',
              reason: 'INVALID_COLLECTION',
              message: `عذراً، كوليكشن "${collection.name}" لا يحتوي على منتجات.`
            },
            400
          );
        }

        if (!collection.allowDuplicates) {
          const itemPids = collectionItemsList.map((it) => String(it.productId));
          if (new Set(itemPids).size !== itemPids.length) {
            return jsonResponse(
              {
                success: false,
                eligible: false,
                error: 'COLLECTION_DUPLICATE_DISALLOWED',
                reason: 'COLLECTION_DUPLICATE_DISALLOWED',
                message: `عذراً، كوليكشن "${collection.name}" يحتوي على تكرار غير مصرح به.`
              },
              400
            );
          }
        }

        const selectedItemsInput = validateCollectionSelectedItemsInput(item);
        if (!selectedItemsInput.ok) {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: selectedItemsInput.errorCode || 'INVALID_VARIANT_SELECTION',
              reason: selectedItemsInput.errorCode || 'INVALID_VARIANT_SELECTION',
              message: selectedItemsInput.message || 'اختيارات منتجات الكوليكشن غير صالحة.'
            },
            400
          );
        }

        const clientSelectedItems = selectedItemsInput.selectedItems;
        const usedChoiceIndices = new Set();
        let totalBasePrice = 0;

        for (const cItem of collectionItemsList) {
          if (!cItem || typeof cItem !== 'object' || !cItem.productId || /[.#$\[\]/]/.test(String(cItem.productId))) {
            return jsonResponse(
              {
                success: false,
                eligible: false,
                error: 'INVALID_COLLECTION',
                reason: 'INVALID_COLLECTION',
                message: `عذراً، بيانات مكونات كوليكشن "${collection.name}" غير صالحة.`
              },
              400
            );
          }

          const pSnap = await adminDb.ref(`products/${cItem.productId}`).once('value');
          if (!pSnap || (typeof pSnap.exists === 'function' && !pSnap.exists())) {
            return jsonResponse(
              {
                success: false,
                eligible: false,
                error: 'PRODUCT_NOT_FOUND',
                reason: 'PRODUCT_NOT_FOUND',
                message: `عذراً، أحد منتجات كوليكشن "${collection.name}" لم يعد متاحاً.`
              },
              400
            );
          }
          const pData = pSnap.val();
          if (!pData || typeof pData !== 'object' || pData.isHidden || pData.isSoldOut) {
            return jsonResponse(
              {
                success: false,
                eligible: false,
                error: 'PRODUCT_UNAVAILABLE',
                reason: 'PRODUCT_UNAVAILABLE',
                message: `عذراً، المنتج "${pData?.name || ''}" داخل الكوليكشن غير متاح حالياً.`
              },
              400
            );
          }

          const itemBasePrice = parseFloat(String(pData.price).replace(/[^0-9.-]+/g, '')) || 0;
          totalBasePrice += itemBasePrice;

          const clientChoice = matchCollectionClientChoice(cItem, clientSelectedItems, usedChoiceIndices);
          const colVariantCheck = validateAndResolveCollectionItemVariant(pData, clientChoice, {
            expectedProductId: String(cItem.productId)
          });
          if (!colVariantCheck.ok) {
            return jsonResponse(
              {
                success: false,
                eligible: false,
                error: colVariantCheck.errorCode || 'INVALID_VARIANT_SELECTION',
                reason: colVariantCheck.errorCode || 'INVALID_VARIANT_SELECTION',
                message: colVariantCheck.message || 'اختيار الرائحة داخل الكوليكشن غير صالح.'
              },
              400
            );
          }
        }

        if (usedChoiceIndices.size !== clientSelectedItems.length) {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: 'INVALID_VARIANT_SELECTION',
              reason: 'INVALID_VARIANT_SELECTION',
              message: 'بعض اختيارات المنتجات المرسلة داخل الكوليكشن غير صالحة.'
            },
            400
          );
        }

        let effectiveUnitPrice = totalBasePrice;
        if (collection.pricingType === 'package' && typeof collection.packagePrice === 'number' && collection.packagePrice > 0) {
          effectiveUnitPrice = collection.packagePrice;
        } else if (collection.pricingType === 'percentage' && typeof collection.discountPercentage === 'number' && collection.discountPercentage > 0) {
          effectiveUnitPrice = Math.round(totalBasePrice * (1 - collection.discountPercentage / 100));
        }

        const lineTotal = roundCurrency(effectiveUnitPrice * parsedQty);
        subtotal = roundCurrency(subtotal + lineTotal);
        hasPinkFridayInOrder = true;

        evalItems.push({
          id: String(collection.id),
          productId: String(collection.id),
          quantity: parsedQty,
          lineTotal,
          isPinkFriday: true,
          isCollection: true,
          type: 'collection',
          collectionId: String(collection.id)
        });
        continue;
      }

      // Standard individual product
      const rawId = String(
        item.productId || (item.id ? String(item.id).split('::')[0] : '') || ''
      ).trim();

      if (!rawId || /[.#$\[\]/]/.test(rawId)) {
        return jsonResponse(
          {
            success: false,
            eligible: false,
            error: 'INVALID_PRODUCT',
            reason: 'INVALID_PRODUCT',
            message: 'عذراً، معرّف المنتج المرسل غير صالح.'
          },
          400
        );
      }

      let quantity = 1;
      if (item.quantity !== undefined) {
        const parsedQty =
          typeof item.quantity === 'number'
            ? item.quantity
            : typeof item.quantity === 'string' && /^\d+$/.test(item.quantity.trim())
              ? Number(item.quantity.trim())
              : NaN;
        if (!Number.isSafeInteger(parsedQty) || parsedQty <= 0) {
          return jsonResponse(
            {
              success: false,
              eligible: false,
              error: 'INVALID_QUANTITY',
              reason: 'INVALID_QUANTITY',
              message: 'كمية المنتج المرسلة غير صالحة.'
            },
            400
          );
        }
        quantity = parsedQty;
      }

      const productSnap = await adminDb.ref(`products/${rawId}`).once('value');
      if (!productSnap || (typeof productSnap.exists === 'function' && !productSnap.exists())) {
        return jsonResponse(
          {
            success: false,
            eligible: false,
            error: 'PRODUCT_NOT_FOUND',
            reason: 'PRODUCT_NOT_FOUND',
            message: 'عذراً، أحد المنتجات في سلتكِ لم يعد متاحاً.'
          },
          400
        );
      }

      const pData = productSnap.val();
      if (!pData || typeof pData !== 'object' || pData.isHidden || pData.isSoldOut) {
        return jsonResponse(
          {
            success: false,
            eligible: false,
            error: 'PRODUCT_UNAVAILABLE',
            reason: 'PRODUCT_UNAVAILABLE',
            message: `عذراً، المنتج "${pData?.name || ''}" غير متاح حالياً.`
          },
          400
        );
      }

      const variantCheck = validateAndResolveOrderItemVariants(pData, item);
      if (!variantCheck.ok) {
        return jsonResponse(
          {
            success: false,
            eligible: false,
            error: variantCheck.errorCode || 'INVALID_VARIANT_SELECTION',
            reason: variantCheck.errorCode || 'INVALID_VARIANT_SELECTION',
            message: variantCheck.message || 'اختيار الروائح للمنتج غير صالح.'
          },
          400
        );
      }

      const priceVal = parseFloat(String(pData.price).replace(/[^0-9.-]+/g, '')) || 0;
      const pfPricing = calculatePinkFridayPricing(
        {
          id: rawId,
          price: priceVal,
          isHidden: Boolean(pData.isHidden),
          isSoldOut: Boolean(pData.isSoldOut),
          onSale: Boolean(pData.onSale),
          discount: pData.discount
        },
        activeCampaign,
        nowDate
      );

      const itemPricing = calculateAuthoritativeItemPricing({
        basePrice: priceVal,
        campaignPrice: pfPricing.isEligible ? pfPricing.campaignPrice : null,
        isPinkFridayEligible: pfPricing.isEligible,
        variantMultiplier: variantCheck.multiplier,
        quantity
      });

      const lineTotal = roundCurrency(itemPricing.lineTotal);
      subtotal = roundCurrency(subtotal + lineTotal);

      if (pfPricing.isEligible) {
        hasPinkFridayInOrder = true;
      }

      productsMap[rawId] = {
        id: rawId,
        category: pData.category ?? null
      };

      evalItems.push({
        id: rawId,
        productId: rawId,
        quantity,
        lineTotal,
        isPinkFriday: Boolean(pfPricing.isEligible)
      });
    }

    if (evalItems.length === 0 || subtotal <= 0) {
      return jsonResponse(
        {
          success: false,
          eligible: false,
          error: 'NO_VALID_PRODUCTS',
          reason: 'NO_VALID_PRODUCTS',
          message: 'لم يتم العثور على منتجات صالحة في السلة.'
        },
        400
      );
    }

    // Read settings/coupons (read-only) and strictly validate allow-listed definition fields
    const couponsSnap = await adminDb.ref(COUPONS_RTDB_PATH).once('value');
    const rawCoupons = couponsSnap && typeof couponsSnap.val === 'function' ? couponsSnap.val() : null;

    let matchedCoupon = null;
    let storedCouponConfigInvalid = false;
    if (rawCoupons && typeof rawCoupons === 'object' && !Array.isArray(rawCoupons)) {
      for (const entry of Object.values(rawCoupons)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const storedCode = normalizeCouponCode(entry.code);
        if (storedCode === normalizedCode) {
          const allowListedConfig = {
            code: entry.code,
            discountType: entry.discountType,
            discountValue: entry.discountValue,
            scope: entry.scope,
            categorySlug: entry.categorySlug,
            minimumSubtotal: entry.minimumSubtotal,
            maximumDiscount: entry.maximumDiscount,
            startsAt: entry.startsAt,
            expiresAt: entry.expiresAt,
            isActive: entry.isActive === undefined ? null : entry.isActive
          };
          const defValidation = validateCouponDefinition(allowListedConfig);
          if (!defValidation.valid || !defValidation.value) {
            storedCouponConfigInvalid = true;
            matchedCoupon = null;
            break;
          }
          matchedCoupon = defValidation.value;
          break;
        }
      }
    }

    if (storedCouponConfigInvalid) {
      return jsonResponse(
        {
          success: true,
          eligible: false,
          code: normalizedCode,
          discountType: null,
          discountValue: null,
          scope: null,
          categorySlug: null,
          eligibleSubtotal: 0,
          orderProductSubtotal: subtotal,
          subtotal,
          discountAmount: 0,
          discountedSubtotal: subtotal,
          discountedProductSubtotal: subtotal,
          reason: 'INVALID_COUPON_CONFIGURATION',
          message: 'عذراً، كود الخصم غير صالح للاستخدام حالياً.'
        },
        200
      );
    }

    const evaluation = evaluateCouponEligibility({
      coupon: matchedCoupon,
      items: evalItems,
      hasPinkFridayInOrder,
      productsMap,
      now: nowMs
    });

    // Reject a coupon that would result in zero payable total when shipping is also free
    const wouldLeaveZeroOrderTotal =
      evaluation.eligible &&
      evaluation.discountedProductSubtotal <= 0 &&
      calculateShippingFee('', evaluation.orderProductSubtotal) === 0;

    if (!evaluation.eligible || evaluation.discountAmount <= 0 || wouldLeaveZeroOrderTotal) {
      const rejectReason = wouldLeaveZeroOrderTotal ? 'INVALID_COUPON_TOTAL' : evaluation.reason;
      const rejectMessage = wouldLeaveZeroOrderTotal
        ? 'لا يمكن استخدام كوبون يجعل الإجمالي النهائي للطلب صفراً.'
        : buildEligibilityRejectionMessage(evaluation.reason, matchedCoupon);

      return jsonResponse(
        {
          success: true,
          eligible: false,
          code: matchedCoupon ? matchedCoupon.code : normalizedCode,
          discountType: matchedCoupon ? matchedCoupon.discountType : null,
          discountValue: matchedCoupon ? matchedCoupon.discountValue : null,
          scope: matchedCoupon ? matchedCoupon.scope : null,
          categorySlug: matchedCoupon ? (matchedCoupon.categorySlug ?? null) : null,
          eligibleSubtotal: evaluation.eligibleSubtotal,
          orderProductSubtotal: evaluation.orderProductSubtotal,
          subtotal: evaluation.orderProductSubtotal,
          discountAmount: 0,
          discountedSubtotal: evaluation.orderProductSubtotal,
          discountedProductSubtotal: evaluation.orderProductSubtotal,
          reason: rejectReason,
          message: rejectMessage
        },
        200
      );
    }

    return jsonResponse(
      {
        success: true,
        eligible: true,
        code: matchedCoupon.code,
        discountType: matchedCoupon.discountType,
        discountValue: matchedCoupon.discountValue,
        scope: matchedCoupon.scope,
        categorySlug: matchedCoupon.categorySlug ?? null,
        minimumSubtotal: matchedCoupon.minimumSubtotal ?? null,
        maximumDiscount: matchedCoupon.maximumDiscount ?? null,
        eligibleSubtotal: evaluation.eligibleSubtotal,
        orderProductSubtotal: evaluation.orderProductSubtotal,
        subtotal: evaluation.orderProductSubtotal,
        discountAmount: evaluation.discountAmount,
        discountedSubtotal: evaluation.discountedProductSubtotal,
        discountedProductSubtotal: evaluation.discountedProductSubtotal,
        reason: 'APPLIED',
        message: `تم تطبيق الكوبون ${matchedCoupon.code} بخصم ${evaluation.discountAmount} ج.م.`
      },
      200
    );
  } catch (error) {
    console.error('[Coupons Validate Error]:', error?.code || error?.message || 'unexpected_error');
    return serviceUnavailableResponse();
  }
}

export async function GET() {
  return methodNotAllowedResponse();
}

export async function ALL() {
  return methodNotAllowedResponse();
}
