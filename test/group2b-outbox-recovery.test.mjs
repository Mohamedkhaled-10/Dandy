// test/group2b-outbox-recovery.test.mjs
// Group 2B: Outbox Crash Recovery, Processing Leases & Admin Notification Reliability
// Covers Scenarios A through W with async RTDB mocks, Deferred Barriers, and deterministic clocks.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_OUTBOX_PROCESSING_LEASE_MS,
  DEFAULT_LEGACY_OUTBOX_STALE_MS,
  inspectOutboxProcessingLease,
  isOutboxProcessingLeaseActive,
  claimOutboxNotification,
  finalizeOutboxNotification,
  reconcileStaleOutboxNotification,
  dispatchTelegramOutboxNotification,
  dispatchMakeWebhookOutboxNotification,
  sanitizeOutboxRecordForAdmin
} from '../src/utils/notifications-outbox.ts';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import {
  POST as recoverPOST,
  ALL as recoverALL
} from '../src/pages/api/admin/recover-order-notifications.js';
import {
  POST as orderStatusPOST,
  GET as orderStatusGET
} from '../src/pages/api/order-status.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeAdminAuthMock(mode = 'valid_admin') {
  return {
    async verifyIdToken() {
      if (mode === 'valid_admin') {
        return { uid: 'adm_1', email: 'admin@dandy.com', email_verified: true };
      }
      if (mode === 'unverified_admin') {
        return { uid: 'adm_unv', email: 'admin@dandy.com', email_verified: false };
      }
      if (mode === 'non_admin') {
        return { uid: 'usr_1', email: 'customer@example.com', email_verified: true };
      }
      const err = new Error('auth/invalid-id-token');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
  };
}

function makeValidOrder(overrides = {}) {
  return {
    name: 'سارة محمود',
    email: 'sara@example.com',
    phone: '01012345678',
    governorate: 'القاهرة',
    city: 'المعادي',
    address: 'شارع 9',
    invoiceCode: 'DNY-2B001',
    status: 'جديد',
    subtotal: 500,
    shippingFee: 85,
    totalAmount: 585,
    products: [
      { id: 'p1', name: 'سيروم', quantity: 1, price: 500, lineTotal: 500 }
    ],
    timestamp: '2026-10-01T10:00:00.000Z',
    ...overrides
  };
}

function createAsyncRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();
  const queryLogs = [];

  function tick() {
    return new Promise((r) => setTimeout(r, options.ioDelayMs ?? 1));
  }

  function getVersion(p) {
    return versions.get(p) || 0;
  }

  function bumpVersion(p) {
    versions.set(p, getVersion(p) + 1);
  }

  function getAtPath(p) {
    if (!p) return data;
    const parts = p.split('/').filter(Boolean);
    let curr = data;
    for (const part of parts) {
      if (curr == null || typeof curr !== 'object') return undefined;
      curr = curr[part];
    }
    return curr === undefined ? null : curr;
  }

  function setAtPath(p, val) {
    const parts = p.split('/').filter(Boolean);
    if (parts.length === 0) return;
    let curr = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (curr[part] == null || typeof curr[part] !== 'object') {
        curr[part] = {};
      }
      curr = curr[part];
    }
    const leaf = parts[parts.length - 1];
    if (val === null || val === undefined) {
      delete curr[leaf];
    } else {
      curr[leaf] = JSON.parse(JSON.stringify(val));
    }
    bumpVersion(p);
  }

  function buildQuery(p, filterField = null, filterVal = undefined, limitCount = null, limitSide = 'first') {
    return {
      orderByChild(field) {
        return buildQuery(p, field, filterVal, limitCount, limitSide);
      },
      equalTo(val) {
        return buildQuery(p, filterField, val, limitCount, limitSide);
      },
      limitToFirst(n) {
        return buildQuery(p, filterField, filterVal, n, 'first');
      },
      limitToLast(n) {
        return buildQuery(p, filterField, filterVal, n, 'last');
      },
      async once() {
        await tick();
        queryLogs.push({ path: p, filterField, filterVal, limitCount, limitSide });
        if (typeof options.shouldFailRead === 'function' && options.shouldFailRead(p)) {
          throw new Error('Simulated RTDB read failure');
        }
        if (options.failReads) throw new Error('Simulated RTDB read failure');
        const raw = getAtPath(p);
        if (!raw || typeof raw !== 'object') {
          return { exists: () => false, val: () => null };
        }
        let entries = Object.entries(raw);
        if (filterField && filterVal !== undefined) {
          entries = entries.filter(([, rec]) => rec && typeof rec === 'object' && rec[filterField] === filterVal);
        }
        if (typeof limitCount === 'number' && limitCount >= 0) {
          entries = limitSide === 'last' ? entries.slice(-limitCount) : entries.slice(0, limitCount);
        }
        if (entries.length === 0) {
          return { exists: () => false, val: () => null };
        }
        const matched = Object.fromEntries(entries);
        const cloned = JSON.parse(JSON.stringify(matched));
        return { exists: () => true, val: () => cloned };
      }
    };
  }

  function makeRef(p = '') {
    return {
      key: p.split('/').filter(Boolean).pop() || null,
      orderByChild(field) {
        return buildQuery(p, field, undefined, null, 'first');
      },
      limitToFirst(n) {
        return buildQuery(p, null, undefined, n, 'first');
      },
      limitToLast(n) {
        return buildQuery(p, null, undefined, n, 'last');
      },
      async once() {
        await tick();
        if (typeof options.shouldFailRead === 'function' && options.shouldFailRead(p)) {
          throw new Error('Simulated RTDB read failure');
        }
        if (options.failReads) throw new Error('Simulated RTDB read failure');
        const val = getAtPath(p);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        await tick();
        if (options.failWrites) throw new Error('Simulated RTDB write failure');
        setAtPath(p, val);
      },
      async update(updates) {
        await tick();
        if (options.failWrites) throw new Error('Simulated RTDB update failure');
        if (p) {
          const existing = getAtPath(p) || {};
          setAtPath(p, { ...existing, ...updates });
        } else {
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
        }
      },
      async transaction(updater) {
        if (options.failTransactions) {
          throw new Error('Simulated RTDB transaction failure');
        }
        if (typeof options.shouldFailTx === 'function' && options.shouldFailTx(p)) {
          throw new Error('Simulated targeted RTDB transaction failure');
        }
        let attempts = 0;
        while (attempts < 10) {
          attempts++;
          const startVer = getVersion(p);
          const current = getAtPath(p);
          const clonedCurrent =
            current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));

          const nextVal = updater(clonedCurrent);

          if (typeof options.injectRaceOnceOnAttempt === 'function') {
            await options.injectRaceOnceOnAttempt({ path: p, attempts });
          }

          await tick();

          if (getVersion(p) !== startVer) {
            continue;
          }

          if (nextVal === undefined) {
            return {
              committed: false,
              snapshot: { val: () => clonedCurrent }
            };
          }

          setAtPath(p, nextVal);
          const stored = getAtPath(p);
          return {
            committed: true,
            snapshot: { val: () => (stored === undefined ? null : JSON.parse(JSON.stringify(stored))) }
          };
        }
        throw new Error('Transaction max retries exceeded');
      }
    };
  }

  return {
    data,
    queryLogs,
    ref: (p = '') => makeRef(p)
  };
}

// ===========================================================================
// A. Processing lease persistence in claimOutboxNotification
// ===========================================================================
test('A. claimOutboxNotification atomically persists processingLeaseExpiresAt alongside processingStartedAt and claimId', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_a: {
        notificationId: 'notif_a',
        orderId: 'ord_a',
        channel: 'email',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const claim = await claimOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_a',
    orderId: 'ord_a',
    nowMs: baseMs,
    leaseMs: DEFAULT_OUTBOX_PROCESSING_LEASE_MS
  });

  assert.equal(claim.claimed, true);
  assert.ok(claim.claimId);
  const stored = mockDb.data.notifications_outbox.notif_a;
  assert.equal(stored.status, 'processing');
  assert.equal(stored.claimId, claim.claimId);
  assert.equal(stored.processingStartedAt, new Date(baseMs).toISOString());
  assert.equal(
    stored.processingLeaseExpiresAt,
    new Date(baseMs + DEFAULT_OUTBOX_PROCESSING_LEASE_MS).toISOString()
  );
  assert.equal(isOutboxProcessingLeaseActive(stored, { nowMs: baseMs + 10_000 }), true);
  assert.equal(
    isOutboxProcessingLeaseActive(stored, { nowMs: baseMs + DEFAULT_OUTBOX_PROCESSING_LEASE_MS }),
    false
  );
});

// ===========================================================================
// B. finalizeOutboxNotification clears lease fields & enforces claim ownership + deletion immutability
// ===========================================================================
test('B. finalizeOutboxNotification strips claimId, processingStartedAt, processingLeaseExpiresAt and preserves deletion states', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_b1: {
        notificationId: 'notif_b1',
        orderId: 'ord_b',
        channel: 'make',
        status: 'processing',
        claimId: 'claim_1',
        processingStartedAt: new Date(baseMs).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs + 60_000).toISOString(),
        attempts: 0
      },
      notif_b2: {
        notificationId: 'notif_b2',
        orderId: 'ord_b',
        channel: 'email',
        status: 'cancelled_order_deleted',
        attempts: 0
      }
    }
  });

  const finWrong = await finalizeOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_b1',
    claimId: 'wrong_claim',
    status: 'sent',
    nowMs: baseMs + 5_000
  });
  assert.equal(finWrong.finalized, false);
  assert.equal(mockDb.data.notifications_outbox.notif_b1.status, 'processing');

  const finOk = await finalizeOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_b1',
    claimId: 'claim_1',
    status: 'sent',
    nowMs: baseMs + 5_000
  });
  assert.equal(finOk.finalized, true);
  const rec1 = mockDb.data.notifications_outbox.notif_b1;
  assert.equal(rec1.status, 'sent');
  assert.equal(rec1.attempts, 1);
  assert.equal(rec1.claimId, undefined);
  assert.equal(rec1.processingStartedAt, undefined);
  assert.equal(rec1.processingLeaseExpiresAt, undefined);

  const finDel = await finalizeOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_b2',
    claimId: 'any_claim',
    status: 'sent',
    nowMs: baseMs + 5_000
  });
  assert.equal(finDel.finalized, false);
  assert.equal(mockDb.data.notifications_outbox.notif_b2.status, 'cancelled_order_deleted');
});

// ===========================================================================
// C. reconcileStaleOutboxNotification keeps active-lease processing untouched
// ===========================================================================
test('C. reconcileStaleOutboxNotification leaves processing record with active lease untouched (IN_FLIGHT)', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_c: {
        notificationId: 'notif_c',
        orderId: 'ord_c',
        channel: 'email',
        status: 'processing',
        claimId: 'active_claim',
        processingStartedAt: new Date(baseMs).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs + 60_000).toISOString(),
        attempts: 0
      }
    }
  });

  const res = await reconcileStaleOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_c',
    nowMs: baseMs + 30_000
  });

  assert.equal(res.ok, true);
  assert.equal(res.outcome, 'IN_FLIGHT');
  assert.equal(res.status, 'processing');
  assert.equal(res.transitioned, false);
  assert.equal(mockDb.data.notifications_outbox.notif_c.claimId, 'active_claim');
  assert.equal(mockDb.data.notifications_outbox.notif_c.attempts, 0);
});

// ===========================================================================
// D. reconcileStaleOutboxNotification moves expired lease -> unknown (never pending/failed)
// ===========================================================================
test('D. reconcileStaleOutboxNotification atomically transitions expired lease to unknown and strips claim metadata', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_d: {
        notificationId: 'notif_d',
        orderId: 'ord_d',
        channel: 'telegram',
        status: 'processing',
        claimId: 'crashed_claim',
        processingStartedAt: new Date(baseMs).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs + 60_000).toISOString(),
        attempts: 1
      }
    }
  });

  const res = await reconcileStaleOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_d',
    nowMs: baseMs + 65_000
  });

  assert.equal(res.ok, true);
  assert.equal(res.outcome, 'RECONCILED_UNKNOWN');
  assert.equal(res.status, 'unknown');
  assert.equal(res.transitioned, true);

  const rec = mockDb.data.notifications_outbox.notif_d;
  assert.equal(rec.status, 'unknown');
  assert.equal(rec.attempts, 2);
  assert.equal(rec.claimId, undefined);
  assert.equal(rec.processingStartedAt, undefined);
  assert.equal(rec.processingLeaseExpiresAt, undefined);
  assert.equal(rec.staleDiagnosticCode, 'PROCESSING_LEASE_EXPIRED');
  assert.equal(rec.staleProcessingDetectedAt, new Date(baseMs + 65_000).toISOString());
});

// ===========================================================================
// E. Legacy processing record missing processingLeaseExpiresAt with valid processingStartedAt
// ===========================================================================
test('E. Legacy processing record missing processingLeaseExpiresAt uses conservative DEFAULT_LEGACY_OUTBOX_STALE_MS threshold', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_e: {
        notificationId: 'notif_e',
        orderId: 'ord_e',
        channel: 'email',
        status: 'processing',
        claimId: 'legacy_claim',
        processingStartedAt: new Date(baseMs).toISOString(),
        attempts: 0
      }
    }
  });

  // At +90s (> 60s normal lease, < 180s legacy conservative threshold) -> still IN_FLIGHT
  const earlyRes = await reconcileStaleOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_e',
    nowMs: baseMs + 90_000
  });
  assert.equal(earlyRes.outcome, 'IN_FLIGHT');
  assert.equal(earlyRes.transitioned, false);
  assert.equal(mockDb.data.notifications_outbox.notif_e.status, 'processing');

  // Past DEFAULT_LEGACY_OUTBOX_STALE_MS (+185s) -> transitions to unknown
  const lateRes = await reconcileStaleOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_e',
    nowMs: baseMs + DEFAULT_LEGACY_OUTBOX_STALE_MS + 5_000
  });
  assert.equal(lateRes.outcome, 'RECONCILED_UNKNOWN');
  assert.equal(lateRes.status, 'unknown');
  assert.equal(lateRes.transitioned, true);
  assert.equal(mockDb.data.notifications_outbox.notif_e.staleDiagnosticCode, 'LEGACY_PROCESSING_STALE');
  assert.equal(mockDb.data.notifications_outbox.notif_e.claimId, undefined);
});

// ===========================================================================
// F. Legacy processing record with missing or malformed processingStartedAt
// ===========================================================================
test('F. Legacy processing record with missing or malformed timestamp remains blocked and reports manualReviewRequired', async () => {
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_f_missing: {
        notificationId: 'notif_f_missing',
        orderId: 'ord_f',
        channel: 'email',
        status: 'processing',
        attempts: 0
      },
      notif_f_bad: {
        notificationId: 'notif_f_bad',
        orderId: 'ord_f',
        channel: 'make',
        status: 'processing',
        processingStartedAt: 'not-a-valid-date',
        attempts: 0
      }
    }
  });

  const r1 = await reconcileStaleOutboxNotification({ adminDb: mockDb, notificationId: 'notif_f_missing' });
  const r2 = await reconcileStaleOutboxNotification({ adminDb: mockDb, notificationId: 'notif_f_bad' });

  for (const [r, id] of [[r1, 'notif_f_missing'], [r2, 'notif_f_bad']]) {
    assert.equal(r.ok, true);
    assert.equal(r.outcome, 'MANUAL_REVIEW_REQUIRED');
    assert.equal(r.manualReviewRequired, true);
    assert.equal(r.status, 'processing');
    assert.equal(r.transitioned, false);
    const stored = mockDb.data.notifications_outbox[id];
    assert.equal(stored.status, 'processing');
    assert.equal(stored.manualReviewRequired, true);
    assert.equal(stored.staleDiagnosticCode, 'MISSING_OR_INVALID_PROCESSING_TIMESTAMP');
    assert.notEqual(stored.status, 'pending');
    assert.notEqual(stored.status, 'failed');
  }
});

// ===========================================================================
// G. reconcileStaleOutboxNotification preserves deletion states and non-processing records
// ===========================================================================
test('G. reconcileStaleOutboxNotification preserves cancelled_order_deleted, unknown_deleted_during_dispatch, and non-processing states', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_g1: { notificationId: 'notif_g1', status: 'cancelled_order_deleted', attempts: 0 },
      notif_g2: { notificationId: 'notif_g2', status: 'unknown_deleted_during_dispatch', attempts: 1 },
      notif_g3: { notificationId: 'notif_g3', status: 'pending', attempts: 0 },
      notif_g4: { notificationId: 'notif_g4', status: 'accepted_by_mailapp', attempts: 1 }
    }
  });

  const r1 = await reconcileStaleOutboxNotification({ adminDb: mockDb, notificationId: 'notif_g1', nowMs: baseMs });
  const r2 = await reconcileStaleOutboxNotification({ adminDb: mockDb, notificationId: 'notif_g2', nowMs: baseMs });
  const r3 = await reconcileStaleOutboxNotification({ adminDb: mockDb, notificationId: 'notif_g3', nowMs: baseMs });
  const r4 = await reconcileStaleOutboxNotification({ adminDb: mockDb, notificationId: 'notif_g4', nowMs: baseMs });

  assert.equal(r1.outcome, 'ORDER_DELETED');
  assert.equal(r1.status, 'cancelled_order_deleted');
  assert.equal(r2.outcome, 'ORDER_DELETED');
  assert.equal(r2.status, 'unknown_deleted_during_dispatch');
  assert.equal(r3.outcome, 'NOT_PROCESSING');
  assert.equal(r3.status, 'pending');
  assert.equal(r4.outcome, 'NOT_PROCESSING');
  assert.equal(r4.status, 'accepted_by_mailapp');
  assert.equal(r1.transitioned || r2.transitioned || r3.transitioned || r4.transitioned, false);
});

// ===========================================================================
// H. reconcileStaleOutboxNotification fails closed on DB unavailability / tx failure
// ===========================================================================
test('H. reconcileStaleOutboxNotification fails closed when DB is missing or transaction throws', async () => {
  const noDbRes = await reconcileStaleOutboxNotification({ adminDb: null, notificationId: 'notif_h' });
  assert.equal(noDbRes.ok, false);
  assert.equal(noDbRes.outcome, 'RECONCILE_ERROR');
  assert.equal(noDbRes.manualReviewRequired, true);

  const errDb = createAsyncRtdbMock({}, { failTransactions: true });
  const txErrRes = await reconcileStaleOutboxNotification({ adminDb: errDb, notificationId: 'notif_h' });
  assert.equal(txErrRes.ok, false);
  assert.equal(txErrRes.outcome, 'RECONCILE_ERROR');
  assert.equal(txErrRes.manualReviewRequired, true);
});

// ===========================================================================
// I. POST /api/admin/recover-order-notifications Auth, Method, Content-Type & Input Validation
// ===========================================================================
test('I. recover-order-notifications enforces POST-only, JSON Content-Type, admin auth, and valid orderId', async () => {
  const mockDb = createAsyncRtdbMock();

  const methodRes = await recoverALL();
  assert.equal(methodRes.status, 405);
  assert.equal(methodRes.headers.get('Allow'), 'POST');

  const ctRes = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId: 'ord_1' })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(ctRes.status, 415);

  for (const [mode, expectedStatus] of [
    ['missing', 401],
    ['bad_token', 401],
    ['non_admin', 403],
    ['unverified_admin', 403]
  ]) {
    const hdrs = { 'Content-Type': 'application/json' };
    if (mode !== 'missing') hdrs.Authorization = 'Bearer valid-admin-test-token';
    const authRes = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ orderId: 'ord_1' })
      }),
      _deps: { adminAuth: makeAdminAuthMock(mode), adminDb: mockDb }
    });
    assert.equal(authRes.status, expectedStatus);
  }

  for (const badBody of ['{bad-json', '[]', JSON.stringify({ orderId: '' }), JSON.stringify({ orderId: '../bad' })]) {
    const badRes = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
        body: badBody
      }),
      _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
    });
    assert.equal(badRes.status, 400);
  }
});

// ===========================================================================
// J. Tombstone checks, missing order (404), and incomplete core order shape (422)
// ===========================================================================
test('J. recover-order-notifications fails closed on tombstone DB errors, blocks deleted orders (409), 404s missing orders, and 422s invalid shape', async () => {
  const errDb = createAsyncRtdbMock({}, { shouldFailRead: (p) => p.startsWith('privateDeletedOrders/') });
  const r503 = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId: 'ord_1' })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: errDb }
  });
  assert.equal(r503.status, 503);

  const mockDb = createAsyncRtdbMock({
    privateDeletedOrders: {
      ord_del: { status: 'COMMITTING_DELETE' }
    },
    orders: {
      ord_bad_shape: { name: 'اسم فقط بدون فاتورة أو منتجات' }
    }
  });

  const r409 = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId: 'ord_del' })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(r409.status, 409);

  const r404 = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId: 'ord_missing' })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(r404.status, 404);

  const r422 = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId: 'ord_bad_shape' })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(r422.status, 422);
});

// ===========================================================================
// K. Bounded indexed query verification (orderByChild + equalTo + limitToFirst)
// ===========================================================================
test('K. recover-order-notifications uses bounded indexed query on notifications_outbox by orderId', async () => {
  const orderId = 'ord_bounded';
  const outbox = {};
  const validIds = [
    `notif_order_${orderId}_confirmation`,
    `notif_order_${orderId}_telegram`,
    `notif_order_${orderId}_status_new`,
    `notif_order_${orderId}_status_processing`,
    `notif_order_${orderId}_status_shipped`,
    `notif_order_${orderId}_status_delivered`,
    `notif_order_${orderId}_status_cancelled`
  ];
  for (const id of validIds) {
    outbox[id] = {
      notificationId: id,
      orderId,
      channel: id.endsWith('_telegram') ? 'telegram' : 'email',
      status: id.endsWith('_telegram') ? 'sent' : 'accepted_by_mailapp',
      attempts: 1
    };
  }
  for (let i = 0; i < 18; i++) {
    const id = `notif_order_${orderId}_extra_${i}`;
    outbox[id] = {
      notificationId: id,
      orderId,
      channel: 'telegram',
      status: 'sent',
      attempts: 1
    };
  }
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: outbox
  });

  const res = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.notifications.length, 20);
  assert.equal(data.summary.alreadyCompleted, validIds.length);
  assert.equal(data.summary.skipped, 20 - validIds.length);
  assert.ok(
    mockDb.queryLogs.some(
      (q) =>
        q.path === 'notifications_outbox' &&
        q.filterField === 'orderId' &&
        q.filterVal === orderId &&
        q.limitCount === 20 &&
        q.limitSide === 'first'
    ),
    'Must enforce bounded indexed query with limitToFirst'
  );
});

// ===========================================================================
// L. Independent multi-channel recovery of pending notifications + same notificationId reuse
// ===========================================================================
test('L. recover-order-notifications recovers pending Email and Telegram independently while skipping intentionally disabled Make without calling Make webhook', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const orderId = 'ord_multi_pending';
  const emailNotifId = `notif_order_${orderId}_confirmation`;
  const tgNotifId = `notif_order_${orderId}_telegram`;
  const makeNotifId = `notif_order_${orderId}_make`;

  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [emailNotifId]: {
        notificationId: emailNotifId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        recipientEmail: 'sara@example.com',
        status: 'pending',
        attempts: 0
      },
      [tgNotifId]: {
        notificationId: tgNotifId,
        orderId,
        channel: 'telegram',
        eventType: 'TELEGRAM_ORDER_NOTIFICATION',
        status: 'pending',
        attempts: 0
      },
      [makeNotifId]: {
        notificationId: makeNotifId,
        orderId,
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const origFetch = globalThis.fetch;
  const origGmail = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b_relay/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_2b_secret_key';

  let seenEmailEnvelope = null;
  let makeWebhookCalls = 0;

  // Email relay returns HTTP 500 failure cleanly while Telegram succeeds and Make is skipped without webhook call
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('mock_2b_relay')) {
      seenEmailEnvelope = JSON.parse(init.body);
      return new Response(JSON.stringify({ success: false, error: 'RELAY_DOWN' }), { status: 500 });
    }
    throw new Error('Unexpected global fetch call: ' + url);
  };

  try {
    const res = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
        body: JSON.stringify({ orderId })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: mockDb,
        encryptionKey: hexKey,
        sendTelegramNotification: async () => ({ success: true, status: 'SUCCESS', allSuccessful: true }),
        makeWebhookUrl: 'https://hook.make.test/ord_multi_pending',
        fetchFn: async () => {
          makeWebhookCalls++;
          return new Response('{}', { status: 200 });
        }
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(seenEmailEnvelope.notificationId, emailNotifId);
    assert.equal(makeWebhookCalls, 0);
    assert.equal(data.summary.processed, 1);
    assert.equal(data.summary.failed, 1);
    assert.equal(data.summary.skipped, 1);

    const makeResult = (data.notifications || []).find((r) => r.channel === 'make');
    assert.equal(makeResult?.status, 'skipped_intentionally_disabled');
    assert.equal(makeResult?.persistenceOutcome, 'intentionally_disabled');

    assert.equal(mockDb.data.notifications_outbox[emailNotifId].status, 'failed');
    assert.equal(mockDb.data.notifications_outbox[tgNotifId].status, 'sent');
    assert.equal(mockDb.data.notifications_outbox[makeNotifId].status, 'pending');
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origGmail;
    process.env.GMAIL_RELAY_URL = origUrl;
    process.env.GMAIL_RELAY_SECRET = origSecret;
  }
});

// ===========================================================================
// M, N, O, P, Q. Recovery never resends completed, never sends unknown/failed/skipped/deleted, and reconciles stale without same-request send
// ===========================================================================
test('M-Q. Recovery skips completed/unknown/failed/skipped/deleted and reconciles stale processing without re-dispatching', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const orderId = 'ord_matrix';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [`notif_order_${orderId}_confirmation`]: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        channel: 'email',
        status: 'accepted_by_mailapp',
        attempts: 1
      },
      [`notif_order_${orderId}_status_shipped`]: {
        notificationId: `notif_order_${orderId}_status_shipped`,
        orderId,
        channel: 'email',
        status: 'unknown',
        attempts: 1
      },
      [`notif_order_${orderId}_telegram`]: {
        notificationId: `notif_order_${orderId}_telegram`,
        orderId,
        channel: 'telegram',
        status: 'processing',
        claimId: 'crashed_tg',
        processingStartedAt: new Date(baseMs).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs + 60_000).toISOString(),
        attempts: 0
      },
      [`notif_order_${orderId}_make`]: {
        notificationId: `notif_order_${orderId}_make`,
        orderId,
        channel: 'make',
        status: 'processing',
        claimId: 'live_make',
        processingStartedAt: new Date(baseMs + 50_000).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs + 110_000).toISOString(),
        attempts: 0
      },
      [`notif_order_${orderId}_status_delivered`]: {
        notificationId: `notif_order_${orderId}_status_delivered`,
        orderId,
        channel: 'email',
        status: 'failed',
        attempts: 1
      },
      [`notif_order_${orderId}_status_cancelled`]: {
        notificationId: `notif_order_${orderId}_status_cancelled`,
        orderId,
        channel: 'email',
        status: 'skipped_no_valid_email',
        attempts: 0
      },
      [`notif_order_${orderId}_status_new`]: {
        notificationId: `notif_order_${orderId}_status_new`,
        orderId,
        channel: 'email',
        status: 'cancelled_order_deleted',
        attempts: 0
      }
    }
  });

  let externalCalls = 0;
  const res = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId })
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: mockDb,
      nowMs: baseMs + 70_000,
      sendOrderNotification: async () => {
        externalCalls++;
        return { success: true, status: 'accepted_by_mailapp' };
      },
      sendTelegramNotification: async () => {
        externalCalls++;
        return { success: true, status: 'SUCCESS' };
      },
      fetchFn: async () => {
        externalCalls++;
        return new Response('{}', { status: 200 });
      }
    }
  });

  assert.equal(res.status, 200);
  assert.equal(externalCalls, 0, 'NO external provider calls allowed for completed/unknown/failed/stale/inflight/skipped/deleted');

  const data = await res.json();
  assert.equal(data.summary.processed, 0);
  assert.equal(data.summary.alreadyCompleted, 1);
  assert.equal(data.summary.reconciledUnknown, 1);
  assert.equal(data.summary.inFlight, 1);
  assert.equal(data.summary.failed, 1);
  assert.equal(data.summary.skipped, 3);

  // Stale telegram became unknown; active Make remained processing
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_telegram`].status, 'unknown');
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_make`].status, 'processing');
  // Failed email remained failed (allowRetryFailed never bypassed)
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_status_delivered`].status, 'failed');
  // Deleted audit remained untouched
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_status_new`].status, 'cancelled_order_deleted');
});

// ===========================================================================
// R. Real async Deferred Barrier race: order deleted during token lookup aborts recovery send
// ===========================================================================
test('R. Deferred Barrier race: concurrent order deletion during recovery token lookup aborts email dispatch cleanly', async () => {
  const orderId = 'ord_race_del';
  const emailNotifId = `notif_order_${orderId}_confirmation`;
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [emailNotifId]: {
        notificationId: emailNotifId,
        orderId,
        channel: 'email',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const tokenBarrier = createDeferred();
  const tokenEntered = createDeferred();
  let emailDispatchCalls = 0;

  const recoverPromise = recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId })
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: mockDb,
      getOrCreateInvoiceToken: async () => {
        tokenEntered.resolve();
        await tokenBarrier.promise;
        return 'mock_token_value';
      },
      sendOrderNotification: async () => {
        emailDispatchCalls++;
        return { success: true, status: 'accepted_by_mailapp' };
      }
    }
  });

  await tokenEntered.promise;
  await mockDb.ref(`privateDeletedOrders/${orderId}`).set({ status: 'DELETING' });
  tokenBarrier.resolve();

  const res = await recoverPromise;
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(emailDispatchCalls, 0);
  assert.equal(data.summary.skipped, 1);
  assert.equal(data.summary.processed, 0);
});

// ===========================================================================
// S. Concurrent recovery callers race for pending order: atomic claim permits single winner
// ===========================================================================
test('S. Concurrent recovery callers for same pending order dispatch each channel at most once', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const orderId = 'ord_conc_recover';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [`notif_order_${orderId}_confirmation`]: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        recipientEmail: 'sara@example.com',
        status: 'pending',
        attempts: 0
      },
      [`notif_order_${orderId}_telegram`]: {
        notificationId: `notif_order_${orderId}_telegram`,
        orderId,
        channel: 'telegram',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const origFetch = globalThis.fetch;
  const origGmail = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b_conc/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_2b_conc_secret';

  let emailCalls = 0;
  let tgCalls = 0;

  globalThis.fetch = async (url) => {
    if (String(url).includes('mock_2b_conc')) {
      emailCalls++;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(JSON.stringify({ success: true, status: 'accepted_by_mailapp' }), { status: 200 });
    }
    throw new Error('Unexpected fetch');
  };

  try {
    const mkReq = () =>
      new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
        body: JSON.stringify({ orderId })
      });

    const [r1, r2] = await Promise.all([
      recoverPOST({
        request: mkReq(),
        _deps: {
          adminAuth: makeAdminAuthMock('valid_admin'),
          adminDb: mockDb,
          encryptionKey: hexKey,
          sendTelegramNotification: async () => {
            tgCalls++;
            await new Promise((r) => setTimeout(r, 15));
            return { success: true, status: 'SUCCESS', allSuccessful: true };
          }
        }
      }),
      recoverPOST({
        request: mkReq(),
        _deps: {
          adminAuth: makeAdminAuthMock('valid_admin'),
          adminDb: mockDb,
          encryptionKey: hexKey,
          sendTelegramNotification: async () => {
            tgCalls++;
            return { success: true, status: 'SUCCESS', allSuccessful: true };
          }
        }
      })
    ]);

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(emailCalls, 1);
    assert.equal(tgCalls, 1);
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origGmail;
    process.env.GMAIL_RELAY_URL = origUrl;
    process.env.GMAIL_RELAY_SECRET = origSecret;
  }
});

// ===========================================================================
// T. PII / secret sanitization & no-store security headers across endpoints
// ===========================================================================
test('T. recover-order-notifications and GET order-status never expose PII, claimId, payloads, or tokens and include no-store headers', async () => {
  const orderId = 'ord_pii_safe';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder({ email: 'secretcustomer@example.com' }) },
    notifications_outbox: {
      [`notif_order_${orderId}_confirmation`]: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        channel: 'email',
        recipientEmail: 'secretcustomer@example.com',
        recipientName: 'عميلة سرية',
        claimId: 'secret_claim_uuid',
        payload: { sensitive: 'do_not_expose' },
        status: 'accepted_by_mailapp',
        attempts: 1,
        lastAttemptAt: '2026-10-01T12:00:00.000Z'
      }
    }
  });

  const recRes = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ orderId })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(recRes.status, 200);
  assert.match(recRes.headers.get('Cache-Control') || '', /no-store/);
  const recText = await recRes.text();
  assert.equal(recText.includes('secretcustomer@example.com'), false);
  assert.equal(recText.includes('secret_claim_uuid'), false);
  assert.equal(recText.includes('do_not_expose'), false);

  const getRes = await orderStatusGET({
    request: new Request(`http://localhost/api/order-status?orderId=${orderId}`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-admin-test-token' }
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: mockDb }
  });
  assert.equal(getRes.status, 200);
  assert.match(getRes.headers.get('Cache-Control') || '', /no-store/);
  const getText = await getRes.text();
  assert.equal(getText.includes('secretcustomer@example.com'), false);
  assert.equal(getText.includes('secret_claim_uuid'), false);
  assert.equal(getText.includes('do_not_expose'), false);

  const sanitized = sanitizeOutboxRecordForAdmin(
    mockDb.data.notifications_outbox[`notif_order_${orderId}_confirmation`]
  );
  assert.equal(sanitized.recipientEmail, undefined);
  assert.equal(sanitized.recipientName, undefined);
  assert.equal(sanitized.claimId, undefined);
  assert.equal(sanitized.payload, undefined);
});

// ===========================================================================
// U. order-status RETRY_NOTIFICATION & SEND_CURRENT_STATUS_NOTIFICATION protections + failed retry
// ===========================================================================
test('U. order-status RETRY_NOTIFICATION and SEND_CURRENT_STATUS_NOTIFICATION enforce active/stale processing leases & allow manual failed retry', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const orderId = 'ord_manual_retry';
  const notifFailed = `notif_order_${orderId}_status_shipped`;
  const notifProcessingActive = `notif_order_${orderId}_status_processing`;
  const notifProcessingExpired = `notif_order_${orderId}_confirmation`;

  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder({ status: 'جديد' }) },
    notifications_outbox: {
      [notifFailed]: {
        notificationId: notifFailed,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        orderStatus: 'تم الشحن',
        status: 'failed',
        attempts: 1
      },
      [notifProcessingActive]: {
        notificationId: notifProcessingActive,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        orderStatus: 'قيد التجهيز',
        status: 'processing',
        claimId: 'claim_active',
        processingStartedAt: new Date(baseMs).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs + 60_000).toISOString(),
        attempts: 0
      },
      [notifProcessingExpired]: {
        notificationId: notifProcessingExpired,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        orderStatus: 'جديد',
        status: 'processing',
        claimId: 'claim_expired',
        processingStartedAt: new Date(baseMs - 120_000).toISOString(),
        processingLeaseExpiresAt: new Date(baseMs - 30_000).toISOString(),
        attempts: 0
      }
    }
  });

  let sendCalls = 0;
  // 1. Active processing lease blocks RETRY_NOTIFICATION with 409 NOTIFICATION_IN_FLIGHT
  const activeRes = await orderStatusPOST({
    request: new Request('http://localhost/api/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ action: 'RETRY_NOTIFICATION', orderId, notificationId: notifProcessingActive })
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: mockDb,
      nowMs: baseMs + 10_000,
      sendOrderNotification: async () => {
        sendCalls++;
        return { success: true, status: 'accepted_by_mailapp' };
      }
    }
  });
  assert.equal(activeRes.status, 409);
  const activeJson = await activeRes.json();
  assert.equal(activeJson.error, 'NOTIFICATION_IN_FLIGHT');
  assert.equal(sendCalls, 0);

  // 2. Expired processing lease in SEND_CURRENT_STATUS_NOTIFICATION reconciles to unknown and blocks with 409 AMBIGUOUS_NOTIFICATION_STATUS
  const expRes = await orderStatusPOST({
    request: new Request('http://localhost/api/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
      body: JSON.stringify({ action: 'SEND_CURRENT_STATUS_NOTIFICATION', orderId })
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: mockDb,
      nowMs: baseMs + 10_000,
      sendOrderNotification: async () => {
        sendCalls++;
        return { success: true, status: 'accepted_by_mailapp' };
      }
    }
  });
  assert.equal(expRes.status, 409);
  const expJson = await expRes.json();
  assert.equal(expJson.error, 'AMBIGUOUS_NOTIFICATION_STATUS');
  assert.equal(mockDb.data.notifications_outbox[notifProcessingExpired].status, 'unknown');
  assert.equal(sendCalls, 0);

  // 3. Failed record explicit manual retry via RETRY_NOTIFICATION reuses the SAME notificationId & succeeds
  const origKey = process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
  process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = hexKey;
  try {
    let retriedId = null;
    const retryRes = await orderStatusPOST({
      request: new Request('http://localhost/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-test-token' },
        body: JSON.stringify({ action: 'RETRY_NOTIFICATION', orderId, notificationId: notifFailed })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: mockDb,
        nowMs: baseMs + 10_000,
        sendOrderNotification: async (args) => {
          sendCalls++;
          retriedId = args.retryNotificationId;
          return { success: true, status: 'accepted_by_mailapp', notificationId: args.retryNotificationId };
        }
      }
    });
    assert.equal(retryRes.status, 200);
    assert.equal(sendCalls, 1);
    assert.equal(retriedId, notifFailed);
  } finally {
    process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = origKey;
  }
});

// ===========================================================================
// V. Telegram & Make dispatchers persist lease during processing and clear it on finalization
// ===========================================================================
test('V. Telegram & Make dispatchers persist processingLeaseExpiresAt while in flight and clear it upon sent/unknown/failed completion', async () => {
  const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
  const orderId = 'ord_lease_disp';
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      [`notif_order_${orderId}_telegram`]: {
        notificationId: `notif_order_${orderId}_telegram`,
        orderId,
        channel: 'telegram',
        status: 'pending',
        attempts: 0
      },
      [`notif_order_${orderId}_make`]: {
        notificationId: `notif_order_${orderId}_make`,
        orderId,
        channel: 'make',
        status: 'pending',
        attempts: 0
      }
    }
  });

  let tgLeaseWhileInFlight = null;
  const tgRes = await dispatchTelegramOutboxNotification({
    orderId,
    orderData: makeValidOrder(),
    adminDb: mockDb,
    nowMs: baseMs,
    leaseMs: 45_000,
    sendTelegramFn: async () => {
      tgLeaseWhileInFlight = mockDb.data.notifications_outbox[`notif_order_${orderId}_telegram`].processingLeaseExpiresAt;
      return { success: true, status: 'SUCCESS', allSuccessful: true };
    }
  });
  assert.equal(tgRes.status, 'sent');
  assert.equal(tgLeaseWhileInFlight, new Date(baseMs + 45_000).toISOString());
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_telegram`].processingLeaseExpiresAt, undefined);

  let makeLeaseWhileInFlight = null;
  const makeRes = await dispatchMakeWebhookOutboxNotification({
    orderId,
    orderData: makeValidOrder(),
    adminDb: mockDb,
    nowMs: baseMs,
    leaseMs: 45_000,
    makeWebhookUrl: 'https://hook.make.test/lease',
    fetchFn: async () => {
      makeLeaseWhileInFlight = mockDb.data.notifications_outbox[`notif_order_${orderId}_make`].processingLeaseExpiresAt;
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
  });
  assert.equal(makeRes.status, 'unknown');
  assert.equal(makeLeaseWhileInFlight, new Date(baseMs + 45_000).toISOString());
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_make`].processingLeaseExpiresAt, undefined);
});

// ===========================================================================
// W. Admin dashboard UI verification (3 channels, Arabic labels, recovery button, no retry on unknown)
// ===========================================================================
test('W. dashboard-order.astro renders 3-channel outbox UI, recovery button, Arabic status labels, and never exposes retry for unknown states', async () => {
  const dashPath = path.resolve('src/pages/dashboard-order.astro');
  const html = await fs.readFile(dashPath, 'utf8');

  // Verify 3-channel UI & recovery button
  assert.ok(html.includes('id="md-outbox-channels"'));
  assert.ok(html.includes('id="md-recover-notifs-btn"'));
  assert.ok(html.includes('معالجة الإشعارات المعلقة'));
  assert.ok(html.includes('/api/admin/recover-order-notifications'));
  assert.ok(html.includes('/api/order-status?orderId='));

  // Verify required Arabic status labels
  for (const label of [
    'قيد الانتظار',
    'قيد الإرسال',
    'تم قبول الإرسال',
    'تم الإرسال',
    'فشل الإرسال',
    'نتيجة غير مؤكدة',
    'ملغي بسبب حذف الطلب',
    'غير مهيأ / متجاوز'
  ]) {
    assert.ok(html.includes(label), `Expected Arabic status label: ${label}`);
  }

  // Verify NON_RETRYABLE_OUTBOX_STATUSES & unknown warning block
  assert.ok(html.includes('NON_RETRYABLE_OUTBOX_STATUSES'));
  assert.ok(html.includes('RETRYABLE_EMAIL_STATUSES'));
  assert.ok(html.includes('id="md-outbox-unknown-warning"'));
  // Ensure old buggy condition allowing unknown retry is gone
  assert.equal(html.includes("notifStatus !== 'accepted_by_mailapp'"), false);
});
