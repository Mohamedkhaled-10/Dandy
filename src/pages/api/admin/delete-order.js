export const prerender = false;

// src/pages/api/admin/delete-order.js
// Protected Admin API for safely deleting an order, revoking invoice access,
// cancelling unsent outbox events, and writing idempotency/order tombstones.
import crypto from 'node:crypto';
import { getAdminDb } from '../../../utils/firebase-admin.ts';
import { verifyAdminRequest, adminUnauthorizedResponse } from '../../../utils/admin-auth.js';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

const DEFAULT_DELETE_LEASE_MS = 30_000;
const DEFAULT_COMMITTING_DELETE_LEASE_MS = 45_000;

const SENT_OR_AMBIGUOUS_OUTBOX_STATUSES = new Set([
  'sent',
  'accepted_by_mailapp',
  'unknown',
  'unknown_deleted_during_dispatch'
]);

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      ...extraHeaders
    }
  });
}

function validateOrderId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128 || /[.#$\[\]/]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function isLeaseExpired(
  record,
  nowMs = Date.now(),
  deletingLeaseMs = DEFAULT_DELETE_LEASE_MS,
  committingLeaseMs = DEFAULT_COMMITTING_DELETE_LEASE_MS
) {
  if (!isPlainObject(record)) return false;
  const isCommitting = record.status === 'COMMITTING_DELETE';
  const expStr = isCommitting
    ? record.committingLeaseExpiresAt || record.deleteLeaseExpiresAt || record.leaseExpiresAt
    : record.deleteLeaseExpiresAt || record.leaseExpiresAt;
  if (typeof expStr === 'string' && expStr.trim()) {
    const expMs = Date.parse(expStr);
    if (Number.isFinite(expMs)) {
      return nowMs >= expMs;
    }
  }
  const startStr = isCommitting
    ? record.committingAt || record.updatedAt || record.deletingAt || record.requestedAt
    : record.deletingAt || record.requestedAt || record.updatedAt;
  const fallbackLeaseMs = isCommitting ? committingLeaseMs : deletingLeaseMs;
  if (typeof startStr === 'string' && startStr.trim()) {
    const startMs = Date.parse(startStr);
    if (Number.isFinite(startMs)) {
      return nowMs - startMs >= fallbackLeaseMs;
    }
  }
  return false;
}

function isOutboxAlreadySanitizedForDeletion(rec) {
  if (!isPlainObject(rec)) return false;
  const st = String(rec.status || '');
  const isTerminalDeleted =
    st === 'cancelled_order_deleted' ||
    st === 'unknown_deleted_during_dispatch' ||
    ((st === 'sent' || st === 'accepted_by_mailapp' || st === 'unknown') && Boolean(rec.orderDeletedAt));
  if (!isTerminalDeleted) return false;
  return (
    rec.recipientEmail === undefined &&
    rec.recipientName === undefined &&
    rec.payload === undefined &&
    rec.claimId === undefined
  );
}

export async function POST({ request, _deps = undefined }) {
  // 1. Validate Content-Type: application/json
  const contentType = (request?.headers?.get?.('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_CONTENT_TYPE',
        message: 'نوع المحتوى غير مدعوم. يجب إرسال application/json.'
      },
      415
    );
  }

  // 2. Authenticate Admin (admin@dandy.com + email_verified === true) strictly via Bearer Token
  const authResult = await verifyAdminRequest(request, _deps);
  if (!authResult.authorized) {
    return adminUnauthorizedResponse(authResult);
  }
  const admin = authResult.admin;

  // 3. Parse JSON strictly
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_JSON',
        message: 'صيغة JSON المرسلة غير صالحة.'
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

  const orderId = validateOrderId(body.orderId);
  if (!orderId) {
    return jsonResponse(
      {
        success: false,
        error: 'INVALID_ORDER_ID',
        message: 'معرف الطلب غير صالح.'
      },
      400
    );
  }

  // 4. Resolve Firebase Admin DB
  let adminDb = _deps?.adminDb !== undefined ? _deps.adminDb : null;
  if (!adminDb && !_deps?.simulateMissingDb) {
    try {
      adminDb = getAdminDb();
    } catch {
      adminDb = null;
    }
  }

  if (!adminDb || typeof adminDb.ref !== 'function') {
    return jsonResponse(
      {
        success: false,
        error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
        message: 'قاعدة البيانات غير متاحة مؤقتاً.'
      },
      503
    );
  }

  const resolveNowMs = (explicitMs = undefined) => {
    if (typeof explicitMs === 'number' && Number.isFinite(explicitMs)) {
      return explicitMs;
    }
    if (typeof _deps?.getNowMs === 'function') {
      const dynamicMs = _deps.getNowMs();
      if (typeof dynamicMs === 'number' && Number.isFinite(dynamicMs)) {
        return dynamicMs;
      }
    }
    if (typeof _deps?.nowMs === 'number' && Number.isFinite(_deps.nowMs)) {
      return _deps.nowMs;
    }
    return Date.now();
  };

  const nowMs = resolveNowMs();
  const deleteLeaseMs =
    typeof _deps?.deleteLeaseMs === 'number' && _deps.deleteLeaseMs > 0
      ? _deps.deleteLeaseMs
      : DEFAULT_DELETE_LEASE_MS;
  const commitDeleteLeaseMs =
    typeof _deps?.commitDeleteLeaseMs === 'number' && _deps.commitDeleteLeaseMs > 0
      ? _deps.commitDeleteLeaseMs
      : typeof _deps?.committingDeleteLeaseMs === 'number' && _deps.committingDeleteLeaseMs > 0
        ? _deps.committingDeleteLeaseMs
        : DEFAULT_COMMITTING_DELETE_LEASE_MS;
  const nowIso = new Date(nowMs).toISOString();
  const deleteLeaseExpiresAt = new Date(nowMs + deleteLeaseMs).toISOString();
  const deleteAttemptId = crypto.randomUUID();
  const deletedOrderRef = adminDb.ref(`privateDeletedOrders/${orderId}`);

  // Track rollback handles if multi-path cleanup fails before committing
  let acquiredTombstoneLock = false;
  const fencedIdemRecords = [];

  const rollbackLocksSafely = async () => {
    for (const item of fencedIdemRecords) {
      try {
        await adminDb.ref(`privateOrderIdempotency/${item.requestKeyHash}`).transaction((cur) => {
          if (!isPlainObject(cur)) return undefined;
          if (cur.status !== 'DELETING' || cur.deleteAttemptId !== deleteAttemptId) {
            return undefined;
          }
          return item.previousRecord;
        });
      } catch (rbErr) {
        console.warn('[DeleteOrder] Failed rolling back idempotency fencing state:', rbErr?.code || 'rollback_err');
      }
    }

    if (acquiredTombstoneLock) {
      try {
        await deletedOrderRef.transaction((cur) => {
          if (!isPlainObject(cur)) return undefined;
          if (
            (cur.status !== 'DELETING' && cur.status !== 'COMMITTING_DELETE') ||
            cur.deleteAttemptId !== deleteAttemptId
          ) {
            return undefined;
          }
          return null;
        });
      } catch (rbErr) {
        console.warn('[DeleteOrder] Failed rolling back deletion tombstone lock:', rbErr?.code || 'rollback_err');
      }
    }
  };

  try {
    // 5. Step A — Single-path atomic CAS decision & lease recovery on privateDeletedOrders/{orderId}
    let tombstoneBlockReason = null;
    let isRecoveryAttempt = false;
    let recoveredFromAttemptId = null;

    const tombstoneTx = await deletedOrderRef.transaction((current) => {
      tombstoneBlockReason = null;
      isRecoveryAttempt = false;
      recoveredFromAttemptId = null;

      if (isPlainObject(current)) {
        if (current.status === 'DELETED') {
          tombstoneBlockReason = 'ALREADY_DELETED';
          return undefined;
        }
        if (current.status === 'DELETING' || current.status === 'COMMITTING_DELETE') {
          if (isLeaseExpired(current, nowMs, deleteLeaseMs, commitDeleteLeaseMs)) {
            isRecoveryAttempt = true;
            recoveredFromAttemptId =
              typeof current.deleteAttemptId === 'string' ? current.deleteAttemptId : null;
            return {
              orderId,
              status: 'DELETING',
              deleteAttemptId,
              previousAttemptId: recoveredFromAttemptId,
              recoveredFromStatus: current.status,
              requestedAt: current.requestedAt || nowIso,
              recoveryAt: nowIso,
              deleteLeaseExpiresAt,
              requestedBy: admin.email
            };
          }
          tombstoneBlockReason = 'DELETE_IN_PROGRESS';
          return undefined;
        }
      }

      return {
        orderId,
        status: 'DELETING',
        deleteAttemptId,
        requestedAt: nowIso,
        deleteLeaseExpiresAt,
        requestedBy: admin.email
      };
    });

    const tombstoneVal = tombstoneTx?.snapshot?.val?.();
    if (
      !tombstoneTx?.committed ||
      !isPlainObject(tombstoneVal) ||
      tombstoneVal.status !== 'DELETING' ||
      tombstoneVal.deleteAttemptId !== deleteAttemptId
    ) {
      if (tombstoneBlockReason === 'ALREADY_DELETED') {
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_NOT_FOUND',
            message: 'هذا الطلب غير موجود أو تم حذفه مسبقاً.'
          },
          404
        );
      }
      return jsonResponse(
        {
          success: false,
          error: 'DELETE_IN_PROGRESS',
          message: 'عملية حذف هذا الطلب جارية بالفعل. يرجى الانتظار.'
        },
        409
      );
    }
    acquiredTombstoneLock = true;

    if (typeof _deps?.afterTombstoneLock === 'function') {
      await _deps.afterTombstoneLock({ orderId, deleteAttemptId, isRecoveryAttempt, adminDb });
    }

    // 6. Step B — Inspect actual DB state BEFORE assuming whether prior attempt succeeded or failed
    const [orderSnap, orderAccessSnap, idemQuerySnap, outboxQuerySnap, invQuerySnap] = await Promise.all([
      adminDb.ref(`orders/${orderId}`).once('value'),
      adminDb.ref(`privateOrderAccess/${orderId}`).once('value'),
      adminDb.ref('privateOrderIdempotency').orderByChild('reservedOrderId').equalTo(orderId).once('value'),
      adminDb.ref('notifications_outbox').orderByChild('orderId').equalTo(orderId).once('value'),
      adminDb.ref('privateInvoiceAccess').orderByChild('orderId').equalTo(orderId).once('value')
    ]);

    const existingOrder = orderSnap.val();
    const existingOrderAccess = orderAccessSnap.val();
    const idemMatches = isPlainObject(idemQuerySnap.val()) ? idemQuerySnap.val() : {};
    const outboxMatches = isPlainObject(outboxQuerySnap.val()) ? outboxQuerySnap.val() : {};
    const invQueryMatches = isPlainObject(invQuerySnap.val()) ? invQuerySnap.val() : {};

    const idemKeys = Object.keys(idemMatches);
    const invKeys = Object.keys(invQueryMatches);
    const outboxEntries = Object.entries(outboxMatches);

    // Check if an expired tombstone was left behind even though full cleanup already completed
    const orderAlreadyAbsent = !isPlainObject(existingOrder);
    const orderAccessAlreadyRevoked =
      !isPlainObject(existingOrderAccess) ||
      (existingOrderAccess.status === 'revoked' &&
        existingOrderAccess.encryptedToken === undefined &&
        existingOrderAccess.token === undefined);
    const invoicesAlreadyRevoked = invKeys.every(
      (k) => isPlainObject(invQueryMatches[k]) && invQueryMatches[k].status === 'revoked'
    );
    const idemAlreadyDeleted =
      idemKeys.length === 0 ||
      idemKeys.every((k) => isPlainObject(idemMatches[k]) && idemMatches[k].status === 'DELETED');
    const outboxAlreadyCleaned = outboxEntries.every(([, rec]) => isOutboxAlreadySanitizedForDeletion(rec));

    if (
      orderAlreadyAbsent &&
      orderAccessAlreadyRevoked &&
      invoicesAlreadyRevoked &&
      idemAlreadyDeleted &&
      outboxAlreadyCleaned
    ) {
      const hasAnyCleanedArtifact =
        isPlainObject(existingOrderAccess) ||
        invKeys.length > 0 ||
        idemKeys.length > 0 ||
        outboxEntries.length > 0;

      if (isRecoveryAttempt && hasAnyCleanedArtifact) {
        // Prior attempt actually finished dependent cleanup before tombstone finalized:
        // finalize privateDeletedOrders to DELETED without altering DELETED idempotency or cleaned outbox, then return 404.
        await deletedOrderRef.transaction((cur) => {
          if (!isPlainObject(cur)) return undefined;
          if (cur.status === 'DELETED') return undefined;
          if (cur.deleteAttemptId !== deleteAttemptId) return undefined;
          return {
            orderId,
            status: 'DELETED',
            deletedAt: nowIso,
            deletedBy: admin.email
          };
        });
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_NOT_FOUND',
            message: 'الطلب غير موجود أو تم حذفه مسبقاً.'
          },
          404
        );
      }

      // Otherwise nothing existed (or orphaned lock on missing order): release lock cleanly and return 404
      await rollbackLocksSafely();
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: 'الطلب غير موجود أو تم حذفه مسبقاً.'
        },
        404
      );
    }

    // 7. Fence each non-DELETED idempotency record atomically (recovering expired DELETING leases safely)
    const alreadyDeletedIdemKeys = new Set();
    for (const reqKeyHash of idemKeys) {
      let fenceRejectReason = null;
      let prevSnapshot = null;

      const idemTx = await adminDb.ref(`privateOrderIdempotency/${reqKeyHash}`).transaction((current) => {
        fenceRejectReason = null;
        prevSnapshot = null;
        if (!isPlainObject(current)) return undefined;
        if (current.reservedOrderId !== orderId) return undefined;

        if (current.status === 'PENDING' || current.status === 'COMMITTING') {
          fenceRejectReason = 'ORDER_IN_FLIGHT_OR_COMMITTING';
          return undefined;
        }
        if (current.status === 'DELETED') {
          return current;
        }
        if (current.status === 'DELETING') {
          const canTakeOverDeleting =
            isLeaseExpired(current, nowMs, deleteLeaseMs, commitDeleteLeaseMs) ||
            (isRecoveryAttempt &&
              recoveredFromAttemptId &&
              current.deleteAttemptId === recoveredFromAttemptId);
          if (!canTakeOverDeleting) {
            fenceRejectReason = 'DELETE_IN_PROGRESS';
            return undefined;
          }
        }

        prevSnapshot = JSON.parse(JSON.stringify(current));
        const {
          commitPayload: _stripPayload,
          commitPayloadSizeBytes: _stripSize,
          ...rest
        } = current;

        return {
          ...rest,
          previousStatus: current.previousStatus || current.status,
          status: 'DELETING',
          deleteAttemptId,
          deleteLeaseExpiresAt,
          deletingAt: current.deletingAt || nowIso,
          updatedAt: nowIso
        };
      });

      if (fenceRejectReason === 'ORDER_IN_FLIGHT_OR_COMMITTING') {
        await rollbackLocksSafely();
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_IN_FLIGHT_OR_COMMITTING',
            message: 'لا يمكن حذف الطلب أثناء وجود عملية إنشاء أو تثبيت نشطة (PENDING/COMMITTING).'
          },
          409
        );
      }

      if (fenceRejectReason === 'DELETE_IN_PROGRESS' || !idemTx?.committed) {
        await rollbackLocksSafely();
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_DELETE_CONFLICT',
            message: 'تعذر حسم قفل الحذف بسبب تحديث متزامن للطلب. يرجى إعادة المحاولة.'
          },
          409
        );
      }

      const postIdemVal = idemTx?.snapshot?.val?.();
      if (isPlainObject(postIdemVal) && postIdemVal.status === 'DELETED') {
        alreadyDeletedIdemKeys.add(reqKeyHash);
      } else if (prevSnapshot) {
        fencedIdemRecords.push({ requestKeyHash: reqKeyHash, previousRecord: prevSnapshot });
      }
    }

    if (typeof _deps?.afterIdempotencyFence === 'function') {
      await _deps.afterIdempotencyFence({ orderId, deleteAttemptId, isRecoveryAttempt, adminDb });
    }

    // Re-read current tombstone/idempotency if test hook pauses before commit, and allow beforeDeleteCommit hook
    if (typeof _deps?.beforeDeleteCommit === 'function') {
      await _deps.beforeDeleteCommit({ orderId, deleteAttemptId, isRecoveryAttempt, adminDb });
    }

    // 8. Fence step: atomically verify & promote tombstone DELETING -> COMMITTING_DELETE
    // Renews deleteLeaseExpiresAt from the transition timestamp so multi-path cleanup gets a fresh commit lease.
    const commitTransitionMs = resolveNowMs(_deps?.commitNowMs);
    const commitTransitionIso = new Date(commitTransitionMs).toISOString();
    const commitLeaseExpiresAt = new Date(commitTransitionMs + commitDeleteLeaseMs).toISOString();

    let commitFenceReason = null;
    const commitFenceTx = await deletedOrderRef.transaction((cur) => {
      commitFenceReason = null;
      if (!isPlainObject(cur)) {
        commitFenceReason = 'LOCK_LOST';
        return undefined;
      }
      if (cur.status === 'DELETED') {
        commitFenceReason = 'ALREADY_DELETED';
        return undefined;
      }
      if (cur.status !== 'DELETING' || cur.deleteAttemptId !== deleteAttemptId) {
        commitFenceReason = 'LEASE_STOLEN';
        return undefined;
      }
      if (isLeaseExpired(cur, commitTransitionMs, deleteLeaseMs, commitDeleteLeaseMs)) {
        commitFenceReason = 'LEASE_EXPIRED';
        return undefined;
      }
      return {
        ...cur,
        status: 'COMMITTING_DELETE',
        committingAt: commitTransitionIso,
        deleteLeaseExpiresAt: commitLeaseExpiresAt,
        committingLeaseExpiresAt: commitLeaseExpiresAt,
        updatedAt: commitTransitionIso
      };
    });

    const commitFenceVal = commitFenceTx?.snapshot?.val?.();
    if (
      !commitFenceTx?.committed ||
      !isPlainObject(commitFenceVal) ||
      commitFenceVal.status !== 'COMMITTING_DELETE' ||
      commitFenceVal.deleteAttemptId !== deleteAttemptId
    ) {
      if (commitFenceReason === 'ALREADY_DELETED') {
        return jsonResponse(
          {
            success: false,
            error: 'ORDER_NOT_FOUND',
            message: 'تم حذف الطلب بالفعل عبر عملية أحدث.'
          },
          404
        );
      }
      await rollbackLocksSafely();
      return jsonResponse(
        {
          success: false,
          error: 'DELETE_LEASE_LOST',
          message: 'انتهت مهلة قفل الحذف وتم الاستحواذ عليه بواسطة محاولة أحدث.'
        },
        409
      );
    }

    // 9. Refresh outbox + dependents snapshot under COMMITTING_DELETE fence
    // so any outbox worker that became `processing` before tombstone fence is accurately classified.
    const [freshOutboxSnap, freshInvSnap, freshIdemSnap] = await Promise.all([
      adminDb.ref('notifications_outbox').orderByChild('orderId').equalTo(orderId).once('value'),
      adminDb.ref('privateInvoiceAccess').orderByChild('orderId').equalTo(orderId).once('value'),
      adminDb.ref('privateOrderIdempotency').orderByChild('reservedOrderId').equalTo(orderId).once('value')
    ]);

    const freshOutboxMatches = isPlainObject(freshOutboxSnap.val()) ? freshOutboxSnap.val() : outboxMatches;
    const freshInvMatches = isPlainObject(freshInvSnap.val()) ? freshInvSnap.val() : invQueryMatches;
    const freshIdemMatches = isPlainObject(freshIdemSnap.val()) ? freshIdemSnap.val() : idemMatches;

    // 10. Build deterministic cleanup & tombstone update set
    const deleteUpdates = {};

    // Remove main order record
    deleteUpdates[`orders/${orderId}`] = null;

    // Revoke privateOrderAccess without retaining any plaintext or encrypted token
    deleteUpdates[`privateOrderAccess/${orderId}`] = {
      orderId,
      status: 'revoked',
      revokedAt: nowIso,
      revokedReason: 'ADMIN_ORDER_DELETED'
    };

    // Collect all invoice access hashes linked to this order and revoke them (never log tokenHash)
    const tokenHashesToRevoke = new Set(Object.keys(freshInvMatches));
    if (
      isPlainObject(existingOrderAccess) &&
      typeof existingOrderAccess.tokenHash === 'string' &&
      existingOrderAccess.tokenHash.trim()
    ) {
      tokenHashesToRevoke.add(existingOrderAccess.tokenHash.trim());
    }

    for (const tHash of tokenHashesToRevoke) {
      deleteUpdates[`privateInvoiceAccess/${tHash}`] = {
        orderId,
        tokenHash: tHash,
        status: 'revoked',
        revokedAt: nowIso,
        revokedReason: 'ADMIN_ORDER_DELETED'
      };
    }

    // Clean/Cancel notifications_outbox records without keeping unnecessary PII
    // CRITICAL: In-flight `processing` MUST become `unknown_deleted_during_dispatch` (NOT cancelled_order_deleted).
    let cancelledOutboxCount = 0;
    let retainedAuditOutboxCount = 0;
    let unknownInFlightOutboxCount = 0;

    for (const [notifId, notifRec] of Object.entries(freshOutboxMatches)) {
      if (!isPlainObject(notifRec)) continue;
      if (isOutboxAlreadySanitizedForDeletion(notifRec)) {
        retainedAuditOutboxCount++;
        continue;
      }

      const st = String(notifRec.status || 'pending');

      if (st === 'processing') {
        unknownInFlightOutboxCount++;
        retainedAuditOutboxCount++;
        deleteUpdates[`notifications_outbox/${notifId}`] = {
          notificationId: notifId,
          orderId,
          channel: typeof notifRec.channel === 'string' ? notifRec.channel : 'unknown',
          eventType: typeof notifRec.eventType === 'string' ? notifRec.eventType : 'UNKNOWN',
          status: 'unknown_deleted_during_dispatch',
          previousStatus: 'processing',
          attempts: Number(notifRec.attempts) || 0,
          createdAt: notifRec.createdAt || nowIso,
          lastAttemptAt: notifRec.lastAttemptAt || nowIso,
          orderDeletedAt: nowIso
        };
      } else if (SENT_OR_AMBIGUOUS_OUTBOX_STATUSES.has(st)) {
        // Retain minimal non-PII audit trail for sent / accepted_by_mailapp / unknown dispatches
        retainedAuditOutboxCount++;
        deleteUpdates[`notifications_outbox/${notifId}`] = {
          notificationId: notifId,
          orderId,
          channel: typeof notifRec.channel === 'string' ? notifRec.channel : 'unknown',
          eventType: typeof notifRec.eventType === 'string' ? notifRec.eventType : 'UNKNOWN',
          status: st,
          attempts: Number(notifRec.attempts) || 0,
          createdAt: notifRec.createdAt || nowIso,
          lastAttemptAt: notifRec.lastAttemptAt || nowIso,
          orderDeletedAt: notifRec.orderDeletedAt || nowIso
        };
      } else {
        // Cancel unsent/pending/failed/skipped notifications and strip PII
        cancelledOutboxCount++;
        deleteUpdates[`notifications_outbox/${notifId}`] = {
          notificationId: notifId,
          orderId,
          channel: typeof notifRec.channel === 'string' ? notifRec.channel : 'unknown',
          eventType: typeof notifRec.eventType === 'string' ? notifRec.eventType : 'UNKNOWN',
          status: 'cancelled_order_deleted',
          attempts: Number(notifRec.attempts) || 0,
          createdAt: notifRec.createdAt || nowIso,
          lastAttemptAt: nowIso,
          cancelledAt: nowIso,
          orderDeletedAt: nowIso
        };
      }
    }

    // Finalize privateOrderIdempotency records as DELETED tombstones (preserve fingerprint to block replay)
    for (const reqKeyHash of Object.keys(freshIdemMatches)) {
      const existingIdem = freshIdemMatches[reqKeyHash];
      if (!isPlainObject(existingIdem)) continue;
      if (alreadyDeletedIdemKeys.has(reqKeyHash) || existingIdem.status === 'DELETED') {
        continue;
      }
      deleteUpdates[`privateOrderIdempotency/${reqKeyHash}`] = {
        requestKeyHash: reqKeyHash,
        requestFingerprint: existingIdem?.requestFingerprint || '',
        status: 'DELETED',
        reservedOrderId: orderId,
        attemptId: existingIdem?.attemptId || '',
        createdAt: existingIdem?.createdAt || nowIso,
        updatedAt: nowIso,
        deletedAt: nowIso,
        deletedBy: admin.email,
        expiresAt: existingIdem?.expiresAt || new Date(nowMs + 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Finalize privateDeletedOrders tombstone
    deleteUpdates[`privateDeletedOrders/${orderId}`] = {
      orderId,
      status: 'DELETED',
      deletedAt: nowIso,
      deletedBy: admin.email
    };

    if (typeof _deps?.beforeRootUpdate === 'function') {
      await _deps.beforeRootUpdate({ orderId, deleteAttemptId, deleteUpdates, adminDb });
    }

    // Re-verify single-path tombstone ownership (status === COMMITTING_DELETE && deleteAttemptId === ours
    // and lease still active) immediately before executing the multi-location root update.
    // Note: RTDB root .update() is an atomic multi-path write, not a multi-path CAS.
    const preUpdateCheckNowMs = resolveNowMs(_deps?.preUpdateNowMs ?? _deps?.commitNowMs);
    const preUpdateSnap = await deletedOrderRef.once('value');
    const preUpdateVal = preUpdateSnap?.val?.();
    if (isPlainObject(preUpdateVal) && preUpdateVal.status === 'DELETED') {
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: 'تم حذف الطلب بالفعل عبر عملية أحدث.'
        },
        404
      );
    }
    if (
      !isPlainObject(preUpdateVal) ||
      preUpdateVal.status !== 'COMMITTING_DELETE' ||
      preUpdateVal.deleteAttemptId !== deleteAttemptId ||
      isLeaseExpired(preUpdateVal, preUpdateCheckNowMs, deleteLeaseMs, commitDeleteLeaseMs)
    ) {
      await rollbackLocksSafely();
      return jsonResponse(
        {
          success: false,
          error: 'DELETE_LEASE_LOST',
          message: 'تم فقدان قفل مرحلة التثبيت للحذف قبل التنفيذ النهائي.'
        },
        409
      );
    }

    // 11. Execute multi-path cleanup atomically in RTDB root update; roll back fencing on failure
    await adminDb.ref().update(deleteUpdates);

    return jsonResponse(
      {
        success: true,
        orderId,
        deletedAt: nowIso,
        recoveredFromCrash: isRecoveryAttempt,
        revokedTokensCount: tokenHashesToRevoke.size,
        cancelledOutboxCount,
        retainedAuditOutboxCount,
        unknownInFlightOutboxCount,
        tombstonedIdempotencyCount: idemKeys.length,
        message: 'تم حذف الطلب وإلغاء صلاحية روابط الفاتورة وتأمين السجلات التابعة بنجاح.'
      },
      200
    );
  } catch (err) {
    await rollbackLocksSafely();
    console.error('[DeleteOrder Error]:', err?.code || err?.message || 'delete_order_failed');
    return jsonResponse(
      {
        success: false,
        error: 'ORDER_DELETE_FAILED',
        message: 'تعذر إتمام حذف الطلب بالكامل. لم يتم تطبيق حذف جزئي.'
      },
      500
    );
  }
}

export async function ALL() {
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
