export const prerender = false;

// src/pages/api/order-status.js
// Server-side protected API for single/bulk order status updates and notification retries
import { getAdminApp, getAdminDb } from '../../utils/firebase-admin.ts';
import { verifyAdminRequest, adminUnauthorizedResponse } from '../../utils/admin-auth.js';
import {
  sendOrderNotification,
  normalizeOrderStatus,
  isValidOrderStatusValue,
  hasValidCoreOrderShape,
  CANONICAL_STATUSES,
  isValidEmail,
  sendDiagnosticRelayEmail,
  FIXED_DIAGNOSTIC_RECIPIENT
} from '../../utils/email-service.ts';
import { getOrCreateInvoiceToken } from '../../utils/invoice-token.ts';
import {
  reconcileStaleOutboxNotification,
  sanitizeOutboxRecordForAdmin,
  validateEmailOutboxRecordIdentity
} from '../../utils/notifications-outbox.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

const BLOCKED_OUTBOX_RETRY_STATUSES = new Set([
  'cancelled_order_deleted',
  'unknown_deleted_during_dispatch',
  'unknown',
  'unfinalized',
  'unavailable',
  'skipped_intentionally_disabled'
]);

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function validateOrderKey(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128 || /[.#$\[\]/]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function validateOutboxKey(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 180 || /[.#$\[\]/]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function isTombstoneDeletedState(val) {
  if (!isPlainObject(val)) return false;
  const st = String(val.status || '').toUpperCase();
  return st === 'DELETING' || st === 'COMMITTING_DELETE' || st === 'DELETED';
}

async function checkOrderDeletionState(db, orderId) {
  try {
    const snap = await db.ref(`privateDeletedOrders/${orderId}`).once('value');
    const val = snap?.val?.() ?? null;
    if (isTombstoneDeletedState(val)) {
      return { ok: true, deleted: true, tombstoneStatus: String(val.status || 'DELETED') };
    }
    return { ok: true, deleted: false, tombstoneStatus: null };
  } catch (err) {
    return { ok: false, deleted: false, error: err?.message || 'DB_READ_ERROR' };
  }
}

export async function POST({ request, _deps = undefined }) {
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    return adminUnauthorizedResponse(authResult);
  }
  const admin = authResult.admin;

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

  const { action = 'UPDATE_STATUS' } = body || {};
  const db = _deps?.adminDb || getAdminDb();
  const sendNotifFn = _deps?.sendOrderNotification || sendOrderNotification;
  const resolveTokenFn = _deps?.getOrCreateInvoiceToken || getOrCreateInvoiceToken;

  try {
    // -------------------------------------------------------------------------
    // ACTION 1: UPDATE_STATUS (Single Order)
    // -------------------------------------------------------------------------
    if (action === 'UPDATE_STATUS') {
      const orderId = validateOrderKey(body?.orderId);
      const { newStatus } = body || {};
      if (!orderId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_ORDER_ID',
          message: 'Valid Order ID is required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      if (!isValidOrderStatusValue(newStatus)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_STATUS',
          message: 'حالة الطلب المستهدفة غير صالحة.'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const preDelCheck = await checkOrderDeletionState(db, orderId);
      if (!preDelCheck.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة حذف الطلب في قاعدة البيانات.'
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (preDelCheck.deleted) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف هذا الطلب أو جاري حذفه ولا يمكن تحديث حالته.',
          tombstoneStatus: preDelCheck.tombstoneStatus
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      const normalizedNewStatus = normalizeOrderStatus(newStatus);
      const orderRef = db.ref(`orders/${orderId}`);
      const orderSnap = await orderRef.once('value');
      const orderData = orderSnap.val();

      if (orderData === null || orderData === undefined) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      if (!hasValidCoreOrderShape(orderData)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_ORDER_SHAPE',
          message: `Order ${orderId} has incomplete or invalid core shape`
        }), { status: 422, headers: { 'Content-Type': 'application/json' } });
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

      if (typeof _deps?.beforeStatusTransaction === 'function') {
        await _deps.beforeStatusTransaction({ action: 'UPDATE_STATUS', orderId, db });
      }

      // Fail-closed deletion re-check immediately prior to conditional transaction
      const midDelCheck = await checkOrderDeletionState(db, orderId);
      if (!midDelCheck.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة الطلب قبل التحديث.'
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (midDelCheck.deleted) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف هذا الطلب أو جاري حذفه ولا يمكن إعادة إنشائه أو تحديثه.',
          tombstoneStatus: midDelCheck.tombstoneStatus
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      // Conditional RTDB Transaction: NEVER creates a missing or partial order node
      const nowIso = new Date().toISOString();
      let txAbortReason = null;
      let txPrevStatus = oldStatus;
      let txUpdatedOrder = null;

      const txResult = await orderRef.transaction((current) => {
        txAbortReason = null;
        if (current === null || current === undefined) {
          txAbortReason = 'ORDER_NOT_FOUND';
          return undefined;
        }
        if (!hasValidCoreOrderShape(current)) {
          txAbortReason = 'INVALID_ORDER_SHAPE';
          return undefined;
        }
        txPrevStatus = normalizeOrderStatus(current.status);
        if (txPrevStatus === normalizedNewStatus) {
          txAbortReason = 'UNCHANGED';
          return undefined;
        }
        txUpdatedOrder = {
          ...current,
          status: normalizedNewStatus,
          lastStatusUpdate: nowIso,
          lastUpdatedBy: admin.email
        };
        return txUpdatedOrder;
      });

      if (txAbortReason === 'UNCHANGED') {
        return new Response(JSON.stringify({
          success: true,
          orderId,
          status: normalizedNewStatus,
          message: 'Status unchanged; skipped notification generation',
          changed: false
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (!txResult?.committed || txAbortReason === 'ORDER_NOT_FOUND' || txAbortReason === 'INVALID_ORDER_SHAPE') {
        const postAbortDel = await checkOrderDeletionState(db, orderId);
        if (postAbortDel.ok && postAbortDel.deleted) {
          return new Response(JSON.stringify({
            success: false,
            error: 'ORDER_DELETED',
            message: 'تم حذف الطلب أثناء محاولة تحديث حالته ولم يتم إعادة إنشائه.'
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        if (txAbortReason === 'INVALID_ORDER_SHAPE') {
          return new Response(JSON.stringify({
            success: false,
            error: 'INVALID_ORDER_SHAPE',
            message: `Order ${orderId} has incomplete or invalid core shape`
          }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} no longer exists`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      // Re-check deletion tombstone before sending outbound notification
      let notifResult = null;
      const preNotifDelCheck = await checkOrderDeletionState(db, orderId);
      if (preNotifDelCheck.ok && !preNotifDelCheck.deleted) {
        try {
          notifResult = await sendNotifFn({
            order: txUpdatedOrder || { ...orderData, status: normalizedNewStatus },
            orderId,
            eventType: 'ORDER_STATUS_CHANGED',
            newStatus: normalizedNewStatus,
            oldStatus: txPrevStatus,
            adminDb: db
          });
        } catch (notifErr) {
          console.error(`[OrderStatus API] Notification dispatch error for ${orderId}:`, notifErr);
        }
      } else {
        notifResult = {
          success: false,
          status: 'cancelled_order_deleted',
          notificationId: '',
          message: 'Skipped notification because order deletion or verification issue detected'
        };
      }

      return new Response(JSON.stringify({
        success: true,
        orderId,
        status: normalizedNewStatus,
        previousStatus: txPrevStatus,
        changed: true,
        notification: notifResult
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // -------------------------------------------------------------------------
    // ACTION 2: BULK_UPDATE_STATUS
    // -------------------------------------------------------------------------
    if (action === 'BULK_UPDATE_STATUS') {
      const { orderIds, newStatus } = body || {};
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_ORDER_IDS',
          message: 'Array of order IDs is required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      if (!isValidOrderStatusValue(newStatus)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_STATUS',
          message: 'حالة الطلب المستهدفة غير صالحة.'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const normalizedNewStatus = normalizeOrderStatus(newStatus);
      const results = [];
      let updatedCount = 0;
      let skippedCount = 0;

      for (const rawId of orderIds) {
        const id = validateOrderKey(rawId);
        if (!id) {
          results.push({ orderId: rawId, success: false, error: 'INVALID_ORDER_ID' });
          continue;
        }

        try {
          const preDel = await checkOrderDeletionState(db, id);
          if (!preDel.ok) {
            results.push({ orderId: id, success: false, error: 'DATABASE_VERIFICATION_FAILED' });
            continue;
          }
          if (preDel.deleted) {
            results.push({ orderId: id, success: false, error: 'ORDER_DELETED' });
            continue;
          }

          const oRef = db.ref(`orders/${id}`);
          const oSnap = await oRef.once('value');
          const oData = oSnap.val();

          if (oData === null || oData === undefined) {
            results.push({ orderId: id, success: false, error: 'NOT_FOUND' });
            continue;
          }
          if (!hasValidCoreOrderShape(oData)) {
            results.push({ orderId: id, success: false, error: 'INVALID_ORDER_SHAPE' });
            continue;
          }

          const prevStatus = normalizeOrderStatus(oData.status);
          if (prevStatus === normalizedNewStatus) {
            skippedCount++;
            results.push({ orderId: id, success: true, changed: false, status: normalizedNewStatus });
            continue;
          }

          if (typeof _deps?.beforeStatusTransaction === 'function') {
            await _deps.beforeStatusTransaction({ action: 'BULK_UPDATE_STATUS', orderId: id, db });
          }

          const midDel = await checkOrderDeletionState(db, id);
          if (!midDel.ok) {
            results.push({ orderId: id, success: false, error: 'DATABASE_VERIFICATION_FAILED' });
            continue;
          }
          if (midDel.deleted) {
            results.push({ orderId: id, success: false, error: 'ORDER_DELETED' });
            continue;
          }

          const nowIso = new Date().toISOString();
          let itemAbortReason = null;
          let itemPrevStatus = prevStatus;
          let itemUpdatedOrder = null;

          const itemTx = await oRef.transaction((current) => {
            itemAbortReason = null;
            if (current === null || current === undefined) {
              itemAbortReason = 'NOT_FOUND';
              return undefined;
            }
            if (!hasValidCoreOrderShape(current)) {
              itemAbortReason = 'INVALID_ORDER_SHAPE';
              return undefined;
            }
            itemPrevStatus = normalizeOrderStatus(current.status);
            if (itemPrevStatus === normalizedNewStatus) {
              itemAbortReason = 'UNCHANGED';
              return undefined;
            }
            itemUpdatedOrder = {
              ...current,
              status: normalizedNewStatus,
              lastStatusUpdate: nowIso,
              lastUpdatedBy: admin.email
            };
            return itemUpdatedOrder;
          });

          if (itemAbortReason === 'UNCHANGED') {
            skippedCount++;
            results.push({ orderId: id, success: true, changed: false, status: normalizedNewStatus });
            continue;
          }

          if (!itemTx?.committed || itemAbortReason === 'NOT_FOUND' || itemAbortReason === 'INVALID_ORDER_SHAPE') {
            const postAbortDel = await checkOrderDeletionState(db, id);
            results.push({
              orderId: id,
              success: false,
              error:
                postAbortDel.ok && postAbortDel.deleted
                  ? 'ORDER_DELETED'
                  : itemAbortReason === 'INVALID_ORDER_SHAPE'
                    ? 'INVALID_ORDER_SHAPE'
                    : 'NOT_FOUND'
            });
            continue;
          }

          updatedCount++;

          let notif = null;
          const postDel = await checkOrderDeletionState(db, id);
          if (postDel.ok && !postDel.deleted) {
            notif = await sendNotifFn({
              order: itemUpdatedOrder || { ...oData, status: normalizedNewStatus },
              orderId: id,
              eventType: 'ORDER_STATUS_CHANGED',
              newStatus: normalizedNewStatus,
              oldStatus: itemPrevStatus,
              adminDb: db
            });
          } else {
            notif = {
              success: false,
              status: 'cancelled_order_deleted',
              notificationId: '',
              message: 'Skipped notification because order was deleted'
            };
          }

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
      const notificationId = validateOutboxKey(body?.notificationId);
      const orderId = validateOrderKey(body?.orderId);
      if (!notificationId || !orderId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_PARAMS',
          message: 'Valid notificationId and orderId are required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const delCheck = await checkOrderDeletionState(db, orderId);
      if (!delCheck.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة حذف الطلب في قاعدة البيانات.'
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (delCheck.deleted) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف الطلب المرتبط بهذا الإشعار أو جاري حذفه ولا يمكن إعادة إرساله',
          notificationId
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      // Check existing notification in outbox
      const notifRef = db.ref(`notifications_outbox/${notificationId}`);
      const notifSnap = await notifRef.once('value');
      const notifData = notifSnap.val();

      if (notifData === null || notifData === undefined) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NOTIFICATION_NOT_FOUND',
          message: `Outbox notification ${notificationId} not found`
        }), { status: 404, headers: NO_STORE_HEADERS });
      }

      if (!isPlainObject(notifData)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_NOTIFICATION_IDENTITY',
          message: 'سجل الإشعار غير صالح أو غير متطابق مع التنسيق المطلوب.',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      if (
        notifData.orderId !== orderId ||
        (notifData.notificationId !== undefined &&
          notifData.notificationId !== null &&
          notifData.notificationId !== '' &&
          (typeof notifData.notificationId !== 'string' ||
            notifData.notificationId.trim() !== notificationId))
      ) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_NOTIFICATION_IDENTITY',
          message: 'سجل الإشعار غير متطابق مع معرف الطلب أو معرف الإشعار المطلوب.',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      if (
        notifData.status === 'cancelled_order_deleted' ||
        notifData.status === 'unknown_deleted_during_dispatch'
      ) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          status: notifData.status,
          message: 'تم حذف الطلب المرتبط بهذا الإشعار ولا يمكن إعادة إرساله',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      const idValidation = validateEmailOutboxRecordIdentity({
        notificationId,
        orderId,
        record: notifData
      });
      if (!idValidation.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_NOTIFICATION_IDENTITY',
          message: 'سجل الإشعار لا يطابق الهوية الحتمية المعتمدة لقناة البريد الإلكتروني.',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      if (notifData.status === 'unknown' || notifData.status === 'unfinalized' || notifData.status === 'unavailable') {
        return new Response(JSON.stringify({
          success: false,
          error: notifData.status === 'unavailable' ? 'SERVICE_TEMPORARILY_UNAVAILABLE' : 'AMBIGUOUS_NOTIFICATION_STATUS',
          status: notifData.status,
          message: 'حالة الإشعار غير مؤكدة أو لم يكتمل تثبيتها؛ يُمنع إعادة الإرسال لتجنب التكرار',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      if (notifData.status === 'processing') {
        const recRes = await reconcileStaleOutboxNotification({
          adminDb: db,
          notificationId,
          nowMs: _deps?.nowMs,
          getNowMs: _deps?.getNowMs,
          leaseMs: _deps?.leaseMs,
          legacyStaleMs: _deps?.legacyStaleMs
        });
        if (!recRes.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
            message: 'تعذر التحقق من قفل الإشعار الجاري في قاعدة البيانات.'
          }), { status: 503, headers: NO_STORE_HEADERS });
        }
        if (recRes.outcome === 'ORDER_DELETED') {
          return new Response(JSON.stringify({
            success: false,
            error: 'ORDER_DELETED',
            status: recRes.status,
            message: 'تم حذف الطلب المرتبط بهذا الإشعار ولا يمكن إعادة إرساله',
            notificationId
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
        if (recRes.outcome === 'RECONCILED_UNKNOWN' || recRes.status === 'unknown') {
          return new Response(JSON.stringify({
            success: false,
            error: 'AMBIGUOUS_NOTIFICATION_STATUS',
            status: 'unknown',
            message: 'انتهت مهلة إرسال الإشعار دون نتيجة مؤكدة وتم تصنيفه كـ unknown؛ يُمنع إعادة الإرسال لتجنب التكرار',
            notificationId
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
        if (recRes.outcome === 'IN_FLIGHT' || recRes.outcome === 'MANUAL_REVIEW_REQUIRED' || recRes.status === 'processing') {
          return new Response(JSON.stringify({
            success: false,
            error: recRes.outcome === 'MANUAL_REVIEW_REQUIRED' ? 'MANUAL_REVIEW_REQUIRED' : 'NOTIFICATION_IN_FLIGHT',
            status: 'processing',
            message:
              recRes.outcome === 'MANUAL_REVIEW_REQUIRED'
                ? 'سجل الإشعار قيد المعالجة ويفتقد توقيتاً صالحاً؛ يتطلب مراجعة يدوية'
                : 'الإشعار قيد الإرسال حالياً عبر عملية أخرى؛ يرجى الانتظار',
            notificationId
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
      }

      if (
        notifData.status === 'skipped_no_valid_email' ||
        notifData.status === 'skipped_not_configured' ||
        notifData.status === 'skipped_intentionally_disabled'
      ) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NOTIFICATION_SKIPPED',
          status: notifData.status,
          message: 'هذا الإشعار متجاوز (بدون بريد صالح أو غير مهيأ) ولا يمكن إعادة إرساله',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      // If already accepted by mailapp or sent, reject duplicate send
      if (notifData.status === 'accepted_by_mailapp' || notifData.status === 'sent') {
        return new Response(JSON.stringify({
          success: true,
          status: notifData.status,
          deduplicated: true,
          message: 'Notification was already accepted/sent; duplicate send blocked',
          notificationId
        }), { status: 200, headers: NO_STORE_HEADERS });
      }

      // Fetch fresh order details
      const orderSnap = await db.ref(`orders/${orderId}`).once('value');
      const orderData = orderSnap.val();
      if (orderData === null || orderData === undefined) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found for retry`
        }), { status: 404, headers: NO_STORE_HEADERS });
      }
      if (!hasValidCoreOrderShape(orderData)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_ORDER_SHAPE',
          message: `Order ${orderId} has incomplete or invalid core shape`
        }), { status: 422, headers: NO_STORE_HEADERS });
      }

      // Fetch or generate secure private invoice access token
      const invoiceAccessToken = await resolveTokenFn(orderId, db);

      // Re-verify deletion state after async token lookup
      const preSendDel = await checkOrderDeletionState(db, orderId);
      if (!preSendDel.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة الطلب قبل إعادة الإرسال'
        }), { status: 503, headers: NO_STORE_HEADERS });
      }
      if (preSendDel.deleted) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف الطلب ولا يمكن إعادة إرسال الإشعار',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      // Retry send using the SAME notification ID (enforces Apps Script idempotency)
      const SLUG_TO_CANONICAL_STATUS = {
        new: 'جديد',
        processing: 'قيد التجهيز',
        shipped: 'تم الشحن',
        delivered: 'تم التوصيل',
        cancelled: 'ملغي'
      };
      const statusKeyPrefix = `notif_order_${orderId}_status_`;
      const derivedOrderStatus =
        idValidation.eventType === 'ORDER_CONFIRMATION'
          ? 'جديد'
          : notificationId.startsWith(statusKeyPrefix)
            ? SLUG_TO_CANONICAL_STATUS[notificationId.slice(statusKeyPrefix.length)] || orderData.status
            : orderData.status;

      const retryArgs = {
        order: orderData,
        orderId,
        eventType: idValidation.eventType,
        newStatus: notifData.orderStatus || derivedOrderStatus,
        retryNotificationId: notificationId,
        invoiceAccessToken,
        adminDb: db
      };
      if (typeof _deps?.nowMs === 'number') retryArgs.nowMs = _deps.nowMs;
      if (typeof _deps?.getNowMs === 'function') retryArgs.getNowMs = _deps.getNowMs;
      if (typeof _deps?.leaseMs === 'number') retryArgs.leaseMs = _deps.leaseMs;

      const retryResult = await sendNotifFn(retryArgs);

      const finalizationFailed =
        retryResult?.outboxFinalized === false &&
        (retryResult?.persistenceOutcome === 'finalization_failed' ||
          retryResult?.persistenceOutcome === 'ownership_mismatch' ||
          retryResult?.status === 'unfinalized');
      const storeUnavailable =
        retryResult?.status === 'unavailable' ||
        retryResult?.persistenceOutcome === 'claim_unavailable';

      const effectiveSuccess =
        Boolean(retryResult?.success) && retryResult?.outboxFinalized !== false;
      const effectiveStatus = finalizationFailed
        ? 'unfinalized'
        : retryResult?.status || 'failed';

      const httpStatus = storeUnavailable
        ? 503
        : finalizationFailed ||
            effectiveStatus === 'cancelled_order_deleted' ||
            effectiveStatus === 'unknown_deleted_during_dispatch' ||
            effectiveStatus === 'unknown' ||
            effectiveStatus === 'processing'
          ? 409
          : 200;

      return new Response(JSON.stringify({
        success: effectiveSuccess,
        notificationId,
        status: effectiveStatus,
        ...(retryResult?.outboxStatus ? { outboxStatus: retryResult.outboxStatus } : {}),
        ...(retryResult?.providerOutcome ? { providerOutcome: retryResult.providerOutcome } : {}),
        ...(typeof retryResult?.outboxFinalized === 'boolean' ? { outboxFinalized: retryResult.outboxFinalized } : {}),
        ...(retryResult?.persistenceOutcome ? { persistenceOutcome: retryResult.persistenceOutcome } : {}),
        message: retryResult?.message || 'Retry attempted',
        result: {
          ...retryResult,
          success: effectiveSuccess,
          status: effectiveStatus
        }
      }), { status: httpStatus, headers: NO_STORE_HEADERS });
    }

    // -------------------------------------------------------------------------
    // ACTION 3.5: SEND_CURRENT_STATUS_NOTIFICATION (For historical or manual updates)
    // -------------------------------------------------------------------------
    if (action === 'SEND_CURRENT_STATUS_NOTIFICATION') {
      const orderId = validateOrderKey(body?.orderId);
      if (!orderId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_ORDER_ID',
          message: 'Valid Order ID is required'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const delCheck = await checkOrderDeletionState(db, orderId);
      if (!delCheck.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة حذف الطلب في قاعدة البيانات.'
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      if (delCheck.deleted) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف هذا الطلب أو جاري حذفه ولا يمكن إرسال إشعارات له.'
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      const orderRef = db.ref(`orders/${orderId}`);
      const orderSnap = await orderRef.once('value');
      const orderData = orderSnap.val();

      if (orderData === null || orderData === undefined) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} not found`
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      if (!hasValidCoreOrderShape(orderData)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_ORDER_SHAPE',
          message: `Order ${orderId} has incomplete or invalid core shape`
        }), { status: 422, headers: { 'Content-Type': 'application/json' } });
      }

      const rawEmail = orderData.email ?? (isPlainObject(orderData.customer) ? orderData.customer.email : undefined);
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

      // Check existing outbox state to enforce deletion and unknown protections
      const notifRef = db.ref(`notifications_outbox/${notificationId}`);
      const notifSnap = await notifRef.once('value');
      const existingNotif = notifSnap.val();

      if (existingNotif !== null && existingNotif !== undefined) {
        if (
          isPlainObject(existingNotif) &&
          (existingNotif.status === 'cancelled_order_deleted' ||
            existingNotif.status === 'unknown_deleted_during_dispatch') &&
          (existingNotif.orderId === undefined || existingNotif.orderId === orderId)
        ) {
          return new Response(JSON.stringify({
            success: false,
            error: 'ORDER_DELETED',
            status: existingNotif.status,
            notificationId,
            message: 'تم حذف الطلب المرتبط بهذا الإشعار ولا يمكن إرساله'
          }), { status: 409, headers: NO_STORE_HEADERS });
        }

        const existingIdValidation = validateEmailOutboxRecordIdentity({
          notificationId,
          orderId,
          record: existingNotif,
          expectedEventType: eventType
        });
        if (!existingIdValidation.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: 'INVALID_NOTIFICATION_IDENTITY',
            notificationId,
            message: 'سجل الإشعار القائم غير متطابق مع الهوية الحتمية أو قناة البريد الإلكتروني.'
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
      }

      if (existingNotif && BLOCKED_OUTBOX_RETRY_STATUSES.has(existingNotif.status)) {
        const isUnknown =
          existingNotif.status === 'unknown' ||
          existingNotif.status === 'unfinalized' ||
          existingNotif.status === 'unavailable';
        return new Response(JSON.stringify({
          success: false,
          error: isUnknown ? 'AMBIGUOUS_NOTIFICATION_STATUS' : 'ORDER_DELETED',
          status: existingNotif.status,
          notificationId,
          message: isUnknown
            ? 'حالة الإشعار غير مؤكدة؛ يُمنع إعادة الإرسال لتجنب التكرار'
            : 'تم حذف الطلب المرتبط بهذا الإشعار ولا يمكن إرساله'
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      if (existingNotif && existingNotif.status === 'processing') {
        const recRes = await reconcileStaleOutboxNotification({
          adminDb: db,
          notificationId,
          nowMs: _deps?.nowMs,
          getNowMs: _deps?.getNowMs,
          leaseMs: _deps?.leaseMs,
          legacyStaleMs: _deps?.legacyStaleMs
        });
        if (!recRes.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
            message: 'تعذر التحقق من قفل الإشعار الجاري في قاعدة البيانات.'
          }), { status: 503, headers: NO_STORE_HEADERS });
        }
        if (recRes.outcome === 'ORDER_DELETED') {
          return new Response(JSON.stringify({
            success: false,
            error: 'ORDER_DELETED',
            status: recRes.status,
            notificationId,
            message: 'تم حذف الطلب المرتبط بهذا الإشعار ولا يمكن إرساله'
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
        if (recRes.outcome === 'RECONCILED_UNKNOWN' || recRes.status === 'unknown') {
          return new Response(JSON.stringify({
            success: false,
            error: 'AMBIGUOUS_NOTIFICATION_STATUS',
            status: 'unknown',
            notificationId,
            message: 'انتهت مهلة إرسال الإشعار دون نتيجة مؤكدة وتم تصنيفه كـ unknown؛ يُمنع إعادة الإرسال لتجنب التكرار'
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
        if (recRes.outcome === 'IN_FLIGHT' || recRes.outcome === 'MANUAL_REVIEW_REQUIRED' || recRes.status === 'processing') {
          return new Response(JSON.stringify({
            success: false,
            error: recRes.outcome === 'MANUAL_REVIEW_REQUIRED' ? 'MANUAL_REVIEW_REQUIRED' : 'NOTIFICATION_IN_FLIGHT',
            status: 'processing',
            notificationId,
            message: 'الإشعار قيد الإرسال حالياً أو يتطلب مراجعة يدوية؛ يُمنع التكرار'
          }), { status: 409, headers: NO_STORE_HEADERS });
        }
      }

      if (existingNotif && (existingNotif.status === 'accepted_by_mailapp' || existingNotif.status === 'sent')) {
        return new Response(JSON.stringify({
          success: true,
          status: existingNotif.status,
          notificationId,
          deduplicated: true,
          message: 'تم إرسال وقبول إشعار هذه الحالة مسبقاً بنجاح عبر MailApp (تم منع التكرار)',
          notification: sanitizeOutboxRecordForAdmin(existingNotif, notificationId) || existingNotif
        }), { status: 200, headers: NO_STORE_HEADERS });
      }

      // Generate or retrieve secure private invoice access token
      const invoiceAccessToken = await resolveTokenFn(orderId, db);

      // Re-verify deletion state after async token lookup
      const preSendDel = await checkOrderDeletionState(db, orderId);
      if (!preSendDel.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة الطلب قبل الإرسال'
        }), { status: 503, headers: NO_STORE_HEADERS });
      }
      if (preSendDel.deleted) {
        return new Response(JSON.stringify({
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف الطلب ولا يمكن إرسال الإشعار',
          notificationId
        }), { status: 409, headers: NO_STORE_HEADERS });
      }

      // Dispatch notification
      const sendArgs = {
        order: { ...orderData, status: currentCanonicalStatus },
        orderId,
        eventType,
        newStatus: currentCanonicalStatus,
        retryNotificationId: notificationId,
        invoiceAccessToken,
        adminDb: db
      };
      if (typeof _deps?.nowMs === 'number') sendArgs.nowMs = _deps.nowMs;
      if (typeof _deps?.getNowMs === 'function') sendArgs.getNowMs = _deps.getNowMs;
      if (typeof _deps?.leaseMs === 'number') sendArgs.leaseMs = _deps.leaseMs;

      const sendResult = await sendNotifFn(sendArgs);

      const finalizationFailed =
        sendResult?.outboxFinalized === false &&
        (sendResult?.persistenceOutcome === 'finalization_failed' ||
          sendResult?.persistenceOutcome === 'ownership_mismatch' ||
          sendResult?.status === 'unfinalized');
      const storeUnavailable =
        sendResult?.status === 'unavailable' ||
        sendResult?.persistenceOutcome === 'claim_unavailable';

      const effectiveSuccess =
        Boolean(sendResult?.success) && sendResult?.outboxFinalized !== false;
      const effectiveStatus = finalizationFailed
        ? 'unfinalized'
        : sendResult?.status || 'failed';

      const httpStatus = storeUnavailable
        ? 503
        : finalizationFailed ||
            effectiveStatus === 'cancelled_order_deleted' ||
            effectiveStatus === 'unknown_deleted_during_dispatch' ||
            effectiveStatus === 'unknown' ||
            effectiveStatus === 'processing'
          ? 409
          : 200;

      return new Response(JSON.stringify({
        success: effectiveSuccess,
        orderId,
        currentStatus: currentCanonicalStatus,
        notificationId,
        status: effectiveStatus,
        ...(sendResult?.outboxStatus ? { outboxStatus: sendResult.outboxStatus } : {}),
        ...(sendResult?.providerOutcome ? { providerOutcome: sendResult.providerOutcome } : {}),
        ...(typeof sendResult?.outboxFinalized === 'boolean' ? { outboxFinalized: sendResult.outboxFinalized } : {}),
        ...(sendResult?.persistenceOutcome ? { persistenceOutcome: sendResult.persistenceOutcome } : {}),
        message: sendResult?.message || 'تم إرسال إشعار الحالة الحالية للعميل بنجاح',
        notification: {
          ...sendResult,
          success: effectiveSuccess,
          status: effectiveStatus
        }
      }), { status: httpStatus, headers: NO_STORE_HEADERS });
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

export async function GET({ request, _deps = undefined }) {
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    return adminUnauthorizedResponse(authResult);
  }

  const url = new URL(request.url);
  const rawOrderId = url.searchParams.get('orderId');

  try {
    const db = _deps?.adminDb || getAdminDb();

    if (rawOrderId !== null) {
      const orderId = validateOrderKey(rawOrderId);
      if (!orderId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_ORDER_ID',
          message: 'معرف الطلب غير صالح.'
        }), { status: 400, headers: NO_STORE_HEADERS });
      }

      // Bounded indexed query for notifications related to this order
      let query = db.ref('notifications_outbox')
        .orderByChild('orderId')
        .equalTo(orderId);
      if (typeof query.limitToFirst === 'function') {
        query = query.limitToFirst(20);
      }
      const snap = await query.once('value');
      const val = snap.val() || {};
      const notifications = Object.entries(val)
        .slice(0, 20)
        .map(([recordKey, rec]) => sanitizeOutboxRecordForAdmin(rec, recordKey))
        .filter((item) => Boolean(item) && item.orderId === orderId);

      return new Response(JSON.stringify({
        success: true,
        orderId,
        notifications
      }), { status: 200, headers: NO_STORE_HEADERS });
    }

    // Return latest 50 notifications (sanitized)
    let latestQuery = db.ref('notifications_outbox');
    if (typeof latestQuery.limitToLast === 'function') {
      latestQuery = latestQuery.limitToLast(50);
    }
    const snap = await latestQuery.once('value');
    const val = snap.val() || {};
    const notifications = Object.entries(val)
      .slice(-50)
      .map(([recordKey, rec]) => sanitizeOutboxRecordForAdmin(rec, recordKey))
      .filter(Boolean);

    return new Response(JSON.stringify({
      success: true,
      notifications
    }), { status: 200, headers: NO_STORE_HEADERS });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'DATABASE_QUERY_ERROR',
      message: 'تعذر جلب سجلات الإشعارات حالياً.'
    }), { status: 500, headers: NO_STORE_HEADERS });
  }
}
