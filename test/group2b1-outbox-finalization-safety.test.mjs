// test/group2b1-outbox-finalization-safety.test.mjs
// GROUP 2B.1: Outbox Finalization Safety & Fail-Closed Claim Hardening
// Covers Scenarios A through Y with async RTDB mocks, Deferred Barriers, and deterministic clocks.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  SAFE_OUTBOX_ERROR_CODES,
  RECOGNIZED_OUTBOX_STATUSES,
  isValidFirebaseOutboxKey,
  sanitizeOutboxErrorCode,
  sanitizeOutboxIsoTimestamp,
  isDeterministicOutboxIdForOrder,
  isCleanLegacyPendingOutboxRecord,
  validateOutboxRecordForRecovery,
  claimOutboxNotification,
  finalizeOutboxNotification,
  reconcileStaleOutboxNotification,
  dispatchTelegramOutboxNotification,
  dispatchMakeWebhookOutboxNotification,
  sanitizeOutboxRecordForAdmin
} from '../src/utils/notifications-outbox.ts';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import { POST as recoverPOST } from '../src/pages/api/admin/recover-order-notifications.js';
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
        return { uid: 'adm_2b1', email: 'admin@dandy.com', email_verified: true };
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
    invoiceCode: 'DNY-2B101',
    status: 'جديد',
    subtotal: 500,
    shippingFee: 85,
    totalAmount: 585,
    products: [{ id: 'p1', name: 'سيروم', quantity: 1, price: 500, lineTotal: 500 }],
    timestamp: '2026-10-01T10:00:00.000Z',
    ...overrides
  };
}

function createAsyncRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();
  const txCounts = new Map();

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
    ref: (p = '') => makeRef(p)
  };
}

// ===========================================================================
// A-D. Fail-Closed Claim Hardening in claimOutboxNotification
// ===========================================================================
test('A-D. claimOutboxNotification fails closed when store/transaction missing, tx does not commit, claimId mismatches, or identity invalid', async () => {
  // A: adminDb null / missing .ref
  const resMissingDb = await claimOutboxNotification({
    adminDb: null,
    notificationId: 'notif_order_ord_a_confirmation',
    orderId: 'ord_a'
  });
  assert.equal(resMissingDb.claimed, false);
  assert.equal(resMissingDb.reason, 'STORE_UNAVAILABLE');
  assert.equal(resMissingDb.status, 'unavailable');

  // B: ref exists but .transaction is missing
  const dbNoTx = {
    ref: () => ({
      once: async () => ({ val: () => null })
    })
  };
  const resNoTx = await claimOutboxNotification({
    adminDb: dbNoTx,
    notificationId: 'notif_order_ord_b_confirmation',
    orderId: 'ord_b'
  });
  assert.equal(resNoTx.claimed, false);
  assert.equal(resNoTx.reason, 'STORE_UNAVAILABLE');
  assert.equal(resNoTx.status, 'unavailable');

  // C1: transaction returns committed: false without abort reason
  const dbUncommitted = createAsyncRtdbMock(
    {},
    { uncommittedTx: (p) => p.startsWith('notifications_outbox/') }
  );
  const resUncommitted = await claimOutboxNotification({
    adminDb: dbUncommitted,
    notificationId: 'notif_order_ord_c_confirmation',
    orderId: 'ord_c'
  });
  assert.equal(resUncommitted.claimed, false);
  assert.equal(resUncommitted.reason, 'NOT_COMMITTED');
  assert.equal(resUncommitted.status, 'unavailable');

  // C2: committed: true but returned snapshot has different claimId
  const dbMismatchClaim = {
    ref: () => ({
      once: async () => ({ val: () => null }),
      transaction: async () => ({
        committed: true,
        snapshot: { val: () => ({ status: 'processing', claimId: 'someone_else_claim' }) }
      })
    })
  };
  const resClaimMismatch = await claimOutboxNotification({
    adminDb: dbMismatchClaim,
    notificationId: 'notif_order_ord_c2_confirmation',
    orderId: 'ord_c2'
  });
  assert.equal(resClaimMismatch.claimed, false);
  assert.equal(resClaimMismatch.reason, 'OWNERSHIP_MISMATCH');

  // D1: invalid Firebase key characters
  const mockDb = createAsyncRtdbMock({
    notifications_outbox: {
      notif_order_ord_other_confirmation: {
        notificationId: 'notif_order_ord_other_confirmation',
        orderId: 'ord_other',
        channel: 'email',
        status: 'pending'
      }
    }
  });
  for (const badId of ['', '   ', 'bad.key', 'bad/key', 'bad$key', 'bad#key', 'bad[0]', ' notif_x']) {
    const resBad = await claimOutboxNotification({
      adminDb: mockDb,
      notificationId: badId,
      orderId: 'ord_d'
    });
    assert.equal(resBad.claimed, false);
    assert.equal(resBad.reason, 'IDENTITY_MISMATCH');
    assert.equal(resBad.status, 'unavailable');
  }

  // D2: existing record orderId mismatch
  const resOrderMismatch = await claimOutboxNotification({
    adminDb: mockDb,
    notificationId: 'notif_order_ord_other_confirmation',
    orderId: 'ord_expected'
  });
  assert.equal(resOrderMismatch.claimed, false);
  assert.equal(resOrderMismatch.reason, 'IDENTITY_MISMATCH');
  assert.equal(mockDb.data.notifications_outbox.notif_order_ord_other_confirmation.status, 'pending');
});

// ===========================================================================
// E. sendOrderNotification fails closed when adminDb missing (never calls external relay)
// ===========================================================================
test('E. sendOrderNotification fails closed with adminDb=null without ever calling email relay', async () => {
  const origFetch = globalThis.fetch;
  const origEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b1/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_2b1_secret';

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    const res = await sendOrderNotification({
      order: makeValidOrder(),
      orderId: 'ord_no_db',
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_no_db',
      adminDb: null
    });

    assert.equal(fetchCalls, 0, 'Must never call external relay when outbox store is unavailable');
    assert.equal(res.success, false);
    assert.equal(res.status, 'unavailable');
    assert.equal(res.outboxFinalized, false);
    assert.equal(res.providerOutcome, 'not_attempted');
    assert.equal(res.persistenceOutcome, 'claim_unavailable');
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origEnabled;
    process.env.GMAIL_RELAY_URL = origUrl;
    process.env.GMAIL_RELAY_SECRET = origSecret;
  }
});

// ===========================================================================
// F-G. Email finalization failure after provider accepted / rejected / timed out
// ===========================================================================
test('F-G. sendOrderNotification separates providerOutcome from persistenceOutcome on finalize failure (never reports sent/pending, never writes latestNotification)', async () => {
  const origFetch = globalThis.fetch;
  const origEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b1/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_2b1_secret';

  try {
    // F: provider accepts (HTTP 200 ok), finalize tx throws
    const orderIdF = 'ord_fin_fail_accept';
    const notifIdF = `notif_order_${orderIdF}_confirmation`;
    const dbF = createAsyncRtdbMock(
      {
        orders: { [orderIdF]: makeValidOrder() },
        notifications_outbox: {
          [notifIdF]: {
            notificationId: notifIdF,
            orderId: orderIdF,
            channel: 'email',
            status: 'pending',
            attempts: 0
          }
        }
      },
      {
        shouldFailTx: (p, count) => p === `notifications_outbox/${notifIdF}` && count >= 2
      }
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: true, status: 'accepted_by_mailapp' }), { status: 200 });

    const resF = await sendOrderNotification({
      order: makeValidOrder(),
      orderId: orderIdF,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_f',
      adminDb: dbF
    });

    assert.equal(resF.success, false);
    assert.equal(resF.status, 'unfinalized');
    assert.equal(resF.providerOutcome, 'accepted');
    assert.equal(resF.providerStatus, 'accepted_by_mailapp');
    assert.equal(resF.outboxFinalized, false);
    assert.equal(resF.persistenceOutcome, 'finalization_failed');
    assert.equal(dbF.data.notifications_outbox[notifIdF].status, 'processing', 'Must NOT revert processing -> pending');
    assert.equal(dbF.data.orders[orderIdF].latestNotification, undefined, 'Must NOT update latestNotification');

    // G1: provider rejects (500), finalize tx returns committed: false
    const orderIdG1 = 'ord_fin_fail_reject';
    const notifIdG1 = `notif_order_${orderIdG1}_confirmation`;
    const dbG1 = createAsyncRtdbMock(
      {
        orders: { [orderIdG1]: makeValidOrder() },
        notifications_outbox: {
          [notifIdG1]: {
            notificationId: notifIdG1,
            orderId: orderIdG1,
            channel: 'email',
            status: 'pending',
            attempts: 0
          }
        }
      },
      {
        uncommittedTx: (p, count) => p === `notifications_outbox/${notifIdG1}` && count >= 2
      }
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ success: false, error: 'RELAY_DOWN' }), { status: 500 });

    const resG1 = await sendOrderNotification({
      order: makeValidOrder(),
      orderId: orderIdG1,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_g1',
      adminDb: dbG1
    });

    assert.equal(resG1.success, false);
    assert.equal(resG1.status, 'unfinalized');
    assert.equal(resG1.providerOutcome, 'rejected');
    assert.equal(resG1.providerStatus, 'failed');
    assert.equal(resG1.outboxFinalized, false);
    assert.equal(resG1.persistenceOutcome, 'finalization_failed');
    assert.equal(dbG1.data.notifications_outbox[notifIdG1].status, 'processing');

    // G2: provider times out (AbortError), finalize throws
    const orderIdG2 = 'ord_fin_fail_timeout';
    const notifIdG2 = `notif_order_${orderIdG2}_confirmation`;
    const dbG2 = createAsyncRtdbMock(
      {
        orders: { [orderIdG2]: makeValidOrder() },
        notifications_outbox: {
          [notifIdG2]: {
            notificationId: notifIdG2,
            orderId: orderIdG2,
            channel: 'email',
            status: 'pending',
            attempts: 0
          }
        }
      },
      {
        shouldFailTx: (p, count) => p === `notifications_outbox/${notifIdG2}` && count >= 2
      }
    );

    globalThis.fetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const resG2 = await sendOrderNotification({
      order: makeValidOrder(),
      orderId: orderIdG2,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_g2',
      adminDb: dbG2
    });

    assert.equal(resG2.success, false);
    assert.equal(resG2.status, 'unfinalized');
    assert.equal(resG2.providerOutcome, 'timeout');
    assert.equal(resG2.providerStatus, 'unknown');
    assert.equal(resG2.outboxFinalized, false);
    assert.equal(resG2.persistenceOutcome, 'finalization_failed');
    assert.equal(dbG2.data.notifications_outbox[notifIdG2].status, 'processing');
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origEnabled;
    process.env.GMAIL_RELAY_URL = origUrl;
    process.env.GMAIL_RELAY_SECRET = origSecret;
  }
});

// ===========================================================================
// H-I. Telegram & Make finalization failures separate providerOutcome & persistenceOutcome
// ===========================================================================
test('H-I. Telegram and Make dispatchers report unfinalized when outbox finalize fails without reverting processing', async () => {
  // H: Telegram accepts, finalize fails
  const orderIdTg = 'ord_tg_unfin';
  const tgNotifId = `notif_order_${orderIdTg}_telegram`;
  const dbTg = createAsyncRtdbMock(
    {
      orders: { [orderIdTg]: makeValidOrder() },
      notifications_outbox: {
        [tgNotifId]: {
          notificationId: tgNotifId,
          orderId: orderIdTg,
          channel: 'telegram',
          status: 'pending',
          attempts: 0
        }
      }
    },
    { shouldFailTx: (p, count) => p === `notifications_outbox/${tgNotifId}` && count >= 2 }
  );

  const tgRes = await dispatchTelegramOutboxNotification({
    orderId: orderIdTg,
    orderData: makeValidOrder(),
    adminDb: dbTg,
    sendTelegramFn: async () => ({ success: true, status: 'SUCCESS', allSuccessful: true })
  });
  assert.equal(tgRes.status, 'unfinalized');
  assert.equal(tgRes.outboxStatus, 'processing');
  assert.equal(tgRes.providerOutcome, 'accepted');
  assert.equal(tgRes.providerStatus, 'sent');
  assert.equal(tgRes.outboxFinalized, false);
  assert.equal(tgRes.persistenceOutcome, 'finalization_failed');
  assert.equal(dbTg.data.notifications_outbox[tgNotifId].status, 'processing');

  // I: Make mocked fetchFn only (never calls real Make), finalize fails
  const orderIdMake = 'ord_make_unfin';
  const makeNotifId = `notif_order_${orderIdMake}_make`;
  const dbMake = createAsyncRtdbMock(
    {
      orders: { [orderIdMake]: makeValidOrder() },
      notifications_outbox: {
        [makeNotifId]: {
          notificationId: makeNotifId,
          orderId: orderIdMake,
          channel: 'make',
          status: 'pending',
          attempts: 0
        }
      }
    },
    { shouldFailTx: (p, count) => p === `notifications_outbox/${makeNotifId}` && count >= 2 }
  );

  const makeRes = await dispatchMakeWebhookOutboxNotification({
    orderId: orderIdMake,
    orderData: makeValidOrder(),
    adminDb: dbMake,
    makeWebhookUrl: 'https://hook.make.test/mock_only',
    fetchFn: async () => new Response('{}', { status: 200 })
  });
  assert.equal(makeRes.status, 'unfinalized');
  assert.equal(makeRes.outboxStatus, 'processing');
  assert.equal(makeRes.providerOutcome, 'accepted');
  assert.equal(makeRes.providerStatus, 'sent');
  assert.equal(makeRes.outboxFinalized, false);
  assert.equal(makeRes.persistenceOutcome, 'finalization_failed');
  assert.equal(dbMake.data.notifications_outbox[makeNotifId].status, 'processing');
});

// ===========================================================================
// J. Finalization claim ownership mismatch
// ===========================================================================
test('J. finalizeOutboxNotification detects claim ownership mismatch and blocks sendOrderNotification from updating latestNotification', async () => {
  const orderId = 'ord_own_mismatch';
  const notifId = `notif_order_${orderId}_confirmation`;

  // Direct finalizeOutboxNotification ownership mismatch
  const dbDirect = createAsyncRtdbMock({
    notifications_outbox: {
      [notifId]: {
        notificationId: notifId,
        orderId,
        channel: 'email',
        status: 'processing',
        claimId: 'winner_claim_id'
      }
    }
  });
  const finDirect = await finalizeOutboxNotification({
    adminDb: dbDirect,
    notificationId: notifId,
    claimId: 'stale_worker_claim_id',
    status: 'accepted_by_mailapp'
  });
  assert.equal(finDirect.finalized, false);
  assert.equal(finDirect.reason, 'OWNERSHIP_MISMATCH');
  assert.equal(dbDirect.data.notifications_outbox[notifId].status, 'processing');
  assert.equal(dbDirect.data.notifications_outbox[notifId].claimId, 'winner_claim_id');

  // Cannot finalize back to pending or processing
  const finPending = await finalizeOutboxNotification({
    adminDb: dbDirect,
    notificationId: notifId,
    claimId: 'winner_claim_id',
    status: 'pending'
  });
  assert.equal(finPending.finalized, false);
  assert.equal(finPending.reason, 'STATE_CHANGED');

  // End-to-end sendOrderNotification ownership hijack during HTTP dispatch
  const origFetch = globalThis.fetch;
  const origEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b1/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_2b1_secret';

  try {
    const dbHijack = createAsyncRtdbMock({
      orders: { [orderId]: makeValidOrder() },
      notifications_outbox: {
        [notifId]: {
          notificationId: notifId,
          orderId,
          channel: 'email',
          status: 'pending',
          attempts: 0
        }
      }
    });

    globalThis.fetch = async () => {
      // Simulate another worker/reconciler taking over claimId while HTTP dispatch was in flight
      dbHijack.data.notifications_outbox[notifId].claimId = 'hijacked_claim_999';
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const res = await sendOrderNotification({
      order: makeValidOrder(),
      orderId,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_hijack',
      adminDb: dbHijack
    });

    assert.equal(res.success, false);
    assert.equal(res.status, 'unfinalized');
    assert.equal(res.outboxFinalized, false);
    assert.equal(res.persistenceOutcome, 'ownership_mismatch');
    assert.equal(res.providerOutcome, 'accepted');
    assert.equal(dbHijack.data.orders[orderId].latestNotification, undefined);
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origEnabled;
    process.env.GMAIL_RELAY_URL = origUrl;
    process.env.GMAIL_RELAY_SECRET = origSecret;
  }
});

// ===========================================================================
// K-L. Recovery and order-status APIs never return success/200 on unfinalized/unavailable
// ===========================================================================
test('K-L. recover-order-notifications and order-status enforce outboxFinalized !== false and fail closed on unfinalized/unavailable', async () => {
  const orderId = 'ord_api_unfin';
  const emailNotifId = `notif_order_${orderId}_confirmation`;
  const tgNotifId = `notif_order_${orderId}_telegram`;

  // K: recover-order-notifications
  const mockDbK = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [emailNotifId]: {
        notificationId: emailNotifId,
        orderId,
        channel: 'email',
        status: 'pending',
        attempts: 0
      },
      [tgNotifId]: {
        notificationId: tgNotifId,
        orderId,
        channel: 'telegram',
        status: 'pending',
        attempts: 0
      }
    }
  });

  const recoverRes = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
      body: JSON.stringify({ orderId })
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: mockDbK,
      getOrCreateInvoiceToken: async () => 'tok_k',
      sendOrderNotification: async () => ({
        success: false,
        status: 'accepted_by_mailapp', // Even if a callee somehow returns provider status without finalizing
        outboxFinalized: false,
        providerOutcome: 'accepted',
        providerStatus: 'accepted_by_mailapp',
        persistenceOutcome: 'finalization_failed'
      }),
      dispatchTelegramOutboxNotification: async () => ({
        claimed: true,
        status: 'unfinalized',
        outboxStatus: 'processing',
        providerOutcome: 'accepted',
        providerStatus: 'sent',
        outboxFinalized: false,
        persistenceOutcome: 'finalization_failed'
      })
    }
  });
  assert.equal(recoverRes.status, 200);
  const recoverData = await recoverRes.json();
  assert.equal(recoverData.summary.processed, 0, 'Unfinalized items MUST NOT be counted as processed');
  assert.equal(recoverData.summary.failed, 2);
  for (const item of recoverData.notifications) {
    assert.equal(item.status, 'unfinalized');
    assert.equal(item.outboxFinalized, false);
    assert.equal(item.persistenceOutcome, 'finalization_failed');
    assert.equal(item.manualReviewRequired, true);
  }

  // L1: order-status RETRY_NOTIFICATION fails closed on outboxFinalized: false & on existing 'unfinalized' DB row
  const dbL = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [emailNotifId]: {
        notificationId: emailNotifId,
        orderId,
        channel: 'email',
        status: 'failed',
        attempts: 1
      }
    }
  });

  const origEncKey = process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
  process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  try {
    const retryUnfinRes = await orderStatusPOST({
      request: new Request('http://localhost/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({
          action: 'RETRY_NOTIFICATION',
          orderId,
          notificationId: emailNotifId
        })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: dbL,
        sendOrderNotification: async () => ({
          success: false,
          status: 'unfinalized',
          outboxStatus: 'processing',
          outboxFinalized: false,
          providerOutcome: 'accepted',
          providerStatus: 'accepted_by_mailapp',
          persistenceOutcome: 'finalization_failed'
        })
      }
    });
    assert.equal(retryUnfinRes.status, 409);
    assert.ok(retryUnfinRes.headers.get('cache-control')?.includes('no-store'));
    const retryUnfinData = await retryUnfinRes.json();
    assert.equal(retryUnfinData.success, false);
    assert.equal(retryUnfinData.status, 'unfinalized');
    assert.equal(retryUnfinData.outboxFinalized, false);

    // Unavailable claim store -> 503
    const retryUnavailRes = await orderStatusPOST({
      request: new Request('http://localhost/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({
          action: 'RETRY_NOTIFICATION',
          orderId,
          notificationId: emailNotifId
        })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: dbL,
        sendOrderNotification: async () => ({
          success: false,
          status: 'unavailable',
          outboxFinalized: false,
          providerOutcome: 'not_attempted',
          persistenceOutcome: 'claim_unavailable'
        })
      }
    });
    assert.equal(retryUnavailRes.status, 503);
    const retryUnavailData = await retryUnavailRes.json();
    assert.equal(retryUnavailData.success, false);

    // Pre-existing 'unfinalized' DB row is blocked from retry/send-current
    dbL.data.notifications_outbox[emailNotifId].status = 'unfinalized';
    const blockedRetryRes = await orderStatusPOST({
      request: new Request('http://localhost/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({
          action: 'RETRY_NOTIFICATION',
          orderId,
          notificationId: emailNotifId
        })
      }),
      _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: dbL }
    });
    assert.equal(blockedRetryRes.status, 409);
    const blockedRetryData = await blockedRetryRes.json();
    assert.equal(blockedRetryData.error, 'AMBIGUOUS_NOTIFICATION_STATUS');

    // SEND_CURRENT_STATUS_NOTIFICATION also blocks existing unfinalized and handles unfinalized send result as 409
    const blockedCurrentRes = await orderStatusPOST({
      request: new Request('http://localhost/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({
          action: 'SEND_CURRENT_STATUS_NOTIFICATION',
          orderId
        })
      }),
      _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: dbL }
    });
    assert.equal(blockedCurrentRes.status, 409);

    dbL.data.notifications_outbox[emailNotifId].status = 'failed';
    const sendCurrUnfinRes = await orderStatusPOST({
      request: new Request('http://localhost/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({
          action: 'SEND_CURRENT_STATUS_NOTIFICATION',
          orderId
        })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: dbL,
        sendOrderNotification: async () => ({
          success: true,
          status: 'accepted_by_mailapp',
          outboxFinalized: false,
          providerOutcome: 'accepted',
          persistenceOutcome: 'finalization_failed'
        })
      }
    });
    assert.equal(sendCurrUnfinRes.status, 409);
    const sendCurrUnfinData = await sendCurrUnfinRes.json();
    assert.equal(sendCurrUnfinData.success, false);
    assert.equal(sendCurrUnfinData.status, 'unfinalized');
    assert.equal(sendCurrUnfinData.outboxFinalized, false);
  } finally {
    if (origEncKey === undefined) {
      delete process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = origEncKey;
    }
  }
});

// ===========================================================================
// M-N. Make intentionally disabled in recover-order-notifications
// ===========================================================================
test('M-N. recover-order-notifications never calls Make webhook, preserves historical Make DB records, and reconciles stale Make lease safely', async () => {
  const origFetch = globalThis.fetch;
  const origMakeEnv = process.env.MAKE_WEBHOOK_URL;
  process.env.MAKE_WEBHOOK_URL = 'https://hook.make.test/must-never-be-called';

  let makeCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('make.test')) {
      makeCalls++;
    }
    throw new Error('Unexpected fetch during Make disabled test: ' + url);
  };

  try {
    // M: pending Email, pending Telegram, pending Make -> Email & Telegram recover; Make never called & DB untouched
    const ordM = 'ord_make_disabled_m';
    const emailM = `notif_order_${ordM}_confirmation`;
    const tgM = `notif_order_${ordM}_telegram`;
    const makeM = `notif_order_${ordM}_make`;

    const dbM = createAsyncRtdbMock({
      orders: { [ordM]: makeValidOrder() },
      notifications_outbox: {
        [emailM]: { notificationId: emailM, orderId: ordM, channel: 'email', status: 'pending', attempts: 0 },
        [tgM]: { notificationId: tgM, orderId: ordM, channel: 'telegram', status: 'pending', attempts: 0 },
        [makeM]: {
          notificationId: makeM,
          orderId: ordM,
          channel: 'make',
          eventType: 'MAKE_ORDER_WEBHOOK',
          status: 'pending',
          attempts: 0
        }
      }
    });

    const resM = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({ orderId: ordM })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: dbM,
        getOrCreateInvoiceToken: async () => 'tok_m',
        sendOrderNotification: async () => ({
          success: true,
          status: 'accepted_by_mailapp',
          outboxFinalized: true,
          providerOutcome: 'accepted',
          persistenceOutcome: 'committed'
        }),
        dispatchTelegramOutboxNotification: async () => ({
          claimed: true,
          status: 'sent',
          outboxFinalized: true,
          providerOutcome: 'accepted',
          persistenceOutcome: 'committed'
        })
      }
    });

    assert.equal(resM.status, 200);
    assert.equal(makeCalls, 0);
    const dataM = await resM.json();
    assert.equal(dataM.summary.processed, 2);
    assert.equal(dataM.summary.skipped, 1);
    assert.equal(dbM.data.notifications_outbox[makeM].status, 'pending', 'Must NOT mutate Make DB record');
    const makeItemM = dataM.notifications.find((n) => n.channel === 'make');
    assert.equal(makeItemM.status, 'skipped_intentionally_disabled');
    assert.equal(makeItemM.persistenceOutcome, 'intentionally_disabled');
    assert.equal(makeItemM.providerOutcome, 'skipped');

    // N1: Historical Make 'sent' and 'failed' are preserved untouched in DB
    for (const histStatus of ['sent', 'failed', 'unknown']) {
      const ordHist = `ord_make_hist_${histStatus}`;
      const makeHistId = `notif_order_${ordHist}_make`;
      const dbHist = createAsyncRtdbMock({
        orders: { [ordHist]: makeValidOrder() },
        notifications_outbox: {
          [makeHistId]: {
            notificationId: makeHistId,
            orderId: ordHist,
            channel: 'make',
            eventType: 'MAKE_ORDER_WEBHOOK',
            status: histStatus,
            attempts: 1
          }
        }
      });

      const resHist = await recoverPOST({
        request: new Request('http://localhost/api/admin/recover-order-notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
          body: JSON.stringify({ orderId: ordHist })
        }),
        _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: dbHist }
      });
      assert.equal(resHist.status, 200);
      assert.equal(makeCalls, 0);
      assert.equal(dbHist.data.notifications_outbox[makeHistId].status, histStatus);
      const dataHist = await resHist.json();
      assert.equal(dataHist.summary.failed, 0);
      assert.equal(dataHist.summary.skipped, 1);
      assert.equal(dataHist.notifications[0].status, 'skipped_intentionally_disabled');
    }

    // N2: Stale Make 'processing' lease is reconciled to 'unknown' safely without calling Make
    const ordStaleMake = 'ord_make_stale_proc';
    const makeStaleId = `notif_order_${ordStaleMake}_make`;
    const baseMs = Date.parse('2026-10-01T12:00:00.000Z');
    const dbStaleMake = createAsyncRtdbMock({
      orders: { [ordStaleMake]: makeValidOrder() },
      notifications_outbox: {
        [makeStaleId]: {
          notificationId: makeStaleId,
          orderId: ordStaleMake,
          channel: 'make',
          eventType: 'MAKE_ORDER_WEBHOOK',
          status: 'processing',
          claimId: 'crashed_make_claim',
          processingStartedAt: new Date(baseMs).toISOString(),
          processingLeaseExpiresAt: new Date(baseMs + 30_000).toISOString(),
          attempts: 0
        }
      }
    });
    const resStaleMake = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
        body: JSON.stringify({ orderId: ordStaleMake })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: dbStaleMake,
        nowMs: baseMs + 45_000
      }
    });
    assert.equal(resStaleMake.status, 200);
    assert.equal(makeCalls, 0);
    const dataStaleMake = await resStaleMake.json();
    assert.equal(dataStaleMake.summary.reconciledUnknown, 1);
    assert.equal(dbStaleMake.data.notifications_outbox[makeStaleId].status, 'unknown');
  } finally {
    globalThis.fetch = origFetch;
    process.env.MAKE_WEBHOOK_URL = origMakeEnv;
  }
});

// ===========================================================================
// O-Q. Identity Validation, Deterministic IDs & Legacy Missing-Status Records
// ===========================================================================
test('O-Q. validateOutboxRecordForRecovery and recover-order-notifications enforce recordKey canonical identity, deterministic IDs, and clean legacy rules', async () => {
  const orderId = 'ord_id_check';
  const validConfId = `notif_order_${orderId}_confirmation`;

  // Deterministic ID helper check
  assert.equal(isDeterministicOutboxIdForOrder(validConfId, orderId, 'email', 'ORDER_CONFIRMATION'), true);
  assert.equal(isDeterministicOutboxIdForOrder(`notif_order_${orderId}_status_shipped`, orderId, 'email', 'ORDER_STATUS_CHANGED'), true);
  assert.equal(isDeterministicOutboxIdForOrder(`notif_order_${orderId}_telegram`, orderId, 'telegram', 'TELEGRAM_ORDER_NOTIFICATION'), true);
  assert.equal(isDeterministicOutboxIdForOrder(`notif_order_${orderId}_make`, orderId, 'make', 'MAKE_ORDER_WEBHOOK'), true);

  assert.equal(isDeterministicOutboxIdForOrder(`notif_order_${orderId}_status_invalid`, orderId, 'email'), false);
  assert.equal(isDeterministicOutboxIdForOrder(`notif_order_${orderId}_arbitrary`, orderId, 'telegram'), false);
  assert.equal(isDeterministicOutboxIdForOrder(`notif_order_different_confirmation`, orderId, 'email'), false);

  // Clean legacy missing-status vs corrupted missing-status
  assert.equal(
    isCleanLegacyPendingOutboxRecord({ orderId, channel: 'email', attempts: 0 }),
    true
  );
  assert.equal(
    isCleanLegacyPendingOutboxRecord({ orderId, channel: 'email', claimId: 'leftover' }),
    false
  );
  assert.equal(
    isCleanLegacyPendingOutboxRecord({ orderId, channel: 'email', attempts: 2 }),
    false
  );
  assert.equal(
    isCleanLegacyPendingOutboxRecord({ orderId, channel: 'email', error: 'RELAY_DOWN' }),
    false
  );

  // Unit tests for validateOutboxRecordForRecovery
  assert.equal(
    validateOutboxRecordForRecovery(validConfId, { orderId: 'other_ord', channel: 'email', status: 'pending' }, orderId).reason,
    'ORDER_ID_MISMATCH'
  );
  assert.equal(
    validateOutboxRecordForRecovery(
      validConfId,
      { notificationId: `notif_order_${orderId}_status_new`, orderId, channel: 'email', status: 'pending' },
      orderId
    ).reason,
    'NOTIFICATION_ID_MISMATCH'
  );
  assert.equal(
    validateOutboxRecordForRecovery(validConfId, { orderId, channel: 'whatsapp', status: 'pending' }, orderId).reason,
    'UNRECOGNIZED_CHANNEL'
  );
  assert.equal(
    validateOutboxRecordForRecovery(validConfId, { orderId, channel: 'email', status: 'weird_custom_state' }, orderId).reason,
    'INVALID_OR_CORRUPTED_STATUS'
  );

  // Integration check in recover-order-notifications: corrupted records skipped without dispatch, clean legacy pending dispatches once
  const tgValidId = `notif_order_${orderId}_telegram`;
  const mockDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      // Mismatched notificationId inside valid key
      [validConfId]: {
        notificationId: `notif_order_${orderId}_status_shipped`,
        orderId,
        channel: 'email',
        status: 'pending'
      },
      // Non-deterministic ID
      [`notif_order_${orderId}_custom_9`]: {
        notificationId: `notif_order_${orderId}_custom_9`,
        orderId,
        channel: 'email',
        status: 'pending'
      },
      // Unrecognized status
      [`notif_order_${orderId}_status_processing`]: {
        notificationId: `notif_order_${orderId}_status_processing`,
        orderId,
        channel: 'email',
        status: 'bogus_status'
      },
      // Corrupted missing-status record (attempts: 1 without status)
      [`notif_order_${orderId}_status_delivered`]: {
        notificationId: `notif_order_${orderId}_status_delivered`,
        orderId,
        channel: 'email',
        attempts: 1
      },
      // Clean legacy missing-status Telegram record -> accepted as pending & dispatched!
      [tgValidId]: {
        orderId,
        channel: 'telegram',
        attempts: 0
      }
    }
  });

  let emailDispatches = 0;
  let tgDispatches = 0;
  const res = await recoverPOST({
    request: new Request('http://localhost/api/admin/recover-order-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
      body: JSON.stringify({ orderId })
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: mockDb,
      sendOrderNotification: async () => {
        emailDispatches++;
        return { success: true, status: 'accepted_by_mailapp', outboxFinalized: true };
      },
      dispatchTelegramOutboxNotification: async () => {
        tgDispatches++;
        return {
          claimed: true,
          status: 'sent',
          outboxFinalized: true,
          providerOutcome: 'accepted',
          persistenceOutcome: 'committed'
        };
      }
    }
  });

  assert.equal(res.status, 200);
  assert.equal(emailDispatches, 0, 'Invalid/mismatched/corrupted email records must never dispatch');
  assert.equal(tgDispatches, 1, 'Clean legacy missing-status deterministic record recovers cleanly');
  const data = await res.json();
  assert.equal(data.summary.processed, 1);
  assert.equal(data.summary.skipped, 4);

  const invalidEmailItems = data.notifications.filter((n) => n.channel === 'email');
  assert.equal(invalidEmailItems.length, 4);
  for (const item of invalidEmailItems) {
    assert.equal(item.error, 'INVALID_NOTIFICATION_IDENTITY');
    assert.equal(item.persistenceOutcome, 'identity_mismatch');
    assert.equal(item.manualReviewRequired, true);
    assert.equal(item.outboxFinalized, false);
  }

  // Corrupted missing-status also blocked directly in claimOutboxNotification
  const claimCorrupt = await claimOutboxNotification({
    adminDb: mockDb,
    notificationId: `notif_order_${orderId}_status_delivered`,
    orderId
  });
  assert.equal(claimCorrupt.claimed, false);
  assert.equal(claimCorrupt.reason, 'AMBIGUOUS_UNKNOWN');
});

// ===========================================================================
// R-S. order-status identity validation + reconcileStaleOutboxNotification hardening
// ===========================================================================
test('R-S. order-status validates notification identity/channel and GET filters strict orderId using recordKey', async () => {
  const orderId = 'ord_os_id';
  const tgNotifId = `notif_order_${orderId}_telegram`;
  const otherNotifId = 'notif_order_other_confirmation';

  const db = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder() },
    notifications_outbox: {
      [tgNotifId]: {
        notificationId: tgNotifId,
        orderId,
        channel: 'telegram',
        status: 'failed',
        attempts: 1
      },
      [otherNotifId]: {
        notificationId: otherNotifId,
        orderId: 'other_ord',
        channel: 'email',
        status: 'failed',
        attempts: 1
      },
      [`notif_order_${orderId}_status_new`]: {
        // Missing notificationId inside object — recordKey is canonical!
        orderId,
        channel: 'email',
        status: 'accepted_by_mailapp',
        attempts: 1
      }
    }
  });

  // Retrying telegram record via email RETRY_NOTIFICATION -> 409 INVALID_NOTIFICATION_IDENTITY
  const resWrongChannel = await orderStatusPOST({
    request: new Request('http://localhost/api/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
      body: JSON.stringify({
        action: 'RETRY_NOTIFICATION',
        orderId,
        notificationId: tgNotifId
      })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: db }
  });
  assert.equal(resWrongChannel.status, 409);
  assert.equal((await resWrongChannel.json()).error, 'INVALID_NOTIFICATION_IDENTITY');

  // Retrying another order's notificationId -> 409 INVALID_NOTIFICATION_IDENTITY
  const resWrongOrder = await orderStatusPOST({
    request: new Request('http://localhost/api/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin' },
      body: JSON.stringify({
        action: 'RETRY_NOTIFICATION',
        orderId,
        notificationId: otherNotifId
      })
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: db }
  });
  assert.equal(resWrongOrder.status, 409);
  assert.equal((await resWrongOrder.json()).error, 'INVALID_NOTIFICATION_IDENTITY');

  // GET /api/order-status?orderId=... assigns canonical recordKey as notificationId
  const getRes = await orderStatusGET({
    request: new Request(`http://localhost/api/order-status?orderId=${orderId}`, {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-admin' }
    }),
    _deps: { adminAuth: makeAdminAuthMock('valid_admin'), adminDb: db }
  });
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.notifications.length, 2);
  assert.ok(getData.notifications.every((n) => n.orderId === orderId && n.notificationId));
  const missingIdRow = getData.notifications.find((n) => n.notificationId === `notif_order_${orderId}_status_new`);
  assert.ok(missingIdRow, 'GET must promote canonical recordKey to notificationId');

  // S: reconcileStaleOutboxNotification fails closed on missing DB
  const recNoDb = await reconcileStaleOutboxNotification({
    adminDb: null,
    notificationId: 'notif_order_x_confirmation'
  });
  assert.equal(recNoDb.ok, false);
  assert.equal(recNoDb.outcome, 'RECONCILE_ERROR');
  assert.equal(recNoDb.diagnosticCode, 'RECONCILE_UNAVAILABLE');
});

// ===========================================================================
// T-U. sanitizeOutboxRecordForAdmin strict allowlisting, redaction & bounds
// ===========================================================================
test('T-U. sanitizeOutboxRecordForAdmin drops raw message/PII, maps unrecognized errors to UNSPECIFIED_ERROR, clamps attempts, and validates ISO timestamps', () => {
  assert.equal(sanitizeOutboxErrorCode(null), null);
  assert.equal(sanitizeOutboxErrorCode('RELAY_DOWN'), 'RELAY_DOWN');
  assert.equal(sanitizeOutboxErrorCode('HTTP_503'), 'HTTP_503');
  assert.equal(sanitizeOutboxErrorCode('HTTP_999'), 'UNSPECIFIED_ERROR');
  assert.equal(sanitizeOutboxErrorCode('Sensitive token=abc@secret leaked'), 'UNSPECIFIED_ERROR');
  assert.equal(sanitizeOutboxErrorCode({ raw: 'obj' }), 'UNSPECIFIED_ERROR');
  assert.ok(SAFE_OUTBOX_ERROR_CODES.has('OUTBOX_FINALIZE_FAILED'));

  assert.equal(sanitizeOutboxIsoTimestamp('not-a-timestamp'), null);
  assert.equal(sanitizeOutboxIsoTimestamp('2026-10-01T12:00:00Z'), '2026-10-01T12:00:00.000Z');
  assert.equal(isValidFirebaseOutboxKey('good_key-1'), true);
  assert.equal(isValidFirebaseOutboxKey('bad.key'), false);

  const dirtyRec = {
    notificationId: 'notif_wrong_id',
    orderId: 'ord_t',
    channel: 'carrier_pigeon',
    eventType: 'EVIL_EVENT',
    orderStatus: 'HACKED_STATUS',
    status: 'custom_status',
    attempts: 999999,
    createdAt: 'bad-date',
    lastAttemptAt: '2026-10-01T12:34:56.000Z',
    processingStartedAt: 'javascript:alert(1)',
    processingLeaseExpiresAt: '2026-10-01T12:35:56.000Z',
    staleProcessingDetectedAt: null,
    staleDiagnosticCode: 'SECRET_STACK_TRACE',
    error: 'Bearer secret_123 failed for sara@example.com',
    message: 'RAW PROVIDER RESPONSE WITH EMAIL sara@example.com AND TOKEN tok_secret_123',
    recipientEmail: 'sara@example.com',
    recipientName: 'سارة',
    claimId: 'claim_internal_secret',
    invoiceAccessToken: 'tok_secret_123',
    payload: { secret: true }
  };

  const clean = sanitizeOutboxRecordForAdmin(dirtyRec, 'notif_order_ord_t_confirmation');
  assert.ok(clean);
  assert.equal(clean.notificationId, 'notif_order_ord_t_confirmation');
  assert.equal(clean.channel, 'unknown');
  assert.equal(clean.eventType, '');
  assert.equal(clean.orderStatus, undefined);
  assert.equal(clean.status, 'unknown');
  assert.equal(clean.attempts, 1000);
  assert.equal(clean.createdAt, null);
  assert.equal(clean.lastAttemptAt, '2026-10-01T12:34:56.000Z');
  assert.equal(clean.processingStartedAt, null);
  assert.equal(clean.processingLeaseExpiresAt, '2026-10-01T12:35:56.000Z');
  assert.equal(clean.staleDiagnosticCode, null);
  assert.equal(clean.error, 'UNSPECIFIED_ERROR');
  assert.equal(clean.persistenceOutcome, 'identity_mismatch');
  assert.equal(clean.manualReviewRequired, true);
  assert.equal(clean.outboxFinalized, false);

  // Ensure zero leakage of raw message, PII, claimId, payloads, or tokens
  assert.equal('message' in clean, false);
  assert.equal('recipientEmail' in clean, false);
  assert.equal('recipientName' in clean, false);
  assert.equal('claimId' in clean, false);
  assert.equal('invoiceAccessToken' in clean, false);
  assert.equal('payload' in clean, false);

  const jsonStr = JSON.stringify(clean);
  assert.equal(jsonStr.includes('sara@example.com'), false);
  assert.equal(jsonStr.includes('tok_secret_123'), false);
  assert.equal(jsonStr.includes('claim_internal_secret'), false);
  assert.equal(jsonStr.includes('RAW PROVIDER RESPONSE'), false);
});

// ===========================================================================
// V-W. Deferred Barrier Concurrency Races (Claim Race & Deletion Mid-Dispatch)
// ===========================================================================
test('V-W. Deferred Barrier races: concurrent claim race allows 1 provider call, and deletion mid-dispatch aborts finalization cleanly', async () => {
  const origFetch = globalThis.fetch;
  const origEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b1/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_2b1_secret';

  try {
    // V: Two callers racing for same pending confirmation notification while first dispatch pauses at barrier
    const ordV = 'ord_race_v';
    const notifV = `notif_order_${ordV}_confirmation`;
    const dbV = createAsyncRtdbMock({
      orders: { [ordV]: makeValidOrder() },
      notifications_outbox: {
        [notifV]: { notificationId: notifV, orderId: ordV, channel: 'email', status: 'pending', attempts: 0 }
      }
    });

    const enteredFetch = createDeferred();
    const releaseFetch = createDeferred();
    let fetchCountV = 0;

    globalThis.fetch = async () => {
      fetchCountV++;
      enteredFetch.resolve();
      await releaseFetch.promise;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const call1 = sendOrderNotification({
      order: makeValidOrder(),
      orderId: ordV,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_v',
      adminDb: dbV
    });

    await enteredFetch.promise;

    const call2 = await sendOrderNotification({
      order: makeValidOrder(),
      orderId: ordV,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_v',
      adminDb: dbV
    });
    assert.equal(call2.success, false);
    assert.equal(call2.status, 'processing');
    assert.equal(call2.outboxFinalized, false);
    assert.equal(call2.providerOutcome, 'not_attempted');
    assert.equal(fetchCountV, 1);

    releaseFetch.resolve();
    const res1 = await call1;
    assert.equal(res1.success, true);
    assert.equal(res1.status, 'accepted_by_mailapp');
    assert.equal(res1.outboxFinalized, true);
    assert.equal(fetchCountV, 1);

    // W: Order deleted concurrently while email HTTP dispatch is paused at Deferred Barrier
    const ordW = 'ord_race_del_w';
    const notifW = `notif_order_${ordW}_confirmation`;
    const dbW = createAsyncRtdbMock({
      orders: { [ordW]: makeValidOrder() },
      notifications_outbox: {
        [notifW]: { notificationId: notifW, orderId: ordW, channel: 'email', status: 'pending', attempts: 0 }
      }
    });

    const delBarrierEntered = createDeferred();
    const delBarrierRelease = createDeferred();
    globalThis.fetch = async () => {
      delBarrierEntered.resolve();
      await delBarrierRelease.promise;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    const dispatchPromise = sendOrderNotification({
      order: makeValidOrder(),
      orderId: ordW,
      eventType: 'ORDER_CONFIRMATION',
      invoiceAccessToken: 'tok_w',
      adminDb: dbW
    });

    await delBarrierEntered.promise;
    // Simulate concurrent deletion marking outbox unknown_deleted_during_dispatch & tombstone DELETED
    dbW.data.privateDeletedOrders = { [ordW]: { status: 'DELETED' } };
    delete dbW.data.orders[ordW];
    dbW.data.notifications_outbox[notifW] = {
      notificationId: notifW,
      orderId: ordW,
      channel: 'email',
      status: 'unknown_deleted_during_dispatch',
      attempts: 1
    };

    delBarrierRelease.resolve();
    const resW = await dispatchPromise;
    assert.equal(resW.success, false);
    assert.equal(resW.status, 'unknown_deleted_during_dispatch');
    assert.equal(resW.outboxFinalized, false);
    assert.equal(resW.persistenceOutcome, 'order_deleted');
    assert.equal(dbW.data.orders[ordW], undefined, 'Deleted order must NEVER be resurrected with latestNotification');
  } finally {
    globalThis.fetch = origFetch;
    process.env.GMAIL_NOTIFICATIONS_ENABLED = origEnabled;
    process.env.GMAIL_RELAY_URL = origUrl;
    process.env.GMAIL_RELAY_SECRET = origSecret;
  }
});

// ===========================================================================
// X-Y. dashboard-order.astro UI Verification for Unfinalized / Unavailable / Make Disabled
// ===========================================================================
test('X-Y. dashboard-order.astro distinguishes unfinalized/unavailable/Make-disabled states safely and preserves recovery state without DB re-read overwrite', async () => {
  const dashPath = path.resolve(process.cwd(), 'src/pages/dashboard-order.astro');
  const dashSrc = await fs.readFile(dashPath, 'utf8');

  // X1: Distinct Arabic labels & non-retryable guards
  assert.ok(RECOGNIZED_OUTBOX_STATUSES.has('unfinalized'));
  assert.ok(RECOGNIZED_OUTBOX_STATUSES.has('unavailable'));
  assert.ok(RECOGNIZED_OUTBOX_STATUSES.has('skipped_intentionally_disabled'));

  assert.ok(dashSrc.includes("case 'unfinalized':"));
  assert.ok(dashSrc.includes('تمت محاولة الإرسال — فشل تثبيت السجل'));
  assert.ok(dashSrc.includes('قبل المزوّد الإرسال — فشل تثبيت السجل'));
  assert.ok(dashSrc.includes("case 'unavailable':"));
  assert.ok(dashSrc.includes('غير متاح (تعذّر حجز السجل)'));
  assert.ok(dashSrc.includes("case 'skipped_intentionally_disabled':"));
  assert.ok(dashSrc.includes('معطّل بقرار الإدارة'));
  assert.ok(dashSrc.includes("rec.persistenceOutcome === 'finalization_failed'"));
  assert.ok(dashSrc.includes("NON_RETRYABLE_OUTBOX_STATUSES"));
  assert.ok(dashSrc.includes("btnSendCurrent"));

  // X2: Never displays raw rec.message in safe diagnostic text
  const diagStart = dashSrc.indexOf('function getSafeOutboxDiagnosticText(rec)');
  assert.ok(diagStart !== -1);
  const diagSlice = dashSrc.slice(diagStart, diagStart + 1200);
  assert.equal(diagSlice.includes('rec.message'), false, 'getSafeOutboxDiagnosticText must NEVER read raw rec.message');

  // Y: recoverOrderNotifications renders data.notifications via applyOutboxUiState directly without overwriting via loadOrderOutboxDetails
  const recoverFnStart = dashSrc.indexOf('window.recoverOrderNotifications = async function()');
  assert.ok(recoverFnStart !== -1);
  const recoverFnEnd = dashSrc.indexOf('window.revealOrder = function', recoverFnStart);
  assert.ok(recoverFnEnd > recoverFnStart);
  const recoverFnBody = dashSrc.slice(recoverFnStart, recoverFnEnd);

  assert.ok(recoverFnBody.includes('applyOutboxUiState(orderObj, data.notifications)'));
  assert.equal(
    recoverFnBody.includes('loadOrderOutboxDetails('),
    false,
    'recoverOrderNotifications must NOT call loadOrderOutboxDetails after recovery so skipped_intentionally_disabled & unfinalized states stay intact'
  );
  assert.ok(
    recoverFnBody.includes("emailRec.outboxFinalized !== false && emailRec.status !== 'unfinalized'"),
    'recoverOrderNotifications must not copy unfinalized/unavailable into orderObj.latestNotification'
  );
});
