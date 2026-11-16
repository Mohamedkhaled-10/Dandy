// src/utils/notifications-outbox.ts
import crypto from 'node:crypto';
import { sendTelegramNotification } from './telegram.js';

function isValidEmailAddress(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export const DEFAULT_OUTBOX_PROCESSING_LEASE_MS = 60_000;
export const DEFAULT_LEGACY_OUTBOX_STALE_MS = 180_000;

export type OutboxNotificationStatus =
  | 'pending'
  | 'processing'
  | 'accepted_by_mailapp'
  | 'sent'
  | 'failed'
  | 'unknown'
  | 'unavailable'
  | 'unfinalized'
  | 'skipped_no_valid_email'
  | 'skipped_not_configured'
  | 'skipped_intentionally_disabled'
  | 'cancelled_order_deleted'
  | 'unknown_deleted_during_dispatch';

export type OutboxProviderOutcome =
  | 'accepted'
  | 'rejected'
  | 'timeout'
  | 'ambiguous'
  | 'skipped'
  | 'not_attempted'
  | 'unknown';

export type OutboxPersistenceOutcome =
  | 'committed'
  | 'finalization_failed'
  | 'claim_unavailable'
  | 'claim_blocked'
  | 'order_deleted'
  | 'ownership_mismatch'
  | 'identity_mismatch'
  | 'intentionally_disabled'
  | 'not_attempted';

export const RECOGNIZED_OUTBOX_CHANNELS = new Set(['email', 'telegram', 'make']);

export const RECOGNIZED_OUTBOX_STATUSES = new Set<string>([
  'pending',
  'processing',
  'accepted_by_mailapp',
  'sent',
  'failed',
  'unknown',
  'unavailable',
  'unfinalized',
  'skipped_no_valid_email',
  'skipped_not_configured',
  'skipped_intentionally_disabled',
  'cancelled_order_deleted',
  'unknown_deleted_during_dispatch'
]);

export const RECOGNIZED_OUTBOX_EVENT_TYPES = new Set([
  'ORDER_CONFIRMATION',
  'ORDER_STATUS_CHANGED',
  'TELEGRAM_ORDER_NOTIFICATION',
  'MAKE_ORDER_WEBHOOK',
  'UNKNOWN'
]);

export const RECOGNIZED_ORDER_STATUSES = new Set([
  'جديد',
  'قيد التجهيز',
  'تم التواصل',
  'تم الشحن',
  'جاري الشحن',
  'تم التوصيل',
  'مكتمل',
  'ملغي'
]);

export const SAFE_OUTBOX_DIAGNOSTIC_CODES = new Set([
  'PROCESSING_LEASE_EXPIRED',
  'LEGACY_PROCESSING_STALE',
  'MISSING_OR_INVALID_PROCESSING_TIMESTAMP',
  'RECONCILE_UNAVAILABLE',
  'RECONCILE_TRANSACTION_FAILED',
  'OUTBOX_FINALIZE_FAILED',
  'OUTBOX_CLAIM_OWNERSHIP_MISMATCH',
  'OUTBOX_STORE_UNAVAILABLE'
]);

export const SAFE_OUTBOX_ERROR_CODES = new Set([
  'NETWORK_TIMEOUT',
  'NETWORK_ERROR',
  'RELAY_CONFIG_MISSING',
  'RELAY_DISABLED',
  'RELAY_DOWN',
  'RELAY_ERROR',
  'TELEGRAM_DISPATCH_FAILED',
  'TELEGRAM_EXCEPTION',
  'TELEGRAM_CONFIG_MISSING',
  'PROCESSING_LEASE_EXPIRED',
  'LEGACY_PROCESSING_STALE',
  'MISSING_OR_INVALID_PROCESSING_TIMESTAMP',
  'RECONCILE_UNAVAILABLE',
  'RECONCILE_TRANSACTION_FAILED',
  'OUTBOX_FINALIZE_FAILED',
  'OUTBOX_STORE_UNAVAILABLE',
  'OUTBOX_CLAIM_NOT_COMMITTED',
  'OUTBOX_CLAIM_OWNERSHIP_MISMATCH',
  'INVALID_NOTIFICATION_IDENTITY',
  'INVOICE_TOKEN_ERROR',
  'ORDER_DELETED',
  'UNSPECIFIED_ERROR'
]);

export const RECOGNIZED_PROVIDER_OUTCOMES = new Set<string>([
  'accepted',
  'rejected',
  'timeout',
  'ambiguous',
  'skipped',
  'not_attempted',
  'unknown'
]);

export const RECOGNIZED_PERSISTENCE_OUTCOMES = new Set<string>([
  'committed',
  'finalization_failed',
  'claim_unavailable',
  'claim_blocked',
  'order_deleted',
  'ownership_mismatch',
  'identity_mismatch',
  'intentionally_disabled',
  'not_attempted'
]);

const EMAIL_STATUS_SLUGS = new Set(['new', 'processing', 'shipped', 'delivered', 'cancelled']);

export interface OutboxClaimResult {
  claimed: boolean;
  claimId?: string;
  reason?:
    | 'ALREADY_SENT'
    | 'IN_FLIGHT'
    | 'AMBIGUOUS_UNKNOWN'
    | 'SKIPPED'
    | 'FAILED_BLOCKED'
    | 'ORDER_DELETED'
    | 'STORE_UNAVAILABLE'
    | 'NOT_COMMITTED'
    | 'OWNERSHIP_MISMATCH'
    | 'IDENTITY_MISMATCH'
    | 'CLAIM_ERROR';
  status: OutboxNotificationStatus | string;
  record?: Record<string, any> | null;
}

export interface OutboxFinalizeResult {
  finalized: boolean;
  status?: string;
  reason?:
    | 'STORE_UNAVAILABLE'
    | 'ORDER_DELETED'
    | 'OWNERSHIP_MISMATCH'
    | 'STATE_CHANGED'
    | 'NOT_FOUND'
    | 'NOT_COMMITTED'
    | 'FINALIZE_TRANSACTION_ERROR';
}

export interface OutboxLeaseInspectionResult {
  state:
    | 'NOT_PROCESSING'
    | 'ACTIVE'
    | 'EXPIRED'
    | 'LEGACY_ACTIVE'
    | 'LEGACY_STALE'
    | 'INVALID_TIMESTAMP';
  expiresAtMs?: number;
  startedAtMs?: number;
}

export interface OutboxReconcileResult {
  ok: boolean;
  outcome:
    | 'NOT_FOUND'
    | 'NOT_PROCESSING'
    | 'IN_FLIGHT'
    | 'RECONCILED_UNKNOWN'
    | 'MANUAL_REVIEW_REQUIRED'
    | 'ORDER_DELETED'
    | 'RECONCILE_ERROR';
  status: OutboxNotificationStatus | string;
  transitioned: boolean;
  manualReviewRequired?: boolean;
  diagnosticCode?: string;
  record?: Record<string, any> | null;
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

export function isValidFirebaseOutboxKey(raw: unknown, maxLen = 180): raw is string {
  if (typeof raw !== 'string') return false;
  if (raw.length === 0 || raw.length > maxLen) return false;
  if (raw.trim() !== raw) return false;
  if (/[.#$\[\]/]/.test(raw)) return false;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return false;
  return true;
}

export function sanitizeOutboxErrorCode(rawError: unknown): string | null {
  if (rawError === undefined || rawError === null) return null;
  if (typeof rawError !== 'string') return 'UNSPECIFIED_ERROR';
  const trimmed = rawError.trim();
  if (!trimmed) return null;
  if (SAFE_OUTBOX_ERROR_CODES.has(trimmed)) return trimmed;
  if (/^HTTP_[1-5]\d{2}$/.test(trimmed)) return trimmed;
  return 'UNSPECIFIED_ERROR';
}

export function sanitizeOutboxIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function isDeterministicOutboxIdForOrder(
  notificationId: string,
  orderId: string,
  channel: string,
  eventType?: unknown
): boolean {
  if (!isValidFirebaseOutboxKey(notificationId) || !isValidFirebaseOutboxKey(orderId, 128)) {
    return false;
  }
  if (!RECOGNIZED_OUTBOX_CHANNELS.has(channel)) {
    return false;
  }
  if (channel === 'telegram') {
    if (notificationId !== getTelegramOutboxId(orderId)) return false;
    if (eventType !== undefined && eventType !== null && eventType !== '') {
      return eventType === 'TELEGRAM_ORDER_NOTIFICATION';
    }
    return true;
  }
  if (channel === 'make') {
    if (notificationId !== getMakeOutboxId(orderId)) return false;
    if (eventType !== undefined && eventType !== null && eventType !== '') {
      return eventType === 'MAKE_ORDER_WEBHOOK';
    }
    return true;
  }
  // channel === 'email'
  const confirmationId = getConfirmationOutboxId(orderId);
  if (notificationId === confirmationId) {
    if (eventType !== undefined && eventType !== null && eventType !== '') {
      return eventType === 'ORDER_CONFIRMATION';
    }
    return true;
  }
  const statusPrefix = `notif_order_${orderId}_status_`;
  if (notificationId.startsWith(statusPrefix)) {
    const slug = notificationId.slice(statusPrefix.length);
    if (!EMAIL_STATUS_SLUGS.has(slug)) return false;
    if (eventType !== undefined && eventType !== null && eventType !== '') {
      return eventType === 'ORDER_STATUS_CHANGED';
    }
    return true;
  }
  return false;
}

export function getExpectedEmailEventTypeFromOutboxId(
  notificationId: string,
  orderId: string
): 'ORDER_CONFIRMATION' | 'ORDER_STATUS_CHANGED' | null {
  if (!isDeterministicOutboxIdForOrder(notificationId, orderId, 'email')) {
    return null;
  }
  return notificationId === getConfirmationOutboxId(orderId)
    ? 'ORDER_CONFIRMATION'
    : 'ORDER_STATUS_CHANGED';
}

export function validateEmailOutboxRecordIdentity(params: {
  notificationId: string;
  orderId: string;
  record: unknown;
  expectedEventType?: 'ORDER_CONFIRMATION' | 'ORDER_STATUS_CHANGED';
}):
  | {
      ok: true;
      canonicalNotificationId: string;
      eventType: 'ORDER_CONFIRMATION' | 'ORDER_STATUS_CHANGED';
    }
  | {
      ok: false;
      reason: string;
    } {
  const { notificationId, orderId, record, expectedEventType } = params;

  if (!isDeterministicOutboxIdForOrder(notificationId, orderId, 'email')) {
    return { ok: false, reason: 'NON_DETERMINISTIC_NOTIFICATION_ID' };
  }

  const derivedEventType = getExpectedEmailEventTypeFromOutboxId(notificationId, orderId);
  if (!derivedEventType) {
    return { ok: false, reason: 'NON_DETERMINISTIC_NOTIFICATION_ID' };
  }

  if (expectedEventType && expectedEventType !== derivedEventType) {
    return { ok: false, reason: 'EVENT_TYPE_MISMATCH' };
  }

  if (!isPlainObject(record)) {
    return { ok: false, reason: 'MALFORMED_OUTBOX_RECORD' };
  }

  if (typeof record.orderId !== 'string' || record.orderId !== orderId) {
    return { ok: false, reason: 'ORDER_ID_MISMATCH' };
  }

  if (record.notificationId !== undefined && record.notificationId !== null && record.notificationId !== '') {
    if (typeof record.notificationId !== 'string' || record.notificationId.trim() !== notificationId) {
      return { ok: false, reason: 'NOTIFICATION_ID_MISMATCH' };
    }
  }

  if (record.channel !== undefined && record.channel !== null && record.channel !== '') {
    if (typeof record.channel !== 'string' || record.channel !== 'email') {
      return { ok: false, reason: 'CHANNEL_MISMATCH' };
    }
  }

  if (record.eventType !== undefined && record.eventType !== null && record.eventType !== '') {
    if (typeof record.eventType !== 'string' || record.eventType !== derivedEventType) {
      return { ok: false, reason: 'EVENT_TYPE_MISMATCH' };
    }
  }

  return {
    ok: true,
    canonicalNotificationId: notificationId,
    eventType: derivedEventType
  };
}

export function isCleanLegacyPendingOutboxRecord(rec: Record<string, any>): boolean {
  if (!isPlainObject(rec)) return false;
  if (rec.status !== undefined && rec.status !== null && rec.status !== '') return false;
  if (
    rec.claimId !== undefined ||
    rec.processingStartedAt !== undefined ||
    rec.processingLeaseExpiresAt !== undefined ||
    rec.staleProcessingDetectedAt !== undefined ||
    rec.staleDiagnosticCode !== undefined ||
    rec.manualReviewRequired === true ||
    rec.cancelledAt !== undefined ||
    rec.orderDeletedAt !== undefined ||
    (rec.error !== undefined && rec.error !== null && rec.error !== '') ||
    rec.outboxFinalized !== undefined ||
    rec.providerOutcome !== undefined ||
    rec.persistenceOutcome !== undefined
  ) {
    return false;
  }
  if (rec.attempts !== undefined && rec.attempts !== null) {
    const n = Number(rec.attempts);
    if (!Number.isFinite(n) || n !== 0) return false;
  }
  return true;
}

export function validateOutboxRecordForRecovery(
  recordKey: string,
  rawRec: unknown,
  expectedOrderId: string
):
  | {
      ok: true;
      canonicalNotificationId: string;
      channel: 'email' | 'telegram' | 'make';
      status: OutboxNotificationStatus;
      isLegacyMissingStatus: boolean;
      record: Record<string, any>;
    }
  | {
      ok: false;
      reason: string;
      canonicalNotificationId: string;
      channel: string;
      status: OutboxNotificationStatus;
    } {
  const validKey = isValidFirebaseOutboxKey(recordKey);
  const canonicalNotificationId = validKey ? recordKey : '';
  const safeChannel =
    isPlainObject(rawRec) && typeof rawRec.channel === 'string' && RECOGNIZED_OUTBOX_CHANNELS.has(rawRec.channel)
      ? rawRec.channel
      : 'unknown';

  if (!validKey || !isPlainObject(rawRec)) {
    return {
      ok: false,
      reason: 'MALFORMED_OUTBOX_RECORD',
      canonicalNotificationId,
      channel: safeChannel,
      status: 'unknown'
    };
  }

  if (typeof rawRec.orderId !== 'string' || rawRec.orderId !== expectedOrderId) {
    return {
      ok: false,
      reason: 'ORDER_ID_MISMATCH',
      canonicalNotificationId,
      channel: safeChannel,
      status: 'unknown'
    };
  }

  if (rawRec.notificationId !== undefined && rawRec.notificationId !== null) {
    if (typeof rawRec.notificationId !== 'string' || rawRec.notificationId.trim() !== recordKey) {
      return {
        ok: false,
        reason: 'NOTIFICATION_ID_MISMATCH',
        canonicalNotificationId,
        channel: safeChannel,
        status: 'unknown'
      };
    }
  }

  if (typeof rawRec.channel !== 'string' || !RECOGNIZED_OUTBOX_CHANNELS.has(rawRec.channel)) {
    return {
      ok: false,
      reason: 'UNRECOGNIZED_CHANNEL',
      canonicalNotificationId,
      channel: 'unknown',
      status: 'unknown'
    };
  }

  if (!isDeterministicOutboxIdForOrder(recordKey, expectedOrderId, rawRec.channel, rawRec.eventType)) {
    return {
      ok: false,
      reason: 'NON_DETERMINISTIC_NOTIFICATION_ID',
      canonicalNotificationId,
      channel: rawRec.channel,
      status: 'unknown'
    };
  }

  let resolvedStatus: OutboxNotificationStatus;
  let isLegacyMissingStatus = false;

  if (rawRec.status === undefined || rawRec.status === null || rawRec.status === '') {
    if (!isCleanLegacyPendingOutboxRecord(rawRec)) {
      return {
        ok: false,
        reason: 'INVALID_OR_CORRUPTED_STATUS',
        canonicalNotificationId,
        channel: rawRec.channel,
        status: 'unknown'
      };
    }
    resolvedStatus = 'pending';
    isLegacyMissingStatus = true;
  } else if (typeof rawRec.status === 'string' && RECOGNIZED_OUTBOX_STATUSES.has(rawRec.status)) {
    resolvedStatus = rawRec.status as OutboxNotificationStatus;
  } else {
    return {
      ok: false,
      reason: 'INVALID_OR_CORRUPTED_STATUS',
      canonicalNotificationId,
      channel: rawRec.channel,
      status: 'unknown'
    };
  }

  return {
    ok: true,
    canonicalNotificationId,
    channel: rawRec.channel as 'email' | 'telegram' | 'make',
    status: resolvedStatus,
    isLegacyMissingStatus,
    record: rawRec
  };
}

function resolveNowMs(nowMs?: number, getNowMs?: () => number): number {
  if (typeof nowMs === 'number' && Number.isFinite(nowMs)) {
    return nowMs;
  }
  if (typeof getNowMs === 'function') {
    const dynamicMs = getNowMs();
    if (typeof dynamicMs === 'number' && Number.isFinite(dynamicMs)) {
      return dynamicMs;
    }
  }
  return Date.now();
}

function resolvePositiveMs(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : fallback;
}

/**
 * Inspects an outbox record's processing lease state without mutating it.
 */
export function inspectOutboxProcessingLease(
  record: unknown,
  options: { nowMs?: number; getNowMs?: () => number; legacyStaleMs?: number } = {}
): OutboxLeaseInspectionResult {
  if (!isPlainObject(record) || String(record.status || '') !== 'processing') {
    return { state: 'NOT_PROCESSING' };
  }

  const nowMs = resolveNowMs(options.nowMs, options.getNowMs);
  const legacyStaleMs = resolvePositiveMs(options.legacyStaleMs, DEFAULT_LEGACY_OUTBOX_STALE_MS);

  if (typeof record.processingLeaseExpiresAt === 'string' && record.processingLeaseExpiresAt.trim()) {
    const expMs = Date.parse(record.processingLeaseExpiresAt);
    if (Number.isFinite(expMs)) {
      return {
        state: nowMs < expMs ? 'ACTIVE' : 'EXPIRED',
        expiresAtMs: expMs
      };
    }
    return { state: 'INVALID_TIMESTAMP' };
  }

  // Legacy processing record missing processingLeaseExpiresAt: derive conservative threshold from processingStartedAt
  if (typeof record.processingStartedAt === 'string' && record.processingStartedAt.trim()) {
    const startMs = Date.parse(record.processingStartedAt);
    if (Number.isFinite(startMs)) {
      return {
        state: nowMs - startMs < legacyStaleMs ? 'LEGACY_ACTIVE' : 'LEGACY_STALE',
        startedAtMs: startMs
      };
    }
  }

  return { state: 'INVALID_TIMESTAMP' };
}

/**
 * Returns true strictly when the record is `processing` with a valid active lease.
 */
export function isOutboxProcessingLeaseActive(
  record: unknown,
  options: { nowMs?: number; getNowMs?: () => number; legacyStaleMs?: number } = {}
): boolean {
  const inspection = inspectOutboxProcessingLease(record, options);
  return inspection.state === 'ACTIVE' || inspection.state === 'LEGACY_ACTIVE';
}

export function getConfirmationOutboxId(orderId: string): string {
  return `notif_order_${orderId}_confirmation`;
}

export function getTelegramOutboxId(orderId: string): string {
  return `notif_order_${orderId}_telegram`;
}

export function getMakeOutboxId(orderId: string): string {
  return `notif_order_${orderId}_make`;
}

/**
 * Builds deterministic fixed-ID outbox initialization records for an order
 * without storing any plaintext or encrypted invoice tokens.
 */
export function buildOrderOutboxInitialRecords(params: {
  orderId: string;
  invoiceCode: string;
  orderData: Record<string, any>;
  nowIso?: string;
}): Record<string, Record<string, any>> {
  const { orderId, invoiceCode, orderData, nowIso = new Date().toISOString() } = params;

  const canonicalEmail = isValidEmailAddress(orderData?.email)
    ? String(orderData.email).trim().toLowerCase()
    : '';
  const hasValidOutboxEmail = isValidEmailAddress(canonicalEmail);

  const confirmationId = getConfirmationOutboxId(orderId);
  const telegramId = getTelegramOutboxId(orderId);
  const makeId = getMakeOutboxId(orderId);

  return {
    [confirmationId]: {
      notificationId: confirmationId,
      orderId,
      invoiceCode,
      channel: 'email',
      recipientEmail: canonicalEmail || 'N/A',
      recipientName: orderData?.name || 'N/A',
      eventType: 'ORDER_CONFIRMATION',
      orderStatus: 'جديد',
      status: hasValidOutboxEmail ? 'pending' : 'skipped_no_valid_email',
      attempts: 0,
      createdAt: nowIso,
      lastAttemptAt: nowIso
    },
    [telegramId]: {
      notificationId: telegramId,
      orderId,
      invoiceCode,
      channel: 'telegram',
      eventType: 'TELEGRAM_ORDER_NOTIFICATION',
      status: 'pending',
      attempts: 0,
      createdAt: nowIso,
      lastAttemptAt: nowIso
    },
    [makeId]: {
      notificationId: makeId,
      orderId,
      invoiceCode,
      channel: 'make',
      eventType: 'MAKE_ORDER_WEBHOOK',
      status: 'pending',
      attempts: 0,
      createdAt: nowIso,
      lastAttemptAt: nowIso
    }
  };
}

function isDeletedTombstone(val: unknown): boolean {
  if (!isPlainObject(val)) return false;
  const st = String(val.status || '').toUpperCase();
  return st === 'DELETING' || st === 'COMMITTING_DELETE' || st === 'DELETED';
}

function buildCancelledDeletedAudit(params: {
  notificationId: string;
  orderId: string;
  current: Record<string, any> | null;
  nowIso: string;
}): Record<string, any> {
  const { notificationId, orderId, current, nowIso } = params;
  return {
    notificationId,
    orderId: orderId || (typeof current?.orderId === 'string' ? current.orderId : ''),
    channel: typeof current?.channel === 'string' ? current.channel : 'unknown',
    eventType: typeof current?.eventType === 'string' ? current.eventType : 'UNKNOWN',
    status: 'cancelled_order_deleted',
    attempts: Number(current?.attempts) || 0,
    createdAt: current?.createdAt || nowIso,
    lastAttemptAt: nowIso,
    cancelledAt: nowIso,
    orderDeletedAt: nowIso
  };
}

/**
 * Atomically claims a notifications_outbox record via Firebase RTDB `.transaction()`
 * transitioning eligible states (`pending`, or `failed` when permitted) -> `processing`,
 * persisting a processing lease (`processingLeaseExpiresAt`) alongside `processingStartedAt` and `claimId`.
 * Prevents concurrent duplicate dispatches, blocks deleted/deleting orders (fail-closed),
 * and never auto-retries `unknown`, `processing`, or sent items.
 */
const ALLOWED_INITIAL_RECORD_KEYS = new Set([
  'notificationId',
  'orderId',
  'invoiceCode',
  'channel',
  'eventType',
  'recipientEmail',
  'recipientName',
  'orderStatus',
  'status',
  'attempts',
  'createdAt',
  'lastAttemptAt'
]);

function isEventTypeCompatibleWithChannel(channel: string, eventType: string): boolean {
  if (!channel || !eventType) return true;
  if (channel === 'email') {
    return eventType === 'ORDER_CONFIRMATION' || eventType === 'ORDER_STATUS_CHANGED';
  }
  if (channel === 'telegram') {
    return eventType === 'TELEGRAM_ORDER_NOTIFICATION';
  }
  if (channel === 'make') {
    return eventType === 'MAKE_ORDER_WEBHOOK';
  }
  return false;
}

export async function claimOutboxNotification(params: {
  adminDb: any;
  notificationId: string;
  orderId?: string;
  channel?: string;
  eventType?: string;
  initialRecord?: Record<string, any>;
  allowRetryFailed?: boolean;
  allowSkipIfNoValidEmail?: boolean;
  hasValidEmail?: boolean;
  nowMs?: number;
  getNowMs?: () => number;
  leaseMs?: number;
}): Promise<OutboxClaimResult> {
  const {
    adminDb,
    notificationId,
    allowRetryFailed = false,
    allowSkipIfNoValidEmail = false,
    hasValidEmail = true
  } = params;

  const hasOrderIdParam = 'orderId' in params && params.orderId !== undefined;
  const hasChannelParam = 'channel' in params && params.channel !== undefined;
  const hasEventTypeParam = 'eventType' in params && params.eventType !== undefined;
  const hasInitialRecordParam = 'initialRecord' in params && params.initialRecord !== undefined;

  if (!isValidFirebaseOutboxKey(notificationId)) {
    return {
      claimed: false,
      reason: 'IDENTITY_MISMATCH',
      status: 'unavailable',
      record: null
    };
  }

  if (hasOrderIdParam && !isValidFirebaseOutboxKey(params.orderId, 128)) {
    return {
      claimed: false,
      reason: 'IDENTITY_MISMATCH',
      status: 'unavailable',
      record: null
    };
  }

  if (hasChannelParam && (typeof params.channel !== 'string' || !RECOGNIZED_OUTBOX_CHANNELS.has(params.channel))) {
    return {
      claimed: false,
      reason: 'IDENTITY_MISMATCH',
      status: 'unavailable',
      record: null
    };
  }

  if (
    hasEventTypeParam &&
    (typeof params.eventType !== 'string' ||
      !RECOGNIZED_OUTBOX_EVENT_TYPES.has(params.eventType) ||
      params.eventType === 'UNKNOWN')
  ) {
    return {
      claimed: false,
      reason: 'IDENTITY_MISMATCH',
      status: 'unavailable',
      record: null
    };
  }

  const trustedOrderId = hasOrderIdParam ? String(params.orderId) : '';
  const trustedChannel = hasChannelParam ? String(params.channel) : '';
  const trustedEventType = hasEventTypeParam ? String(params.eventType) : '';

  let validatedInitialRecord: Record<string, any> | null = null;
  if (hasInitialRecordParam) {
    const rawInit = params.initialRecord;
    if (!isPlainObject(rawInit)) {
      return {
        claimed: false,
        reason: 'IDENTITY_MISMATCH',
        status: 'unavailable',
        record: null
      };
    }

    for (const key of Object.keys(rawInit)) {
      if (!ALLOWED_INITIAL_RECORD_KEYS.has(key)) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    if ('orderId' in rawInit && rawInit.orderId !== undefined) {
      if (!isValidFirebaseOutboxKey(rawInit.orderId, 128)) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
      if (trustedOrderId && rawInit.orderId !== trustedOrderId) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    if ('notificationId' in rawInit && rawInit.notificationId !== undefined) {
      if (typeof rawInit.notificationId !== 'string' || rawInit.notificationId !== notificationId) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    if ('channel' in rawInit && rawInit.channel !== undefined) {
      if (typeof rawInit.channel !== 'string' || !RECOGNIZED_OUTBOX_CHANNELS.has(rawInit.channel)) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
      if (trustedChannel && rawInit.channel !== trustedChannel) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    if ('eventType' in rawInit && rawInit.eventType !== undefined) {
      if (
        typeof rawInit.eventType !== 'string' ||
        !RECOGNIZED_OUTBOX_EVENT_TYPES.has(rawInit.eventType) ||
        rawInit.eventType === 'UNKNOWN'
      ) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
      if (trustedEventType && rawInit.eventType !== trustedEventType) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    if ('status' in rawInit && rawInit.status !== undefined) {
      if (rawInit.status !== 'pending' && rawInit.status !== 'skipped_no_valid_email') {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    if ('attempts' in rawInit && rawInit.attempts !== undefined) {
      if (typeof rawInit.attempts !== 'number' || !Number.isInteger(rawInit.attempts) || rawInit.attempts < 0) {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    for (const strKey of ['invoiceCode', 'recipientEmail', 'recipientName', 'orderStatus']) {
      if (strKey in rawInit && rawInit[strKey] !== undefined && typeof rawInit[strKey] !== 'string') {
        return {
          claimed: false,
          reason: 'IDENTITY_MISMATCH',
          status: 'unavailable',
          record: null
        };
      }
    }

    for (const tsKey of ['createdAt', 'lastAttemptAt']) {
      if (tsKey in rawInit && rawInit[tsKey] !== undefined) {
        if (typeof rawInit[tsKey] !== 'string' || !sanitizeOutboxIsoTimestamp(rawInit[tsKey])) {
          return {
            claimed: false,
            reason: 'IDENTITY_MISMATCH',
            status: 'unavailable',
            record: null
          };
        }
      }
    }

    validatedInitialRecord = rawInit;
  }

  const targetOrderId =
    trustedOrderId || (validatedInitialRecord && typeof validatedInitialRecord.orderId === 'string' ? validatedInitialRecord.orderId : '');
  const expectedChannel =
    trustedChannel || (validatedInitialRecord && typeof validatedInitialRecord.channel === 'string' ? validatedInitialRecord.channel : '');
  const expectedEventType =
    trustedEventType || (validatedInitialRecord && typeof validatedInitialRecord.eventType === 'string' ? validatedInitialRecord.eventType : '');

  if (expectedChannel && expectedEventType && !isEventTypeCompatibleWithChannel(expectedChannel, expectedEventType)) {
    return {
      claimed: false,
      reason: 'IDENTITY_MISMATCH',
      status: 'unavailable',
      record: null
    };
  }

  const derivedNewEventType =
    expectedEventType ||
    (expectedChannel === 'telegram'
      ? 'TELEGRAM_ORDER_NOTIFICATION'
      : expectedChannel === 'make'
        ? 'MAKE_ORDER_WEBHOOK'
        : expectedChannel === 'email' && targetOrderId
          ? getExpectedEmailEventTypeFromOutboxId(notificationId, targetOrderId) || ''
          : '');

  if (!adminDb || typeof adminDb.ref !== 'function') {
    return {
      claimed: false,
      reason: 'STORE_UNAVAILABLE',
      status: 'unavailable',
      record: null
    };
  }

  // Pre-claim fail-closed check against privateDeletedOrders/{orderId}
  if (targetOrderId) {
    try {
      const preDelSnap = await adminDb.ref(`privateDeletedOrders/${targetOrderId}`).once('value');
      const preDelVal = preDelSnap?.val?.() ?? null;
      if (isDeletedTombstone(preDelVal)) {
        return {
          claimed: false,
          reason: 'ORDER_DELETED',
          status: 'cancelled_order_deleted',
          record: null
        };
      }
    } catch (err: any) {
      console.warn(
        `[NotificationsOutbox] Pre-claim deleted-order check error for ${notificationId}:`,
        err?.code || err?.message || 'deleted_check_error'
      );
      return {
        claimed: false,
        reason: 'CLAIM_ERROR',
        status: 'unavailable',
        record: null
      };
    }
  }

  if (
    targetOrderId &&
    expectedChannel &&
    !isDeterministicOutboxIdForOrder(notificationId, targetOrderId, expectedChannel, expectedEventType || undefined)
  ) {
    return {
      claimed: false,
      reason: 'IDENTITY_MISMATCH',
      status: 'unavailable',
      record: null
    };
  }

  const outboxRef = adminDb.ref(`notifications_outbox/${notificationId}`);
  const claimId = crypto.randomUUID();
  const claimNowMs = resolveNowMs(params.nowMs, params.getNowMs);
  const effectiveLeaseMs = resolvePositiveMs(params.leaseMs, DEFAULT_OUTBOX_PROCESSING_LEASE_MS);
  const nowIso = new Date(claimNowMs).toISOString();
  const processingLeaseExpiresAt = new Date(claimNowMs + effectiveLeaseMs).toISOString();

  if (!outboxRef || typeof outboxRef.transaction !== 'function') {
    return {
      claimed: false,
      reason: 'STORE_UNAVAILABLE',
      status: 'unavailable',
      record: null
    };
  }

  try {
    let blockedReason: OutboxClaimResult['reason'] | undefined;
    let skippedNoEmail = false;
    let previousStatusBeforeClaim = 'pending';

    const tx = await outboxRef.transaction((current: any) => {
      blockedReason = undefined;
      skippedNoEmail = false;

      if (current === null || current === undefined) {
        previousStatusBeforeClaim = 'pending';

        const safeMetadata: Record<string, any> = {};
        if (validatedInitialRecord) {
          if (typeof validatedInitialRecord.invoiceCode === 'string') {
            safeMetadata.invoiceCode = validatedInitialRecord.invoiceCode;
          }
          if (typeof validatedInitialRecord.recipientEmail === 'string') {
            safeMetadata.recipientEmail = validatedInitialRecord.recipientEmail;
          }
          if (typeof validatedInitialRecord.recipientName === 'string') {
            safeMetadata.recipientName = validatedInitialRecord.recipientName;
          }
          if (typeof validatedInitialRecord.orderStatus === 'string') {
            safeMetadata.orderStatus = validatedInitialRecord.orderStatus;
          }
        }

        const sanitizedCreatedAt =
          validatedInitialRecord && typeof validatedInitialRecord.createdAt === 'string'
            ? sanitizeOutboxIsoTimestamp(validatedInitialRecord.createdAt) || nowIso
            : nowIso;
        const safeAttempts =
          validatedInitialRecord && typeof validatedInitialRecord.attempts === 'number'
            ? validatedInitialRecord.attempts
            : 0;

        const canonicalIdentity: Record<string, any> = {
          notificationId
        };
        if (targetOrderId) canonicalIdentity.orderId = targetOrderId;
        if (expectedChannel) canonicalIdentity.channel = expectedChannel;
        if (derivedNewEventType) canonicalIdentity.eventType = derivedNewEventType;

        if (allowSkipIfNoValidEmail && !hasValidEmail) {
          skippedNoEmail = true;
          return {
            ...safeMetadata,
            ...canonicalIdentity,
            status: 'skipped_no_valid_email',
            attempts: 0,
            createdAt: sanitizedCreatedAt,
            lastAttemptAt: nowIso
          };
        }

        return {
          ...safeMetadata,
          ...canonicalIdentity,
          status: 'processing',
          claimId,
          processingStartedAt: nowIso,
          processingLeaseExpiresAt,
          lastAttemptAt: nowIso,
          attempts: safeAttempts,
          createdAt: sanitizedCreatedAt
        };
      }

      if (!isPlainObject(current)) {
        blockedReason = 'IDENTITY_MISMATCH';
        return undefined;
      }

      if (targetOrderId) {
        if (current.orderId !== undefined && current.orderId !== null && current.orderId !== '') {
          if (typeof current.orderId !== 'string' || current.orderId.trim() !== targetOrderId) {
            blockedReason = 'IDENTITY_MISMATCH';
            return undefined;
          }
        } else if (expectedChannel) {
          blockedReason = 'IDENTITY_MISMATCH';
          return undefined;
        }
      }

      if (current.notificationId !== undefined && current.notificationId !== null && current.notificationId !== '') {
        if (typeof current.notificationId !== 'string' || current.notificationId.trim() !== notificationId) {
          blockedReason = 'IDENTITY_MISMATCH';
          return undefined;
        }
      }

      const rawSt = current.status;
      if (rawSt === 'cancelled_order_deleted' || rawSt === 'unknown_deleted_during_dispatch') {
        blockedReason = 'ORDER_DELETED';
        return undefined;
      }

      if (current.channel !== undefined && current.channel !== null && current.channel !== '') {
        if (typeof current.channel !== 'string' || !RECOGNIZED_OUTBOX_CHANNELS.has(current.channel)) {
          blockedReason = 'IDENTITY_MISMATCH';
          return undefined;
        }
        if (expectedChannel && current.channel !== expectedChannel) {
          blockedReason = 'IDENTITY_MISMATCH';
          return undefined;
        }
      }

      if (current.eventType !== undefined && current.eventType !== null && current.eventType !== '') {
        if (typeof current.eventType !== 'string') {
          blockedReason = 'IDENTITY_MISMATCH';
          return undefined;
        }
        if (expectedEventType && current.eventType !== expectedEventType) {
          blockedReason = 'IDENTITY_MISMATCH';
          return undefined;
        }
      }

      const effectiveOrderId =
        targetOrderId || (typeof current.orderId === 'string' ? current.orderId.trim() : '');
      const effectiveChannel =
        expectedChannel || (typeof current.channel === 'string' ? current.channel.trim() : '');
      const effectiveEventType =
        (typeof current.eventType === 'string' && current.eventType.trim()) ||
        expectedEventType ||
        undefined;

      if (
        expectedChannel &&
        effectiveOrderId &&
        !isDeterministicOutboxIdForOrder(notificationId, effectiveOrderId, effectiveChannel, effectiveEventType)
      ) {
        blockedReason = 'IDENTITY_MISMATCH';
        return undefined;
      }

      if (
        !expectedChannel &&
        effectiveOrderId &&
        effectiveChannel &&
        effectiveEventType &&
        !isDeterministicOutboxIdForOrder(notificationId, effectiveOrderId, effectiveChannel, effectiveEventType)
      ) {
        blockedReason = 'IDENTITY_MISMATCH';
        return undefined;
      }

      if (rawSt !== undefined && rawSt !== null && rawSt !== '' && (typeof rawSt !== 'string' || !RECOGNIZED_OUTBOX_STATUSES.has(rawSt))) {
        blockedReason = 'AMBIGUOUS_UNKNOWN';
        return undefined;
      }
      if ((rawSt === undefined || rawSt === null || rawSt === '') && !isCleanLegacyPendingOutboxRecord(current)) {
        blockedReason = 'AMBIGUOUS_UNKNOWN';
        return undefined;
      }

      const st = String(rawSt || 'pending');
      previousStatusBeforeClaim = st;

      if (st === 'accepted_by_mailapp' || st === 'sent') {
        blockedReason = 'ALREADY_SENT';
        return undefined;
      }
      if (st === 'processing') {
        blockedReason = 'IN_FLIGHT';
        return undefined;
      }
      if (st === 'unknown' || st === 'unfinalized' || st === 'unavailable') {
        blockedReason = 'AMBIGUOUS_UNKNOWN';
        return undefined;
      }
      if (st === 'skipped_not_configured' || st === 'skipped_intentionally_disabled') {
        blockedReason = 'SKIPPED';
        return undefined;
      }
      if (st === 'skipped_no_valid_email' && (!allowSkipIfNoValidEmail || !hasValidEmail)) {
        blockedReason = 'SKIPPED';
        return undefined;
      }
      if (st === 'failed' && !allowRetryFailed) {
        blockedReason = 'FAILED_BLOCKED';
        return undefined;
      }

      if (allowSkipIfNoValidEmail && !hasValidEmail) {
        skippedNoEmail = true;
        return {
          ...current,
          ...(validatedInitialRecord && typeof validatedInitialRecord.recipientEmail === 'string'
            ? { recipientEmail: validatedInitialRecord.recipientEmail }
            : {}),
          status: 'skipped_no_valid_email',
          lastAttemptAt: nowIso
        };
      }

      return {
        ...current,
        ...(targetOrderId && !current.orderId ? { orderId: targetOrderId } : {}),
        ...(validatedInitialRecord && typeof validatedInitialRecord.invoiceCode === 'string' && !current.invoiceCode
          ? { invoiceCode: validatedInitialRecord.invoiceCode }
          : {}),
        ...(expectedChannel && !current.channel ? { channel: expectedChannel } : {}),
        ...(derivedNewEventType && !current.eventType ? { eventType: derivedNewEventType } : {}),
        notificationId,
        status: 'processing',
        claimId,
        processingStartedAt: nowIso,
        processingLeaseExpiresAt,
        lastAttemptAt: nowIso
      };
    });

    const val = tx?.snapshot?.val?.() ?? null;

    if (
      (tx?.committed && skippedNoEmail && isPlainObject(val) && val.status === 'skipped_no_valid_email') ||
      blockedReason === 'SKIPPED'
    ) {
      return {
        claimed: false,
        reason: 'SKIPPED',
        status: isPlainObject(val) && val.status ? String(val.status) : 'skipped_no_valid_email',
        record: val
      };
    }

    if (tx?.committed && isPlainObject(val) && val.status === 'processing') {
      if (val.claimId !== claimId) {
        return {
          claimed: false,
          reason: 'OWNERSHIP_MISMATCH',
          status: 'processing',
          record: val
        };
      }

      // Post-claim fencing check before handing control to external dispatch:
      // If the order entered DELETING / DELETED concurrently just before dispatch,
      // cancel cleanly (no external dispatch ever occurred) and abort.
      const resolvedOrderId =
        targetOrderId || (typeof val?.orderId === 'string' && val.orderId.trim() ? val.orderId.trim() : '');
      if (resolvedOrderId) {
        try {
          const postDelSnap = await adminDb.ref(`privateDeletedOrders/${resolvedOrderId}`).once('value');
          const postDelVal = postDelSnap?.val?.() ?? null;
          if (isDeletedTombstone(postDelVal)) {
            const closeIso = new Date(resolveNowMs(params.nowMs, params.getNowMs)).toISOString();
            const closeTx = await outboxRef.transaction((cur: any) => {
              if (!isPlainObject(cur)) return undefined;
              if (cur.status !== 'processing' || cur.claimId !== claimId) return undefined;
              return buildCancelledDeletedAudit({
                notificationId,
                orderId: resolvedOrderId,
                current: cur,
                nowIso: closeIso
              });
            });
            return {
              claimed: false,
              reason: 'ORDER_DELETED',
              status: 'cancelled_order_deleted',
              record: closeTx?.snapshot?.val?.() ?? null
            };
          }
        } catch (postErr: any) {
          console.warn(
            `[NotificationsOutbox] Post-claim deleted-order check error for ${notificationId}:`,
            postErr?.code || postErr?.message || 'post_claim_check_error'
          );
          try {
            await outboxRef.transaction((cur: any) => {
              if (!isPlainObject(cur)) return undefined;
              if (cur.status !== 'processing' || cur.claimId !== claimId) return undefined;
              const {
                claimId: _c,
                processingStartedAt: _p,
                processingLeaseExpiresAt: _exp,
                ...rest
              } = cur;
              return {
                ...rest,
                status: previousStatusBeforeClaim,
                lastAttemptAt: new Date(resolveNowMs(params.nowMs, params.getNowMs)).toISOString()
              };
            });
          } catch {
            // best-effort release
          }
          return {
            claimed: false,
            reason: 'CLAIM_ERROR',
            status: 'unavailable',
            record: null
          };
        }
      }

      return {
        claimed: true,
        claimId,
        status: 'processing',
        record: val
      };
    }

    const currentStatus = isPlainObject(val) && val.status ? String(val.status) : '';
    const resolvedReason: OutboxClaimResult['reason'] =
      blockedReason ||
      (currentStatus === 'accepted_by_mailapp' || currentStatus === 'sent'
        ? 'ALREADY_SENT'
        : currentStatus === 'processing'
          ? 'IN_FLIGHT'
          : currentStatus === 'unknown'
            ? 'AMBIGUOUS_UNKNOWN'
            : currentStatus === 'cancelled_order_deleted' ||
                currentStatus === 'unknown_deleted_during_dispatch'
              ? 'ORDER_DELETED'
              : currentStatus === 'failed'
                ? 'FAILED_BLOCKED'
                : 'NOT_COMMITTED');

    return {
      claimed: false,
      reason: resolvedReason,
      status:
        resolvedReason === 'NOT_COMMITTED'
          ? 'unavailable'
          : currentStatus || 'unavailable',
      record: val
    };
  } catch (err: any) {
    console.warn(
      `[NotificationsOutbox] Claim transaction error for ${notificationId}:`,
      err?.code || err?.message || 'claim_error'
    );
    return {
      claimed: false,
      reason: 'CLAIM_ERROR',
      status: 'unavailable',
      record: null
    };
  }
}

/**
 * Updates an owned `processing` outbox record after external call completion.
 * Aborts cleanly if the order was deleted during dispatch or claim ownership was superseded,
 * and strips active processing lease metadata upon finalization.
 */
export async function finalizeOutboxNotification(params: {
  adminDb: any;
  notificationId: string;
  claimId: string;
  status: OutboxNotificationStatus;
  error?: string | null;
  message?: string | null;
  extra?: Record<string, any>;
  nowMs?: number;
  getNowMs?: () => number;
}): Promise<OutboxFinalizeResult> {
  const { adminDb, notificationId, claimId, status, error = null, message = null, extra = {} } = params;
  if (!adminDb || typeof adminDb.ref !== 'function' || !isValidFirebaseOutboxKey(notificationId)) {
    return { finalized: false, reason: 'STORE_UNAVAILABLE' };
  }
  if (!claimId || typeof claimId !== 'string') {
    return { finalized: false, reason: 'OWNERSHIP_MISMATCH' };
  }
  if (status === 'pending' || status === 'processing') {
    return { finalized: false, reason: 'STATE_CHANGED' };
  }

  try {
    const outboxRef = adminDb.ref(`notifications_outbox/${notificationId}`);
    if (!outboxRef || typeof outboxRef.transaction !== 'function') {
      return { finalized: false, reason: 'STORE_UNAVAILABLE' };
    }

    let abortReason: OutboxFinalizeResult['reason'] | undefined;
    const nowIso = new Date(resolveNowMs(params.nowMs, params.getNowMs)).toISOString();
    const safeError = sanitizeOutboxErrorCode(error);

    const tx = await outboxRef.transaction((current: any) => {
      abortReason = undefined;
      if (!isPlainObject(current)) {
        abortReason = 'NOT_FOUND';
        return undefined;
      }
      if (
        current.status === 'cancelled_order_deleted' ||
        current.status === 'unknown_deleted_during_dispatch'
      ) {
        abortReason = 'ORDER_DELETED';
        return undefined;
      }
      if (current.status !== 'processing') {
        abortReason = 'STATE_CHANGED';
        return undefined;
      }
      if (!current.claimId || current.claimId !== claimId) {
        abortReason = 'OWNERSHIP_MISMATCH';
        return undefined;
      }

      const nextAttempts =
        (Number(current.attempts) || 0) +
        (status === 'skipped_not_configured' || status === 'skipped_intentionally_disabled' ? 0 : 1);
      const {
        claimId: _clearedClaim,
        processingStartedAt: _clearedStart,
        processingLeaseExpiresAt: _clearedLease,
        ...rest
      } = current;
      return {
        ...rest,
        ...extra,
        status,
        attempts: nextAttempts,
        lastAttemptAt: nowIso,
        error: safeError,
        message
      };
    });

    const finalSnapVal = tx?.snapshot?.val?.() ?? null;
    const snapStatus = isPlainObject(finalSnapVal) && finalSnapVal.status ? String(finalSnapVal.status) : undefined;
    const committedExpected = Boolean(tx?.committed) && snapStatus === status;

    if (!committedExpected) {
      return {
        finalized: false,
        status: snapStatus,
        reason: abortReason || 'NOT_COMMITTED'
      };
    }

    return {
      finalized: true,
      status: snapStatus
    };
  } catch (err: any) {
    console.warn(
      `[NotificationsOutbox] Finalize transaction error for ${notificationId}:`,
      err?.code || err?.message || 'finalize_error'
    );
    return {
      finalized: false,
      reason: 'FINALIZE_TRANSACTION_ERROR'
    };
  }
}

/**
 * Safely reconciles a single potentially stale `processing` outbox record via an individual RTDB `.transaction()`.
 * - Active lease -> leaves `processing` untouched and returns `IN_FLIGHT`.
 * - Expired lease (or stale legacy record) -> transitions to `unknown` (never `pending` or `failed`) and strips active processing metadata.
 * - Legacy `processing` record with missing/malformed timestamp -> leaves blocked and flags `manualReviewRequired`.
 * - Non-`processing` and deletion audit states -> untouched and preserved.
 */
export async function reconcileStaleOutboxNotification(params: {
  adminDb: any;
  notificationId: string;
  nowMs?: number;
  getNowMs?: () => number;
  leaseMs?: number;
  legacyStaleMs?: number;
}): Promise<OutboxReconcileResult> {
  const { adminDb, notificationId } = params;
  if (!adminDb || typeof adminDb.ref !== 'function' || typeof notificationId !== 'string' || !notificationId.trim()) {
    return {
      ok: false,
      outcome: 'RECONCILE_ERROR',
      status: 'unknown',
      transitioned: false,
      manualReviewRequired: true,
      diagnosticCode: 'RECONCILE_UNAVAILABLE'
    };
  }

  const outboxRef = adminDb.ref(`notifications_outbox/${notificationId.trim()}`);
  if (typeof outboxRef.transaction !== 'function') {
    return {
      ok: false,
      outcome: 'RECONCILE_ERROR',
      status: 'unknown',
      transitioned: false,
      manualReviewRequired: true,
      diagnosticCode: 'RECONCILE_UNAVAILABLE'
    };
  }

  const nowMs = resolveNowMs(params.nowMs, params.getNowMs);
  const nowIso = new Date(nowMs).toISOString();
  const legacyStaleMs = resolvePositiveMs(params.legacyStaleMs, DEFAULT_LEGACY_OUTBOX_STALE_MS);

  try {
    let outcome: OutboxReconcileResult['outcome'] = 'NOT_PROCESSING';
    let diagnosticCode: string | undefined;
    let manualReviewRequired = false;

    const tx = await outboxRef.transaction((current: any) => {
      diagnosticCode = undefined;
      manualReviewRequired = false;

      if (!isPlainObject(current)) {
        outcome = 'NOT_FOUND';
        return undefined;
      }

      const st = String(current.status || 'pending');
      if (st === 'cancelled_order_deleted' || st === 'unknown_deleted_during_dispatch') {
        outcome = 'ORDER_DELETED';
        return undefined;
      }
      if (st !== 'processing') {
        outcome = 'NOT_PROCESSING';
        return undefined;
      }

      const inspection = inspectOutboxProcessingLease(current, {
        nowMs,
        legacyStaleMs
      });

      if (inspection.state === 'ACTIVE' || inspection.state === 'LEGACY_ACTIVE') {
        outcome = 'IN_FLIGHT';
        return undefined;
      }

      if (inspection.state === 'INVALID_TIMESTAMP') {
        outcome = 'MANUAL_REVIEW_REQUIRED';
        manualReviewRequired = true;
        diagnosticCode = 'MISSING_OR_INVALID_PROCESSING_TIMESTAMP';
        if (
          current.manualReviewRequired === true &&
          current.staleDiagnosticCode === diagnosticCode
        ) {
          return undefined;
        }
        return {
          ...current,
          manualReviewRequired: true,
          staleProcessingDetectedAt: current.staleProcessingDetectedAt || nowIso,
          staleDiagnosticCode: diagnosticCode,
          error: current.error || diagnosticCode,
          message: 'Processing timestamp is missing or malformed; manual review required before any dispatch'
        };
      }

      // Expired lease or stale legacy processing record -> transition safely to `unknown`
      outcome = 'RECONCILED_UNKNOWN';
      diagnosticCode =
        inspection.state === 'LEGACY_STALE' ? 'LEGACY_PROCESSING_STALE' : 'PROCESSING_LEASE_EXPIRED';

      const {
        claimId: _clearedClaim,
        processingStartedAt: _clearedStart,
        processingLeaseExpiresAt: _clearedLease,
        ...rest
      } = current;

      return {
        ...rest,
        status: 'unknown',
        attempts: (Number(current.attempts) || 0) + 1,
        lastAttemptAt: nowIso,
        staleProcessingDetectedAt: nowIso,
        staleDiagnosticCode: diagnosticCode,
        error: diagnosticCode,
        message: 'Processing lease expired before completion; marked unknown to prevent duplicate dispatch'
      };
    });

    const val = tx?.snapshot?.val?.() ?? null;
    const finalStatus = isPlainObject(val) ? String(val.status || '') : '';

    if (outcome === 'NOT_FOUND') {
      return {
        ok: true,
        outcome: 'NOT_FOUND',
        status: 'unknown',
        transitioned: false,
        record: null
      };
    }

    if (outcome === 'RECONCILED_UNKNOWN' && tx?.committed && finalStatus === 'unknown') {
      return {
        ok: true,
        outcome: 'RECONCILED_UNKNOWN',
        status: 'unknown',
        transitioned: true,
        diagnosticCode,
        record: val
      };
    }

    if (outcome === 'MANUAL_REVIEW_REQUIRED') {
      return {
        ok: true,
        outcome: 'MANUAL_REVIEW_REQUIRED',
        status: finalStatus || 'processing',
        transitioned: false,
        manualReviewRequired: true,
        diagnosticCode: diagnosticCode || 'MISSING_OR_INVALID_PROCESSING_TIMESTAMP',
        record: val
      };
    }

    if (outcome === 'IN_FLIGHT' || finalStatus === 'processing') {
      return {
        ok: true,
        outcome: 'IN_FLIGHT',
        status: 'processing',
        transitioned: false,
        record: val
      };
    }

    if (
      outcome === 'ORDER_DELETED' ||
      finalStatus === 'cancelled_order_deleted' ||
      finalStatus === 'unknown_deleted_during_dispatch'
    ) {
      return {
        ok: true,
        outcome: 'ORDER_DELETED',
        status: finalStatus || 'cancelled_order_deleted',
        transitioned: false,
        record: val
      };
    }

    return {
      ok: true,
      outcome: 'NOT_PROCESSING',
      status: finalStatus || 'unknown',
      transitioned: false,
      record: val
    };
  } catch (err: any) {
    console.warn(
      `[NotificationsOutbox] Reconcile stale transaction error for ${notificationId}:`,
      err?.code || err?.message || 'reconcile_error'
    );
    return {
      ok: false,
      outcome: 'RECONCILE_ERROR',
      status: 'unknown',
      transitioned: false,
      manualReviewRequired: true,
      diagnosticCode: 'RECONCILE_TRANSACTION_FAILED'
    };
  }
}

function deriveUnclaimedOutcomes(claim: OutboxClaimResult): {
  providerOutcome: OutboxProviderOutcome;
  persistenceOutcome: OutboxPersistenceOutcome;
  outboxFinalized: boolean;
} {
  if (claim.reason === 'ALREADY_SENT') {
    return {
      providerOutcome: 'accepted',
      persistenceOutcome: 'committed',
      outboxFinalized: true
    };
  }
  if (claim.reason === 'ORDER_DELETED') {
    return {
      providerOutcome: 'skipped',
      persistenceOutcome: 'order_deleted',
      outboxFinalized: false
    };
  }
  if (claim.reason === 'SKIPPED') {
    return {
      providerOutcome: 'skipped',
      persistenceOutcome:
        claim.status === 'skipped_intentionally_disabled' ? 'intentionally_disabled' : 'committed',
      outboxFinalized: claim.status !== 'skipped_intentionally_disabled'
    };
  }
  if (claim.reason === 'STORE_UNAVAILABLE' || claim.reason === 'CLAIM_ERROR' || claim.reason === 'NOT_COMMITTED') {
    return {
      providerOutcome: 'not_attempted',
      persistenceOutcome: 'claim_unavailable',
      outboxFinalized: false
    };
  }
  if (claim.reason === 'OWNERSHIP_MISMATCH') {
    return {
      providerOutcome: 'not_attempted',
      persistenceOutcome: 'ownership_mismatch',
      outboxFinalized: false
    };
  }
  if (claim.reason === 'IDENTITY_MISMATCH') {
    return {
      providerOutcome: 'not_attempted',
      persistenceOutcome: 'identity_mismatch',
      outboxFinalized: false
    };
  }
  if (claim.reason === 'AMBIGUOUS_UNKNOWN') {
    return {
      providerOutcome: 'ambiguous',
      persistenceOutcome: 'claim_blocked',
      outboxFinalized: false
    };
  }
  return {
    providerOutcome: 'not_attempted',
    persistenceOutcome: 'claim_blocked',
    outboxFinalized: false
  };
}

/**
 * Safely dispatches Telegram order notification backed by fixed-ID Outbox fencing.
 * Never throws synchronously or rejects.
 */
export async function dispatchTelegramOutboxNotification(params: {
  orderId: string;
  orderData: Record<string, any>;
  adminDb: any;
  sendTelegramFn?: (args: any) => Promise<any>;
  timeoutMs?: number;
  nowMs?: number;
  getNowMs?: () => number;
  leaseMs?: number;
}): Promise<{
  status: string;
  claimed: boolean;
  message?: string;
  providerOutcome?: OutboxProviderOutcome;
  providerStatus?: string;
  outboxFinalized?: boolean;
  persistenceOutcome?: OutboxPersistenceOutcome;
  outboxStatus?: string;
}> {
  const {
    orderId,
    orderData,
    adminDb,
    sendTelegramFn = sendTelegramNotification,
    timeoutMs = 4000,
    nowMs,
    getNowMs,
    leaseMs
  } = params;

  const notificationId = getTelegramOutboxId(orderId);
  const nowIso = new Date(resolveNowMs(nowMs, getNowMs)).toISOString();

  try {
    const claim = await claimOutboxNotification({
      adminDb,
      notificationId,
      orderId,
      channel: 'telegram',
      eventType: 'TELEGRAM_ORDER_NOTIFICATION',
      allowRetryFailed: false,
      nowMs,
      getNowMs,
      leaseMs,
      initialRecord: {
        notificationId,
        orderId,
        invoiceCode: orderData?.invoiceCode || '',
        channel: 'telegram',
        eventType: 'TELEGRAM_ORDER_NOTIFICATION',
        status: 'pending',
        attempts: 0,
        createdAt: nowIso,
        lastAttemptAt: nowIso
      }
    });

    if (!claim.claimed || !claim.claimId) {
      const outcomes = deriveUnclaimedOutcomes(claim);
      return {
        claimed: false,
        status: claim.status,
        outboxStatus: claim.status,
        providerOutcome: outcomes.providerOutcome,
        outboxFinalized: outcomes.outboxFinalized,
        persistenceOutcome: outcomes.persistenceOutcome,
        message:
          claim.reason === 'ORDER_DELETED'
            ? 'Telegram notification skipped because order is being deleted or deleted'
            : claim.reason === 'STORE_UNAVAILABLE' || claim.reason === 'CLAIM_ERROR' || claim.reason === 'NOT_COMMITTED'
              ? 'Telegram notification blocked because outbox claim store is unavailable'
              : 'Telegram notification already handled or in progress'
      };
    }

    let finalStatus: OutboxNotificationStatus = 'failed';
    let finalError: string | null = null;
    let finalMessage: string | null = null;
    let providerOutcome: OutboxProviderOutcome = 'rejected';
    const extra: Record<string, any> = {};

    try {
      const tgResult = await Promise.resolve().then(() =>
        sendTelegramFn({
          order: orderData,
          orderId,
          timeoutMs
        })
      );

      if (!tgResult || typeof tgResult !== 'object' || Array.isArray(tgResult)) {
        finalStatus = 'unknown';
        providerOutcome = 'ambiguous';
        finalError = 'TELEGRAM_DISPATCH_FAILED';
        finalMessage = 'Telegram provider returned no confirmation outcome';
      } else if (
        tgResult.status === 'SIMULATED' ||
        tgResult.simulated === true
      ) {
        finalStatus = 'skipped_not_configured';
        providerOutcome = 'skipped';
        finalError = null;
        extra.simulated = true;
        finalMessage = 'Telegram notification skipped (not configured / simulated)';
      } else if (
        tgResult.skipped === true ||
        tgResult.status === 'SKIPPED' ||
        tgResult.status === 'SKIPPED_NOT_CONFIGURED'
      ) {
        finalStatus = 'skipped_not_configured';
        providerOutcome = 'skipped';
        finalError = null;
        finalMessage =
          typeof tgResult.message === 'string' && tgResult.message.trim()
            ? tgResult.message.trim()
            : 'Telegram notification skipped (not configured)';
      } else if (
        tgResult.status === 'SUCCESS' ||
        tgResult.allSuccessful === true ||
        (tgResult.success === true &&
          tgResult.status !== 'PARTIAL_SUCCESS' &&
          tgResult.status !== 'FAILURE')
      ) {
        finalStatus = 'sent';
        providerOutcome = 'accepted';
        finalMessage = 'Telegram notification dispatched';
      } else {
        const hasTimeout =
          Array.isArray(tgResult.results) &&
          tgResult.results.some((r: any) => r?.error?.code === 'NETWORK_TIMEOUT' || r?.error?.code === 'TIMEOUT');
        if (tgResult.anySuccessful === true || tgResult.status === 'PARTIAL_SUCCESS' || hasTimeout) {
          finalStatus = 'unknown';
          providerOutcome = hasTimeout ? 'timeout' : 'ambiguous';
          finalError = hasTimeout ? 'NETWORK_TIMEOUT' : 'TELEGRAM_DISPATCH_FAILED';
          finalMessage = 'Telegram delivery outcome is partial or ambiguous after timeout';
        } else if (tgResult.status === 'FAILURE' || tgResult.success === false) {
          finalStatus = 'failed';
          providerOutcome = 'rejected';
          const firstErr = Array.isArray(tgResult.results)
            ? tgResult.results.find((r: any) => !r?.success)?.error
            : null;
          finalError = sanitizeOutboxErrorCode(firstErr?.code) || 'TELEGRAM_DISPATCH_FAILED';
          finalMessage = 'Telegram notification delivery failed';
        } else {
          finalStatus = 'unknown';
          providerOutcome = 'ambiguous';
          finalError = 'TELEGRAM_DISPATCH_FAILED';
          finalMessage = 'Telegram provider returned unrecognized or ambiguous outcome';
        }
      }
    } catch (tgErr: any) {
      const errName = String(tgErr?.name || '');
      const errMsg = String(tgErr?.message || tgErr || 'telegram_error');
      const isTimeout =
        errName === 'AbortError' ||
        errMsg.toLowerCase().includes('timeout') ||
        errMsg.toLowerCase().includes('aborted');

      finalStatus = isTimeout ? 'unknown' : 'failed';
      providerOutcome = isTimeout ? 'timeout' : 'rejected';
      finalError = isTimeout ? 'NETWORK_TIMEOUT' : 'TELEGRAM_EXCEPTION';
      finalMessage = isTimeout ? 'Telegram request timed out' : 'Telegram notification dispatch threw exception';
      console.error('[CreateOrder] Telegram order notification failed (resilient):', errMsg);
    }

    extra.providerOutcome = providerOutcome;
    extra.persistenceOutcome = 'committed';

    const finRes = await finalizeOutboxNotification({
      adminDb,
      notificationId,
      claimId: claim.claimId,
      status: finalStatus,
      error: finalError,
      message: finalMessage,
      extra,
      nowMs,
      getNowMs
    });

    if (finRes.finalized) {
      return {
        claimed: true,
        status: finalStatus,
        outboxStatus: finalStatus,
        providerOutcome,
        providerStatus: finalStatus,
        outboxFinalized: true,
        persistenceOutcome: 'committed',
        message: finalMessage || undefined
      };
    }

    const isDeleted =
      finRes.status === 'cancelled_order_deleted' ||
      finRes.status === 'unknown_deleted_during_dispatch';
    const persistenceOutcome: OutboxPersistenceOutcome = isDeleted
      ? 'order_deleted'
      : finRes.reason === 'OWNERSHIP_MISMATCH'
        ? 'ownership_mismatch'
        : 'finalization_failed';

    return {
      claimed: true,
      status: isDeleted ? finRes.status! : 'unfinalized',
      outboxStatus: finRes.status || 'processing',
      providerOutcome,
      providerStatus: finalStatus,
      outboxFinalized: false,
      persistenceOutcome,
      message: isDeleted
        ? 'Order deleted during Telegram notification dispatch'
        : 'Telegram dispatch completed but outbox finalization failed'
    };
  } catch (outerErr: any) {
    console.error('[NotificationsOutbox] Unexpected Telegram outbox error (isolated):', outerErr?.message || outerErr);
    return {
      claimed: false,
      status: 'unavailable',
      outboxStatus: 'unavailable',
      providerOutcome: 'not_attempted',
      outboxFinalized: false,
      persistenceOutcome: 'claim_unavailable',
      message: 'Unexpected Telegram outbox error'
    };
  }
}

/**
 * Safely dispatches Make.com webhook backed by fixed-ID Outbox fencing.
 * Classifies timeouts/aborts as `unknown` (never auto-retried) and clear errors as `failed`.
 * Never throws synchronously or rejects.
 */
export async function dispatchMakeWebhookOutboxNotification(params: {
  orderId: string;
  orderData: Record<string, any>;
  adminDb: any;
  fetchFn?: typeof globalThis.fetch;
  makeWebhookUrl?: string;
  timeoutMs?: number;
  nowMs?: number;
  getNowMs?: () => number;
  leaseMs?: number;
}): Promise<{
  status: string;
  claimed: boolean;
  message?: string;
  providerOutcome?: OutboxProviderOutcome;
  providerStatus?: string;
  outboxFinalized?: boolean;
  persistenceOutcome?: OutboxPersistenceOutcome;
  outboxStatus?: string;
}> {
  const {
    orderId,
    orderData,
    adminDb,
    fetchFn = globalThis.fetch,
    makeWebhookUrl = process.env.MAKE_WEBHOOK_URL,
    timeoutMs = 4000,
    nowMs,
    getNowMs,
    leaseMs
  } = params;

  const notificationId = getMakeOutboxId(orderId);
  const nowIso = new Date(resolveNowMs(nowMs, getNowMs)).toISOString();

  try {
    const claim = await claimOutboxNotification({
      adminDb,
      notificationId,
      orderId,
      channel: 'make',
      eventType: 'MAKE_ORDER_WEBHOOK',
      allowRetryFailed: false,
      nowMs,
      getNowMs,
      leaseMs,
      initialRecord: {
        notificationId,
        orderId,
        invoiceCode: orderData?.invoiceCode || '',
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'pending',
        attempts: 0,
        createdAt: nowIso,
        lastAttemptAt: nowIso
      }
    });

    if (!claim.claimed || !claim.claimId) {
      const outcomes = deriveUnclaimedOutcomes(claim);
      return {
        claimed: false,
        status: claim.status,
        outboxStatus: claim.status,
        providerOutcome: outcomes.providerOutcome,
        outboxFinalized: outcomes.outboxFinalized,
        persistenceOutcome: outcomes.persistenceOutcome,
        message:
          claim.reason === 'ORDER_DELETED'
            ? 'Make webhook skipped because order is being deleted or deleted'
            : claim.reason === 'STORE_UNAVAILABLE' || claim.reason === 'CLAIM_ERROR' || claim.reason === 'NOT_COMMITTED'
              ? 'Make webhook blocked because outbox claim store is unavailable'
              : 'Make webhook already handled or in progress'
      };
    }

    if (!makeWebhookUrl || typeof makeWebhookUrl !== 'string' || !makeWebhookUrl.trim()) {
      const finSkipped = await finalizeOutboxNotification({
        adminDb,
        notificationId,
        claimId: claim.claimId,
        status: 'skipped_not_configured',
        error: null,
        message: 'MAKE_WEBHOOK_URL is not configured',
        extra: {
          providerOutcome: 'skipped',
          persistenceOutcome: 'committed'
        },
        nowMs,
        getNowMs
      });
      if (finSkipped.finalized) {
        return {
          claimed: true,
          status: 'skipped_not_configured',
          outboxStatus: 'skipped_not_configured',
          providerOutcome: 'skipped',
          providerStatus: 'skipped_not_configured',
          outboxFinalized: true,
          persistenceOutcome: 'committed'
        };
      }
      const isDeleted =
        finSkipped.status === 'cancelled_order_deleted' ||
        finSkipped.status === 'unknown_deleted_during_dispatch';
      return {
        claimed: true,
        status: isDeleted ? finSkipped.status! : 'unfinalized',
        outboxStatus: finSkipped.status || 'processing',
        providerOutcome: 'skipped',
        providerStatus: 'skipped_not_configured',
        outboxFinalized: false,
        persistenceOutcome: isDeleted ? 'order_deleted' : 'finalization_failed'
      };
    }

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
    const makeTimer = setTimeout(() => makeController.abort(), timeoutMs);

    let finalStatus: OutboxNotificationStatus = 'failed';
    let finalError: string | null = null;
    let finalMessage: string | null = null;
    let providerOutcome: OutboxProviderOutcome = 'rejected';

    try {
      const response = await Promise.resolve().then(() =>
        fetchFn(makeWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(makePayload),
          signal: makeController.signal
        })
      );

      clearTimeout(makeTimer);

      if (response && response.ok) {
        finalStatus = 'sent';
        providerOutcome = 'accepted';
        finalMessage = `Make webhook accepted (HTTP ${response.status})`;
      } else {
        const httpStatus = response?.status ?? 'UNKNOWN';
        finalStatus = 'failed';
        providerOutcome = 'rejected';
        finalError = sanitizeOutboxErrorCode(`HTTP_${httpStatus}`) || 'NETWORK_ERROR';
        finalMessage = `Make webhook returned HTTP ${httpStatus}`;
      }
    } catch (whErr: any) {
      clearTimeout(makeTimer);
      const errName = String(whErr?.name || '');
      const errMsg = String(whErr?.message || whErr || 'make_webhook_error');
      const isTimeout =
        errName === 'AbortError' ||
        errMsg.toLowerCase().includes('abort') ||
        errMsg.toLowerCase().includes('timeout');

      finalStatus = isTimeout ? 'unknown' : 'failed';
      providerOutcome = isTimeout ? 'timeout' : 'rejected';
      finalError = isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR';
      finalMessage = isTimeout ? 'Make webhook request timed out' : 'Make webhook network error';
      console.error('Make webhook sending failed (resilient):', errMsg);
    }

    const finRes = await finalizeOutboxNotification({
      adminDb,
      notificationId,
      claimId: claim.claimId,
      status: finalStatus,
      error: finalError,
      message: finalMessage,
      extra: {
        providerOutcome,
        persistenceOutcome: 'committed'
      },
      nowMs,
      getNowMs
    });

    if (finRes.finalized) {
      return {
        claimed: true,
        status: finalStatus,
        outboxStatus: finalStatus,
        providerOutcome,
        providerStatus: finalStatus,
        outboxFinalized: true,
        persistenceOutcome: 'committed',
        message: finalMessage || undefined
      };
    }

    const isDeleted =
      finRes.status === 'cancelled_order_deleted' ||
      finRes.status === 'unknown_deleted_during_dispatch';
    const persistenceOutcome: OutboxPersistenceOutcome = isDeleted
      ? 'order_deleted'
      : finRes.reason === 'OWNERSHIP_MISMATCH'
        ? 'ownership_mismatch'
        : 'finalization_failed';

    return {
      claimed: true,
      status: isDeleted ? finRes.status! : 'unfinalized',
      outboxStatus: finRes.status || 'processing',
      providerOutcome,
      providerStatus: finalStatus,
      outboxFinalized: false,
      persistenceOutcome,
      message: isDeleted
        ? 'Order deleted during Make webhook dispatch'
        : 'Make webhook completed but outbox finalization failed'
    };
  } catch (outerErr: any) {
    console.error('[NotificationsOutbox] Unexpected Make outbox error (isolated):', outerErr?.message || outerErr);
    return {
      claimed: false,
      status: 'unavailable',
      outboxStatus: 'unavailable',
      providerOutcome: 'not_attempted',
      outboxFinalized: false,
      persistenceOutcome: 'claim_unavailable',
      message: 'Unexpected Make outbox error'
    };
  }
}

function deriveSafePersistenceOutcome(
  rec: Record<string, any>,
  safeStatus: string
): OutboxPersistenceOutcome {
  if (
    typeof rec.persistenceOutcome === 'string' &&
    RECOGNIZED_PERSISTENCE_OUTCOMES.has(rec.persistenceOutcome)
  ) {
    return rec.persistenceOutcome as OutboxPersistenceOutcome;
  }
  if (safeStatus === 'skipped_intentionally_disabled') return 'intentionally_disabled';
  if (safeStatus === 'cancelled_order_deleted' || safeStatus === 'unknown_deleted_during_dispatch') {
    return 'order_deleted';
  }
  if (
    safeStatus === 'accepted_by_mailapp' ||
    safeStatus === 'sent' ||
    safeStatus === 'failed' ||
    safeStatus === 'unknown' ||
    safeStatus === 'skipped_no_valid_email' ||
    safeStatus === 'skipped_not_configured'
  ) {
    return 'committed';
  }
  if (safeStatus === 'unfinalized') return 'finalization_failed';
  if (safeStatus === 'unavailable') return 'claim_unavailable';
  return 'not_attempted';
}

function deriveSafeProviderOutcome(
  rec: Record<string, any>,
  safeStatus: string
): OutboxProviderOutcome {
  if (
    typeof rec.providerOutcome === 'string' &&
    RECOGNIZED_PROVIDER_OUTCOMES.has(rec.providerOutcome)
  ) {
    return rec.providerOutcome as OutboxProviderOutcome;
  }
  if (safeStatus === 'accepted_by_mailapp' || safeStatus === 'sent') return 'accepted';
  if (safeStatus === 'failed') return 'rejected';
  if (safeStatus === 'unknown') return 'ambiguous';
  if (
    safeStatus === 'skipped_no_valid_email' ||
    safeStatus === 'skipped_not_configured' ||
    safeStatus === 'skipped_intentionally_disabled' ||
    safeStatus === 'cancelled_order_deleted'
  ) {
    return 'skipped';
  }
  return 'not_attempted';
}

/**
 * Strips customer PII, raw provider errors/messages, claim internals, payloads, and token artifacts
 * from an outbox record using strict allowlists before exposing metadata to admin API consumers.
 */
export function sanitizeOutboxRecordForAdmin(
  rec: unknown,
  fallbackRecordKey?: string
): Record<string, any> | null {
  if (!isPlainObject(rec)) return null;

  const rawId = typeof rec.notificationId === 'string' ? rec.notificationId.trim() : '';
  const canonicalId =
    fallbackRecordKey && isValidFirebaseOutboxKey(fallbackRecordKey)
      ? fallbackRecordKey
      : isValidFirebaseOutboxKey(rawId)
        ? rawId
        : '';

  const safeOrderId = isValidFirebaseOutboxKey(rec.orderId, 128) ? rec.orderId : '';
  const safeChannel =
    typeof rec.channel === 'string' && RECOGNIZED_OUTBOX_CHANNELS.has(rec.channel)
      ? rec.channel
      : 'unknown';
  const safeEventType =
    typeof rec.eventType === 'string' && RECOGNIZED_OUTBOX_EVENT_TYPES.has(rec.eventType)
      ? rec.eventType
      : '';
  const safeOrderStatus =
    typeof rec.orderStatus === 'string' && RECOGNIZED_ORDER_STATUSES.has(rec.orderStatus)
      ? rec.orderStatus
      : undefined;
  const safeStatus =
    typeof rec.status === 'string' && RECOGNIZED_OUTBOX_STATUSES.has(rec.status)
      ? rec.status
      : 'unknown';

  const parsedAttempts = Number(rec.attempts);
  const safeAttempts = Number.isFinite(parsedAttempts)
    ? Math.min(1000, Math.max(0, Math.trunc(parsedAttempts)))
    : 0;

  const safeDiagnosticCode =
    typeof rec.staleDiagnosticCode === 'string' &&
    SAFE_OUTBOX_DIAGNOSTIC_CODES.has(rec.staleDiagnosticCode)
      ? rec.staleDiagnosticCode
      : null;

  const safeError = sanitizeOutboxErrorCode(rec.error);
  const identityMismatch =
    Boolean(fallbackRecordKey && rawId && isValidFirebaseOutboxKey(fallbackRecordKey) && rawId !== fallbackRecordKey);

  const persistenceOutcome = identityMismatch
    ? 'identity_mismatch'
    : deriveSafePersistenceOutcome(rec, safeStatus);
  const providerOutcome = deriveSafeProviderOutcome(rec, safeStatus);
  const outboxFinalized =
    typeof rec.outboxFinalized === 'boolean'
      ? rec.outboxFinalized
      : persistenceOutcome === 'committed';

  return {
    notificationId: canonicalId,
    orderId: safeOrderId,
    channel: safeChannel,
    eventType: safeEventType,
    ...(safeOrderStatus !== undefined ? { orderStatus: safeOrderStatus } : {}),
    status: safeStatus,
    attempts: safeAttempts,
    createdAt: sanitizeOutboxIsoTimestamp(rec.createdAt),
    lastAttemptAt: sanitizeOutboxIsoTimestamp(rec.lastAttemptAt),
    processingStartedAt: sanitizeOutboxIsoTimestamp(rec.processingStartedAt),
    processingLeaseExpiresAt: sanitizeOutboxIsoTimestamp(rec.processingLeaseExpiresAt),
    staleProcessingDetectedAt: sanitizeOutboxIsoTimestamp(rec.staleProcessingDetectedAt),
    staleDiagnosticCode: safeDiagnosticCode,
    manualReviewRequired: Boolean(rec.manualReviewRequired) || identityMismatch || safeStatus === 'unfinalized',
    error: identityMismatch && !safeError ? 'INVALID_NOTIFICATION_IDENTITY' : safeError,
    providerOutcome,
    persistenceOutcome,
    outboxFinalized
  };
}
