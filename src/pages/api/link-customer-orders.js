export const prerender = false;

// src/pages/api/link-customer-orders.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getClientIp, getLinkOrdersRateLimiter } from '../../utils/rate-limit.js';

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

export async function POST({ request }) {
  try {
    const clientIp = getClientIp(request);

    // تطبيق Rate Limiting عبر Upstash Redis (5 محاولات في الدقيقة لكل IP) بمبدأ Fail Open
    try {
      const linkLimiter = getLinkOrdersRateLimiter();
      if (linkLimiter) {
        const { success, limit, remaining, reset } = await linkLimiter.limit(clientIp);
        if (!success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'تم تجاوز الحد المسموح من طلبات ربط الحساب. يرجى الانتظار دقيقة والمحاولة لاحقًا.'
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
    } catch (redisErr) {
      console.warn(`[RATE-LIMIT WARNING - FAIL OPEN] Upstash Redis check failed in link-customer-orders for IP ${clientIp}:`, redisErr?.message || redisErr);
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.warn('FIREBASE_SERVICE_ACCOUNT not configured in environment. Operation simulated.');
      return new Response(JSON.stringify({
        success: true,
        simulated: true,
        linkedCount: 0,
        message: 'FIREBASE_SERVICE_ACCOUNT is not configured in environment'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json().catch(() => ({}));
    const { idToken } = body;

    if (!idToken) {
      return new Response(JSON.stringify({ error: 'Missing idToken' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const adminDb = getDatabase(app);

    // التحقق الصارم من صحة توكن المستخدم واستخراج uid الآمن
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (!uid) {
      return new Response(JSON.stringify({ error: 'Invalid token or missing uid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // سد ثغرة IDOR: جلب رقم الهاتف من السجل الموثق للعميل حصراً وتجاهل أي رقم قادم في الطلب
    const custPhoneSnap = await adminDb.ref(`customers/${uid}/phone`).once('value');
    const registeredPhone = custPhoneSnap.val();

    if (!registeredPhone || typeof registeredPhone !== 'string' || registeredPhone.trim().length < 10) {
      return new Response(JSON.stringify({
        success: false,
        error: 'PHONE_NOT_REGISTERED',
        message: 'لا يوجد رقم هاتف مسجل ومؤكد في ملف العميل لربط الطلبات به'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // تنظيف وتجهيز صيغ أرقام الهاتف المختلفة (01xxxxxxxxx أو +201xxxxxxxxx)
    const phoneStr = String(registeredPhone).trim();
    const cleanDigits = phoneStr.replace(/\D/g, '');
    const phoneVariants = new Set();
    phoneVariants.add(phoneStr);
    if (phoneStr.startsWith('+20')) {
      phoneVariants.add('0' + phoneStr.slice(3));
      phoneVariants.add(phoneStr.slice(3));
    } else if (phoneStr.startsWith('0')) {
      phoneVariants.add('+2' + phoneStr);
      phoneVariants.add('+20' + phoneStr.slice(1));
      phoneVariants.add(phoneStr.slice(1));
    } else if (cleanDigits.length === 10) {
      phoneVariants.add('0' + cleanDigits);
      phoneVariants.add('+20' + cleanDigits);
    }

    let linkedCount = 0;
    const processedOrderIds = new Set();

    for (const variant of phoneVariants) {
      const snap = await adminDb.ref('orders').orderByChild('phone').equalTo(variant).once('value');
      if (snap.exists()) {
        const orders = snap.val();
        for (const [orderId, orderData] of Object.entries(orders)) {
          if (!processedOrderIds.has(orderId)) {
            processedOrderIds.add(orderId);
            // ربط الطلب فقط إذا لم يكن يملك customerId بالفعل
            if (!orderData?.customerId) {
              await adminDb.ref(`orders/${orderId}/customerId`).set(uid);
              linkedCount++;
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      linkedCount,
      message: `تم ربط ${linkedCount} طلب/طلبات بحساب العميل بنجاح`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in link-customer-orders endpoint:', error);
    return new Response(JSON.stringify({
      error: 'Failed to link customer orders',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
