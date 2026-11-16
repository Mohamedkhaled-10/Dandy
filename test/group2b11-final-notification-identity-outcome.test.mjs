// test/group2b11-final-notification-identity-outcome.test.mjs
// GROUP 2B.1.1: Final Notification Identity, Provider Outcome & Scope Restoration
// Covers Scenarios A through T with async RTDB mocks, Deferred Barriers, and zero live network calls.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  isDeterministicOutboxIdForOrder,
  validateEmailOutboxRecordIdentity,
  claimOutboxNotification,
  dispatchTelegramOutboxNotification
} from '../src/utils/notifications-outbox.ts';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import { POST as orderStatusPOST } from '../src/pages/api/order-status.js';
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
        return { uid: 'adm_2b11', email: 'admin@dandy.com', email_verified: true };
      }
      const err = new Error('auth/invalid-id-token');
      err.code = 'auth/invalid-id-token';
      throw err;
    }
  };
}

function makeValidOrder(overrides = {}) {
  return {
    name: 'نور الهدى',
    email: 'nour@example.com',
    phone: '01099887766',
    governorate: 'القاهرة',
    city: 'مدينة نصر',
    address: 'شارع عباس العقاد',
    invoiceCode: 'DNY-2B11-01',
    status: 'تم الشحن',
    subtotal: 600,
    shippingFee: 85,
    totalAmount: 685,
    products: [{ id: 'p1', name: 'سيروم فيتامين سي', quantity: 1, price: 600, lineTotal: 600 }],
    timestamp: '2026-10-05T10:00:00.000Z',
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

function makeAdminRequest(body) {
  return new Request('http://localhost/api/order-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-admin-2b11'
    },
    body: JSON.stringify(body)
  });
}

// ===========================================================================
// S. isDeterministicOutboxIdForOrder strict eventType separation
// ===========================================================================
test('S. isDeterministicOutboxIdForOrder strictly separates _confirmation and _status_* eventTypes', () => {
  const orderId = 'ord_det_strict';
  assert.equal(
    isDeterministicOutboxIdForOrder(`notif_order_${orderId}_confirmation`, orderId, 'email', 'ORDER_CONFIRMATION'),
    true
  );
  assert.equal(
    isDeterministicOutboxIdForOrder(`notif_order_${orderId}_confirmation`, orderId, 'email', 'ORDER_STATUS_CHANGED'),
    false,
    '_confirmation ID must reject ORDER_STATUS_CHANGED'
  );
  assert.equal(
    isDeterministicOutboxIdForOrder(`notif_order_${orderId}_status_shipped`, orderId, 'email', 'ORDER_STATUS_CHANGED'),
    true
  );
  assert.equal(
    isDeterministicOutboxIdForOrder(`notif_order_${orderId}_status_shipped`, orderId, 'email', 'ORDER_CONFIRMATION'),
    false,
    '_status_* ID must reject ORDER_CONFIRMATION'
  );
  assert.equal(
    isDeterministicOutboxIdForOrder(`notif_order_${orderId}_status_shipped`, orderId, 'email', 'UNKNOWN'),
    false
  );
  assert.equal(
    isDeterministicOutboxIdForOrder(`notif_order_${orderId}_status_badslug`, orderId, 'email', 'ORDER_STATUS_CHANGED'),
    false
  );
});

// ===========================================================================
// A & B & F. RETRY_NOTIFICATION rejects non-deterministic IDs, wrong channels, mismatched metadata BEFORE token & provider
// ===========================================================================
test('A/B/F. RETRY_NOTIFICATION rejects non-deterministic IDs, wrong channel, and mismatched metadata with 409 and 0 token/provider calls', async () => {
  const orderId = 'ord_retry_id_guard';
  const otherOrderId = 'ord_other_999';

  const invalidCases = [
    {
      label: 'arbitrary ID claiming email channel',
      id: 'notif_arbitrary_1',
      rec: {
        notificationId: 'notif_arbitrary_1',
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        status: 'failed'
      }
    },
    {
      label: 'arbitrary ID omitting channel (legacy bypass attempt)',
      id: 'notif_arbitrary_legacy_bypass',
      rec: {
        orderId,
        status: 'failed'
      }
    },
    {
      label: 'invalid status slug claiming email channel',
      id: `notif_order_${orderId}_status_unknownslug`,
      rec: {
        notificationId: `notif_order_${orderId}_status_unknownslug`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        status: 'failed'
      }
    },
    {
      label: 'telegram deterministic ID retried via email action',
      id: `notif_order_${orderId}_telegram`,
      rec: {
        notificationId: `notif_order_${orderId}_telegram`,
        orderId,
        channel: 'telegram',
        eventType: 'TELEGRAM_ORDER_NOTIFICATION',
        status: 'failed'
      }
    },
    {
      label: 'make deterministic ID claiming channel=email',
      id: `notif_order_${orderId}_make`,
      rec: {
        notificationId: `notif_order_${orderId}_make`,
        orderId,
        channel: 'email',
        status: 'failed'
      }
    },
    {
      label: 'valid confirmation key with mismatched eventType ORDER_STATUS_CHANGED',
      id: `notif_order_${orderId}_confirmation`,
      rec: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        status: 'failed'
      }
    },
    {
      label: 'valid status key with mismatched eventType ORDER_CONFIRMATION',
      id: `notif_order_${orderId}_status_shipped`,
      rec: {
        notificationId: `notif_order_${orderId}_status_shipped`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'failed'
      }
    },
    {
      label: 'valid confirmation key with mismatched internal notificationId field',
      id: `notif_order_${orderId}_confirmation`,
      rec: {
        notificationId: `notif_order_${orderId}_status_shipped`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'failed'
      }
    },
    {
      label: 'valid key for another order',
      id: `notif_order_${otherOrderId}_confirmation`,
      rec: {
        notificationId: `notif_order_${otherOrderId}_confirmation`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'failed'
      }
    },
    {
      label: 'valid confirmation key missing orderId in stored record',
      id: `notif_order_${orderId}_confirmation`,
      rec: {
        notificationId: `notif_order_${orderId}_confirmation`,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'failed'
      }
    },
    {
      label: 'non-object corrupted outbox entry',
      id: `notif_order_${orderId}_confirmation`,
      rec: 'corrupted_string_entry'
    },
    {
      label: 'non-string channel value',
      id: `notif_order_${orderId}_confirmation`,
      rec: {
        notificationId: `notif_order_${orderId}_confirmation`,
        orderId,
        channel: 123,
        eventType: 'ORDER_CONFIRMATION',
        status: 'failed'
      }
    }
  ];

  for (const c of invalidCases) {
    const db = createAsyncRtdbMock({
      orders: { [orderId]: makeValidOrder() },
      notifications_outbox: { [c.id]: c.rec }
    });

    let tokenCalls = 0;
    let sendCalls = 0;

    const res = await orderStatusPOST({
      request: makeAdminRequest({
        action: 'RETRY_NOTIFICATION',
        orderId,
        notificationId: c.id
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: db,
        getOrCreateInvoiceToken: async () => {
          tokenCalls++;
          return 'tok_should_never_be_created';
        },
        sendOrderNotification: async () => {
          sendCalls++;
          return { success: true, status: 'accepted_by_mailapp' };
        }
      }
    });

    assert.equal(res.status, 409, `Expected 409 for case: ${c.label}`);
    const payload = await res.json();
    assert.equal(payload.error, 'INVALID_NOTIFICATION_IDENTITY', `Expected INVALID_NOTIFICATION_IDENTITY for: ${c.label}`);
    assert.equal(tokenCalls, 0, `Token MUST NOT be generated/retrieved for: ${c.label}`);
    assert.equal(sendCalls, 0, `Provider MUST NOT be called for: ${c.label}`);
    assert.equal(db.data.privateOrderAccess, undefined);
  }
});

// ===========================================================================
// C. RETRY_NOTIFICATION accepts valid deterministic & clean legacy deterministic email records
// ===========================================================================
test('C. RETRY_NOTIFICATION accepts valid deterministic email records and clean legacy records omitting optional metadata', async () => {
  const orderId = 'ord_retry_legacy_ok';
  const confId = `notif_order_${orderId}_confirmation`;
  const shippedId = `notif_order_${orderId}_status_shipped`;

  const db = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder({ status: 'تم الشحن' }) },
    notifications_outbox: {
      // Clean legacy confirmation record omitting channel, notificationId, eventType, orderStatus
      [confId]: {
        orderId,
        status: 'failed',
        attempts: 1
      },
      // Full modern deterministic shipped record
      [shippedId]: {
        notificationId: shippedId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        orderStatus: 'تم الشحن',
        status: 'failed',
        attempts: 1
      }
    }
  });

  const dispatched = [];
  let tokenCalls = 0;

  const rConf = await orderStatusPOST({
    request: makeAdminRequest({
      action: 'RETRY_NOTIFICATION',
      orderId,
      notificationId: confId
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: db,
      getOrCreateInvoiceToken: async () => {
        tokenCalls++;
        return 'tok_valid_conf';
      },
      sendOrderNotification: async (args) => {
        dispatched.push({
          notificationId: args.retryNotificationId,
          eventType: args.eventType,
          newStatus: args.newStatus
        });
        return {
          success: true,
          status: 'accepted_by_mailapp',
          outboxFinalized: true,
          providerOutcome: 'accepted',
          persistenceOutcome: 'committed'
        };
      }
    }
  });

  assert.equal(rConf.status, 200);
  const confJson = await rConf.json();
  assert.equal(confJson.success, true);
  assert.equal(dispatched[0].notificationId, confId);
  assert.equal(dispatched[0].eventType, 'ORDER_CONFIRMATION');
  assert.equal(dispatched[0].newStatus, 'جديد');

  const rShipped = await orderStatusPOST({
    request: makeAdminRequest({
      action: 'RETRY_NOTIFICATION',
      orderId,
      notificationId: shippedId
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: db,
      getOrCreateInvoiceToken: async () => {
        tokenCalls++;
        return 'tok_valid_ship';
      },
      sendOrderNotification: async (args) => {
        dispatched.push({
          notificationId: args.retryNotificationId,
          eventType: args.eventType,
          newStatus: args.newStatus
        });
        return {
          success: true,
          status: 'accepted_by_mailapp',
          outboxFinalized: true,
          providerOutcome: 'accepted',
          persistenceOutcome: 'committed'
        };
      }
    }
  });

  assert.equal(rShipped.status, 200);
  assert.equal(tokenCalls, 2);
  assert.equal(dispatched[1].notificationId, shippedId);
  assert.equal(dispatched[1].eventType, 'ORDER_STATUS_CHANGED');
  assert.equal(dispatched[1].newStatus, 'تم الشحن');
});

// ===========================================================================
// D & E & F. SEND_CURRENT_STATUS_NOTIFICATION deterministic identity checks before token & provider
// ===========================================================================
test('D/E/F. SEND_CURRENT_STATUS_NOTIFICATION rejects malformed/mismatched existing records before token & allows clean legacy records', async () => {
  const orderId = 'ord_send_cur_guard';
  const shippedId = `notif_order_${orderId}_status_shipped`;

  const badExistingRecords = [
    { label: 'mismatched orderId', rec: { notificationId: shippedId, orderId: 'other_ord', channel: 'email', status: 'failed' } },
    { label: 'missing orderId', rec: { notificationId: shippedId, channel: 'email', status: 'failed' } },
    { label: 'wrong channel telegram', rec: { notificationId: shippedId, orderId, channel: 'telegram', status: 'failed' } },
    { label: 'mismatched eventType ORDER_CONFIRMATION on _status_shipped', rec: { notificationId: shippedId, orderId, channel: 'email', eventType: 'ORDER_CONFIRMATION', status: 'failed' } },
    { label: 'mismatched notificationId field', rec: { notificationId: `notif_order_${orderId}_confirmation`, orderId, channel: 'email', status: 'failed' } },
    { label: 'non-object record', rec: ['bad'] }
  ];

  for (const bad of badExistingRecords) {
    const db = createAsyncRtdbMock({
      orders: { [orderId]: makeValidOrder({ status: 'تم الشحن' }) },
      notifications_outbox: { [shippedId]: bad.rec }
    });

    let tokenCalls = 0;
    let sendCalls = 0;

    const res = await orderStatusPOST({
      request: makeAdminRequest({
        action: 'SEND_CURRENT_STATUS_NOTIFICATION',
        orderId
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: db,
        getOrCreateInvoiceToken: async () => {
          tokenCalls++;
          return 'tok_bad';
        },
        sendOrderNotification: async () => {
          sendCalls++;
          return { success: true, status: 'accepted_by_mailapp' };
        }
      }
    });

    assert.equal(res.status, 409, `Expected 409 for SEND_CURRENT_STATUS_NOTIFICATION (${bad.label})`);
    assert.equal((await res.json()).error, 'INVALID_NOTIFICATION_IDENTITY');
    assert.equal(tokenCalls, 0, `Zero token calls expected for ${bad.label}`);
    assert.equal(sendCalls, 0, `Zero provider calls expected for ${bad.label}`);
  }

  // Clean legacy record omitting channel/notificationId/eventType on deterministic key + matching orderId succeeds
  const legacyDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder({ status: 'تم الشحن' }) },
    notifications_outbox: {
      [shippedId]: {
        orderId,
        status: 'failed',
        attempts: 1
      }
    }
  });

  let legacyTokens = 0;
  let legacySends = 0;
  const legacyRes = await orderStatusPOST({
    request: makeAdminRequest({
      action: 'SEND_CURRENT_STATUS_NOTIFICATION',
      orderId
    }),
    _deps: {
      adminAuth: makeAdminAuthMock('valid_admin'),
      adminDb: legacyDb,
      getOrCreateInvoiceToken: async () => {
        legacyTokens++;
        return 'tok_legacy_ok';
      },
      sendOrderNotification: async (args) => {
        legacySends++;
        assert.equal(args.retryNotificationId, shippedId);
        assert.equal(args.eventType, 'ORDER_STATUS_CHANGED');
        return {
          success: true,
          status: 'accepted_by_mailapp',
          outboxFinalized: true,
          providerOutcome: 'accepted',
          persistenceOutcome: 'committed'
        };
      }
    }
  });

  assert.equal(legacyRes.status, 200);
  assert.equal(legacyTokens, 1);
  assert.equal(legacySends, 1);

  // Direct sendOrderNotification with invalid retryNotificationId fails closed before token creation
  const directDb = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder({ status: 'تم الشحن' }) }
  });
  const directRes = await sendOrderNotification({
    order: makeValidOrder({ status: 'تم الشحن' }),
    orderId,
    eventType: 'ORDER_STATUS_CHANGED',
    newStatus: 'تم الشحن',
    retryNotificationId: 'notif_non_deterministic_direct',
    adminDb: directDb
  });
  assert.equal(directRes.success, false);
  assert.equal(directRes.persistenceOutcome, 'identity_mismatch');
  assert.equal(directDb.data.privateOrderAccess, undefined);
});

// ===========================================================================
// G & H. claimOutboxNotification blocks wrong channel, non-deterministic IDs, mismatched identity
// ===========================================================================
test('G/H. claimOutboxNotification enforces channel, eventType, and deterministic identity at claim boundary', async () => {
  const orderId = 'ord_claim_guard';
  const emailConfId = `notif_order_${orderId}_confirmation`;
  const tgId = `notif_order_${orderId}_telegram`;
  const makeId = `notif_order_${orderId}_make`;

  const db = createAsyncRtdbMock({
    notifications_outbox: {
      [emailConfId]: {
        notificationId: emailConfId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'pending',
        attempts: 0
      },
      [tgId]: {
        notificationId: tgId,
        orderId,
        channel: 'telegram',
        eventType: 'TELEGRAM_ORDER_NOTIFICATION',
        status: 'pending',
        attempts: 0
      },
      [makeId]: {
        notificationId: makeId,
        orderId,
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'pending',
        attempts: 0
      },
      [`notif_order_${orderId}_status_delivered`]: {
        notificationId: `notif_order_${orderId}_status_delivered`,
        orderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION', // mismatched!
        status: 'pending',
        attempts: 0
      }
    }
  });

  // Cross-channel: telegram trying to claim email record
  const tgOnEmail = await claimOutboxNotification({
    adminDb: db,
    notificationId: emailConfId,
    orderId,
    channel: 'telegram',
    eventType: 'TELEGRAM_ORDER_NOTIFICATION'
  });
  assert.equal(tgOnEmail.claimed, false);
  assert.equal(tgOnEmail.reason, 'IDENTITY_MISMATCH');
  assert.equal(db.data.notifications_outbox[emailConfId].status, 'pending');

  // Cross-channel: email trying to claim telegram record
  const emailOnTg = await claimOutboxNotification({
    adminDb: db,
    notificationId: tgId,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION'
  });
  assert.equal(emailOnTg.claimed, false);
  assert.equal(emailOnTg.reason, 'IDENTITY_MISMATCH');
  assert.equal(db.data.notifications_outbox[tgId].status, 'pending');

  // Cross-channel: email trying to claim make record
  const emailOnMake = await claimOutboxNotification({
    adminDb: db,
    notificationId: makeId,
    orderId,
    channel: 'email'
  });
  assert.equal(emailOnMake.claimed, false);
  assert.equal(emailOnMake.reason, 'IDENTITY_MISMATCH');

  // Non-deterministic ID rejected when channel is specified
  const nonDetClaim = await claimOutboxNotification({
    adminDb: db,
    notificationId: 'notif_custom_invalid',
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION'
  });
  assert.equal(nonDetClaim.claimed, false);
  assert.equal(nonDetClaim.reason, 'IDENTITY_MISMATCH');
  assert.equal(db.data.notifications_outbox.notif_custom_invalid, undefined);

  // Stored eventType mismatch rejected
  const badEvtClaim = await claimOutboxNotification({
    adminDb: db,
    notificationId: `notif_order_${orderId}_status_delivered`,
    orderId,
    channel: 'email',
    eventType: 'ORDER_STATUS_CHANGED'
  });
  assert.equal(badEvtClaim.claimed, false);
  assert.equal(badEvtClaim.reason, 'IDENTITY_MISMATCH');
});

// ===========================================================================
// I, J, K, L, M. dispatchTelegramOutboxNotification null/undefined/explicit/unknown-no-retry
// ===========================================================================
test('I/J/K/L/M. dispatchTelegramOutboxNotification never marks null/undefined/ambiguous as sent, preserves explicit outcomes, and never auto-retries unknown', async () => {
  // I: null result -> unknown / ambiguous
  const ordNull = 'ord_tg_null';
  const dbNull = createAsyncRtdbMock({});
  const resNull = await dispatchTelegramOutboxNotification({
    orderId: ordNull,
    orderData: makeValidOrder(),
    adminDb: dbNull,
    sendTelegramFn: async () => null
  });
  assert.equal(resNull.status, 'unknown');
  assert.equal(resNull.providerOutcome, 'ambiguous');
  assert.equal(dbNull.data.notifications_outbox[`notif_order_${ordNull}_telegram`].status, 'unknown');

  // M: Subsequent dispatch on that unknown record MUST NOT call sendTelegramFn again
  let retryCallsNull = 0;
  const resRetryNull = await dispatchTelegramOutboxNotification({
    orderId: ordNull,
    orderData: makeValidOrder(),
    adminDb: dbNull,
    sendTelegramFn: async () => {
      retryCallsNull++;
      return { success: true, status: 'SUCCESS', allSuccessful: true };
    }
  });
  assert.equal(resRetryNull.claimed, false);
  assert.equal(resRetryNull.status, 'unknown');
  assert.equal(retryCallsNull, 0);

  // J: undefined and empty {} -> unknown / ambiguous
  const ordUndef = 'ord_tg_undef';
  const dbUndef = createAsyncRtdbMock({});
  const resUndef = await dispatchTelegramOutboxNotification({
    orderId: ordUndef,
    orderData: makeValidOrder(),
    adminDb: dbUndef,
    sendTelegramFn: async () => undefined
  });
  assert.equal(resUndef.status, 'unknown');
  assert.equal(resUndef.providerOutcome, 'ambiguous');
  assert.equal(dbUndef.data.notifications_outbox[`notif_order_${ordUndef}_telegram`].status, 'unknown');

  const ordEmptyObj = 'ord_tg_emptyobj';
  const dbEmpty = createAsyncRtdbMock({});
  const resEmpty = await dispatchTelegramOutboxNotification({
    orderId: ordEmptyObj,
    orderData: makeValidOrder(),
    adminDb: dbEmpty,
    sendTelegramFn: async () => ({})
  });
  assert.equal(resEmpty.status, 'unknown');
  assert.equal(resEmpty.providerOutcome, 'ambiguous');

  // K1: explicit SUCCESS -> sent / accepted
  const ordOk = 'ord_tg_ok';
  const dbOk = createAsyncRtdbMock({});
  const resOk = await dispatchTelegramOutboxNotification({
    orderId: ordOk,
    orderData: makeValidOrder(),
    adminDb: dbOk,
    sendTelegramFn: async () => ({ success: true, allSuccessful: true, status: 'SUCCESS' })
  });
  assert.equal(resOk.status, 'sent');
  assert.equal(resOk.providerOutcome, 'accepted');
  assert.equal(dbOk.data.notifications_outbox[`notif_order_${ordOk}_telegram`].status, 'sent');

  // K2: explicit skipped -> skipped_not_configured / skipped
  const ordSkip = 'ord_tg_skip';
  const dbSkip = createAsyncRtdbMock({});
  const resSkip = await dispatchTelegramOutboxNotification({
    orderId: ordSkip,
    orderData: makeValidOrder(),
    adminDb: dbSkip,
    sendTelegramFn: async () => ({ skipped: true, status: 'SKIPPED', message: 'Disabled in test' })
  });
  assert.equal(resSkip.status, 'skipped_not_configured');
  assert.equal(resSkip.providerOutcome, 'skipped');
  assert.equal(dbSkip.data.notifications_outbox[`notif_order_${ordSkip}_telegram`].status, 'skipped_not_configured');

  // K3: explicit FAILURE -> failed / rejected
  const ordFail = 'ord_tg_fail';
  const dbFail = createAsyncRtdbMock({});
  const resFail = await dispatchTelegramOutboxNotification({
    orderId: ordFail,
    orderData: makeValidOrder(),
    adminDb: dbFail,
    sendTelegramFn: async () => ({
      success: false,
      allSuccessful: false,
      anySuccessful: false,
      status: 'FAILURE',
      results: [{ chatId: '1', success: false, error: { code: 'HTTP_500' } }]
    })
  });
  assert.equal(resFail.status, 'failed');
  assert.equal(resFail.providerOutcome, 'rejected');

  // L: PARTIAL_SUCCESS & timeout -> unknown
  const ordPartial = 'ord_tg_partial';
  const dbPartial = createAsyncRtdbMock({});
  const resPartial = await dispatchTelegramOutboxNotification({
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
  assert.equal(resPartial.status, 'unknown');
  assert.equal(resPartial.providerOutcome, 'ambiguous');

  const ordTimeout = 'ord_tg_timeout';
  const dbTimeout = createAsyncRtdbMock({});
  const resTimeout = await dispatchTelegramOutboxNotification({
    orderId: ordTimeout,
    orderData: makeValidOrder(),
    adminDb: dbTimeout,
    sendTelegramFn: async () => {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }
  });
  assert.equal(resTimeout.status, 'unknown');
  assert.equal(resTimeout.providerOutcome, 'timeout');
});

// ===========================================================================
// N & P. Deletion fencing, Make intentionally disabled & historical records untouched
// ===========================================================================
test('N/P. Deletion fencing blocks deleted orders and Make remains skipped_intentionally_disabled without mutating history', async () => {
  const deletedOrderId = 'ord_deleted_2b11';
  const delDb = createAsyncRtdbMock({
    privateDeletedOrders: {
      [deletedOrderId]: { orderId: deletedOrderId, status: 'DELETED', deletedAt: '2026-10-05T11:00:00.000Z' }
    }
  });

  const delClaim = await claimOutboxNotification({
    adminDb: delDb,
    notificationId: `notif_order_${deletedOrderId}_confirmation`,
    orderId: deletedOrderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION'
  });
  assert.equal(delClaim.claimed, false);
  assert.equal(delClaim.reason, 'ORDER_DELETED');

  // Recovery keeps Make skipped_intentionally_disabled and never mutates historical Make status
  const liveOrderId = 'ord_make_policy_2b11';
  const makeId = `notif_order_${liveOrderId}_make`;
  const emailId = `notif_order_${liveOrderId}_confirmation`;
  const recDb = createAsyncRtdbMock({
    orders: { [liveOrderId]: makeValidOrder({ status: 'جديد' }) },
    notifications_outbox: {
      [emailId]: {
        notificationId: emailId,
        orderId: liveOrderId,
        channel: 'email',
        eventType: 'ORDER_CONFIRMATION',
        status: 'accepted_by_mailapp',
        attempts: 1
      },
      [makeId]: {
        notificationId: makeId,
        orderId: liveOrderId,
        channel: 'make',
        eventType: 'MAKE_ORDER_WEBHOOK',
        status: 'failed',
        attempts: 1
      }
    }
  });

  const origFetch = globalThis.fetch;
  let liveFetchCalls = 0;
  globalThis.fetch = async () => {
    liveFetchCalls++;
    return new Response('{}', { status: 200 });
  };

  try {
    const recRes = await recoverPOST({
      request: new Request('http://localhost/api/admin/recover-order-notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-admin-2b11'
        },
        body: JSON.stringify({ orderId: liveOrderId })
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: recDb
      }
    });

    assert.equal(recRes.status, 200);
    const recData = await recRes.json();
    const makeRow = recData.notifications.find((n) => n.channel === 'make');
    assert.ok(makeRow);
    assert.equal(makeRow.status, 'skipped_intentionally_disabled');
    assert.equal(liveFetchCalls, 0);
    assert.equal(recDb.data.notifications_outbox[makeId].status, 'failed');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ===========================================================================
// O. Active email relay path intact with mocked fetch + valid deterministic retry
// ===========================================================================
test('O. Active Apps Script email relay path remains intact through RETRY_NOTIFICATION', async () => {
  const orderId = 'ord_email_relay_2b11';
  const notifId = `notif_order_${orderId}_status_shipped`;
  const hexKey = crypto.randomBytes(32).toString('hex');

  const db = createAsyncRtdbMock({
    orders: { [orderId]: makeValidOrder({ status: 'تم الشحن' }) },
    notifications_outbox: {
      [notifId]: {
        notificationId: notifId,
        orderId,
        channel: 'email',
        eventType: 'ORDER_STATUS_CHANGED',
        orderStatus: 'تم الشحن',
        status: 'failed',
        attempts: 1
      }
    }
  });

  const origFetch = globalThis.fetch;
  const origEnabled = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  const origUrl = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  const origKey = process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;

  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock_2b11/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_secret_2b11';
  process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = hexKey;

  let relayFetchCalls = 0;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('script.google.com'));
    relayFetchCalls++;
    return new Response(
      JSON.stringify({ success: true, messageId: 'msg_2b11_ok' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const res = await orderStatusPOST({
      request: makeAdminRequest({
        action: 'RETRY_NOTIFICATION',
        orderId,
        notificationId: notifId
      }),
      _deps: {
        adminAuth: makeAdminAuthMock('valid_admin'),
        adminDb: db
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, 'accepted_by_mailapp');
    assert.equal(data.outboxFinalized, true);
    assert.equal(relayFetchCalls, 1);
    assert.equal(db.data.notifications_outbox[notifId].status, 'accepted_by_mailapp');
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
// Q & R. Protected Astro/Vercel/Build/Firebase config lock & .env.example hygiene
// ===========================================================================
test('Q/R. Protected Astro/Vercel/Build config invariants remain intact and .env.example contains no live secrets', async () => {
  const astroCfg = await fs.readFile(path.resolve('astro.config.mjs'), 'utf8');
  assert.ok(astroCfg.includes("process.env.VERCEL === '1'"));
  assert.ok(astroCfg.includes("@astrojs/vercel"));
  assert.ok(astroCfg.includes("@astrojs/node"));

  const vercelCfg = JSON.parse(await fs.readFile(path.resolve('vercel.json'), 'utf8'));
  assert.ok(vercelCfg);

  const pkg = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
  assert.ok(pkg.scripts?.build);
  assert.ok(pkg.scripts?.lint);

  const envExample = await fs.readFile(path.resolve('.env.example'), 'utf8');
  assert.ok(!envExample.includes('AIza'));
  assert.ok(!envExample.includes('-----BEGIN PRIVATE KEY-----'));
  assert.ok(!/https:\/\/hooks\.make\.com\/[a-zA-Z0-9]{10,}/.test(envExample));
});

// ===========================================================================
// T. Concurrency race with Deferred Barrier: validateEmailOutboxRecordIdentity & single winner
// ===========================================================================
test('T. Concurrent claimOutboxNotification with Deferred Barrier allows single winner and validates identity strictly', async () => {
  const orderId = 'ord_conc_2b11';
  const notifId = `notif_order_${orderId}_status_delivered`;
  const barrier = createDeferred();
  let pausedOnce = false;

  const db = createAsyncRtdbMock(
    {
      notifications_outbox: {
        [notifId]: {
          notificationId: notifId,
          orderId,
          channel: 'email',
          eventType: 'ORDER_STATUS_CHANGED',
          status: 'pending',
          attempts: 0
        }
      }
    },
    {
      beforeTxCommit: async ({ path: txPath }) => {
        if (!pausedOnce && txPath === `notifications_outbox/${notifId}`) {
          pausedOnce = true;
          await barrier.promise;
        }
      }
    }
  );

  const p1 = claimOutboxNotification({
    adminDb: db,
    notificationId: notifId,
    orderId,
    channel: 'email',
    eventType: 'ORDER_STATUS_CHANGED'
  });

  // Resolve barrier after second caller enters
  setTimeout(() => barrier.resolve(), 10);

  const p2 = claimOutboxNotification({
    adminDb: db,
    notificationId: notifId,
    orderId,
    channel: 'email',
    eventType: 'ORDER_STATUS_CHANGED'
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  const winners = [r1, r2].filter((r) => r.claimed);
  const blocked = [r1, r2].filter((r) => !r.claimed);
  assert.equal(winners.length, 1);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].reason, 'IN_FLIGHT');

  // Verify helper handles valid/invalid email records accurately
  assert.equal(
    validateEmailOutboxRecordIdentity({
      notificationId: notifId,
      orderId,
      record: { orderId, status: 'pending' },
      expectedEventType: 'ORDER_STATUS_CHANGED'
    }).ok,
    true
  );
  assert.equal(
    validateEmailOutboxRecordIdentity({
      notificationId: notifId,
      orderId,
      record: { orderId, channel: 'telegram', status: 'pending' },
      expectedEventType: 'ORDER_STATUS_CHANGED'
    }).ok,
    false
  );
});
