// test/group3a-customer-flow.test.mjs
// End-to-end automated verification for DANDY Group 3A:
// Cart idempotency & Turnstile handling, Invoice fragment/sessionStorage flow,
// Order Tracking whitelist & PII cleanup, and Authenticated Customer Invoice Access API + Account integration.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import fsSync from 'node:fs';
import vm from 'node:vm';

const helperSource = fsSync.readFileSync(path.resolve('public/assets/js/order-flow-helpers.js'), 'utf8');
const helperSandbox = {
  globalThis: null,
  crypto: globalThis.crypto,
  TextEncoder,
  URLSearchParams
};
helperSandbox.globalThis = helperSandbox;
vm.runInNewContext(helperSource, helperSandbox);
const helpers = helperSandbox.DandyOrderFlow;
import {
  isValidInvoiceTokenFormat,
  hashInvoiceToken
} from '../src/utils/invoice-token.ts';
import {
  POST as customerInvoiceAccessPOST,
  GET as customerInvoiceAccessGET,
  ALL as customerInvoiceAccessALL
} from '../src/pages/api/customer-invoice-access.js';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    snapshot() {
      return Object.fromEntries(map.entries());
    }
  };
}

function createMockAdminDb(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));

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
    if (!parts.length) return;
    let curr = data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (curr[parts[i]] == null || typeof curr[parts[i]] !== 'object') {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (val === null || val === undefined) {
      delete curr[leaf];
    } else {
      curr[leaf] = JSON.parse(JSON.stringify(val));
    }
  }

  function makeRef(p = '') {
    return {
      key: p.split('/').filter(Boolean).pop() || null,
      async once() {
        if (options.failReads) throw new Error('Simulated RTDB read failure');
        const val = getAtPath(p);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        if (options.failWrites) throw new Error('Simulated RTDB write failure');
        setAtPath(p, val);
      },
      async update(updates) {
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
        if (options.failTransactions) throw new Error('Simulated RTDB tx failure');
        const current = getAtPath(p);
        const cloned = current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
        const nextVal = updater(cloned);
        if (nextVal !== undefined) setAtPath(p, nextVal);
        const finalVal = getAtPath(p);
        return {
          committed: true,
          snapshot: { val: () => (finalVal === null || finalVal === undefined ? null : JSON.parse(JSON.stringify(finalVal))) }
        };
      }
    };
  }

  return { data, ref: makeRef };
}

// ===========================================================================
// 1. Cart Client Idempotency & Request Fingerprinting
// ===========================================================================
test('1.1 Checkout fingerprint is deterministic across equivalent order payloads and changes on any mutation', async () => {
  const baseOrder = {
    name: 'نور أحمد محمد',
    phone: '01012345678',
    email: 'Nour@Example.com',
    governorate: 'Cairo',
    city: 'المعادي',
    address: 'شارع 9 عمارة 12',
    customerId: null,
    items: [
      {
        productId: 'prod_1',
        name: 'كريم بديل الليزر',
        quantity: 2,
        selectedVariants: [{ id: 'rose', name: 'الورد' }]
      }
    ]
  };

  const equivalentOrder = {
    name: '  نور أحمد محمد  ',
    phone: '+20 101 234 5678',
    email: 'nour@example.com',
    governorate: 'Cairo',
    city: 'المعادي',
    address: 'شارع 9 عمارة 12',
    customerId: null,
    items: [
      {
        selectedVariants: [{ name: 'الورد', id: 'rose' }],
        quantity: 2,
        name: 'كريم بديل الليزر',
        productId: 'prod_1',
        timestamp: 999999 // transient field ignored
      }
    ]
  };

  const hash1 = await helpers.computeLocalOrderFingerprintHex(baseOrder);
  const hash2 = await helpers.computeLocalOrderFingerprintHex(equivalentOrder);
  assert.match(hash1, /^[0-9a-f]{64}$/);
  assert.equal(hash1, hash2);

  // Changing phone, quantity, variant, address, or customerId must rotate the hash
  const changedQtyHash = await helpers.computeLocalOrderFingerprintHex({
    ...baseOrder,
    items: [{ ...baseOrder.items[0], quantity: 3 }]
  });
  assert.notEqual(hash1, changedQtyHash);

  const changedPhoneHash = await helpers.computeLocalOrderFingerprintHex({
    ...baseOrder,
    phone: '01112345678'
  });
  assert.notEqual(hash1, changedPhoneHash);

  const changedUidHash = await helpers.computeLocalOrderFingerprintHex({
    ...baseOrder,
    customerId: 'uid_abc'
  });
  assert.notEqual(hash1, changedUidHash);
});

test('1.2 sessionStorage checkout attempt keeps clientRequestId across retries, stores zero PII, and rotates on payload change', async () => {
  const sessionStorage = createMemoryStorage();
  const payload = {
    name: 'مريم عادل',
    phone: '01234567890',
    email: 'maryam@example.com',
    governorate: 'Alexandria',
    city: 'سموحة',
    address: 'شارع فوزي معاذ 24',
    customerId: null,
    items: [{ productId: 'p1', quantity: 1 }]
  };

  const fp1 = await helpers.computeLocalOrderFingerprintHex(payload);
  const attempt1 = helpers.resolveCheckoutAttemptState(sessionStorage, fp1);
  assert.equal(helpers.isValidUuidV4(attempt1.clientRequestId), true);
  assert.equal(attempt1.reused, false);

  // Verify zero PII is stored in sessionStorage
  const rawStored = sessionStorage.getItem(helpers.CHECKOUT_ATTEMPT_STORAGE_KEY);
  const parsedStored = JSON.parse(rawStored);
  assert.deepEqual(Object.keys(parsedStored).sort(), ['clientRequestId', 'fingerprintHash']);
  assert.equal(rawStored.includes('01234567890'), false);
  assert.equal(rawStored.includes('مريم'), false);
  assert.equal(rawStored.includes('maryam'), false);
  assert.equal(rawStored.includes('سموحة'), false);

  // Retry with identical details must reuse exact same clientRequestId
  const attemptRetry = helpers.resolveCheckoutAttemptState(sessionStorage, fp1);
  assert.equal(attemptRetry.reused, true);
  assert.equal(attemptRetry.clientRequestId, attempt1.clientRequestId);

  // Changing shipping address generates a brand new UUID v4 clientRequestId
  const fp2 = await helpers.computeLocalOrderFingerprintHex({
    ...payload,
    address: 'شارع 15 الدور الثاني'
  });
  const attemptChanged = helpers.resolveCheckoutAttemptState(sessionStorage, fp2);
  assert.equal(attemptChanged.reused, false);
  assert.notEqual(attemptChanged.clientRequestId, attempt1.clientRequestId);
  assert.equal(helpers.isValidUuidV4(attemptChanged.clientRequestId), true);

  helpers.clearCheckoutAttemptState(sessionStorage);
  assert.equal(sessionStorage.getItem(helpers.CHECKOUT_ATTEMPT_STORAGE_KEY), null);
});

test('1.3 classifyCreateOrderOutcome enforces strict cart, token, 409 conflict/expired/in-progress, 503, 429, and CAPTCHA rules', () => {
  const validToken = crypto.randomBytes(32).toString('base64url');

  // 1. HTTP 200 with valid invoiceAccessToken -> redirect to #access= & clear cart/attempt
  const okOutcome = helpers.classifyCreateOrderOutcome({
    ok: true,
    status: 200,
    result: { success: true, orderId: '-Ord1', invoiceCode: 'DNY-100200', invoiceAccessToken: validToken }
  });
  assert.equal(okOutcome.action, 'SUCCESS_REDIRECT');
  assert.equal(okOutcome.clearCart, true);
  assert.equal(okOutcome.clearAttempt, true);
  assert.equal(okOutcome.redirectUrl, `/invoice#access=${encodeURIComponent(validToken)}`);
  assert.equal(okOutcome.redirectUrl.includes('?id='), false);
  assert.equal(okOutcome.redirectUrl.includes('?invoice='), false);

  // 2. HTTP 200 missing invoiceAccessToken -> NEVER clear cart, keep clientRequestId
  const missingTokenOutcome = helpers.classifyCreateOrderOutcome({
    ok: true,
    status: 200,
    result: { success: true, orderId: '-Ord1', invoiceCode: 'DNY-100200' }
  });
  assert.equal(missingTokenOutcome.action, 'MISSING_INVOICE_TOKEN');
  assert.equal(missingTokenOutcome.clearCart, false);
  assert.equal(missingTokenOutcome.clearAttempt, false);
  assert.equal(missingTokenOutcome.keepClientRequestId, true);
  assert.equal(missingTokenOutcome.allowAutoRetry, false);

  // 3. 409 ORDER_IN_PROGRESS -> keep clientRequestId & cart, reset Turnstile
  const inProgressOutcome = helpers.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { success: false, error: 'ORDER_IN_PROGRESS', message: 'جاري معالجة الطلب' }
  });
  assert.equal(inProgressOutcome.action, 'ORDER_IN_PROGRESS');
  assert.equal(inProgressOutcome.clearCart, false);
  assert.equal(inProgressOutcome.keepClientRequestId, true);
  assert.equal(inProgressOutcome.resetTurnstile, true);
  assert.equal(inProgressOutcome.allowAutoRetry, false);

  // 4. 409 IDEMPOTENCY_CONFLICT -> never auto-retry, prompt new attempt
  const conflictOutcome = helpers.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { success: false, error: 'IDEMPOTENCY_CONFLICT' }
  });
  assert.equal(conflictOutcome.action, 'IDEMPOTENCY_CONFLICT');
  assert.equal(conflictOutcome.clearCart, false);
  assert.equal(conflictOutcome.allowAutoRetry, false);
  assert.equal(conflictOutcome.requireNewAttempt, true);

  // 5. 409 IDEMPOTENCY_KEY_EXPIRED -> never auto-regenerate or auto-resubmit!
  const expiredOutcome = helpers.classifyCreateOrderOutcome({
    ok: false,
    status: 409,
    result: { success: false, error: 'IDEMPOTENCY_KEY_EXPIRED' }
  });
  assert.equal(expiredOutcome.action, 'IDEMPOTENCY_KEY_EXPIRED');
  assert.equal(expiredOutcome.clearCart, false);
  assert.equal(expiredOutcome.allowAutoRetry, false);
  assert.equal(expiredOutcome.requireManualVerification, true);

  // 6. 503, 429, CAPTCHA failure, Network error -> preserve cart & clientRequestId, reset Turnstile
  for (const scenario of [
    { ok: false, status: 503, result: { error: 'SERVICE_TEMPORARILY_UNAVAILABLE' }, expectAction: 'TRANSIENT_KEEP_ID' },
    { ok: false, status: 429, result: { error: 'RATE_LIMIT_EXCEEDED' }, expectAction: 'RATE_LIMITED_KEEP_ID' },
    { ok: false, status: 403, result: { error: 'CAPTCHA_FAILED' }, expectAction: 'CAPTCHA_FAILED_KEEP_ID' },
    { networkError: true, expectAction: 'TRANSIENT_KEEP_ID' }
  ]) {
    const out = helpers.classifyCreateOrderOutcome(scenario);
    assert.equal(out.action, scenario.expectAction);
    assert.equal(out.clearCart, false);
    assert.equal(out.clearAttempt, false);
    assert.equal(out.keepClientRequestId, true);
    assert.equal(out.resetTurnstile, true);
    assert.equal(out.allowAutoRetry, false);
  }
});

// ===========================================================================
// 2. Invoice Page Fragment & sessionStorage Reload Persistence
// ===========================================================================
test('2.1 resolveInvoiceAccessToken persists #access token to sessionStorage for reload resilience and clears on 404 only', () => {
  const sessionStorage = createMemoryStorage();
  const token = crypto.randomBytes(32).toString('base64url');

  // Initial load from #access=...
  const firstLoad = helpers.resolveInvoiceAccessToken(`#access=${encodeURIComponent(token)}`, sessionStorage);
  assert.equal(firstLoad.token, token);
  assert.equal(firstLoad.source, 'hash');
  assert.equal(firstLoad.shouldStripHash, true);
  assert.equal(sessionStorage.getItem(helpers.INVOICE_SESSION_STORAGE_KEY), token);

  // Reload after history.replaceState stripped #access=...
  const reload = helpers.resolveInvoiceAccessToken('', sessionStorage);
  assert.equal(reload.token, token);
  assert.equal(reload.source, 'session');
  assert.equal(reload.shouldStripHash, false);

  // 429 / 503 keep token in sessionStorage and allow retry
  const rateLimited = helpers.classifyPublicInvoiceResponse({ ok: false, status: 429, data: {} });
  assert.equal(rateLimited.clearSessionToken, false);
  assert.equal(rateLimited.showRetry, true);

  const unavailable = helpers.classifyPublicInvoiceResponse({ ok: false, status: 503, data: {} });
  assert.equal(unavailable.clearSessionToken, false);
  assert.equal(unavailable.showRetry, true);

  // 404 clears token from sessionStorage
  const notFound = helpers.classifyPublicInvoiceResponse({ ok: false, status: 404, data: {} });
  assert.equal(notFound.clearSessionToken, true);
  assert.equal(notFound.showRetry, false);
  helpers.clearInvoiceSessionToken(sessionStorage);
  assert.equal(sessionStorage.getItem(helpers.INVOICE_SESSION_STORAGE_KEY), null);
});

// ===========================================================================
// 3. Tracking Page PII Migration & Legacy URL Phone Stripping
// ===========================================================================
test('3.1 dandy_recent_lookups strips phone from legacy records and never stores phone in new searches', () => {
  const localStorage = createMemoryStorage({
    dandy_recent_lookups: JSON.stringify([
      { code: 'dny-111222', phone: '01012345678', time: 1700000000000 },
      { code: 'DNY-333444', phone: '01298765432', extraSecret: 'leak', time: 1700000001000 }
    ])
  });

  const migrated = helpers.loadAndMigrateRecentLookups(localStorage, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), [
    { code: 'DNY-111222', time: 1700000000000 },
    { code: 'DNY-333444', time: 1700000001000 }
  ]);

  const rawAfterMigration = localStorage.getItem('dandy_recent_lookups');
  assert.equal(rawAfterMigration.includes('01012345678'), false);
  assert.equal(rawAfterMigration.includes('01298765432'), false);
  assert.equal(rawAfterMigration.includes('phone'), false);

  const updated = helpers.saveRecentLookupCode(localStorage, 'DNY-555666', 4);
  assert.equal(updated[0].code, 'DNY-555666');
  assert.equal('phone' in updated[0], false);
  assert.equal(localStorage.getItem('dandy_recent_lookups').includes('phone'), false);
});

test('3.2 extractTrackOrderUrlParams strips phone from query string and preserves code only', () => {
  const legacyParams = helpers.extractTrackOrderUrlParams('?code=dny-998877&phone=01012345678');
  assert.equal(legacyParams.code, 'DNY-998877');
  assert.equal(legacyParams.phone, '01012345678');
  assert.equal(legacyParams.shouldStripPhone, true);
  assert.equal(legacyParams.cleanedRelativeSearch, '?code=DNY-998877');
  assert.equal(legacyParams.cleanedRelativeSearch.includes('phone'), false);

  const codeOnlyParams = helpers.extractTrackOrderUrlParams('?code=DNY-123456');
  assert.equal(codeOnlyParams.code, 'DNY-123456');
  assert.equal(codeOnlyParams.phone, '');
  assert.equal(codeOnlyParams.shouldStripPhone, false);

  // Uniform 404 anti-enumeration message + 429 + 503 error texts
  const msg404 = helpers.classifyTrackOrderError({ status: 404, data: {} });
  const msg429 = helpers.classifyTrackOrderError({ status: 429, data: {} });
  const msg503 = helpers.classifyTrackOrderError({ status: 503, data: {} });
  assert.equal(msg404.includes('كود الفاتورة صحيح'), false);
  assert.match(msg429, /الحد المسموح|الانتظار/);
  assert.match(msg503, /غير متاحة مؤقت/);
});

// ===========================================================================
// 4. POST /api/customer-invoice-access Security & Ownership Tests
// ===========================================================================
test('4.1 customer-invoice-access enforces HTTP methods, Content-Type, Bearer auth, anti-enumeration 404, and issues encrypted token for owner', async () => {
  const encKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createMockAdminDb({
    orders: {
      '-OrdOwner1': {
        invoiceCode: 'DNY-700100',
        name: 'سارة علي',
        phone: '01011112222',
        customerId: 'uid_owner_1',
        products: [{ name: 'سيروم', quantity: 1, price: 300, lineTotal: 300 }]
      },
      '-OrdOtherUser': {
        invoiceCode: 'DNY-700200',
        name: 'مها حسن',
        phone: '01122223333',
        customerId: 'uid_someone_else',
        products: [{ name: 'كريم', quantity: 1, price: 250, lineTotal: 250 }]
      }
    }
  });

  const mockAuth = {
    async verifyIdToken(token) {
      if (token === 'valid_user_id_token_12345') {
        return { uid: 'uid_owner_1' };
      }
      throw new Error('Firebase ID token expired or invalid');
    }
  };

  // 1. Method checks
  const getRes = await customerInvoiceAccessGET();
  assert.equal(getRes.status, 405);
  assert.equal(getRes.headers.get('allow'), 'POST');
  assert.equal((await customerInvoiceAccessALL()).status, 405);

  // 2. Content-Type check
  const badCtRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}'
    }),
    clientAddress: '41.41.41.1'
  });
  assert.equal(badCtRes.status, 415);

  // 3. Missing / invalid Bearer token -> 401
  const noAuthRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    clientAddress: '41.41.41.2',
    _deps: { adminDb: mockDb, adminAuth: mockAuth, redis: null, encryptionKey: encKey }
  });
  assert.equal(noAuthRes.status, 401);

  const badAuthRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer tampered_token_999'
      },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    clientAddress: '41.41.41.3',
    _deps: { adminDb: mockDb, adminAuth: mockAuth, redis: null, encryptionKey: encKey }
  });
  assert.equal(badAuthRes.status, 401);

  // 4. Accessing another customer's order vs non-existent order -> identical 404 anti-enumeration
  const otherOrderRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-OrdOtherUser' })
    }),
    clientAddress: '41.41.41.4',
    _deps: { adminDb: mockDb, adminAuth: mockAuth, redis: null, encryptionKey: encKey }
  });
  const missingOrderRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-NonExistentOrder999' })
    }),
    clientAddress: '41.41.41.5',
    _deps: { adminDb: mockDb, adminAuth: mockAuth, redis: null, encryptionKey: encKey }
  });

  assert.equal(otherOrderRes.status, 404);
  assert.equal(missingOrderRes.status, 404);
  assert.deepEqual(await otherOrderRes.json(), await missingOrderRes.json());

  // 5. Authenticated owner succeeds, returns valid token ONLY, persists encrypted token (no plaintext)
  const okRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    clientAddress: '41.41.41.6',
    _deps: { adminDb: mockDb, adminAuth: mockAuth, redis: null, encryptionKey: encKey }
  });
  assert.equal(okRes.status, 200);
  assert.match(okRes.headers.get('cache-control') || '', /no-store/);
  assert.equal(okRes.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(okRes.headers.get('x-content-type-options'), 'nosniff');

  const okBody = await okRes.json();
  assert.equal(okBody.success, true);
  assert.equal(isValidInvoiceTokenFormat(okBody.invoiceAccessToken), true);
  assert.equal(okBody.order, undefined);
  assert.equal(mockDb.data.privateOrderAccess['-OrdOwner1'].token, undefined);
  assert.equal(mockDb.data.privateOrderAccess['-OrdOwner1'].encryptedToken?.alg, 'aes-256-gcm');
  assert.ok(mockDb.data.privateInvoiceAccess[hashInvoiceToken(okBody.invoiceAccessToken)]);

  // Calling again returns the same active decrypted token
  const secondRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    clientAddress: '41.41.41.6',
    _deps: { adminDb: mockDb, adminAuth: mockAuth, redis: null, encryptionKey: encKey }
  });
  assert.equal(secondRes.status, 200);
  assert.equal((await secondRes.json()).invoiceAccessToken, okBody.invoiceAccessToken);
});

test('4.2 customer-invoice-access fails closed with 503 on store outage/missing IP and 429 on limit exceeded', async () => {
  const failingTxDb = createMockAdminDb({}, { failTransactions: true });
  const failingRedis = {
    limit: async () => {
      throw new Error('Redis timeout');
    }
  };

  // Outage -> 503
  const outageRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    clientAddress: '41.41.41.50',
    _deps: {
      adminDb: failingTxDb,
      redis: failingRedis,
      adminAuth: { verifyIdToken: async () => ({ uid: 'u1' }) }
    }
  });
  assert.equal(outageRes.status, 503);
  assert.equal((await outageRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');

  // Missing client IP -> 503
  const missingIpRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    _deps: { adminDb: createMockAdminDb({}), redis: null }
  });
  assert.equal(missingIpRes.status, 503);

  // Rate limit exceeded -> 429 with Retry-After
  const limitedRes = await customerInvoiceAccessPOST({
    request: new Request('http://localhost:3000/api/customer-invoice-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_user_id_token_12345'
      },
      body: JSON.stringify({ orderId: '-OrdOwner1' })
    }),
    clientAddress: '41.41.41.51',
    _deps: {
      adminDb: createMockAdminDb({}),
      redis: { limit: async () => ({ success: false, remaining: 0, limit: 60, reset: Date.now() + 30_000 }) }
    }
  });
  assert.equal(limitedRes.status, 429);
  assert.ok(Number(limitedRes.headers.get('retry-after')) > 0);
});

// ===========================================================================
// 5. Frontend Static Compliance Audit Across Astro Pages
// ===========================================================================
test('5.1 cart.astro, invoice.astro, track-order.astro, and account.astro strictly adhere to Group 3A security contracts', async () => {
  const [cartHtml, invoiceHtml, trackHtml, accountHtml] = await Promise.all([
    fs.readFile(path.resolve('src/pages/cart.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/invoice.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/track-order.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/account.astro'), 'utf8')
  ]);

  // 1. cart.astro compliance
  assert.ok(cartHtml.includes('/assets/js/order-flow-helpers.js'));
  assert.ok(cartHtml.includes('clientRequestId'));
  assert.equal(cartHtml.includes('/invoice?id='), false, 'cart.astro must never redirect to ?id=');
  assert.equal(cartHtml.includes('/invoice?invoice='), false, 'cart.astro must never redirect to ?invoice=');
  assert.equal(cartHtml.includes('phone: phone'), false, 'cart.astro must never store phone in dandy_recent_lookups');
  assert.equal(cartHtml.includes("db.ref('orders')"), false, 'cart.astro must not read orders directly');

  // 2. invoice.astro compliance
  assert.ok(invoiceHtml.includes('/assets/js/order-flow-helpers.js'));
  assert.equal(invoiceHtml.includes('firebase.database()'), false, 'invoice.astro must not initialize direct RTDB reads');
  assert.equal(invoiceHtml.includes("db.ref('orders"), false, 'invoice.astro must not read orders directly');
  assert.ok(invoiceHtml.includes("cache: 'no-store'"));
  assert.ok(invoiceHtml.includes("fetch('/api/public-invoice'"));
  assert.ok(invoiceHtml.includes('history.replaceState'));
  assert.ok(invoiceHtml.includes('/track-order?code='));

  // 3. track-order.astro compliance
  assert.ok(trackHtml.includes('/assets/js/order-flow-helpers.js'));
  assert.equal(trackHtml.includes('firebase.database()'), false, 'track-order.astro must not initialize RTDB');
  assert.equal(trackHtml.includes("db.ref('orders')"), false, 'track-order.astro must not read orders directly');
  assert.ok(trackHtml.includes("fetch('/api/track-order'"));
  assert.ok(trackHtml.includes("cache: 'no-store'"));
  assert.equal(trackHtml.includes('resCustPhone'), false, 'track-order must not render customer phone element');
  assert.equal(trackHtml.includes('resCustAddress'), false, 'track-order must not render street address element');
  assert.equal(trackHtml.includes('resTotal'), false, 'track-order must not render totalAmount element');

  // 4. account.astro compliance
  assert.ok(accountHtml.includes('/assets/js/order-flow-helpers.js'));
  assert.ok(accountHtml.includes("db.ref('orders').orderByChild('customerId').equalTo(currentUser.uid)"));
  assert.ok(accountHtml.includes("fetch('/api/customer-invoice-access'"));
  assert.ok(accountHtml.includes("'/invoice#access=' + encodeURIComponent(data.invoiceAccessToken)"));
  assert.ok(accountHtml.includes('/track-order?code=${encodeURIComponent(invoiceCode)}'));
  assert.equal(accountHtml.includes('/invoice?invoice='), false, 'account.astro must not link to legacy ?invoice=');
});

// ===========================================================================
// 6. Group 3A.1 Persistence Hardening: Fail-Closed Checkout Idempotency & Invoice Token Storage
// ===========================================================================
test('6.1 resolveCheckoutAttemptState & prepareCheckoutIdempotency fail closed when sessionStorage.setItem or getItem throws or read-back mismatches', async () => {
  const sampleOrder = {
    name: 'هدى محمود',
    phone: '01055556666',
    email: 'hoda@example.com',
    governorate: 'Cairo',
    city: 'مصر الجديدة',
    address: '10 شارع الميرغني',
    customerId: null,
    items: [{ productId: 'p1', quantity: 2 }]
  };

  // A. sessionStorage.setItem throws QuotaExceededError
  const setThrowStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('QuotaExceededError: Storage blocked');
    }
  };
  const setFailRes = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage: setThrowStorage
  });
  assert.equal(setFailRes.ok, false);
  assert.equal(setFailRes.persisted, false);
  assert.equal(setFailRes.clientRequestId, null);
  assert.equal(setFailRes.reason, 'STORAGE_WRITE_FAILED');
  assert.match(setFailRes.message, /سلتكِ/);

  // B. sessionStorage.getItem throws SecurityError on initial read
  const getThrowStorage = {
    getItem() {
      throw new Error('SecurityError: Access denied');
    },
    setItem() {}
  };
  const getFailRes = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage: getThrowStorage
  });
  assert.equal(getFailRes.ok, false);
  assert.equal(getFailRes.persisted, false);
  assert.equal(getFailRes.clientRequestId, null);
  assert.equal(getFailRes.reason, 'STORAGE_READ_FAILED');

  // C. Read-back verification fails (setItem silently drops write / returns mismatched value)
  let readCalls = 0;
  const silentDropStorage = {
    getItem() {
      readCalls++;
      return null; // initial read null, read-back also null
    },
    setItem() {
      // no-op silent drop
    }
  };
  const verifyFailRes = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage: silentDropStorage
  });
  assert.equal(readCalls, 2);
  assert.equal(verifyFailRes.ok, false);
  assert.equal(verifyFailRes.persisted, false);
  assert.equal(verifyFailRes.clientRequestId, null);
  assert.equal(verifyFailRes.reason, 'STORAGE_VERIFY_FAILED');

  // D. Read-back getItem throws right after setItem succeeds
  let callCount = 0;
  const readBackThrowStorage = {
    getItem() {
      callCount++;
      if (callCount === 1) return null;
      throw new Error('Read-back verification error');
    },
    setItem() {}
  };
  const readBackFailRes = helpers.resolveCheckoutAttemptState(readBackThrowStorage, 'a'.repeat(64));
  assert.equal(readBackFailRes.ok, false);
  assert.equal(readBackFailRes.persisted, false);
  assert.equal(readBackFailRes.clientRequestId, null);
  assert.equal(readBackFailRes.reason, 'STORAGE_READ_FAILED');

  // E. Storage recovery: once storage works again, subsequent attempt succeeds and persists UUID cleanly
  const recoveredStorage = createMemoryStorage();
  const recovered1 = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage: recoveredStorage
  });
  assert.equal(recovered1.ok, true);
  assert.equal(recovered1.persisted, true);
  assert.equal(helpers.isValidUuidV4(recovered1.clientRequestId), true);
  assert.equal(recovered1.reused, false);

  const recoveredRetry = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage: recoveredStorage
  });
  assert.equal(recoveredRetry.ok, true);
  assert.equal(recoveredRetry.reused, true);
  assert.equal(recoveredRetry.clientRequestId, recovered1.clientRequestId);
});

test('6.2 prepareCheckoutIdempotency fails closed without generating rotating UUID when Web Crypto is unavailable', async () => {
  const sessionStorage = createMemoryStorage();
  const sampleOrder = {
    name: 'منى طارق',
    phone: '01122334455',
    email: 'mona@example.com',
    governorate: 'Giza',
    city: 'الشيخ زايد',
    address: 'كمبوند الياسمين فيلا 5',
    customerId: null,
    items: [{ productId: 'p2', quantity: 1 }]
  };

  // Pass crypto stub lacking subtle.digest
  const noWebCrypto = {
    randomUUID: () => crypto.randomUUID()
  };

  const attempt1 = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage,
    cryptoObj: noWebCrypto
  });
  const attempt2 = await helpers.prepareCheckoutIdempotency({
    orderInput: sampleOrder,
    sessionStorage,
    cryptoObj: noWebCrypto
  });

  assert.equal(attempt1.ok, false);
  assert.equal(attempt1.clientRequestId, null);
  assert.equal(attempt1.reason, 'FINGERPRINT_UNAVAILABLE');
  assert.match(attempt1.message, /Web Crypto|سلتكِ/);
  assert.equal(attempt2.ok, false);
  assert.equal(attempt2.clientRequestId, null);
  assert.equal(sessionStorage.getItem(helpers.CHECKOUT_ATTEMPT_STORAGE_KEY), null);
});

test('6.3 resolveInvoiceAccessToken defers hash stripping when sessionStorage fails, and preserves reload resilience when storage works', () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = `#access=${encodeURIComponent(token)}`;

  // 1. Storage setItem throws -> keep token in memory, do NOT strip #access immediately!
  const setFailStorage = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  const failWriteRes = helpers.resolveInvoiceAccessToken(hash, setFailStorage);
  assert.equal(failWriteRes.token, token);
  assert.equal(failWriteRes.source, 'hash');
  assert.equal(failWriteRes.persisted, false);
  assert.equal(failWriteRes.shouldStripHash, false);
  assert.equal(failWriteRes.stripHashAfterRender, true);

  // 2. Storage read-back fails (silent drop / getItem throws after setItem) -> do NOT strip #access immediately!
  const silentDropStorage = {
    getItem() { return null; },
    setItem() {}
  };
  const verifyFailRes = helpers.resolveInvoiceAccessToken(hash, silentDropStorage);
  assert.equal(verifyFailRes.token, token);
  assert.equal(verifyFailRes.persisted, false);
  assert.equal(verifyFailRes.shouldStripHash, false);
  assert.equal(verifyFailRes.stripHashAfterRender, true);

  // 3. Working storage -> persisted & verified -> shouldStripHash: true, reloads from session
  const workingStorage = createMemoryStorage();
  const okWriteRes = helpers.resolveInvoiceAccessToken(hash, workingStorage);
  assert.equal(okWriteRes.token, token);
  assert.equal(okWriteRes.persisted, true);
  assert.equal(okWriteRes.shouldStripHash, true);
  assert.equal(okWriteRes.stripHashAfterRender, false);

  const reloadRes = helpers.resolveInvoiceAccessToken('', workingStorage);
  assert.equal(reloadRes.token, token);
  assert.equal(reloadRes.source, 'session');
  assert.equal(reloadRes.persisted, true);
  assert.equal(reloadRes.shouldStripHash, false);
});

test('6.4 cart.astro & invoice.astro static hardening checks for Group 3A.1', async () => {
  const [cartHtml, invoiceHtml] = await Promise.all([
    fs.readFile(path.resolve('src/pages/cart.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/invoice.astro'), 'utf8')
  ]);

  // cart.astro must use fail-closed prepareCheckoutIdempotency and never omit clientRequestId or generate fallback UUIDs
  assert.ok(cartHtml.includes('prepareCheckoutIdempotency'));
  assert.equal(cartHtml.includes('...(clientRequestId ? { clientRequestId } : {})'), false);
  assert.equal(cartHtml.includes('crypto.randomUUID()'), false);

  // invoice.astro must support deferred hash strip only on successful render, never move token to localStorage/query or log it
  assert.ok(invoiceHtml.includes('stripHashAfterRender'));
  assert.ok(invoiceHtml.includes('activeInvoiceTokenInMemory'));
  assert.equal(invoiceHtml.includes('localStorage'), false);
  assert.equal(invoiceHtml.includes('console.log'), false);
});

// ===========================================================================
// 7. Group 3A.2 Hardening: Safe sessionStorage Getter & Terminal 404 Hash Cleanup
// ===========================================================================
test('7.1 getSafeSessionStorage returns null on SecurityError getter and resolveInvoiceAccessToken/clearInvoiceSessionToken operate cleanly with null storage', () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const blockedWin = {};
  Object.defineProperty(blockedWin, 'sessionStorage', {
    get() {
      const err = new Error('The operation is insecure.');
      err.name = 'SecurityError';
      throw err;
    }
  });

  // 1. Getter throws SecurityError -> returns null without crashing
  const resolvedStorage = helpers.getSafeSessionStorage(blockedWin);
  assert.equal(resolvedStorage, null);

  // 2. Loading invoice from #access when storage is null keeps token in memory and defers hash strip
  const tokenResolution = helpers.resolveInvoiceAccessToken(
    `#access=${encodeURIComponent(token)}`,
    resolvedStorage
  );
  assert.equal(tokenResolution.token, token);
  assert.equal(tokenResolution.source, 'hash');
  assert.equal(tokenResolution.persisted, false);
  assert.equal(tokenResolution.shouldStripHash, false);
  assert.equal(tokenResolution.stripHashAfterRender, true);

  // 3. Clearing token when storage is null never throws
  assert.equal(helpers.clearInvoiceSessionToken(resolvedStorage), false);
});

test('7.2 classifyPublicInvoiceResponse strips hash only on terminal 404 and preserves hash + retry on 429, 503, and network errors', () => {
  const res404 = helpers.classifyPublicInvoiceResponse({ ok: false, status: 404, data: {} });
  assert.equal(res404.action, 'INVALID_OR_NOT_FOUND');
  assert.equal(res404.clearSessionToken, true);
  assert.equal(res404.stripHash, true);
  assert.equal(res404.showRetry, false);

  const res503 = helpers.classifyPublicInvoiceResponse({ ok: false, status: 503, data: {} });
  assert.equal(res503.action, 'SERVICE_UNAVAILABLE');
  assert.equal(res503.clearSessionToken, false);
  assert.equal(res503.stripHash, false);
  assert.equal(res503.showRetry, true);

  const res429 = helpers.classifyPublicInvoiceResponse({ ok: false, status: 429, data: {} });
  assert.equal(res429.action, 'RATE_LIMITED');
  assert.equal(res429.clearSessionToken, false);
  assert.equal(res429.stripHash, false);
  assert.equal(res429.showRetry, true);

  const resNetErr = helpers.classifyPublicInvoiceResponse({ networkError: true });
  assert.equal(resNetErr.action, 'TRANSIENT_ERROR');
  assert.equal(resNetErr.clearSessionToken, false);
  assert.equal(resNetErr.stripHash, false);
  assert.equal(resNetErr.showRetry, true);

  const res200 = helpers.classifyPublicInvoiceResponse({
    ok: true,
    status: 200,
    data: { success: true, order: { invoiceCode: 'DNY-100200' } }
  });
  assert.equal(res200.action, 'RENDER_INVOICE');
  assert.equal(res200.clearSessionToken, false);
  assert.equal(res200.stripHash, false);
  assert.equal(res200.showRetry, false);
});

test('7.3 invoice.astro script handles SecurityError sessionStorage, terminal 404 hash cleanup, 503/429 in-memory retry, and zero token leaks end-to-end', async () => {
  const invoiceHtml = await fs.readFile(path.resolve('src/pages/invoice.astro'), 'utf8');

  // Ensure no unguarded window.sessionStorage or bare sessionStorage.getItem/setItem remains in invoice.astro
  assert.equal(invoiceHtml.includes('flow.clearInvoiceSessionToken(window.sessionStorage)'), false);
  assert.equal(invoiceHtml.includes('flow.resolveInvoiceAccessToken(window.location.hash, window.sessionStorage)'), false);
  assert.equal(/\bsessionStorage\.(getItem|setItem|removeItem)/.test(invoiceHtml), false);

  // Ensure safe wrapper, rejected token guard, terminal hash strip on 404, and zero query/console leaks
  assert.ok(invoiceHtml.includes('function getSafeSessionStorage()'));
  assert.ok(invoiceHtml.includes('rejectedInvoiceTokens'));
  assert.ok(invoiceHtml.includes('outcome.stripHash || outcome.clearSessionToken'));
  assert.equal(invoiceHtml.includes('console.log'), false);
  assert.equal(invoiceHtml.includes('?access='), false);
  assert.equal(invoiceHtml.includes('?token='), false);

  // Simulate browser execution of invoice page token lifecycle when window.sessionStorage throws SecurityError
  const token = crypto.randomBytes(32).toString('base64url');
  const blockedWin = {
    location: {
      pathname: '/invoice',
      search: '',
      hash: `#access=${encodeURIComponent(token)}`
    }
  };
  Object.defineProperty(blockedWin, 'sessionStorage', {
    get() {
      const err = new Error('Access is denied');
      err.name = 'SecurityError';
      throw err;
    }
  });
  let replaceStateCount = 0;
  function stripHashSim() {
    if (!blockedWin.location.hash) return;
    replaceStateCount++;
    blockedWin.location.hash = '';
  }

  // Step A: Bootstrap with SecurityError storage -> hash kept, token in memory
  const safeStorage = helpers.getSafeSessionStorage(blockedWin);
  assert.equal(safeStorage, null);
  const tokenRes = helpers.resolveInvoiceAccessToken(blockedWin.location.hash, safeStorage);
  if (tokenRes.shouldStripHash) stripHashSim();
  assert.equal(blockedWin.location.hash, `#access=${encodeURIComponent(token)}`);
  assert.equal(tokenRes.stripHashAfterRender, true);

  // Step B: 503 then 429 -> hash retained, retry keeps token in memory
  for (const status of [503, 429]) {
    const out = helpers.classifyPublicInvoiceResponse({ ok: false, status, data: {} });
    assert.equal(out.showRetry, true);
    if (out.clearSessionToken) helpers.clearInvoiceSessionToken(helpers.getSafeSessionStorage(blockedWin));
    if (out.stripHash || out.clearSessionToken) stripHashSim();
    assert.equal(blockedWin.location.hash, `#access=${encodeURIComponent(token)}`);
    assert.equal(replaceStateCount, 0);
  }

  // Step C: Terminal 404 when storage is unavailable -> clears memory, safe-clears storage, strips hash!
  const out404 = helpers.classifyPublicInvoiceResponse({ ok: false, status: 404, data: {} });
  if (out404.clearSessionToken) helpers.clearInvoiceSessionToken(helpers.getSafeSessionStorage(blockedWin));
  if (out404.stripHash || out404.clearSessionToken) stripHashSim();
  assert.equal(blockedWin.location.hash, '');
  assert.equal(replaceStateCount, 1);
});

// ===========================================================================
// 8. Group 3A.2.1 Stale Invoice Token Cleanup & Verified Storage Deletion
// ===========================================================================
test('8.1 safeStorageRemove never assumes success without read-back verification', () => {
  // 1. Working storage removes key and verifies null
  const working = createMemoryStorage({ k1: 'val1' });
  assert.equal(helpers.safeStorageRemove(working, 'k1'), true);
  assert.equal(working.getItem('k1'), null);

  // 2. Silent no-op removeItem leaving key behind -> MUST return false
  const stickyMap = new Map([['k1', 'stale_val']]);
  const silentNoopRemoveStorage = {
    getItem: (k) => (stickyMap.has(k) ? stickyMap.get(k) : null),
    setItem: (k, v) => stickyMap.set(k, String(v)),
    removeItem: () => {
      // silently does nothing
    }
  };
  assert.equal(helpers.safeStorageRemove(silentNoopRemoveStorage, 'k1'), false);
  assert.equal(stickyMap.get('k1'), 'stale_val');

  // 3. removeItem succeeds/noop then getItem throws during verification -> MUST return false
  const verifyThrowRemoveStorage = {
    removeItem: () => {},
    getItem: () => {
      throw new Error('Read-back failed');
    }
  };
  assert.equal(helpers.safeStorageRemove(verifyThrowRemoveStorage, 'k1'), false);

  // 4. Missing getItem or removeItem -> MUST return false
  assert.equal(helpers.safeStorageRemove({ removeItem: () => {} }, 'k1'), false);
  assert.equal(helpers.safeStorageRemove({ getItem: () => null }, 'k1'), false);
});

test('8.2 stale old invoice token in sessionStorage is cleaned when saving new token fails verification, preventing stale reload after new invoice render', () => {
  const oldToken = crypto.randomBytes(32).toString('base64url');
  const newToken = crypto.randomBytes(32).toString('base64url');
  assert.notEqual(oldToken, newToken);

  // Case A: sessionStorage holds oldToken; setItem silently fails to overwrite (readBack returns oldToken),
  // but removeItem works and verifies deletion.
  const storeA = new Map([[helpers.INVOICE_SESSION_STORAGE_KEY, oldToken]]);
  const staleOverwriteFailStorage = {
    getItem: (k) => (storeA.has(k) ? storeA.get(k) : null),
    setItem: () => {
      // Does not throw, but fails to overwrite existing oldToken
    },
    removeItem: (k) => {
      storeA.delete(k);
    }
  };

  // Bootstrap new invoice URL #access=newToken
  const resA = helpers.resolveInvoiceAccessToken(`#access=${encodeURIComponent(newToken)}`, staleOverwriteFailStorage);
  assert.equal(resA.token, newToken);
  assert.equal(resA.source, 'hash');
  assert.equal(resA.persisted, false);
  assert.equal(resA.staleCleaned, true);
  assert.equal(resA.shouldStripHash, false);
  assert.equal(resA.stripHashAfterRender, true);

  // Stale oldToken MUST have been removed from storage
  assert.equal(storeA.has(helpers.INVOICE_SESSION_STORAGE_KEY), false);

  // Simulate successful render of new invoice (200) -> hash is stripped via stripHashAfterRender,
  // then user reloads /invoice without hash -> oldToken MUST NOT be loaded!
  const renderOutcome = helpers.classifyPublicInvoiceResponse({
    ok: true,
    status: 200,
    data: { success: true, order: { invoiceCode: 'DNY-NEW999' } }
  });
  assert.equal(renderOutcome.action, 'RENDER_INVOICE');
  const reloadA = helpers.resolveInvoiceAccessToken('', staleOverwriteFailStorage);
  assert.equal(reloadA.token, null);
  assert.equal(reloadA.source, 'none');

  // Case B: Both setItem and removeItem fail to clear oldToken (storage completely untrusted):
  // Hash MUST still be retained until render (shouldStripHash: false, stripHashAfterRender: true),
  // AND untrusted storage must NOT serve oldToken on reload!
  const storeB = new Map([[helpers.INVOICE_SESSION_STORAGE_KEY, oldToken]]);
  const untrustedStickyStorage = {
    getItem: (k) => (storeB.has(k) ? storeB.get(k) : null),
    setItem: () => {
      // fails silently on all writes
    },
    removeItem: () => {
      // fails silently on all removals
    }
  };

  const resB = helpers.resolveInvoiceAccessToken(`#access=${encodeURIComponent(newToken)}`, untrustedStickyStorage);
  assert.equal(resB.token, newToken);
  assert.equal(resB.persisted, false);
  assert.equal(resB.staleCleaned, false);
  assert.equal(resB.storageTrusted, false);
  assert.equal(resB.shouldStripHash, false);
  assert.equal(resB.stripHashAfterRender, true);

  // Even though oldToken remained inside untrustedStickyStorage, reload MUST NOT trust or return it
  const reloadB = helpers.resolveInvoiceAccessToken('', untrustedStickyStorage);
  assert.equal(reloadB.token, null);
  assert.equal(reloadB.source, 'none');
  assert.equal(reloadB.storageTrusted, false);

  // Verify 404 / 429 / 503 classification behavior remains unchanged
  assert.equal(helpers.classifyPublicInvoiceResponse({ ok: false, status: 404, data: {} }).stripHash, true);
  assert.equal(helpers.classifyPublicInvoiceResponse({ ok: false, status: 429, data: {} }).stripHash, false);
  assert.equal(helpers.classifyPublicInvoiceResponse({ ok: false, status: 503, data: {} }).stripHash, false);
});

