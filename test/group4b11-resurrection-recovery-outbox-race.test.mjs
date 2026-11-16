// test/group4b11-resurrection-recovery-outbox-race.test.mjs
// Group 4B.1.1: Order Deletion Fencing, Crash Recovery, Outbox Race & Verified Linking Hardening

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { POST as orderStatusPOST } from '../src/pages/api/order-status.js';
import { POST as deleteOrderPOST } from '../src/pages/api/admin/delete-order.js';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import {
  claimOutboxNotification,
  finalizeOutboxNotification,
  dispatchTelegramOutboxNotification,
  dispatchMakeWebhookOutboxNotification
} from '../src/utils/notifications-outbox.ts';
import { hashClientRequestId } from '../src/utils/order-idempotency.ts';

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
    // Bump parent path versions too so child/parent interactions invalidate cleanly
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
        if (options.failReadsOnPrefix && p.startsWith(options.failReadsOnPrefix)) {
          throw new Error(`Simulated RTDB read error on ${p}`);
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
        if (options.failRootUpdate && !p) {
          throw new Error('Simulated atomic root update failure');
        }
        if (typeof options.onRootUpdate === 'function' && !p) {
          await options.onRootUpdate(updates);
        }
        if (p) {
          const existing = getAtPath(p) || {};
          setAtPath(p, { ...existing, ...updates });
        } else {
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
        }
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

          const nextVal = updater(clonedCurrent);
          await tick();

          if (typeof options.onTransactionAttempt === 'function') {
            await options.onTransactionAttempt({ path: p, attempts, startVer });
          }

          if (getVersion(p) !== startVer) {
            continue;
          }

          if (nextVal !== undefined) {
            setAtPath(p, nextVal);
          }
          const finalVal = getAtPath(p);
          return {
            committed: nextVal !== undefined,
            snapshot: {
              exists: () => finalVal !== null && finalVal !== undefined,
              val: () =>
                finalVal === null || finalVal === undefined ? null : JSON.parse(JSON.stringify(finalVal))
            }
          };
        }
        throw new Error('Transaction max retries exceeded');
      }
    };
  }

  return {
    data,
    ref: (p = '') => makeRef(p)
  };
}

function createMockAdminAuth(tokenMap = {}) {
  return {
    async verifyIdToken(token) {
      if (!token || typeof token !== 'string' || !tokenMap[token]) {
        const err = new Error('Invalid or expired Firebase ID token');
        err.code = 'auth/argument-error';
        throw err;
      }
      return tokenMap[token];
    }
  };
}

function makeJsonReq(url, body, headers = {}, method = 'POST') {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: method === 'GET' ? undefined : JSON.stringify(body)
  });
}

function loadOrderFlowHelpers() {
  const helperSource = fsSync.readFileSync(
    path.resolve('public/assets/js/order-flow-helpers.js'),
    'utf8'
  );
  const sandbox = {
    globalThis: null,
    crypto: globalThis.crypto,
    TextEncoder,
    URLSearchParams
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(helperSource, sandbox);
  return sandbox.DandyOrderFlow;
}

const ADMIN_AUTH = createMockAdminAuth({
  'tok-admin-verified': { uid: 'admin_1', email: 'admin@dandy.com', email_verified: true }
});

// ===========================================================================
// SECTION A: ORDER RESURRECTION PREVENTION
// ===========================================================================

test('A1. UPDATE_STATUS racing concurrently with delete-order never resurrects orders/{orderId}', async () => {
  const orderId = 'ord_race_single_1';
  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: {
        invoiceCode: 'DNY-100001',
        status: 'جديد',
        name: 'مريم عادل',
        phone: '01012345678',
        email: 'mariam@example.com',
        totalAmount: 350,
        products: [{ id: 'p1', name: 'كريم', quantity: 1, price: 350 }]
      }
    }
  });

  const reachedBeforeTx = createDeferred();
  const allowTxResume = createDeferred();
  let notifCalled = false;

  const updatePromise = orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'UPDATE_STATUS', orderId, newStatus: 'تم الشحن' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      sendOrderNotification: async () => {
        notifCalled = true;
        return { success: true, status: 'accepted_by_mailapp', notificationId: 'n1' };
      },
      beforeStatusTransaction: async () => {
        reachedBeforeTx.resolve();
        await allowTxResume.promise;
      }
    }
  });

  await reachedBeforeTx.promise;

  // Admin deletes order while UPDATE_STATUS is paused right before updating orders/{orderId}
  const delRes = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(delRes.status, 200);
  assert.equal(mockDb.data.orders?.[orderId], undefined);
  assert.equal(mockDb.data.privateDeletedOrders?.[orderId]?.status, 'DELETED');

  // Resume stale UPDATE_STATUS
  allowTxResume.resolve();
  const updateRes = await updatePromise;
  const updateBody = await updateRes.json();

  assert.equal(updateRes.status, 409);
  assert.equal(updateBody.error, 'ORDER_DELETED');
  assert.equal(mockDb.data.orders?.[orderId], undefined, 'Deleted order MUST NEVER be resurrected by UPDATE_STATUS');
  assert.equal(notifCalled, false, 'Notification MUST NOT be dispatched for deleted order');
});

test('A2. BULK_UPDATE_STATUS racing with delete-order never resurrects deleted order while updating valid siblings', async () => {
  const deletedId = 'ord_bulk_del_1';
  const liveId = 'ord_bulk_live_2';
  const mockDb = createAsyncRtdbMock({
    orders: {
      [deletedId]: {
        invoiceCode: 'DNY-200001',
        status: 'جديد',
        name: 'سارة',
        phone: '01012345678',
        email: 'N/A',
        totalAmount: 200,
        products: [{ id: 'p1', name: 'كريم', quantity: 1, price: 200, lineTotal: 200 }]
      },
      [liveId]: {
        invoiceCode: 'DNY-200002',
        status: 'جديد',
        name: 'نور',
        phone: '01098765432',
        email: 'N/A',
        totalAmount: 250,
        products: [{ id: 'p2', name: 'سيروم', quantity: 1, price: 250, lineTotal: 250 }]
      }
    }
  });

  const reachedFirst = createDeferred();
  const allowFirst = createDeferred();

  const bulkPromise = orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'BULK_UPDATE_STATUS', orderIds: [deletedId, liveId], newStatus: 'قيد التجهيز' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      beforeStatusTransaction: async ({ orderId }) => {
        if (orderId === deletedId) {
          reachedFirst.resolve();
          await allowFirst.promise;
        }
      }
    }
  });

  await reachedFirst.promise;

  const delRes = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId: deletedId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(delRes.status, 200);

  allowFirst.resolve();
  const bulkRes = await bulkPromise;
  assert.equal(bulkRes.status, 200);
  const bulkBody = await bulkRes.json();

  const deletedItemResult = bulkBody.results.find((r) => r.orderId === deletedId);
  const liveItemResult = bulkBody.results.find((r) => r.orderId === liveId);

  assert.equal(deletedItemResult.success, false);
  assert.equal(deletedItemResult.error, 'ORDER_DELETED');
  assert.equal(mockDb.data.orders?.[deletedId], undefined, 'BULK_UPDATE_STATUS must never resurrect deleted order');
  assert.equal(liveItemResult.success, true);
  assert.equal(mockDb.data.orders?.[liveId]?.status, 'قيد التجهيز');
});

test('A3. Fail-closed DB read error on privateDeletedOrders blocks status writes & notification updates', async () => {
  const orderId = 'ord_db_err_1';
  const mockDb = createAsyncRtdbMock(
    {
      orders: {
        [orderId]: {
          invoiceCode: 'DNY-300001',
          status: 'جديد',
          name: 'ندى',
          totalAmount: 400
        }
      }
    },
    { failReadsOnPrefix: 'privateDeletedOrders/' }
  );

  const singleRes = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'UPDATE_STATUS', orderId, newStatus: 'تم التوصيل' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(singleRes.status, 503);
  assert.equal(mockDb.data.orders[orderId].status, 'جديد', 'Status must remain untouched on verification error');

  const bulkRes = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'BULK_UPDATE_STATUS', orderIds: [orderId], newStatus: 'تم التوصيل' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  const bulkBody = await bulkRes.json();
  assert.equal(bulkBody.results[0].success, false);
  assert.equal(bulkBody.results[0].error, 'DATABASE_VERIFICATION_FAILED');
  assert.equal(mockDb.data.orders[orderId].status, 'جديد');
});

test('A4. Rejects DELETING tombstones & blocks email-service latestNotification resurrection when order deleted', async () => {
  const deletingId = 'ord_tomb_deleting';
  const mockDb = createAsyncRtdbMock({
    privateDeletedOrders: {
      [deletingId]: { orderId: deletingId, status: 'DELETING', requestedAt: new Date().toISOString() }
    },
    orders: {
      [deletingId]: { invoiceCode: 'DNY-400001', status: 'جديد', name: 'سلمى', totalAmount: 300 }
    }
  });

  const updRes = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'UPDATE_STATUS', orderId: deletingId, newStatus: 'ملغي' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(updRes.status, 409);
  assert.equal((await updRes.json()).error, 'ORDER_DELETED');

  // Conditional transaction on orders/{id} in email-service also refuses to resurrect missing/deleted order
  const hexKey = crypto.randomBytes(32).toString('hex');
  const emailDb = createAsyncRtdbMock({
    orders: {
      ord_email_gone: {
        invoiceCode: 'DNY-400002',
        status: 'جديد',
        name: 'ليلى',
        email: 'layla@example.com',
        totalAmount: 300,
        products: [{ name: 'سيروم', quantity: 1, price: 300 }]
      }
    }
  });

  const origFetch = globalThis.fetch;
  const origEnv = { ...process.env };
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock/exec';
  process.env.GMAIL_RELAY_SECRET = 'sec_123';

  globalThis.fetch = async (url) => {
    if (String(url).includes('script.google.com')) {
      // Simulate order purged (without privateDeletedOrders or outbox finalized elsewhere) right before latestNotification transaction
      delete emailDb.data.orders.ord_email_gone;
      return new Response(JSON.stringify({ success: true, message: 'Accepted' }), { status: 200 });
    }
    return origFetch(url);
  };

  try {
    await sendOrderNotification({
      order: {
        invoiceCode: 'DNY-400002',
        status: 'تم الشحن',
        name: 'ليلى',
        email: 'layla@example.com',
        totalAmount: 300,
        products: [{ name: 'سيروم', quantity: 1, price: 300 }]
      },
      orderId: 'ord_email_gone',
      eventType: 'ORDER_STATUS_CHANGED',
      newStatus: 'تم الشحن',
      oldStatus: 'جديد',
      adminDb: emailDb,
      encryptionKey: hexKey
    });

    assert.equal(
      emailDb.data.orders?.ord_email_gone,
      undefined,
      'email-service must NEVER resurrect orders/{id} via latestNotification'
    );
  } finally {
    process.env = origEnv;
    globalThis.fetch = origFetch;
  }
});

// ===========================================================================
// SECTION B: DELETE LOCK LEASE & CRASH RECOVERY
// ===========================================================================

test('B1. Active DELETING lease blocks retry (409); expired lease recovers safely after crash in Step A', async () => {
  const orderId = 'ord_crash_step_a';
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);

  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: { invoiceCode: 'DNY-500001', status: 'جديد', name: 'عميلة', totalAmount: 500 }
    },
    privateOrderAccess: {
      [orderId]: { orderId, tokenHash: 'th_500', status: 'active' }
    },
    privateInvoiceAccess: {
      th_500: { tokenHash: 'th_500', orderId, status: 'active' }
    },
    privateOrderIdempotency: {
      [keyHash]: {
        requestKeyHash: keyHash,
        requestFingerprint: 'fp_500',
        status: 'COMPLETED',
        reservedOrderId: orderId,
        attemptId: 'att_500',
        responseSummary: { orderId, invoiceCode: 'DNY-500001', totalAmount: 500 }
      }
    }
  });

  const t0 = Date.UTC(2026, 10, 14, 10, 0, 0);

  // Worker 1 acquires tombstone lock then crashes BEFORE committing cleanup (simulate via throw without rollback or direct pre-seeded crash, plus test thrown hook)
  // Inject a tombstone directly simulating hard process kill right after Step A (no rollback executed)
  await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: t0,
      deleteLeaseMs: 30_000,
      afterTombstoneLock: async () => {
        // Hard crash before cleanup (simulate SIGKILL leaving DELETING lock)
        const crashSnapshot = JSON.parse(JSON.stringify(mockDb.data.privateDeletedOrders[orderId]));
        mockDb.__crashedTombstone = crashSnapshot;
        throw new Error('Simulated SIGKILL');
      }
    }
  });
  // Restore crashed tombstone (rollback ran because we threw in JS; re-plant crashed tombstone to mimic hard process crash)
  mockDb.data.privateDeletedOrders[orderId] = mockDb.__crashedTombstone;

  // Before lease expires (t0 + 5s) -> rejected 409 DELETE_IN_PROGRESS
  const activeRes = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb, nowMs: t0 + 5_000, deleteLeaseMs: 30_000 }
  });
  assert.equal(activeRes.status, 409);
  assert.equal((await activeRes.json()).error, 'DELETE_IN_PROGRESS');

  // After lease expires (t0 + 35s) -> Worker 2 recovers and finishes deletion
  const recoverRes = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb, nowMs: t0 + 35_000, deleteLeaseMs: 30_000 }
  });
  assert.equal(recoverRes.status, 200);
  const recoverBody = await recoverRes.json();
  assert.equal(recoverBody.recoveredFromCrash, true);
  assert.equal(mockDb.data.orders?.[orderId], undefined);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'DELETED');
  assert.equal(mockDb.data.privateInvoiceAccess.th_500.status, 'revoked');
});

test('B2. Crash after fencing privateOrderIdempotency recovers cleanly on expired lease & replay remains blocked', async () => {
  const orderId = 'ord_crash_idem_fence';
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);
  const t0 = Date.UTC(2026, 10, 14, 11, 0, 0);
  const expiredIso = new Date(t0 - 5_000).toISOString();

  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: { invoiceCode: 'DNY-500002', status: 'جديد', name: 'سلوى', totalAmount: 600 }
    },
    privateOrderAccess: {
      [orderId]: { orderId, tokenHash: 'th_502', status: 'active' }
    },
    privateInvoiceAccess: {
      th_502: { tokenHash: 'th_502', orderId, status: 'active' }
    },
    privateDeletedOrders: {
      [orderId]: {
        orderId,
        status: 'DELETING',
        deleteAttemptId: 'crashed-att-1',
        requestedAt: new Date(t0 - 35_000).toISOString(),
        deleteLeaseExpiresAt: expiredIso
      }
    },
    privateOrderIdempotency: {
      [keyHash]: {
        requestKeyHash: keyHash,
        requestFingerprint: 'fp_502',
        status: 'DELETING',
        previousStatus: 'COMPLETED',
        reservedOrderId: orderId,
        attemptId: 'att_orig_502',
        deleteAttemptId: 'crashed-att-1',
        deleteLeaseExpiresAt: expiredIso,
        deletingAt: new Date(t0 - 35_000).toISOString()
      }
    }
  });

  const recoverRes = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb, nowMs: t0 }
  });

  assert.equal(recoverRes.status, 200);
  const recoverBody = await recoverRes.json();
  assert.equal(recoverBody.recoveredFromCrash, true);
  assert.equal(mockDb.data.orders?.[orderId], undefined);
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'DELETED');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].responseSummary, undefined);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');

  // Replaying create-order with same clientRequestId is blocked with 409 ORDER_DELETED
  const replayRes = await createOrderPOST({
    request: makeJsonReq('http://localhost/api/create-order', {
      clientRequestId: reqUuid,
      customer: {
        name: 'سلوى',
        phone: '01011223344',
        email: 'salwa@example.com',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9'
      },
      items: [{ productId: 'prod_x', quantity: 1 }],
      turnstileToken: 'ok'
    }),
    clientAddress: '41.41.10.99',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: crypto.randomBytes(32).toString('hex'),
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(replayRes.status, 409);
  assert.equal((await replayRes.json()).error, 'ORDER_DELETED');
});

test('B3. Concurrent recovery workers racing on expired DELETING lease allow only 1 winner', async () => {
  const orderId = 'ord_concurrent_recover';
  const t0 = Date.UTC(2026, 10, 14, 12, 0, 0);
  const expiredIso = new Date(t0 - 1_000).toISOString();

  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: { invoiceCode: 'DNY-500003', status: 'جديد', name: 'دينا', totalAmount: 300 }
    },
    privateOrderAccess: {
      [orderId]: { orderId, tokenHash: 'th_503', status: 'active' }
    },
    privateDeletedOrders: {
      [orderId]: {
        orderId,
        status: 'DELETING',
        deleteAttemptId: 'crashed-old-1',
        requestedAt: new Date(t0 - 40_000).toISOString(),
        deleteLeaseExpiresAt: expiredIso
      }
    }
  });

  const [r1, r2] = await Promise.all([
    deleteOrderPOST({
      request: makeJsonReq(
        'http://localhost/api/admin/delete-order',
        { orderId },
        { Authorization: 'Bearer tok-admin-verified' }
      ),
      _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb, nowMs: t0 }
    }),
    deleteOrderPOST({
      request: makeJsonReq(
        'http://localhost/api/admin/delete-order',
        { orderId },
        { Authorization: 'Bearer tok-admin-verified' }
      ),
      _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb, nowMs: t0 }
    })
  ]);

  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  assert.equal(statuses[0], 200, 'Exactly one recovery worker should succeed with 200');
  assert.ok(
    statuses[1] === 409 || statuses[1] === 404,
    `Second concurrent recovery worker must lose cleanly with 409 or 404, got ${statuses[1]}`
  );
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
});

test('B4. Recovery inspects already-cleaned order: finalizes tombstone to DELETED without altering DELETED idempotency or outbox', async () => {
  const orderId = 'ord_already_cleaned';
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);
  const t0 = Date.UTC(2026, 10, 14, 13, 0, 0);
  const originalDeletedAt = '2026-11-10T09:00:00.000Z';

  const mockDb = createAsyncRtdbMock({
    privateDeletedOrders: {
      [orderId]: {
        orderId,
        status: 'DELETING',
        deleteAttemptId: 'crashed-after-clean',
        requestedAt: new Date(t0 - 50_000).toISOString(),
        deleteLeaseExpiresAt: new Date(t0 - 10_000).toISOString()
      }
    },
    privateOrderAccess: {
      [orderId]: { orderId, status: 'revoked', revokedAt: originalDeletedAt }
    },
    privateInvoiceAccess: {
      th_clean: { tokenHash: 'th_clean', orderId, status: 'revoked', revokedAt: originalDeletedAt }
    },
    privateOrderIdempotency: {
      [keyHash]: {
        requestKeyHash: keyHash,
        requestFingerprint: 'fp_clean',
        status: 'DELETED',
        reservedOrderId: orderId,
        deletedAt: originalDeletedAt
      }
    },
    notifications_outbox: {
      [`notif_order_${orderId}_confirmation`]: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'cancelled_order_deleted',
        attempts: 0,
        orderDeletedAt: originalDeletedAt
      }
    }
  });

  const res = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb, nowMs: t0 }
  });

  assert.equal(res.status, 404);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
  assert.equal(
    mockDb.data.privateOrderIdempotency[keyHash].deletedAt,
    originalDeletedAt,
    'Existing DELETED idempotency timestamp must NOT be overwritten'
  );
  assert.equal(
    mockDb.data.notifications_outbox[`notif_order_${orderId}_confirmation`].orderDeletedAt,
    originalDeletedAt,
    'Already-cleaned outbox record must NOT be overwritten'
  );
});

test('B5. Stale Worker 1 paused before commit is rejected by COMMITTING_DELETE gate and never alters Worker 2 DELETED state', async () => {
  const orderId = 'ord_stale_worker1';
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);
  const t0 = Date.UTC(2026, 10, 14, 14, 0, 0);

  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: { invoiceCode: 'DNY-500005', status: 'جديد', name: 'هالة', totalAmount: 350 }
    },
    privateOrderAccess: {
      [orderId]: { orderId, tokenHash: 'th_505', status: 'active' }
    },
    privateOrderIdempotency: {
      [keyHash]: {
        requestKeyHash: keyHash,
        requestFingerprint: 'fp_505',
        status: 'COMPLETED',
        reservedOrderId: orderId,
        attemptId: 'att_505'
      }
    }
  });

  const worker1Paused = createDeferred();
  const worker1Resume = createDeferred();

  const worker1Promise = deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: t0,
      deleteLeaseMs: 10_000,
      beforeDeleteCommit: async () => {
        worker1Paused.resolve();
        await worker1Resume.promise;
      }
    }
  });

  await worker1Paused.promise;

  // Worker 2 wakes up after Worker 1 lease expires (t0 + 20s) and completes full deletion
  const worker2Res = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: {
      adminAuth: ADMIN_AUTH,
      adminDb: mockDb,
      nowMs: t0 + 20_000,
      deleteLeaseMs: 10_000
    }
  });
  assert.equal(worker2Res.status, 200);
  const worker2DeletedAt = mockDb.data.privateDeletedOrders[orderId].deletedAt;
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');

  // Resume stale Worker 1 -> must fail cleanly without touching Worker 2's DELETED state
  worker1Resume.resolve();
  const worker1Res = await worker1Promise;
  assert.ok(worker1Res.status === 404 || worker1Res.status === 409);
  assert.equal(mockDb.data.privateDeletedOrders[orderId].status, 'DELETED');
  assert.equal(
    mockDb.data.privateDeletedOrders[orderId].deletedAt,
    worker2DeletedAt,
    'Stale Worker 1 must NOT overwrite Worker 2 DELETED tombstone or roll it back'
  );
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'DELETED');
});

// ===========================================================================
// SECTION C: OUTBOX RACE & DELETE DURING DISPATCH
// ===========================================================================

test('C1. Deletion triggered right after processing claim but before HTTP dispatch cancels cleanly without calling external provider', async () => {
  const orderId = 'ord_outbox_pre_dispatch';
  const notifId = `notif_order_${orderId}_telegram`;

  let injectedDeleteOnce = false;
  let mockDb;
  mockDb = createAsyncRtdbMock(
    {
      orders: {
        [orderId]: { invoiceCode: 'DNY-600001', status: 'جديد', name: 'منى', email: 'mona@example.com' }
      },
      notifications_outbox: {
        [notifId]: {
          notificationId: notifId,
          orderId,
          channel: 'telegram',
          eventType: 'TELEGRAM_ORDER_NOTIFICATION',
          status: 'pending',
          recipientEmail: 'mona@example.com',
          attempts: 0
        }
      }
    },
    {
      // Inject DELETING tombstone right after outbox claim transaction commits `processing`, BEFORE post-claim recheck runs
      onTransactionAttempt: async ({ path: txPath }) => {
        if (!injectedDeleteOnce && txPath === `notifications_outbox/${notifId}`) {
          injectedDeleteOnce = true;
          mockDb.data.privateDeletedOrders = {
            [orderId]: {
              orderId,
              status: 'DELETING',
              deleteAttemptId: 'del_concurrent_1',
              requestedAt: new Date().toISOString()
            }
          };
        }
      }
    }
  );

  let telegramHttpCalled = false;
  const tgRes = await dispatchTelegramOutboxNotification({
    orderId,
    orderData: { invoiceCode: 'DNY-600001', name: 'منى', totalAmount: 300 },
    adminDb: mockDb,
    sendTelegramFn: async () => {
      telegramHttpCalled = true;
      return { success: true, status: 'SUCCESS' };
    }
  });

  assert.equal(telegramHttpCalled, false, 'External provider MUST NOT be called when order entered DELETING before dispatch');
  assert.equal(tgRes.claimed, false);
  assert.equal(tgRes.status, 'cancelled_order_deleted');
  assert.equal(mockDb.data.notifications_outbox[notifId].status, 'cancelled_order_deleted');
  assert.equal(mockDb.data.notifications_outbox[notifId].recipientEmail, undefined);
});

test('C2. Order deleted DURING in-flight external dispatch writes unknown_deleted_during_dispatch and blocks late overwrite/resurrection', async () => {
  const orderId = 'ord_outbox_inflight';
  const notifId = `notif_order_${orderId}_confirmation`;
  const hexKey = crypto.randomBytes(32).toString('hex');

  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: {
        invoiceCode: 'DNY-600002',
        status: 'جديد',
        name: 'عليا',
        email: 'alia@example.com',
        phone: '01099887766',
        totalAmount: 450,
        products: [{ id: 'p1', name: 'سيروم', quantity: 1, price: 450 }]
      }
    },
    notifications_outbox: {
      [notifId]: {
        notificationId: notifId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending',
        recipientEmail: 'alia@example.com',
        recipientName: 'عليا',
        attempts: 0
      }
    }
  });

  const dispatchEntered = createDeferred();
  const dispatchFinish = createDeferred();

  const origFetch = globalThis.fetch;
  const origEnv = { ...process.env };
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock/exec';
  process.env.GMAIL_RELAY_SECRET = 'sec_456';

  globalThis.fetch = async (url) => {
    if (String(url).includes('script.google.com')) {
      dispatchEntered.resolve();
      await dispatchFinish.promise;
      return new Response(JSON.stringify({ success: true, message: 'Accepted by MailApp' }), {
        status: 200
      });
    }
    return origFetch(url);
  };

  try {
    const emailPromise = sendOrderNotification({
      order: mockDb.data.orders[orderId],
      orderId,
      eventType: 'ORDER_CONFIRMATION',
      adminDb: mockDb,
      encryptionKey: hexKey
    });

    await dispatchEntered.promise;
    assert.equal(mockDb.data.notifications_outbox[notifId].status, 'processing');

    // Delete the order while MailApp request is actively in-flight
    const delRes = await deleteOrderPOST({
      request: makeJsonReq(
        'http://localhost/api/admin/delete-order',
        { orderId },
        { Authorization: 'Bearer tok-admin-verified' }
      ),
      _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.unknownInFlightOutboxCount, 1);

    const outboxAfterDel = mockDb.data.notifications_outbox[notifId];
    assert.equal(
      outboxAfterDel.status,
      'unknown_deleted_during_dispatch',
      'In-flight processing outbox MUST become unknown_deleted_during_dispatch (never cancelled_order_deleted)'
    );
    assert.equal(outboxAfterDel.recipientEmail, undefined, 'PII must be stripped from audit record');
    assert.equal(outboxAfterDel.recipientName, undefined);
    assert.equal(outboxAfterDel.claimId, undefined);
    assert.ok(outboxAfterDel.orderDeletedAt);

    // Late relay success arrives after order deletion completed
    dispatchFinish.resolve();
    const emailRes = await emailPromise;

    assert.equal(emailRes.success, false);
    assert.equal(emailRes.status, 'unknown_deleted_during_dispatch');
    assert.equal(
      mockDb.data.notifications_outbox[notifId].status,
      'unknown_deleted_during_dispatch',
      'Late worker completion MUST NOT overwrite unknown_deleted_during_dispatch back to accepted_by_mailapp'
    );
    assert.equal(
      mockDb.data.orders?.[orderId],
      undefined,
      'Late worker completion MUST NOT resurrect orders/{orderId} with latestNotification'
    );
  } finally {
    process.env = origEnv;
    globalThis.fetch = origFetch;
  }
});

test('C3. Make webhook dispatch during deletion & Make/Outbox finalize fence blocks overwrite', async () => {
  const orderId = 'ord_make_inflight';
  const notifId = `notif_order_${orderId}_make`;
  const mockDb = createAsyncRtdbMock({
    orders: {
      [orderId]: { invoiceCode: 'DNY-600003', status: 'جديد', name: 'تسنيم', totalAmount: 300 }
    },
    notifications_outbox: {
      [notifId]: {
        notificationId: notifId,
        orderId,
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const entered = createDeferred();
  const release = createDeferred();

  const makePromise = dispatchMakeWebhookOutboxNotification({
    orderId,
    orderData: mockDb.data.orders[orderId],
    adminDb: mockDb,
    makeWebhookUrl: 'https://hook.eu1.make.com/mock-test',
    fetchFn: async () => {
      entered.resolve();
      await release.promise;
      return new Response('Accepted', { status: 200 });
    }
  });

  await entered.promise;
  const delRes = await deleteOrderPOST({
    request: makeJsonReq(
      'http://localhost/api/admin/delete-order',
      { orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(delRes.status, 200);
  assert.equal(mockDb.data.notifications_outbox[notifId].status, 'unknown_deleted_during_dispatch');

  release.resolve();
  const makeRes = await makePromise;
  assert.equal(makeRes.status, 'unknown_deleted_during_dispatch');
  assert.equal(mockDb.data.notifications_outbox[notifId].status, 'unknown_deleted_during_dispatch');

  // Direct finalizeOutboxNotification with stale claimId returns finalized: false
  const lateFin = await finalizeOutboxNotification({
    adminDb: mockDb,
    notificationId: notifId,
    claimId: 'any_stale_claim',
    status: 'sent'
  });
  assert.equal(lateFin.finalized, false);
  assert.equal(lateFin.status, 'unknown_deleted_during_dispatch');
});

test('C4. RETRY_NOTIFICATION and SEND_CURRENT_STATUS_NOTIFICATION reject cancelled_order_deleted, unknown_deleted_during_dispatch, and unknown', async () => {
  const orderId = 'ord_retry_blocks';
  const liveOrderId = 'ord_live_unknown';

  const mockDb = createAsyncRtdbMock({
    orders: {
      [liveOrderId]: {
        invoiceCode: 'DNY-700001',
        status: 'قيد التجهيز',
        name: 'ليلى',
        phone: '01011223344',
        email: 'layla@example.com',
        totalAmount: 300,
        products: [{ id: 'p3', name: 'غسول', quantity: 1, price: 300, lineTotal: 300 }]
      }
    },
    privateDeletedOrders: {
      [orderId]: { orderId, status: 'DELETED', deletedAt: new Date().toISOString() }
    },
    notifications_outbox: {
      notif_del_cancelled: {
        notificationId: 'notif_del_cancelled',
        orderId,
        status: 'cancelled_order_deleted'
      },
      notif_del_ambig: {
        notificationId: 'notif_del_ambig',
        orderId: liveOrderId, // even if stale outbox still points here
        status: 'unknown_deleted_during_dispatch'
      },
      [`notif_order_${liveOrderId}_status_processing`]: {
        notificationId: `notif_order_${liveOrderId}_status_processing`,
        orderId: liveOrderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        orderStatus: 'قيد التجهيز',
        status: 'unknown'
      }
    }
  });

  // 1. RETRY_NOTIFICATION on cancelled_order_deleted -> 409
  const rCancelled = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'RETRY_NOTIFICATION', orderId, notificationId: 'notif_del_cancelled' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(rCancelled.status, 409);

  // 2. RETRY_NOTIFICATION on unknown_deleted_during_dispatch -> 409
  const rDelAmbig = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'RETRY_NOTIFICATION', orderId: liveOrderId, notificationId: 'notif_del_ambig' },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(rDelAmbig.status, 409);
  assert.equal((await rDelAmbig.json()).error, 'ORDER_DELETED');

  // 3. RETRY_NOTIFICATION on unknown -> 409 AMBIGUOUS_NOTIFICATION_STATUS
  const rUnknown = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      {
        action: 'RETRY_NOTIFICATION',
        orderId: liveOrderId,
        notificationId: `notif_order_${liveOrderId}_status_processing`
      },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(rUnknown.status, 409);
  assert.equal((await rUnknown.json()).error, 'AMBIGUOUS_NOTIFICATION_STATUS');

  // 4. SEND_CURRENT_STATUS_NOTIFICATION on order whose outbox is `unknown` -> 409
  const sUnknown = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'SEND_CURRENT_STATUS_NOTIFICATION', orderId: liveOrderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(sUnknown.status, 409);

  // 5. SEND_CURRENT_STATUS_NOTIFICATION on deleted order -> 409
  const sDeleted = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'SEND_CURRENT_STATUS_NOTIFICATION', orderId },
      { Authorization: 'Bearer tok-admin-verified' }
    ),
    _deps: { adminAuth: ADMIN_AUTH, adminDb: mockDb }
  });
  assert.equal(sDeleted.status, 409);
});

// ===========================================================================
// SECTION D: VERIFIED EMAIL TOKEN REFRESH & NON-BLOCKING ACCOUNT LINKING
// ===========================================================================

test('D1. syncVerifiedCustomerOrdersLink reloads user, forces getIdToken(true), avoids stale token, and never blocks account on failure', async () => {
  const helpers = loadOrderFlowHelpers();
  assert.equal(typeof helpers.syncVerifiedCustomerOrdersLink, 'function');

  function makeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    };
  }

  // Scenario 1: User starts with emailVerified=false (just verified via link in another tab);
  // reload() flips emailVerified=true, then getIdToken(true) must be called and fresh token sent!
  const storage1 = makeStorage();
  const calls1 = [];
  let reloaded1 = false;
  let ordersReloaded1 = false;

  const user1 = {
    uid: 'cust_verify_1',
    emailVerified: false,
    async reload() {
      reloaded1 = true;
      user1.emailVerified = true;
    },
    async getIdToken(forceRefresh) {
      calls1.push({ type: 'getIdToken', forceRefresh });
      return forceRefresh === true ? 'FRESH_VERIFIED_TOKEN' : 'STALE_UNVERIFIED_TOKEN';
    }
  };

  const res1 = await helpers.syncVerifiedCustomerOrdersLink({
    user: user1,
    sessionStorage: storage1,
    fetchFn: async (url, opts) => {
      calls1.push({ type: 'fetch', url, body: JSON.parse(opts.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, linkedCount: 2 })
      };
    },
    onLinkedOrders: () => {
      ordersReloaded1 = true;
    }
  });

  assert.equal(reloaded1, true, 'user.reload() MUST be called before checking verification');
  assert.equal(res1.attempted, true);
  assert.equal(res1.ok, true);
  assert.equal(res1.linkedCount, 2);
  assert.equal(ordersReloaded1, true);
  assert.deepEqual(calls1[0], { type: 'getIdToken', forceRefresh: true }, 'MUST pass forceRefresh=true');
  assert.equal(
    calls1[1].body.idToken,
    'FRESH_VERIFIED_TOKEN',
    'MUST send refreshed ID token and NEVER send cached stale token'
  );
  assert.equal(storage1.getItem('dandy_orders_linked_cust_verify_1'), '1');

  // Repeat call in same session deduplicates without hitting network
  let fetchCalledAgain = false;
  const dedupRes = await helpers.syncVerifiedCustomerOrdersLink({
    user: user1,
    sessionStorage: storage1,
    fetchFn: async () => {
      fetchCalledAgain = true;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
  });
  assert.equal(dedupRes.deduplicated, true);
  assert.equal(fetchCalledAgain, false);

  // Scenario 2: User stays unverified even after reload() -> MUST NOT send token at all
  const storage2 = makeStorage();
  let tokenRequested2 = false;
  let fetchCalled2 = false;
  const user2 = {
    uid: 'cust_unverified_2',
    emailVerified: false,
    async reload() {
      // remains false
    },
    async getIdToken() {
      tokenRequested2 = true;
      return 'STALE_UNVERIFIED_TOKEN';
    }
  };
  const res2 = await helpers.syncVerifiedCustomerOrdersLink({
    user: user2,
    sessionStorage: storage2,
    fetchFn: async () => {
      fetchCalled2 = true;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
  });
  assert.equal(res2.attempted, false);
  assert.equal(res2.reason, 'EMAIL_NOT_VERIFIED');
  assert.equal(tokenRequested2, false);
  assert.equal(fetchCalled2, false);

  // Scenario 3: Network/server failure or reload() error NEVER throws or sets dedup key (never blocks account)
  const storage3 = makeStorage();
  const user3 = {
    uid: 'cust_fail_3',
    emailVerified: true,
    async getIdToken(forceRefresh) {
      assert.equal(forceRefresh, true);
      return 'FRESH_TOK_3';
    }
  };
  const res3 = await helpers.syncVerifiedCustomerOrdersLink({
    user: user3,
    sessionStorage: storage3,
    fetchFn: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'TEMP_FAIL' })
    })
  });
  assert.equal(res3.attempted, true);
  assert.equal(res3.ok, false);
  assert.equal(
    storage3.getItem('dandy_orders_linked_cust_fail_3'),
    null,
    'Dedup marker must NOT be written on failed link attempt so future session/load can retry'
  );
});
