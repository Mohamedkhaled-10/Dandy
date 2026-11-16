export const prerender = false;

// src/pages/api/create-order.js
import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getAdminApp } from '../../utils/firebase-admin.ts';
import {
  getSafeClientIp,
  extractAstroClientAddress,
  checkServerRateLimit
} from '../../utils/server-rate-limit.ts';
import { verifyTurnstileToken } from '../../utils/turnstile.js';
import {
  getPublishedPinkFridayCampaign,
  getCampaignStatus,
  calculatePinkFridayPricing
} from '../../utils/pink-friday-server.ts';
import { sendOrderNotification } from '../../utils/email-service.ts';
import {
  parseEncryptionKey,
  prepareNewInvoiceAccessArtifacts,
  isValidInvoiceTokenFormat
} from '../../utils/invoice-token.ts';
import {
  isValidUuidV4,
  computeOrderRequestFingerprint,
  acquireOrderIdempotencyLock,
  transitionPendingToCommitting,
  materializeCommitPayload,
  transitionCommittingToCompleted,
  decryptTokenFromCommitPayload,
  reconcileIdempotencyAfterFailure,
  resolveCompletedReplayPayload
} from '../../utils/order-idempotency.ts';
import {
  buildOrderOutboxInitialRecords,
  dispatchTelegramOutboxNotification,
  dispatchMakeWebhookOutboxNotification
} from '../../utils/notifications-outbox.ts';
import { sendTelegramNotification } from '../../utils/telegram.js';
import { calculateShippingFee } from '../../config/store-policy.ts';
import {
  validateAndResolveOrderItemVariants,
  calculateAuthoritativeItemPricing,
  validateCollectionSelectedItemsInput,
  matchCollectionClientChoice,
  validateAndResolveCollectionItemVariant
} from '../../utils/server-variant-pricing.ts';
import {
  validateCouponCode,
  validateCouponDefinition,
  evaluateCouponEligibility,
  roundCurrency
} from '../../utils/coupons.ts';

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
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'تم تجاوز الحد المسموح من الطلبات لهذا الجهاز. يرجى الانتظار دقيقة والمحاولة لاحقًا.'
    },
    429,
    extraHeaders
  );
}

/**
 * Fully isolated post-commit side-effects runner.
 * Guarantees NO synchronous or asynchronous failure after order commit ever returns HTTP 500.
 */
async function runPostCommitSideEffectsSafely({
  orderData,
  orderId,
  invoiceAccessToken,
  adminDb,
  stockDeductionMap = new Map(),
  _deps = null
}) {
  try {
    // 1. Preserve legacy best-effort stock deduction ONLY after fresh commit
    const lowStockAlerts = [];
    if (stockDeductionMap && typeof stockDeductionMap.entries === 'function') {
      for (const [prodId, stockInfo] of stockDeductionMap.entries()) {
        const orderedQty = stockInfo?.quantityNeeded || 0;
        if (prodId && orderedQty > 0) {
          try {
            const stockRef = adminDb.ref(`products/${prodId}/stockQuantity`);
            await stockRef.transaction((current) => {
              if (current === null || current === undefined) return current;
              const num = Number(current);
              if (isNaN(num)) return current;
              return Math.max(0, num - orderedQty);
            });

            const newSnap = await stockRef.once('value');
            const rawQty = newSnap.val();
            const newQty = rawQty !== null && rawQty !== undefined ? Number(rawQty) : null;
            if (typeof newQty === 'number' && !isNaN(newQty)) {
              if (newQty <= 0) {
                await adminDb.ref(`products/${prodId}/isSoldOut`).set(true);
              }
              if (newQty <= 3) {
                lowStockAlerts.push({
                  productName: stockInfo.name,
                  remainingQty: newQty
                });
              }
            }
          } catch (stockErr) {
            console.error(`Error updating stock for product ${prodId}:`, stockErr?.message || stockErr);
          }
        }
      }
    }

    // 2. Outbox-fenced outbound notifications (safe even if functions throw synchronously)
    const sendEmailFn = _deps?.sendOrderNotification || sendOrderNotification;
    const sendTgFn = _deps?.sendTelegramNotification || sendTelegramNotification;

    const emailPromise = Promise.resolve()
      .then(() =>
        sendEmailFn({
          order: orderData,
          orderId,
          eventType: 'ORDER_CONFIRMATION',
          invoiceAccessToken,
          adminDb,
          ...(_deps?.encryptionKey !== undefined ? { encryptionKey: _deps.encryptionKey } : {})
        })
      )
      .catch((mailErr) => {
        console.error('[CreateOrder] Order confirmation email dispatch failed (resilient):', mailErr?.message || mailErr);
        return null;
      });

    const telegramOrderPromise = Promise.resolve()
      .then(() =>
        dispatchTelegramOutboxNotification({
          orderId,
          orderData,
          adminDb,
          sendTelegramFn: sendTgFn,
          timeoutMs: 4000
        })
      )
      .catch((tgErr) => {
        console.error('[CreateOrder] Telegram order notification failed (resilient):', tgErr?.message || tgErr);
        return null;
      });

    const lowStockPromises = lowStockAlerts.map((alert) =>
      Promise.resolve()
        .then(() =>
          sendTgFn({
            lowStockAlert: true,
            productName: alert.productName,
            remainingQty: alert.remainingQty,
            timeoutMs: 4000
          })
        )
        .catch((lsErr) => {
          console.error(`[CreateOrder] Telegram low stock alert failed for ${alert.productName} (resilient):`, lsErr?.message || lsErr);
          return null;
        })
    );

    const makeWebhookPromise = Promise.resolve()
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
      .catch((whErr) => {
        console.error('Make webhook outbox dispatch failed (resilient):', whErr?.message || whErr);
        return null;
      });

    if (typeof _deps?.afterOrderCommitted === 'function') {
      await Promise.resolve().then(() => _deps.afterOrderCommitted({ orderId, orderData, adminDb }));
    }

    await Promise.allSettled([
      emailPromise,
      telegramOrderPromise,
      ...lowStockPromises,
      makeWebhookPromise
    ]);
  } catch (postCommitErr) {
    // CRITICAL INVARIANT: Order is already committed & verified; NEVER leak post-commit failures as HTTP 500.
    console.error(
      `[CreateOrder] Post-commit side-effects failure isolated for ${orderId}:`,
      postCommitErr?.code || postCommitErr?.message || 'post_commit_error'
    );
  }
}

export async function POST(context) {
  const { request, _deps = null } = context || {};
  const clientAddress = extractAstroClientAddress(context);

  let idempotencyLock = null;
  let adminDb = _deps?.adminDb || null;
  let enteredCommitting = false;
  let atomicCommitted = false;

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

    // 2. Initialize Firebase Admin DB early if needed for distributed rate limit fallback
    if (!adminDb && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const app = getAdminApp();
        adminDb = getDatabase(app);
      } catch (initErr) {
        console.error('[CreateOrder] Failed initializing Firebase Admin DB:', initErr?.code || initErr?.name || 'init_error');
      }
    }

    // 3. Extract trusted client IP (fail-closed if unavailable)
    const ipCtx = {
      request,
      clientAddress,
      ...(_deps?.ipContext && typeof _deps.ipContext === 'object' ? _deps.ipContext : {})
    };
    const clientIp = getSafeClientIp(ipCtx);
    if (!clientIp) {
      return serviceUnavailableResponse();
    }

    // 4. Fail-Closed Distributed Rate Limiting (10 requests / 60s per trusted client IP)
    const injectedRedis =
      _deps?.redis !== undefined
        ? _deps.redis
        : (_deps?.orderLimiter !== undefined ? _deps.orderLimiter : undefined);

    const rateLimitResult = await checkServerRateLimit({
      namespace: 'createOrder',
      key: clientIp,
      maxRequests: 10,
      windowMs: 60_000,
      adminDb,
      ...(injectedRedis !== undefined ? { redis: injectedRedis } : {})
    });

    if (!rateLimitResult.allowed) {
      return rateLimitFailureResponse(rateLimitResult);
    }

    // 5. Parse JSON payload safely
    let parsedBody;
    try {
      parsedBody = await request.json();
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

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_JSON',
          message: 'صيغة البيانات المرسلة غير صالحة.'
        },
        400
      );
    }

    const body = parsedBody;
    const customer = (body.customer && typeof body.customer === 'object' && !Array.isArray(body.customer)) ? body.customer : {};
    const items = Array.isArray(body.items) ? body.items : [];
    const idToken = body.idToken;
    const turnstileToken = body.turnstileToken || body['cf-turnstile-response'];

    // Validate optional transitional clientRequestId (UUID v4 required when provided)
    const hasClientRequestId = body.clientRequestId !== undefined && body.clientRequestId !== null;
    if (hasClientRequestId && !isValidUuidV4(body.clientRequestId)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_CLIENT_REQUEST_ID',
          message: 'معرف الطلب المؤقت غير صالح.'
        },
        400
      );
    }
    const clientRequestId = hasClientRequestId ? body.clientRequestId.trim() : null;

    // 6. Mandatory server-to-server Cloudflare Turnstile CAPTCHA check
    if (!turnstileToken) {
      return jsonResponse(
        {
          success: false,
          error: 'CAPTCHA_REQUIRED',
          message: 'يرجى إكمال اختبار التحقق الأمني (CAPTCHA) قبل تأكيد الطلب.'
        },
        400
      );
    }

    const verifyTurnstile = _deps?.verifyTurnstileToken || verifyTurnstileToken;
    const turnstileResult = await verifyTurnstile(turnstileToken, clientIp);
    if (!turnstileResult.success) {
      const isConfigError = turnstileResult.error === 'SERVER_MISCONFIGURATION';
      return jsonResponse(
        {
          success: false,
          error: turnstileResult.error || 'CAPTCHA_FAILED',
          message: turnstileResult.message || 'فشل التحقق الأمني من الكابتشا. يرجى إعادة المحاولة.'
        },
        isConfigError ? 500 : 403
      );
    }

    // 7. Strict customer & cart input validation
    const name = typeof customer.name === 'string' ? customer.name.trim() : '';
    const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
    const email = typeof customer.email === 'string' ? customer.email.trim() : 'N/A';
    const governorate = typeof customer.governorate === 'string' ? customer.governorate.trim() : '';
    const city = typeof customer.city === 'string' ? customer.city.trim() : '';
    const address = typeof customer.address === 'string' ? customer.address.trim() : '';

    if (name.length < 2) {
      return jsonResponse({ success: false, error: 'INVALID_NAME', message: 'الاسم يجب ألا يقل عن حرفين' }, 400);
    }

    if (phone.length < 10) {
      return jsonResponse({ success: false, error: 'INVALID_PHONE', message: 'رقم الهاتف يجب ألا يقل عن 10 أرقام' }, 400);
    }

    if (governorate.length < 2) {
      return jsonResponse({ success: false, error: 'INVALID_GOVERNORATE', message: 'يرجى اختيار المحافظة بشكل صحيح' }, 400);
    }

    if (!city) {
      return jsonResponse({ success: false, error: 'INVALID_CITY', message: 'يرجى إدخال اسم المدينة أو المركز' }, 400);
    }

    if (address.length < 3) {
      return jsonResponse({ success: false, error: 'INVALID_ADDRESS', message: 'العنوان يجب ألا يقل عن 3 أحرف' }, 400);
    }

    if (items.length === 0) {
      return jsonResponse({ success: false, error: 'EMPTY_CART', message: 'سلة المشتريات فارغة' }, 400);
    }

    // Validate optional couponCode (only treat undefined/null/empty whitespace as no coupon)
    let requestedCouponCode = null;
    if (body.couponCode !== undefined && body.couponCode !== null) {
      if (typeof body.couponCode !== 'string') {
        return jsonResponse(
          {
            success: false,
            error: 'INVALID_COUPON_CODE',
            message: 'صيغة كود الخصم غير صالحة.'
          },
          400
        );
      }
      if (body.couponCode.trim() !== '') {
        const couponCodeCheck = validateCouponCode(body.couponCode);
        if (!couponCodeCheck.valid || !couponCodeCheck.normalizedCode) {
          return jsonResponse(
            {
              success: false,
              error: couponCodeCheck.error || 'INVALID_COUPON_CODE',
              message: couponCodeCheck.message || 'كود الكوبون غير صالح.'
            },
            400
          );
        }
        requestedCouponCode = couponCodeCheck.normalizedCode;
      }
    }

    // 8. Validate database & invoice token encryption configuration BEFORE any permanent DB writes
    if (!adminDb && !process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.error('[CreateOrder] FIREBASE_SERVICE_ACCOUNT not configured in environment.');
      return jsonResponse({ success: false, error: 'SERVER_CONFIG_ERROR', message: 'إعدادات السيرفر غير مكتملة.' }, 500);
    }

    if (!adminDb) {
      const app = getAdminApp();
      adminDb = getDatabase(app);
    }

    try {
      parseEncryptionKey(_deps?.encryptionKey);
    } catch {
      console.error('[CreateOrder] DANDY_INVOICE_TOKEN_ENCRYPTION_KEY is missing or invalid.');
      return jsonResponse(
        {
          success: false,
          error: 'SERVER_CONFIG_ERROR',
          message: 'إعدادات الأمان على السيرفر غير مكتملة.'
        },
        500
      );
    }

    const adminAuth =
      _deps?.adminAuth !== undefined
        ? _deps.adminAuth
        : (process.env.FIREBASE_SERVICE_ACCOUNT ? getAuth(getAdminApp()) : null);

    // 9. Verify optional authenticated customer token
    let customerId = null;
    if (idToken && adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        customerId = decoded.uid || null;
      } catch (tokenErr) {
        console.warn('[CreateOrder] Could not verify idToken:', tokenErr?.code || tokenErr?.message || 'invalid_token');
      }
    }

    // 10. Acquire atomic Idempotency Lock (or recover COMMITTING) if clientRequestId was supplied
    if (clientRequestId) {
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

      const idemOutcome = await acquireOrderIdempotencyLock({
        clientRequestId,
        requestFingerprint,
        adminDb,
        leaseMs: _deps?.idempotencyLeaseMs,
        commitLeaseMs: _deps?.commitLeaseMs,
        ttlMs: _deps?.idempotencyTtlMs
      });

      if (idemOutcome.outcome === 'CONFLICT') {
        return jsonResponse(
          {
            success: false,
            error: 'IDEMPOTENCY_CONFLICT',
            message: 'تم استخدام معرف هذا الطلب مسبقاً ببيانات مختلفة.'
          },
          409
        );
      }

      if (idemOutcome.outcome === 'EXPIRED') {
        return jsonResponse(
          {
            success: false,
            error: 'IDEMPOTENCY_KEY_EXPIRED',
            message: 'انتهت صلاحية معرف الطلب، يرجى إعادة إرسال طلب جديد.'
          },
          409
        );
      }

      if (idemOutcome.outcome === 'IN_PROGRESS') {
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_IN_PROGRESS',
            message: 'جاري معالجة هذا الطلب حالياً، يرجى الانتظار قليلاً.'
          },
          409,
          { 'Retry-After': String(idemOutcome.retryAfterSeconds || 5) }
        );
      }

      if (idemOutcome.outcome === 'DELETED') {
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_DELETED',
            message: 'تم حذف هذا الطلب إدارياً ولا يمكن إعادة إنشائه بنفس المعرف.'
          },
          409
        );
      }

      if (idemOutcome.outcome === 'COMPLETED') {
        try {
          const replayPayload = await resolveCompletedReplayPayload({
            record: idemOutcome.record,
            adminDb,
            encryptionKey: _deps?.encryptionKey
          });
          return jsonResponse(replayPayload, 200);
        } catch (replayErr) {
          if (replayErr?.code === 'ORDER_DELETED') {
            return jsonResponse(
              {
                success: false,
                error: 'ORDER_DELETED',
                message: 'تم حذف هذا الطلب إدارياً ولا يمكن إعادة إنشائه بنفس المعرف.'
              },
              409
            );
          }
          throw replayErr;
        }
      }

      if (idemOutcome.outcome === 'RECOVER_COMMITTING') {
        enteredCommitting = true;
        const commitRecord = idemOutcome.record;
        const commitPayload = commitRecord.commitPayload;

        const matRes = await materializeCommitPayload({
          commitRecord,
          adminDb,
          hooks: { beforeVerify: _deps?.beforeVerifyMaterialization }
        });

        if (!matRes.ok) {
          if (matRes.reason === 'ORDER_ADMINISTRATIVELY_DELETED') {
            return jsonResponse(
              {
                success: false,
                error: 'ORDER_DELETED',
                message: 'تم حذف هذا الطلب إدارياً ولا يمكن إعادة إنشائه بنفس المعرف.'
              },
              409
            );
          }
          // Keep status in COMMITTING (NEVER downgrade to FAILED, NEVER return 200)
          return serviceUnavailableResponse();
        }

        const compRes = await transitionCommittingToCompleted({
          requestKeyHash: commitRecord.requestKeyHash,
          commitId: String(commitRecord.commitId || ''),
          adminDb,
          ttlMs: _deps?.idempotencyTtlMs
        });

        if (!compRes.ok) {
          const latestSnap = await adminDb
            .ref(`privateOrderIdempotency/${commitRecord.requestKeyHash}`)
            .once('value');
          const latestRec = latestSnap.val();
          if (latestRec && latestRec.status === 'COMPLETED' && latestRec.reservedOrderId === commitPayload.orderId) {
            const replayPayload = await resolveCompletedReplayPayload({
              record: latestRec,
              adminDb,
              encryptionKey: _deps?.encryptionKey
            });
            return jsonResponse(replayPayload, 200);
          }
          return serviceUnavailableResponse();
        }

        atomicCommitted = true;

        const recoveredToken = decryptTokenFromCommitPayload(commitPayload, _deps?.encryptionKey);

        await runPostCommitSideEffectsSafely({
          orderData: commitPayload.orderData,
          orderId: commitPayload.orderId,
          invoiceAccessToken: recoveredToken,
          adminDb,
          stockDeductionMap: new Map(), // Do not duplicate stock deduction on crash recovery
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
            orderId: commitPayload.orderId,
            invoiceCode: commitPayload.invoiceCode,
            subtotal: commitPayload.orderData.subtotal,
            ...recoveredCouponFields,
            shippingFee: commitPayload.orderData.shippingFee,
            totalAmount: commitPayload.orderData.totalAmount,
            invoiceAccessToken: recoveredToken,
            message: 'تم تأكيد طلبك بنجاح'
          },
          200
        );
      }

      idempotencyLock = idemOutcome.lock;
    }

    const failBusinessOrConfig = async (payload, status, errorCode) => {
      await reconcileIdempotencyAfterFailure({ lock: idempotencyLock, adminDb, errorCode });
      return jsonResponse(payload, status);
    };

    // 11. Fetch campaign & validate real server-side product pricing & availability
    const productsSnapshot = [];
    const productsMap = {};
    const couponEvalItems = [];
    let hasPinkFridayInOrder = false;
    let subtotal = 0;

    const nowMs =
      typeof _deps?.now === 'function' && Number.isFinite(_deps.now()) && _deps.now() > 0
        ? Math.trunc(_deps.now())
        : Date.now();
    const nowDate = new Date(nowMs);

    let activeCampaign = null;
    try {
      const campSnap = await adminDb.ref('settings/pinkFriday/publishedActiveCampaign').once('value');
      activeCampaign = campSnap.val();
    } catch (campErr) {
      console.warn('[CreateOrder] Could not fetch publishedActiveCampaign from RTDB:', campErr?.message || campErr);
    }
    if (!activeCampaign && !_deps?.skipPublishedCampaignFallback) {
      activeCampaign = await getPublishedPinkFridayCampaign(false, { adminDb });
    }

    // Track stock deduction for individual products & collection components (executed only after fresh commit)
    const stockDeductionMap = new Map();

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      // Check if item is a Pink Friday Collection bundle
      if (item.type === 'collection' || item.isCollection || item.collectionId) {
        const colId = item.collectionId || item.id;
        const quantity = parseInt(item.quantity) || 1;
        if (!colId || quantity <= 0) continue;

        const campStatus =
          activeCampaign && activeCampaign.enabled !== false
            ? getCampaignStatus(activeCampaign, nowDate)
            : 'disabled';

        if (campStatus !== 'active') {
          return await failBusinessOrConfig(
            {
              success: false,
              error: 'CAMPAIGN_COLLECTION_CONFLICT',
              message: 'عذراً، عروض Pink Friday غير متاحة حالياً أو انتهت صلاحيتها.'
            },
            409,
            'CAMPAIGN_COLLECTION_CONFLICT'
          );
        }

        const rawColls = activeCampaign?.collections;
        const activeCollections = Array.isArray(rawColls)
          ? rawColls
          : (rawColls && typeof rawColls === 'object' ? Object.values(rawColls) : []);

        const collection = activeCollections.find((c) => c && String(c.id) === String(colId));

        if (!collection || collection.active === false) {
          return await failBusinessOrConfig(
            {
              success: false,
              error: 'CAMPAIGN_COLLECTION_CONFLICT',
              message: 'عذراً، كوليكشن Pink Friday المطلوب غير متاح حالياً أو تم إلغاؤه.'
            },
            409,
            'CAMPAIGN_COLLECTION_CONFLICT'
          );
        }

        const collectionItemsList = Array.isArray(collection.items)
          ? collection.items
          : (collection.items && typeof collection.items === 'object' ? Object.values(collection.items) : []);

        if (collectionItemsList.length === 0) {
          return await failBusinessOrConfig(
            {
              success: false,
              error: 'INVALID_COLLECTION',
              message: `عذراً، كوليكشن "${collection.name}" لا يحتوي على منتجات.`
            },
            400,
            'INVALID_COLLECTION'
          );
        }

        if (!collection.allowDuplicates) {
          const itemPids = collectionItemsList.map((it) => String(it.productId));
          const uniquePids = new Set(itemPids);
          if (uniquePids.size !== itemPids.length) {
            return await failBusinessOrConfig(
              {
                success: false,
                error: 'COLLECTION_DUPLICATE_DISALLOWED',
                message: `عذراً، كوليكشن "${collection.name}" يحتوي على تكرار غير مصرح به.`
              },
              400,
              'COLLECTION_DUPLICATE_DISALLOWED'
            );
          }
        }

        const selectedItemsInput = validateCollectionSelectedItemsInput(item);
        if (!selectedItemsInput.ok) {
          return await failBusinessOrConfig(
            {
              success: false,
              error: selectedItemsInput.errorCode || 'INVALID_VARIANT_SELECTION',
              message: selectedItemsInput.message || 'اختيارات منتجات الكوليكشن غير صالحة.'
            },
            400,
            selectedItemsInput.errorCode || 'INVALID_VARIANT_SELECTION'
          );
        }
        const clientSelectedItems = selectedItemsInput.selectedItems;
        const usedChoiceIndices = new Set();

        let totalBasePrice = 0;
        const resolvedCollectionItems = [];

        for (const cItem of collectionItemsList) {
          if (!cItem || typeof cItem !== 'object' || !cItem.productId || /[.#$\[\]/]/.test(String(cItem.productId))) {
            return await failBusinessOrConfig(
              {
                success: false,
                error: 'INVALID_COLLECTION',
                message: `عذراً، بيانات مكونات كوليكشن "${collection.name}" غير صالحة.`
              },
              400,
              'INVALID_COLLECTION'
            );
          }

          const pSnap = await adminDb.ref(`products/${cItem.productId}`).once('value');
          if (!pSnap.exists()) {
            return await failBusinessOrConfig(
              {
                success: false,
                error: 'PRODUCT_NOT_FOUND',
                message: `عذراً، أحد منتجات كوليكشن "${collection.name}" لم يعد متاحاً.`
              },
              400,
              'PRODUCT_NOT_FOUND'
            );
          }

          const pData = pSnap.val();
          if (!pData || typeof pData !== 'object' || pData.isHidden || pData.isSoldOut) {
            return await failBusinessOrConfig(
              {
                success: false,
                error: 'PRODUCT_UNAVAILABLE',
                message: `عذراً، المنتج "${pData?.name || ''}" داخل كوليكشن "${collection.name}" غير متاح حالياً.`
              },
              400,
              'PRODUCT_UNAVAILABLE'
            );
          }

          const itemBasePrice = parseFloat(String(pData.price).replace(/[^0-9.-]+/g, '')) || 0;
          totalBasePrice += itemBasePrice;

          const clientChoice = matchCollectionClientChoice(cItem, clientSelectedItems, usedChoiceIndices);
          const colVariantCheck = validateAndResolveCollectionItemVariant(pData, clientChoice, {
            expectedProductId: String(cItem.productId)
          });

          if (!colVariantCheck.ok) {
            return await failBusinessOrConfig(
              {
                success: false,
                error: colVariantCheck.errorCode || 'INVALID_VARIANT_SELECTION',
                message: colVariantCheck.message || `اختيار الرائحة للمنتج "${pData.name || ''}" داخل الكوليكشن غير صالح.`
              },
              400,
              colVariantCheck.errorCode || 'INVALID_VARIANT_SELECTION'
            );
          }

          const resolvedEntry = {
            collectionItemId: cItem.collectionItemId,
            productId: cItem.productId,
            productName: pData.name || '',
            image: pData.image || '',
            price: itemBasePrice,
            variantName: colVariantCheck.variantName
          };

          if (colVariantCheck.variant) {
            resolvedEntry.variantId = colVariantCheck.variant.id;
            resolvedEntry.selectedVariant = {
              id: colVariantCheck.variant.id,
              name: colVariantCheck.variant.name
            };
          }

          resolvedCollectionItems.push(resolvedEntry);

          const currentQtyNeeded = stockDeductionMap.get(cItem.productId)?.quantityNeeded || 0;
          stockDeductionMap.set(cItem.productId, {
            name: pData.name || '',
            quantityNeeded: currentQtyNeeded + quantity
          });
        }

        if (usedChoiceIndices.size !== clientSelectedItems.length) {
          return await failBusinessOrConfig(
            {
              success: false,
              error: 'INVALID_VARIANT_SELECTION',
              message: `بعض اختيارات المنتجات المرسلة داخل كوليكشن "${collection.name}" غير صالحة أو لا تطابق مكونات الكوليكشن.`
            },
            400,
            'INVALID_VARIANT_SELECTION'
          );
        }

        let effectiveUnitPrice = totalBasePrice;
        if (collection.pricingType === 'package' && typeof collection.packagePrice === 'number' && collection.packagePrice > 0) {
          effectiveUnitPrice = collection.packagePrice;
        } else if (collection.pricingType === 'percentage' && typeof collection.discountPercentage === 'number' && collection.discountPercentage > 0) {
          effectiveUnitPrice = Math.round(totalBasePrice * (1 - collection.discountPercentage / 100));
        }

        const lineTotal = effectiveUnitPrice * quantity;
        subtotal += lineTotal;
        hasPinkFridayInOrder = true;
        couponEvalItems.push({
          id: String(collection.id),
          productId: String(collection.id),
          quantity,
          lineTotal,
          isPinkFriday: true,
          isCollection: true,
          type: 'collection',
          collectionId: String(collection.id)
        });

        productsSnapshot.push({
          type: 'collection',
          collectionId: collection.id,
          name: collection.name || item.name || 'كوليكشن Pink Friday',
          price: totalBasePrice,
          effectiveUnitPrice,
          lineTotal,
          quantity,
          image: collection.coverImage || resolvedCollectionItems[0]?.image || '',
          isPinkFriday: true,
          isCollection: true,
          badgeText: collection.badgeText || 'كوليكشن Pink Friday',
          items: resolvedCollectionItems
        });
        continue;
      }

      // Standard Individual Product Handling
      const rawId = String(
        item.productId || (item.id ? String(item.id).split('::')[0] : '') || ''
      ).trim();
      if (!rawId || /[.#$\[\]/]/.test(rawId)) {
        return await failBusinessOrConfig(
          {
            success: false,
            error: 'INVALID_PRODUCT',
            message: 'عذراً، معرّف المنتج المرسل غير صالح.'
          },
          400,
          'INVALID_PRODUCT'
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
          return await failBusinessOrConfig(
            {
              success: false,
              error: 'INVALID_QUANTITY',
              message: 'كمية المنتج المرسلة غير صالحة.'
            },
            400,
            'INVALID_QUANTITY'
          );
        }
        quantity = parsedQty;
      }

      const productSnap = await adminDb.ref(`products/${rawId}`).once('value');
      if (!productSnap.exists()) {
        return await failBusinessOrConfig(
          {
            success: false,
            error: 'PRODUCT_NOT_FOUND',
            message: 'عذراً، أحد المنتجات المطلوبة لم يعد متاحاً.'
          },
          400,
          'PRODUCT_NOT_FOUND'
        );
      }

      const pData = productSnap.val();
      if (!pData || typeof pData !== 'object' || pData.isHidden || pData.isSoldOut) {
        return await failBusinessOrConfig(
          {
            success: false,
            error: 'PRODUCT_UNAVAILABLE',
            message: `عذراً، المنتج "${pData?.name || item.name || ''}" غير متاح حالياً.`
          },
          400,
          'PRODUCT_UNAVAILABLE'
        );
      }

      const variantCheck = validateAndResolveOrderItemVariants(pData, item);
      if (!variantCheck.ok) {
        return await failBusinessOrConfig(
          {
            success: false,
            error: variantCheck.errorCode || 'INVALID_VARIANT_SELECTION',
            message: variantCheck.message || 'اختيار الروائح للمنتج غير صالح.'
          },
          400,
          variantCheck.errorCode || 'INVALID_VARIANT_SELECTION'
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

      const isClientClaimingCampaign = Boolean(item.isPinkFriday || item.campaignPrice);
      if (isClientClaimingCampaign && !pfPricing.isEligible) {
        return await failBusinessOrConfig(
          {
            success: false,
            error: 'CAMPAIGN_OFFER_CONFLICT',
            message: `عذراً، عرض Pink Friday للمنتج "${pData.name || item.name || ''}" لم يعد متاحاً أو تم تحديث سعره. يرجى مراجعة سلة المشتريات.`
          },
          409,
          'CAMPAIGN_OFFER_CONFLICT'
        );
      }

      const itemPricing = calculateAuthoritativeItemPricing({
        basePrice: priceVal,
        campaignPrice: pfPricing.isEligible ? pfPricing.campaignPrice : null,
        isPinkFridayEligible: pfPricing.isEligible,
        variantMultiplier: variantCheck.multiplier,
        quantity
      });

      const effectiveUnitPrice = itemPricing.effectiveUnitPrice;
      const lineTotal = itemPricing.lineTotal;
      subtotal += lineTotal;

      if (pfPricing.isEligible) {
        hasPinkFridayInOrder = true;
      }
      productsMap[rawId] = {
        id: rawId,
        category: pData.category ?? null
      };
      couponEvalItems.push({
        id: rawId,
        productId: rawId,
        quantity,
        lineTotal,
        isPinkFriday: Boolean(pfPricing.isEligible)
      });

      const snap = {
        id: rawId,
        name: pData.name || item.name || '',
        price: priceVal,
        quantity,
        effectiveUnitPrice,
        lineTotal,
        image: pData.image || item.image || ''
      };

      if (pfPricing.isEligible) {
        snap.isPinkFriday = true;
        snap.campaignPrice = pfPricing.campaignPrice;
        snap.regularPrice = priceVal;
        snap.badgeText = pfPricing.offer?.badgeText || 'Pink Friday';
      }

      if (pData.discount && !pfPricing.isEligible) snap.discount = pData.discount;
      if (pData.onSale) snap.onSale = pData.onSale;

      if (variantCheck.variants.length > 0) {
        snap.selectedVariants = variantCheck.variants.map((v) => ({
          id: v.id,
          name: v.name
        }));
        snap.variantName = variantCheck.variantName;

        if (variantCheck.variants.length === 1) {
          snap.selectedVariant = {
            id: variantCheck.variants[0].id,
            name: variantCheck.variants[0].name
          };
        }
      }

      const currentQtyNeeded = stockDeductionMap.get(rawId)?.quantityNeeded || 0;
      stockDeductionMap.set(rawId, {
        name: pData.name || item.name || '',
        quantityNeeded: currentQtyNeeded + quantity
      });

      productsSnapshot.push(snap);
    }

    if (productsSnapshot.length === 0) {
      return await failBusinessOrConfig(
        {
          success: false,
          error: 'NO_VALID_PRODUCTS',
          message: 'لم يتم العثور على منتجات صالحة في الطلب'
        },
        400,
        'NO_VALID_PRODUCTS'
      );
    }

    // 12. Calculate pre-coupon shipping, validate optional coupon, and compute final payable total
    subtotal = roundCurrency(subtotal);
    const shippingFee = roundCurrency(calculateShippingFee(governorate, subtotal));

    let appliedCouponSnapshot = null;
    let couponDiscountAmount = 0;

    if (requestedCouponCode) {
      const couponsSnap = await adminDb.ref('settings/coupons').once('value');
      const rawCouponsVal = couponsSnap && typeof couponsSnap.val === 'function' ? couponsSnap.val() : null;
      let matchedCoupon = null;
      let matchedCouponId = null;
      let storedCouponConfigInvalid = false;

      if (rawCouponsVal && typeof rawCouponsVal === 'object' && !Array.isArray(rawCouponsVal)) {
        for (const [key, entry] of Object.entries(rawCouponsVal)) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
          const entryCodeCheck = validateCouponCode(entry.code);
          if (entryCodeCheck.valid && entryCodeCheck.normalizedCode === requestedCouponCode) {
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
            matchedCouponId =
              typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : String(key).trim();
            matchedCoupon = defValidation.value;
            break;
          }
        }
      }

      if (storedCouponConfigInvalid) {
        return await failBusinessOrConfig(
          {
            success: false,
            error: 'INVALID_COUPON_CONFIGURATION',
            message: 'عذراً، كود الخصم غير صالح للاستخدام حالياً.'
          },
          400,
          'INVALID_COUPON_CONFIGURATION'
        );
      }

      const evaluation = evaluateCouponEligibility({
        coupon: matchedCoupon,
        items: couponEvalItems,
        hasPinkFridayInOrder,
        productsMap,
        now: nowMs
      });

      if (!evaluation.eligible || evaluation.discountAmount <= 0) {
        const rejectMessages = {
          COUPON_NOT_FOUND: 'كود الخصم المدخل غير صحيح أو غير موجود.',
          COUPON_DISABLED: 'عذراً، كود الخصم غير مفعّل حالياً.',
          COUPON_NOT_STARTED: 'عذراً، لم تبدأ فترة صلاحية هذا الكوبون بعد.',
          COUPON_EXPIRED: 'عذراً، انتهت صلاحية كود الخصم.',
          PINK_FRIDAY_NOT_COMBINABLE: 'عذراً، لا يمكن استخدام كوبونات الخصم مع منتجات أو عروض Pink Friday.',
          NO_ELIGIBLE_CATEGORY_ITEMS: 'عذراً، لا توجد منتجات مؤهلة لهذا الكوبون في طلبك.',
          EMPTY_ELIGIBLE_SUBTOTAL: 'عذراً، لا توجد منتجات مؤهلة لهذا الكوبون في طلبك.',
          MINIMUM_SUBTOTAL_NOT_MET: `عذراً، يتطلب هذا الكوبون حداً أدنى للمنتجات المؤهلة بقيمة ${matchedCoupon?.minimumSubtotal ?? 0} ج.م.`
        };
        return await failBusinessOrConfig(
          {
            success: false,
            error: evaluation.reason || 'COUPON_INELIGIBLE',
            message: rejectMessages[evaluation.reason] || 'عذراً، كود الخصم غير صالح لهذا الطلب.'
          },
          evaluation.reason === 'PINK_FRIDAY_NOT_COMBINABLE' ? 409 : 400,
          evaluation.reason || 'COUPON_INELIGIBLE'
        );
      }

      couponDiscountAmount = roundCurrency(evaluation.discountAmount);
      const appliedAtIso = new Date(nowMs).toISOString();
      appliedCouponSnapshot = {
        id: matchedCouponId || requestedCouponCode,
        code: matchedCoupon.code,
        discountType: matchedCoupon.discountType,
        discountValue: matchedCoupon.discountValue,
        scope: matchedCoupon.scope,
        categorySlug: matchedCoupon.categorySlug ?? null,
        minimumSubtotal: matchedCoupon.minimumSubtotal ?? null,
        maximumDiscount: matchedCoupon.maximumDiscount ?? null,
        eligibleSubtotal: evaluation.eligibleSubtotal,
        discountAmount: couponDiscountAmount,
        appliedAt: appliedAtIso,
        eligibleProductLines: evaluation.eligibleItems.map((line) => ({
          productId: line.productId,
          categorySlug: line.categorySlug,
          quantity: line.quantity,
          lineSubtotal: line.lineSubtotal
        }))
      };
    }

    const totalAmount = roundCurrency(subtotal - couponDiscountAmount + shippingFee);

    if (totalAmount <= 0) {
      return await failBusinessOrConfig(
        {
          success: false,
          error: requestedCouponCode ? 'INVALID_COUPON_TOTAL' : 'INVALID_TOTAL',
          message: requestedCouponCode ? 'إجمالي الطلب بعد خصم الكوبون يجب أن يكون أكبر من صفر.' : 'إجمالي الطلب غير صحيح'
        },
        400,
        requestedCouponCode ? 'INVALID_COUPON_TOTAL' : 'INVALID_TOTAL'
      );
    }

    // 13. Pre-generate orderId, encrypted invoice token & fixed-ID notifications_outbox BEFORE Commit Fencing
    const nowIso = nowDate.toISOString();
    const orderId =
      idempotencyLock?.reservedOrderId ||
      adminDb.ref('orders').push().key ||
      `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

    const invoiceCode = 'DNY-' + Math.floor(100000 + Math.random() * 900000);

    const orderData = {
      name,
      email: email || 'N/A',
      phone,
      governorate,
      city,
      address,
      products: productsSnapshot,
      subtotal,
      shippingFee,
      totalAmount,
      invoiceCode,
      status: 'New',
      timestamp: nowIso
    };

    if (appliedCouponSnapshot) {
      orderData.coupon = appliedCouponSnapshot;
    }

    if (customerId) {
      orderData.customerId = customerId;
    }

    const tokenArtifacts = prepareNewInvoiceAccessArtifacts(orderId, _deps?.encryptionKey, nowIso);
    const invoiceAccessToken = tokenArtifacts.token;
    if (!isValidInvoiceTokenFormat(invoiceAccessToken)) {
      throw new Error('Generated invoice access token failed validation');
    }

    const outboxRecords = buildOrderOutboxInitialRecords({
      orderId,
      invoiceCode,
      orderData,
      nowIso
    });

    const sealedPayload = {
      orderId,
      invoiceCode,
      orderData,
      orderAccessRecord: tokenArtifacts.orderAccessRecord,
      invoiceAccessRecord: tokenArtifacts.invoiceAccessRecord,
      outboxRecords
    };

    // Allow deterministic concurrency tests to simulate lease expiration or concurrent takeover before commit fence
    if (typeof _deps?.beforeAtomicCommit === 'function') {
      await _deps.beforeAtomicCommit({ idempotencyLock, sealedPayload, adminDb, orderId });
    }

    // 14. Commit Path
    if (idempotencyLock) {
      // 14A. Single-Node Atomic RTDB Commit Fencing (`PENDING -> COMMITTING`)
      const commitTx = await transitionPendingToCommitting({
        lock: idempotencyLock,
        sealedPayload,
        adminDb,
        commitLeaseMs: _deps?.commitLeaseMs
      });

      if (!commitTx.committed) {
        if (commitTx.reason === 'PAYLOAD_TOO_LARGE') {
          return await failBusinessOrConfig(
            {
              success: false,
              error: 'PAYLOAD_TOO_LARGE',
              message: 'حجم بيانات الطلب يتجاوز الحد المسموح.'
            },
            400,
            'PAYLOAD_TOO_LARGE'
          );
        }

        if (commitTx.reason === 'ALREADY_COMPLETED' && commitTx.record) {
          const replayPayload = await resolveCompletedReplayPayload({
            record: commitTx.record,
            adminDb,
            encryptionKey: _deps?.encryptionKey
          });
          return jsonResponse(replayPayload, 200);
        }

        if (commitTx.reason === 'CONFLICT') {
          return jsonResponse(
            {
              success: false,
              error: 'IDEMPOTENCY_CONFLICT',
              message: 'تم استخدام معرف هذا الطلب مسبقاً ببيانات مختلفة.'
            },
            409
          );
        }

        return jsonResponse(
          {
            success: false,
            error: 'ORDER_IN_PROGRESS',
            message: 'انتهت مهلة معالجة الطلب أو يتم تنفيذه حالياً، يرجى إعادة المحاولة.'
          },
          409,
          { 'Retry-After': '5' }
        );
      }

      enteredCommitting = true;

      if (typeof _deps?.beforeMaterialize === 'function') {
        await _deps.beforeMaterialize({
          idempotencyLock,
          commitId: commitTx.commitId,
          commitRecord: commitTx.record,
          adminDb,
          orderId
        });
      }

      // 14B. Idempotent Materialization + Integrity Verification
      const matRes = await materializeCommitPayload({
        commitRecord: commitTx.record,
        adminDb,
        hooks: { beforeVerify: _deps?.beforeVerifyMaterialization }
      });

      if (!matRes.ok) {
        if (matRes.reason === 'ORDER_ADMINISTRATIVELY_DELETED') {
          return jsonResponse(
            {
              success: false,
              error: 'ORDER_DELETED',
              message: 'تم حذف هذا الطلب إدارياً ولا يمكن إعادة إنشائه بنفس المعرف.'
            },
            409
          );
        }
        // Keep status in COMMITTING (NEVER downgrade to FAILED, NEVER return 200)
        return serviceUnavailableResponse();
      }

      if (typeof _deps?.beforeFinalizeCompleted === 'function') {
        await _deps.beforeFinalizeCompleted({
          idempotencyLock,
          commitId: commitTx.commitId,
          commitRecord: commitTx.record,
          adminDb,
          orderId
        });
      }

      // 14C. Atomic `COMMITTING -> COMPLETED` transition (strips temporary commitPayload PII)
      const compRes = await transitionCommittingToCompleted({
        requestKeyHash: idempotencyLock.requestKeyHash,
        commitId: commitTx.commitId,
        adminDb,
        ttlMs: _deps?.idempotencyTtlMs
      });

      if (!compRes.ok) {
        const latestSnap = await adminDb
          .ref(`privateOrderIdempotency/${idempotencyLock.requestKeyHash}`)
          .once('value');
        const latestRec = latestSnap.val();
        if (latestRec && latestRec.status === 'COMPLETED' && latestRec.reservedOrderId === orderId) {
          const replayPayload = await resolveCompletedReplayPayload({
            record: latestRec,
            adminDb,
            encryptionKey: _deps?.encryptionKey
          });
          return jsonResponse(replayPayload, 200);
        }
        return serviceUnavailableResponse();
      }

      atomicCommitted = true;

      // 15. Fully isolated post-commit side-effects (never returns 500 on notification/stock errors)
      await runPostCommitSideEffectsSafely({
        orderData,
        orderId,
        invoiceAccessToken,
        adminDb,
        stockDeductionMap: compRes.alreadyCompletedByRecovery ? new Map() : stockDeductionMap,
        _deps
      });

      return jsonResponse(
        {
          success: true,
          orderId,
          invoiceCode,
          subtotal: orderData.subtotal,
          ...(appliedCouponSnapshot
            ? { couponCode: appliedCouponSnapshot.code, couponDiscountAmount }
            : {}),
          shippingFee: orderData.shippingFee,
          totalAmount: orderData.totalAmount,
          invoiceAccessToken,
          message: 'تم تأكيد طلبك بنجاح'
        },
        200
      );
    }

    // 14D. Transitional legacy path when `clientRequestId` is omitted
    const legacyUpdates = {
      [`orders/${orderId}`]: orderData,
      [`privateOrderAccess/${orderId}`]: tokenArtifacts.orderAccessRecord,
      [`privateInvoiceAccess/${tokenArtifacts.tokenHash}`]: tokenArtifacts.invoiceAccessRecord
    };
    for (const [nid, rec] of Object.entries(outboxRecords)) {
      legacyUpdates[`notifications_outbox/${nid}`] = rec;
    }

    await adminDb.ref().update(legacyUpdates);
    atomicCommitted = true;

    await runPostCommitSideEffectsSafely({
      orderData,
      orderId,
      invoiceAccessToken,
      adminDb,
      stockDeductionMap,
      _deps
    });

    return jsonResponse(
      {
        success: true,
        orderId,
        invoiceCode,
        subtotal: orderData.subtotal,
        ...(appliedCouponSnapshot
          ? { couponCode: appliedCouponSnapshot.code, couponDiscountAmount }
          : {}),
        shippingFee: orderData.shippingFee,
        totalAmount: orderData.totalAmount,
        invoiceAccessToken,
        message: 'تم تأكيد طلبك بنجاح'
      },
      200
    );
  } catch (error) {
    // NEVER downgrade COMMITTING or already-committed orders to FAILED
    if (!enteredCommitting && !atomicCommitted && idempotencyLock && adminDb) {
      await reconcileIdempotencyAfterFailure({
        lock: idempotencyLock,
        adminDb,
        errorCode: error?.code || 'ORDER_CREATION_FAILED'
      });
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.error(
      `[CREATE-ORDER ERROR] Request ID: ${requestId} | Name: ${error?.name || 'Error'} | Message: ${error?.message || String(error)}`
    );
    return jsonResponse(
      {
        success: false,
        error: 'ORDER_CREATION_FAILED',
        requestId,
        message: 'حدث خطأ أثناء معالجة الطلب على السيرفر. يرجى المحاولة مرة أخرى.'
      },
      500
    );
  }
}

export async function ALL() {
  return jsonResponse({ success: false, error: 'Method not allowed' }, 405, { Allow: 'POST' });
}
