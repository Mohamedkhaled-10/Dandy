// test/group4b1-pre-rules-security.test.mjs
// Group 4B.1: Pre-Rules Backend Security Remediation Test Suite
// Covers Reviews Protection, Verified-Email Order Linking, Unified Admin Auth,
// Pink Friday Server-Only Read & Metadata Stripping, and Protected Order Deletion.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { POST as submitReviewPOST, ALL as submitReviewALL } from '../src/pages/api/submit-review.js';
import { POST as linkOrdersPOST, ALL as linkOrdersALL } from '../src/pages/api/link-customer-orders.js';
import { POST as deleteOrderPOST, ALL as deleteOrderALL } from '../src/pages/api/admin/delete-order.js';
import { POST as orderStatusPOST, GET as orderStatusGET } from '../src/pages/api/order-status.js';
import { GET as pinkFridayAdminGET, POST as pinkFridayAdminPOST } from '../src/pages/api/pink-friday/admin.js';
import { POST as telegramTestPOST } from '../src/pages/api/admin/telegram-test.js';
import { POST as publicInvoicePOST } from '../src/pages/api/public-invoice.js';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import {
  verifyAdminRequest,
  extractBearerToken,
  isVerifiedAdminClaims
} from '../src/utils/admin-auth.js';
import {
  getPublishedPinkFridayCampaign,
  sanitizePublishedPinkFridayCampaign,
  resetPinkFridayCampaignCacheForTests,
  INITIAL_2026_CAMPAIGN,
  calculatePinkFridayPricing
} from '../src/utils/pink-friday-server.ts';
import {
  hashClientRequestId,
  materializeCommitPayload
} from '../src/utils/order-idempotency.ts';
import {
  encryptInvoiceToken,
  hashInvoiceToken,
  generateSecureInvoiceToken
} from '../src/utils/invoice-token.ts';
import { claimOutboxNotification } from '../src/utils/notifications-outbox.ts';

function createAsyncRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();

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
        const val = getAtPath(path);
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
                const container = getAtPath(path);
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
        setAtPath(path, val);
      },
      async update(updates) {
        await tick();
        if (options.failRootUpdate && !path) {
          throw new Error('Simulated atomic root update failure');
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
        const k = `-Mock_${crypto.randomUUID().slice(0, 8)}`;
        return makeRef(path ? `${path}/${k}` : k);
      },
      async transaction(updater) {
        let attempts = 0;
        while (attempts < 15) {
          attempts++;
          const startVer = getVersion(path);
          const current = getAtPath(path);
          const clonedCurrent =
            current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));

          const nextVal = updater(clonedCurrent);
          await tick();

          if (typeof options.onTransactionAttempt === 'function') {
            await options.onTransactionAttempt({ path, attempts, startVer });
          }

          if (getVersion(path) !== startVer) {
            continue;
          }

          if (nextVal !== undefined) {
            setAtPath(path, nextVal);
          }
          const finalVal = getAtPath(path);
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
    ref: (path = '') => makeRef(path)
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

// ===========================================================================
// 1. REVIEWS SECURITY (/api/submit-review)
// ===========================================================================
test('1A. Submit Review enforces token, ownership, delivered status, product membership, integer rating & trusted name', async () => {
  const adminAuth = createMockAdminAuth({
    'tok-cust-1': { uid: 'uid_cust_1', email: 'sara@example.com', email_verified: false, name: 'Token Sara' },
    'tok-cust-2': { uid: 'uid_cust_2', email: 'other@example.com', email_verified: true }
  });

  const mockDb = createAsyncRtdbMock({
    customers: {
      uid_cust_1: { name: 'سارة أحمد', email: 'sara@example.com' }
    },
    products: {
      prod_serum: { id: 'prod_serum', name: 'سيروم النضارة', price: 350 },
      prod_col_item: { id: 'prod_col_item', name: 'غسول لطيف', price: 200 },
      prod_unpurchased: { id: 'prod_unpurchased', name: 'كريم غير مشترى', price: 400 }
    },
    orders: {
      ord_delivered_1: {
        customerId: 'uid_cust_1',
        invoiceCode: 'DNY-777111',
        status: 'تم التوصيل',
        name: 'سارة طلب',
        products: [
          { id: 'prod_serum::var_1', name: 'سيروم النضارة', quantity: 1 },
          {
            id: 'col_bundle_1',
            isCollection: true,
            items: [{ productId: 'prod_col_item', name: 'غسول لطيف' }]
          }
        ]
      },
      ord_new_1: {
        customerId: 'uid_cust_1',
        invoiceCode: 'DNY-777222',
        status: 'جديد',
        products: [{ id: 'prod_serum', quantity: 1 }]
      },
      ord_proc_1: {
        customerId: 'uid_cust_1',
        invoiceCode: 'DNY-777333',
        status: 'قيد التجهيز',
        products: [{ id: 'prod_serum', quantity: 1 }]
      },
      ord_ship_1: {
        customerId: 'uid_cust_1',
        invoiceCode: 'DNY-777444',
        status: 'تم الشحن',
        products: [{ id: 'prod_serum', quantity: 1 }]
      },
      ord_cancel_1: {
        customerId: 'uid_cust_1',
        invoiceCode: 'DNY-777555',
        status: 'ملغي',
        products: [{ id: 'prod_serum', quantity: 1 }]
      },
      ord_other_user: {
        customerId: 'uid_cust_2',
        invoiceCode: 'DNY-888999',
        status: 'مكتمل',
        products: [{ id: 'prod_serum', quantity: 1 }]
      }
    }
  });

  // Unauthenticated / invalid token -> 401
  const noTok = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', { productId: 'prod_serum', rating: 5, orderId: 'ord_delivered_1' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(noTok.status, 401);

  const badTok = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'bad-tok', productId: 'prod_serum', rating: 5, orderId: 'ord_delivered_1' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(badTok.status, 401);

  // Order owned by another user -> 403
  const wrongOwner = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-cust-1', productId: 'prod_serum', rating: 5, orderId: 'ord_other_user' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(wrongOwner.status, 403);
  assert.equal((await wrongOwner.json()).error, 'ORDER_OWNERSHIP_REQUIRED');

  // Missing order -> 404
  const missingOrd = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-cust-1', productId: 'prod_serum', rating: 5, orderId: 'ord_does_not_exist' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(missingOrd.status, 404);

  // Undelivered statuses -> 403 ORDER_NOT_DELIVERED
  for (const undeliveredId of ['ord_new_1', 'ord_proc_1', 'ord_ship_1', 'ord_cancel_1']) {
    const res = await submitReviewPOST({
      request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-cust-1', productId: 'prod_serum', rating: 5, orderId: undeliveredId }),
      _deps: { adminAuth, adminDb: mockDb }
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'ORDER_NOT_DELIVERED');
  }

  // Product NOT in order -> 403 PRODUCT_NOT_IN_ORDER
  const wrongProd = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-cust-1', productId: 'prod_unpurchased', rating: 5, orderId: 'ord_delivered_1' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(wrongProd.status, 403);
  assert.equal((await wrongProd.json()).error, 'PRODUCT_NOT_IN_ORDER');

  // Invalid ratings (0, 6, 3.5) -> 400 INVALID_RATING
  for (const badRating of [0, 6, 3.5, 'bad']) {
    const res = await submitReviewPOST({
      request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-cust-1', productId: 'prod_serum', rating: badRating, orderId: 'ord_delivered_1' }),
      _deps: { adminAuth, adminDb: mockDb }
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'INVALID_RATING');
  }

  // Valid review via order.id + untrusted client customerName MUST be ignored in favor of DB customers/{uid}/name
  const okRes = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', {
      idToken: 'tok-cust-1',
      productId: 'prod_serum',
      rating: 4,
      comment: 'ممتاز جدا',
      customerName: 'FAKE SPOOFED ADMIN NAME',
      orderId: 'ord_delivered_1'
    }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json();
  assert.equal(okBody.data.review.customerName, 'سارة أحمد');
  assert.equal(okBody.data.review.orderId, 'ord_delivered_1');
  assert.equal(okBody.data.avgRating, 4);
  assert.equal(okBody.data.reviewCount, 1);

  // Duplicate/edit review by same user -> updates existing review, reviewCount stays 1!
  const editRes = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', {
      idToken: 'tok-cust-1',
      productId: 'prod_serum',
      rating: 5,
      comment: 'تحديث التقييم',
      orderId: 'ord_delivered_1'
    }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(editRes.status, 200);
  const editBody = await editRes.json();
  assert.equal(editBody.data.reviewCount, 1);
  assert.equal(editBody.data.avgRating, 5);

  // Backward compatibility: legacy DNY-* invoiceCode resolves owned delivered order & supports collection item
  const legacyRes = await submitReviewPOST({
    request: makeJsonReq('http://localhost/api/submit-review', {
      idToken: 'tok-cust-1',
      productId: 'prod_col_item',
      rating: 5,
      orderId: 'DNY-777111'
    }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(legacyRes.status, 200);
  assert.equal(mockDb.data.reviews.prod_col_item.uid_cust_1.orderId, 'ord_delivered_1');

  // Non-POST rejected
  const getRes = await submitReviewALL();
  assert.equal(getRes.status, 405);
});

test('1B. Concurrent reviews converge accurately on exact avgRating and reviewCount', async () => {
  const adminAuth = createMockAdminAuth({
    'tok-u1': { uid: 'u1', email: 'u1@example.com' },
    'tok-u2': { uid: 'u2', email: 'u2@example.com' },
    'tok-u3': { uid: 'u3', email: 'u3@example.com' }
  });

  const mockDb = createAsyncRtdbMock(
    {
      customers: { u1: { name: 'U1' }, u2: { name: 'U2' }, u3: { name: 'U3' } },
      products: { prod_1: { name: 'Product 1', price: 100 } },
      orders: {
        o1: { customerId: 'u1', status: 'تم التوصيل', products: [{ id: 'prod_1', quantity: 1 }] },
        o2: { customerId: 'u2', status: 'delivered', products: [{ id: 'prod_1', quantity: 1 }] },
        o3: { customerId: 'u3', status: 'مكتمل', products: [{ id: 'prod_1', quantity: 1 }] }
      }
    },
    { ioDelayMs: 3 }
  );

  const [r1, r2, r3] = await Promise.all([
    submitReviewPOST({
      request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-u1', productId: 'prod_1', rating: 5, orderId: 'o1' }),
      _deps: { adminAuth, adminDb: mockDb }
    }),
    submitReviewPOST({
      request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-u2', productId: 'prod_1', rating: 4, orderId: 'o2' }),
      _deps: { adminAuth, adminDb: mockDb }
    }),
    submitReviewPOST({
      request: makeJsonReq('http://localhost/api/submit-review', { idToken: 'tok-u3', productId: 'prod_1', rating: 3, orderId: 'o3' }),
      _deps: { adminAuth, adminDb: mockDb }
    })
  ]);

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 200);

  // After concurrent convergence, DB must reflect all 3 reviews & exact average (5+4+3)/3 = 4
  assert.equal(Object.keys(mockDb.data.reviews.prod_1).length, 3);
  assert.equal(mockDb.data.products.prod_1.reviewCount, 3);
  assert.equal(mockDb.data.products.prod_1.avgRating, 4);
});

// ===========================================================================
// 2. SECURE GUEST ORDER LINKING (/api/link-customer-orders)
// ===========================================================================
test('2A. Link Customer Orders requires email_verified=true, ignores phone & body spoofing, never overwrites existing owner', async () => {
  const adminAuth = createMockAdminAuth({
    'tok-verified': { uid: 'uid_v', email: '  Nora.Ali@Example.com ', email_verified: true },
    'tok-unverified': { uid: 'uid_unv', email: 'nora.ali@example.com', email_verified: false },
    'tok-other': { uid: 'uid_other', email: 'other@example.com', email_verified: true }
  });

  const mockDb = createAsyncRtdbMock({
    orders: {
      ord_guest_match_lower: { email: 'nora.ali@example.com', phone: '01099999999', totalAmount: 300 },
      ord_guest_match_case: { email: 'Nora.Ali@Example.com', phone: '01088888888', totalAmount: 400 },
      ord_phone_match_diff_email: { email: 'victim@example.com', phone: '01011112222', totalAmount: 500 },
      ord_no_email: { email: 'N/A', phone: '01011112222', totalAmount: 250 },
      ord_already_owned_other: { email: 'nora.ali@example.com', customerId: 'uid_original_owner', totalAmount: 600 },
      ord_already_mine: { email: 'nora.ali@example.com', customerId: 'uid_v', totalAmount: 150 }
    }
  });

  // 1. Unverified email -> 403 EMAIL_VERIFICATION_REQUIRED, zero mutations
  const unvRes = await linkOrdersPOST({
    request: makeJsonReq('http://localhost/api/link-customer-orders', { idToken: 'tok-unverified', phone: '01011112222' }),
    _deps: { adminAuth, adminDb: mockDb, skipRateLimit: true }
  });
  assert.equal(unvRes.status, 403);
  assert.equal((await unvRes.json()).error, 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(mockDb.data.orders.ord_guest_match_lower.customerId, undefined);

  // 2. Verified email: ignores spoofed uid/email/phone in body, links ONLY unclaimed matching email orders
  const verRes = await linkOrdersPOST({
    request: makeJsonReq('http://localhost/api/link-customer-orders', {
      idToken: 'tok-verified',
      uid: 'spoofed_uid',
      email: 'victim@example.com',
      phone: '01011112222'
    }),
    _deps: { adminAuth, adminDb: mockDb, skipRateLimit: true }
  });
  assert.equal(verRes.status, 200);
  const verBody = await verRes.json();
  assert.equal(verBody.success, true);
  assert.equal(verBody.linkedCount, 2);

  assert.equal(mockDb.data.orders.ord_guest_match_lower.customerId, 'uid_v');
  assert.equal(mockDb.data.orders.ord_guest_match_lower.linkedByMethod, 'verified_email');
  assert.equal(mockDb.data.orders.ord_guest_match_case.customerId, 'uid_v');

  // Phone-matched different email and N/A email MUST NOT be linked
  assert.equal(mockDb.data.orders.ord_phone_match_diff_email.customerId, undefined);
  assert.equal(mockDb.data.orders.ord_no_email.customerId, undefined);

  // Existing owner MUST NOT be overwritten
  assert.equal(mockDb.data.orders.ord_already_owned_other.customerId, 'uid_original_owner');

  // 3. Idempotent retry returns linkedCount: 0 cleanly
  const retryRes = await linkOrdersPOST({
    request: makeJsonReq('http://localhost/api/link-customer-orders', { idToken: 'tok-verified' }),
    _deps: { adminAuth, adminDb: mockDb, skipRateLimit: true }
  });
  assert.equal(retryRes.status, 200);
  assert.equal((await retryRes.json()).linkedCount, 0);

  // 4. Non-POST rejected
  const methodRes = await linkOrdersALL();
  assert.equal(methodRes.status, 405);
});

test('2B. Concurrent link race across two verified sessions lets at most one owner win atomically', async () => {
  const adminAuth = createMockAdminAuth({
    'tok-a': { uid: 'uid_a', email: 'shared@example.com', email_verified: true },
    'tok-b': { uid: 'uid_b', email: 'shared@example.com', email_verified: true }
  });

  const mockDb = createAsyncRtdbMock(
    {
      orders: {
        ord_race: { email: 'shared@example.com', totalAmount: 999 }
      }
    },
    { ioDelayMs: 3 }
  );

  const [resA, resB] = await Promise.all([
    linkOrdersPOST({
      request: makeJsonReq('http://localhost/api/link-customer-orders', { idToken: 'tok-a' }),
      _deps: { adminAuth, adminDb: mockDb, skipRateLimit: true }
    }),
    linkOrdersPOST({
      request: makeJsonReq('http://localhost/api/link-customer-orders', { idToken: 'tok-b' }),
      _deps: { adminAuth, adminDb: mockDb, skipRateLimit: true }
    })
  ]);

  const bodyA = await resA.json();
  const bodyB = await resB.json();
  assert.equal(bodyA.linkedCount + bodyB.linkedCount, 1);
  assert.ok(['uid_a', 'uid_b'].includes(mockDb.data.orders.ord_race.customerId));
});

// ===========================================================================
// 3. UNIFIED ADMIN AUTHORIZATION
// ===========================================================================
test('3. Unified Admin Auth enforces admin@dandy.com + email_verified=true across all admin endpoints', async () => {
  const adminAuth = createMockAdminAuth({
    'tok-admin-verified': { uid: 'admin_1', email: 'admin@dandy.com', email_verified: true },
    'tok-admin-unverified': { uid: 'admin_2', email: 'admin@dandy.com', email_verified: false },
    'tok-customer-verified': { uid: 'cust_1', email: 'customer@example.com', email_verified: true }
  });

  const mockDb = createAsyncRtdbMock({
    orders: {
      ord_1: {
        invoiceCode: 'DNY-101010',
        status: 'جديد',
        name: 'عميلة',
        phone: '01012345678',
        email: 'N/A',
        totalAmount: 200,
        products: [{ name: 'كريم', quantity: 1, price: 200, lineTotal: 200 }]
      }
    },
    settings: {
      pinkFriday: {
        draftCampaign: INITIAL_2026_CAMPAIGN,
        publishedActiveCampaign: INITIAL_2026_CAMPAIGN
      }
    }
  });

  // Helper unit checks
  assert.equal(extractBearerToken(new Request('http://localhost', { headers: { Authorization: 'Bearer abcdef123456' } })), 'abcdef123456');
  assert.equal(extractBearerToken(new Request('http://localhost', { headers: { Authorization: 'Basic abc' } })), null);
  assert.equal(isVerifiedAdminClaims({ email: 'admin@dandy.com', email_verified: true }), true);
  assert.equal(isVerifiedAdminClaims({ email: 'admin@dandy.com', email_verified: false }), false);
  assert.equal(isVerifiedAdminClaims({ email: 'user@dandy.com', email_verified: true }), false);

  const authUnv = await verifyAdminRequest(
    new Request('http://localhost', { headers: { Authorization: 'Bearer tok-admin-unverified' } }),
    { adminAuth }
  );
  assert.equal(authUnv.authorized, false);
  assert.equal(authUnv.status, 403);

  // Test across order-status (POST/GET), pink-friday/admin (GET/POST), telegram-test (POST), delete-order (POST)
  const endpoints = [
    {
      name: 'order-status POST',
      call: (hdrs, extraBody = {}) =>
        orderStatusPOST({
          request: makeJsonReq('http://localhost/api/order-status', { action: 'UPDATE_STATUS', orderId: 'ord_1', newStatus: 'قيد التجهيز', ...extraBody }, hdrs),
          _deps: { adminAuth, adminDb: mockDb }
        })
    },
    {
      name: 'order-status GET',
      call: (hdrs) =>
        orderStatusGET({
          request: makeJsonReq('http://localhost/api/order-status?orderId=ord_1', null, hdrs, 'GET'),
          _deps: { adminAuth, adminDb: mockDb }
        })
    },
    {
      name: 'pink-friday/admin GET',
      call: (hdrs) =>
        pinkFridayAdminGET({
          request: makeJsonReq('http://localhost/api/pink-friday/admin', null, hdrs, 'GET'),
          _deps: { adminAuth, adminDb: mockDb }
        })
    },
    {
      name: 'pink-friday/admin POST',
      call: (hdrs, extraBody = {}) =>
        pinkFridayAdminPOST({
          request: makeJsonReq('http://localhost/api/pink-friday/admin', { action: 'SAVE_DRAFT', data: INITIAL_2026_CAMPAIGN, ...extraBody }, hdrs),
          _deps: { adminAuth, adminDb: mockDb }
        })
    },
    {
      name: 'telegram-test POST',
      call: (hdrs, extraBody = {}) =>
        telegramTestPOST({
          request: makeJsonReq('http://localhost/api/admin/telegram-test', { ...extraBody }, hdrs),
          _deps: { adminAuth }
        })
    },
    {
      name: 'delete-order POST',
      call: (hdrs, extraBody = {}) =>
        deleteOrderPOST({
          request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId: 'ord_1', ...extraBody }, hdrs),
          _deps: { adminAuth, adminDb: mockDb }
        })
    }
  ];

  for (const ep of endpoints) {
    // Missing token -> 401
    const noTok = await ep.call({});
    assert.equal(noTok.status, 401, `${ep.name} must return 401 without token`);

    // Invalid/expired token -> 401
    const badTok = await ep.call({ Authorization: 'Bearer expired_token_xyz' });
    assert.equal(badTok.status, 401, `${ep.name} must return 401 on invalid token`);

    // Unverified admin@dandy.com -> 403
    const unvAdmin = await ep.call({ Authorization: 'Bearer tok-admin-unverified' });
    assert.equal(unvAdmin.status, 403, `${ep.name} must return 403 when admin email_verified=false`);

    // Customer token + spoofed email in body -> 403
    const custSpoof = await ep.call({ Authorization: 'Bearer tok-customer-verified' }, { email: 'admin@dandy.com', role: 'admin' });
    assert.equal(custSpoof.status, 403, `${ep.name} must return 403 for non-admin even with spoofed body`);
  }

  // Verified admin succeeds on GET pink-friday/admin and POST order-status
  const pfOk = await pinkFridayAdminGET({
    request: makeJsonReq('http://localhost/api/pink-friday/admin', null, { Authorization: 'Bearer tok-admin-verified' }, 'GET'),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(pfOk.status, 200);

  const osOk = await orderStatusPOST({
    request: makeJsonReq('http://localhost/api/order-status', { action: 'UPDATE_STATUS', orderId: 'ord_1', newStatus: 'قيد التجهيز' }, { Authorization: 'Bearer tok-admin-verified' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(osOk.status, 200);
});

// ===========================================================================
// 4. PINK FRIDAY SERVER-ONLY READ & METADATA STRIPPING
// ===========================================================================
test('4. Pink Friday reads exclusively via Admin SDK, strips internal metadata, preserves pricing & fallback', async () => {
  resetPinkFridayCampaignCacheForTests();

  const origFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('Unauthenticated REST fetch must NEVER be called');
  };

  try {
    const mockDb = createAsyncRtdbMock({
      settings: {
        pinkFriday: {
          publishedActiveCampaign: {
            id: 'pink-friday-2026',
            year: 2026,
            title: 'Pink Friday 2026',
            subtitleAr: 'عروض خاصة',
            timezone: 'Africa/Cairo',
            startAt: '2026-11-01T00:00:00+02:00',
            endAt: '2026-11-30T23:59:59+02:00',
            enabled: true,
            draft: { secretUnpublishedChange: true },
            meta: { internalNote: 'top-secret' },
            updatedBy: 'admin@dandy.com',
            publishedBy: 'admin@dandy.com',
            updatedAt: '2026-11-05T10:00:00Z',
            publishedAt: '2026-11-05T10:05:00Z',
            offers: [
              { productId: 'prod_pf_1', expectedBasePrice: 500, discountPercentage: 20, campaignPrice: 400, active: true }
            ],
            collections: [
              {
                id: 'col_1',
                name: 'مجموعة العناية',
                allowDuplicates: false,
                pricingType: 'package',
                packagePrice: 650,
                active: true,
                items: [{ collectionItemId: 'ci_1', productId: 'prod_pf_1' }]
              }
            ],
            visuals: { bannerImage: 'https://example.com/banner.jpg', bannerPosition: 'center', ctaText: 'تسوقي', badgeText: 'PF' }
          }
        }
      }
    });

    const campaign = await getPublishedPinkFridayCampaign(true, { adminDb: mockDb });
    assert.equal(fetchCalled, false, 'Must NEVER use unauthenticated REST fetch');
    assert.equal(campaign.id, 'pink-friday-2026');
    assert.equal(campaign.offers.length, 1);
    assert.equal(campaign.collections.length, 1);

    // Stripped internal metadata fields
    assert.equal(campaign.draft, undefined);
    assert.equal(campaign.meta, undefined);
    assert.equal(campaign.updatedBy, undefined);
    assert.equal(campaign.publishedBy, undefined);
    assert.equal(campaign.updatedAt, undefined);
    assert.equal(campaign.publishedAt, undefined);

    // Pricing engine still works cleanly on sanitized campaign
    const pricing = calculatePinkFridayPricing(
      { id: 'prod_pf_1', price: 500, isHidden: false, isSoldOut: false },
      campaign,
      new Date('2026-11-10T12:00:00+02:00')
    );
    assert.equal(pricing.isEligible, true);
    assert.equal(pricing.campaignPrice, 400);

    // Fallback works cleanly when DB has no campaign
    const emptyDb = createAsyncRtdbMock({});
    const fallback = await getPublishedPinkFridayCampaign(true, { adminDb: emptyDb });
    assert.equal(fallback.id, INITIAL_2026_CAMPAIGN.id);
    assert.equal(sanitizePublishedPinkFridayCampaign(null).id, INITIAL_2026_CAMPAIGN.id);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ===========================================================================
// 5. PROTECTED ORDER DELETION (/api/admin/delete-order)
// ===========================================================================
test('5A. Delete Order rejects invalid inputs, missing order, PENDING/COMMITTING, and rolls back locks cleanly on failure', async () => {
  const adminAuth = createMockAdminAuth({
    'tok-admin-verified-123': { uid: 'admin_1', email: 'admin@dandy.com', email_verified: true }
  });

  const reqUuidPending = crypto.randomUUID();
  const reqHashPending = hashClientRequestId(reqUuidPending);
  const reqUuidCommitting = crypto.randomUUID();
  const reqHashCommitting = hashClientRequestId(reqUuidCommitting);
  const reqUuidCompleted = crypto.randomUUID();
  const reqHashCompleted = hashClientRequestId(reqUuidCompleted);

  const mockDb = createAsyncRtdbMock({
    orders: {
      ord_pending: { invoiceCode: 'DNY-111', status: 'جديد', totalAmount: 100 },
      ord_committing: { invoiceCode: 'DNY-222', status: 'جديد', totalAmount: 200 },
      ord_completed_fail: { invoiceCode: 'DNY-333', status: 'جديد', totalAmount: 300 }
    },
    privateOrderIdempotency: {
      [reqHashPending]: {
        requestKeyHash: reqHashPending,
        requestFingerprint: 'fp_p',
        status: 'PENDING',
        reservedOrderId: 'ord_pending',
        attemptId: 'att_p'
      },
      [reqHashCommitting]: {
        requestKeyHash: reqHashCommitting,
        requestFingerprint: 'fp_c',
        status: 'COMMITTING',
        reservedOrderId: 'ord_committing',
        attemptId: 'att_c'
      },
      [reqHashCompleted]: {
        requestKeyHash: reqHashCompleted,
        requestFingerprint: 'fp_ok',
        status: 'COMPLETED',
        reservedOrderId: 'ord_completed_fail',
        attemptId: 'att_ok',
        responseSummary: { orderId: 'ord_completed_fail', invoiceCode: 'DNY-333', totalAmount: 300 }
      }
    }
  });

  // Method check -> 405
  assert.equal((await deleteOrderALL()).status, 405);

  // Content-Type check -> 415
  const badCt = await deleteOrderPOST({
    request: new Request('http://localhost/api/admin/delete-order', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: 'Bearer tok-admin-verified-123' },
      body: '{}'
    }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(badCt.status, 415);

  // Invalid JSON -> 400
  const badJson = await deleteOrderPOST({
    request: new Request('http://localhost/api/admin/delete-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-admin-verified-123' },
      body: '{bad'
    }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(badJson.status, 400);

  // Invalid orderId -> 400
  const badId = await deleteOrderPOST({
    request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId: 'ord/bad.path' }, { Authorization: 'Bearer tok-admin-verified-123' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(badId.status, 400);

  // Missing order -> 404 (and lock rolled back)
  const notFound = await deleteOrderPOST({
    request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId: 'ord_nonexistent' }, { Authorization: 'Bearer tok-admin-verified-123' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(notFound.status, 404);
  assert.equal(mockDb.data.privateDeletedOrders?.ord_nonexistent, undefined);

  // PENDING order -> 409 and order untouched
  const pendingRes = await deleteOrderPOST({
    request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId: 'ord_pending' }, { Authorization: 'Bearer tok-admin-verified-123' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(pendingRes.status, 409);
  assert.equal((await pendingRes.json()).error, 'ORDER_IN_FLIGHT_OR_COMMITTING');
  assert.ok(mockDb.data.orders.ord_pending);
  assert.equal(mockDb.data.privateDeletedOrders?.ord_pending, undefined);

  // COMMITTING order -> 409 and order untouched
  const committingRes = await deleteOrderPOST({
    request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId: 'ord_committing' }, { Authorization: 'Bearer tok-admin-verified-123' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(committingRes.status, 409);
  assert.equal((await committingRes.json()).error, 'ORDER_IN_FLIGHT_OR_COMMITTING');
  assert.ok(mockDb.data.orders.ord_committing);

  // Root atomic update failure -> 500, full lock rollback, zero partial delete!
  const failingDb = createAsyncRtdbMock(JSON.parse(JSON.stringify(mockDb.data)), { failRootUpdate: true });
  const failRes = await deleteOrderPOST({
    request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId: 'ord_completed_fail' }, { Authorization: 'Bearer tok-admin-verified-123' }),
    _deps: { adminAuth, adminDb: failingDb }
  });
  assert.equal(failRes.status, 500);
  assert.ok(failingDb.data.orders.ord_completed_fail, 'Order MUST remain intact if root update fails');
  assert.equal(failingDb.data.privateDeletedOrders?.ord_completed_fail, undefined, 'Deletion lock MUST roll back');
  assert.equal(failingDb.data.privateOrderIdempotency[reqHashCompleted].status, 'COMPLETED', 'Idempotency record MUST roll back to COMPLETED');
});

test('5B. Deleting COMPLETED order revokes invoice tokens, cleans/retains outbox properly, blocks retry, blocks replay & recovery', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const adminAuth = createMockAdminAuth({
    'tok-admin-verified-123': { uid: 'admin_1', email: 'admin@dandy.com', email_verified: true }
  });

  // First create a real order through createOrderPOST so we test end-to-end compatibility!
  const reqUuid = crypto.randomUUID();
  const keyHash = hashClientRequestId(reqUuid);
  const orderBody = {
    clientRequestId: reqUuid,
    customer: {
      name: 'سلمى حسام',
      phone: '01022334455',
      email: 'salma@example.com',
      governorate: 'Cairo',
      city: 'مدينة نصر',
      address: 'شارع عباس العقاد'
    },
    items: [{ productId: 'prod_1', quantity: 1 }],
    turnstileToken: 'mock_turnstile_ok'
  };

  const mockDb = createAsyncRtdbMock({
    products: {
      prod_1: { id: 'prod_1', name: 'كريم ترطيب', price: 300, stockQuantity: 5, isHidden: false, isSoldOut: false }
    }
  });

  const createRes = await createOrderPOST({
    request: makeJsonReq('http://localhost/api/create-order', orderBody),
    clientAddress: '41.41.10.20',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: false, status: 'failed' }),
      sendTelegramNotification: async () => ({ success: true, status: 'sent' }),
      sendMakeOrderWebhook: async () => ({ success: true })
    }
  });
  assert.equal(createRes.status, 200);
  const created = await createRes.json();
  const orderId = created.orderId;
  const invoiceAccessToken = created.invoiceAccessToken;
  const tokenHash = hashInvoiceToken(invoiceAccessToken);

  // Seed a mix of outbox states: one failed (unsent -> cancelled), one accepted_by_mailapp (sent -> minimal non-PII audit), one unknown
  mockDb.data.notifications_outbox[`notif_order_${orderId}_unsent`] = {
    notificationId: `notif_order_${orderId}_unsent`,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    status: 'failed',
    recipientEmail: 'salma@example.com',
    payload: { customerName: 'سلمى حسام', phone: '01022334455' },
    attempts: 1,
    createdAt: new Date().toISOString()
  };
  mockDb.data.notifications_outbox[`notif_order_${orderId}_sent`] = {
    notificationId: `notif_order_${orderId}_sent`,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    status: 'accepted_by_mailapp',
    recipientEmail: 'salma@example.com',
    attempts: 1,
    createdAt: new Date().toISOString()
  };
  mockDb.data.notifications_outbox[`notif_order_${orderId}_unknown`] = {
    notificationId: `notif_order_${orderId}_unknown`,
    orderId,
    channel: 'make',
    eventType: 'MAKE_ORDER_WEBHOOK',
    status: 'unknown',
    payload: { email: 'salma@example.com' },
    attempts: 1,
    createdAt: new Date().toISOString()
  };

  // Sanity check: public-invoice works BEFORE deletion
  const preInvRes = await publicInvoicePOST({
    request: makeJsonReq('http://localhost/api/public-invoice', { access: invoiceAccessToken }),
    clientAddress: '41.41.10.21',
    _deps: { adminDb: mockDb, skipRateLimit: true }
  });
  assert.equal(preInvRes.status, 200);

  // Execute protected deletion
  const delRes = await deleteOrderPOST({
    request: makeJsonReq('http://localhost/api/admin/delete-order', { orderId }, { Authorization: 'Bearer tok-admin-verified-123' }),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(delRes.status, 200);
  const delBody = await delRes.json();
  assert.equal(delBody.success, true);

  // 1. Order removed
  assert.equal(mockDb.data.orders?.[orderId], undefined);

  // 2. privateOrderAccess & privateInvoiceAccess revoked with no tokens retained
  assert.equal(mockDb.data.privateOrderAccess[orderId].status, 'revoked');
  assert.equal(mockDb.data.privateOrderAccess[orderId].encryptedToken, undefined);
  assert.equal(mockDb.data.privateOrderAccess[orderId].token, undefined);
  assert.equal(mockDb.data.privateInvoiceAccess[tokenHash].status, 'revoked');

  // 3. public-invoice returns 404 after deletion
  const postInvRes = await publicInvoicePOST({
    request: makeJsonReq('http://localhost/api/public-invoice', { access: invoiceAccessToken }),
    clientAddress: '41.41.10.22',
    _deps: { adminDb: mockDb, skipRateLimit: true }
  });
  assert.equal(postInvRes.status, 404);

  // 4. Outbox unsent cancelled & PII stripped; sent/unknown keep minimal non-PII audit
  const unsentOut = mockDb.data.notifications_outbox[`notif_order_${orderId}_unsent`];
  assert.equal(unsentOut.status, 'cancelled_order_deleted');
  assert.equal(unsentOut.recipientEmail, undefined);
  assert.equal(unsentOut.payload, undefined);

  const sentOut = mockDb.data.notifications_outbox[`notif_order_${orderId}_sent`];
  assert.equal(sentOut.status, 'accepted_by_mailapp');
  assert.equal(sentOut.recipientEmail, undefined);
  assert.ok(sentOut.orderDeletedAt);

  const unkOut = mockDb.data.notifications_outbox[`notif_order_${orderId}_unknown`];
  assert.equal(unkOut.status, 'unknown');
  assert.equal(unkOut.payload, undefined);

  // 5. Outbox claim rejects cancelled_order_deleted
  const claimCancelled = await claimOutboxNotification({
    adminDb: mockDb,
    notificationId: `notif_order_${orderId}_unsent`,
    orderId,
    channel: 'email',
    eventType: 'ORDER_CONFIRMATION',
    allowManualRetry: true
  });
  assert.equal(claimCancelled.claimed, false);
  assert.equal(claimCancelled.reason, 'ORDER_DELETED');

  // 6. order-status RETRY_NOTIFICATION rejects deleted order's outbox cleanly
  const retryNotifRes = await orderStatusPOST({
    request: makeJsonReq(
      'http://localhost/api/order-status',
      { action: 'RETRY_NOTIFICATION', orderId, notificationId: `notif_order_${orderId}_unsent` },
      { Authorization: 'Bearer tok-admin-verified-123' }
    ),
    _deps: { adminAuth, adminDb: mockDb }
  });
  assert.equal(retryNotifRes.status, 409);

  // 7. Replay create-order with SAME clientRequestId is blocked (409 ORDER_DELETED) & NEVER recreates order!
  const replayRes = await createOrderPOST({
    request: makeJsonReq('http://localhost/api/create-order', orderBody),
    clientAddress: '41.41.10.23',
    _deps: {
      adminDb: mockDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true })
    }
  });
  assert.equal(replayRes.status, 409);
  assert.equal((await replayRes.json()).error, 'ORDER_DELETED');
  assert.equal(mockDb.data.orders?.[orderId], undefined, 'Deleted order MUST NEVER be recreated by replay');
  assert.equal(mockDb.data.privateOrderIdempotency[keyHash].status, 'DELETED');

  // 8. Recovery materialization MUST abort if privateDeletedOrders tombstone exists
  const freshToken = generateSecureInvoiceToken();
  const matAbort = await materializeCommitPayload({
    adminDb: mockDb,
    commitRecord: {
      status: 'COMMITTING',
      reservedOrderId: orderId,
      commitPayload: {
        orderId,
        invoiceCode: 'DNY-RECOVER',
        orderData: { totalAmount: 100 },
        orderAccessRecord: {
          orderId,
          tokenHash: hashInvoiceToken(freshToken),
          encryptedToken: encryptInvoiceToken(freshToken, orderId, hexKey),
          status: 'active'
        },
        invoiceAccessRecord: {
          tokenHash: hashInvoiceToken(freshToken),
          orderId,
          status: 'active'
        },
        outboxRecords: {}
      }
    }
  });
  assert.equal(matAbort.ok, false);
  assert.equal(matAbort.reason, 'ORDER_ADMINISTRATIVELY_DELETED');
  assert.equal(mockDb.data.orders?.[orderId], undefined);
});
