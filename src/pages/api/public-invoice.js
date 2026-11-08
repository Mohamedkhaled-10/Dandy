export const prerender = false;

// src/pages/api/public-invoice.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getClientIp, getInvoiceRateLimiter } from '../../utils/rate-limit.js';
import { resolvePublicInvoiceByToken, isValidInvoiceTokenFormat } from '../../utils/invoice-token.ts';

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

export async function POST({ request }) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer'
  };

  try {
    const clientIp = getClientIp(request);

    // Rate limiting: 60 queries / 10 min per IP with fail-open
    try {
      const limiter = getInvoiceRateLimiter();
      if (limiter) {
        const { success } = await limiter.limit(clientIp);
        if (!success) {
          return new Response(JSON.stringify({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً.'
          }), { status: 429, headers });
        }
      }
    } catch (rlErr) {
      // Fail open
      console.warn('[PublicInvoice Rate-Limit Warning] Upstash check failed:', rlErr?.message || rlErr);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'طلب غير صالح'
      }), { status: 400, headers });
    }

    const token = typeof body.access === 'string'
      ? body.access.trim()
      : (typeof body.token === 'string' ? body.token.trim() : '');

    if (!isValidInvoiceTokenFormat(token)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVALID_ACCESS_TOKEN',
        message: 'رابط الفاتورة غير صالح أو منتهي الصلاحية'
      }), { status: 404, headers });
    }

    const app = getAdminApp();
    const adminDb = getDatabase(app);

    const resolved = await resolvePublicInvoiceByToken(token, adminDb);

    if (!resolved || !resolved.order) {
      return new Response(JSON.stringify({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: 'لم يتم العثور على الفاتورة المطلوبة أو تم إلغاء صلاحية الرابط'
      }), { status: 404, headers });
    }

    return new Response(JSON.stringify({
      success: true,
      order: resolved.order
    }), { status: 200, headers });

  } catch (err) {
    console.error('[PublicInvoice Error]:', err?.message || err);
    return new Response(JSON.stringify({
      success: false,
      error: 'SERVER_ERROR',
      message: 'حدث خطأ أثناء تحميل الفاتورة. يرجى المحاولة لاحقاً.'
    }), { status: 500, headers });
  }
}

export async function ALL() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
}
