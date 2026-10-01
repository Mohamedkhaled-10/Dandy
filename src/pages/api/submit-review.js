export const prerender = false;

// src/pages/api/submit-review.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

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
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getDatabase(adminApp);

    const body = await request.json().catch(() => ({}));
    const { idToken, productId, rating, comment, customerName, orderId } = body || {};

    // 1. التحقق من وجود idToken والتحقق منه عبر Firebase Admin
    if (!idToken || typeof idToken !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'يجب تسجيل الدخول لإرسال التقييم.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authErr) {
      console.warn('Invalid or expired idToken in submit-review:', authErr?.message || authErr);
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const customerId = decodedToken.uid;
    if (!customerId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'تعذر التحقق من هوية الحساب.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. التحقق الدقيق من المدخلات (نفس شروط .validate في rules)
    if (!productId || typeof productId !== 'string' || productId.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_PRODUCT_ID',
        message: 'معرف المنتج مطلوب وغير صالح.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanProductId = productId.trim();
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_RATING',
        message: 'التقييم يجب أن يكون عددًا صحيحًا بين 1 و 5 نجوم.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanComment = typeof comment === 'string' ? comment.trim().slice(0, 1000) : '';
    const cleanCustomerName = (typeof customerName === 'string' && customerName.trim().length > 0)
      ? customerName.trim().slice(0, 100)
      : (decodedToken.name || (decodedToken.email ? decodedToken.email.split('@')[0] : 'عميلة داندي'));
    const cleanOrderId = typeof orderId === 'string' && orderId.trim().length > 0 ? orderId.trim().slice(0, 100) : 'N/A';

    // 3. كتابة التقييم تحت reviews/$productId/$customerId
    const reviewData = {
      rating: ratingNum,
      comment: cleanComment,
      customerName: cleanCustomerName,
      orderId: cleanOrderId,
      createdAt: Date.now()
    };

    await adminDb.ref(`reviews/${cleanProductId}/${customerId}`).set(reviewData);

    // 4. قراءة كافة التقييمات الحقيقية لنفس المنتج وحساب avgRating و reviewCount سيرفرياً بدقة
    const reviewsSnap = await adminDb.ref(`reviews/${cleanProductId}`).once('value');
    const allReviews = reviewsSnap.val() || {};
    const reviewItems = Object.values(allReviews);
    const reviewCount = reviewItems.length;
    const sumRatings = reviewItems.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    const avgRating = reviewCount > 0 ? Math.round((sumRatings / reviewCount) * 10) / 10 : 0;

    // 5. تحديث الحقول المجمعة في عقدة المنتج
    await adminDb.ref(`products/${cleanProductId}`).update({
      avgRating,
      reviewCount
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        review: reviewData,
        avgRating,
        reviewCount
      },
      message: 'تم حفظ التقييم بنجاح وتحديث بيانات المنتج.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error in submit-review API:', err);
    return new Response(JSON.stringify({
      success: false,
      error: 'SERVER_ERROR',
      message: 'حدث خطأ في معالجة التقييم على السيرفر.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
