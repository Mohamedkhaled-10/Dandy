// test/group2b111-final-outbox-identity-simulation.test.mjs
// GROUP 2B.1.1.1: Final Outbox Identity & Telegram Simulation Cleanup
// Covers Scenarios A through W with Async RTDB Mock, Deferred Barriers, and zero live provider calls.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  claimOutboxNotification,
  dispatchTelegramOutboxNotification
} from '../src/utils/notifications-outbox.ts';
import { sendTelegramNotification } from '../src/utils/telegram.js';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import { POST as recoverPOST } from '../src/pages/api/admin/recover-order-notifications.js';

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
        return { uid: 'adm_2b111', email: 'admin@dandy.com', email_verified: true };
      }
      const err = new Error('auth/invalid-id-token');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
  };
}

function makeValidOrder(overrides = {}) {
  return {
    name: 'ياسمين خالد',
    email: 'yasmin@example.com',
    phone: '01055443322',
    governorate: 'الجيزة',
    city: 'الدقي',
    address: 'شارع التحرير',
    invoiceCode: 'DNY-2B111-01',
    status: 'جديد',
    subtotal: 500,
    shippingFee: 85,
    totalAmount: 585,
    products: [{ id: 'p1', name: 'كريم ترطيب', quantity: 1, price: 500, lineTotal: 500 }],
    timestamp: '2026-10-10T10:00:00.000Z',
    ...overrides
  };
}

function createAsyncRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();
  const txCounts = new Map();
  const txAttemptPaths = [];

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
        txAttemptPaths.push(p);
        const count = (txCounts.get(p) || 0) + 1;
        txCounts.set(p, count);

        if (options.failTransactions) {
          throw new Error('Simulated RTDB transaction failure');
        }
        if (typeof options.shouldFailTx === 'function' && options.shouldFailTx(p, count)) {
          throw new Error('Simulated targeted RTDB transaction failure');
        }
        if (typeof options.beforeTxCommit === 'function') {
          await options.beforeTxCommit({ path: p, callCount: count, data, setAtPath });
        }

        let attempts = 0;
        while (attempts < 10) {
          attempts++;
          const startVer = getVersion(p);
          const current = getAtPath(p);
          const clonedCurrent =
            current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));

          const nextVal = updater(clonedCurrent);
          await tick();

          if (typeof options.uncommittedTx === 'function' && options.uncommittedTx(p, count)) {
            return {
              committed: false,
              snapshot: { val: () => clonedCurrent }
            };
          }

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
            snapshot: {
              val: () => (stored === null || stored === undefined ? null : JSON.parse(JSON.stringify(stored)))
            }
          };
        }
        throw new Error('Transaction max retries exceeded');
      }
    };
  }

  return {
    data,
    txAttemptPaths,
    ref: (p = '') => makeRef(p)
  };
}

// ===========================================================================
// A & I. Valid initialRecord succeeds and new records persist canonical identity fields
// ===========================================================================
test('A/I. Valid initialRecord succeeds and new outbox claim explicitly constructs canonical identity fields from trusted parameters', async () => {
  const orderId = 'ord_init_valid';
  const notifId = `notif_order_${orderId}_confirmation`;
  const baseMs = Date.parse('2026-10-10T12:00:00.000Z');
  const db = createAsyncRtdbMock({});

  // Even when initialRecord omits redundant identity fields (only supplying valid payload metadata),
  // claimOutboxNotification constructs notificationId, orderId, channel, eventType explicitly from trusted params.
  const claim = await claimOutboxNotification({
    adminDb: db,
    notificationId: notifId,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    nowMs: baseMs,
    leaseMs: 60_000,
    initialRecord: {
      invoiceCode: 'DNY-2B111-01',
      recipientEmail: 'yasmin@example.com',
      recipientName: 'ياسمين خالد',
      orderStatus: 'جديد',
      status: 'pending',
      attempts: 0
    }
  });

  assert.equal(claim.claimed, true);
  assert.ok(claim.claimId);
  const stored = db.data.notifications_outbox[notifId];
  assert.equal(stored.notificationId, notifId);
  assert.equal(stored.orderId, orderId);
  assert.equal(stored.channel, 'email');
  assert.equal(stored.eventType, 'ORDER_CONFIRMATION');
  assert.equal(stored.invoiceCode, 'DNY-2B111-01');
  assert.equal(stored.recipientEmail, 'yasmin@example.com');
  assert.equal(stored.status, 'processing');
  assert.equal(stored.claimId, claim.claimId);
  assert.equal(stored.processingLeaseExpiresAt, new Date(baseMs + 60_000).toISOString());
});

// ===========================================================================
// B, C, D, E, F, G, H. initialRecord validation rejects mismatches, prevents transaction & zero external calls
// ===========================================================================
test('B/C/D/E/F/G/H. Mismatched or non-plain-object initialRecord is rejected before transaction with zero provider calls', async () => {
  const orderId = 'ord_init_reject';
  const notifId = `notif_order_${orderId}_confirmation`;

  const invalidPayloads = [
    {
      label: 'B. initialRecord.orderId mismatch',
      initialRecord: {
        notificationId: notifId,
        orderId: 'ord_hijacked',
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending'
      }
    },
    {
      label: 'C. initialRecord.notificationId mismatch',
      initialRecord: {
        notificationId: `notif_order_${orderId}_status_shipped`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending'
      }
    },
    {
      label: 'D. initialRecord.channel mismatch',
      initialRecord: {
        notificationId: notifId,
        orderId,
        channel: 'telegram',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending'
      }
    },
    {
      label: 'E. initialRecord.eventType mismatch against trusted param',
      initialRecord: {
        notificationId: notifId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        status: 'pending'
      }
    },
    {
      label: 'E2. unexpected identity/claim override field in initialRecord',
      initialRecord: {
        notificationId: notifId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        claimId: 'forged_claim',
        status: 'pending'
      }
    },
    {
      label: 'E3. forged sent status in initialRecord',
      initialRecord: {
        notificationId: notifId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'accepted_by_mailapp'
      }
    },
    {
      label: 'F1. null initialRecord',
      initialRecord: null
    },
    {
      label: 'F2. array initialRecord',
      initialRecord: ['bad']
    },
    {
      label: 'F3. string initialRecord',
      initialRecord: 'bad_init'
    },
    {
      label: 'F4. numeric initialRecord',
      initialRecord: 42
    }
  ];

  for (const tc of invalidPayloads) {
    const db = createAsyncRtdbMock({});
    const res = await claimOutboxNotification({
      adminDb: db,
      notificationId: notifId,
      orderId,
      channel: 'email',
      eventType: 'ORDER_CONFIRMATION',
      initialRecord: tc.initialRecord
    });

    assert.equal(res.claimed, false, `Expected claimed=false for ${tc.label}`);
    assert.equal(res.reason, 'IDENTITY_MISMATCH', `Expected IDENTITY_MISMATCH for ${tc.label}`);
    // G: Invalid identity prevented DB transaction from ever being invoked
    assert.equal(db.txAttemptPaths.length, 0, `Transaction MUST NOT run for ${tc.label}`);
    assert.equal(db.data.notifications_outbox, undefined);
  }

  // H: Invalid deterministic channel/eventType/ID combination prevents transaction & triggers 0 provider calls
  const origFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response('{}', { status: 200 });
  };
  try {
    const mismatchDb = createAsyncRtdbMock({});
    const resCross = await claimOutboxNotification({
      adminDb: mismatchDb,
      notificationId: `notif_order_${orderId}_telegram`,
      orderId,
      channel: 'email',
      eventType: 'ORDER_CONFIRMATION',
      initialRecord: {
        notificationId: `notif_order_${orderId}_telegram`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending'
      }
    });
    assert.equal(resCross.claimed, false);
    assert.equal(resCross.reason, 'IDENTITY_MISMATCH');
    assert.equal(mismatchDb.txAttemptPaths.length, 0);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ===========================================================================
// J. Concurrent valid claims with initialRecord still produce a single winner
// ===========================================================================
test('J. Concurrent valid claims with initialRecord under Deferred Barrier produce a single winner', async () => {
  const orderId = 'ord_conc_init_2b111';
  const notifId = `notif_order_${orderId}_confirmation`;
  const barrier = createDeferred();
  let paused = false;

  const db = createAsyncRtdbMock(
    {},
    {
      beforeTxCommit: async ({ path: txPath }) => {
        if (!paused && txPath === `notifications_outbox/${notifId}`) {
          paused = true;
          await barrier.promise;
        }
      }
    }
  );

  const validInit = {
    notificationId: notifId,
    orderId,
    invoiceCode: 'DNY-CONC-1',
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    status: 'pending',
    attempts: 0
  };

  const c1 = claimOutboxNotification({
    adminDb: db,
    notificationId: notifId,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    initialRecord: validInit
  });

  setTimeout(() => barrier.resolve(), 10);

  const c2 = claimOutboxNotification({
    adminDb: db,
    notificationId: notifId,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    initialRecord: validInit
  });

  const [r1, r2] = await Promise.all([c1, c2]);
  const winners = [r1, r2].filter((r) => r.claimed);
  const losers = [r1, r2].filter((r) => !r.claimed);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.equal(losers[0].reason, 'IN_FLIGHT');
  assert.equal(db.data.notifications_outbox[notifId].orderId, orderId);
  assert.equal(db.data.notifications_outbox[notifId].channel, 'email');
});

// ===========================================================================
// K, L, M, N, O, P, Q, R. Telegram SIMULATED -> skipped_not_configured/skipped, real test outcomes preserved, unknown non-retryable
// ===========================================================================
test('K/L/M/N/O/P/Q/R. Telegram SIMULATED becomes skipped_not_configured/skipped with 0 live requests, explicit test success & partial/unknown remain distinct', async () => {
  const origTgToken = process.env.TELEGRAM_TOKEN;
  const origTgChat = process.env.TELEGRAM_CHAT_ID;
  const origFetch = globalThis.fetch;

  let liveTgFetchCalls = 0;
  globalThis.fetch = async () => {
    liveTgFetchCalls++;
    return new Response('{}', { status: 200 });
  };

  try {
    // K, L, M: Missing Telegram configuration -> real sendTelegramNotification produces SIMULATED -> outbox classifies as skipped_not_configured / skipped
    delete process.env.TELEGRAM_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const ordSim = 'ord_tg_sim_real';
    const dbSim = createAsyncRtdbMock({});
    const simRes = await dispatchTelegramOutboxNotification({
      orderId: ordSim,
      orderData: makeValidOrder(),
      adminDb: dbSim,
      sendTelegramFn: sendTelegramNotification
    });

    assert.equal(simRes.status, 'skipped_not_configured');
    assert.equal(simRes.outboxStatus, 'skipped_not_configured');
    assert.equal(simRes.providerOutcome, 'skipped');
    assert.notEqual(simRes.status, 'sent');
    assert.notEqual(simRes.providerOutcome, 'accepted');
    assert.equal(simRes.outboxFinalized, true);
    assert.equal(liveTgFetchCalls, 0);

    const simStored = dbSim.data.notifications_outbox[`notif_order_${ordSim}_telegram`];
    assert.equal(simStored.status, 'skipped_not_configured');
    assert.equal(simStored.providerOutcome, 'skipped');
    assert.equal(simStored.simulated, true);

    // Subsequent call does not re-dispatch skipped_not_configured
    let secondCalls = 0;
    const simRepeat = await dispatchTelegramOutboxNotification({
      orderId: ordSim,
      orderData: makeValidOrder(),
      adminDb: dbSim,
      sendTelegramFn: async () => {
        secondCalls++;
        return { success: true, status: 'SUCCESS', allSuccessful: true };
      }
    });
    assert.equal(simRepeat.claimed, false);
    assert.equal(simRepeat.status, 'skipped_not_configured');
    assert.equal(secondCalls, 0);

    // Explicit { status: 'SIMULATED', simulated: true } payload also never claims sent/accepted
    const ordSimPayload = 'ord_tg_sim_payload';
    const dbSimPayload = createAsyncRtdbMock({});
    const simPayloadRes = await dispatchTelegramOutboxNotification({
      orderId: ordSimPayload,
      orderData: makeValidOrder(),
      adminDb: dbSimPayload,
      sendTelegramFn: async () => ({
        success: true,
        allSuccessful: true,
        anySuccessful: false,
        status: 'SIMULATED',
        simulated: true
      })
    });
    assert.equal(simPayloadRes.status, 'skipped_not_configured');
    assert.equal(simPayloadRes.providerOutcome, 'skipped');
    assert.notEqual(simPayloadRes.status, 'sent');

    // N & P: Explicit test-only provider success remains sent / accepted
    const ordSuccess = 'ord_tg_explicit_ok';
    const dbSuccess = createAsyncRtdbMock({});
    const okRes = await dispatchTelegramOutboxNotification({
      orderId: ordSuccess,
      orderData: makeValidOrder(),
      adminDb: dbSuccess,
      sendTelegramFn: async () => ({
        success: true,
        allSuccessful: true,
        anySuccessful: true,
        status: 'SUCCESS',
        results: [{ chatId: '-1001234567890', success: true, messageId: 101 }],
        totalSent: 1,
        totalFailed: 0
      })
    });
    assert.equal(okRes.status, 'sent');
    assert.equal(okRes.providerOutcome, 'accepted');
    assert.equal(dbSuccess.data.notifications_outbox[`notif_order_${ordSuccess}_telegram`].status, 'sent');

    // O & R: null / undefined outcomes remain unknown/ambiguous & non-retryable
    for (const [label, val] of [['null', null], ['undefined', undefined]]) {
      const ordUnk = `ord_tg_${label}_2b111`;
      const dbUnk = createAsyncRtdbMock({});
      const unkRes = await dispatchTelegramOutboxNotification({
        orderId: ordUnk,
        orderData: makeValidOrder(),
        adminDb: dbUnk,
        sendTelegramFn: async () => val
      });
      assert.equal(unkRes.status, 'unknown', `Expected unknown for ${label}`);
      assert.equal(unkRes.providerOutcome, 'ambiguous');

      let autoRetries = 0;
      const retryUnk = await dispatchTelegramOutboxNotification({
        orderId: ordUnk,
        orderData: makeValidOrder(),
        adminDb: dbUnk,
        sendTelegramFn: async () => {
          autoRetries++;
          return { success: true, status: 'SUCCESS', allSuccessful: true };
        }
      });
      assert.equal(retryUnk.claimed, false);
      assert.equal(retryUnk.status, 'unknown');
      assert.equal(autoRetries, 0);
    }

    // Q: Partial delivery remains unknown/ambiguous & non-retryable
    const ordPartial = 'ord_tg_partial_2b111';
    const dbPartial = createAsyncRtdbMock({});
    const partialRes = await dispatchTelegramOutboxNotification({
      orderId: ordPartial,
      orderData: makeValidOrder(),
      adminDb: dbPartial,
      sendTelegramFn: async () => ({
        success: false,
        allSuccessful: false,
        anySuccessful: true,
        status: 'PARTIAL_SUCCESS',
        results: [{ chatId: '1', success: true }, { chatId: '2', success: false }]
      })
    });
    assert.equal(partialRes.status, 'unknown');
    assert.equal(partialRes.providerOutcome, 'ambiguous');
  } finally {
    globalThis.fetch = origFetch;
    if (origTgToken === undefined) delete process.env.TELEGRAM_TOKEN;
    else process.env.TELEGRAM_TOKEN = origTgToken;
    if (origTgChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = origTgChat;
  }
});

// ===========================================================================
// S, T, U. Make disabled, Active email relay functional, Deletion fencing intact
// ===========================================================================
test('S/T/U. Make stays skipped_intentionally_disabled, active email relay works, and deletion fencing blocks claims', async () => {
  // U: Deletion fencing
  const delOrderId = 'ord_del_2b111';
  const delDb = createAsyncRtdbMock({
    privateDeletedOrders: {
      [delOrderId]: { orderId: delOrderId, status: 'DELETED', deletedAt: '2026-10-10T11:00:00.000Z' }
    }
  });
  const delClaim = await claimOutboxNotification({
    adminDb: delDb,
    notificationId: `notif_order_${delOrderId}_confirmation`,
    orderId: delOrderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    initialRecord: {
      notificationId: `notif_order_${delOrderId}_confirmation`,
      orderId: delOrderId,
      channel: 'email',
      eventType: 'ORDER_CONFIRMATION',
      status: 'pending'
    }
  });
  assert.equal(delClaim.claimed, false);
  assert.equal(delClaim.reason, 'ORDER_DELETED');

  // S & T: Active email relay works + Make remains skipped_intentionally_disabled during recovery
  const liveOrderId = 'ord_active_email_make_2b111';
  const emailId = `notif_order_${liveOrderId}_confirmation`;
  const makeId = `notif_order_${liveOrderId}_make`;
  const hexKey = crypto.randomBytes(32).toString('hex');

  const db = createAsyncRtdbMock({
    orders: { [liveOrderId]: makeValidOrder({ status: 'جديد' }) },
    notifications_outbox: {
      [makeId]: {
        notificationId: makeId,
        orderId: liveOrderId,
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const origFetch = globalThis.fetch;
  const origEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  const origKey = process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b111/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_secret_2b111';
  process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = hexKey;

  let relayCalls = 0;
  let makeFetchCalls = 0;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('make.com')) makeFetchCalls++;
    if (s.includes('script.google.com')) {
      relayCalls++;
      return new Response(JSON.stringify({ success: true, messageId: 'msg_2b111_ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('{}', { status: 200 });
  };

  try {
    const emailRes = await sendOrderNotification({
      order: makeValidOrder({ status: 'جديد' }),
      orderId: liveOrderId,
      eventType: 'ORDER_CONFIRMATION',
      adminDb: db,
      encryptionKey: hexKey
    });
    assert.equal(emailRes.success, true);
    assert.equal(emailRes.status, 'accepted_by_mailapp');
    assert.equal(relayCalls, 1);
    assert.equal(db.data.notifications_outbox[emailId].status, 'accepted_by_mailapp');

    const recRes = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-admin-2b111'
        },
        body: JSON.stringify({ orderId: liveOrderId })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: db
      }
    });
    assert.equal(recRes.status, 200);
    const recJson = await recRes.json();
    const makeItem = recJson.notifications.find((n) => n.channel === 'make');
    assert.ok(makeItem);
    assert.equal(makeItem.status, 'skipped_intentionally_disabled');
    assert.equal(makeFetchCalls, 0);
    assert.equal(db.data.notifications_outbox[makeId].status, 'pending');
  } finally {
    globalThis.fetch = origFetch;
    if (origEnabled === undefined) delete process.env.GMAIL_NOTIFICATIONS_ENABLED;
    else process.env.GMAIL_NOTIFICATIONS_ENABLED = origEnabled;
    if (origUrl === undefined) delete process.env.GMAIL_RELAY_URL;
    else process.env.GMAIL_RELAY_URL = origUrl;
    if (origSecret === undefined) delete process.env.GMAIL_RELAY_SECRET;
    else process.env.GMAIL_RELAY_SECRET = origSecret;
    if (origKey === undefined) delete process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
    else process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = origKey;
  }
});

// ===========================================================================
// W. .env.example matches exact historical baseline at commit 3ff3cf31e89f7b1762fececb394a1588468f8259
// ===========================================================================
test('W. .env.example matches exact historical baseline SHA-256 and preserves comments/ordering with zero secrets', async () => {
  const envExampleBytes = await fs.readFile(path.resolve('.env.example'));
  const digest = crypto.createHash('sha256').update(envExampleBytes).digest('hex');
  assert.equal(
    digest,
    '56046578dec0e01f7cae58849456a19ecd4922cb0bd7394874388d7e56512c75',
    '.env.example must match historical commit 3ff3cf31e89f7b1762fececb394a1588468f8259 byte-for-byte'
  );
  const text = envExampleBytes.toString('utf8');
  assert.ok(text.includes('# Non-Vercel reverse proxy IP resolution (see src/utils/server-rate-limit.ts):'));
  assert.ok(text.includes('# Comma-separated single IPv4/IPv6 addresses of trusted reverse-proxy hops'));
  assert.ok(text.includes('# Set TRUST_X_REAL_IP=true (strictly \'true\')'));
});
