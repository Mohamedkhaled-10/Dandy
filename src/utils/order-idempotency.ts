// src/utils/order-idempotency.ts
import crypto from 'node:crypto';
import { normalizeEgyptianPhone } from './phone.ts';
import {
  decryptInvoiceToken,
  getOrCreateInvoiceToken,
  isValidInvoiceTokenFormat
} from './invoice-token.ts';

export const DEFAULT_IDEMPOTENCY_LEASE_MS = 30_000;
export const DEFAULT_COMMIT_LEASE_MS = 30_000;
export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_COMMIT_PAYLOAD_BYTES = 128 * 1024; // 128 KiB safety ceiling

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OrderIdempotencyStatus =
  | 'PENDING'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DELETING'
  | 'DELETED';

export interface OrderResponseSummary {
  orderId: string;
  invoiceCode: string;
  subtotal: number;
  couponCode?: string;
  couponDiscountAmount?: number;
  shippingFee: number;
  totalAmount: number;
}

export interface SealedCommitPayload {
  orderId: string;
  invoiceCode: string;
  orderData: Record<string, any>;
  orderAccessRecord: Record<string, any>;
  invoiceAccessRecord: Record<string, any>;
  outboxRecords: Record<string, Record<string, any>>;
}

export interface OrderIdempotencyRecord {
  requestKeyHash: string;
  requestFingerprint: string;
  status: OrderIdempotencyStatus;
  reservedOrderId: string;
  attemptId: string;
  createdAt: string;
  updatedAt: string;
  leaseExpiresAt: string;
  expiresAt: string;
  commitId?: string;
  committingAt?: string;
  committingLeaseExpiresAt?: string;
  commitPayloadSizeBytes?: number;
  commitPayload?: SealedCommitPayload;
  completedAt?: string;
  failedAt?: string;
  deletingAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  lastErrorCode?: string;
  responseSummary?: OrderResponseSummary;
}

export interface IdempotencyLockHandle {
  requestKeyHash: string;
  requestFingerprint: string;
  reservedOrderId: string;
  attemptId: string;
  leaseExpiresAtMs: number;
  expiresAtMs: number;
  createdAt: string;
}

export type AcquireIdempotencyOutcome =
  | {
      outcome: 'ACQUIRED';
      lock: IdempotencyLockHandle;
    }
  | {
      outcome: 'RECOVER_COMMITTING';
      record: OrderIdempotencyRecord;
    }
  | {
      outcome: 'COMPLETED';
      record: OrderIdempotencyRecord;
    }
  | {
      outcome: 'CONFLICT';
      record: OrderIdempotencyRecord;
    }
  | {
      outcome: 'EXPIRED';
      record: OrderIdempotencyRecord;
    }
  | {
      outcome: 'DELETED';
      record: OrderIdempotencyRecord;
    }
  | {
      outcome: 'IN_PROGRESS';
      retryAfterSeconds: number;
      record: OrderIdempotencyRecord;
    };

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Validates strict UUID v4 format for clientRequestId.
 */
export function isValidUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_REGEX.test(value.trim());
}

/**
 * Computes SHA-256 hex digest of a UUID v4 clientRequestId.
 * Never store or log the raw clientRequestId.
 */
export function hashClientRequestId(clientRequestId: string): string {
  return crypto
    .createHash('sha256')
    .update(clientRequestId.trim().toLowerCase(), 'utf8')
    .digest('hex');
}

/**
 * Deterministically canonicalizes arbitrary JSON-compatible values by sorting object keys.
 */
export function canonicalizeJsonValue(val: unknown): any {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeJsonValue(item));
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();
    for (const k of keys) {
      const v = (val as Record<string, unknown>)[k];
      if (v !== undefined) {
        out[k] = canonicalizeJsonValue(v);
      }
    }
    return out;
  }
  if (typeof val === 'number' && !Number.isFinite(val)) {
    return null;
  }
  return val;
}

function canonicalizeSelectedVariantsForFingerprint(raw: unknown[]): any[] {
  const canonicalEntries = raw.map((entry) => canonicalizeJsonValue(entry));
  canonicalEntries.sort((a, b) => {
    const aKey =
      isPlainObject(a) && typeof a.id === 'string' && a.id.trim()
        ? a.id.trim()
        : isPlainObject(a) && typeof a.name === 'string' && a.name.trim()
          ? a.name.trim()
          : JSON.stringify(a);
    const bKey =
      isPlainObject(b) && typeof b.id === 'string' && b.id.trim()
        ? b.id.trim()
        : isPlainObject(b) && typeof b.name === 'string' && b.name.trim()
          ? b.name.trim()
          : JSON.stringify(b);
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    const aJson = JSON.stringify(a);
    const bJson = JSON.stringify(b);
    return aJson < bJson ? -1 : aJson > bJson ? 1 : 0;
  });
  return canonicalEntries;
}

function canonicalizeItemForFingerprint(item: any): Record<string, any> {
  if (!isPlainObject(item)) return {};
  const {
    timestamp: _ts,
    turnstileToken: _tt,
    ...rest
  } = item;
  const canonicalized = canonicalizeJsonValue(rest);
  if (Array.isArray(rest.selectedVariants)) {
    canonicalized.selectedVariants = canonicalizeSelectedVariantsForFingerprint(
      rest.selectedVariants
    );
  }
  return canonicalized;
}

/**
 * Computes deterministic SHA-256 fingerprint of an order request payload.
 * Excludes transient auth/captcha/timestamp tokens (`turnstileToken`, `idToken`, `clientRequestId`).
 */
export function computeOrderRequestFingerprint(input: {
  name: string;
  phone: string;
  email: string;
  governorate: string;
  city: string;
  address: string;
  customerId: string | null;
  items: any[];
  couponCode?: string | null;
}): string {
  const normalizedPhone = normalizeEgyptianPhone(input.phone) || input.phone.trim();
  const normalizedEmail =
    input.email && input.email !== 'N/A' ? input.email.trim().toLowerCase() : 'n/a';
  const normalizedCouponCode =
    typeof input.couponCode === 'string' && input.couponCode.trim()
      ? input.couponCode.trim().toUpperCase()
      : null;

  const canonicalPayload = canonicalizeJsonValue({
    name: input.name.trim(),
    phone: normalizedPhone,
    email: normalizedEmail,
    governorate: input.governorate.trim(),
    city: input.city.trim(),
    address: input.address.trim(),
    customerId: input.customerId || null,
    couponCode: normalizedCouponCode,
    items: Array.isArray(input.items) ? input.items.map(canonicalizeItemForFingerprint) : []
  });

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalPayload), 'utf8')
    .digest('hex');
}

function extractCouponSummaryFields(orderData: any): {
  couponCode?: string;
  couponDiscountAmount?: number;
} {
  if (!isPlainObject(orderData) || !isPlainObject(orderData.coupon)) {
    return {};
  }
  const code =
    typeof orderData.coupon.code === 'string' ? orderData.coupon.code.trim().toUpperCase() : '';
  const discountAmount = Number(orderData.coupon.discountAmount);
  if (!code || !Number.isFinite(discountAmount) || discountAmount <= 0) {
    return {};
  }
  return {
    couponCode: code,
    couponDiscountAmount: Math.round((discountAmount + Number.EPSILON) * 100) / 100
  };
}

function allocateOrderId(adminDb: any): string {
  try {
    const pushed = adminDb.ref('orders').push();
    if (pushed && typeof pushed.key === 'string' && pushed.key.trim()) {
      return pushed.key.trim();
    }
  } catch {
    // fallback below
  }
  return `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

async function promoteExistingOrderToCompleted(params: {
  idemRef: any;
  orderId: string;
  orderData: Record<string, any>;
  requestKeyHash: string;
  requestFingerprint: string;
  nowIso: string;
  ttlMs: number;
}): Promise<OrderIdempotencyRecord | null> {
  const {
    idemRef,
    orderId,
    orderData,
    requestKeyHash,
    requestFingerprint,
    nowIso,
    ttlMs
  } = params;

  const expiresAtIso = new Date(Date.now() + ttlMs).toISOString();
  const summary: OrderResponseSummary = {
    orderId,
    invoiceCode:
      typeof orderData.invoiceCode === 'string' && orderData.invoiceCode.trim()
        ? orderData.invoiceCode
        : `DNY-${orderId.slice(-6)}`,
    subtotal: Number(orderData.subtotal) || 0,
    ...extractCouponSummaryFields(orderData),
    shippingFee: Number(orderData.shippingFee) || 0,
    totalAmount: Number(orderData.totalAmount) || 0
  };

  const tx = await idemRef.transaction((current: any) => {
    if (
      isPlainObject(current) &&
      (current.status === 'DELETED' || current.status === 'DELETING')
    ) {
      return undefined;
    }
    if (isPlainObject(current) && current.status === 'COMPLETED') {
      return current;
    }
    if (isPlainObject(current) && current.status === 'COMMITTING') {
      return undefined;
    }
    if (
      isPlainObject(current) &&
      current.reservedOrderId &&
      current.reservedOrderId !== orderId
    ) {
      return undefined;
    }
    return {
      requestKeyHash,
      requestFingerprint: current?.requestFingerprint || requestFingerprint,
      status: 'COMPLETED',
      reservedOrderId: orderId,
      attemptId: current?.attemptId || crypto.randomUUID(),
      createdAt: current?.createdAt || orderData.timestamp || nowIso,
      updatedAt: nowIso,
      completedAt: nowIso,
      leaseExpiresAt: nowIso,
      expiresAt: current?.expiresAt || expiresAtIso,
      responseSummary: summary
    };
  });

  const val = tx?.snapshot?.val?.();
  return isPlainObject(val) ? (val as OrderIdempotencyRecord) : null;
}

function classifyExistingRecord(
  record: OrderIdempotencyRecord,
  requestFingerprint: string,
  nowMs: number
): Exclude<AcquireIdempotencyOutcome, { outcome: 'ACQUIRED' | 'RECOVER_COMMITTING' }> | null {
  if (record.status === 'DELETED' || record.status === 'DELETING') {
    return { outcome: 'DELETED', record };
  }

  if (record.requestFingerprint !== requestFingerprint) {
    return { outcome: 'CONFLICT', record };
  }

  if (record.status === 'COMPLETED') {
    const expiresAtMs = Date.parse(record.expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      return { outcome: 'EXPIRED', record };
    }
    return { outcome: 'COMPLETED', record };
  }

  if (record.status === 'PENDING') {
    const leaseMs = Date.parse(record.leaseExpiresAt);
    if (Number.isFinite(leaseMs) && leaseMs > nowMs) {
      return {
        outcome: 'IN_PROGRESS',
        retryAfterSeconds: Math.max(1, Math.ceil((leaseMs - nowMs) / 1000)),
        record
      };
    }
  }

  if (record.status === 'COMMITTING') {
    const commitLeaseMs = Date.parse(record.committingLeaseExpiresAt || record.leaseExpiresAt);
    if (Number.isFinite(commitLeaseMs) && commitLeaseMs > nowMs) {
      return {
        outcome: 'IN_PROGRESS',
        retryAfterSeconds: Math.max(1, Math.ceil((commitLeaseMs - nowMs) / 1000)),
        record
      };
    }
  }

  return null;
}

/**
 * Acquires an atomic PENDING idempotency lock in `privateOrderIdempotency/{requestKeyHash}`,
 * or recovers an expired COMMITTING record without ever inventing new tokens/orderIds.
 */
export async function acquireOrderIdempotencyLock(params: {
  clientRequestId: string;
  requestFingerprint: string;
  adminDb: any;
  leaseMs?: number;
  commitLeaseMs?: number;
  ttlMs?: number;
  nowMs?: number;
}): Promise<AcquireIdempotencyOutcome> {
  const {
    clientRequestId,
    requestFingerprint,
    adminDb,
    leaseMs = DEFAULT_IDEMPOTENCY_LEASE_MS,
    commitLeaseMs = DEFAULT_COMMIT_LEASE_MS,
    ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
    nowMs = Date.now()
  } = params;

  const requestKeyHash = hashClientRequestId(clientRequestId);
  const idemRef = adminDb.ref(`privateOrderIdempotency/${requestKeyHash}`);
  const attemptId = crypto.randomUUID();
  const candidateOrderId = allocateOrderId(adminDb);
  const nowIso = new Date(nowMs).toISOString();
  const leaseExpiresAtMs = nowMs + leaseMs;
  const expiresAtMs = nowMs + ttlMs;
  const leaseExpiresAt = new Date(leaseExpiresAtMs).toISOString();
  const expiresAt = new Date(expiresAtMs).toISOString();

  // Phase 1: Atomic acquisition for new record or retry after FAILED
  const tx1 = await idemRef.transaction((current: any) => {
    if (!current || !isPlainObject(current)) {
      return {
        requestKeyHash,
        requestFingerprint,
        status: 'PENDING',
        reservedOrderId: candidateOrderId,
        attemptId,
        createdAt: nowIso,
        updatedAt: nowIso,
        leaseExpiresAt,
        expiresAt
      } satisfies OrderIdempotencyRecord;
    }

    if (current.status === 'FAILED' && current.requestFingerprint === requestFingerprint) {
      return {
        requestKeyHash,
        requestFingerprint,
        status: 'PENDING',
        reservedOrderId:
          typeof current.reservedOrderId === 'string' && current.reservedOrderId.trim()
            ? current.reservedOrderId
            : candidateOrderId,
        attemptId,
        createdAt: current.createdAt || nowIso,
        updatedAt: nowIso,
        leaseExpiresAt,
        expiresAt
      } satisfies OrderIdempotencyRecord;
    }

    // Abort write without modifying DELETED, DELETING, COMPLETED, COMMITTING, or existing PENDING
    return undefined;
  });

  const snap1 = tx1?.snapshot?.val?.() as OrderIdempotencyRecord | null;
  if (isPlainObject(snap1) && snap1.status === 'PENDING' && snap1.attemptId === attemptId) {
    return {
      outcome: 'ACQUIRED',
      lock: {
        requestKeyHash,
        requestFingerprint,
        reservedOrderId: snap1.reservedOrderId,
        attemptId,
        leaseExpiresAtMs: Date.parse(snap1.leaseExpiresAt),
        expiresAtMs: Date.parse(snap1.expiresAt),
        createdAt: snap1.createdAt
      }
    };
  }

  if (isPlainObject(snap1)) {
    const classified = classifyExistingRecord(snap1, requestFingerprint, nowMs);
    if (classified) {
      return classified;
    }

    // Expired COMMITTING record: atomically take recovery lease preserving EXACT commitId & commitPayload
    if (snap1.status === 'COMMITTING') {
      const recoveryAttemptId = crypto.randomUUID();
      const recoveryNowMs = Date.now();
      const recoveryNowIso = new Date(recoveryNowMs).toISOString();
      const recoveryLeaseIso = new Date(recoveryNowMs + commitLeaseMs).toISOString();

      const txRecoverCommit = await idemRef.transaction((current: any) => {
        if (!isPlainObject(current)) return undefined;
        if (current.requestFingerprint !== requestFingerprint) return undefined;
        if (current.status !== 'COMMITTING') return undefined;

        const curCommitLease = Date.parse(current.committingLeaseExpiresAt || current.leaseExpiresAt);
        if (Number.isFinite(curCommitLease) && curCommitLease > recoveryNowMs) {
          return undefined;
        }

        return {
          ...current,
          attemptId: recoveryAttemptId,
          updatedAt: recoveryNowIso,
          committingLeaseExpiresAt: recoveryLeaseIso
        } satisfies OrderIdempotencyRecord;
      });

      const snapRecover = txRecoverCommit?.snapshot?.val?.() as OrderIdempotencyRecord | null;
      if (
        isPlainObject(snapRecover) &&
        snapRecover.status === 'COMMITTING' &&
        snapRecover.attemptId === recoveryAttemptId &&
        isPlainObject(snapRecover.commitPayload)
      ) {
        return {
          outcome: 'RECOVER_COMMITTING',
          record: snapRecover
        };
      }

      if (isPlainObject(snapRecover)) {
        const reClassified = classifyExistingRecord(snapRecover, requestFingerprint, Date.now());
        if (reClassified) return reClassified;
      }
    }

    // Stale PENDING lock (lease expired): perform crash recovery check before taking over
    if (snap1.status === 'PENDING' && snap1.reservedOrderId) {
      const existingOrderSnap = await adminDb.ref(`orders/${snap1.reservedOrderId}`).once('value');
      const existingOrder = existingOrderSnap.val();
      if (isPlainObject(existingOrder)) {
        const promoted = await promoteExistingOrderToCompleted({
          idemRef,
          orderId: snap1.reservedOrderId,
          orderData: existingOrder,
          requestKeyHash,
          requestFingerprint,
          nowIso,
          ttlMs
        });
        if (promoted && promoted.status === 'COMPLETED') {
          const classifiedPromoted = classifyExistingRecord(promoted, requestFingerprint, nowMs);
          if (classifiedPromoted) return classifiedPromoted;
          return { outcome: 'COMPLETED', record: promoted };
        }
      }

      // Order was NOT persisted before crash -> atomic conditional stale lease takeover
      const takeoverAttemptId = crypto.randomUUID();
      const takeoverNowMs = Date.now();
      const takeoverNowIso = new Date(takeoverNowMs).toISOString();
      const takeoverLeaseIso = new Date(takeoverNowMs + leaseMs).toISOString();
      const takeoverExpiresIso = new Date(takeoverNowMs + ttlMs).toISOString();

      const txTakeover = await idemRef.transaction((current: any) => {
        if (!isPlainObject(current)) return undefined;
        if (current.requestFingerprint !== requestFingerprint) return undefined;
        // CRITICAL: Never take over COMMITTING or COMPLETED
        if (current.status !== 'PENDING' && current.status !== 'FAILED') return undefined;

        const curLease = Date.parse(current.leaseExpiresAt);
        if (current.status === 'PENDING' && Number.isFinite(curLease) && curLease > takeoverNowMs) {
          return undefined;
        }

        return {
          requestKeyHash,
          requestFingerprint,
          status: 'PENDING',
          reservedOrderId: current.reservedOrderId || snap1.reservedOrderId,
          attemptId: takeoverAttemptId,
          createdAt: current.createdAt || takeoverNowIso,
          updatedAt: takeoverNowIso,
          leaseExpiresAt: takeoverLeaseIso,
          expiresAt: takeoverExpiresIso
        } satisfies OrderIdempotencyRecord;
      });

      const snapTakeover = txTakeover?.snapshot?.val?.() as OrderIdempotencyRecord | null;
      if (
        isPlainObject(snapTakeover) &&
        snapTakeover.status === 'PENDING' &&
        snapTakeover.attemptId === takeoverAttemptId
      ) {
        return {
          outcome: 'ACQUIRED',
          lock: {
            requestKeyHash,
            requestFingerprint,
            reservedOrderId: snapTakeover.reservedOrderId,
            attemptId: takeoverAttemptId,
            leaseExpiresAtMs: Date.parse(snapTakeover.leaseExpiresAt),
            expiresAtMs: Date.parse(snapTakeover.expiresAt),
            createdAt: snapTakeover.createdAt
          }
        };
      }

      if (isPlainObject(snapTakeover)) {
        const reClassified = classifyExistingRecord(snapTakeover, requestFingerprint, Date.now());
        if (reClassified) return reClassified;
      }
    }
  }

  // Defensive fallback: another request changed state right between calls
  const latestSnap = (await idemRef.once('value')).val() as OrderIdempotencyRecord | null;
  if (isPlainObject(latestSnap)) {
    const classified = classifyExistingRecord(latestSnap, requestFingerprint, Date.now());
    if (classified) return classified;
  }

  return {
    outcome: 'IN_PROGRESS',
    retryAfterSeconds: Math.max(1, Math.ceil(leaseMs / 1000)),
    record: {
      requestKeyHash,
      requestFingerprint,
      status: 'PENDING',
      reservedOrderId: candidateOrderId,
      attemptId,
      createdAt: nowIso,
      updatedAt: nowIso,
      leaseExpiresAt,
      expiresAt
    }
  };
}

/**
 * Atomic single-node RTDB Commit-Fencing Transaction (`PENDING -> COMMITTING`).
 * Seals one immutable `commitPayload` (AES-256-GCM encrypted token only, bounded size)
 * inside `privateOrderIdempotency/{requestKeyHash}` BEFORE writing `orders/` or access records.
 * Eliminates the TOCTOU window between ownership check and multi-path write.
 */
export async function transitionPendingToCommitting(params: {
  lock: IdempotencyLockHandle;
  sealedPayload: SealedCommitPayload;
  adminDb: any;
  commitLeaseMs?: number;
  nowMs?: number;
  maxPayloadBytes?: number;
}): Promise<
  | {
      committed: true;
      commitId: string;
      record: OrderIdempotencyRecord;
    }
  | {
      committed: false;
      reason:
        | 'PAYLOAD_TOO_LARGE'
        | 'INVALID_SEALED_PAYLOAD'
        | 'CONFLICT'
        | 'ALREADY_COMPLETED'
        | 'ALREADY_COMMITTING'
        | 'LOST_OWNERSHIP';
      record?: OrderIdempotencyRecord | null;
    }
> {
  const {
    lock,
    sealedPayload,
    adminDb,
    commitLeaseMs = DEFAULT_COMMIT_LEASE_MS,
    nowMs = Date.now(),
    maxPayloadBytes = MAX_COMMIT_PAYLOAD_BYTES
  } = params;

  // Enforce strict invariant: NEVER store plaintext token inside commitPayload
  if (
    !sealedPayload ||
    !isPlainObject(sealedPayload.orderAccessRecord) ||
    'token' in sealedPayload.orderAccessRecord ||
    !isPlainObject(sealedPayload.orderAccessRecord.encryptedToken)
  ) {
    return { committed: false, reason: 'INVALID_SEALED_PAYLOAD', record: null };
  }

  const payloadSizeBytes = Buffer.byteLength(JSON.stringify(sealedPayload), 'utf8');
  if (payloadSizeBytes > maxPayloadBytes) {
    return { committed: false, reason: 'PAYLOAD_TOO_LARGE', record: null };
  }

  const idemRef = adminDb.ref(`privateOrderIdempotency/${lock.requestKeyHash}`);
  const commitId = crypto.randomUUID();
  const nowIso = new Date(nowMs).toISOString();
  const commitLeaseExpiresAt = new Date(nowMs + commitLeaseMs).toISOString();

  const tx = await idemRef.transaction((current: any) => {
    if (!isPlainObject(current)) return undefined;
    if (current.status !== 'PENDING') return undefined;
    if (current.attemptId !== lock.attemptId) return undefined;
    if (current.requestFingerprint !== lock.requestFingerprint) return undefined;
    if (current.reservedOrderId !== lock.reservedOrderId) return undefined;

    return {
      ...current,
      status: 'COMMITTING',
      commitId,
      committingAt: nowIso,
      updatedAt: nowIso,
      committingLeaseExpiresAt: commitLeaseExpiresAt,
      commitPayloadSizeBytes: payloadSizeBytes,
      commitPayload: sealedPayload
    } satisfies OrderIdempotencyRecord;
  });

  const snap = tx?.snapshot?.val?.() as OrderIdempotencyRecord | null;

  if (
    tx?.committed &&
    isPlainObject(snap) &&
    snap.status === 'COMMITTING' &&
    snap.commitId === commitId &&
    snap.attemptId === lock.attemptId
  ) {
    return {
      committed: true,
      commitId,
      record: snap
    };
  }

  if (!isPlainObject(snap)) {
    return { committed: false, reason: 'LOST_OWNERSHIP', record: null };
  }
  if (snap.requestFingerprint !== lock.requestFingerprint) {
    return { committed: false, reason: 'CONFLICT', record: snap };
  }
  if (snap.status === 'COMPLETED') {
    return { committed: false, reason: 'ALREADY_COMPLETED', record: snap };
  }
  if (snap.status === 'COMMITTING') {
    return { committed: false, reason: 'ALREADY_COMMITTING', record: snap };
  }
  return { committed: false, reason: 'LOST_OWNERSHIP', record: snap };
}

/**
 * Deterministically materializes an authoritative `COMMITTING` record's `commitPayload`
 * to `orders/{orderId}`, `privateOrderAccess/{orderId}`, `privateInvoiceAccess/{tokenHash}`,
 * and `notifications_outbox/*`, then reads back to verify full integrity before `COMPLETED`.
 */
export async function materializeCommitPayload(params: {
  commitRecord: OrderIdempotencyRecord;
  adminDb: any;
  hooks?: {
    beforeVerify?: (ctx: { commitRecord: OrderIdempotencyRecord; adminDb: any }) => Promise<void> | void;
  };
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { commitRecord, adminDb, hooks } = params;
  const payload = commitRecord?.commitPayload;

  if (
    !commitRecord ||
    commitRecord.status !== 'COMMITTING' ||
    !isPlainObject(payload) ||
    !payload.orderId ||
    !isPlainObject(payload.orderData) ||
    !isPlainObject(payload.orderAccessRecord) ||
    !isPlainObject(payload.invoiceAccessRecord) ||
    !isPlainObject(payload.outboxRecords)
  ) {
    return { ok: false, reason: 'MISSING_COMMIT_PAYLOAD' };
  }

  const orderId = payload.orderId;
  const expectedTokenHash = String(payload.invoiceAccessRecord.tokenHash || '');
  if (!expectedTokenHash || payload.orderAccessRecord.tokenHash !== expectedTokenHash) {
    return { ok: false, reason: 'INVALID_ACCESS_RECORD_IN_COMMIT_PAYLOAD' };
  }

  const outboxIds = Object.keys(payload.outboxRecords);
  const confirmationOutboxId = `notif_order_${orderId}_confirmation`;

  try {
    // 0. Check administrative deletion tombstone BEFORE materializing any records
    const deletedOrderSnap = await adminDb.ref(`privateDeletedOrders/${orderId}`).once('value');
    const deletedOrderRec = deletedOrderSnap.val();
    if (
      isPlainObject(deletedOrderRec) &&
      (deletedOrderRec.status === 'DELETED' || deletedOrderRec.status === 'DELETING')
    ) {
      return { ok: false, reason: 'ORDER_ADMINISTRATIVELY_DELETED' };
    }

    // 1. Inspect current state to avoid clobbering already-processed outbox records or hiding mismatches
    const [existingOrderSnap, existingOrderAccessSnap, existingInvAccessSnap, ...existingOutboxSnaps] =
      await Promise.all([
        adminDb.ref(`orders/${orderId}`).once('value'),
        adminDb.ref(`privateOrderAccess/${orderId}`).once('value'),
        adminDb.ref(`privateInvoiceAccess/${expectedTokenHash}`).once('value'),
        ...outboxIds.map((nid) => adminDb.ref(`notifications_outbox/${nid}`).once('value'))
      ]);

    const existingOrder = existingOrderSnap.val();
    const existingOrderAccess = existingOrderAccessSnap.val();
    const existingInvAccess = existingInvAccessSnap.val();

    if (
      (isPlainObject(existingOrderAccess) && existingOrderAccess.status === 'revoked') ||
      (isPlainObject(existingInvAccess) && existingInvAccess.status === 'revoked')
    ) {
      return { ok: false, reason: 'ORDER_ADMINISTRATIVELY_DELETED' };
    }

    if (
      isPlainObject(existingOrder) &&
      (existingOrder.invoiceCode !== payload.invoiceCode ||
        Number(existingOrder.totalAmount) !== Number(payload.orderData.totalAmount))
    ) {
      return { ok: false, reason: 'ORDER_INTEGRITY_MISMATCH' };
    }
    if (
      isPlainObject(existingOrderAccess) &&
      (existingOrderAccess.tokenHash !== expectedTokenHash ||
        existingOrderAccess.orderId !== orderId)
    ) {
      return { ok: false, reason: 'ORDER_ACCESS_INTEGRITY_MISMATCH' };
    }
    if (
      isPlainObject(existingInvAccess) &&
      (existingInvAccess.tokenHash !== expectedTokenHash ||
        existingInvAccess.orderId !== orderId)
    ) {
      return { ok: false, reason: 'INVOICE_ACCESS_INTEGRITY_MISMATCH' };
    }

    // 2. Build idempotent materialization update set
    const materializeUpdates: Record<string, any> = {};
    if (!isPlainObject(existingOrder)) {
      materializeUpdates[`orders/${orderId}`] = payload.orderData;
    }
    if (!isPlainObject(existingOrderAccess)) {
      materializeUpdates[`privateOrderAccess/${orderId}`] = payload.orderAccessRecord;
    }
    if (!isPlainObject(existingInvAccess)) {
      materializeUpdates[`privateInvoiceAccess/${expectedTokenHash}`] = payload.invoiceAccessRecord;
    }

    for (let i = 0; i < outboxIds.length; i++) {
      const nid = outboxIds[i];
      const existingOutbox = existingOutboxSnaps[i]?.val?.();
      if (!isPlainObject(existingOutbox)) {
        materializeUpdates[`notifications_outbox/${nid}`] = payload.outboxRecords[nid];
      }
    }

    if (Object.keys(materializeUpdates).length > 0) {
      await adminDb.ref().update(materializeUpdates);
    }

    if (typeof hooks?.beforeVerify === 'function') {
      await hooks.beforeVerify({ commitRecord, adminDb });
    }

    // 3. Read back & verify full consistency before allowing COMPLETED transition
    const [verOrderSnap, verOrderAccessSnap, verInvAccessSnap, verConfOutboxSnap] = await Promise.all([
      adminDb.ref(`orders/${orderId}`).once('value'),
      adminDb.ref(`privateOrderAccess/${orderId}`).once('value'),
      adminDb.ref(`privateInvoiceAccess/${expectedTokenHash}`).once('value'),
      adminDb.ref(`notifications_outbox/${confirmationOutboxId}`).once('value')
    ]);

    const verOrder = verOrderSnap.val();
    const verOrderAccess = verOrderAccessSnap.val();
    const verInvAccess = verInvAccessSnap.val();
    const verConfOutbox = verConfOutboxSnap.val();

    if (!isPlainObject(verOrder) || verOrder.invoiceCode !== payload.invoiceCode) {
      return { ok: false, reason: 'ORDER_VERIFICATION_FAILED' };
    }
    if (
      !isPlainObject(verOrderAccess) ||
      verOrderAccess.tokenHash !== expectedTokenHash ||
      verOrderAccess.orderId !== orderId ||
      'token' in verOrderAccess ||
      !isPlainObject(verOrderAccess.encryptedToken)
    ) {
      return { ok: false, reason: 'ORDER_ACCESS_VERIFICATION_FAILED' };
    }
    if (
      !isPlainObject(verInvAccess) ||
      verInvAccess.tokenHash !== expectedTokenHash ||
      verInvAccess.orderId !== orderId ||
      verInvAccess.status !== 'active'
    ) {
      return { ok: false, reason: 'INVOICE_ACCESS_VERIFICATION_FAILED' };
    }
    if (!isPlainObject(verConfOutbox) || verConfOutbox.orderId !== orderId) {
      return { ok: false, reason: 'OUTBOX_VERIFICATION_FAILED' };
    }

    return { ok: true };
  } catch (err: any) {
    console.error(
      `[OrderIdempotency] Materialization error for ${orderId}:`,
      err?.code || err?.message || 'materialize_error'
    );
    return { ok: false, reason: err?.code || 'MATERIALIZE_WRITE_FAILED' };
  }
}

/**
 * Atomic single-node RTDB transaction (`COMMITTING -> COMPLETED`):
 * - Guards on `status === 'COMMITTING' && commitId === expectedCommitId`.
 * - Removes temporary PII `commitPayload` & `commitPayloadSizeBytes` from `privateOrderIdempotency`.
 * - Keeps minimal safe `responseSummary`.
 */
export async function transitionCommittingToCompleted(params: {
  requestKeyHash: string;
  commitId: string;
  adminDb: any;
  ttlMs?: number;
  nowMs?: number;
}): Promise<
  | { ok: true; record: OrderIdempotencyRecord; alreadyCompletedByRecovery: boolean }
  | { ok: false; reason: string; record: OrderIdempotencyRecord | null }
> {
  const {
    requestKeyHash,
    commitId,
    adminDb,
    ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
    nowMs = Date.now()
  } = params;

  const idemRef = adminDb.ref(`privateOrderIdempotency/${requestKeyHash}`);
  const nowIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(nowMs + ttlMs).toISOString();

  let wasAlreadyCompleted = false;

  const tx = await idemRef.transaction((current: any) => {
    wasAlreadyCompleted = false;
    if (!isPlainObject(current)) return undefined;

    if (current.status === 'COMPLETED' && current.commitId === commitId) {
      wasAlreadyCompleted = true;
      return current;
    }

    if (current.status !== 'COMMITTING' || current.commitId !== commitId) {
      return undefined;
    }

    const payload = current.commitPayload;
    const summary: OrderResponseSummary = isPlainObject(payload?.orderData)
      ? {
          orderId: payload.orderId || current.reservedOrderId,
          invoiceCode: payload.invoiceCode || payload.orderData.invoiceCode,
          subtotal: Number(payload.orderData.subtotal) || 0,
          ...extractCouponSummaryFields(payload.orderData),
          shippingFee: Number(payload.orderData.shippingFee) || 0,
          totalAmount: Number(payload.orderData.totalAmount) || 0
        }
      : (current.responseSummary || {
          orderId: current.reservedOrderId,
          invoiceCode: `DNY-${String(current.reservedOrderId || '').slice(-6)}`,
          subtotal: 0,
          shippingFee: 0,
          totalAmount: 0
        });

    const {
      commitPayload: _stripPayload,
      commitPayloadSizeBytes: _stripSize,
      committingLeaseExpiresAt: _stripCommitLease,
      ...rest
    } = current;

    return {
      ...rest,
      requestKeyHash: current.requestKeyHash || requestKeyHash,
      requestFingerprint: current.requestFingerprint,
      status: 'COMPLETED',
      reservedOrderId: current.reservedOrderId,
      attemptId: current.attemptId,
      commitId,
      createdAt: current.createdAt || nowIso,
      updatedAt: nowIso,
      completedAt: nowIso,
      leaseExpiresAt: nowIso,
      expiresAt: current.expiresAt || expiresAtIso,
      responseSummary: summary
    } satisfies OrderIdempotencyRecord;
  });

  const snap = tx?.snapshot?.val?.() as OrderIdempotencyRecord | null;
  if (isPlainObject(snap) && snap.status === 'COMPLETED' && snap.commitId === commitId) {
    return {
      ok: true,
      record: snap,
      alreadyCompletedByRecovery: wasAlreadyCompleted
    };
  }

  return {
    ok: false,
    reason: snap?.status === 'COMMITTING' ? 'COMMIT_ID_MISMATCH' : `UNEXPECTED_STATUS_${snap?.status || 'NONE'}`,
    record: snap
  };
}

/**
 * Safely reconciles an owned PENDING lock after a pre-commit validation/pricing error:
 * - Re-reads `orders/{reservedOrderId}` first; if persisted, promotes to COMPLETED instead of FAILED.
 * - NEVER downgrades COMMITTING or COMPLETED to FAILED!
 * - Conditionally transitions PENDING -> FAILED ONLY if `attemptId` still matches.
 */
export async function reconcileIdempotencyAfterFailure(params: {
  lock: IdempotencyLockHandle | null;
  adminDb: any;
  errorCode: string;
}): Promise<void> {
  const { lock, adminDb, errorCode } = params;
  if (!lock || !adminDb || typeof adminDb.ref !== 'function') return;

  try {
    const idemRef = adminDb.ref(`privateOrderIdempotency/${lock.requestKeyHash}`);
    const currentIdemSnap = await idemRef.once('value');
    const currentIdem = currentIdemSnap.val();
    if (
      isPlainObject(currentIdem) &&
      (currentIdem.status === 'COMMITTING' ||
        currentIdem.status === 'COMPLETED' ||
        currentIdem.status === 'DELETING' ||
        currentIdem.status === 'DELETED')
    ) {
      return;
    }

    const orderSnap = await adminDb.ref(`orders/${lock.reservedOrderId}`).once('value');
    const existingOrder = orderSnap.val();
    const nowIso = new Date().toISOString();

    if (isPlainObject(existingOrder)) {
      await promoteExistingOrderToCompleted({
        idemRef,
        orderId: lock.reservedOrderId,
        orderData: existingOrder,
        requestKeyHash: lock.requestKeyHash,
        requestFingerprint: lock.requestFingerprint,
        nowIso,
        ttlMs: DEFAULT_IDEMPOTENCY_TTL_MS
      });
      return;
    }

    await idemRef.transaction((current: any) => {
      if (!isPlainObject(current)) return undefined;
      if (current.status !== 'PENDING') return undefined;
      if (current.attemptId !== lock.attemptId) return undefined;

      return {
        ...current,
        status: 'FAILED',
        updatedAt: nowIso,
        failedAt: nowIso,
        lastErrorCode: errorCode
      };
    });
  } catch (err: any) {
    console.warn(
      `[OrderIdempotency] Failure reconciliation warning for ${lock.reservedOrderId}:`,
      err?.code || err?.message || 'reconcile_failed'
    );
  }
}

/**
 * Decrypts invoiceAccessToken from an encrypted SealedCommitPayload during COMMITTING crash recovery.
 */
export function decryptTokenFromCommitPayload(
  payload: SealedCommitPayload,
  encryptionKey?: string
): string {
  const encrypted = payload?.orderAccessRecord?.encryptedToken;
  const tokenHash = payload?.orderAccessRecord?.tokenHash;
  return decryptInvoiceToken(encrypted, payload.orderId, encryptionKey, tokenHash);
}

/**
 * Resolves the customer-facing replay payload for an already-COMPLETED idempotency record
 * by reading the persisted order summary and decrypting its private invoice access token.
 */
export async function resolveCompletedReplayPayload(params: {
  record: OrderIdempotencyRecord;
  adminDb: any;
  encryptionKey?: string;
}): Promise<{
  success: true;
  orderId: string;
  invoiceCode: string;
  subtotal: number;
  couponCode?: string;
  couponDiscountAmount?: number;
  shippingFee: number;
  totalAmount: number;
  invoiceAccessToken: string;
  replayed: true;
  message: string;
}> {
  const { record, adminDb, encryptionKey } = params;
  const orderId = record.reservedOrderId;

  if (record.status === 'DELETED' || record.status === 'DELETING') {
    const err = new Error(`Order ${orderId} was administratively deleted`);
    (err as any).code = 'ORDER_DELETED';
    throw err;
  }

  const deletedOrderSnap = await adminDb.ref(`privateDeletedOrders/${orderId}`).once('value');
  const deletedOrderRec = deletedOrderSnap.val();
  if (
    isPlainObject(deletedOrderRec) &&
    (deletedOrderRec.status === 'DELETED' || deletedOrderRec.status === 'DELETING')
  ) {
    const err = new Error(`Order ${orderId} was administratively deleted`);
    (err as any).code = 'ORDER_DELETED';
    throw err;
  }

  const orderSnap = await adminDb.ref(`orders/${orderId}`).once('value');
  const orderData = orderSnap.val();
  if (!isPlainObject(orderData)) {
    throw new Error(`Persisted order ${orderId} not found for idempotency replay`);
  }

  const token = await getOrCreateInvoiceToken(orderId, adminDb, { encryptionKey });
  if (!isValidInvoiceTokenFormat(token)) {
    throw new Error(`Invalid invoice access token resolved for replay of ${orderId}`);
  }

  const couponFallback = extractCouponSummaryFields(orderData);
  const couponCode =
    typeof record.responseSummary?.couponCode === 'string' && record.responseSummary.couponCode.trim()
      ? record.responseSummary.couponCode.trim().toUpperCase()
      : couponFallback.couponCode;
  const rawCouponDiscount =
    record.responseSummary?.couponDiscountAmount ?? couponFallback.couponDiscountAmount;
  const couponDiscountAmount =
    typeof rawCouponDiscount === 'number' && Number.isFinite(rawCouponDiscount) && rawCouponDiscount > 0
      ? rawCouponDiscount
      : undefined;

  return {
    success: true,
    orderId,
    invoiceCode:
      record.responseSummary?.invoiceCode ||
      orderData.invoiceCode ||
      `DNY-${orderId.slice(-6)}`,
    subtotal: Number(record.responseSummary?.subtotal ?? orderData.subtotal) || 0,
    ...(couponCode && couponDiscountAmount !== undefined
      ? { couponCode, couponDiscountAmount }
      : {}),
    shippingFee: Number(record.responseSummary?.shippingFee ?? orderData.shippingFee) || 0,
    totalAmount: Number(record.responseSummary?.totalAmount ?? orderData.totalAmount) || 0,
    invoiceAccessToken: token,
    replayed: true,
    message: 'تم تأكيد طلبك بنجاح'
  };
}
