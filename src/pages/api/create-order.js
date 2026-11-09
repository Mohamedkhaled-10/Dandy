export const prerender = false;

// src/pages/api/create-order.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getClientIp, getOrderRateLimiter } from '../../utils/rate-limit.js';
import { verifyTurnstileToken } from '../../utils/turnstile.js';
import {
  getPublishedPinkFridayCampaign,
  getCampaignStatus,
  calculatePinkFridayPricing
} from '../../utils/pink-friday-server.ts';
import { sendOrderNotification } from '../../utils/email-service.ts';
import { getOrCreateInvoiceToken } from '../../utils/invoice-token.ts';
import { sendTelegramNotification } from '../../utils/telegram.js';

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saEnv) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing');
  }

  const serviceAccount = typeof saEnv === 'string' ? JSON.parse(saEnv) : { ...saEnv };
  if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.includes('\\n')) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app'
  });
}

// Shipping rates by governorate in Egypt
const shippingRates = {
  "Gharbia": 70,
  "Dakahlia": 85,
  "Sharqia": 85,
  "Kafr El Sheikh": 85,
  "Qalyubia": 85,
  "Port Said": 85,
  "Damietta": 85,
  "Suez": 85,
  "Ismailia": 85,
  "Cairo": 85,
  "Giza": 85,
  "Beheira": 85,
  "Monufia": 85,
  "Alexandria": 85,
  "Fayoum": 100,
  "Beni Suef": 100,
  "Minya": 100,
  "Luxor": 120,
  "Aswan": 120,
  "Assiut": 120,
  "Sohag": 120,
  "North Sinai": 120,
  "South Sinai": 120,
  "Qena": 120,
  "New Valley": 120,
  "Red Sea": 120,
  "Matrouh": 120
};

function getShippingFeeForGov(govName) {
  if (!govName) return 120;
  return shippingRates[govName] !== undefined ? shippingRates[govName] : 120;
}

export async function POST({ request }) {
  try {
    const clientIp = getClientIp(request);

    // 1. تطبيق Rate Limiting عبر Upstash Redis (10 طلبات في الدقيقة لكل IP) بمبدأ Fail Open لحماية المبيعات
    try {
      const orderLimiter = getOrderRateLimiter();
      if (orderLimiter) {
        const { success, limit, remaining, reset } = await orderLimiter.limit(clientIp);
        if (!success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'تم تجاوز الحد المسموح من الطلبات لهذا الجهاز. يرجى الانتظار دقيقة والمحاولة لاحقًا.'
          }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset)
            }
          });
        }
      }
    } catch (rateLimitErr) {
      // Fail Open: في حالة انقطاع اتصال Upstash Redis أو حدوث خلل شبكي، لا نوقف المبيعات
      console.warn(`[RATE-LIMIT WARNING - FAIL OPEN] Upstash Redis check failed in create-order for IP ${clientIp}. Continuing order execution. Error:`, rateLimitErr?.message || rateLimitErr);
    }

    const body = await request.json().catch(() => ({}));
    const customer = body.customer || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const idToken = body.idToken;
    const turnstileToken = body.turnstileToken || body['cf-turnstile-response'];

    // 2. التحقق الإلزامي من Cloudflare Turnstile CAPTCHA (سيرفر لسيرفر)
    if (!turnstileToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'CAPTCHA_REQUIRED',
        message: 'يرجى إكمال اختبار التحقق الأمني (CAPTCHA) قبل تأكيد الطلب.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
    if (!turnstileResult.success) {
      const isConfigError = turnstileResult.error === 'SERVER_MISCONFIGURATION';
      return new Response(JSON.stringify({
        success: false,
        error: turnstileResult.error || 'CAPTCHA_FAILED',
        message: turnstileResult.message || 'فشل التحقق الأمني من الكابتشا. يرجى إعادة المحاولة.'
      }), {
        status: isConfigError ? 500 : 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const name = typeof customer.name === 'string' ? customer.name.trim() : '';
    const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
    const email = typeof customer.email === 'string' ? customer.email.trim() : 'N/A';
    const governorate = typeof customer.governorate === 'string' ? customer.governorate.trim() : '';
    const city = typeof customer.city === 'string' ? customer.city.trim() : '';
    const address = typeof customer.address === 'string' ? customer.address.trim() : '';

    // التحقق الصارم من الحقول الأساسية لمطابقة database.rules.json
    if (name.length < 2) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_NAME',
        message: 'الاسم يجب ألا يقل عن حرفين'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (phone.length < 10) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_PHONE',
        message: 'رقم الهاتف يجب ألا يقل عن 10 أرقام'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (governorate.length < 2) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_GOVERNORATE',
        message: 'يرجى اختيار المحافظة بشكل صحيح'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!city) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_CITY',
        message: 'يرجى إدخال اسم المدينة أو المركز'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (address.length < 3) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_ADDRESS',
        message: 'العنوان يجب ألا يقل عن 3 أحرف'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'EMPTY_CART',
        message: 'سلة المشتريات فارغة'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.error('FIREBASE_SERVICE_ACCOUNT not configured in environment.');
      return new Response(JSON.stringify({
        success: false,
        error: 'SERVER_CONFIG_ERROR',
        message: 'إعدادات السيرفر غير مكتملة.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const app = getAdminApp();
    const adminDb = getDatabase(app);
    const adminAuth = getAuth(app);

    // التحقق من حساب العميل إن وُجد idToken
    let customerId = null;
    if (idToken) {
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        customerId = decoded.uid || null;
      } catch (tokenErr) {
        console.warn('Could not verify idToken:', tokenErr.message);
      }
    }

    // جلب المنتجات والأسعار الحقيقية من قاعدة البيانات وإعادة الحساب
    const productsSnapshot = [];
    let subtotal = 0;

    // جلب أحدث نسخة منشورة ومعتمدة لحملة Pink Friday من قاعدة البيانات
    let activeCampaign = null;
    try {
      const campSnap = await adminDb.ref('settings/pinkFriday/publishedActiveCampaign').once('value');
      activeCampaign = campSnap.val();
    } catch (campErr) {
      console.warn('Could not fetch publishedActiveCampaign from RTDB:', campErr.message);
    }
    if (!activeCampaign) {
      activeCampaign = await getPublishedPinkFridayCampaign();
    }

    // Map to track stock deduction for individual products (including components of collection bundles)
    const stockDeductionMap = new Map(); // productId -> { name: string, quantityNeeded: number }

    for (const item of items) {
      // Check if this item is a Pink Friday Collection bundle
      if (item.type === 'collection' || item.isCollection || item.collectionId) {
        const colId = item.collectionId || item.id;
        const quantity = parseInt(item.quantity) || 1;
        if (!colId || quantity <= 0) continue;

        // Verify campaign is active
        const campStatus = (activeCampaign && activeCampaign.enabled !== false)
          ? getCampaignStatus(activeCampaign)
          : 'disabled';

        if (campStatus !== 'active') {
          return new Response(JSON.stringify({
            success: false,
            error: 'CAMPAIGN_COLLECTION_CONFLICT',
            message: `عذراً، عروض Pink Friday غير متاحة حالياً أو انتهت صلاحيتها.`
          }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const rawColls = activeCampaign?.collections;
        const activeCollections = Array.isArray(rawColls)
          ? rawColls
          : (rawColls && typeof rawColls === 'object' ? Object.values(rawColls) : []);

        const collection = activeCollections.find(c => c && String(c.id) === String(colId));

        if (!collection || collection.active === false) {
          return new Response(JSON.stringify({
            success: false,
            error: 'CAMPAIGN_COLLECTION_CONFLICT',
            message: `عذراً، كوليكشن Pink Friday المطلوب غير متاح حالياً أو تم إلغاؤه.`
          }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Validate items inside collection
        const collectionItemsList = Array.isArray(collection.items)
          ? collection.items
          : (collection.items && typeof collection.items === 'object' ? Object.values(collection.items) : []);

        if (collectionItemsList.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'INVALID_COLLECTION',
            message: `عذراً، كوليكشن "${collection.name}" لا يحتوي على منتجات.`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Enforce duplicate restriction if allowDuplicates is false
        if (!collection.allowDuplicates) {
          const itemPids = collectionItemsList.map(it => String(it.productId));
          const uniquePids = new Set(itemPids);
          if (uniquePids.size !== itemPids.length) {
            return new Response(JSON.stringify({
              success: false,
              error: 'COLLECTION_DUPLICATE_DISALLOWED',
              message: `عذراً، كوليكشن "${collection.name}" يحتوي على تكرار غير مصرح به.`
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        let totalBasePrice = 0;
        const resolvedCollectionItems = [];

        for (const cItem of collectionItemsList) {
          const pSnap = await adminDb.ref(`products/${cItem.productId}`).once('value');
          if (!pSnap.exists()) {
            return new Response(JSON.stringify({
              success: false,
              error: 'PRODUCT_NOT_FOUND',
              message: `عذراً، أحد منتجات كوليكشن "${collection.name}" لم يعد متاحاً.`
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const pData = pSnap.val();
          if (pData.isHidden || pData.isSoldOut) {
            return new Response(JSON.stringify({
              success: false,
              error: 'PRODUCT_UNAVAILABLE',
              message: `عذراً، المنتج "${pData.name || ''}" داخل كوليكشن "${collection.name}" غير متاح حالياً.`
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const itemBasePrice = parseFloat(String(pData.price).replace(/[^0-9.-]+/g, '')) || 0;
          totalBasePrice += itemBasePrice;

          // Find variant selected by customer for this specific collection item
          const clientSelectedItems = Array.isArray(item.selectedItems) ? item.selectedItems : (Array.isArray(item.items) ? item.items : []);
          const clientChoice = clientSelectedItems.find(csi =>
            (csi.collectionItemId && String(csi.collectionItemId) === String(cItem.collectionItemId)) ||
            (csi.productId && String(csi.productId) === String(cItem.productId))
          );

          let variantText = '';
          if (clientChoice) {
            if (clientChoice.selectedVariant?.name) variantText = clientChoice.selectedVariant.name;
            else if (clientChoice.variantName) variantText = clientChoice.variantName;
            else if (clientChoice.variant) variantText = typeof clientChoice.variant === 'object' ? clientChoice.variant.name : String(clientChoice.variant);
          }

          resolvedCollectionItems.push({
            collectionItemId: cItem.collectionItemId,
            productId: cItem.productId,
            productName: pData.name || '',
            image: pData.image || '',
            price: itemBasePrice,
            variantName: variantText
          });

          // Add to stock deduction requirement
          const currentQtyNeeded = stockDeductionMap.get(cItem.productId)?.quantityNeeded || 0;
          stockDeductionMap.set(cItem.productId, {
            name: pData.name || '',
            quantityNeeded: currentQtyNeeded + quantity
          });
        }

        // Calculate effective collection bundle price
        let effectiveUnitPrice = totalBasePrice;
        if (collection.pricingType === 'package' && typeof collection.packagePrice === 'number' && collection.packagePrice > 0) {
          effectiveUnitPrice = collection.packagePrice;
        } else if (collection.pricingType === 'percentage' && typeof collection.discountPercentage === 'number' && collection.discountPercentage > 0) {
          effectiveUnitPrice = Math.round(totalBasePrice * (1 - collection.discountPercentage / 100));
        }

        const lineTotal = effectiveUnitPrice * quantity;
        subtotal += lineTotal;

        const snap = {
          type: 'collection',
          collectionId: collection.id,
          name: collection.name || item.name || 'كوليكشن Pink Friday',
          price: totalBasePrice,
          effectiveUnitPrice: effectiveUnitPrice,
          lineTotal: lineTotal,
          quantity: quantity,
          image: collection.coverImage || resolvedCollectionItems[0]?.image || '',
          isPinkFriday: true,
          isCollection: true,
          badgeText: collection.badgeText || 'كوليكشن Pink Friday',
          items: resolvedCollectionItems
        };

        productsSnapshot.push(snap);
        continue;
      }

      // Standard Product Item Handling
      const rawId = item.productId || (item.id ? String(item.id).split('::')[0] : '');
      const quantity = parseInt(item.quantity) || 1;
      if (!rawId || quantity <= 0) continue;

      const productSnap = await adminDb.ref(`products/${rawId}`).once('value');
      if (!productSnap.exists()) {
        return new Response(JSON.stringify({
          success: false,
          error: 'PRODUCT_NOT_FOUND',
          message: `عذراً، أحد المنتجات المطلوبة لم يعد متاحاً.`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const pData = productSnap.val();
      const priceVal = parseFloat(String(pData.price).replace(/[^0-9.-]+/g, '')) || 0;

      // التحقق الصارم من عروض Pink Friday من السيرفر فقط
      const pfPricing = calculatePinkFridayPricing({
        id: rawId,
        price: priceVal,
        isHidden: Boolean(pData.isHidden),
        isSoldOut: Boolean(pData.isSoldOut),
        onSale: Boolean(pData.onSale),
        discount: pData.discount
      }, activeCampaign);

      // في حال كان العميل يدّعي وجود عرض Pink Friday
      const isClientClaimingCampaign = Boolean(item.isPinkFriday || item.campaignPrice);
      if (isClientClaimingCampaign && !pfPricing.isEligible) {
        return new Response(JSON.stringify({
          success: false,
          error: 'CAMPAIGN_OFFER_CONFLICT',
          message: `عذراً، عرض Pink Friday للمنتج "${pData.name || item.name || ''}" لم يعد متاحاً أو تم تحديث سعره. يرجى مراجعة سلة المشتريات.`
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const effectiveUnitPrice = pfPricing.isEligible ? pfPricing.campaignPrice : priceVal;
      const lineTotal = effectiveUnitPrice * quantity;
      subtotal += lineTotal;

      const snap = {
        id: rawId,
        name: pData.name || item.name || '',
        price: priceVal,
        quantity: quantity,
        effectiveUnitPrice: effectiveUnitPrice,
        lineTotal: lineTotal,
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

      // استخراج ومعالجة الروائح والمتغيرات (مطابق لـ cart.astro)
      const rawVariants = (Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0)
        ? item.selectedVariants
        : (item.selectedVariant ? [item.selectedVariant] : (item.variantName ? [{ id: item.variantId || 'scent-variant', name: item.variantName }] : []));

      if (rawVariants.length > 0) {
        const cleanVariants = rawVariants.map(v => ({
          id: v.id || 'scent-variant',
          name: v.name || String(v)
        }));
        snap.selectedVariants = cleanVariants;

        if (cleanVariants.length === 1) {
          snap.selectedVariant = cleanVariants[0];
          snap.variantName = cleanVariants[0].name;
        } else {
          snap.variantName = cleanVariants.map(v => v.name).join('، ');
        }
      }

      // Add to stock deduction map
      const currentQtyNeeded = stockDeductionMap.get(rawId)?.quantityNeeded || 0;
      stockDeductionMap.set(rawId, {
        name: pData.name || item.name || '',
        quantityNeeded: currentQtyNeeded + quantity
      });

      productsSnapshot.push(snap);
    }

    if (productsSnapshot.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'NO_VALID_PRODUCTS',
        message: 'لم يتم العثور على منتجات صالحة في الطلب'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // حساب مصاريف الشحن مع الشحن المجاني فوق 2000 ج.م
    let shippingFee = getShippingFeeForGov(governorate);
    if (subtotal > 2000) {
      shippingFee = 0;
    }
    const totalAmount = subtotal + shippingFee;

    if (totalAmount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_TOTAL',
        message: 'إجمالي الطلب غير صحيح'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const invoiceCode = 'DNY-' + Math.floor(100000 + Math.random() * 900000);

    const orderData = {
      name,
      email: email || 'N/A',
      phone,
      governorate,
      city,
      address,
      products: productsSnapshot,
      subtotal: parseFloat(subtotal.toFixed(2)),
      shippingFee: parseFloat(shippingFee.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      invoiceCode,
      status: 'New',
      timestamp: new Date().toISOString()
    };

    if (customerId) {
      orderData.customerId = customerId;
    }

    // حفظ الطلب في Firebase Database
    const orderRef = adminDb.ref('orders').push();
    await orderRef.set(orderData);
    const orderId = orderRef.key;

    // تحديث المخزون وتجميع تنبيهات المخزون المنخفض/النافد
    const lowStockAlerts = [];
    for (const [prodId, stockInfo] of stockDeductionMap.entries()) {
      const orderedQty = stockInfo.quantityNeeded;
      if (prodId && orderedQty > 0) {
        try {
          const stockRef = adminDb.ref(`products/${prodId}/stockQuantity`);
          await stockRef.transaction(current => {
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
          console.error(`Error updating stock for product ${prodId}:`, stockErr);
        }
      }
    }

    // 1. توليد رمز الوصول الآمن للفاتورة وحفظه في العقد الخاصة
    let invoiceAccessToken = null;
    try {
      invoiceAccessToken = await getOrCreateInvoiceToken(orderId, adminDb);
    } catch (tokenErr) {
      console.error('[CreateOrder] Failed generating private invoice access token:', tokenErr);
    }

    // 2. إرسال إشعار تأكيد الطلب للعميل عبر Google Apps Script Mail Relay (معزول وبمهلة محددة)
    const emailPromise = sendOrderNotification({
      order: orderData,
      orderId,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken
    }).catch(mailErr => {
      console.error('[CreateOrder] Order confirmation email dispatch failed (resilient):', mailErr);
      return null;
    });

    // 3. إرسال إشعار التيليجرام للطلب الجديد عبر الخدمة المركزية (منتظرة وبمهلة 4 ثوانٍ مع عزل كامل للأخطاء)
    const telegramOrderPromise = sendTelegramNotification({
      order: orderData,
      orderId,
      timeoutMs: 4000
    }).catch(tgErr => {
      console.error('[CreateOrder] Telegram order notification failed (resilient):', tgErr);
      return null;
    });

    // 4. إرسال تنبيهات المخزون المنخفض/النافد عبر تيليجرام (إن وُجدت)
    const lowStockPromises = lowStockAlerts.map(alert =>
      sendTelegramNotification({
        lowStockAlert: true,
        productName: alert.productName,
        remainingQty: alert.remainingQty,
        timeoutMs: 4000
      }).catch(lsErr => {
        console.error(`[CreateOrder] Telegram low stock alert failed for ${alert.productName} (resilient):`, lsErr);
        return null;
      })
    );

    // 5. إرسال Webhook (Make.com) من متغير البيئة MAKE_WEBHOOK_URL
    let makeWebhookPromise = Promise.resolve(null);
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (makeWebhookUrl) {
      const isGmailEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED === 'true';
      const isMakeEmailExplicitlyDisabled = process.env.DISABLE_MAKE_INVOICE_EMAIL === 'true';
      const shouldSuppressMakeInvoiceEmail = isGmailEnabled || isMakeEmailExplicitlyDisabled;

      const makePayload = {
        ...orderData,
        sendEmailInvoice: !shouldSuppressMakeInvoiceEmail,
        skipEmailNotification: shouldSuppressMakeInvoiceEmail,
        disableBrevoEmail: shouldSuppressMakeInvoiceEmail,
        emailProvider: isGmailEnabled ? 'GMAIL_RELAY' : (shouldSuppressMakeInvoiceEmail ? 'NONE' : 'BREVO')
      };

      const makeController = new AbortController();
      const makeTimer = setTimeout(() => makeController.abort(), 4000);
      makeWebhookPromise = fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makePayload),
        signal: makeController.signal
      })
        .then(() => clearTimeout(makeTimer))
        .catch(whErr => {
          clearTimeout(makeTimer);
          console.error('Make webhook sending failed (resilient):', whErr);
          return null;
        });
    }

    // انتظار جميع الإشعارات والمهام بالتوازي لضمان اكتمالها داخل بيئة Vercel Serverless دون تأخير تجربة العميل
    await Promise.allSettled([
      emailPromise,
      telegramOrderPromise,
      ...lowStockPromises,
      makeWebhookPromise
    ]);

    return new Response(JSON.stringify({
      success: true,
      orderId,
      invoiceCode,
      subtotal: orderData.subtotal,
      shippingFee: orderData.shippingFee,
      totalAmount: orderData.totalAmount,
      message: 'تم تأكيد طلبك بنجاح'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.error(`[CREATE-ORDER ERROR] Request ID: ${requestId} | Name: ${error?.name || 'Error'} | Message: ${error?.message || String(error)}`);
    return new Response(JSON.stringify({
      success: false,
      error: 'ORDER_CREATION_FAILED',
      requestId,
      message: 'حدث خطأ أثناء معالجة الطلب على السيرفر. يرجى المحاولة مرة أخرى.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function ALL() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
