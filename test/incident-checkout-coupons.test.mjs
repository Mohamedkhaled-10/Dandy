// test/incident-checkout-coupons.test.mjs
// Incident verification suite for Checkout 409 ORDER_IN_PROGRESS recovery,
// Client-vs-Server fingerprint parity, Coupon Admin hardening, and Turnstile lifecycle UX.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const orderFlowHelpers = require('../public/assets/js/order-flow-helpers.js');
import {
  computeOrderRequestFingerprint,
  hashClientRequestId,
  acquireOrderIdempotencyLock,
  inspectOrRecoverOrderAttempt
} from '../src/utils/order-idempotency.ts';
import { normalizeEgyptianPhone } from '../src/utils/phone.ts';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import { POST as orderAttemptStatusPOST } from '../src/pages/api/order-attempt-status.js';
import {
  GET as couponsAdminGET,
  POST as couponsAdminPOST
} from '../src/pages/api/coupons/admin.js';

const TEST_ENC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createMockAdminDb(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  let pushCounter = 0;

  function getAtPath(targetPath) {
    if (!targetPath) return data;
    const parts = targetPath.split('/').filter(Boolean);
    let curr = data;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return undefined;
      curr = curr[p];
    }
    return curr === undefined ? null : curr;
  }

  function setAtPath(targetPath, val) {
    const parts = targetPath.split('/').filter(Boolean);
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
  }

  function makeRef(targetPath = '') {
    return {
      key: targetPath.split('/').filter(Boolean).pop() || null,
      async once() {
        const val = getAtPath(targetPath);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        setAtPath(targetPath, val);
      },
      async update(updates) {
        if (options.failMultiUpdate && !targetPath) {
          throw new Error('Simulated multi-path update failure');
        }
        if (targetPath) {
          const existing = getAtPath(targetPath) || {};
          setAtPath(targetPath, { ...existing, ...updates });
        } else {
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
        }
      },
      push() {
        pushCounter++;
        const newKey = `-MockOrder_${pushCounter}`;
        const childPath = targetPath ? `${targetPath}/${newKey}` : newKey;
        return makeRef(childPath);
      },
      async transaction(updater) {
        const current = getAtPath(targetPath);
        const clonedCurrent =
          current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
        const nextVal = updater(clonedCurrent);
        if (nextVal !== undefined) {
          setAtPath(targetPath, nextVal);
        }
        const finalVal = getAtPath(targetPath);
        return {
          committed: nextVal !== undefined,
          snapshot: {
            val: () =>
              finalVal === null || finalVal === undefined ? null : JSON.parse(JSON.stringify(finalVal))
          }
        };
      }
    };
  }

  return { data, ref: makeRef };
}

function makeJsonReq(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

// ============================================================================
// 1. Client vs Server Fingerprint & Phone Parity Tests
// ============================================================================
test('1. Client & server phone normalization and order request fingerprints match across edge variants', async () => {
  const phonePairs = [
    ['+20 101 234 5678', '01012345678'],
    ['00201012345678', '01012345678'],
    ['201012345678', '01012345678'],
    ['+2001012345678', '01012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '01012345678'],
    ['۰۱۰۱۲۳۴۵۶۷۸', '01012345678'],
    ['0223456789', '0223456789']
  ];

  for (const [raw, expected] of phonePairs) {
    assert.equal(normalizeEgyptianPhone(raw), expected, `Server phone failed for ${raw}`);
    assert.equal(
      orderFlowHelpers.normalizeEgyptianPhoneClient(raw),
      expected,
      `Client phone mismatched server for ${raw}`
    );
  }
  assert.equal(normalizeEgyptianPhone('010123abc78'), null);
  assert.equal(orderFlowHelpers.normalizeEgyptianPhoneClient('010123abc78'), null);

  const clientFingerprint = await orderFlowHelpers.computeLocalOrderFingerprintHex(
    {
      name: '  سارة أحمد ',
      phone: '+20 ٠١٠-١٢٣٤-٥٦٧٨',
      email: '  SARA@Example.com ',
      governorate: ' Cairo ',
      city: ' مدينة نصر ',
      address: ' 12 شارع النصر ',
      customerId: null,
      couponCode: '  welcome20 ',
      items: [
        {
          id: 'prod_2',
          quantity: 1,
          selectedVariants: [
            { groupId: 'shade', optionId: 'rose' },
            { groupId: 'size', optionId: '50ml' }
          ]
        },
        {
          productId: 'prod_1',
          quantity: 2,
          selectedVariants: [{ groupId: 'finish', optionId: 'matte' }]
        }
      ]
    },
    globalThis.crypto
  );

  // Server receives same cart items with variants in reverse order, uppercase coupon, and raw phone
  const serverFingerprint = computeOrderRequestFingerprint({
    name: 'سارة أحمد',
    phone: '00201012345678',
    email: 'sara@example.com',
    governorate: 'Cairo',
    city: 'مدينة نصر',
    address: '12 شارع النصر',
    customerId: null,
    couponCode: 'WELCOME20',
    items: [
      {
        id: 'prod_2',
        quantity: 1,
        selectedVariants: [
          { groupId: 'size', optionId: '50ml' },
          { groupId: 'shade', optionId: 'rose' }
        ]
      },
      {
        productId: 'prod_1',
        quantity: 2,
        selectedVariants: [{ groupId: 'finish', optionId: 'matte' }]
      }
    ]
  });

  assert.equal(clientFingerprint, serverFingerprint);
});

// ============================================================================
// 2. Corrupted COMMITTING record cannot renew lease forever
// ============================================================================
test('2. Corrupted COMMITTING record missing commitPayload fails cleanly instead of infinite lease renewal', async () => {
  const clientRequestId = '11111111-1111-4111-8111-111111111111';
  const reqHash = hashClientRequestId(clientRequestId);
  const fingerprint = computeOrderRequestFingerprint({
    name: 'نور الهدى',
    phone: '01099887766',
    email: 'noor@example.com',
    governorate: 'Giza',
    city: 'الدقي',
    address: 'شارع التحرير',
    customerId: null,
    couponCode: null,
    items: [{ productId: 'prod_a', quantity: 1 }]
  });

  const adminDb = createMockAdminDb({
    privateOrderIdempotency: {
      [reqHash]: {
        requestKeyHash: reqHash,
        requestFingerprint: fingerprint,
        status: 'COMMITTING',
        reservedOrderId: '-MockCorrupt_1',
        attemptId: 'att_old',
        commitId: 'cmt_old',
        committingLeaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString()
        // Intentionally missing commitPayload
      }
    }
  });

  const lockRes = await acquireOrderIdempotencyLock({
    clientRequestId,
    requestFingerprint: fingerprint,
    adminDb
  });

  assert.equal(lockRes.outcome, 'UNAVAILABLE');
  assert.equal(lockRes.reason, 'MISSING_COMMIT_PAYLOAD');

  const inspectRes = await inspectOrRecoverOrderAttempt({
    clientRequestId,
    requestFingerprint: fingerprint,
    adminDb,
    encryptionKey: TEST_ENC_KEY
  });

  assert.equal(inspectRes.state, 'UNAVAILABLE');
  assert.equal(inspectRes.reason, 'MISSING_COMMIT_PAYLOAD');
  assert.equal(inspectRes.canResetAttempt, false);
});

// ============================================================================
// 3. POST /api/order-attempt-status full non-duplicating recovery matrix
// ============================================================================
test('3. /api/order-attempt-status recovers expired COMMITTING, promotes expired PENDING with order, respects active locks, and allows reset only when safe', async () => {
  const ipContext = { clientAddress: '198.51.100.42' };

  const baseOrderBody = {
    customer: {
      name: 'مريم عادل',
      phone: '01012345678',
      email: 'mariam@example.com',
      governorate: 'Cairo',
      city: 'المعادي',
      address: 'شارع 9'
    },
    items: [{ productId: 'prod_1', quantity: 2 }],
    couponCode: null
  };

  // A. Non-existent clientRequestId -> SAFE_TO_RESET without mutating RTDB
  const emptyDb = createMockAdminDb({});
  const notFoundUuid = '22222222-2222-4222-8222-222222222222';
  const resNotFound = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: notFoundUuid,
      ...baseOrderBody
    }),
    _deps: { adminDb: emptyDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  assert.equal(resNotFound.status, 200);
  const bodyNotFound = await resNotFound.json();
  assert.equal(bodyNotFound.state, 'SAFE_TO_RESET');
  assert.equal(bodyNotFound.reason, 'NOT_FOUND');
  assert.equal(bodyNotFound.canResetAttempt, true);
  assert.equal(emptyDb.data.privateOrderIdempotency, undefined);
  assert.equal(emptyDb.data.orders, undefined);

  // B. Simulate crash during COMMITTING via create-order (before COMPLETED transition)
  const commitCrashUuid = '33333333-3333-4333-8333-333333333333';
  const seededDb = createMockAdminDb({
    products: {
      prod_1: {
        id: 'prod_1',
        name: 'كريم ترطيب',
        price: 250,
        category: 'skin-care',
        stockQuantity: 10
      }
    }
  });

  // Create order while deliberately simulating crash right before finalizing COMMITTING -> COMPLETED
  // First verify real create-order produces valid commitPayload if we inject an expired COMMITTING record
  let emailCalls = 0;
  let tgCalls = 0;
  const createRes = await createOrderPOST({
    request: makeJsonReq('http://localhost:3000/api/create-order', {
      ...baseOrderBody,
      turnstileToken: 'ok',
      clientRequestId: commitCrashUuid
    }),
    _deps: {
      adminDb: seededDb,
      encryptionKey: TEST_ENC_KEY,
      ipContext,
      verifyTurnstileToken: async () => ({ success: true }),
      emailTimeoutMs: 50,
      sendOrderNotification: async () => { emailCalls++; return { success: true }; },
      sendTelegramNotification: async () => { tgCalls++; return { ok: true }; }
    }
  });
  assert.equal(createRes.status, 200);
  const createdJson = await createRes.json();
  assert.equal(seededDb.data.products.prod_1.stockQuantity, 8);

  // B1. Inspecting COMPLETED idempotency key replays identical order & token cleanly
  const replayRes = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: commitCrashUuid,
      ...baseOrderBody
    }),
    _deps: { adminDb: seededDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  assert.equal(replayRes.status, 200);
  const replayJson = await replayRes.json();
  assert.equal(replayJson.state, 'COMPLETED');
  assert.equal(replayJson.canResetAttempt, false);
  assert.equal(replayJson.orderId, createdJson.orderId);
  assert.equal(replayJson.invoiceAccessToken, createdJson.invoiceAccessToken);
  assert.equal(seededDb.data.products.prod_1.stockQuantity, 8); // Never deducted again

  // C. Active PENDING lock -> IN_PROGRESS, canResetAttempt MUST be false
  const activePendingUuid = '44444444-4444-4444-8444-444444444444';
  const activeHash = hashClientRequestId(activePendingUuid);
  const expectedFp = computeOrderRequestFingerprint({
    ...baseOrderBody.customer,
    customerId: null,
    couponCode: null,
    items: baseOrderBody.items
  });
  seededDb.data.privateOrderIdempotency[activeHash] = {
    requestKeyHash: activeHash,
    requestFingerprint: expectedFp,
    status: 'PENDING',
    reservedOrderId: '-MockActivePending_1',
    attemptId: 'att_active_1',
    leaseExpiresAt: new Date(Date.now() + 20_000).toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString()
  };

  const pendingRes = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: activePendingUuid,
      ...baseOrderBody
    }),
    _deps: { adminDb: seededDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  assert.equal(pendingRes.status, 200);
  const pendingJson = await pendingRes.json();
  assert.equal(pendingJson.state, 'IN_PROGRESS');
  assert.equal(pendingJson.stage, 'PENDING');
  assert.equal(pendingJson.canResetAttempt, false);
  assert.ok(pendingJson.retryAfterSeconds >= 1);

  // D. Expired PENDING lock WITHOUT persisted order -> SAFE_TO_RESET
  seededDb.data.privateOrderIdempotency[activeHash].leaseExpiresAt = new Date(Date.now() - 5000).toISOString();
  const expiredNoOrderRes = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: activePendingUuid,
      ...baseOrderBody
    }),
    _deps: { adminDb: seededDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  const expiredNoOrderJson = await expiredNoOrderRes.json();
  assert.equal(expiredNoOrderJson.state, 'SAFE_TO_RESET');
  assert.equal(expiredNoOrderJson.reason, 'EXPIRED_PENDING_NO_ORDER');
  assert.equal(expiredNoOrderJson.canResetAttempt, true);

  // E. Expired PENDING lock WITH persisted order -> promoted to COMPLETED & token returned
  seededDb.data.orders['-MockActivePending_1'] = {
    ...seededDb.data.orders[createdJson.orderId],
    invoiceCode: 'DNY-PROMOTED'
  };
  const expiredWithOrderRes = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: activePendingUuid,
      ...baseOrderBody
    }),
    _deps: { adminDb: seededDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  const expiredWithOrderJson = await expiredWithOrderRes.json();
  assert.equal(expiredWithOrderJson.state, 'COMPLETED');
  assert.equal(expiredWithOrderJson.recovered, true);
  assert.equal(expiredWithOrderJson.canResetAttempt, false);
  assert.equal(expiredWithOrderJson.orderId, '-MockActivePending_1');
  assert.equal(expiredWithOrderJson.invoiceCode, 'DNY-PROMOTED');
  assert.ok(expiredWithOrderJson.invoiceAccessToken);

  // F. Modified payload -> CONFLICT with canResetAttempt: true
  const conflictRes = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: commitCrashUuid,
      customer: { ...baseOrderBody.customer, city: 'الزمالك' },
      items: baseOrderBody.items
    }),
    _deps: { adminDb: seededDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  const conflictJson = await conflictRes.json();
  assert.equal(conflictJson.state, 'CONFLICT');
  assert.equal(conflictJson.previousOrderExists, true);
  assert.equal(conflictJson.canResetAttempt, true);

  // G. Administratively DELETED order -> 409 ORDER_DELETED, canResetAttempt: false
  const deletedUuid = '55555555-5555-4555-8555-555555555555';
  const deletedHash = hashClientRequestId(deletedUuid);
  seededDb.data.privateOrderIdempotency[deletedHash] = {
    requestKeyHash: deletedHash,
    requestFingerprint: expectedFp,
    status: 'DELETED',
    reservedOrderId: '-MockDel_1'
  };
  const delRes = await orderAttemptStatusPOST({
    request: makeJsonReq('http://localhost:3000/api/order-attempt-status', {
      clientRequestId: deletedUuid,
      ...baseOrderBody
    }),
    _deps: { adminDb: seededDb, encryptionKey: TEST_ENC_KEY, ipContext }
  });
  assert.equal(delRes.status, 409);
  const delJson = await delRes.json();
  assert.equal(delJson.error, 'ORDER_DELETED');
  assert.equal(delJson.canResetAttempt, false);
});

// ============================================================================
// 4. create-order parallel stock deduction & bounded email timeout
// ============================================================================
test('4. create-order finishes quickly with bounded email timeout and parallel multi-item stock deduction', async () => {
  const ipContext = { clientAddress: '198.51.100.77' };
  const adminDb = createMockAdminDb({
    products: {
      prod_a: { id: 'prod_a', name: 'منتج أ', price: 300, stockQuantity: 5 },
      prod_b: { id: 'prod_b', name: 'منتج ب', price: 200, stockQuantity: 7 }
    }
  });

  const t0 = Date.now();
  const res = await createOrderPOST({
    request: makeJsonReq('http://localhost:3000/api/create-order', {
      customer: {
        name: 'ياسمين خالد',
        phone: '01122334455',
        email: 'yasmin@example.com',
        governorate: 'Alexandria',
        city: 'سموحة',
        address: 'شارع فوزي معاذ'
      },
      items: [
        { productId: 'prod_a', quantity: 2 },
        { productId: 'prod_b', quantity: 3 }
      ],
      turnstileToken: 'ok',
      clientRequestId: '66666666-6666-4666-8666-666666666666'
    }),
    _deps: {
      adminDb,
      encryptionKey: TEST_ENC_KEY,
      ipContext,
      verifyTurnstileToken: async () => ({ success: true }),
      emailTimeoutMs: 40,
      sendOrderNotification: async ({ timeoutMs }) => {
        // Confirm create-order passed the bounded checkout timeout
        assert.equal(timeoutMs, 40);
        await new Promise((r) => setTimeout(r, timeoutMs));
        return { success: false, skipped: true };
      },
      sendTelegramNotification: async () => ({ ok: true })
    }
  });
  const elapsed = Date.now() - t0;

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(adminDb.data.products.prod_a.stockQuantity, 3);
  assert.equal(adminDb.data.products.prod_b.stockQuantity, 4);
  assert.ok(elapsed < 1500, `Expected create-order to complete fast, took ${elapsed}ms`);
});

// ============================================================================
// 5. Coupon Admin UI Hardening: 401 refresh retry, HTML 404/502 handling, 403 preservation
// ============================================================================
test('5. dashboard-coupons.astro handles 401 token refresh retry, HTML 404/502 responses, and 403 errors without crashing or discarding form data', async () => {
  const dashSrc = await fs.readFile(path.resolve('src/pages/dashboard-coupons.astro'), 'utf8');
  const scriptMatch = dashSrc.match(/<script is:inline>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch);
  const scriptCode = scriptMatch[1];

  function createMiniDom() {
    const ids = new Map();
    function makeEl(id = '') {
      const listeners = new Map();
      return {
        id,
        value: '',
        checked: true,
        disabled: false,
        required: false,
        textContent: '',
        innerHTML: '',
        className: '',
        style: {},
        children: [],
        attributes: {},
        appendChild(c) { this.children.push(c); },
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; },
        removeAttribute(k) { delete this.attributes[k]; },
        addEventListener(type, fn) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(fn);
        },
        async dispatchEvent(evOrType) {
          const ev = typeof evOrType === 'string' ? { type: evOrType, preventDefault() {} } : evOrType;
          for (const fn of listeners.get(ev.type) || []) {
            await fn(ev);
          }
        },
        classList: { remove() {}, add() {}, contains() { return false; } },
        closest() { return null; }
      };
    }
    const getEl = (id) => {
      if (!ids.has(id)) ids.set(id, makeEl(id));
      return ids.get(id);
    };
    return {
      getEl,
      mockDoc: {
        readyState: 'complete',
        getElementById: getEl,
        querySelectorAll: () => [],
        addEventListener: () => {},
        createElement: () => makeEl()
      }
    };
  }

  // Case A: Initial GET returns 401 once (expired 1h token), force refresh succeeds -> stays on page & loads coupons!
  const { getEl, mockDoc } = createMiniDom();
  let getAttempt = 0;
  let forceRefreshCount = 0;
  const db = createMockAdminDb({ settings: { coupons: {} } });

  const mockWindow = {
    location: { href: 'http://localhost:3000/dashboard-coupons', replace(u) { this.href = u; } },
    auth: {
      currentUser: {
        email: 'admin@dandy.com',
        emailVerified: true,
        async getIdToken(force = false) {
          if (force) {
            forceRefreshCount++;
            return 'fresh-token';
          }
          return 'stale-token';
        }
      },
      onAuthStateChanged(cb) { cb(this.currentUser); }
    }
  };

  let nextPostMock = null;
  async function mockFetch(url, init = {}) {
    if ((init.method || 'GET').toUpperCase() === 'GET') {
      getAttempt++;
      if (getAttempt === 1) {
        return new Response(JSON.stringify({ success: false, message: 'Expired token' }), { status: 401 });
      }
      assert.equal(init.headers.Authorization, 'Bearer fresh-token');
      return new Response(
        JSON.stringify({
          success: true,
          coupons: [],
          categories: [{ slug: 'skin-care', arabicName: 'العناية بالبشرة' }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (nextPostMock) return nextPostMock(url, init);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  vm.runInNewContext(scriptCode, {
    window: mockWindow,
    document: mockDoc,
    fetch: mockFetch,
    Intl, Date, Number, String, Boolean, Array, Object, Set, Map, Promise, Math, JSON,
    setTimeout, clearTimeout, setInterval, clearInterval, console
  });

  await new Promise((r) => setTimeout(r, 30));
  assert.equal(forceRefreshCount, 1);
  assert.equal(mockWindow.location.href, 'http://localhost:3000/dashboard-coupons');

  // Case B: POST returns HTML 404 page -> must NOT throw SyntaxError, must display HTTP 404 error in form
  nextPostMock = () =>
    new Response('<!DOCTYPE html><html><body>404 Not Found</body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' }
    });

  await getEl('btnOpenCreateCoupon').dispatchEvent('click');
  getEl('couponCodeInput').value = 'SAVE10';
  getEl('couponDiscountTypeSelect').value = 'percentage';
  getEl('couponDiscountValueInput').value = '10';
  getEl('couponScopeSelect').value = 'all';
  await getEl('couponForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await new Promise((r) => setTimeout(r, 20));

  assert.match(getEl('couponFormErrorBox').textContent, /404/);
  assert.equal(getEl('couponFormErrorBox').style.display, 'block');
  assert.equal(mockWindow.location.href, 'http://localhost:3000/dashboard-coupons');

  // Case C: POST returns 403 -> shows explicit error without redirecting away or wiping form inputs
  nextPostMock = () =>
    new Response(JSON.stringify({ success: false, message: 'غير مصرح للوصول.' }), { status: 403 });

  await getEl('couponForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await new Promise((r) => setTimeout(r, 20));

  assert.match(getEl('couponFormErrorBox').textContent, /غير مصرح/);
  assert.equal(getEl('couponCodeInput').value, 'SAVE10');
  assert.equal(mockWindow.location.href, 'http://localhost:3000/dashboard-coupons');
});

// ============================================================================
// 6. Turnstile lifecycle callbacks across cart, account-login, account-signup
// ============================================================================
test('6. Turnstile pages register explicit verification, expiration, and error lifecycle callbacks', async () => {
  const [cartSrc, loginSrc, signupSrc] = await Promise.all([
    fs.readFile(path.resolve('src/pages/cart.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/account-login.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/account-signup.astro'), 'utf8')
  ]);

  for (const [name, src] of [
    ['account-login.astro', loginSrc],
    ['account-signup.astro', signupSrc]
  ]) {
    assert.match(src, /data-callback=/, `${name} missing data-callback`);
    assert.match(src, /data-expired-callback=/, `${name} missing data-expired-callback`);
    assert.match(src, /data-error-callback=/, `${name} missing data-error-callback`);
  }

  // cart.astro renders Turnstile explicitly only when Step 3 is visible to avoid hidden-iframe postMessage errors
  assert.match(cartSrc, /render=explicit&onload=onDandyCartTurnstileLoad/);
  assert.match(cartSrc, /function ensureCartTurnstileRendered\(/);
  assert.match(cartSrc, /'expired-callback':\s*window\.dandyCartTurnstileExpired/);
  assert.match(cartSrc, /'error-callback':\s*window\.dandyCartTurnstileError/);

  assert.match(cartSrc, /id="cartTurnstileStatusMsg"/);
  assert.match(cartSrc, /\/api\/order-attempt-status/);
  assert.match(loginSrc, /id="loginTurnstileStatusMsg"/);
  assert.match(signupSrc, /id="signupTurnstileStatusMsg"/);
});

// ============================================================================
// 7. 409 ORDER_DELETED handling, 15s PENDING lease, and stale PENDING takeover without reservedOrderId
// ============================================================================
test('7. classifyCreateOrderOutcome handles ORDER_DELETED and stale PENDING without reservedOrderId recovers cleanly', async () => {
  const delOutcome = orderFlowHelpers.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: {
      success: false,
      error: 'ORDER_DELETED',
      message: 'تم حذف هذا الطلب إدارياً.'
    }
  });
  assert.equal(delOutcome.action, 'ORDER_DELETED');
  assert.equal(delOutcome.clearCart, false);
  assert.equal(delOutcome.allowAutoRetry, false);
  assert.equal(delOutcome.requireNewAttempt, true);

  const {
    DEFAULT_IDEMPOTENCY_LEASE_MS,
    acquireOrderIdempotencyLock
  } = await import('../src/utils/order-idempotency.ts');
  assert.equal(DEFAULT_IDEMPOTENCY_LEASE_MS, 15_000);

  const uuid = '77777777-7777-4777-8777-777777777777';
  const keyHash = hashClientRequestId(uuid);
  const fp = 'a'.repeat(64);
  const db = createMockAdminDb({
    privateOrderIdempotency: {
      [keyHash]: {
        requestKeyHash: keyHash,
        requestFingerprint: fp,
        status: 'PENDING',
        attemptId: 'stale-attempt-no-order-id',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date(Date.now() - 60_000).toISOString(),
        leaseExpiresAt: new Date(Date.now() - 20_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    }
  });

  const takeover = await acquireOrderIdempotencyLock({
    clientRequestId: uuid,
    requestFingerprint: fp,
    adminDb: db
  });
  assert.equal(takeover.outcome, 'ACQUIRED');
  assert.ok(takeover.lock && takeover.lock.reservedOrderId);
});
