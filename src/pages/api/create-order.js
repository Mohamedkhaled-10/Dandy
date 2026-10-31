export const prerender = false;

// src/pages/api/create-order.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getClientIp, getOrderRateLimiter } from '../../utils/rate-limit.js';
import { verifyTurnstileToken } from '../../utils/turnstile.js';

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saEnv) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing');
  }

  const serviceAccount = typeof saEnv === 'string' ? JSON.parse(saEnv) : saEnv;

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

async function sendLowStockTelegram(productName, remainingQty) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatIdsStr = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatIdsStr) return;

  try {
    const message = `⚠️ *تنبيه مخزون منخفض في متجر داندي!*
────────────────
📦 *المنتج:* ${productName || '-'}
📉 *الكمية المتبقية:* ${remainingQty ?? 0}
⏱ *الوقت:* ${new Date().toLocaleString('ar-EG')}

🔗 *إدارة المنتجات:*
https://dandy-ebon.vercel.app/dashboard-product`;

    const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const chatIds = chatIdsStr.split(',').map(id => id.trim()).filter(Boolean);

    for (const chatId of chatIds) {
      fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      }).catch(err => console.error('Telegram notification error:', err));
    }
  } catch (err) {
    console.error('Error sending low stock telegram notification:', err);
  }
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
      return new Response(JSON.stringify({
        success: false,
        error: turnstileResult.error || 'CAPTCHA_FAILED',
        message: turnstileResult.message || 'فشل التحقق الأمني من الكابتشا. يرجى إعادة المحاولة.'
      }), {
        status: 403,
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

    for (const item of items) {
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
      const effectiveUnitPrice = priceVal;
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

      if (pData.discount) snap.discount = pData.discount;
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

    const internalSecret = process.env.INTERNAL_API_SECRET ? process.env.INTERNAL_API_SECRET.trim() : null;

    // تحديث المخزون باستخدام Transaction وإطلاق تنبيه المخزون المنخفض
    for (const snap of productsSnapshot) {
      const prodId = snap.id;
      const orderedQty = snap.quantity;
      if (prodId) {
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
          if (typeof newQty === 'number' && !isNaN(newQty) && newQty <= 0) {
            await adminDb.ref(`products/${prodId}/isSoldOut`).set(true);
          }
          if (typeof newQty === 'number' && !isNaN(newQty) && newQty <= 3 && newQty > 0) {
            if (!internalSecret) {
              console.error('Telegram low stock notification skipped (Fail Closed): INTERNAL_API_SECRET is missing or empty in environment.');
            } else {
              try {
                const sendTelegramUrl = new URL('/api/send-telegram', request.url).toString();
                fetch(sendTelegramUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': internalSecret
                  },
                  body: JSON.stringify({
                    lowStockAlert: true,
                    productName: snap.name,
                    remainingQty: newQty
                  })
                }).catch(tgErr => console.error('Telegram low stock notification failed:', tgErr));
              } catch (e) {
                console.error('Error initiating low stock telegram fetch:', e);
              }
            }
          }
        } catch (stockErr) {
          console.error(`Error updating stock for product ${prodId}:`, stockErr);
        }
      }
    }

    // إرسال إشعار التيليجرام للطلب الجديد داخلياً مع الرمز السري (سيرفر لسيرفر)
    if (!internalSecret) {
      console.error('Telegram order notification skipped (Fail Closed): INTERNAL_API_SECRET is missing or empty in environment.');
    } else {
      try {
        const sendTelegramUrl = new URL('/api/send-telegram', request.url).toString();
        fetch(sendTelegramUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': internalSecret
          },
          body: JSON.stringify({ order: orderData, orderId })
        }).catch(tgErr => console.error('Telegram order notification failed:', tgErr));
      } catch (e) {
        console.error('Error initiating telegram fetch:', e);
      }
    }

    // إرسال Webhook (Make.com) من متغير البيئة MAKE_WEBHOOK_URL
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (makeWebhookUrl) {
      fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      }).catch(whErr => {
        console.error('Make webhook sending failed:', whErr);
      });
    }

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
    console.error('Error in create-order endpoint:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'ORDER_CREATION_FAILED',
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
