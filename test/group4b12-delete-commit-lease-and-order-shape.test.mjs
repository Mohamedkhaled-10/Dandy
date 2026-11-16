// test/group4b12-delete-commit-lease-and-order-shape.test.mjs
// Group 4B.1.2: Delete Commit Lease Renewal, Crash/Race Recovery, & Core Order Shape Validation

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { POST as deleteOrderPOST } from '../src/pages/api/admin/delete-order.js';
import { POST as orderStatusPOST } from '../src/pages/api/order-status.js';
import {
  sendOrderNotification,
  hasValidCoreOrderShape,
  hasCoreOrderFieldsForNotif,
  isValidOrderStatusValue
} from '../src/utils/email-service.ts';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createAsyncRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();
  let rootUpdateCalls = 0;

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
    for (let i = parts.length - 1; i >= 1; i--) {
      bumpVersion(parts.slice(0, i).join('/'));
    }
  }

  function makeRef(p = '') {
    return {
      key: p.split('/').filter(Boolean).pop() || null,
      async once() {
        await tick();
        if (typeof options.onOnce === 'function') {
          await options.onOnce(p);
        }
        const val = getAtPath(p);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      orderByChild(field) {
        return {
          equalTo(target) {
            return {
              async once() {
                await tick();
                const container = getAtPath(p);
                if (!container || typeof container !== 'object') {
                  return { exists: () => false, val: () => null };
                }
                const matched = {};
                for (const [k, v] of Object.entries(container)) {
                  if (v && typeof v === 'object' && v[field] === target) {
                    matched[k] = JSON.parse(JSON.stringify(v));
                  }
                }
                const hasAny = Object.keys(matched).length > 0;
                return {
                  exists: () => hasAny,
                  val: () => (hasAny ? matched : null)
                };
              }
            };
          }
        };
      },
      async set(val) {
        await tick();
        setAtPath(p, val);
      },
      async update(updates) {
        await tick();
        if (!p) {
          rootUpdateCalls++;
          if (typeof options.onRootUpdate === 'function') {
            await options.onRootUpdate(updates);
          }
          if (typeof options.shouldFailRootUpdate === 'function' && options.shouldFailRootUpdate(updates)) {
            throw new Error('Simulated root update failure');
          }
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
          return;
        }
        const existing = getAtPath(p) || {};
        setAtPath(p, { ...existing, ...updates });
      },
      push() {
        const k = `-Mock_${crypto.randomUUID().slice(0, 8)}`;
        return makeRef(p ? `${p}/${k}` : k);
      },
      async transaction(updater) {
        let attempts = 0;
        while (attempts < 20) {
          attempts++;
          const startVer = getVersion(p);
          const current = getAtPath(p);
          const clonedCurrent =
            current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
          const next = updater(clonedCurrent);
          if (next === undefined) {
            return {
              committed: false,
              snapshot: {
                exists: () => clonedCurrent !== null && clonedCurrent !== undefined,
                val: () => clonedCurrent
              }
            };
          }
          await tick();
          if (getVersion(p) === startVer) {
            setAtPath(p, next);
            const saved = getAtPath(p);
            const clonedSaved =
              saved === null || saved === undefined ? null : JSON.parse(JSON.stringify(saved));
            return {
              committed: true,
              snapshot: {
                exists: () => clonedSaved !== null && clonedSaved !== undefined,
                val: () => clonedSaved
              }
            };
          }
        }
        return {
          committed: false,
          snapshot: { exists: () => false, val: () => null }
        };
      }
    };
  }

  return {
    data,
    get rootUpdateCalls() {
      return rootUpdateCalls;
    },
    ref: (p = '') => makeRef(p)
  };
}

function createMockAdminAuth(tokenMap = {}) {
  return {
    async verifyIdToken(token) {
      const rec = tokenMap[token];
      if (!rec) throw new Error('Invalid ID token');
      return rec;
    }
  };
}

function makeJsonReq(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

const ADMIN_AUTH = createMockAdminAuth({
  'tok-admin-verified': { uid: 'admin_1', email: 'admin@dandy.com', email_verified: true }
});

function buildCompleteOrder(overrides = {}) {
  return {
    invoiceCode: 'DNY-4B1201',
    status: 'جديد',
    name: 'نورهان أحمد',
    phone: '01012345678',
    email: 'nourhan@example.com',
    governorate: 'القاهرة',
    city: 'المعادي',
    address: 'شارع 9',
    subtotal: 400,
    shippingFee: 85,
    totalAmount: 485,
    products: [
      {
        id: 'prod_serum',
        name: 'سيروم فيتامين سي',
        quantity: 1,
        price: 400,
        effectiveUnitPrice: 400,
        lineTotal: 400
      }
    ],
    ...overrides
  };
}

// ===========================================================================
// PART 1: COMMITTING_DELETE LEASE RENEWAL & CRASH/RACE PROTECTION
// ===========================================================================

test('1. Worker transitions DELETING -> COMMITTING_DELETE and renews deleteLeaseExpiresAt from transition time', async () => {
  const orderId = 'ord_lease_renew_1';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: buildCompleteOrder() },
    privateOrderAccess: {
      [orderId]: { orderId, tokenHash: 'hash_1', encryptedToken: 'enc_1', status: 'active' }
    },
    privateInvoiceAccess: {
      hash_1: { orderId, tokenHash: 'hash_1', status: 'active' }
    }
  });

  const tStart = Date.UTC(2026, 10, 14, 12, 0, 0);
  const tCommitTransition = tStart + 20_000; // 20s later during cleanup prep
  const deleteLeaseMs = 30_000;
  const commitDeleteLeaseMs = 45_000;

  let observedDeletingRecord = null;
  let observedCommittingRecord = null;

  const res = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tStart,
      commitNowMs: tCommitTransition,
      deleteLeaseMs,
      commitDeleteLeaseMs,
      beforeDeleteCommit: async () => {
        observedDeletingRecord = JSON.parse(JSON.stringify(mockDb.data.privateDeletedOrders[orderId]));
      },
      beforeRootUpdate: async () => {
        observedCommittingRecord = JSON.parse(JSON.stringify(mockDb.data.privateDeletedOrders[orderId]));
      }
    }
  });

  assert.equal(res.status, 200);
  assert.equal(observedDeletingRecord.status, 'DELETING');
  assert.equal(
    observedDeletingRecord.deleteLeaseExpiresAt,
    new Date(tStart + deleteLeaseMs).toISOString()
  );

  assert.equal(observedCommittingRecord.status, 'COMMITTING_DELETE');
  assert.equal(
    observedCommittingRecord.committingAt,
    new Date(tCommitTransition).toISOString()
  );
  assert.equal(
    observedCommittingRecord.deleteLeaseExpiresAt,
    new Date(tCommitTransition + commitDeleteLeaseMs).toISOString(),
    'deleteLeaseExpiresAt MUST be renewed relative to COMMITTING_DELETE transition timestamp'
  );
  assert.equal(
    observedCommittingRecord.committingLeaseExpiresAt,
    new Date(tCommitTransition + commitDeleteLeaseMs).toISOString()
  );
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
  assert.equal(mockDb.data.orders?.[orderId], undefined);
});

test('2. Second worker cannot take over COMMITTING_DELETE while renewed lease is active (even after original DELETING lease would have expired)', async () => {
  const orderId = 'ord_commit_active_block';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: buildCompleteOrder() }
  });

  const tStart = Date.UTC(2026, 10, 14, 12, 0, 0);
  const tCommitTransition = tStart + 25_000;
  const deleteLeaseMs = 30_000; // Initial lease would expire at tStart + 30_000
  const commitDeleteLeaseMs = 45_000; // Renewed commit lease lasts until tStart + 70_000

  const enteredCommit = createDeferred();
  const releaseWorker1 = createDeferred();

  const worker1Promise = deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tStart,
      commitNowMs: tCommitTransition,
      deleteLeaseMs,
      commitDeleteLeaseMs,
      beforeRootUpdate: async () => {
        enteredCommit.resolve();
        await releaseWorker1.promise;
      }
    }
  });

  await enteredCommit.promise;

  // Worker 2 arrives at tStart + 40_000: past original DELETING lease (30s), BEFORE renewed COMMITTING_DELETE lease (70s)
  const worker2Res = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tStart + 40_000,
      deleteLeaseMs,
      commitDeleteLeaseMs
    }
  });

  assert.equal(worker2Res.status, 409);
  assert.equal((await worker2Res.json()).error, 'DELETE_IN_PROGRESS');
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'COMMITTING_DELETE');

  releaseWorker1.resolve();
  const worker1Res = await worker1Promise;
  assert.equal(worker1Res.status, 200);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
});

test('3 & 4. Second worker takes over after renewed COMMITTING_DELETE lease expires and inspects real records on crash recovery (both incomplete & already-cleaned cases)', async () => {
  const tStart = Date.UTC(2026, 10, 14, 12, 0, 0);
  const tCommit = tStart + 10_000;
  const commitLeaseMs = 45_000; // Expires at tStart + 55_000
  const tAfterExpiry = tStart + 60_000;

  // 4A. Crashed in COMMITTING_DELETE BEFORE root update ran: orders & dependents still exist!
  const orderIdA = 'ord_crash_before_root';
  const dbBeforeRoot = createAsyncRtdbMock({
    privateDeletedOrders: {
      [orderIdA]: {
        orderId: orderIdA,
        status: 'COMMITTING_DELETE',
        deleteAttemptId: 'crashed-attempt-a',
        requestedAt: new Date(tStart).toISOString(),
        committingAt: new Date(tCommit).toISOString(),
        deleteLeaseExpiresAt: new Date(tCommit + commitLeaseMs).toISOString(),
        committingLeaseExpiresAt: new Date(tCommit + commitLeaseMs).toISOString()
      }
    },
    orders: { [orderIdA]: buildCompleteOrder() },
    privateOrderAccess: {
      [orderIdA]: { orderId: orderIdA, tokenHash: 'tok_a', encryptedToken: 'enc_a', status: 'active' }
    },
    privateInvoiceAccess: {
      tok_a: { orderId: orderIdA, tokenHash: 'tok_a', status: 'active' }
    },
    privateOrderIdempotency: {
      idem_a: {
        requestKeyHash: 'idem_a',
        requestFingerprint: 'fp_a',
        status: 'COMMITTED',
        reservedOrderId: orderIdA,
        attemptId: 'att_a'
      }
    },
    notifications_outbox: {
      notif_a: {
        notificationId: 'notif_a',
        orderId: orderIdA,
        status: 'pending',
        recipientEmail: 'nourhan@example.com'
      }
    }
  });

  const recResA = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId: orderIdA },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: dbBeforeRoot,
      nowMs: tAfterExpiry,
      commitDeleteLeaseMs: commitLeaseMs
    }
  });

  assert.equal(recResA.status, 200, 'Crash recovery must NOT assume deletion succeeded without checking records');
  const recBodyA = await recResA.json();
  assert.equal(recBodyA.recoveredFromCrash, true);
  assert.equal(dbBeforeRoot.data.orders?.[orderIdA], undefined);
  assert.equal(dbBeforeRoot.data.privateOrderAccess?.[orderIdA]?.status, 'revoked');
  assert.equal(dbBeforeRoot.data.privateInvoiceAccess?.tok_a?.status, 'revoked');
  assert.equal(dbBeforeRoot.data.privateOrderIdempotency?.idem_a?.status, 'DELETED');
  assert.equal(dbBeforeRoot.data.notifications_outbox?.notif_a?.status, 'cancelled_order_deleted');
  assert.equal(dbBeforeRoot.data.privateDeletedOrders?.[orderIdA]?.status, 'DELETED');

  // 4B. Crashed AFTER dependent records were already cleaned (order absent, access revoked, idem DELETED)
  const orderIdB = 'ord_crash_after_cleanup';
  const dbAfterCleanup = createAsyncRtdbMock({
    privateDeletedOrders: {
      [orderIdB]: {
        orderId: orderIdB,
        status: 'COMMITTING_DELETE',
        deleteAttemptId: 'crashed-attempt-b',
        requestedAt: new Date(tStart).toISOString(),
        committingAt: new Date(tCommit).toISOString(),
        deleteLeaseExpiresAt: new Date(tCommit + commitLeaseMs).toISOString()
      }
    },
    privateOrderAccess: {
      [orderIdB]: { orderId: orderIdB, status: 'revoked', revokedReason: 'ADMIN_ORDER_DELETED' }
    },
    privateOrderIdempotency: {
      idem_b: {
        requestKeyHash: 'idem_b',
        requestFingerprint: 'fp_b',
        status: 'DELETED',
        reservedOrderId: orderIdB
      }
    }
  });

  const recResB = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId: orderIdB },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: dbAfterCleanup,
      nowMs: tAfterExpiry,
      commitDeleteLeaseMs: commitLeaseMs
    }
  });

  assert.equal(recResB.status, 404);
  assert.equal((await recResB.json()).error, 'ORDER_NOT_FOUND');
  assert.equal(dbAfterCleanup.data.privateDeletedOrders[orderIdB].status, 'DELETED');
  assert.equal(dbAfterCleanup.data.privateOrderIdempotency.idem_b.status, 'DELETED');
});

test('5, 6 & 7. Worker 1 pauses after entering COMMITTING_DELETE before root update; Worker 2 recovers & completes; stale Worker 1 wakes up without overwriting DELETED or newer locks', async () => {
  const orderId = 'ord_stale_worker1_commit';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: buildCompleteOrder() },
    privateOrderAccess: {
      [orderId]: { orderId, tokenHash: 'hash_w1', encryptedToken: 'enc_w1', status: 'active' }
    },
    privateInvoiceAccess: {
      hash_w1: { orderId, tokenHash: 'hash_w1', status: 'active' }
    },
    privateOrderIdempotency: {
      idem_w1: {
        requestKeyHash: 'idem_w1',
        requestFingerprint: 'fp_w1',
        status: 'COMMITTED',
        reservedOrderId: orderId,
        attemptId: 'att_w1'
      }
    }
  });

  const tStart = Date.UTC(2026, 10, 14, 12, 0, 0);
  const tCommit = tStart + 5_000;
  const deleteLeaseMs = 30_000;
  const commitDeleteLeaseMs = 45_000; // Expires at tCommit + 45_000 = tStart + 50_000
  const tWorker2 = tStart + 55_000;

  const w1EnteredBeforeRoot = createDeferred();
  const w1Release = createDeferred();
  let w1AttemptId = null;

  const w1Promise = deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tStart,
      commitNowMs: tCommit,
      preUpdateNowMs: tWorker2 + 1_000,
      deleteLeaseMs,
      commitDeleteLeaseMs,
      beforeRootUpdate: async ({ deleteAttemptId }) => {
        w1AttemptId = deleteAttemptId;
        w1EnteredBeforeRoot.resolve();
        await w1Release.promise;
      }
    }
  });

  await w1EnteredBeforeRoot.promise;
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'COMMITTING_DELETE');
  assert.equal(mockDb.data.privateDeletedOrders[orderId].deleteAttemptId, w1AttemptId);
  const rootUpdatesBeforeW2 = mockDb.rootUpdateCalls;
  assert.equal(rootUpdatesBeforeW2, 0);

  // Worker 2 wakes up after renewed COMMITTING_DELETE lease expires and finishes deletion
  const w2Res = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tWorker2,
      commitNowMs: tWorker2 + 200,
      preUpdateNowMs: tWorker2 + 400,
      deleteLeaseMs,
      commitDeleteLeaseMs
    }
  });

  assert.equal(w2Res.status, 200);
  const w2Body = await w2Res.json();
  assert.equal(w2Body.recoveredFromCrash, true);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
  const rootUpdatesAfterW2 = mockDb.rootUpdateCalls;
  assert.equal(rootUpdatesAfterW2, 1);

  // Now wake up stale Worker 1! It MUST abort cleanly without executing root update or altering DELETED state
  w1Release.resolve();
  const w1Res = await w1Promise;
  const w1Body = await w1Res.json();

  assert.equal(w1Res.status, 404);
  assert.equal(w1Body.error, 'ORDER_NOT_FOUND');
  assert.equal(
    mockDb.rootUpdateCalls,
    rootUpdatesAfterW2,
    'Stale Worker 1 MUST NOT execute root update after Worker 2 finalized DELETED'
  );
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
  assert.equal(mockDb.data.privateOrderIdempotency.idem_w1.status, 'DELETED');
});

test('7b. Stale Worker 1 waking while Worker 2 holds active DELETING/COMMITTING_DELETE lock cannot clear Worker 2 lock via rollback', async () => {
  const orderId = 'ord_stale_w1_while_w2_active';
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: buildCompleteOrder() },
    privateOrderIdempotency: {
      idem_w2: {
        requestKeyHash: 'idem_w2',
        requestFingerprint: 'fp_w2',
        status: 'COMMITTED',
        reservedOrderId: orderId,
        attemptId: 'att_w2'
      }
    }
  });

  const tStart = Date.UTC(2026, 10, 14, 12, 0, 0);
  const tCommitW1 = tStart + 5_000;
  const commitDeleteLeaseMs = 45_000;
  const tW2 = tStart + 60_000;

  const w1Paused = createDeferred();
  const w1Resume = createDeferred();
  const w2PausedInCommit = createDeferred();
  const w2Resume = createDeferred();
  let w2AttemptId = null;

  const w1Promise = deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tStart,
      commitNowMs: tCommitW1,
      preUpdateNowMs: tW2 + 1000,
      commitDeleteLeaseMs,
      beforeRootUpdate: async () => {
        w1Paused.resolve();
        await w1Resume.promise;
      }
    }
  });

  await w1Paused.promise;

  // Worker 2 acquires lock and pauses in COMMITTING_DELETE
  const w2Promise = deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: tW2,
      commitNowMs: tW2 + 500,
      preUpdateNowMs: tW2 + 800,
      commitDeleteLeaseMs,
      beforeRootUpdate: async ({ deleteAttemptId }) => {
        w2AttemptId = deleteAttemptId;
        w2PausedInCommit.resolve();
        await w2Resume.promise;
      }
    }
  });

  await w2PausedInCommit.promise;
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'COMMITTING_DELETE');
  assert.equal(mockDb.data.privateDeletedOrders[orderId].deleteAttemptId, w2AttemptId);

  // Stale Worker 1 wakes up while Worker 2 is mid-COMMITTING_DELETE:
  // Worker 1 detects lease lost, runs rollbackLocksSafely(), and MUST leave Worker 2's tombstone & idempotency intact
  w1Resume.resolve();
  const w1Res = await w1Promise;
  assert.equal(w1Res.status, 409);
  assert.equal((await w1Res.json()).error, 'DELETE_LEASE_LOST');
  assert.equal(mockDb.rootUpdateCalls, 0);

  // Worker 2's lock and fenced idempotency record MUST still belong to Worker 2
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'COMMITTING_DELETE');
  assert.equal(mockDb.data.privateDeletedOrders[orderId].deleteAttemptId, w2AttemptId);
  assert.equal(mockDb.data.privateOrderIdempotency.idem_w2.status, 'DELETING');
  assert.equal(mockDb.data.privateOrderIdempotency.idem_w2.deleteAttemptId, w2AttemptId);

  w2Resume.resolve();
  const w2Res = await w2Promise;
  assert.equal(w2Res.status, 200);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
});

// ===========================================================================
// PART 2: CORE ORDER SHAPE VALIDATION & NOTIFICATION BLOCKING
// ===========================================================================

test('8 & 9. Rejects orders containing only name or only invoiceCode across validator, order-status API, and notifications', async () => {
  const nameOnlyOrder = { name: 'سارة محمود' };
  const invoiceOnlyOrder = { invoiceCode: 'DNY-999111' };

  assert.equal(hasValidCoreOrderShape(nameOnlyOrder), false);
  assert.equal(hasValidCoreOrderShape(invoiceOnlyOrder), false);
  assert.equal(hasCoreOrderFieldsForNotif(nameOnlyOrder), false);
  assert.equal(hasCoreOrderFieldsForNotif(invoiceOnlyOrder), false);

  const mockDb = createAsyncRtdbMock({
    orders: {
      ord_name_only: nameOnlyOrder,
      ord_invoice_only: invoiceOnlyOrder
    }
  });

  for (const orderId of ['ord_name_only', 'ord_invoice_only']) {
    const res = await orderStatusPOST({
      request: makeJsonReq(
        'http://localhost/api/order-status',
        { action: 'UPDATE_STATUS', orderId, newStatus: 'تم الشحن' },
        { Authorization: 'Bearer tok-admin-verified' }
      ),
      _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
    });
    assert.equal(res.status, 422, `${orderId} must be rejected with 422`);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_ORDER_SHAPE');
  }

  // Bulk update also rejects incomplete shapes without altering their status
  const bulkRes = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'BULK_UPDATE_STATUS', orderIds: ['ord_name_only', 'ord_invoice_only'], newStatus: 'ملغي' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  const bulkBody = await bulkRes.json();
  assert.equal(bulkBody.updatedCount, 0);
  assert.deepEqual(
    bulkBody.results.map((r) => r.error),
    ['INVALID_ORDER_SHAPE', 'INVALID_ORDER_SHAPE']
  );
  assert.equal(mockDb.data.orders.ord_name_only.status, undefined);
  assert.equal(mockDb.data.orders.ord_invoice_only.status, undefined);
});

test('10. Rejects orders without valid products or items (missing, empty, bad quantity, missing/negative prices, bad totals, bad status)', async () => {
  const invalidOrders = [
    // Missing products & items
    buildCompleteOrder({ products: undefined, items: undefined }),
    // Empty products array
    buildCompleteOrder({ products: [] }),
    // Empty items object
    buildCompleteOrder({ products: undefined, items: {} }),
    // Non-object entry inside products
    buildCompleteOrder({ products: ['bad-item'] }),
    // Item missing name / productName
    buildCompleteOrder({ products: [{ quantity: 1, price: 400 }] }),
    // Item with quantity <= 0 or NaN
    buildCompleteOrder({ products: [{ name: 'كريم', quantity: 0, price: 400 }] }),
    buildCompleteOrder({ products: [{ name: 'كريم', quantity: 'abc', price: 400 }] }),
    // Item missing all price fields
    buildCompleteOrder({ products: [{ name: 'كريم', quantity: 1 }] }),
    // Item with negative price
    buildCompleteOrder({ products: [{ name: 'كريم', quantity: 1, price: -50 }] }),
    // Zero or invalid totalAmount
    buildCompleteOrder({ totalAmount: 0 }),
    buildCompleteOrder({ totalAmount: 'NaN' }),
    // Invalid status
    buildCompleteOrder({ status: 'corrupted_unknown_status' }),
    // Placeholder N/A invoiceCode
    buildCompleteOrder({ invoiceCode: 'N/A' }),
    // No valid phone or valid email (COD with email='N/A' and missing/bad phone)
    buildCompleteOrder({ email: 'N/A', phone: '' }),
    buildCompleteOrder({ email: 'N/A', phone: '123' })
  ];

  for (let i = 0; i < invalidOrders.length; i++) {
    assert.equal(
      hasValidCoreOrderShape(invalidOrders[i]),
      false,
      `Expected invalidOrders[${i}] to be rejected`
    );
  }
  assert.equal(isValidOrderStatusValue('corrupted_unknown_status'), false);
});

test('11. Accepts legitimate legacy and current orders across supported schemas', async () => {
  // Legacy schema A: `items` object map with `productName`, `qty`, `unitPrice`, `grandTotal`, string numbers, English legacy status 'completed'
  const legacyOrderA = {
    invoiceCode: 'DNY-OLD-1001',
    status: 'completed',
    name: 'منى علي',
    phone: '01122334455',
    email: 'N/A', // Legitimate COD without email
    grandTotal: '585',
    subtotal: '500',
    shippingFee: '85',
    items: {
      item_0: { productName: 'زيت طبيعي', qty: '2', unitPrice: '250' }
    }
  };

  // Legacy schema B: `products` object map, Arabic legacy status 'تم التواصل', nested customer object fallback
  const legacyOrderB = {
    invoiceCode: 'DNY-OLD-1002',
    status: 'تم التواصل',
    customer: {
      name: 'هبة طارق',
      phone: '01234567890',
      email: 'heba@example.com'
    },
    subtotal: 300,
    shippingFee: 70,
    totalAmount: 370,
    products: {
      0: { name: 'مخمرية', quantity: 1, price: 300 }
    }
  };

  // Legacy schema C: no totalAmount/grandTotal saved, relies on subtotal + lineTotal, status 'new'
  const legacyOrderC = {
    invoiceCode: 'DNY-OLD-1003',
    status: 'new',
    name: 'ريم حسن',
    email: 'reem@example.com',
    subtotal: 450,
    products: [{ name: 'سيروم', quantity: 1, lineTotal: 450 }]
  };

  // Current standard order
  const currentOrder = buildCompleteOrder();

  assert.equal(hasValidCoreOrderShape(legacyOrderA), true, 'Legacy schema A should be accepted');
  assert.equal(hasValidCoreOrderShape(legacyOrderB), true, 'Legacy schema B should be accepted');
  assert.equal(hasValidCoreOrderShape(legacyOrderC), true, 'Legacy schema C should be accepted');
  assert.equal(hasValidCoreOrderShape(currentOrder), true, 'Current order schema should be accepted');

  // Verify order-status API accepts updating a legitimate legacy order cleanly
  const mockDb = createAsyncRtdbMock({
    orders: {
      ord_legacy_a: legacyOrderA
    }
  });
  let notifInvoked = false;
  const res = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'UPDATE_STATUS', orderId: 'ord_legacy_a', newStatus: 'تم الشحن' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      sendOrderNotification: async () => {
        notifInvoked = true;
        return { success: true, status: 'pending', notificationId: 'n_leg' };
      }
    }
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.status, 'تم الشحن');
  assert.equal(mockDb.data.orders.ord_legacy_a.status, 'تم الشحن');
  assert.equal(notifInvoked, true);
});

test('12. Prevents sending notifications for incomplete orders (direct sendOrderNotification, RETRY_NOTIFICATION, SEND_CURRENT_STATUS_NOTIFICATION, and latestNotification tx)', async () => {
  const incompleteOrderId = 'ord_incomplete_notif';
  const mockDb = createAsyncRtdbMock({
    orders: {
      [incompleteOrderId]: {
        invoiceCode: 'DNY-BAD-99',
        status: 'تم الشحن',
        name: 'عميلة ناقصة',
        email: 'bad-order@example.com',
        totalAmount: 300
        // Missing products/items and phone!
      }
    },
    notifications_outbox: {
      [`notif_order_${incompleteOrderId}_status_delivered`]: {
        notificationId: `notif_order_${incompleteOrderId}_status_delivered`,
        orderId: incompleteOrderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        orderStatus: 'تم التوصيل',
        status: 'failed',
        attempts: 1
      }
    }
  });

  const origFetch = globalThis.fetch;
  const origGmail = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origRelayUrl = process.env.GMAIL_RELAY_URL;
  const origRelaySecret = process.env.GMAIL_RELAY_SECRET;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_secret_key';

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    // 1. Direct sendOrderNotification MUST abort without touching relay, tokens, or outbox
    const directRes = await sendOrderNotification({
      order: mockDb.data.orders[incompleteOrderId],
      orderId: incompleteOrderId,
      eventType: 'ORDER_STATUS_CHANGED',
      oldStatus: 'جديد',
      newStatus: 'تم الشحن',
      adminDb: mockDb
    });

    assert.equal(directRes.success, false);
    assert.equal(directRes.status, 'failed');
    assert.equal(fetchCalled, false, 'Relay HTTP fetch MUST NOT be called for incomplete order');
    assert.equal(mockDb.data.privateOrderAccess, undefined, 'No invoice token should be created for incomplete order');
    assert.equal(
      mockDb.data.notifications_outbox[`notif_order_${incompleteOrderId}_status_shipped`],
      undefined,
      'No outbox record should be created for incomplete order'
    );

    // 2. RETRY_NOTIFICATION on order-status rejects with 422 INVALID_ORDER_SHAPE
    const retryRes = await orderStatusPOST({
      request: makeJsonReq(
        'http://localhost/api/order-status',
        {
          action: 'RETRY_NOTIFICATION',
          orderId: incompleteOrderId,
          notificationId: `notif_order_${incompleteOrderId}_status_delivered`
        },
        { Authorization: 'Bearer tok-admin-verified' }
      ),
      _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
    });
    assert.equal(retryRes.status, 422);
    assert.equal((await retryRes.json()).error, 'INVALID_ORDER_SHAPE');
    assert.equal(fetchCalled, false);

    // 3. SEND_CURRENT_STATUS_NOTIFICATION rejects with 422 INVALID_ORDER_SHAPE
    const sendCurRes = await orderStatusPOST({
      request: makeJsonReq(
        'http://localhost/api/order-status',
        {
          action: 'SEND_CURRENT_STATUS_NOTIFICATION',
          orderId: incompleteOrderId
        },
        { Authorization: 'Bearer tok-admin-verified' }
      ),
      _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
    });
    assert.equal(sendCurRes.status, 422);
    assert.equal((await sendCurRes.json()).error, 'INVALID_ORDER_SHAPE');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = origFetch;
    if (origGmail === undefined) delete process.env.GMAIL_NOTIFICATIONS_ENABLED;
    else process.env.GMAIL_NOTIFICATIONS_ENABLED = origGmail;
    if (origRelayUrl === undefined) delete process.env.GMAIL_RELAY_URL;
    else process.env.GMAIL_RELAY_URL = origRelayUrl;
    if (origRelaySecret === undefined) delete process.env.GMAIL_RELAY_SECRET;
    else process.env.GMAIL_RELAY_SECRET = origRelaySecret;
  }
});
