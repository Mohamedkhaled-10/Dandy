export const prerender = false;

// src/pages/api/order-status.js
// Server-side protected API for single/bulk order status updates and notification retries
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import {
  sendOrderNotification,
  normalizeOrderStatus,
  CANONICAL_STATUSES,
  isValidEmail,
  sendDiagnosticRelayEmail,
  FIXED_DIAGNOSTIC_RECIPIENT
} from '../../utils/email-service.ts';
import { getOrCreateInvoiceToken } from '../../utils/invoice-token.ts';

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

async function authenticateAdmin(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) return null;

  try {
    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded && decoded.email && decoded.email.toLowerCase() === 'admin@dandy.com') {
      return decoded;
    }
  } catch (err) {
    console.warn('[OrderStatus Admin API] Auth verification failed:', err.message);
  }
  return null;
}

export async function POST({ request }) {
  const admin = await authenticateAdmin(request);
  if (!admin) {
    return new Response(JSON.stringify({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Admin authorization required'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: 'INVALID_JSON',
      message: 'Invalid JSON request payload'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { action = 'UPDATE_STATUS' } = body;
  const app = getAdminApp();
  const db = getDatabase(app);

  try {
    // -------------------------------------------------------------------------
    // ACTION 1: UPDATE_STATUS (Single Order)
    // -------------------------------------------------------------------------
    if (action === 'UPDATE_STATUS') {
      const { orderId, newStatus } = body;
      if (!orderId || typeof orderId !== 'string') {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_ORDER_ID',
          message: 'Order ID is required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const normalizedNewStatus = normalizeOrderStatus(newStatus);
      const orderRef = db.ref(`orders/${orderId}`);
      const orderSnap = await orderRef.once('value');
      const orderData = orderSnap.val();

      if (!orderData) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      const oldStatus = normalizeOrderStatus(orderData.status);

      // If status has not changed, do nothing and return cleanly
      if (oldStatus === normalizedNewStatus) {
        return new Response(JSON.stringify({
          success: true,
          orderId,
          status: normalizedNewStatus,
          message: 'Status unchanged; skipped notification generation',
          changed: false
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Update order status in Firebase
      const nowIso = new Date().toISOString();
      await orderRef.update({
        status: normalizedNewStatus,
        lastStatusUpdate: nowIso,
        lastUpdatedBy: admin.email
      });

      // Trigger notification outbox workflow
      let notifResult = null;
      try {
        notifResult = await sendOrderNotification({
          order: { ...orderData, status: normalizedNewStatus },
          orderId,
          eventType: 'ORDER_STATUS_CHANGED',
          newStatus: normalizedNewStatus,
          oldStatus
        });
      } catch (notifErr) {
        console.error(`[OrderStatus API] Notification dispatch error for ${orderId}:`, notifErr);
      }

      return new Response(JSON.stringify({
        success: true,
        orderId,
        status: normalizedNewStatus,
        previousStatus: oldStatus,
        changed: true,
        notification: notifResult
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------------
    // ACTION 2: BULK_UPDATE_STATUS
    // -------------------------------------------------------------------------
    if (action === 'BULK_UPDATE_STATUS') {
      const { orderIds, newStatus } = body;
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_ORDER_IDS',
          message: 'Array of order IDs is required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const normalizedNewStatus = normalizeOrderStatus(newStatus);
      const results = [];
      let updatedCount = 0;
      let skippedCount = 0;

      for (const id of orderIds) {
        try {
          const oRef = db.ref(`orders/${id}`);
          const oSnap = await oRef.once('value');
          const oData = oSnap.val();

          if (!oData) {
            results.push({ orderId: id, success: false, error: 'NOT_FOUND' });
            continue;
          }

          const prevStatus = normalizeOrderStatus(oData.status);
          if (prevStatus === normalizedNewStatus) {
            skippedCount++;
            results.push({ orderId: id, success: true, changed: false, status: normalizedNewStatus });
            continue;
          }

          const nowIso = new Date().toISOString();
          await oRef.update({
            status: normalizedNewStatus,
            lastStatusUpdate: nowIso,
            lastUpdatedBy: admin.email
          });

          updatedCount++;

          // Trigger email notification for each updated order
          const notif = await sendOrderNotification({
            order: { ...oData, status: normalizedNewStatus },
            orderId: id,
            eventType: 'ORDER_STATUS_CHANGED',
            newStatus: normalizedNewStatus,
            oldStatus: prevStatus
          });

          results.push({
            orderId: id,
            success: true,
            changed: true,
            status: normalizedNewStatus,
            notification: notif
          });

        } catch (itemErr) {
          console.error(`[OrderStatus API] Bulk item error for ${id}:`, itemErr);
          results.push({ orderId: id, success: false, error: itemErr.message });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        targetStatus: normalizedNewStatus,
        totalRequested: orderIds.length,
        updatedCount,
        skippedCount,
        results
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------------
    // ACTION 3: RETRY_NOTIFICATION (Manual Retry from Admin Dashboard)
    // -------------------------------------------------------------------------
    if (action === 'RETRY_NOTIFICATION') {
      const { notificationId, orderId } = body;
      if (!notificationId || !orderId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_PARAMS',
          message: 'Both notificationId and orderId are required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      // Check existing notification in outbox
      const notifRef = db.ref(`notifications_outbox/${notificationId}`);
      const notifSnap = await notifRef.once('value');
      const notifData = notifSnap.val();

      if (!notifData) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NOTIFICATION_NOT_FOUND',
          message: `Outbox notification ${notificationId} not found`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      // If already accepted by mailapp, reject duplicate send
      if (notifData.status === 'accepted_by_mailapp') {
        return new Response(JSON.stringify({
          success: true,
          status: 'accepted_by_mailapp',
          message: 'Notification was already accepted by MailApp; duplicate send blocked',
          notificationId
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Fetch fresh order details
      const orderSnap = await db.ref(`orders/${orderId}`).once('value');
      const orderData = orderSnap.val();
      if (!orderData) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found for retry`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      // Fetch or generate secure private invoice access token
      const invoiceAccessToken = await getOrCreateInvoiceToken(orderId, db);

      // Retry send using the SAME notification ID (enforces Apps Script idempotency)
      const retryResult = await sendOrderNotification({
        order: orderData,
        orderId,
        eventType: notifData.eventType || 'ORDER_STATUS_CHANGED',
        newStatus: notifData.orderStatus || orderData.status,
        retryNotificationId: notificationId,
        invoiceAccessToken
      });

      return new Response(JSON.stringify({
        success: retryResult.success,
        notificationId,
        status: retryResult.status,
        message: retryResult.message || 'Retry attempted',
        result: retryResult
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------------
    // ACTION 3.5: SEND_CURRENT_STATUS_NOTIFICATION (For historical or manual updates)
    // -------------------------------------------------------------------------
    if (action === 'SEND_CURRENT_STATUS_NOTIFICATION') {
      const { orderId } = body;
      if (!orderId || typeof orderId !== 'string') {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_ORDER_ID',
          message: 'Order ID is required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const orderRef = db.ref(`orders/${orderId}`);
      const orderSnap = await orderRef.once('value');
      const orderData = orderSnap.val();

      if (!orderData) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      const rawEmail = orderData.email;
      if (!isValidEmail(rawEmail)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NO_VALID_EMAIL',
          message: 'لا يوجد بريد إلكتروني صالح مسجل لهذا الطلب'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const currentCanonicalStatus = normalizeOrderStatus(orderData.status);
      const isInitialStatus = (currentCanonicalStatus === 'جديد');
      const eventType = isInitialStatus ? 'ORDER_CONFIRMATION' : 'ORDER_STATUS_CHANGED';

      const statusSlug = currentCanonicalStatus === 'قيد التجهيز' ? 'processing'
        : currentCanonicalStatus === 'تم الشحن' ? 'shipped'
        : currentCanonicalStatus === 'تم التوصيل' ? 'delivered'
        : currentCanonicalStatus === 'ملغي' ? 'cancelled'
        : 'new';

      const notificationId = isInitialStatus
        ? `notif_order_${orderId}_confirmation`
        : `notif_order_${orderId}_status_${statusSlug}`;

      // Check if notification already accepted by MailApp to prevent duplicate sending
      const notifRef = db.ref(`notifications_outbox/${notificationId}`);
      const notifSnap = await notifRef.once('value');
      const existingNotif = notifSnap.val();

      if (existingNotif && existingNotif.status === 'accepted_by_mailapp') {
        return new Response(JSON.stringify({
          success: true,
          status: 'accepted_by_mailapp',
          notificationId,
          deduplicated: true,
          message: 'تم إرسال وقبول إشعار هذه الحالة مسبقاً بنجاح عبر MailApp (تم منع التكرار)',
          notification: existingNotif
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Generate or retrieve secure private invoice access token
      const invoiceAccessToken = await getOrCreateInvoiceToken(orderId, db);

      // Dispatch notification
      const sendResult = await sendOrderNotification({
        order: { ...orderData, status: currentCanonicalStatus },
        orderId,
        eventType,
        newStatus: currentCanonicalStatus,
        retryNotificationId: notificationId,
        invoiceAccessToken
      });

      return new Response(JSON.stringify({
        success: sendResult.success,
        orderId,
        currentStatus: currentCanonicalStatus,
        notificationId,
        status: sendResult.status,
        message: sendResult.message || 'تم إرسال إشعار الحالة الحالية للعميل بنجاح',
        notification: sendResult
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------------
    // ACTION 4: DIAGNOSTIC_SEND (Secure Owner-Only End-to-End Relay Test)
    // -------------------------------------------------------------------------
    if (action === 'DIAGNOSTIC_SEND') {
      // 1. Admin authentication already verified:
      //    - Firebase ID token verified via Firebase Admin SDK
      //    - Email verified to be exactly admin@dandy.com
      // 2. Synthetic parameters (testType: ORDER_CONFIRMATION or ORDER_STATUS_CHANGED)
      const testType = body.testType === 'ORDER_STATUS_CHANGED' ? 'ORDER_STATUS_CHANGED' : 'ORDER_CONFIRMATION';
      const canonicalStatus = body.canonicalStatus ? normalizeOrderStatus(body.canonicalStatus) : 'تم الشحن';

      // 3. Send synthetic diagnostic email strictly to FIXED_DIAGNOSTIC_RECIPIENT (dandybeauty4@gmail.com)
      //    Does NOT create/update Firebase orders, decrement stock, trigger Telegram, or invoke Make
      const diagResult = await sendDiagnosticRelayEmail({
        testType,
        canonicalStatus
      });

      return new Response(JSON.stringify({
        success: diagResult.success,
        diagnostic: diagResult.diagnostic
      }), {
        status: diagResult.success ? 200 : 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // -------------------------------------------------------------------------
    // ACTION 5: DIAGNOSTIC_SEND_ALL_STATUSES (Batch Test of All 4 Status Templates)
    // -------------------------------------------------------------------------
    if (action === 'DIAGNOSTIC_SEND_ALL_STATUSES') {
      const statusesToTest = ['قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'ملغي'];
      const results = [];
      let allSuccess = true;

      for (const st of statusesToTest) {
        const diagResult = await sendDiagnosticRelayEmail({
          testType: 'ORDER_STATUS_CHANGED',
          canonicalStatus: st
        });
        if (!diagResult.success) {
          allSuccess = false;
        }
        results.push({
          status: st,
          success: diagResult.success,
          diagnostic: diagResult.diagnostic
        });
      }

      return new Response(JSON.stringify({
        success: allSuccess,
        count: results.length,
        results
      }), {
        status: allSuccess ? 200 : 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'UNKNOWN_ACTION',
      message: `Action '${action}' is not supported`
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[OrderStatus API CRITICAL ERROR]:', err);
    return new Response(JSON.stringify({
      success: false,
      error: 'SERVER_ERROR',
      message: err?.message || 'Internal server error processing order status'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function GET({ request }) {
  const admin = await authenticateAdmin(request);
  if (!admin) {
    return new Response(JSON.stringify({
      success: false,
      error: 'UNAUTHORIZED'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');

  try {
    const app = getAdminApp();
    const db = getDatabase(app);

    if (orderId) {
      // Query notifications related to this order
      const snap = await db.ref('notifications_outbox')
        .orderByChild('orderId')
        .equalTo(orderId)
        .once('value');
      const val = snap.val() || {};
      return new Response(JSON.stringify({
        success: true,
        orderId,
        notifications: Object.values(val)
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Return latest 50 notifications
    const snap = await db.ref('notifications_outbox')
      .limitToLast(50)
      .once('value');
    const val = snap.val() || {};
    return new Response(JSON.stringify({
      success: true,
      notifications: Object.values(val)
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Database query error'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
