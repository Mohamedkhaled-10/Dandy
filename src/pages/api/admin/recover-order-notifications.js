export const prerender = false;

// src/pages/api/admin/recover-order-notifications.js
// Protected Admin API for safely recovering pending outbox notifications and
// reconciling stale processing records for a single order without duplicating completed/ambiguous sends.
import { getAdminDb } from '../../../utils/firebase-admin.ts';
import { verifyAdminRequest, adminUnauthorizedResponse } from '../../../utils/admin-auth.js';
import {
  sendOrderNotification,
  hasValidCoreOrderShape
} from '../../../utils/email-service.ts';
import { getOrCreateInvoiceToken } from '../../../utils/invoice-token.ts';
import {
  reconcileStaleOutboxNotification,
  dispatchTelegramOutboxNotification,
  sanitizeOutboxRecordForAdmin,
  validateOutboxRecordForRecovery,
  isValidFirebaseOutboxKey
} from '../../../utils/notifications-outbox.ts';

const MAX_OUTBOX_RECOVERY_RECORDS = 20;

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

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
  } catch {
    return { ok: false, deleted: false, tombstoneStatus: null };
  }
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

  // 3. Parse & validate JSON object
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

  // 4. Resolve Firebase Admin DB (fail-closed)
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

  const resolveNowMs = () => {
    if (typeof _deps?.getNowMs === 'function') {
      const dynamicMs = _deps.getNowMs();
      if (typeof dynamicMs === 'number' && Number.isFinite(dynamicMs)) {
        return dynamicMs;
      }
    }
    if (typeof _deps?.nowMs === 'number' && Number.isFinite(_deps.nowMs)) {
      return _deps.nowMs;
    }
    return undefined;
  };

  try {
    // 5. Check privateDeletedOrders/{orderId} (fail-closed on DB errors)
    const preDelCheck = await checkOrderDeletionState(adminDb, orderId);
    if (!preDelCheck.ok) {
      return jsonResponse(
        {
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر التحقق من حالة حذف الطلب في قاعدة البيانات.'
        },
        503
      );
    }
    if (preDelCheck.deleted) {
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_DELETED',
          message: 'تم حذف هذا الطلب أو جاري حذفه ولا يمكن استئناف إشعاراته.'
        },
        409
      );
    }

    // 6. Fetch orders/{orderId} and enforce core order shape
    let orderData;
    try {
      const orderSnap = await adminDb.ref(`orders/${orderId}`).once('value');
      orderData = orderSnap?.val?.() ?? null;
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر قراءة بيانات الطلب من قاعدة البيانات.'
        },
        503
      );
    }

    if (!orderData) {
      return jsonResponse(
        {
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: 'الطلب غير موجود.'
        },
        404
      );
    }

    if (!hasValidCoreOrderShape(orderData)) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_ORDER_SHAPE',
          message: 'بيانات الطلب الأساسية غير مكتملة أو غير صالحة.'
        },
        422
      );
    }

    // 7. Bounded indexed query for notifications_outbox belonging to orderId
    let rawOutboxVal;
    try {
      let query = adminDb.ref('notifications_outbox').orderByChild('orderId').equalTo(orderId);
      if (typeof query.limitToFirst === 'function') {
        query = query.limitToFirst(MAX_OUTBOX_RECOVERY_RECORDS);
      }
      const outboxSnap = await query.once('value');
      rawOutboxVal = outboxSnap?.val?.() ?? null;
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'SERVICE_TEMPORARILY_UNAVAILABLE',
          message: 'تعذر قراءة سجل الإشعارات من قاعدة البيانات.'
        },
        503
      );
    }

    const entries = isPlainObject(rawOutboxVal)
      ? Object.entries(rawOutboxVal).slice(0, MAX_OUTBOX_RECOVERY_RECORDS)
      : [];

    const summary = {
      processed: 0,
      alreadyCompleted: 0,
      inFlight: 0,
      reconciledUnknown: 0,
      failed: 0,
      skipped: 0
    };

    const sendNotifFn = _deps?.sendOrderNotification || sendOrderNotification;
    const resolveTokenFn = _deps?.getOrCreateInvoiceToken || getOrCreateInvoiceToken;
    const dispatchTgFn = _deps?.dispatchTelegramOutboxNotification || dispatchTelegramOutboxNotification;

    const settledResults = await Promise.allSettled(
      entries.map(async ([recordKey, rawRec]) => {
        const validation = validateOutboxRecordForRecovery(recordKey, rawRec, orderId);
        if (!validation.ok) {
          return {
            bucket: 'skipped',
            notificationId: validation.canonicalNotificationId,
            channel: validation.channel,
            status: 'unknown',
            error: 'INVALID_NOTIFICATION_IDENTITY',
            manualReviewRequired: true,
            providerOutcome: 'not_attempted',
            outboxFinalized: false,
            persistenceOutcome: 'identity_mismatch'
          };
        }

        const { canonicalNotificationId: notificationId, channel, status, record: validRec } = validation;

        // Owner business decision: Make.com is intentionally disabled and replaced by alternative email service.
        // Never initiate Make requests or mutate historical Make DB records during recovery.
        if (channel === 'make') {
          if (status === 'processing') {
            const recRes = await reconcileStaleOutboxNotification({
              adminDb,
              notificationId,
              nowMs: resolveNowMs(),
              getNowMs: _deps?.getNowMs,
              leaseMs: _deps?.leaseMs,
              legacyStaleMs: _deps?.legacyStaleMs
            });

            if (!recRes.ok) {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unknown',
                manualReviewRequired: true,
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'claim_unavailable'
              };
            }
            if (recRes.outcome === 'RECONCILED_UNKNOWN') {
              return {
                bucket: 'reconciledUnknown',
                notificationId,
                channel,
                status: 'unknown',
                providerOutcome: 'ambiguous',
                outboxFinalized: true,
                persistenceOutcome: 'committed'
              };
            }
            if (recRes.outcome === 'MANUAL_REVIEW_REQUIRED') {
              return {
                bucket: 'inFlight',
                notificationId,
                channel,
                status: recRes.status || 'processing',
                manualReviewRequired: true,
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'claim_blocked'
              };
            }
            if (recRes.outcome === 'IN_FLIGHT') {
              return {
                bucket: 'inFlight',
                notificationId,
                channel,
                status: 'processing',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'claim_blocked'
              };
            }
            if (recRes.outcome === 'ORDER_DELETED') {
              return {
                bucket: 'skipped',
                notificationId,
                channel,
                status: recRes.status || 'cancelled_order_deleted',
                providerOutcome: 'skipped',
                outboxFinalized: false,
                persistenceOutcome: 'order_deleted'
              };
            }
          }

          return {
            bucket: 'skipped',
            notificationId,
            channel: 'make',
            status: 'skipped_intentionally_disabled',
            providerOutcome: 'skipped',
            outboxFinalized: false,
            persistenceOutcome: 'intentionally_disabled'
          };
        }

        if (status === 'accepted_by_mailapp' || status === 'sent') {
          return {
            bucket: 'alreadyCompleted',
            notificationId,
            channel,
            status,
            providerOutcome: 'accepted',
            outboxFinalized: true,
            persistenceOutcome: 'committed'
          };
        }

        if (
          status === 'cancelled_order_deleted' ||
          status === 'unknown_deleted_during_dispatch'
        ) {
          return {
            bucket: 'skipped',
            notificationId,
            channel,
            status,
            providerOutcome: 'skipped',
            outboxFinalized: false,
            persistenceOutcome: 'order_deleted'
          };
        }

        if (
          status === 'skipped_no_valid_email' ||
          status === 'skipped_not_configured' ||
          status === 'skipped_intentionally_disabled'
        ) {
          return {
            bucket: 'skipped',
            notificationId,
            channel,
            status,
            providerOutcome: 'skipped',
            outboxFinalized: status !== 'skipped_intentionally_disabled',
            persistenceOutcome:
              status === 'skipped_intentionally_disabled' ? 'intentionally_disabled' : 'committed'
          };
        }

        if (status === 'unknown') {
          return {
            bucket: 'skipped',
            notificationId,
            channel,
            status,
            providerOutcome: 'ambiguous',
            outboxFinalized: true,
            persistenceOutcome: 'committed'
          };
        }

        if (status === 'failed') {
          // Manual retry only — never auto-dispatch failed records during recovery
          return {
            bucket: 'failed',
            notificationId,
            channel,
            status,
            providerOutcome: 'rejected',
            outboxFinalized: true,
            persistenceOutcome: 'committed'
          };
        }

        if (status === 'unfinalized' || status === 'unavailable') {
          return {
            bucket: 'failed',
            notificationId,
            channel,
            status,
            manualReviewRequired: true,
            providerOutcome: status === 'unavailable' ? 'not_attempted' : 'unknown',
            outboxFinalized: false,
            persistenceOutcome: status === 'unavailable' ? 'claim_unavailable' : 'finalization_failed'
          };
        }

        if (status === 'processing') {
          const recRes = await reconcileStaleOutboxNotification({
            adminDb,
            notificationId,
            nowMs: resolveNowMs(),
            getNowMs: _deps?.getNowMs,
            leaseMs: _deps?.leaseMs,
            legacyStaleMs: _deps?.legacyStaleMs
          });

          if (!recRes.ok) {
            return {
              bucket: 'failed',
              notificationId,
              channel,
              status: 'unknown',
              manualReviewRequired: true,
              providerOutcome: 'not_attempted',
              outboxFinalized: false,
              persistenceOutcome: 'claim_unavailable'
            };
          }
          if (recRes.outcome === 'RECONCILED_UNKNOWN') {
            return {
              bucket: 'reconciledUnknown',
              notificationId,
              channel,
              status: 'unknown',
              providerOutcome: 'ambiguous',
              outboxFinalized: true,
              persistenceOutcome: 'committed'
            };
          }
          if (recRes.outcome === 'MANUAL_REVIEW_REQUIRED') {
            return {
              bucket: 'inFlight',
              notificationId,
              channel,
              status: recRes.status || 'processing',
              manualReviewRequired: true,
              providerOutcome: 'not_attempted',
              outboxFinalized: false,
              persistenceOutcome: 'claim_blocked'
            };
          }
          if (recRes.outcome === 'IN_FLIGHT') {
            return {
              bucket: 'inFlight',
              notificationId,
              channel,
              status: 'processing',
              providerOutcome: 'not_attempted',
              outboxFinalized: false,
              persistenceOutcome: 'claim_blocked'
            };
          }
          if (recRes.outcome === 'ORDER_DELETED') {
            return {
              bucket: 'skipped',
              notificationId,
              channel,
              status: recRes.status || 'cancelled_order_deleted',
              providerOutcome: 'skipped',
              outboxFinalized: false,
              persistenceOutcome: 'order_deleted'
            };
          }
          return {
            bucket: 'skipped',
            notificationId,
            channel,
            status: recRes.status || status,
            providerOutcome: 'not_attempted',
            outboxFinalized: false,
            persistenceOutcome: 'not_attempted'
          };
        }

        if (status === 'pending') {
          // Re-check deletion tombstone right before dispatching this channel
          const preDispatchDel = await checkOrderDeletionState(adminDb, orderId);
          if (!preDispatchDel.ok) {
            return {
              bucket: 'failed',
              notificationId,
              channel,
              status: 'unavailable',
              providerOutcome: 'not_attempted',
              outboxFinalized: false,
              persistenceOutcome: 'claim_unavailable'
            };
          }
          if (preDispatchDel.deleted) {
            return {
              bucket: 'skipped',
              notificationId,
              channel,
              status: 'cancelled_order_deleted',
              providerOutcome: 'skipped',
              outboxFinalized: false,
              persistenceOutcome: 'order_deleted'
            };
          }

          if (channel === 'email') {
            let invoiceAccessToken;
            try {
              invoiceAccessToken = await resolveTokenFn(
                orderId,
                adminDb,
                _deps?.encryptionKey !== undefined ? { encryptionKey: _deps.encryptionKey } : {}
              );
            } catch {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'failed',
                error: 'INVOICE_TOKEN_ERROR',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'not_attempted'
              };
            }

            // Re-verify deletion state after async token lookup
            const postTokenDel = await checkOrderDeletionState(adminDb, orderId);
            if (!postTokenDel.ok) {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unavailable',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'claim_unavailable'
              };
            }
            if (postTokenDel.deleted) {
              return {
                bucket: 'skipped',
                notificationId,
                channel,
                status: 'cancelled_order_deleted',
                providerOutcome: 'skipped',
                outboxFinalized: false,
                persistenceOutcome: 'order_deleted'
              };
            }

            const emailArgs = {
              order: orderData,
              orderId,
              eventType: validRec.eventType || 'ORDER_CONFIRMATION',
              newStatus: validRec.orderStatus || orderData.status,
              retryNotificationId: notificationId,
              allowRetryFailed: false,
              invoiceAccessToken,
              adminDb
            };
            const nowVal = resolveNowMs();
            if (typeof nowVal === 'number') emailArgs.nowMs = nowVal;
            if (typeof _deps?.getNowMs === 'function') emailArgs.getNowMs = _deps.getNowMs;
            if (typeof _deps?.leaseMs === 'number') emailArgs.leaseMs = _deps.leaseMs;

            const emailRes = await sendNotifFn(emailArgs);
            const resStatus = String(emailRes?.status || 'failed');

            if (resStatus === 'accepted_by_mailapp' || resStatus === 'sent') {
              if (emailRes?.deduplicated === true && emailRes?.outboxFinalized !== false) {
                return {
                  bucket: 'alreadyCompleted',
                  notificationId,
                  channel,
                  status: resStatus,
                  providerOutcome: emailRes?.providerOutcome || 'accepted',
                  outboxFinalized: true,
                  persistenceOutcome: 'committed'
                };
              }
              if (emailRes?.outboxFinalized === true) {
                return {
                  bucket: 'processed',
                  notificationId,
                  channel,
                  status: resStatus,
                  providerOutcome: emailRes?.providerOutcome || 'accepted',
                  outboxFinalized: true,
                  persistenceOutcome: 'committed'
                };
              }
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unfinalized',
                outboxStatus: emailRes?.outboxStatus || 'processing',
                providerOutcome: emailRes?.providerOutcome || 'accepted',
                providerStatus: emailRes?.providerStatus || resStatus,
                outboxFinalized: false,
                persistenceOutcome: emailRes?.persistenceOutcome || 'finalization_failed',
                manualReviewRequired: true
              };
            }

            if (
              resStatus === 'unfinalized' ||
              (emailRes?.outboxFinalized === false &&
                (emailRes?.persistenceOutcome === 'finalization_failed' ||
                  emailRes?.persistenceOutcome === 'ownership_mismatch'))
            ) {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unfinalized',
                outboxStatus: emailRes?.outboxStatus || 'processing',
                providerOutcome: emailRes?.providerOutcome || 'unknown',
                providerStatus: emailRes?.providerStatus,
                outboxFinalized: false,
                persistenceOutcome: emailRes?.persistenceOutcome || 'finalization_failed',
                manualReviewRequired: true
              };
            }

            if (resStatus === 'unavailable') {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unavailable',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: emailRes?.persistenceOutcome || 'claim_unavailable'
              };
            }

            if (resStatus === 'processing') {
              return {
                bucket: 'inFlight',
                notificationId,
                channel,
                status: 'processing',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'claim_blocked'
              };
            }
            if (resStatus === 'unknown') {
              return {
                bucket: 'reconciledUnknown',
                notificationId,
                channel,
                status: 'unknown',
                providerOutcome: emailRes?.providerOutcome || 'timeout',
                outboxFinalized: emailRes?.outboxFinalized === true,
                persistenceOutcome: emailRes?.persistenceOutcome || 'committed'
              };
            }
            if (
              resStatus === 'skipped_no_valid_email' ||
              resStatus === 'skipped_not_configured' ||
              resStatus === 'cancelled_order_deleted' ||
              resStatus === 'unknown_deleted_during_dispatch'
            ) {
              return {
                bucket: 'skipped',
                notificationId,
                channel,
                status: resStatus,
                providerOutcome: 'skipped',
                outboxFinalized: emailRes?.outboxFinalized === true,
                persistenceOutcome:
                  resStatus === 'cancelled_order_deleted' ||
                  resStatus === 'unknown_deleted_during_dispatch'
                    ? 'order_deleted'
                    : 'committed'
              };
            }
            return {
              bucket: 'failed',
              notificationId,
              channel,
              status: resStatus,
              providerOutcome: emailRes?.providerOutcome || 'rejected',
              outboxFinalized: emailRes?.outboxFinalized === true,
              persistenceOutcome: emailRes?.persistenceOutcome || 'committed'
            };
          }

          if (channel === 'telegram') {
            const tgRes = await dispatchTgFn({
              orderId,
              orderData,
              adminDb,
              sendTelegramFn: _deps?.sendTelegramNotification,
              timeoutMs: _deps?.telegramTimeoutMs,
              nowMs: resolveNowMs(),
              getNowMs: _deps?.getNowMs,
              leaseMs: _deps?.leaseMs
            });
            const resStatus = String(tgRes?.status || 'failed');

            if (resStatus === 'sent' || resStatus === 'accepted_by_mailapp') {
              if (!tgRes?.claimed && tgRes?.outboxFinalized !== false) {
                return {
                  bucket: 'alreadyCompleted',
                  notificationId,
                  channel,
                  status: resStatus,
                  providerOutcome: tgRes?.providerOutcome || 'accepted',
                  outboxFinalized: true,
                  persistenceOutcome: 'committed'
                };
              }
              if (tgRes?.outboxFinalized === true) {
                return {
                  bucket: 'processed',
                  notificationId,
                  channel,
                  status: resStatus,
                  providerOutcome: tgRes?.providerOutcome || 'accepted',
                  outboxFinalized: true,
                  persistenceOutcome: 'committed'
                };
              }
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unfinalized',
                outboxStatus: tgRes?.outboxStatus || 'processing',
                providerOutcome: tgRes?.providerOutcome || 'accepted',
                providerStatus: tgRes?.providerStatus || resStatus,
                outboxFinalized: false,
                persistenceOutcome: tgRes?.persistenceOutcome || 'finalization_failed',
                manualReviewRequired: true
              };
            }

            if (
              resStatus === 'unfinalized' ||
              (tgRes?.outboxFinalized === false &&
                (tgRes?.persistenceOutcome === 'finalization_failed' ||
                  tgRes?.persistenceOutcome === 'ownership_mismatch'))
            ) {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unfinalized',
                outboxStatus: tgRes?.outboxStatus || 'processing',
                providerOutcome: tgRes?.providerOutcome || 'unknown',
                providerStatus: tgRes?.providerStatus,
                outboxFinalized: false,
                persistenceOutcome: tgRes?.persistenceOutcome || 'finalization_failed',
                manualReviewRequired: true
              };
            }

            if (resStatus === 'unavailable') {
              return {
                bucket: 'failed',
                notificationId,
                channel,
                status: 'unavailable',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: tgRes?.persistenceOutcome || 'claim_unavailable'
              };
            }

            if (resStatus === 'processing') {
              return {
                bucket: 'inFlight',
                notificationId,
                channel,
                status: 'processing',
                providerOutcome: 'not_attempted',
                outboxFinalized: false,
                persistenceOutcome: 'claim_blocked'
              };
            }
            if (resStatus === 'unknown') {
              return {
                bucket: 'reconciledUnknown',
                notificationId,
                channel,
                status: 'unknown',
                providerOutcome: tgRes?.providerOutcome || 'timeout',
                outboxFinalized: tgRes?.outboxFinalized === true,
                persistenceOutcome: tgRes?.persistenceOutcome || 'committed'
              };
            }
            if (
              resStatus === 'skipped_not_configured' ||
              resStatus === 'skipped_no_valid_email' ||
              resStatus === 'cancelled_order_deleted' ||
              resStatus === 'unknown_deleted_during_dispatch'
            ) {
              return {
                bucket: 'skipped',
                notificationId,
                channel,
                status: resStatus,
                providerOutcome: 'skipped',
                outboxFinalized: tgRes?.outboxFinalized === true,
                persistenceOutcome:
                  resStatus === 'cancelled_order_deleted' ||
                  resStatus === 'unknown_deleted_during_dispatch'
                    ? 'order_deleted'
                    : 'committed'
              };
            }
            return {
              bucket: 'failed',
              notificationId,
              channel,
              status: resStatus,
              providerOutcome: tgRes?.providerOutcome || 'rejected',
              outboxFinalized: tgRes?.outboxFinalized === true,
              persistenceOutcome: tgRes?.persistenceOutcome || 'committed'
            };
          }

          return {
            bucket: 'skipped',
            notificationId,
            channel,
            status,
            providerOutcome: 'not_attempted',
            outboxFinalized: false,
            persistenceOutcome: 'not_attempted'
          };
        }

        return {
          bucket: 'skipped',
          notificationId,
          channel,
          status,
          providerOutcome: 'not_attempted',
          outboxFinalized: false,
          persistenceOutcome: 'not_attempted'
        };
      })
    );

    const fallbackItems = [];
    for (let i = 0; i < settledResults.length; i++) {
      const settled = settledResults[i];
      if (settled.status === 'fulfilled' && settled.value) {
        const item = settled.value;
        if (Object.prototype.hasOwnProperty.call(summary, item.bucket)) {
          summary[item.bucket]++;
        }
        fallbackItems.push({
          notificationId: item.notificationId,
          channel: item.channel,
          status: item.status,
          ...(item.outboxStatus ? { outboxStatus: item.outboxStatus } : {}),
          ...(item.providerOutcome ? { providerOutcome: item.providerOutcome } : {}),
          ...(item.providerStatus ? { providerStatus: item.providerStatus } : {}),
          ...(typeof item.outboxFinalized === 'boolean' ? { outboxFinalized: item.outboxFinalized } : {}),
          ...(item.persistenceOutcome ? { persistenceOutcome: item.persistenceOutcome } : {}),
          ...(item.error ? { error: item.error } : {}),
          ...(item.manualReviewRequired ? { manualReviewRequired: true } : {})
        });
      } else {
        const [recordKey, rawRec] = entries[i] || [];
        summary.failed++;
        fallbackItems.push({
          notificationId: isValidFirebaseOutboxKey(recordKey) ? recordKey : '',
          channel:
            isPlainObject(rawRec) && typeof rawRec.channel === 'string' && (rawRec.channel === 'email' || rawRec.channel === 'telegram' || rawRec.channel === 'make')
              ? rawRec.channel
              : 'unknown',
          status: 'failed',
          outboxFinalized: false,
          persistenceOutcome: 'claim_unavailable'
        });
      }
    }

    // Re-read sanitized notifications snapshot and preserve Make's skipped_intentionally_disabled
    // and any in-request unfinalized/identity outcomes without mutating historical DB records.
    const fallbackByKey = new Map();
    for (let i = 0; i < entries.length; i++) {
      const [recordKey] = entries[i] || [];
      if (fallbackItems[i]) {
        fallbackByKey.set(String(recordKey || ''), fallbackItems[i]);
      }
    }

    let sanitizedNotifications = fallbackItems;
    try {
      let postQuery = adminDb.ref('notifications_outbox').orderByChild('orderId').equalTo(orderId);
      if (typeof postQuery.limitToFirst === 'function') {
        postQuery = postQuery.limitToFirst(MAX_OUTBOX_RECOVERY_RECORDS);
      }
      const postSnap = await postQuery.once('value');
      const postVal = postSnap?.val?.() ?? null;
      if (isPlainObject(postVal)) {
        sanitizedNotifications = Object.entries(postVal)
          .slice(0, MAX_OUTBOX_RECOVERY_RECORDS)
          .map(([postKey, rec]) => {
            const base = sanitizeOutboxRecordForAdmin(rec, postKey);
            const inReq = fallbackByKey.get(postKey);

            if (inReq && inReq.error === 'INVALID_NOTIFICATION_IDENTITY') {
              return {
                ...(base || {}),
                notificationId: inReq.notificationId,
                channel: inReq.channel,
                status: 'unknown',
                error: 'INVALID_NOTIFICATION_IDENTITY',
                manualReviewRequired: true,
                providerOutcome: 'not_attempted',
                persistenceOutcome: 'identity_mismatch',
                outboxFinalized: false
              };
            }

            if (inReq && inReq.channel === 'make' && inReq.status === 'skipped_intentionally_disabled') {
              return {
                ...(base || {}),
                notificationId: inReq.notificationId,
                channel: 'make',
                status: 'skipped_intentionally_disabled',
                providerOutcome: 'skipped',
                persistenceOutcome: 'intentionally_disabled',
                outboxFinalized: false
              };
            }

            if (
              inReq &&
              inReq.outboxFinalized === false &&
              (inReq.status === 'unfinalized' ||
                inReq.status === 'unavailable' ||
                inReq.persistenceOutcome === 'finalization_failed' ||
                inReq.persistenceOutcome === 'ownership_mismatch')
            ) {
              return {
                ...(base || {}),
                notificationId: inReq.notificationId || base?.notificationId || '',
                channel: inReq.channel || base?.channel || 'unknown',
                status: inReq.status,
                outboxStatus: base?.status || inReq.outboxStatus || 'processing',
                providerOutcome: inReq.providerOutcome || 'unknown',
                ...(inReq.providerStatus ? { providerStatus: inReq.providerStatus } : {}),
                persistenceOutcome: inReq.persistenceOutcome || 'finalization_failed',
                outboxFinalized: false,
                manualReviewRequired: true
              };
            }

            return base;
          })
          .filter(Boolean);
      }
    } catch {
      // Keep safe fallbackItems computed from settled operations
    }

    return jsonResponse(
      {
        success: true,
        orderId,
        summary,
        notifications: sanitizedNotifications
      },
      200
    );
  } catch (err) {
    console.error('[RecoverOrderNotifications Error]:', err?.code || 'recover_failed');
    return jsonResponse(
      {
        success: false,
        error: 'NOTIFICATION_RECOVERY_FAILED',
        message: 'تعذر إتمام معالجة الإشعارات المعلقة للطلب.'
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
