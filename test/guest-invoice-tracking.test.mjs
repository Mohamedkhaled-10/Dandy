// test/guest-invoice-tracking.test.mjs
// Automated test suite for Batch 1: Secure Guest Invoice Token Issuance, Public Invoice API, and Guest Order Tracking API

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  generateSecureInvoiceToken,
  hashInvoiceToken,
  isValidInvoiceTokenFormat,
  getOrCreateInvoiceToken,
  lookupPublicInvoiceByToken
} from '../src/utils/invoice-token.ts';
import {
  normalizeEgyptianPhone,
  phonesMatch,
  extractFirstName
} from '../src/utils/phone.ts';
import {
  checkServerRateLimit,
  getSafeClientIp,
  normalizeAndValidateIp,
  extractAstroClientAddress
} from '../src/utils/server-rate-limit.ts';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import { POST as publicInvoicePOST, GET as publicInvoiceGET, ALL as publicInvoiceALL } from '../src/pages/api/public-invoice.js';
import { POST as trackOrderPOST, GET as trackOrderGET, ALL as trackOrderALL } from '../src/pages/api/track-order.js';

/**
 * In-memory Firebase Admin RTDB mock supporting nested get/set/update/push/transaction and orderByChild().equalTo().
 */
function createMockAdminDb(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  let pushCounter = 0;

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
  }

  function makeRef(path = '') {
    return {
      key: path.split('/').filter(Boolean).pop() || null,
      async once() {
        if (options.failReads) {
          throw new Error('Simulated RTDB read failure');
        }
        const val = getAtPath(path);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        if (options.failWrites) {
          throw new Error('Simulated RTDB write failure');
        }
        setAtPath(path, val);
      },
      async update(updates) {
        if (options.failWrites || (options.failPrivateTokenWrites && Object.keys(updates).some((k) => k.startsWith('private')))) {
          throw new Error('Simulated RTDB multi-path update failure');
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
        const newKey = `-MockOrder_${pushCounter}`;
        const childPath = path ? `${path}/${newKey}` : newKey;
        return makeRef(childPath);
      },
      async transaction(updater) {
        if (options.failTransactions) {
          throw new Error('Simulated RTDB transaction failure');
        }
        const current = getAtPath(path);
        const clonedCurrent = current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
        const nextVal = updater(clonedCurrent);
        if (nextVal !== undefined) {
          setAtPath(path, nextVal);
        }
        const finalVal = getAtPath(path);
        return {
          committed: true,
          snapshot: {
            val: () => (finalVal === null || finalVal === undefined ? null : JSON.parse(JSON.stringify(finalVal)))
          }
        };
      },
      orderByChild(childField) {
        return {
          equalTo(targetValue) {
            return {
              async once() {
                if (options.failReads) {
                  throw new Error('Simulated RTDB query failure');
                }
                const parent = getAtPath(path);
                if (!parent || typeof parent !== 'object') {
                  return { exists: () => false, val: () => null };
                }
                const matches = {};
                for (const [key, item] of Object.entries(parent)) {
                  if (item && typeof item === 'object' && item[childField] === targetValue) {
                    matches[key] = JSON.parse(JSON.stringify(item));
                  }
                }
                const hasMatches = Object.keys(matches).length > 0;
                return {
                  exists: () => hasMatches,
                  val: () => (hasMatches ? matches : null)
                };
              }
            };
          }
        };
      }
    };
  }

  return {
    data,
    ref: makeRef
  };
}

// ===========================================================================
// A. Phone Normalization & First-Name Helper Tests
// ===========================================================================
test('A1. normalizeEgyptianPhone handles standard, +20, 20, 0020, spaced, dashed, and Arabic-Indic formats', () => {
  assert.equal(normalizeEgyptianPhone('01012345678'), '01012345678');
  assert.equal(normalizeEgyptianPhone('+201012345678'), '01012345678');
  assert.equal(normalizeEgyptianPhone('201012345678'), '01012345678');
  assert.equal(normalizeEgyptianPhone('00201012345678'), '01012345678');
  assert.equal(normalizeEgyptianPhone('010 1234 5678'), '01012345678');
  assert.equal(normalizeEgyptianPhone('010-1234-5678'), '01012345678');
  assert.equal(normalizeEgyptianPhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.equal(normalizeEgyptianPhone('+20 112 345 6789'), '01123456789');
  assert.equal(normalizeEgyptianPhone('1551234567'), '01551234567');
});

test('A2. normalizeEgyptianPhone rejects incomplete, short, non-numeric, or malformed phone strings', () => {
  assert.equal(normalizeEgyptianPhone(''), null);
  assert.equal(normalizeEgyptianPhone(null), null);
  assert.equal(normalizeEgyptianPhone(1012345678), null);
  assert.equal(normalizeEgyptianPhone('0101234'), null);
  assert.equal(normalizeEgyptianPhone('0101234567'), null, '10-digit truncated 010 number must fail');
  assert.equal(normalizeEgyptianPhone('01312345678'), null, 'Invalid Egyptian carrier prefix 013 must fail');
  assert.equal(normalizeEgyptianPhone('01012345678abc'), null);
  assert.equal(normalizeEgyptianPhone('010123456789999999999999'), null);
});

test('A3. phonesMatch performs exact canonical comparison and blocks substring/partial matches', () => {
  assert.equal(phonesMatch('+201012345678', '01012345678'), true);
  assert.equal(phonesMatch('٠١٢٩٨٧٦٥٤٣٢', '+20 129-876-5432'), true);
  assert.equal(phonesMatch('0101234567', '01012345678'), false);
  assert.equal(phonesMatch('01012345679', '01012345678'), false);
  assert.equal(phonesMatch('12345678', '01012345678'), false);
});

test('A4. extractFirstName returns only the first word safely', () => {
  assert.equal(extractFirstName('نور أحمد محمد'), 'نور');
  assert.equal(extractFirstName('  سارة   علي '), 'سارة');
  assert.equal(extractFirstName('مريم'), 'مريم');
  assert.equal(extractFirstName(''), '');
  assert.equal(extractFirstName(null), '');
});

// ===========================================================================
// B. Invoice Token Issuance & create-order Integration Tests
// ===========================================================================
test('B1. create-order issues and returns one-time invoiceAccessToken encrypted in privateOrderAccess without storing token in orders/{id}', async () => {
  const testEncryptionKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createMockAdminDb({
    products: {
      prod_1: {
        name: 'كريم بديل الليزر',
        price: 499,
        stockQuantity: 10,
        image: '/assets/images/p1.jpg'
      }
    }
  });

  const telegramPayloads = [];
  const emailPayloads = [];

  const req = new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'نور أحمد محمد',
        phone: '01012345678',
        email: 'nour@example.com',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9 عمارة 12'
      },
      items: [{ productId: 'prod_1', quantity: 2 }],
      turnstileToken: 'valid_turnstile'
    })
  });

  const res = await createOrderPOST({
    request: req,
    clientAddress: '41.41.41.41',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      orderLimiter: null,
      encryptionKey: testEncryptionKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async (payload) => {
        emailPayloads.push(payload);
        return { success: true };
      },
      sendTelegramNotification: async (payload) => {
        telegramPayloads.push(payload);
        return { success: true };
      }
    }
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') || '', /no-store/);
  const body = await res.json();

  assert.equal(body.success, true);
  assert.ok(body.orderId);
  assert.match(body.invoiceCode, /^DNY-\d{6}$/);
  assert.equal(body.subtotal, 998);
  assert.equal(body.shippingFee, 85);
  assert.equal(body.totalAmount, 1083);
  assert.equal(isValidInvoiceTokenFormat(body.invoiceAccessToken), true);

  // Verify orders/{orderId} does NOT contain token or tokenHash
  const savedOrder = mockDb.data.orders[body.orderId];
  assert.ok(savedOrder);
  assert.equal(savedOrder.invoiceAccessToken, undefined);
  assert.equal(savedOrder.token, undefined);
  assert.equal(savedOrder.tokenHash, undefined);

  // Verify privateOrderAccess/{orderId} stores encryptedToken ONLY (zero plaintext token)
  const accessRecord = mockDb.data.privateOrderAccess[body.orderId];
  assert.ok(accessRecord);
  assert.equal(accessRecord.token, undefined, 'No plaintext token may be stored in privateOrderAccess');
  assert.equal(accessRecord.encryptionVersion, 1);
  assert.equal(accessRecord.encryptedToken?.alg, 'aes-256-gcm');

  // Verify privateInvoiceAccess/{tokenHash} contains ONLY hash metadata, never raw token
  const tokenHash = hashInvoiceToken(body.invoiceAccessToken);
  const hashRecord = mockDb.data.privateInvoiceAccess[tokenHash];
  assert.ok(hashRecord);
  assert.equal(hashRecord.orderId, body.orderId);
  assert.equal(hashRecord.tokenHash, tokenHash);
  assert.equal(hashRecord.status, 'active');
  assert.equal(hashRecord.token, undefined);

  // Verify notifications_outbox confirmation record was written atomically without tokens
  const outboxRecord = mockDb.data.notifications_outbox[`notif_order_${body.orderId}_confirmation`];
  assert.ok(outboxRecord);
  assert.equal(outboxRecord.status, 'pending');
  assert.equal(JSON.stringify(outboxRecord).includes(body.invoiceAccessToken), false);

  // Verify email got token, Telegram did NOT
  assert.equal(emailPayloads.length, 1);
  assert.equal(emailPayloads[0].invoiceAccessToken, body.invoiceAccessToken);
  assert.equal(telegramPayloads.length, 1);
  assert.equal(JSON.stringify(telegramPayloads[0]).includes(body.invoiceAccessToken), false);
});

test('B2. create-order fails atomically with 500 and writes zero partial order if private token persistence fails', async () => {
  const testEncryptionKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createMockAdminDb(
    {
      products: {
        prod_1: { name: 'سيروم', price: 350, stockQuantity: 5 }
      }
    },
    { failPrivateTokenWrites: true }
  );

  const emailPayloads = [];
  const telegramPayloads = [];
  const req = new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'سارة حسن',
        phone: '01122334455',
        governorate: 'Giza',
        city: 'الدقي',
        address: 'شارع التحرير'
      },
      items: [{ productId: 'prod_1', quantity: 1 }],
      turnstileToken: 'valid_turnstile'
    })
  });

  const res = await createOrderPOST({
    request: req,
    clientAddress: '41.41.41.42',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      orderLimiter: null,
      encryptionKey: testEncryptionKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async (payload) => {
        emailPayloads.push(payload);
        return { success: true };
      },
      sendTelegramNotification: async (payload) => {
        telegramPayloads.push(payload);
        return { success: true };
      }
    }
  });

  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.invoiceAccessToken, undefined, 'Must never return unpersisted/broken token');
  assert.equal(mockDb.data.orders, undefined, 'Atomic write failure must not persist orphan order');
  assert.equal(mockDb.data.privateOrderAccess, undefined);
  assert.equal(mockDb.data.notifications_outbox, undefined);
  assert.equal(emailPayloads.length, 0);
  assert.equal(telegramPayloads.length, 0);
});

test('B3. getOrCreateInvoiceToken throws on persistence failure or revoked status', async () => {
  const testEncryptionKey = crypto.randomBytes(32).toString('hex');
  const failingDb = createMockAdminDb({}, { failWrites: true });
  await assert.rejects(
    () => getOrCreateInvoiceToken('ord_fail_1', failingDb, { encryptionKey: testEncryptionKey }),
    /Failed to persist/
  );

  const rawToken = generateSecureInvoiceToken();
  const revokedDb = createMockAdminDb({
    privateOrderAccess: {
      ord_rev_1: {
        token: rawToken,
        tokenHash: hashInvoiceToken(rawToken),
        orderId: 'ord_rev_1',
        status: 'revoked',
        createdAt: new Date().toISOString()
      }
    }
  });
  await assert.rejects(
    () => getOrCreateInvoiceToken('ord_rev_1', revokedDb, { encryptionKey: testEncryptionKey }),
    /revoked/
  );
});

// ===========================================================================
// C. public-invoice API Security & Error Handling Tests
// ===========================================================================
test('C1. public-invoice rejects non-POST methods, non-JSON Content-Type, and invalid JSON safely', async () => {
  const getRes = await publicInvoiceGET();
  assert.equal(getRes.status, 405);
  assert.equal(getRes.headers.get('allow'), 'POST');

  const allRes = await publicInvoiceALL();
  assert.equal(allRes.status, 405);

  const nonJsonRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ access: generateSecureInvoiceToken() })
    })
  });
  assert.equal(nonJsonRes.status, 415);

  const nullBodyRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    })
  });
  assert.equal(nullBodyRes.status, 400);

  const arrayBodyRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[]'
    })
  });
  assert.equal(arrayBodyRes.status, 400);
});

test('C2. public-invoice refuses orderId/invoiceCode lookups, missing/invalid/revoked/expired tokens, and returns 500 on DB error', async () => {
  const activeToken = generateSecureInvoiceToken();
  const activeHash = hashInvoiceToken(activeToken);
  const revokedToken = generateSecureInvoiceToken();
  const revokedHash = hashInvoiceToken(revokedToken);
  const expiredToken = generateSecureInvoiceToken();
  const expiredHash = hashInvoiceToken(expiredToken);

  const mockDb = createMockAdminDb({
    privateInvoiceAccess: {
      [activeHash]: {
        orderId: 'ord_pub_1',
        tokenHash: activeHash,
        status: 'active',
        createdAt: '2026-11-10T10:00:00.000Z'
      },
      [revokedHash]: {
        orderId: 'ord_pub_1',
        tokenHash: revokedHash,
        status: 'revoked',
        createdAt: '2026-11-10T10:00:00.000Z'
      },
      [expiredHash]: {
        orderId: 'ord_pub_1',
        tokenHash: expiredHash,
        status: 'active',
        createdAt: '2026-01-01T10:00:00.000Z',
        expiresAt: '2026-01-02T10:00:00.000Z'
      }
    },
    orders: {
      ord_pub_1: {
        invoiceCode: 'DNY-888777',
        name: 'ليلى محمود',
        phone: '01234567890',
        email: 'layla@example.com',
        governorate: 'Alexandria',
        city: 'سموحة',
        address: 'شارع فوزي معاذ',
        status: 'تم الشحن',
        subtotal: 500,
        shippingFee: 85,
        totalAmount: 585,
        timestamp: '2026-11-10T10:00:00.000Z',
        products: [{ name: 'بودرة داندي', quantity: 1, price: 500, lineTotal: 500 }],
        customerId: 'uid_secret_123',
        internalNotes: 'VIP handle carefully',
        lastUpdatedBy: 'admin@dandy.com',
        adminSecretKey: 'top_secret'
      }
    }
  });

  // 1. Valid token succeeds and sanitizes internal fields
  const okRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: activeToken })
    }),
    clientAddress: '10.0.0.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(okRes.status, 200);
  assert.match(okRes.headers.get('cache-control') || '', /no-store/);
  assert.equal(okRes.headers.get('referrer-policy'), 'no-referrer');
  const okBody = await okRes.json();
  assert.equal(okBody.success, true);
  assert.equal(okBody.order.invoiceCode, 'DNY-888777');
  assert.equal(okBody.order.customerId, undefined);
  assert.equal(okBody.order.internalNotes, undefined);
  assert.equal(okBody.order.lastUpdatedBy, undefined);
  assert.equal(okBody.order.adminSecretKey, undefined);

  // 2. Trying with orderId or invoiceCode without token is rejected
  const byOrderIdRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_pub_1', invoiceCode: 'DNY-888777' })
    }),
    clientAddress: '10.0.0.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(byOrderIdRes.status, 404);

  // 3. Revoked token rejected
  const revokedRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: revokedToken })
    }),
    clientAddress: '10.0.0.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(revokedRes.status, 404);

  // 4. Expired token rejected
  const expiredRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: expiredToken })
    }),
    clientAddress: '10.0.0.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(expiredRes.status, 404);

  // 5. Tampered token rejected
  const tamperedToken = activeToken.slice(0, -4) + 'ABCD';
  const tamperedRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: tamperedToken })
    }),
    clientAddress: '10.0.0.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(tamperedRes.status, 404);

  // 6. Database read failure returns 500 without leaking secrets
  const failingDb = createMockAdminDb({}, { failReads: true });
  const errRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: activeToken })
    }),
    clientAddress: '10.0.0.1',
    _deps: { adminDb: failingDb, redis: null }
  });
  assert.equal(errRes.status, 500);
  const errBody = await errRes.json();
  assert.equal(errBody.error, 'SERVER_ERROR');
  assert.equal(JSON.stringify(errBody).includes('Simulated RTDB'), false);

  // 7. Corrupted order returns null/not-found cleanly
  const corruptedDb = createMockAdminDb({
    privateInvoiceAccess: {
      [activeHash]: { orderId: 'ord_bad', tokenHash: activeHash, status: 'active' }
    },
    orders: { ord_bad: {} }
  });
  const badOrderLookup = await lookupPublicInvoiceByToken(activeToken, corruptedDb);
  assert.equal(badOrderLookup.ok, false);
  assert.equal(badOrderLookup.reason, 'corrupted_order');
});

// ===========================================================================
// D. track-order API Security, Whitelist, Phone Matching & Rate Limiting Tests
// ===========================================================================
test('D1. track-order matches normalized Egyptian phones and returns strict whitelist ONLY', async () => {
  const mockDb = createMockAdminDb({
    orders: {
      '-OrdTrack1': {
        invoiceCode: 'DNY-554433',
        name: 'منة الله إبراهيم حسن',
        phone: '+201098765432',
        email: 'menna.private@example.com',
        governorate: 'Cairo',
        city: 'مدينة نصر',
        address: '15 شارع مكرم عبيد شقة 7',
        status: 'تم الشحن',
        shippingStatus: 'خرجت للتسليم',
        shippingCompany: 'Bosta',
        timestamp: '2026-11-11T12:00:00.000Z',
        lastStatusUpdate: '2026-11-12T09:30:00.000Z',
        shippedAt: '2026-11-12T09:30:00.000Z',
        subtotal: 650,
        shippingFee: 85,
        totalAmount: 735,
        customerId: 'uid_private_999',
        lastUpdatedBy: 'admin@dandy.com',
        internalNotes: 'Call before delivery',
        notifications_outbox: { id: 'notif_1' },
        products: [
          {
            id: 'p1',
            name: 'كريم العناية',
            quantity: 2,
            price: 325,
            lineTotal: 650,
            image: '/img.jpg'
          }
        ]
      }
    }
  });

  // Test multiple equivalent Egyptian phone representations and lowercase invoiceCode
  const formatsToTest = ['01098765432', '+201098765432', '201098765432', '010 9876 5432', '٠١٠٩٨٧٦٥٤٣٢'];

  for (let i = 0; i < formatsToTest.length; i++) {
    const res = await trackOrderPOST({
      request: new Request('http://localhost:3000/api/track-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceCode: 'dny-554433',
          phone: formatsToTest[i],
          customerId: 'attacker_uid', // Must be ignored
          orderId: '-OtherOrder'       // Must be ignored
        })
      }),
      clientAddress: `41.10.20.${i + 1}`,
      _deps: { adminDb: mockDb, redis: null }
    });

    assert.equal(res.status, 200, `Format ${formatsToTest[i]} must succeed`);
    assert.match(res.headers.get('cache-control') || '', /no-store/);
    const body = await res.json();
    assert.equal(body.success, true);

    const o = body.order;
    assert.equal(o.invoiceCode, 'DNY-554433');
    assert.equal(o.firstName, 'منة');
    assert.equal(o.governorate, 'Cairo');
    assert.equal(o.city, 'مدينة نصر');
    assert.equal(o.status, 'تم الشحن');
    assert.equal(o.shippingStatus, 'خرجت للتسليم');
    assert.equal(o.shippingCompany, 'Bosta');
    assert.equal(o.createdAt, '2026-11-11T12:00:00.000Z');
    assert.deepEqual(o.stageDates, { shippedAt: '2026-11-12T09:30:00.000Z' });
    assert.deepEqual(o.products, [{ name: 'كريم العناية', quantity: 2 }]);

    // Strictly blocked PII & internal fields must NOT exist
    assert.equal(o.name, undefined);
    assert.equal(o.phone, undefined);
    assert.equal(o.email, undefined);
    assert.equal(o.address, undefined);
    assert.equal(o.customerId, undefined);
    assert.equal(o.uid, undefined);
    assert.equal(o.orderId, undefined);
    assert.equal(o.invoiceAccessToken, undefined);
    assert.equal(o.tokenHash, undefined);
    assert.equal(o.subtotal, undefined);
    assert.equal(o.shippingFee, undefined);
    assert.equal(o.totalAmount, undefined);
    assert.equal(o.lastUpdatedBy, undefined);
    assert.equal(o.internalNotes, undefined);
    assert.equal(o.notifications_outbox, undefined);
    assert.equal(o.products[0].price, undefined);
    assert.equal(o.products[0].lineTotal, undefined);
  }
});

test('D2. track-order returns identical generic 404 for wrong phone vs nonexistent invoiceCode (anti-enumeration)', async () => {
  const mockDb = createMockAdminDb({
    orders: {
      '-Ord1': {
        invoiceCode: 'DNY-111222',
        name: 'هدى سالم',
        phone: '01211112222',
        governorate: 'Giza',
        city: 'الشيخ زايد',
        address: 'بيفرلي هيلز',
        status: 'قيد التجهيز',
        products: [{ name: 'منتج', quantity: 1 }]
      }
    }
  });

  // Wrong phone on EXISTING invoiceCode
  const wrongPhoneRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-111222', phone: '01299998888' })
    }),
    clientAddress: '41.50.1.1',
    _deps: { adminDb: mockDb, redis: null }
  });

  // NONEXISTENT invoiceCode
  const missingOrderRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-999000', phone: '01299998888' })
    }),
    clientAddress: '41.50.1.2',
    _deps: { adminDb: mockDb, redis: null }
  });

  assert.equal(wrongPhoneRes.status, 404);
  assert.equal(missingOrderRes.status, 404);

  const wrongPhoneBody = await wrongPhoneRes.json();
  const missingOrderBody = await missingOrderRes.json();

  assert.deepEqual(wrongPhoneBody, missingOrderBody, 'Responses must be identical to prevent invoice enumeration');
  assert.equal(wrongPhoneBody.error, 'ORDER_NOT_FOUND_OR_MISMATCH');
});

test('D3. track-order rejects GET/PUT, bad Content-Type, invalid JSON, and partial/malformed inputs', async () => {
  assert.equal((await trackOrderGET()).status, 405);
  assert.equal((await trackOrderGET()).headers.get('allow'), 'POST');
  assert.equal((await trackOrderALL()).status, 405);

  const mockDb = createMockAdminDb({});

  const badCt = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'invoiceCode=DNY-123456&phone=01012345678'
    }),
    clientAddress: '41.60.1.0',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(badCt.status, 415);

  const nullBody = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    }),
    clientAddress: '41.60.1.0',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(nullBody.status, 400);

  const partialPhone = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-123456', phone: '0101234567' })
    }),
    clientAddress: '41.60.1.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(partialPhone.status, 400);
  assert.equal((await partialPhone.json()).error, 'INVALID_INPUT');

  const badCode = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'INVALID_CODE', phone: '01012345678' })
    }),
    clientAddress: '41.60.1.2',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(badCode.status, 400);
});

test('D4. track-order enforces serverless atomic RTDB rate limiting per invoiceCode and per IP (no CAPTCHA)', async () => {
  const mockDb = createMockAdminDb({
    orders: {
      '-OrdRL1': {
        invoiceCode: 'DNY-777888',
        name: 'أميرة طارق',
        phone: '01555554444',
        governorate: 'Cairo',
        city: 'المعادي',
        status: 'جديد',
        products: [{ name: 'مرطب شفاه', quantity: 1 }]
      }
    }
  });

  // 1. Per-target invoiceCode limit = 6 attempts across rotating real clientAddresses -> 7th returns 429
  for (let i = 1; i <= 6; i++) {
    const res = await trackOrderPOST({
      request: new Request('http://localhost:3000/api/track-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceCode: 'DNY-777888', phone: '01000000000' })
      }),
      clientAddress: `198.51.100.${i}`,
      _deps: { adminDb: mockDb, redis: null }
    });
    assert.equal(res.status, 404);
  }

  const blockedByCodeRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-777888', phone: '01555554444' })
    }),
    clientAddress: '198.51.100.99',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(blockedByCodeRes.status, 429);
  assert.equal((await blockedByCodeRes.json()).error, 'RATE_LIMIT_EXCEEDED');
  assert.ok(Number(blockedByCodeRes.headers.get('retry-after')) > 0);

  // 2. Per-IP limit = 15 attempts across different invoiceCodes -> 16th returns 429
  const attackerIp = '203.0.113.77';
  for (let i = 1; i <= 15; i++) {
    const code = `DNY-${String(100000 + i)}`;
    const res = await trackOrderPOST({
      request: new Request('http://localhost:3000/api/track-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceCode: code, phone: '01011112222' })
      }),
      clientAddress: attackerIp,
      _deps: { adminDb: mockDb, redis: null }
    });
    assert.equal(res.status, 404);
  }

  const blockedByIpRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-999111', phone: '01011112222' })
    }),
    clientAddress: attackerIp,
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(blockedByIpRes.status, 429);
  assert.equal((await blockedByIpRes.json()).error, 'RATE_LIMIT_EXCEEDED');

  // Verify privateRateLimits node is populated cleanly with hashed keys (no raw IP stored)
  const ipBuckets = Object.keys(mockDb.data.privateRateLimits.trackOrderIp || {});
  assert.ok(ipBuckets.length > 0);
  assert.equal(ipBuckets.some((k) => k.includes('203.0.113.77')), false);
});

test('D5. checkServerRateLimit resets bucket after window expiration', async () => {
  const mockDb = createMockAdminDb({});
  const r1 = await checkServerRateLimit({
    namespace: 'testWindow',
    key: 'client-1',
    maxRequests: 2,
    windowMs: 50,
    adminDb: mockDb,
    redis: null
  });
  const r2 = await checkServerRateLimit({
    namespace: 'testWindow',
    key: 'client-1',
    maxRequests: 2,
    windowMs: 50,
    adminDb: mockDb,
    redis: null
  });
  const r3 = await checkServerRateLimit({
    namespace: 'testWindow',
    key: 'client-1',
    maxRequests: 2,
    windowMs: 50,
    adminDb: mockDb,
    redis: null
  });

  assert.equal(r1.allowed, true);
  assert.equal(r1.available, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, false);
  assert.equal(r3.available, true);
  assert.equal(r3.reason, 'limit_exceeded');
  assert.equal(r3.source, 'firebase-rtdb');

  await new Promise((resolve) => setTimeout(resolve, 65));

  const r4 = await checkServerRateLimit({
    namespace: 'testWindow',
    key: 'client-1',
    maxRequests: 2,
    windowMs: 50,
    adminDb: mockDb,
    redis: null
  });
  assert.equal(r4.allowed, true);
  assert.equal(r4.available, true);
});

// ===========================================================================
// E. Fail-Closed Rate Limiting: Redis & RTDB Outage / State Distinction Tests
// ===========================================================================
test('E1. checkServerRateLimit handles Redis allow, Redis reject, Redis->RTDB fallback, and fail-closed total outage', async () => {
  const futureReset = Date.now() + 45_000;

  // 1. Redis allows
  const redisAllow = await checkServerRateLimit({
    namespace: 'e1Allow',
    key: 'ip-1',
    maxRequests: 10,
    windowMs: 60_000,
    redis: {
      limit: async () => ({ success: true, remaining: 9, limit: 10, reset: futureReset })
    },
    adminDb: null
  });
  assert.equal(redisAllow.allowed, true);
  assert.equal(redisAllow.available, true);
  assert.equal(redisAllow.source, 'upstash');
  assert.equal(redisAllow.remaining, 9);

  // 2. Redis rejects (limit_exceeded, genuine retryAfterSeconds)
  const redisReject = await checkServerRateLimit({
    namespace: 'e1Reject',
    key: 'ip-1',
    maxRequests: 10,
    windowMs: 60_000,
    redis: {
      limit: async () => ({ success: false, remaining: 0, limit: 10, reset: futureReset })
    },
    adminDb: null
  });
  assert.equal(redisReject.allowed, false);
  assert.equal(redisReject.available, true);
  assert.equal(redisReject.reason, 'limit_exceeded');
  assert.equal(redisReject.source, 'upstash');
  assert.ok(redisReject.retryAfterSeconds > 0);

  // 2b. Redis rejects without reset timestamp -> retryAfterSeconds is NOT invented
  const redisRejectNoReset = await checkServerRateLimit({
    namespace: 'e1RejectNoReset',
    key: 'ip-1',
    maxRequests: 10,
    windowMs: 60_000,
    redis: {
      limit: async () => ({ success: false, remaining: 0, limit: 10 })
    },
    adminDb: null
  });
  assert.equal(redisRejectNoReset.allowed, false);
  assert.equal(redisRejectNoReset.available, true);
  assert.equal(redisRejectNoReset.reason, 'limit_exceeded');
  assert.equal(redisRejectNoReset.retryAfterSeconds, undefined);

  // 3. Redis throws + RTDB succeeds -> falls back to RTDB cleanly
  const workingDb = createMockAdminDb({});
  const failingRedis = {
    limit: async () => {
      throw new Error('ECONNREFUSED redis.internal:6379');
    }
  };
  const fallbackAllow = await checkServerRateLimit({
    namespace: 'e1Fallback',
    key: 'ip-2',
    maxRequests: 1,
    windowMs: 60_000,
    redis: failingRedis,
    adminDb: workingDb
  });
  assert.equal(fallbackAllow.allowed, true);
  assert.equal(fallbackAllow.available, true);
  assert.equal(fallbackAllow.source, 'firebase-rtdb');

  // 4. Redis throws + RTDB rejects -> limit_exceeded via RTDB
  const fallbackReject = await checkServerRateLimit({
    namespace: 'e1Fallback',
    key: 'ip-2',
    maxRequests: 1,
    windowMs: 60_000,
    redis: failingRedis,
    adminDb: workingDb
  });
  assert.equal(fallbackReject.allowed, false);
  assert.equal(fallbackReject.available, true);
  assert.equal(fallbackReject.reason, 'limit_exceeded');
  assert.equal(fallbackReject.source, 'firebase-rtdb');

  // 5. Both Redis and RTDB fail (transaction throws) -> FAIL-CLOSED store_unavailable (even if failOpen: true passed)
  const failingTxDb = createMockAdminDb({}, { failTransactions: true });
  const bothFail = await checkServerRateLimit({
    namespace: 'e1Outage',
    key: 'ip-3',
    maxRequests: 10,
    windowMs: 60_000,
    redis: failingRedis,
    adminDb: failingTxDb,
    failOpen: true
  });
  assert.equal(bothFail.allowed, false);
  assert.equal(bothFail.available, false);
  assert.equal(bothFail.reason, 'store_unavailable');
  assert.equal(bothFail.source, 'unavailable');
  assert.equal(bothFail.retryAfterSeconds, undefined);

  // 6. adminDb missing + no Redis -> FAIL-CLOSED store_unavailable
  const noStore = await checkServerRateLimit({
    namespace: 'e1NoStore',
    key: 'ip-4',
    maxRequests: 10,
    windowMs: 60_000,
    redis: null,
    adminDb: null
  });
  assert.equal(noStore.allowed, false);
  assert.equal(noStore.available, false);
  assert.equal(noStore.reason, 'store_unavailable');
  assert.equal(noStore.source, 'unavailable');

  // 7. RTDB transaction returns committed: false -> FAIL-CLOSED store_unavailable
  const uncommittedDb = {
    ref: () => ({
      transaction: async () => ({ committed: false, snapshot: { val: () => null } })
    })
  };
  const uncommittedResult = await checkServerRateLimit({
    namespace: 'e1Uncommitted',
    key: 'ip-5',
    maxRequests: 10,
    windowMs: 60_000,
    redis: null,
    adminDb: uncommittedDb
  });
  assert.equal(uncommittedResult.allowed, false);
  assert.equal(uncommittedResult.available, false);
  assert.equal(uncommittedResult.reason, 'store_unavailable');
  assert.equal(uncommittedResult.source, 'unavailable');
});

// ===========================================================================
// F. HTTP Classification (429 vs 503), Anti-Leakage & Privacy Headers Tests
// ===========================================================================
test('F1. track-order & public-invoice return 503 (never 429/200) on store outage and 429 on limit exceeded without leaking internals', async () => {
  const token = generateSecureInvoiceToken();
  const tokenHash = hashInvoiceToken(token);
  const mockDbOk = createMockAdminDb({
    privateInvoiceAccess: {
      [tokenHash]: { orderId: 'ord_f1', tokenHash, status: 'active' }
    },
    orders: {
      ord_f1: {
        invoiceCode: 'DNY-445566',
        name: 'فاطمة الزهراء',
        phone: '01022223333',
        governorate: 'Cairo',
        city: 'الزمالك',
        address: 'شارع 26 يوليو',
        status: 'تم التأكيد',
        subtotal: 400,
        shippingFee: 85,
        totalAmount: 485,
        products: [{ name: 'غسول وجه', quantity: 1, price: 400, lineTotal: 400 }],
        internalNotes: 'secret_note',
        customerId: 'uid_hidden'
      }
    }
  });
  const failingTxDb = createMockAdminDb({}, { failTransactions: true });
  const failingRedis = {
    limit: async () => {
      throw new Error('UPSTASH_REDIS_REST_TOKEN invalid at https://secret-redis.upstash.io');
    }
  };

  // 1. Outage on public-invoice -> 503 SERVICE_TEMPORARILY_UNAVAILABLE, NO Retry-After, strict cache/privacy headers, zero leaks
  const pubOutageRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: token })
    }),
    clientAddress: '197.10.10.10',
    _deps: { adminDb: failingTxDb, redis: failingRedis }
  });
  assert.equal(pubOutageRes.status, 503);
  assert.equal(pubOutageRes.headers.get('retry-after'), null);
  assert.match(pubOutageRes.headers.get('cache-control') || '', /no-store/);
  assert.equal(pubOutageRes.headers.get('pragma'), 'no-cache');
  assert.equal(pubOutageRes.headers.get('referrer-policy'), 'no-referrer');
  const pubOutageBody = await pubOutageRes.json();
  assert.equal(pubOutageBody.error, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  assert.equal(/redis|upstash|firebase|rtdb|privateRateLimits/i.test(JSON.stringify(pubOutageBody)), false);

  // 2. Outage on track-order -> 503 SERVICE_TEMPORARILY_UNAVAILABLE
  const trackOutageRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-445566', phone: '01022223333' })
    }),
    clientAddress: '197.10.10.11',
    _deps: { adminDb: failingTxDb, redis: null }
  });
  assert.equal(trackOutageRes.status, 503);
  assert.equal(trackOutageRes.headers.get('retry-after'), null);
  assert.match(trackOutageRes.headers.get('cache-control') || '', /no-store/);
  assert.equal(trackOutageRes.headers.get('referrer-policy'), 'no-referrer');
  const trackOutageBody = await trackOutageRes.json();
  assert.equal(trackOutageBody.error, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  assert.equal(/redis|upstash|firebase|rtdb|privateRateLimits/i.test(JSON.stringify(trackOutageBody)), false);

  // 3. track-order when IP limit passes (1st call) then codeRateLimit hits store outage (2nd call throws) -> 503, NOT 429!
  let txCount = 0;
  const secondCallFailDb = {
    ref: (path) => ({
      ...mockDbOk.ref(path),
      transaction: async (updater) => {
        txCount++;
        if (txCount === 1) {
          const val = updater(null);
          return { committed: true, snapshot: { val: () => val } };
        }
        throw new Error('RTDB transaction aborted mid-flight');
      }
    })
  };
  const partialOutageRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceCode: 'DNY-445566', phone: '01022223333' })
    }),
    clientAddress: '197.10.10.12',
    _deps: { adminDb: secondCallFailDb, redis: null }
  });
  assert.equal(partialOutageRes.status, 503);
  assert.equal((await partialOutageRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');

  // 4. Actual Redis rate limit exceeded on public-invoice -> 429 RATE_LIMIT_EXCEEDED with Retry-After
  const resetAt = Date.now() + 120_000;
  const pubLimitedRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: token })
    }),
    clientAddress: '197.10.10.13',
    _deps: {
      adminDb: mockDbOk,
      redis: { limit: async () => ({ success: false, remaining: 0, limit: 60, reset: resetAt }) }
    }
  });
  assert.equal(pubLimitedRes.status, 429);
  assert.ok(Number(pubLimitedRes.headers.get('retry-after')) > 0);
  assert.match(pubLimitedRes.headers.get('cache-control') || '', /no-store/);
  assert.equal(pubLimitedRes.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await pubLimitedRes.json()).error, 'RATE_LIMIT_EXCEEDED');

  // 5. Missing clientAddress / unresolvable IP -> fail closed with 503 (never fallback to 127.0.0.1)
  const missingIpTrackRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '8.8.8.8',
        'cf-connecting-ip': '1.1.1.1'
      },
      body: JSON.stringify({ invoiceCode: 'DNY-445566', phone: '01022223333' })
    }),
    _deps: { adminDb: mockDbOk, redis: null }
  });
  assert.equal(missingIpTrackRes.status, 503);
  assert.equal((await missingIpTrackRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');

  const missingIpPubRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '8.8.8.8'
      },
      body: JSON.stringify({ access: token })
    }),
    _deps: { adminDb: mockDbOk, redis: null }
  });
  assert.equal(missingIpPubRes.status, 503);
  assert.equal((await missingIpPubRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');

  // 6. Astro static context getter throwing StaticClientAddressNotAvailable is handled safely -> 503 (never 500)
  const throwingGetterCtx = {
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: token })
    }),
    get clientAddress() {
      throw new Error('StaticClientAddressNotAvailable');
    },
    _deps: { adminDb: mockDbOk, redis: null }
  };
  assert.equal(extractAstroClientAddress(throwingGetterCtx), undefined);
  const throwingGetterRes = await publicInvoicePOST(throwingGetterCtx);
  assert.equal(throwingGetterRes.status, 503);
});

// ===========================================================================
// G. Trusted Client IP Extraction & Anti-Spoofing Tests
// ===========================================================================
test('G1. getSafeClientIp ignores spoofed headers, validates IPv4/IPv6 with node:net, and isolates Vercel vs Node', () => {
  // 1. Spoofed x-forwarded-for / cf-connecting-ip / x-vercel-forwarded-for / x-real-ip in local Node mode are ignored
  const spoofReq = new Request('http://localhost:3000/api/track-order', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '9.9.9.9, 8.8.8.8',
      'x-vercel-forwarded-for': '7.7.7.7',
      'cf-connecting-ip': '6.6.6.6',
      'x-real-ip': '5.5.5.5'
    }
  });
  assert.equal(
    getSafeClientIp({ request: spoofReq, clientAddress: '41.33.22.11', isVercel: false, trustedProxy: false }),
    '41.33.22.11'
  );

  // 2. Localhost in local dev/test works with IPv4, IPv6 ::1, and IPv4-mapped IPv6 ::ffff:127.0.0.1
  assert.equal(
    getSafeClientIp({ request: spoofReq, clientAddress: '127.0.0.1', isVercel: false }),
    '127.0.0.1'
  );
  assert.equal(
    getSafeClientIp({ request: spoofReq, clientAddress: '::1', isVercel: false }),
    '::1'
  );
  assert.equal(
    getSafeClientIp({ request: spoofReq, clientAddress: '::ffff:127.0.0.1', isVercel: false }),
    '127.0.0.1'
  );

  // 3. Valid IPv4 and IPv6 addresses
  assert.equal(normalizeAndValidateIp('197.55.120.42'), '197.55.120.42');
  assert.equal(normalizeAndValidateIp('2001:0DB8::1'), '2001:0db8::1');
  assert.equal(normalizeAndValidateIp('::ffff:197.55.120.42'), '197.55.120.42');

  // 4. Invalid / multi-value / port-suffixed IPs are rejected
  assert.equal(normalizeAndValidateIp('invalid-ip'), null);
  assert.equal(normalizeAndValidateIp('999.999.999.999'), null);
  assert.equal(normalizeAndValidateIp('1.2.3.4, 5.6.7.8'), null);
  assert.equal(normalizeAndValidateIp('1.2.3.4:8080'), null);
  assert.equal(normalizeAndValidateIp(''), null);
  assert.equal(
    getSafeClientIp({ request: new Request('http://localhost:3000'), clientAddress: 'invalid-ip', isVercel: false }),
    null
  );

  // 5. Vercel runtime reads edge-set x-real-ip, ignores spoofed x-forwarded-for & cf-connecting-ip & clientAddress fallback
  const vercelReq = new Request('https://dandy.example/api/track-order', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'cf-connecting-ip': '2.2.2.2',
      'x-real-ip': '197.44.55.66'
    }
  });
  assert.equal(
    getSafeClientIp({ request: vercelReq, clientAddress: '1.2.3.4', isVercel: true }),
    '197.44.55.66'
  );

  // 6. On Vercel without valid x-real-ip or single x-vercel-forwarded-for -> returns null (never trusts x-forwarded-for[0])
  const vercelMissingRealIp = new Request('https://dandy.example/api/track-order', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'cf-connecting-ip': '2.2.2.2'
    }
  });
  assert.equal(
    getSafeClientIp({ request: vercelMissingRealIp, clientAddress: '1.2.3.4', isVercel: true }),
    null
  );

  // 7. Trusted reverse-proxy mode never picks leftmost spoofed x-forwarded-for[0]
  const proxyReq = new Request('http://localhost:3000/api/track-order', {
    method: 'POST',
    headers: { 'x-forwarded-for': '1.2.3.4, 156.200.10.20' }
  });
  assert.equal(
    getSafeClientIp({
      request: proxyReq,
      clientAddress: '127.0.0.1',
      isVercel: false,
      trustedProxy: true
    }),
    '156.200.10.20'
  );
});

test('G2. Rotating spoofed x-forwarded-for headers cannot bypass track-order or public-invoice rate limits', async () => {
  const token = generateSecureInvoiceToken();
  const tokenHash = hashInvoiceToken(token);
  const mockDb = createMockAdminDb({
    privateInvoiceAccess: {
      [tokenHash]: { orderId: 'ord_g2', tokenHash, status: 'active' }
    },
    orders: {
      ord_g2: {
        invoiceCode: 'DNY-667788',
        name: 'نادية كمال',
        phone: '01144445555',
        governorate: 'Giza',
        city: 'المهندسين',
        address: 'شارع جامعة الدول',
        status: 'جديد',
        subtotal: 300,
        shippingFee: 85,
        totalAmount: 385,
        products: [{ name: 'كريم يد', quantity: 1, price: 300, lineTotal: 300 }]
      }
    }
  });

  // Same real clientAddress '203.0.113.88' sends 16 requests while rotating spoofed headers each time
  for (let i = 1; i <= 15; i++) {
    const res = await trackOrderPOST({
      request: new Request('http://localhost:3000/api/track-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `198.18.0.${i}`,
          'x-vercel-forwarded-for': `198.19.0.${i}`,
          'cf-connecting-ip': `198.20.0.${i}`,
          'x-real-ip': `198.21.0.${i}`
        },
        body: JSON.stringify({ invoiceCode: `DNY-${200000 + i}`, phone: '01144445555' })
      }),
      clientAddress: '203.0.113.88',
      _deps: { adminDb: mockDb, redis: null, ipContext: { isVercel: false, trustedProxy: false } }
    });
    assert.equal(res.status, 404);
  }

  const blockedRes = await trackOrderPOST({
    request: new Request('http://localhost:3000/api/track-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.18.0.250',
        'x-vercel-forwarded-for': '198.19.0.250',
        'cf-connecting-ip': '198.20.0.250',
        'x-real-ip': '198.21.0.250'
      },
      body: JSON.stringify({ invoiceCode: 'DNY-667788', phone: '01144445555' })
    }),
    clientAddress: '203.0.113.88',
    _deps: { adminDb: mockDb, redis: null, ipContext: { isVercel: false, trustedProxy: false } }
  });
  assert.equal(blockedRes.status, 429);
  assert.equal((await blockedRes.json()).error, 'RATE_LIMIT_EXCEEDED');

  // Same anti-spoofing check on public-invoice (guest access works normally for real client on 127.0.0.1, but 60/IP limit cannot be bypassed via spoofed headers)
  const guestLocalRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '9.9.9.9',
        'cf-connecting-ip': '8.8.8.8'
      },
      body: JSON.stringify({ access: token })
    }),
    clientAddress: '::ffff:127.0.0.1',
    _deps: { adminDb: mockDb, redis: null, ipContext: { isVercel: false, trustedProxy: false } }
  });
  assert.equal(guestLocalRes.status, 200);
  const guestLocalBody = await guestLocalRes.json();
  assert.equal(guestLocalBody.order.invoiceCode, 'DNY-667788');
  assert.equal(Object.keys(mockDb.data.privateRateLimits.publicInvoice).length, 1);
});

