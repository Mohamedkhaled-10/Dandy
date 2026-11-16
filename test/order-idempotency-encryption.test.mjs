// test/order-idempotency-encryption.test.mjs
// Automated test suite for Batch 2: Order Integrity, Idempotency, Atomic Writes & AES-256-GCM Invoice Token Encryption

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  parseEncryptionKey,
  encryptInvoiceToken,
  decryptInvoiceToken,
  hashInvoiceToken,
  generateSecureInvoiceToken,
  getOrCreateInvoiceToken,
  lookupPublicInvoiceByToken,
  prepareNewInvoiceAccessArtifacts
} from '../src/utils/invoice-token.ts';
import {
  isValidUuidV4,
  hashClientRequestId,
  computeOrderRequestFingerprint,
  acquireOrderIdempotencyLock,
  reconcileIdempotencyAfterFailure
} from '../src/utils/order-idempotency.ts';
import { getSafeClientIp } from '../src/utils/server-rate-limit.ts';
import { sendOrderNotification } from '../src/utils/email-service.ts';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import { POST as publicInvoicePOST } from '../src/pages/api/public-invoice.js';

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
        const newKey = `-MockOrder_${pushCounter}`;
        const childPath = path ? `${path}/${newKey}` : newKey;
        return makeRef(childPath);
      },
      async transaction(updater) {
        if (options.failTransactions) {
          throw new Error('Simulated RTDB transaction failure');
        }
        const current = getAtPath(path);
        const clonedCurrent =
          current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
        const nextVal = updater(clonedCurrent);
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
    };
  }

  return { data, ref: makeRef };
}

function makeOrderRequest(payload = {}) {
  return new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'ليلى محمد',
        phone: '01012345678',
        email: 'layla@example.com',
        governorate: 'Cairo',
        city: 'مدينة نصر',
        address: 'شارع عباس العقاد',
        ...(payload.customer || {})
      },
      items: payload.items || [{ productId: 'prod_1', quantity: 1 }],
      turnstileToken: payload.turnstileToken ?? 'valid_turnstile',
      ...(payload.clientRequestId !== undefined ? { clientRequestId: payload.clientRequestId } : {})
    })
  });
}

// ===========================================================================
// 1. Hardened Vercel / TRUST_PROXY IP Extraction Tests
// ===========================================================================
test('1. getSafeClientIp enforces VERCEL===1 strictly and blocks spoofed x-real-ip under TRUST_PROXY', () => {
  const prevVercel = process.env.VERCEL;
  const prevVercelEnv = process.env.VERCEL_ENV;

  try {
    // Setting VERCEL_ENV alone without VERCEL === '1' must NOT enable Vercel edge header trust
    delete process.env.VERCEL;
    process.env.VERCEL_ENV = 'preview';
    const spoofVercelReq = new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'x-real-ip': '198.51.100.77', 'x-forwarded-for': '203.0.113.5' }
    });
    assert.equal(getSafeClientIp({ request: spoofVercelReq, clientAddress: '41.41.41.41' }), '41.41.41.41');

    // Setting VERCEL === '1' activates Vercel edge x-real-ip resolution
    process.env.VERCEL = '1';
    assert.equal(getSafeClientIp({ request: spoofVercelReq, clientAddress: '41.41.41.41' }), '198.51.100.77');

    // Non-Vercel TRUST_PROXY ignores headers unless socketIp is in TRUSTED_PROXY_IPS allowlist
    delete process.env.VERCEL;
    const proxySpoofReq = new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: {
        'x-real-ip': '8.8.8.8',
        'x-forwarded-for': '1.2.3.4, 156.200.10.20'
      }
    });
    assert.equal(
      getSafeClientIp({
        request: proxySpoofReq,
        clientAddress: '198.51.100.99', // Untrusted hop
        isVercel: false,
        trustedProxy: true,
        trustedProxyIps: ['10.0.0.5']
      }),
      '198.51.100.99'
    );

    // Trusted proxy hop ignores x-real-ip unless trustRealIpHeader is explicitly true, using rightmost non-private XFF
    assert.equal(
      getSafeClientIp({
        request: proxySpoofReq,
        clientAddress: '10.0.0.5',
        isVercel: false,
        trustedProxy: true,
        trustedProxyIps: ['10.0.0.5'],
        trustRealIpHeader: false
      }),
      '156.200.10.20'
    );

    assert.equal(
      getSafeClientIp({
        request: proxySpoofReq,
        clientAddress: '10.0.0.5',
        isVercel: false,
        trustedProxy: true,
        trustedProxyIps: ['10.0.0.5'],
        trustRealIpHeader: true
      }),
      '8.8.8.8'
    );
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
  }
});

// ===========================================================================
// 2. AES-256-GCM Encryption, Key Validation & Legacy Compatibility
// ===========================================================================
test('2. AES-256-GCM encryption validates keys strictly, generates unique IVs, binds AAD to orderId, and rejects tampering', () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const b64Key = crypto.randomBytes(32).toString('base64');

  assert.equal(parseEncryptionKey(hexKey).length, 32);
  assert.equal(parseEncryptionKey(b64Key).length, 32);

  assert.throws(() => parseEncryptionKey(''), /missing or invalid/);
  assert.throws(() => parseEncryptionKey('abcd'), /missing or invalid/);
  assert.throws(() => parseEncryptionKey(crypto.randomBytes(16).toString('hex')), /missing or invalid/);
  assert.throws(() => parseEncryptionKey(crypto.randomBytes(24).toString('base64')), /missing or invalid/);

  const rawToken = generateSecureInvoiceToken();
  const tokenHash = hashInvoiceToken(rawToken);
  const enc1 = encryptInvoiceToken(rawToken, 'ord_1', hexKey);
  const enc2 = encryptInvoiceToken(rawToken, 'ord_1', hexKey);

  assert.equal(enc1.v, 1);
  assert.equal(enc1.alg, 'aes-256-gcm');
  assert.notEqual(enc1.iv, enc2.iv, 'Each encryption must use a fresh random 12-byte IV');
  assert.notEqual(enc1.ciphertext, enc2.ciphertext);

  // Decrypt succeeds with same orderId & hash
  assert.equal(decryptInvoiceToken(enc1, 'ord_1', hexKey, tokenHash), rawToken);

  // Decrypt with Base64 encoding of exact same key bytes
  const sameKeyAsB64 = Buffer.from(hexKey, 'hex').toString('base64');
  assert.equal(decryptInvoiceToken(enc1, 'ord_1', sameKeyAsB64, tokenHash), rawToken);

  // Different orderId fails AAD verification
  assert.throws(() => decryptInvoiceToken(enc1, 'ord_2', hexKey, tokenHash), /Failed to decrypt/);

  // Tampered ciphertext / tag / hash fails
  const tamperedTag = { ...enc1, tag: Buffer.alloc(16, 1).toString('base64url') };
  assert.throws(() => decryptInvoiceToken(tamperedTag, 'ord_1', hexKey, tokenHash), /Failed to decrypt/);
  assert.throws(() => decryptInvoiceToken(enc1, 'ord_1', hexKey, '0'.repeat(64)), /hash mismatch/);
});

test('3. Missing encryption key blocks new writes cleanly without storing plaintext fallback', async () => {
  const prevKey = process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
  delete process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;

  try {
    assert.throws(() => prepareNewInvoiceAccessArtifacts('ord_nokey'), /missing or invalid/);

    const mockDb = createMockAdminDb({
      products: { prod_1: { name: 'سيروم', price: 250, stockQuantity: 5 } }
    });

    const res = await createOrderPOST({
      request: makeOrderRequest(),
      clientAddress: '41.41.41.41',
      _deps: {
        adminDb: mockDb,
        adminAuth: null,
        orderLimiter: null,
        encryptionKey: '',
        skipPublishedCampaignFallback: true,
        verifyTurnstileToken: async () => ({ success: true })
      }
    });

    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'SERVER_CONFIG_ERROR');
    assert.equal(mockDb.data.orders, undefined);
    assert.equal(mockDb.data.privateOrderAccess, undefined);
    assert.equal(mockDb.data.privateOrderIdempotency, undefined);
  } finally {
    if (prevKey === undefined) delete process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
    else process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = prevKey;
  }
});

test('4. Legacy plaintext links remain valid and lazily migrate atomically on read when encryption key is present', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const legacyToken = generateSecureInvoiceToken();
  const legacyHash = hashInvoiceToken(legacyToken);

  const mockDb = createMockAdminDb({
    orders: {
      ord_legacy_1: {
        invoiceCode: 'DNY-111222',
        name: 'مها علي',
        phone: '01099887766',
        email: 'maha@example.com',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9',
        subtotal: 300,
        shippingFee: 85,
        totalAmount: 385,
        status: 'تم الشحن',
        products: [{ name: 'كريم', quantity: 1, price: 300, lineTotal: 300 }]
      }
    },
    privateOrderAccess: {
      ord_legacy_1: {
        token: legacyToken,
        tokenHash: legacyHash,
        orderId: 'ord_legacy_1',
        createdAt: '2026-10-01T10:00:00.000Z',
        status: 'active'
      }
    },
    privateInvoiceAccess: {
      [legacyHash]: {
        orderId: 'ord_legacy_1',
        tokenHash: legacyHash,
        createdAt: '2026-10-01T10:00:00.000Z',
        status: 'active'
      }
    }
  });

  // 1. Public invoice lookup works WITHOUT encryption key
  const prevKey = process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
  delete process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
  try {
    const publicRes = await lookupPublicInvoiceByToken(legacyToken, mockDb);
    assert.equal(publicRes.ok, true);
    assert.equal(publicRes.order.invoiceCode, 'DNY-111222');

    // 2. Read-only legacy compatibility when key is absent (returns legacy token, leaves DB untouched)
    const readOnlyToken = await getOrCreateInvoiceToken('ord_legacy_1', mockDb);
    assert.equal(readOnlyToken, legacyToken);
    assert.equal(mockDb.data.privateOrderAccess.ord_legacy_1.token, legacyToken);
  } finally {
    if (prevKey === undefined) delete process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY;
    else process.env.DANDY_INVOICE_TOKEN_ENCRYPTION_KEY = prevKey;
  }

  // 3. Lazy migration with failing transaction preserves legacy record untouched
  const failingTxDb = createMockAdminDb(mockDb.data, { failTransactions: true });
  const tokenOnTxFail = await getOrCreateInvoiceToken('ord_legacy_1', failingTxDb, {
    encryptionKey: hexKey
  });
  assert.equal(tokenOnTxFail, legacyToken);
  assert.equal(failingTxDb.data.privateOrderAccess.ord_legacy_1.token, legacyToken);
  assert.equal(failingTxDb.data.privateOrderAccess.ord_legacy_1.encryptedToken, undefined);

  // 4. Lazy migration with healthy transaction encrypts and deletes plaintext token
  const migratedToken = await getOrCreateInvoiceToken('ord_legacy_1', mockDb, {
    encryptionKey: hexKey
  });
  assert.equal(migratedToken, legacyToken);
  const migratedRecord = mockDb.data.privateOrderAccess.ord_legacy_1;
  assert.equal(migratedRecord.token, undefined, 'Legacy plaintext token must be removed after migration');
  assert.equal(migratedRecord.encryptionVersion, 1);
  assert.equal(decryptInvoiceToken(migratedRecord.encryptedToken, 'ord_legacy_1', hexKey, legacyHash), legacyToken);

  // 5. Public invoice API still resolves the exact same token after migration
  const pubRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: legacyToken })
    }),
    clientAddress: '127.0.0.1',
    _deps: { adminDb: mockDb, redis: null }
  });
  assert.equal(pubRes.status, 200);
});

test('5. sendOrderNotification decrypts encrypted privateOrderAccess token automatically when invoiceAccessToken is omitted', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const artifacts = prepareNewInvoiceAccessArtifacts('ord_email_dec_1', hexKey);
  const mockDb = createMockAdminDb({
    privateOrderAccess: { ord_email_dec_1: artifacts.orderAccessRecord },
    privateInvoiceAccess: { [artifacts.tokenHash]: artifacts.invoiceAccessRecord }
  });

  const origFetch = globalThis.fetch;
  const origWebhook = process.env.GMAIL_RELAY_URL;
  const origSecret = process.env.GMAIL_RELAY_SECRET;
  const origGmail = process.env.GMAIL_NOTIFICATIONS_ENABLED;
  let capturedEmailPayload = null;

  process.env.GMAIL_RELAY_URL = 'https://script.google.com/macros/s/mock/exec';
  process.env.GMAIL_RELAY_SECRET = 'mock_relay_secret';
  process.env.GMAIL_NOTIFICATIONS_ENABLED = 'true';
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('script.google.com')) {
      const envelope = JSON.parse(opts.body);
      capturedEmailPayload = JSON.parse(envelope.payloadJson);
      return new Response(JSON.stringify({ success: true, message: 'Accepted by MailApp' }), { status: 200 });
    }
    return origFetch(url, opts);
  };

  try {
    const result = await sendOrderNotification({
      order: {
        invoiceCode: 'DNY-555444',
        name: 'ندى سمير',
        email: 'nada@example.com',
        status: 'تم الشحن',
        subtotal: 400,
        shippingFee: 85,
        totalAmount: 485,
        products: [{ name: 'بودرة', quantity: 1, price: 400, lineTotal: 400 }]
      },
      orderId: 'ord_email_dec_1',
      eventType: 'ORDER_STATUS_CHANGED',
      newStatus: 'تم الشحن',
      oldStatus: 'قيد التجهيز',
      adminDb: mockDb,
      encryptionKey: hexKey
    });

    assert.equal(result.success, true);
    assert.ok(capturedEmailPayload?.htmlBody.includes(`#access=${artifacts.token}`));
  } finally {
    globalThis.fetch = origFetch;
    if (origWebhook === undefined) delete process.env.GMAIL_RELAY_URL;
    else process.env.GMAIL_RELAY_URL = origWebhook;
    if (origSecret === undefined) delete process.env.GMAIL_RELAY_SECRET;
    else process.env.GMAIL_RELAY_SECRET = origSecret;
    if (origGmail === undefined) delete process.env.GMAIL_NOTIFICATIONS_ENABLED;
    else process.env.GMAIL_NOTIFICATIONS_ENABLED = origGmail;
  }
});

// ===========================================================================
// 3. create-order Fail-Closed Rate Limiting & Product Availability
// ===========================================================================
test('6. create-order enforces fail-closed rate limiting (503 when unavailable, 429 on limit) and rejects isHidden/isSoldOut', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createMockAdminDb({
    products: {
      prod_ok: { name: 'كريم متاح', price: 300, stockQuantity: 10 },
      prod_hidden: { name: 'منتج مخفي', price: 300, isHidden: true, stockQuantity: 10 },
      prod_soldout: { name: 'منتج نافد', price: 300, isSoldOut: true, stockQuantity: 0 }
    }
  });

  // A. Missing IP -> 503 SERVICE_TEMPORARILY_UNAVAILABLE
  const noIpRes = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_ok', quantity: 1 }] }),
    _deps: {
      adminDb: mockDb,
      redis: null,
      ipContext: { isVercel: false, trustedProxy: false }
    }
  });
  assert.equal(noIpRes.status, 503);
  assert.equal((await noIpRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');

  // B. Both Redis failing & RTDB transactions failing -> 503 SERVICE_TEMPORARILY_UNAVAILABLE
  const failingTxDb = createMockAdminDb(mockDb.data, { failTransactions: true });
  const failingRedis = { limit: async () => { throw new Error('Redis down'); } };
  const storeDownRes = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_ok', quantity: 1 }] }),
    clientAddress: '41.41.41.41',
    _deps: { adminDb: failingTxDb, redis: failingRedis, encryptionKey: hexKey }
  });
  assert.equal(storeDownRes.status, 503);
  assert.equal((await storeDownRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');

  // C. Hidden / Sold-out individual products rejected with 400 PRODUCT_UNAVAILABLE
  const hiddenRes = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_hidden', quantity: 1 }] }),
    clientAddress: '41.41.41.50',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(hiddenRes.status, 400);
  assert.equal((await hiddenRes.json()).error, 'PRODUCT_UNAVAILABLE');

  const soldOutRes = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_soldout', quantity: 1 }] }),
    clientAddress: '41.41.41.50',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(soldOutRes.status, 400);
  assert.equal((await soldOutRes.json()).error, 'PRODUCT_UNAVAILABLE');
  assert.equal(mockDb.data.orders, undefined);

  // D. Exceeding 10 req/60s triggers 429 RATE_LIMIT_EXCEEDED
  let receivedTurnstileIp = null;
  for (let i = 1; i <= 10; i++) {
    const okRes = await createOrderPOST({
      request: makeOrderRequest({ items: [{ productId: 'prod_ok', quantity: 1 }] }),
      clientAddress: '41.41.41.99',
      _deps: {
        adminDb: mockDb,
        adminAuth: null,
        redis: null,
        encryptionKey: hexKey,
        skipPublishedCampaignFallback: true,
        verifyTurnstileToken: async (_tok, ip) => {
          receivedTurnstileIp = ip;
          return { success: true };
        },
        sendOrderNotification: async () => ({ success: true }),
        sendTelegramNotification: async () => ({ success: true })
      }
    });
    assert.equal(okRes.status, 200);
  }
  assert.equal(receivedTurnstileIp, '41.41.41.99');

  const res429 = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_ok', quantity: 1 }] }),
    clientAddress: '41.41.41.99',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey
    }
  });
  assert.equal(res429.status, 429);
  assert.equal((await res429.json()).error, 'RATE_LIMIT_EXCEEDED');
  assert.ok(Number(res429.headers.get('retry-after')) >= 1);
});

// ===========================================================================
// 4. Idempotency State Machine, Concurrency, Conflicts & Crash Recovery
// ===========================================================================
test('7. Idempotency: omitted clientRequestId preserves guest checkout, invalid UUID is 400, valid UUID replays safely without duplicating side effects', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createMockAdminDb({
    products: {
      prod_1: { name: 'سيروم داندي', price: 400, stockQuantity: 10 }
    }
  });

  let emailCount = 0;
  let tgCount = 0;

  // A. Invalid clientRequestId rejected with 400
  const invalidIdRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: 'not-a-uuid-v4' }),
    clientAddress: '41.41.42.1',
    _deps: { adminDb: mockDb, redis: null, encryptionKey: hexKey }
  });
  assert.equal(invalidIdRes.status, 400);
  assert.equal((await invalidIdRes.json()).error, 'INVALID_CLIENT_REQUEST_ID');

  // B. Omitted clientRequestId (transitional legacy cart.astro compatibility) creates orders without artificial 30s block
  const legacyRes1 = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_1', quantity: 1 }] }),
    clientAddress: '41.41.42.2',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true })
    }
  });
  const legacyRes2 = await createOrderPOST({
    request: makeOrderRequest({ items: [{ productId: 'prod_1', quantity: 1 }] }),
    clientAddress: '41.41.42.2',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true })
    }
  });
  assert.equal(legacyRes1.status, 200);
  assert.equal(legacyRes2.status, 200);
  assert.notEqual((await legacyRes1.json()).orderId, (await legacyRes2.json()).orderId);

  // Reset stock for clean UUID v4 idempotency check
  mockDb.data.products.prod_1.stockQuantity = 10;
  const reqUuid = crypto.randomUUID();
  assert.equal(isValidUuidV4(reqUuid), true);

  const firstRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqUuid,
      customer: { phone: '01012345678', email: '' },
      items: [{ productId: 'prod_1', quantity: 2 }],
      turnstileToken: 'turnstile_1'
    }),
    clientAddress: '41.41.42.3',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => { emailCount++; return { success: true }; },
      sendTelegramNotification: async () => { tgCount++; return { success: true }; }
    }
  });
  assert.equal(firstRes.status, 200);
  const firstBody = await firstRes.json();
  assert.equal(mockDb.data.products.prod_1.stockQuantity, 8);
  assert.equal(emailCount, 1);
  assert.equal(tgCount, 1);

  // Verify raw UUID is NOT stored anywhere in DB
  assert.equal(JSON.stringify(mockDb.data).includes(reqUuid), false, 'Raw clientRequestId must not be persisted');
  const keyHash = hashClientRequestId(reqUuid);
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'COMPLETED');

  // Verify outbox skipped_no_valid_email when email was empty
  assert.equal(
    mockDb.data.notifications_outbox[`notif_order_${firstBody.orderId}_confirmation`].status,
    'skipped_no_valid_email'
  );

  // C. Replay same clientRequestId + same logical payload (with different turnstileToken & spaced phone) -> 200 replay
  const replayRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqUuid,
      customer: { phone: '+20 101 234 5678', email: '' },
      items: [{ quantity: 2, productId: 'prod_1' }],
      turnstileToken: 'turnstile_2_fresh'
    }),
    clientAddress: '41.41.42.3',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => { emailCount++; return { success: true }; },
      sendTelegramNotification: async () => { tgCount++; return { success: true }; }
    }
  });
  assert.equal(replayRes.status, 200);
  const replayBody = await replayRes.json();
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.orderId, firstBody.orderId);
  assert.equal(replayBody.invoiceCode, firstBody.invoiceCode);
  assert.equal(replayBody.invoiceAccessToken, firstBody.invoiceAccessToken);
  assert.equal(mockDb.data.products.prod_1.stockQuantity, 8, 'Stock must NOT be deducted again on replay');
  assert.equal(emailCount, 1, 'Email must NOT be sent again on replay');
  assert.equal(tgCount, 1, 'Telegram must NOT be sent again on replay');

  // D. Reuse same clientRequestId with modified quantity -> 409 IDEMPOTENCY_CONFLICT
  const conflictRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqUuid,
      customer: { phone: '01012345678', email: '' },
      items: [{ productId: 'prod_1', quantity: 3 }]
    }),
    clientAddress: '41.41.42.3',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(conflictRes.status, 409);
  assert.equal((await conflictRes.json()).error, 'IDEMPOTENCY_CONFLICT');

  // E. Expired COMPLETED key -> 409 IDEMPOTENCY_KEY_EXPIRED
  mockDb.data.privateOrderIdempotency[keyHash].expiresAt = '2020-01-01T00:00:00.000Z';
  const expiredRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqUuid,
      customer: { phone: '01012345678', email: '' },
      items: [{ productId: 'prod_1', quantity: 2 }]
    }),
    clientAddress: '41.41.42.3',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(expiredRes.status, 409);
  assert.equal((await expiredRes.json()).error, 'IDEMPOTENCY_KEY_EXPIRED');
});

test('8. Idempotency concurrency, active PENDING 409, FAILED retry, and crash recovery before/after commit', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');

  // A. Active PENDING lock returns 409 ORDER_IN_PROGRESS with Retry-After
  const pendingUuid = crypto.randomUUID();
  const pendingHash = hashClientRequestId(pendingUuid);
  const fingerprintA = computeOrderRequestFingerprint({
    name: 'ليلى محمد',
    phone: '01012345678',
    email: 'layla@example.com',
    governorate: 'Cairo',
    city: 'مدينة نصر',
    address: 'شارع عباس العقاد',
    customerId: null,
    items: [{ productId: 'prod_1', quantity: 1 }]
  });

  const dbInProgress = createMockAdminDb({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } },
    privateOrderIdempotency: {
      [pendingHash]: {
        requestKeyHash: pendingHash,
        requestFingerprint: fingerprintA,
        status: 'PENDING',
        reservedOrderId: '-MockReserved_1',
        attemptId: 'worker_active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        leaseExpiresAt: new Date(Date.now() + 25_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    }
  });

  const inProgressRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: pendingUuid }),
    clientAddress: '41.41.43.1',
    _deps: {
      adminDb: dbInProgress,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(inProgressRes.status, 409);
  assert.equal((await inProgressRes.json()).error, 'ORDER_IN_PROGRESS');
  assert.ok(Number(inProgressRes.headers.get('retry-after')) >= 1);

  // B. Crash BEFORE atomic write -> stale PENDING lease expired & no order in orders/{reservedOrderId} -> takeover & reuse reservedOrderId
  const crashBeforeUuid = crypto.randomUUID();
  const crashBeforeHash = hashClientRequestId(crashBeforeUuid);
  const dbCrashBefore = createMockAdminDb({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } },
    privateOrderIdempotency: {
      [crashBeforeHash]: {
        requestKeyHash: crashBeforeHash,
        requestFingerprint: fingerprintA,
        status: 'PENDING',
        reservedOrderId: '-CrashedReserved_1',
        attemptId: 'dead_worker_1',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
        leaseExpiresAt: '2026-11-10T00:00:30.000Z',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    }
  });

  const recoverBeforeRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: crashBeforeUuid }),
    clientAddress: '41.41.43.2',
    _deps: {
      adminDb: dbCrashBefore,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true })
    }
  });
  assert.equal(recoverBeforeRes.status, 200);
  const recoverBeforeBody = await recoverBeforeRes.json();
  assert.equal(recoverBeforeBody.orderId, '-CrashedReserved_1', 'Must reuse reservedOrderId from stale lock');
  assert.equal(dbCrashBefore.data.privateOrderIdempotency[crashBeforeHash].status, 'COMPLETED');

  // C. Crash AFTER atomic write -> stale PENDING lease expired & orders/{reservedOrderId} EXISTS -> promote to COMPLETED and replay without duplicate order
  const crashAfterUuid = crypto.randomUUID();
  const crashAfterHash = hashClientRequestId(crashAfterUuid);
  const preArtifacts = prepareNewInvoiceAccessArtifacts('-CommittedReserved_1', hexKey);
  const dbCrashAfter = createMockAdminDb({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } },
    orders: {
      '-CommittedReserved_1': {
        invoiceCode: 'DNY-777888',
        name: 'ليلى محمد',
        phone: '01012345678',
        email: 'layla@example.com',
        governorate: 'Cairo',
        city: 'مدينة نصر',
        address: 'شارع عباس العقاد',
        subtotal: 300,
        shippingFee: 85,
        totalAmount: 385,
        status: 'New',
        timestamp: '2026-11-10T00:00:10.000Z'
      }
    },
    privateOrderAccess: { '-CommittedReserved_1': preArtifacts.orderAccessRecord },
    privateInvoiceAccess: { [preArtifacts.tokenHash]: preArtifacts.invoiceAccessRecord },
    privateOrderIdempotency: {
      [crashAfterHash]: {
        requestKeyHash: crashAfterHash,
        requestFingerprint: fingerprintA,
        status: 'PENDING',
        reservedOrderId: '-CommittedReserved_1',
        attemptId: 'crashed_after_write_worker',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
        leaseExpiresAt: '2026-11-10T00:00:30.000Z',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    }
  });

  let crashAfterEmailCalls = 0;
  const recoverAfterRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: crashAfterUuid }),
    clientAddress: '41.41.43.3',
    _deps: {
      adminDb: dbCrashAfter,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => { crashAfterEmailCalls++; return { success: true }; }
    }
  });
  assert.equal(recoverAfterRes.status, 200);
  const recoverAfterBody = await recoverAfterRes.json();
  assert.equal(recoverAfterBody.replayed, true);
  assert.equal(recoverAfterBody.orderId, '-CommittedReserved_1');
  assert.equal(recoverAfterBody.invoiceAccessToken, preArtifacts.token);
  assert.equal(Object.keys(dbCrashAfter.data.orders).length, 1);
  assert.equal(dbCrashAfter.data.privateOrderIdempotency[crashAfterHash].status, 'COMPLETED');
  assert.equal(crashAfterEmailCalls, 0);

  // D. Failed materialization AFTER entering COMMITTING keeps status COMMITTING, returns 503 (never FAILED), and recovers cleanly with same orderId/invoiceCode/token
  const retryUuid = crypto.randomUUID();
  const retryHash = hashClientRequestId(retryUuid);
  const baseRetryData = {
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } }
  };
  const failingCommitDb = createMockAdminDb(baseRetryData, { failMultiUpdate: true });

  const failedRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: retryUuid }),
    clientAddress: '41.41.43.4',
    _deps: {
      adminDb: failingCommitDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      commitLeaseMs: 1,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(failedRes.status, 503);
  assert.equal((await failedRes.json()).error, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  assert.equal(failingCommitDb.data.orders, undefined);
  assert.equal(failingCommitDb.data.privateOrderIdempotency[retryHash].status, 'COMMITTING');
  const reservedOnFail = failingCommitDb.data.privateOrderIdempotency[retryHash].reservedOrderId;
  const sealedInvoiceCode = failingCommitDb.data.privateOrderIdempotency[retryHash].commitPayload.invoiceCode;
  await new Promise((r) => setTimeout(r, 10));

  // Retry on healed DB with SAME clientRequestId recovers COMMITTING using exact same reservedOrderId & invoiceCode
  const healedDb = createMockAdminDb(failingCommitDb.data);
  const retryOkRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: retryUuid }),
    clientAddress: '41.41.43.4',
    _deps: {
      adminDb: healedDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true })
    }
  });
  assert.equal(retryOkRes.status, 200);
  const retryOkBody = await retryOkRes.json();
  assert.equal(retryOkBody.orderId, reservedOnFail);
  assert.equal(retryOkBody.invoiceCode, sealedInvoiceCode);
  assert.equal(healedDb.data.privateOrderIdempotency[retryHash].status, 'COMPLETED');
  assert.equal(healedDb.data.privateOrderIdempotency[retryHash].commitPayload, undefined);

  // E. Stale worker error MUST NOT downgrade COMPLETED to FAILED
  await reconcileIdempotencyAfterFailure({
    lock: {
      requestKeyHash: retryHash,
      requestFingerprint: fingerprintA,
      reservedOrderId: reservedOnFail,
      attemptId: 'stale_old_worker_id',
      leaseExpiresAtMs: Date.now() - 1000,
      expiresAtMs: Date.now() + 86_400_000,
      createdAt: new Date().toISOString()
    },
    adminDb: healedDb,
    errorCode: 'STALE_FAILURE'
  });
  assert.equal(healedDb.data.privateOrderIdempotency[retryHash].status, 'COMPLETED');

  // F. Lease takeover race before atomic commit blocks late original worker
  const raceUuid = crypto.randomUUID();
  const raceHash = hashClientRequestId(raceUuid);
  const raceDb = createMockAdminDb({
    products: { prod_1: { name: 'سيروم', price: 300, stockQuantity: 5 } }
  });

  const lateWorkerRes = await createOrderPOST({
    request: makeOrderRequest({ clientRequestId: raceUuid }),
    clientAddress: '41.41.43.5',
    _deps: {
      adminDb: raceDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      beforeAtomicCommit: async ({ idempotencyLock }) => {
        // Simulate another worker taking over after lease expiry
        raceDb.data.privateOrderIdempotency[idempotencyLock.requestKeyHash].attemptId = 'newer_worker_attempt';
      }
    }
  });
  assert.equal(lateWorkerRes.status, 409);
  assert.equal((await lateWorkerRes.json()).error, 'ORDER_IN_PROGRESS');
  assert.equal(raceDb.data.orders, undefined);
  assert.equal(raceDb.data.privateOrderIdempotency[raceHash].attemptId, 'newer_worker_attempt');

  // G. Direct acquireOrderIdempotencyLock concurrency: only 1 of 2 parallel callers acquires PENDING; other gets IN_PROGRESS
  const concurrentUuid = crypto.randomUUID();
  const concDb = createMockAdminDb({});
  const [acq1, acq2] = await Promise.all([
    acquireOrderIdempotencyLock({
      clientRequestId: concurrentUuid,
      requestFingerprint: fingerprintA,
      adminDb: concDb
    }),
    acquireOrderIdempotencyLock({
      clientRequestId: concurrentUuid,
      requestFingerprint: fingerprintA,
      adminDb: concDb
    })
  ]);
  const outcomes = [acq1.outcome, acq2.outcome].sort();
  assert.deepEqual(outcomes, ['ACQUIRED', 'IN_PROGRESS']);
});
