// test/group2a-commit-fencing-outbox.test.mjs
// Group 2A: Idempotency Commit Fencing (PENDING -> COMMITTING -> COMPLETED),
// Real Async Interleaving (Deferred Barriers), Outbox Transaction Claiming & False-500 Immunity

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { hashInvoiceToken, isValidInvoiceTokenFormat } from '../src/utils/invoice-token.ts';
import {
  MAX_COMMIT_PAYLOAD_BYTES,
  hashClientRequestId,
  transitionPendingToCommitting,
  materializeCommitPayload,
  transitionCommittingToCompleted,
  reconcileIdempotencyAfterFailure
} from '../src/utils/order-idempotency.ts';
import {
  claimOutboxNotification,
  dispatchTelegramOutboxNotification,
  dispatchMakeWebhookOutboxNotification
} from '../src/utils/notifications-outbox.ts';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Async RTDB mock simulating real event-loop microtask/macrotask yields
 * plus Firebase RTDB optimistic CAS `.transaction()` retries on concurrent version shifts.
 */
function createAsyncRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();
  let pushCounter = 0;

  function tick() {
    return new Promise((r) => setTimeout(r, options.ioDelayMs ?? 1));
  }

  function getVersion(path) {
    return versions.get(path) || 0;
  }

  function bumpVersion(path) {
    versions.set(path, getVersion(path) + 1);
  }

  function getAtPath(path) {
    if (!path) return data;
    const parts = path.split('/').filter(Boolean);
    let curr = data;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return undefined;
      curr = curr[p];
    }
    return curr === undefined ? null : curr;
  }

  function setAtPath(path, val) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return;
    let curr = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (curr[p] == null || typeof curr[p] !== 'object') {
        curr[p] = {};
      }
      curr = curr[p];
    }
    const leaf = parts[parts.length - 1];
    if (val === null || val === undefined) {
      delete curr[leaf];
    } else {
      curr[leaf] = JSON.parse(JSON.stringify(val));
    }
    bumpVersion(path);
  }

  function makeRef(path = '') {
    return {
      key: path.split('/').filter(Boolean).pop() || null,
      async once() {
        await tick();
        if (options.failReads) throw new Error('Simulated RTDB read failure');
        const val = getAtPath(path);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        await tick();
        if (options.failWrites) throw new Error('Simulated RTDB write failure');
        setAtPath(path, val);
      },
      async update(updates) {
        await tick();
        if (
          options.failWrites ||
          (options.failMultiUpdate && !path) ||
          (options.failPrivateTokenWrites && Object.keys(updates).some((k) => k.startsWith('private')))
        ) {
          throw new Error('Simulated RTDB update failure');
        }
        if (path) {
          const existing = getAtPath(path) || {};
          setAtPath(path, { ...existing, ...updates });
        } else {
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
        }
      },
      push() {
        pushCounter++;
        const newKey = `-MockOrd2A_${pushCounter}`;
        return makeRef(path ? `${path}/${newKey}` : newKey);
      },
      async transaction(updater) {
        if (options.failTransactions) {
          throw new Error('Simulated RTDB transaction failure');
        }

        // Simulate Firebase RTDB multi-attempt CAS retry if version shifts before commit
        let attempts = 0;
        while (attempts < 10) {
          attempts++;
          const startVer = getVersion(path);
          const current = getAtPath(path);
          const clonedCurrent =
            current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));

          const nextVal = updater(clonedCurrent);

          if (typeof options.onTransactionAttempt === 'function') {
            await options.onTransactionAttempt({ path, attempts, startVer, committed: nextVal !== undefined });
          }

          await tick();

          // Optional injected external mutation between read and CAS write
          if (typeof options.injectRaceOnceOnAttempt === 'function') {
            await options.injectRaceOnceOnAttempt({ path, attempts });
          }

          if (getVersion(path) !== startVer) {
            // Version changed concurrently -> RTDB retries updater automatically!
            continue;
          }

          if (nextVal !== undefined) {
            setAtPath(path, nextVal);
          }
          const finalVal = getAtPath(path);
          return {
            committed: nextVal !== undefined,
            snapshot: {
              val: () =>
                finalVal === null || finalVal === undefined ? null : JSON.parse(JSON.stringify(finalVal))
            }
          };
        }
        throw new Error('Transaction max retries exceeded');
      }
    };
  }

  return { data, ref: makeRef };
}

function makeOrderReq(overrides = {}) {
  return new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'سلمى حسام',
        phone: '01099887766',
        email: 'salma@example.com',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9',
        ...(overrides.customer || {})
      },
      items: overrides.items || [{ productId: 'prod_1', quantity: 1 }],
      turnstileToken: overrides.turnstileToken ?? 'valid_turnstile',
      ...(overrides.clientRequestId !== undefined ? { clientRequestId: overrides.clientRequestId } : {})
    })
  });
}

// ===========================================================================
// 1. TOCTOU Closure: Worker 1 pauses before Commit TX; Lease expires & Worker 2 commits;
//    Worker 1 wakes up -> RTDB TX aborts cleanly, zero duplicate orders or orphan hashes
// ===========================================================================
test('1. Deferred-barrier TOCTOU race: Worker 1 waking after Worker 2 takeover & commit gets atomic TX abort and replay', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);

  const mockDb = createAsyncRtdbMock({
    products: { prod_1: { name: 'سيروم فيتامين سي', price: 350, stockQuantity: 10 } }
  });

  const w1AtCommitBarrier = createDeferred();
  const allowW1ToAttemptCommit = createDeferred();
  let emailCalls = 0;
  let tgCalls = 0;

  const worker1Promise = createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.1',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      idempotencyLeaseMs: 10,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => {
        emailCalls++;
        return { success: true, status: 'accepted_by_mailapp' };
      },
      sendTelegramNotification: async () => {
        tgCalls++;
        return { success: true, status: 'SUCCESS', allSuccessful: true };
      },
      beforeAtomicCommit: async () => {
        w1AtCommitBarrier.resolve();
        await allowW1ToAttemptCommit.promise;
      }
    }
  });

  await w1AtCommitBarrier.promise;
  // Wait for Worker 1 short 10ms PENDING lease to expire
  await new Promise((r) => setTimeout(r, 25));

  // Worker 2 arrives, takes over stale PENDING lease, commits through COMMITTING -> COMPLETED
  const worker2Res = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.1',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      idempotencyLeaseMs: 30_000,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => {
        emailCalls++;
        return { success: true, status: 'accepted_by_mailapp' };
      },
      sendTelegramNotification: async () => {
        tgCalls++;
        return { success: true, status: 'SUCCESS', allSuccessful: true };
      }
    }
  });

  assert.equal(worker2Res.status, 200);
  const w2Body = await worker2Res.json();

  // Wake Worker 1 right at `transitionPendingToCommitting`
  allowW1ToAttemptCommit.resolve();
  const worker1Res = await worker1Promise;
  const w1Body = await worker1Res.json();

  assert.equal(worker1Res.status, 200);
  assert.equal(w1Body.replayed, true);
  assert.equal(w1Body.orderId, w2Body.orderId);
  assert.equal(w1Body.invoiceCode, w2Body.invoiceCode);
  assert.equal(w1Body.invoiceAccessToken, w2Body.invoiceAccessToken);

  // Strictly ONE order, ONE privateOrderAccess, ONE privateInvoiceAccess (NO orphan hashes!)
  assert.equal(Object.keys(mockDb.data.orders).length, 1);
  assert.equal(Object.keys(mockDb.data.privateOrderAccess).length, 1);
  assert.equal(Object.keys(mockDb.data.privateInvoiceAccess).length, 1);
  assert.equal(mockDb.data.products.prod_1.stockQuantity, 9);
  assert.equal(emailCalls, 1);
  assert.equal(tgCalls, 1);
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'COMPLETED');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].commitPayload, undefined);
});

// ===========================================================================
// 2. TOCTOU Closure: Worker 2 took over PENDING & is still IN_FLIGHT;
//    Worker 1 wakes up before Worker 2 commits -> Worker 1 gets 409 ORDER_IN_PROGRESS
// ===========================================================================
test('2. Deferred-barrier TOCTOU race: Worker 1 waking while Worker 2 owns PENDING gets 409 ORDER_IN_PROGRESS', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();

  const mockDb = createAsyncRtdbMock({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } }
  });

  const w1Paused = createDeferred();
  const w1Resume = createDeferred();
  const w2Paused = createDeferred();
  const w2Resume = createDeferred();

  const w1Promise = createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.2',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      idempotencyLeaseMs: 10,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true }),
      beforeAtomicCommit: async () => {
        w1Paused.resolve();
        await w1Resume.promise;
      }
    }
  });

  await w1Paused.promise;
  await new Promise((r) => setTimeout(r, 25));

  const w2Promise = createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.2',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      idempotencyLeaseMs: 30_000,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true }),
      beforeAtomicCommit: async () => {
        w2Paused.resolve();
        await w2Resume.promise;
      }
    }
  });

  await w2Paused.promise;
  // Let stale Worker 1 try to commit BEFORE Worker 2 commits
  w1Resume.resolve();
  const w1Res = await w1Promise;
  assert.equal(w1Res.status, 409);
  assert.equal((await w1Res.json()).error, 'ORDER_IN_PROGRESS');
  assert.equal(mockDb.data.orders, undefined);

  // Now let Worker 2 finish cleanly
  w2Resume.resolve();
  const w2Res = await w2Promise;
  assert.equal(w2Res.status, 200);
  assert.equal(Object.keys(mockDb.data.orders).length, 1);
  assert.equal(Object.keys(mockDb.data.privateInvoiceAccess).length, 1);
});

// ===========================================================================
// 3. Worker 1 inside COMMITTING pauses before materialize -> Worker 2 gets 409 ORDER_IN_PROGRESS
// ===========================================================================
test('3. Active COMMITTING blocks concurrent caller with 409 ORDER_IN_PROGRESS without touching commitPayload', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);

  const mockDb = createAsyncRtdbMock({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } }
  });

  const atMaterialize = createDeferred();
  const resumeMaterialize = createDeferred();

  const w1Promise = createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.3',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      commitLeaseMs: 30_000,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true }),
      beforeMaterialize: async () => {
        atMaterialize.resolve();
        await resumeMaterialize.promise;
      }
    }
  });

  await atMaterialize.promise;
  const sealedDuringCommitting = mockDb.data.privateOrderIdempotency[keyHash];
  assert.equal(sealedDuringCommitting.status, 'COMMITTING');
  assert.ok(sealedDuringCommitting.commitId);
  assert.equal(sealedDuringCommitting.commitPayload.orderAccessRecord.token, undefined);
  assert.ok(sealedDuringCommitting.commitPayload.orderAccessRecord.encryptedToken);

  // Worker 2 arrives during active COMMITTING lease
  const w2Res = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.3',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(w2Res.status, 409);
  assert.equal((await w2Res.json()).error, 'ORDER_IN_PROGRESS');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].commitId, sealedDuringCommitting.commitId);

  resumeMaterialize.resolve();
  const w1Res = await w1Promise;
  assert.equal(w1Res.status, 200);
  const w1Body = await w1Res.json();
  assert.equal(w1Body.invoiceCode, sealedDuringCommitting.commitPayload.invoiceCode);
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'COMPLETED');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].commitPayload, undefined);
});

// ===========================================================================
// 4. Crash Recovery During Expired COMMITTING Uses Exact commitPayload & Cleans PII
// ===========================================================================
test('4. Crash recovery during expired COMMITTING materializes exact sealed commitPayload (same orderId, invoiceCode, token) and strips PII', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);

  const mockDb = createAsyncRtdbMock({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } }
  });

  // Simulate crash right after entering COMMITTING with 1ms lease (via failMultiUpdate)
  const failWriteDb = createAsyncRtdbMock(mockDb.data, { failMultiUpdate: true });
  const crashRes = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.4',
    _deps: {
      adminDb: failWriteDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      commitLeaseMs: 5,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });

  assert.equal(crashRes.status, 503);
  const crashedRecord = failWriteDb.data.privateOrderIdempotency[keyHash];
  assert.equal(crashedRecord.status, 'COMMITTING');
  const expectedOrderId = crashedRecord.commitPayload.orderId;
  const expectedInvoiceCode = crashedRecord.commitPayload.invoiceCode;
  const expectedTokenHash = crashedRecord.commitPayload.invoiceAccessRecord.tokenHash;

  await new Promise((r) => setTimeout(r, 15));

  // Simulate partial crash where orders/{orderId} already existed before second crash recovery
  const healedDb = createAsyncRtdbMock(failWriteDb.data);
  healedDb.data.orders = {
    [expectedOrderId]: JSON.parse(JSON.stringify(crashedRecord.commitPayload.orderData))
  };

  let sentEmails = 0;
  let sentTg = 0;
  const recoverRes = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.4',
    _deps: {
      adminDb: healedDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => {
        sentEmails++;
        return { success: true, status: 'accepted_by_mailapp' };
      },
      sendTelegramNotification: async () => {
        sentTg++;
        return { success: true, status: 'SUCCESS', allSuccessful: true };
      }
    }
  });

  assert.equal(recoverRes.status, 200);
  const recBody = await recoverRes.json();
  assert.equal(recBody.orderId, expectedOrderId);
  assert.equal(recBody.invoiceCode, expectedInvoiceCode);
  assert.equal(isValidInvoiceTokenFormat(recBody.invoiceAccessToken), true);
  assert.equal(hashInvoiceToken(recBody.invoiceAccessToken), expectedTokenHash);

  // Check all 4 target records materialized & consistent
  assert.ok(healedDb.data.orders[expectedOrderId]);
  assert.equal(healedDb.data.privateOrderAccess[expectedOrderId].tokenHash, expectedTokenHash);
  assert.equal(healedDb.data.privateInvoiceAccess[expectedTokenHash].orderId, expectedOrderId);
  assert.ok(healedDb.data.notifications_outbox[`notif_order_${expectedOrderId}_confirmation`]);
  assert.ok(healedDb.data.notifications_outbox[`notif_order_${expectedOrderId}_telegram`]);
  assert.ok(healedDb.data.notifications_outbox[`notif_order_${expectedOrderId}_make`]);

  // Verify temporary commitPayload PII stripped from privateOrderIdempotency
  const finalIdem = healedDb.data.privateOrderIdempotency[keyHash];
  assert.equal(finalIdem.status, 'COMPLETED');
  assert.equal(finalIdem.commitPayload, undefined);
  assert.equal(finalIdem.responseSummary.orderId, expectedOrderId);

  // Stock must NOT have been deducted on recovery, notifications ran once cleanly
  assert.equal(healedDb.data.products.prod_1.stockQuantity, 5);
  assert.equal(sentEmails, 1);
  assert.equal(sentTg, 1);

  // Subsequent replay returns exact same token with ZERO extra notifications
  const replayRes = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.4',
    _deps: {
      adminDb: healedDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => {
        sentEmails++;
        return { success: true };
      },
      sendTelegramNotification: async () => {
        sentTg++;
        return { success: true };
      }
    }
  });
  assert.equal(replayRes.status, 200);
  assert.equal((await replayRes.json()).invoiceAccessToken, recBody.invoiceAccessToken);
  assert.equal(sentEmails, 1);
  assert.equal(sentTg, 1);
});

// ===========================================================================
// 5. Materialization Verification Failure Keeps COMMITTING & Returns 503 (Never 200, Never FAILED)
// ===========================================================================
test('5. Failed verification of privateInvoiceAccess keeps COMMITTING, returns 503, and never downgrades to FAILED', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);

  const mockDb = createAsyncRtdbMock({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } }
  });

  const res = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.5',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      beforeVerifyMaterialization: async ({ commitRecord, adminDb }) => {
        // Simulate missing privateInvoiceAccess mapping before verification
        const hash = commitRecord.commitPayload.invoiceAccessRecord.tokenHash;
        await adminDb.ref(`privateInvoiceAccess/${hash}`).set(null);
      }
    }
  });

  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'COMMITTING');

  // Calling reconcileIdempotencyAfterFailure on COMMITTING MUST NOT downgrade it to FAILED
  await reconcileIdempotencyAfterFailure({
    lock: {
      requestKeyHash: keyHash,
      requestFingerprint: mockDb.data.privateOrderIdempotency[keyHash].requestFingerprint,
      reservedOrderId: mockDb.data.privateOrderIdempotency[keyHash].reservedOrderId,
      attemptId: mockDb.data.privateOrderIdempotency[keyHash].attemptId,
      leaseExpiresAtMs: Date.now() + 10000,
      expiresAtMs: Date.now() + 86400000,
      createdAt: new Date().toISOString()
    },
    adminDb: mockDb,
    errorCode: 'TEST_ERR'
  });
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'COMMITTING');
});

// ===========================================================================
// 6. Commit Payload Ceiling + Plaintext Token Guard
// ===========================================================================
test('6. transitionPendingToCommitting enforces payload byte cap and blocks plaintext tokens in commitPayload', async () => {
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);
  const mockDb = createAsyncRtdbMock({
    privateOrderIdempotency: {
      [keyHash]: {
        requestKeyHash: keyHash,
        requestFingerprint: 'fp_1',
        status: 'PENDING',
        reservedOrderId: 'ord_cap_1',
        attemptId: 'att_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        leaseExpiresAt: new Date(Date.now() + 30000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      }
    }
  });

  const lock = {
    requestKeyHash: keyHash,
    requestFingerprint: 'fp_1',
    reservedOrderId: 'ord_cap_1',
    attemptId: 'att_1',
    leaseExpiresAtMs: Date.now() + 30000,
    expiresAtMs: Date.now() + 86400000,
    createdAt: new Date().toISOString()
  };

  // Rejects plaintext `token` inside orderAccessRecord
  const plainReject = await transitionPendingToCommitting({
    lock,
    adminDb: mockDb,
    sealedPayload: {
      orderId: 'ord_cap_1',
      invoiceCode: 'DNY-111111',
      orderData: { totalAmount: 100 },
      orderAccessRecord: { token: 'PLAINTEXT_FORBIDDEN', encryptedToken: { v: 1 } },
      invoiceAccessRecord: { tokenHash: 'abc', orderId: 'ord_cap_1', status: 'active' },
      outboxRecords: {}
    }
  });
  assert.equal(plainReject.committed, false);
  assert.equal(plainReject.reason, 'INVALID_SEALED_PAYLOAD');

  // Rejects oversized payload beyond ceiling
  const hugeString = 'x'.repeat(MAX_COMMIT_PAYLOAD_BYTES + 1024);
  const sizeReject = await transitionPendingToCommitting({
    lock,
    adminDb: mockDb,
    sealedPayload: {
      orderId: 'ord_cap_1',
      invoiceCode: 'DNY-111111',
      orderData: { note: hugeString, totalAmount: 100 },
      orderAccessRecord: { encryptedToken: { v: 1 }, tokenHash: 'abc' },
      invoiceAccessRecord: { tokenHash: 'abc', orderId: 'ord_cap_1', status: 'active' },
      outboxRecords: {}
    }
  });
  assert.equal(sizeReject.committed, false);
  assert.equal(sizeReject.reason, 'PAYLOAD_TOO_LARGE');
});

// ===========================================================================
// 7. False 500 Immunity: Synchronous & Async Side-Effect Throws After Commit Still Return 200
// ===========================================================================
test('7. Post-commit synchronous throws & async rejections in Email, Telegram, Make, and hooks NEVER cause HTTP 500', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();

  const mockDb = createAsyncRtdbMock({
    products: { prod_1: { name: 'كريم مرطب', price: 450, stockQuantity: 8 } }
  });

  // Case A: Idempotent request where ALL post-commit side-effects throw synchronously or reject asynchronously
  const resSyncThrows = await createOrderPOST({
    request: makeOrderReq({ clientRequestId: reqUuid }),
    clientAddress: '41.41.50.6',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      makeWebhookUrl: 'https://hook.eu1.make.com/mock_sync_throw',
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: () => {
        throw new Error('Synchronous Mail Relay Explosion!');
      },
      sendTelegramNotification: () => {
        throw new Error('Synchronous Telegram Explosion!');
      },
      fetch: () => {
        throw new TypeError('Synchronous Invalid URL Explosion!');
      },
      afterOrderCommitted: () => {
        throw new Error('Synchronous Post-Commit Hook Explosion!');
      }
    }
  });

  assert.equal(resSyncThrows.status, 200);
  const bodyA = await resSyncThrows.json();
  assert.equal(bodyA.success, true);
  assert.ok(bodyA.orderId);
  assert.ok(bodyA.invoiceCode);
  assert.equal(isValidInvoiceTokenFormat(bodyA.invoiceAccessToken), true);
  assert.equal(Object.keys(mockDb.data.orders).length, 1);

  // Case B: Omitted clientRequestId legacy request with synchronous throw in side-effects ALSO returns 200
  const resLegacySyncThrow = await createOrderPOST({
    request: makeOrderReq(),
    clientAddress: '41.41.50.7',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      makeWebhookUrl: 'https://hook.eu1.make.com/mock_async_reject',
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: () => {
        throw new Error('Sync throw legacy email');
      },
      sendTelegramNotification: async () => {
        throw new Error('Async reject legacy tg');
      },
      fetch: async () => {
        throw new Error('Async network down');
      }
    }
  });
  assert.equal(resLegacySyncThrow.status, 200);
  const bodyB = await resLegacySyncThrow.json();
  assert.equal(bodyB.success, true);
  assert.equal(Object.keys(mockDb.data.orders).length, 2);
});

// ===========================================================================
// 8. Outbox Atomic Claiming Across Concurrent Workers + Timeout Unknown Handling
// ===========================================================================
test('8. Outbox RTDB .transaction() claiming prevents duplicate Email, Telegram, and Make sends & avoids auto-retry on unknown timeout', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const orderId = 'ord_outbox_conc_1';
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      [`notif_order_${orderId}_confirmation`]: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        invoiceCode: 'DNY-900111',
        channel: 'email',
        recipientEmail: 'customer@example.com',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending',
        attempts: 0
      },
      [`notif_order_${orderId}_telegram`]: {
        notificationId: `notif_order_${orderId}_telegram`,
        orderId,
        invoiceCode: 'DNY-900111',
        channel: 'telegram',
        eventType: 'TELEGRAM_ORDER_NOTIFICATION',
        status: 'pending',
        attempts: 0
      },
      [`notif_order_${orderId}_make`]: {
        notificationId: `notif_order_${orderId}_make`,
        orderId,
        invoiceCode: 'DNY-900111',
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const orderData = {
    name: 'دينا عادل',
    email: 'customer@example.com',
    phone: '01011223344',
    invoiceCode: 'DNY-900111',
    subtotal: 500,
    shippingFee: 85,
    totalAmount: 585,
    products: [{ name: 'غسول', quantity: 1, price: 500, lineTotal: 500 }]
  };

  // A. Concurrent Email calls: only 1 relay HTTP POST fires
  const origFetch = globalThis.fetch;
  const origGmail = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origRelayUrl = process.env.GMAIL_RELAY_URL;
  const origRelaySecret = process.env.GMAIL_RELAY_SECRET;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_outbox/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_secret_123456';

  let emailHttpCalls = 0;
  globalThis.fetch = async () => {
    emailHttpCalls++;
    await new Promise((r) => setTimeout(r, 15));
    return new Response(JSON.stringify({ success: true, status: 'accepted_by_mailapp' }), { status: 200 });
  };

  try {
    const [e1, e2] = await Promise.all([
      sendOrderNotification({
        order: orderData,
        orderId,
        eventType: 'ORDER_CONFIRMATION',
        invoiceAccessToken: crypto.randomBytes(32).toString('base64url'),
        adminDb: mockDb,
        encryptionKey: hexKey
      }),
      sendOrderNotification({
        order: orderData,
        orderId,
        eventType: 'ORDER_CONFIRMATION',
        invoiceAccessToken: crypto.randomBytes(32).toString('base64url'),
        adminDb: mockDb,
        encryptionKey: hexKey
      })
    ]);
    assert.equal(emailHttpCalls, 1);
    assert.equal([e1.status, e2.status].sort().join(','), 'accepted_by_mailapp,processing');
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origGmail;
    process.env.GMAIL_RELAY_URL = origRelayUrl;
    process.env.GMAIL_RELAY_SECRET = origRelaySecret;
  }

  // B. Concurrent Telegram dispatchers: only 1 call fires
  let tgCalls = 0;
  const [t1, t2] = await Promise.all([
    dispatchTelegramOutboxNotification({
      orderId,
      orderData,
      adminDb: mockDb,
      sendTelegramFn: async () => {
        tgCalls++;
        await new Promise((r) => setTimeout(r, 15));
        return { success: true, status: 'SUCCESS', allSuccessful: true };
      }
    }),
    dispatchTelegramOutboxNotification({
      orderId,
      orderData,
      adminDb: mockDb,
      sendTelegramFn: async () => {
        tgCalls++;
        return { success: true, status: 'SUCCESS', allSuccessful: true };
      }
    })
  ]);
  assert.equal(tgCalls, 1);
  assert.equal(t1.claimed || t2.claimed, true);
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_telegram`].status, 'sent');

  // C. Make Webhook AbortError timeout marks 'unknown' and subsequent auto-call MUST NOT retry 'unknown'
  let makeCalls = 0;
  const m1 = await dispatchMakeWebhookOutboxNotification({
    orderId,
    orderData,
    adminDb: mockDb,
    makeWebhookUrl: 'https://hook.eu1.make.com/mock_timeout',
    fetchFn: async () => {
      makeCalls++;
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
  });
  assert.equal(m1.status, 'unknown');
  assert.equal(mockDb.data.notifications_outbox[`notif_order_${orderId}_make`].status, 'unknown');

  const m2 = await dispatchMakeWebhookOutboxNotification({
    orderId,
    orderData,
    adminDb: mockDb,
    makeWebhookUrl: 'https://hook.eu1.make.com/mock_timeout',
    fetchFn: async () => {
      makeCalls++;
      return new Response('{}', { status: 200 });
    }
  });
  assert.equal(m2.claimed, false);
  assert.equal(m2.status, 'unknown');
  assert.equal(makeCalls, 1, 'Timeout unknown state must NOT be auto-retried');

  // D. Unconfigured Make webhook marks skipped_not_configured cleanly
  const unconfOrderId = 'ord_make_unconf';
  const unconfRes = await dispatchMakeWebhookOutboxNotification({
    orderId: unconfOrderId,
    orderData,
    adminDb: mockDb,
    makeWebhookUrl: ''
  });
  assert.equal(unconfRes.status, 'skipped_not_configured');
  assert.equal(
    mockDb.data.notifications_outbox[`notif_order_${unconfOrderId}_make`].status,
    'skipped_not_configured'
  );
});

// ===========================================================================
// 9. RTDB Optimistic Transaction Contention Retry Verification
// ===========================================================================
test('9. Optimistic CAS contention during RTDB .transaction() preserves strict single-winner invariants across retries', async () => {
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);

  let injectedOnce = false;
  const mockDb = createAsyncRtdbMock(
    {
      privateOrderIdempotency: {
        [keyHash]: {
          requestKeyHash: keyHash,
          requestFingerprint: 'fp_cas',
          status: 'PENDING',
          reservedOrderId: 'ord_cas_1',
          attemptId: 'att_old',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          leaseExpiresAt: new Date(Date.now() + 30000).toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString()
        }
      },
      notifications_outbox: {
        notif_cas_1: { notificationId: 'notif_cas_1', status: 'pending', attempts: 0 }
      }
    },
    {
      // Simulate concurrent winner taking over PENDING on first attempt of stale worker's TX!
      injectRaceOnceOnAttempt: async ({ path, attempts }) => {
        if (!injectedOnce && path === `privateOrderIdempotency/${keyHash}` && attempts === 1) {
          injectedOnce = true;
          mockDb.data.privateOrderIdempotency[keyHash].attemptId = 'att_newer';
          // Bump version inside internal setter via direct ref update
          await mockDb.ref(path).update({ attemptId: 'att_newer' });
        }
      }
    }
  );

  // Stale worker attempts PENDING -> COMMITTING; CAS retry re-runs updater and sees att_newer -> aborts!
  const staleRes = await transitionPendingToCommitting({
    lock: {
      requestKeyHash: keyHash,
      requestFingerprint: 'fp_cas',
      reservedOrderId: 'ord_cas_1',
      attemptId: 'att_old',
      leaseExpiresAtMs: Date.now() + 30000,
      expiresAtMs: Date.now() + 86400000,
      createdAt: new Date().toISOString()
    },
    adminDb: mockDb,
    sealedPayload: {
      orderId: 'ord_cas_1',
      invoiceCode: 'DNY-000111',
      orderData: { totalAmount: 100 },
      orderAccessRecord: { encryptedToken: { v: 1 }, tokenHash: 'h1' },
      invoiceAccessRecord: { tokenHash: 'h1', orderId: 'ord_cas_1', status: 'active' },
      outboxRecords: {}
    }
  });

  assert.equal(staleRes.committed, false);
  assert.equal(staleRes.reason, 'LOST_OWNERSHIP');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'PENDING');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].attemptId, 'att_newer');

  // Test claimOutboxNotification single-winner guarantee across 5 parallel callers
  const claims = await Promise.all([
    claimOutboxNotification({ adminDb: mockDb, notificationId: 'notif_cas_1' }),
    claimOutboxNotification({ adminDb: mockDb, notificationId: 'notif_cas_1' }),
    claimOutboxNotification({ adminDb: mockDb, notificationId: 'notif_cas_1' }),
    claimOutboxNotification({ adminDb: mockDb, notificationId: 'notif_cas_1' }),
    claimOutboxNotification({ adminDb: mockDb, notificationId: 'notif_cas_1' })
  ]);
  const winners = claims.filter((c) => c.claimed);
  assert.equal(winners.length, 1);
  assert.equal(claims.filter((c) => !c.claimed && c.reason === 'IN_FLIGHT').length, 4);
});
