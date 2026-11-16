// test/group2a6-coupon-checkout.test.mjs
// DANDY PHASE 2 / GROUP 2A.6: Coupon Checkout Integration, Server Validation & Order Financial Integrity

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import {
  POST as validateCouponPOST,
  GET as validateCouponGET
} from '../src/pages/api/coupons/validate.js';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import { POST as publicInvoicePOST } from '../src/pages/api/public-invoice.js';
import {
  computeOrderRequestFingerprint,
  acquireOrderIdempotencyLock,
  resolveCompletedReplayPayload
} from '../src/utils/order-idempotency.ts';
import {
  calculateOrderFinancials,
  generateOrderConfirmationEmail,
  generateOrderConfirmationText,
  generateOrderStatusEmail,
  generateOrderStatusText
} from '../src/utils/email-service.ts';
import { formatOrderMessage } from '../src/utils/telegram.js';
import { getPublicStoreShippingPolicy } from '../src/config/store-policy.ts';

function clone(val) {
  return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

function createMockAdminDb(initialData = {}, options = {}) {
  const data = clone(initialData) || {};
  let pushSeq = 0;

  function getAtPath(p) {
    if (!p) return data;
    const parts = p.split('/').filter(Boolean);
    let curr = data;
    for (const part of parts) {
      if (curr === null || curr === undefined || typeof curr !== 'object') return null;
      curr = curr[part];
    }
    return curr === undefined ? null : curr;
  }

  function setAtPath(p, val) {
    const parts = p.split('/').filter(Boolean);
    if (parts.length === 0) return;
    let curr = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (!curr[k] || typeof curr[k] !== 'object') curr[k] = {};
      curr = curr[k];
    }
    const last = parts[parts.length - 1];
    if (val === null || val === undefined) {
      delete curr[last];
    } else {
      curr[last] = clone(val);
    }
  }

  function makeRef(p = '') {
    const cleanPath = String(p).replace(/^\/+|\/+$/g, '');
    const key = cleanPath.split('/').filter(Boolean).pop() || null;

    return {
      key,
      async once(eventType) {
        if (options.onRead) await options.onRead(cleanPath, eventType);
        const val = clone(getAtPath(cleanPath));
        return {
          exists: () => val !== null && val !== undefined,
          val: () => (val === undefined ? null : val),
          forEach(cb) {
            if (!val || typeof val !== 'object') return false;
            for (const [ck, cv] of Object.entries(val)) {
              const snap = { key: ck, val: () => clone(cv), exists: () => cv !== null && cv !== undefined };
              if (cb(snap) === true) return true;
            }
            return false;
          }
        };
      },
      async set(v) {
        if (options.trackWrites) options.trackWrites.push({ op: 'set', path: cleanPath });
        setAtPath(cleanPath, v);
      },
      async update(updates) {
        if (options.trackWrites) options.trackWrites.push({ op: 'update', path: cleanPath, keys: Object.keys(updates || {}) });
        if (!updates || typeof updates !== 'object') return;
        for (const [uk, uv] of Object.entries(updates)) {
          const target = cleanPath ? `${cleanPath}/${uk}` : uk;
          setAtPath(target, uv);
        }
      },
      async remove() {
        if (options.trackWrites) options.trackWrites.push({ op: 'remove', path: cleanPath });
        setAtPath(cleanPath, null);
      },
      push() {
        pushSeq += 1;
        const newKey = `-Ord2a6_${pushSeq}_${crypto.randomUUID().slice(0, 6)}`;
        return makeRef(cleanPath ? `${cleanPath}/${newKey}` : newKey);
      },
      orderByChild() {
        return {
          equalTo() {
            return makeRef(cleanPath);
          }
        };
      },
      async transaction(fn) {
        if (options.trackWrites) options.trackWrites.push({ op: 'transaction', path: cleanPath });
        const current = clone(getAtPath(cleanPath));
        const next = fn(current === undefined ? null : current);
        if (next === undefined) {
          const afterAbort = clone(getAtPath(cleanPath));
          return {
            committed: false,
            snapshot: { exists: () => afterAbort !== null, val: () => afterAbort ?? null }
          };
        }
        setAtPath(cleanPath, next);
        const after = clone(getAtPath(cleanPath));
        return {
          committed: true,
          snapshot: { exists: () => after !== null, val: () => after ?? null }
        };
      }
    };
  }

  return {
    _data: data,
    ref: makeRef
  };
}

function buildFixtures() {
  const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
  const campaignStart = new Date(nowMs - 3600_000).toISOString();
  const campaignEnd = new Date(nowMs + 86400_000).toISOString();

  const dbData = {
    products: {
      prod_hair: {
        name: 'شامبو أعشاب طبيعي',
        price: 500,
        category: 'Hair care',
        stockQuantity: 25
      },
      prod_skin: {
        name: 'سيروم نضارة للبشرة',
        price: 400,
        category: 'Skin care',
        stockQuantity: 15
      },
      prod_scent_multi: {
        name: 'مسك داندي فاخر',
        price: 300,
        category: 'Perfume',
        hasVariants: true,
        variants: [
          { id: 'v_white', name: 'مسك أبيض' },
          { id: 'v_rose', name: 'مسك ورد' }
        ]
      },
      prod_unknown_cat: {
        name: 'منتج بدون تصنيف معروف',
        price: 600,
        category: 'AccessoriesMisc'
      },
      '-OvPqarOBOnNgQ_-kpTl': {
        name: 'زبدة الجسم الطبيعية',
        price: 700,
        category: 'Perfume' // Overridden in PRODUCT_CATEGORY_OVERRIDES to 'body-care'
      },
      prod_pf_offer: {
        name: 'بوكس عرض الجمعة الوردية',
        price: 1000,
        category: 'Skin care'
      },
      prod_expensive: {
        name: 'مجموعة العناية الملكية',
        price: 2200,
        category: 'Skin care'
      },
      prod_2000: {
        name: 'باكدج الأناقة الكاملة',
        price: 2000,
        category: 'Skin care'
      }
    },
    settings: {
      pinkFriday: {
        publishedActiveCampaign: {
          enabled: true,
          startAt: campaignStart,
          endAt: campaignEnd,
          offers: [
            {
              productId: 'prod_pf_offer',
              expectedBasePrice: 1000,
              campaignPrice: 750,
              active: true,
              badgeText: 'عرض Pink Friday'
            }
          ],
          collections: [
            {
              id: 'col_pf_1',
              name: 'كوليكشن Pink Friday',
              active: true,
              pricingType: 'package',
              packagePrice: 800,
              badgeText: 'كوليكشن Pink Friday',
              items: [
                { collectionItemId: 'ci1', productId: 'prod_hair' },
                { collectionItemId: 'ci2', productId: 'prod_skin' }
              ]
            }
          ]
        }
      },
      coupons: {
        cp_all_pct: {
          id: 'cp_all_pct',
          code: 'WELCOME20',
          discountType: 'percentage',
          discountValue: 20,
          scope: 'all',
          categorySlug: null,
          minimumSubtotal: 300,
          maximumDiscount: 150,
          startsAt: null,
          expiresAt: null,
          isActive: true,
          createdAt: nowMs - 10000,
          updatedAt: nowMs - 5000,
          createdBy: 'admin_secret_uid_1',
          updatedBy: 'admin_secret_uid_1',
          schemaVersion: 1
        },
        cp_all_fixed: {
          id: 'cp_all_fixed',
          code: 'SAVE100',
          discountType: 'fixed',
          discountValue: 100,
          scope: 'all',
          categorySlug: null,
          minimumSubtotal: null,
          maximumDiscount: null,
          startsAt: null,
          expiresAt: null,
          isActive: true,
          createdBy: 'admin_secret_uid_2',
          updatedBy: 'admin_secret_uid_2'
        },
        cp_hair_pct: {
          id: 'cp_hair_pct',
          code: 'HAIR25',
          discountType: 'percentage',
          discountValue: 25,
          scope: 'category',
          categorySlug: 'hair-care',
          minimumSubtotal: 500,
          maximumDiscount: 200,
          startsAt: null,
          expiresAt: null,
          isActive: true,
          createdBy: 'admin_secret_uid_3',
          updatedBy: 'admin_secret_uid_3'
        },
        cp_body_fixed: {
          id: 'cp_body_fixed',
          code: 'BODY120',
          discountType: 'fixed',
          discountValue: 120,
          scope: 'category',
          categorySlug: 'body-care',
          minimumSubtotal: 300,
          maximumDiscount: null,
          startsAt: null,
          expiresAt: null,
          isActive: true
        },
        cp_disabled: {
          id: 'cp_disabled',
          code: 'OFF50',
          discountType: 'percentage',
          discountValue: 50,
          scope: 'all',
          isActive: false
        },
        cp_scheduled: {
          id: 'cp_scheduled',
          code: 'SOON10',
          discountType: 'percentage',
          discountValue: 10,
          scope: 'all',
          startsAt: nowMs + 600_000,
          expiresAt: null,
          isActive: true
        },
        cp_expired: {
          id: 'cp_expired',
          code: 'OLD10',
          discountType: 'percentage',
          discountValue: 10,
          scope: 'all',
          startsAt: nowMs - 1200_000,
          expiresAt: nowMs - 1000,
          isActive: true
        },
        cp_full_100: {
          id: 'cp_full_100',
          code: 'FREE100',
          discountType: 'percentage',
          discountValue: 100,
          scope: 'all',
          isActive: true
        },
        cp_malformed: 'not-an-object'
      }
    }
  };

  return { nowMs, dbData };
}

function makeDeps(dbData, nowMs, extra = {}) {
  const writes = [];
  const adminDb = createMockAdminDb(dbData, { trackWrites: writes });
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  return {
    writes,
    deps: {
      adminDb,
      adminAuth: null,
      redis: null,
      encryptionKey,
      skipPublishedCampaignFallback: true,
      now: () => nowMs,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async () => ({ success: true }),
      sendTelegramNotification: async () => ({ success: true }),
      ...extra
    }
  };
}

// ============================================================================
// SECTION A: Public Coupon Validation / Preview API (/api/coupons/validate)
// ============================================================================

test('A.1-A.15 Validate API: percentage, fixed, category, overrides, caps, statuses, minimums, unknown category', async () => {
  const { nowMs, dbData } = buildFixtures();
  const { deps, writes } = makeDeps(dbData, nowMs);

  // Method & Content-Type & Invalid JSON checks
  const getRes = await validateCouponGET();
  assert.equal(getRes.status, 405);
  assert.equal(getRes.headers.get('Allow'), 'POST');

  const wrongCtRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}'
    }),
    clientAddress: '41.41.10.1',
    _deps: deps
  });
  assert.equal(wrongCtRes.status, 415);

  const callValidate = (body, ip = '41.41.10.2', customDeps = deps) =>
    validateCouponPOST({
      request: new Request('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      clientAddress: ip,
      _deps: customDeps
    });

  // 1. All-products percentage coupon with maximumDiscount cap (20% of 1000 = 200 -> capped at 150)
  const r1 = await callValidate({
    code: '  welcome20 ',
    items: [{ productId: 'prod_hair', quantity: 2 }]
  }, '41.41.10.10');
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, private');
  assert.equal(r1.headers.get('Pragma'), 'no-cache');
  const b1 = await r1.json();
  assert.equal(b1.eligible, true);
  assert.equal(b1.code, 'WELCOME20');
  assert.equal(b1.orderProductSubtotal, 1000);
  assert.equal(b1.discountAmount, 150);
  assert.equal(b1.discountedProductSubtotal, 850);
  // 22. Never leaks admin metadata
  assert.equal('createdBy' in b1, false);
  assert.equal('updatedBy' in b1, false);
  assert.equal('id' in b1, false);

  // 2 & 15. All-products fixed coupon (SAVE100 -> 100 on 500 = 400; capped if eligible < 100? wait let's test cap on fixed too)
  const r2 = await callValidate({
    code: 'save100',
    items: [{ productId: 'prod_hair', quantity: 1 }]
  }, '41.41.10.11');
  const b2 = await r2.json();
  assert.equal(b2.eligible, true);
  assert.equal(b2.discountAmount, 100);
  assert.equal(b2.discountedProductSubtotal, 400);

  // 3 & 48. Category percentage coupon on mixed cart (500 hair + 400 skin): only 500 eligible -> 25% of 500 = 125
  const r3 = await callValidate({
    code: 'HAIR25',
    items: [
      { productId: 'prod_hair', quantity: 1 },
      { productId: 'prod_skin', quantity: 1 }
    ]
  }, '41.41.10.12');
  const b3 = await r3.json();
  assert.equal(b3.eligible, true);
  assert.equal(b3.eligibleSubtotal, 500);
  assert.equal(b3.orderProductSubtotal, 900);
  assert.equal(b3.discountAmount, 125);
  assert.equal(b3.discountedProductSubtotal, 775);

  // 4 & 13. PRODUCT_CATEGORY_OVERRIDES respected ('-OvPqarOBOnNgQ_-kpTl' is Perfume in DB -> body-care override)
  const r4 = await callValidate({
    code: 'BODY120',
    items: [
      { productId: '-OvPqarOBOnNgQ_-kpTl', quantity: 1 }, // 700, body-care override
      { productId: 'prod_skin', quantity: 1 } // 400, skin-care
    ]
  }, '41.41.10.13');
  const b4 = await r4.json();
  assert.equal(b4.eligible, true);
  assert.equal(b4.eligibleSubtotal, 700);
  assert.equal(b4.discountAmount, 120);
  assert.equal(b4.discountedProductSubtotal, 980);

  // 5. Invalid coupon code format
  const r5 = await callValidate({
    code: '!!',
    items: [{ productId: 'prod_hair', quantity: 1 }]
  }, '41.41.10.14');
  assert.equal(r5.status, 400);

  // 6. Unknown coupon code
  const r6 = await callValidate({
    code: 'UNKNOWN99',
    items: [{ productId: 'prod_hair', quantity: 1 }]
  }, '41.41.10.15');
  assert.equal(r6.status, 200);
  const b6 = await r6.json();
  assert.equal(b6.eligible, false);
  assert.equal(b6.reason, 'COUPON_NOT_FOUND');

  // 7, 8, 9. Disabled / Scheduled / Expired
  const r7 = await callValidate({ code: 'OFF50', items: [{ productId: 'prod_hair', quantity: 1 }] }, '41.41.10.16');
  assert.equal((await r7.json()).reason, 'COUPON_DISABLED');

  const r8 = await callValidate({ code: 'SOON10', items: [{ productId: 'prod_hair', quantity: 1 }] }, '41.41.10.17');
  assert.equal((await r8.json()).reason, 'COUPON_NOT_STARTED');

  const r9 = await callValidate({ code: 'OLD10', items: [{ productId: 'prod_hair', quantity: 1 }] }, '41.41.10.18');
  assert.equal((await r9.json()).reason, 'COUPON_EXPIRED');

  // 10. Category minimum subtotal not met: HAIR25 min is 500; cart has skin (1000) + hair? no, wait:
  // If hair is not 500 -> we have prod_skin 400 + prod_scent_multi 300 (if hair qty 0? qty >=1 so let's add cheaper hair item)
  const modDb = clone(dbData);
  modDb.products.prod_hair_small = { name: 'شامبو صغير', price: 350, category: 'Hair care' };
  const { deps: depsMin } = makeDeps(modDb, nowMs);
  const r10 = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'HAIR25',
        items: [
          { productId: 'prod_hair_small', quantity: 1 }, // 350 < 500
          { productId: 'prod_skin', quantity: 2 } // 800 skin (total 1150 >= 500, but eligible hair is only 350!)
        ]
      })
    }),
    clientAddress: '41.41.10.19',
    _deps: depsMin
  });
  const b10 = await r10.json();
  assert.equal(b10.eligible, false);
  assert.equal(b10.reason, 'MINIMUM_SUBTOTAL_NOT_MET');
  assert.equal(b10.eligibleSubtotal, 350);

  // 11 & 12. No eligible products + Unknown category does NOT qualify (even if client lies categorySlug: 'hair-care')
  const r11 = await callValidate({
    code: 'HAIR25',
    items: [
      { productId: 'prod_unknown_cat', quantity: 2, categorySlug: 'hair-care', category: 'Hair care', price: 9999 }
    ]
  }, '41.41.10.20');
  const b11 = await r11.json();
  assert.equal(b11.eligible, false);
  assert.equal(b11.reason, 'NO_ELIGIBLE_CATEGORY_ITEMS');

  // 16 & 26. Verify no non-rateLimit writes to settings/coupons or orders
  const nonRateLimitWrites = writes.filter(w => !w.path.startsWith('privateRateLimits/'));
  assert.equal(nonRateLimitWrites.length, 0);
});

test('A.17-A.28 Validate API: Pink Friday rejection, variants, tampered prices, zero-order reject, rate-limit 429 & fail-closed 503', async () => {
  const { nowMs, dbData } = buildFixtures();
  const { deps } = makeDeps(dbData, nowMs);

  // 17 & 19. Mixed normal + Pink Friday individual product rejects coupon
  const pfProdRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'WELCOME20',
        items: [
          { productId: 'prod_hair', quantity: 1 },
          { productId: 'prod_pf_offer', quantity: 1, isPinkFriday: false } // Tampered false ignored!
        ]
      })
    }),
    clientAddress: '41.41.11.1',
    _deps: deps
  });
  const pfProdBody = await pfProdRes.json();
  assert.equal(pfProdBody.eligible, false);
  assert.equal(pfProdBody.reason, 'PINK_FRIDAY_NOT_COMBINABLE');

  // 18. Pink Friday collection rejects coupon
  const pfColRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'SAVE100',
        items: [
          {
            type: 'collection',
            isCollection: true,
            collectionId: 'col_pf_1',
            quantity: 1,
            selectedItems: [
              { productId: 'prod_hair' },
              { productId: 'prod_skin' }
            ]
          }
        ]
      })
    }),
    clientAddress: '41.41.11.2',
    _deps: deps
  });
  const pfColBody = await pfColRes.json();
  assert.equal(pfColBody.eligible, false);
  assert.equal(pfColBody.reason, 'PINK_FRIDAY_NOT_COMBINABLE');

  // 20. Invalid variants rejected during preview
  const badVarRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'WELCOME20',
        items: [
          { productId: 'prod_scent_multi', quantity: 1, selectedVariants: [{ id: 'fake_scent', name: 'Fake' }] }
        ]
      })
    }),
    clientAddress: '41.41.11.3',
    _deps: deps
  });
  assert.equal(badVarRes.status, 400);

  // 21. Tampered prices ignored: prod_scent_multi base 300 × 2 variants = 600; tampered price=10000 ignored
  const multiVarRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'WELCOME20',
        items: [
          {
            productId: 'prod_scent_multi',
            quantity: 1,
            price: 10000,
            lineTotal: 10000,
            selectedVariants: [
              { id: 'v_white', name: 'مسك أبيض' },
              { id: 'v_rose', name: 'مسك ورد' }
            ]
          }
        ]
      })
    }),
    clientAddress: '41.41.11.4',
    _deps: deps
  });
  const multiVarBody = await multiVarRes.json();
  assert.equal(multiVarBody.eligible, true);
  assert.equal(multiVarBody.orderProductSubtotal, 600);
  assert.equal(multiVarBody.discountAmount, 120); // 20% of 600 = 120

  // Zero-order-total guard: FREE100 on >2000 order (free shipping) => 0 payable -> rejected!
  const zeroOrderRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'FREE100',
        items: [{ productId: 'prod_expensive', quantity: 1 }]
      })
    }),
    clientAddress: '41.41.11.5',
    _deps: deps
  });
  const zeroOrderBody = await zeroOrderRes.json();
  assert.equal(zeroOrderBody.eligible, false);
  assert.equal(zeroOrderBody.reason, 'INVALID_COUPON_TOTAL');

  // 24. Rate limit enforced after 10 requests on same IP
  for (let i = 0; i < 10; i++) {
    const okRes = await validateCouponPOST({
      request: new Request('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'SAVE100', items: [{ productId: 'prod_hair', quantity: 1 }] })
      }),
      clientAddress: '41.41.11.99',
      _deps: deps
    });
    assert.equal(okRes.status, 200);
  }
  const rateLimitedRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SAVE100', items: [{ productId: 'prod_hair', quantity: 1 }] })
    }),
    clientAddress: '41.41.11.99',
    _deps: deps
  });
  assert.equal(rateLimitedRes.status, 429);

  // 25. Missing IP / Missing DB fails closed with 503
  const noDbRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'SAVE100', items: [{ productId: 'prod_hair', quantity: 1 }] })
    }),
    clientAddress: '41.41.11.100',
    _deps: { simulateMissingDb: true, redis: null }
  });
  assert.equal(noDbRes.status, 503);
});

// ============================================================================
// SECTION B: Cart UX Simulation (src/pages/cart.astro)
// ============================================================================

async function mountCartHarness({ initialCart = [], fetchImpl = null, storedCoupon = null } = {}) {
  const [cartSource, shippingSrc, variantsSrc, pfSrc, flowSrc] = await Promise.all([
    fs.readFile(path.resolve('src/pages/cart.astro'), 'utf8'),
    fs.readFile(path.resolve('public/assets/js/cart-shipping-progress.js'), 'utf8'),
    fs.readFile(path.resolve('public/assets/js/variants.js'), 'utf8'),
    fs.readFile(path.resolve('public/assets/js/pink-friday.js'), 'utf8'),
    fs.readFile(path.resolve('public/assets/js/order-flow-helpers.js'), 'utf8')
  ]);

  const scriptMatches = [...cartSource.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)];
  const inlineScript = scriptMatches[scriptMatches.length - 1][1];

  const elements = new Map();
  function createEl(id = '', tag = 'div') {
    const attrs = new Map();
    const classes = new Set();
    const children = [];
    const listeners = new Map();
    let _innerHTML = '';
    let _textContent = '';
    return {
      id,
      tagName: tag.toUpperCase(),
      value: '',
      selectedIndex: 0,
      options: [],
      disabled: false,
      style: {},
      className: '',
      classList: {
        add(...cls) { cls.forEach(c => classes.add(c)); },
        remove(...cls) { cls.forEach(c => classes.delete(c)); },
        contains(c) { return classes.has(c); }
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
      appendChild(child) { children.push(child); return child; },
      addEventListener(evt, fn) {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt).push(fn);
      },
      dispatchEvent(evt) {
        const list = listeners.get(evt.type) || [];
        return Promise.all(list.map(fn => fn(evt)));
      },
      get children() { return children; },
      get innerHTML() { return _innerHTML; },
      set innerHTML(v) {
        _innerHTML = String(v);
        if (_innerHTML === '') children.length = 0;
      },
      get textContent() { return _textContent; },
      set textContent(v) { _textContent = String(v); }
    };
  }

  const allIds = [
    'cartCheckoutContainer', 'freeShippingProgressCard', 'freeShippingIcon',
    'freeShippingTitle', 'freeShippingMessage', 'freeShippingBadge',
    'freeShippingProgressBar', 'freeShippingProgressFill', 'cartItemsList',
    'subtotalValSummary', 'couponBoxCard', 'couponCodeInput', 'applyCouponBtn',
    'appliedCouponBadge', 'appliedCouponCodeLabel', 'removeCouponBtn',
    'couponFeedback', 'couponSummaryRow1', 'couponCodeSummary1',
    'couponDiscountSummary1', 'freeShippingStatusSummary1', 'shippingCostSummary1',
    'grandTotalLabelSummary1', 'grandTotalSummaryValue1', 'shippingSummaryHint1',
    'subtotalValSummary2', 'couponSummaryRow2', 'couponCodeSummary2',
    'couponDiscountSummary2', 'freeShippingStatusSummary2', 'shippingCostSummary2',
    'grandTotalLabelSummary2', 'grandTotalSummaryValue2', 'shippingSummaryHint2',
    'summSubtotal', 'couponSummaryRow3', 'couponCodeSummary3',
    'summCouponDiscount', 'freeShippingStatusSummary3', 'summShipping',
    'finalSummaryTotal', 'revCustName', 'revCustPhone', 'revCustEmail',
    'revCustLocation', 'revCustAddress', 'revProductsList',
    'f-name', 'f-phone', 'f-email', 'f-gov', 'f-city', 'f-address',
    'stepperLineProgress', 'step-panel-1', 'step-panel-2', 'step-panel-3',
    'stepper-step-1', 'stepper-step-2', 'stepper-step-3', 'cart-count',
    'btnResetOrderAttempt', 'checkoutStatusBanner', 'checkoutStatusBannerText',
    'checkoutStatusBannerActions', 'finalPlaceOrderBtn', 'savingTextLoader',
    'savedAddressesSection', 'savedAddressSelect'
  ];
  allIds.forEach(id => elements.set(id, createEl(id)));

  const policyEl = createEl('dandy-store-shipping-policy', 'script');
  policyEl.textContent = JSON.stringify(getPublicStoreShippingPolicy());
  elements.set('dandy-store-shipping-policy', policyEl);

  const govSelect = elements.get('f-gov');
  govSelect.options = [
    { value: '', text: 'اختر المحافظة' },
    { value: 'Gharbia', text: 'الغربية' },
    { value: 'Cairo', text: 'القاهرة' }
  ];
  govSelect.setGov = (v) => {
    const idx = govSelect.options.findIndex(o => o.value === v);
    govSelect.value = v;
    govSelect.selectedIndex = idx >= 0 ? idx : 0;
  };
  govSelect.setGov('Cairo');

  const localStoreMap = new Map();
  localStoreMap.set('cart', JSON.stringify(initialCart));
  if (storedCoupon) localStoreMap.set('dandy_checkout_coupon_v1', storedCoupon);

  const sessionStoreMap = new Map();

  const storageWrapper = (map) => ({
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  });

  const sandbox = {
    __PINK_FRIDAY_CONFIG: { enabled: false, offers: [], collections: [] },
    localStorage: storageWrapper(localStoreMap),
    sessionStorage: storageWrapper(sessionStoreMap),
    fetch: fetchImpl,
    crypto: globalThis.crypto,
    TextEncoder,
    scrollTo: () => {},
    dispatchEvent: () => {},
    addEventListener: () => {},
    location: { href: 'http://localhost:3000/cart' },
    document: {
      getElementById: (id) => elements.get(id) || null,
      createElement: (tag) => createEl('', tag),
      querySelectorAll: (sel) => {
        if (sel === '.checkout-step-panel') return [elements.get('step-panel-1'), elements.get('step-panel-2'), elements.get('step-panel-3')];
        if (sel === '.stepper-step') return [elements.get('stepper-step-1'), elements.get('stepper-step-2'), elements.get('stepper-step-3')];
        return [];
      },
      querySelector: (sel) => (sel === '[name="cf-turnstile-response"]' ? { value: 'turnstile-ok' } : null)
    },
    firebase: {
      database: () => ({ ref: () => ({ once: async () => ({ exists: () => false }) }) }),
      auth: () => ({ onAuthStateChanged: () => {}, currentUser: null })
    },
    CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
    alert: () => {},
    console,
    Math, Number, Object, Array, String, JSON, Date, Set, Map, Promise, parseInt, parseFloat, encodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(variantsSrc, sandbox);
  vm.runInNewContext(pfSrc, sandbox);
  vm.runInNewContext(shippingSrc, sandbox);
  vm.runInNewContext(flowSrc, sandbox);
  vm.runInNewContext(inlineScript, sandbox);

  return { sandbox, elements, localStoreMap, sessionStoreMap };
}

test('B.29-B.42 Cart UX: apply, persistence, revalidation, out-of-order async guard, steps 1-3 totals, removal & outage handling', async () => {
  const { nowMs, dbData } = buildFixtures();
  const { deps } = makeDeps(dbData, nowMs);

  // Use real validate handler behind mocked fetch
  const liveFetch = async (url, init) => {
    if (url === '/api/coupons/validate') {
      return validateCouponPOST({
        request: new Request('http://localhost:3000/api/coupons/validate', {
          method: 'POST',
          headers: init.headers,
          body: init.body
        }),
        clientAddress: '41.41.12.1',
        _deps: deps
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  // Cart item: prod_hair 500 x 1 -> Cairo shipping 85 -> without coupon = 585
  const { sandbox, elements, localStoreMap } = await mountCartHarness({
    initialCart: [{ id: 'prod_hair', productId: 'prod_hair', name: 'شامبو', price: 500, quantity: 1 }],
    fetchImpl: liveFetch
  });

  // 29. Apply coupon WELCOME20 (20% of 500 = 100)
  elements.get('couponCodeInput').value = ' welcome20 ';
  const applyRes = await sandbox.applyCouponCode();
  assert.equal(applyRes.ok, true);
  assert.equal(localStoreMap.get('dandy_checkout_coupon_v1'), 'WELCOME20');
  assert.equal(elements.get('appliedCouponCodeLabel').textContent, 'WELCOME20');
  assert.equal(elements.get('couponSummaryRow1').style.display, 'flex');
  assert.equal(elements.get('couponSummaryRow2').style.display, 'flex');
  assert.equal(elements.get('couponSummaryRow3').style.display, 'flex');
  assert.equal(elements.get('couponDiscountSummary1').textContent, '-100 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '485 ج.م'); // 500 - 100 + 85
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '485 ج.م');
  assert.equal(elements.get('finalSummaryTotal').textContent, '485 ج.م');

  // 34. Quantity change +1 => subtotal 1000 -> WELCOME20 capped at 150 + Cairo shipping 85 = 935
  sandbox.changeQty(0, 1);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(elements.get('subtotalValSummary').textContent, '1000 ج.م');
  assert.equal(elements.get('couponDiscountSummary1').textContent, '-150 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '935 ج.م');

  // 39. Pre-coupon subtotal > 2000 grants free shipping even when coupon drops payable under 2000
  sandbox.changeQty(0, 1); // 1500
  await new Promise(r => setTimeout(r, 20));
  sandbox.changeQty(0, 1); // 2000
  await new Promise(r => setTimeout(r, 20));
  sandbox.changeQty(0, 1); // 2500 (>2000 free shipping unlocked!)
  await new Promise(r => setTimeout(r, 30));
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'unlocked');
  assert.equal(elements.get('subtotalValSummary').textContent, '2500 ج.م');
  assert.equal(elements.get('couponDiscountSummary1').textContent, '-150 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '2350 ج.م');
  assert.match(elements.get('shippingCostSummary1').textContent, /شحن مجاني/);

  // 30. Remove coupon restores full 2500 total and hides coupon rows across all steps
  sandbox.removeCouponCode(false);
  assert.equal(localStoreMap.has('dandy_checkout_coupon_v1'), false);
  assert.equal(elements.get('couponSummaryRow1').style.display, 'none');
  assert.equal(elements.get('couponSummaryRow2').style.display, 'none');
  assert.equal(elements.get('couponSummaryRow3').style.display, 'none');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '2500 ج.م');

  // 33 & 42. Reload with persisted code: if preview service returns 503 outage, MUST clear stale discount & show error
  const outageCart = await mountCartHarness({
    initialCart: [{ id: 'prod_hair', productId: 'prod_hair', name: 'شامبو', price: 500, quantity: 1 }],
    storedCoupon: 'WELCOME20',
    fetchImpl: async () => new Response(JSON.stringify({ success: false, message: 'outage' }), { status: 503 })
  });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(outageCart.elements.get('couponSummaryRow1').style.display, 'none');
  assert.equal(outageCart.elements.get('grandTotalSummaryValue1').textContent, '585 ج.م');
  assert.match(outageCart.elements.get('couponFeedback').className, /is-error/);

  // 36. Out-of-order async preview guard: slow first response MUST NOT overwrite newer response
  let resolveSlow;
  let callCount = 0;
  const raceCart = await mountCartHarness({
    initialCart: [{ id: 'prod_hair', productId: 'prod_hair', name: 'شامبو', price: 500, quantity: 1 }],
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveSlow = () => resolve(new Response(JSON.stringify({
            success: true, eligible: true, code: 'SLOW99', discountAmount: 450, orderProductSubtotal: 500, discountedProductSubtotal: 50
          }), { status: 200 }));
        });
      }
      return new Response(JSON.stringify({
        success: true, eligible: true, code: 'FAST50', discountAmount: 50, orderProductSubtotal: 500, discountedProductSubtotal: 450
      }), { status: 200 });
    }
  });
  raceCart.elements.get('couponCodeInput').value = 'SLOW99';
  const pSlow = raceCart.sandbox.applyCouponCode();
  raceCart.elements.get('couponCodeInput').value = 'FAST50';
  const pFast = raceCart.sandbox.applyCouponCode();
  await pFast;
  resolveSlow();
  await pSlow;
  assert.equal(raceCart.elements.get('appliedCouponCodeLabel').textContent, 'FAST50');
  assert.equal(raceCart.elements.get('couponDiscountSummary1').textContent, '-50 ج.م');
  assert.equal(raceCart.elements.get('grandTotalSummaryValue1').textContent, '535 ج.م'); // 500 - 50 + 85

  // 41. Verify cart.astro never reads settings/coupons directly via Firebase client SDK
  const cartSrc = await fs.readFile(path.resolve('src/pages/cart.astro'), 'utf8');
  assert.equal(cartSrc.includes('settings/coupons'), false);
});

// ============================================================================
// SECTION C & D: Order Creation, Snapshot Security, Idempotency & Replay
// ============================================================================

test('C.43-C.74 Create Order: percentage/fixed/category coupons, shipping threshold parity, tampered body rejection, snapshot integrity, Pink Friday rejection & idempotency', async () => {
  const { nowMs, dbData } = buildFixtures();
  const { deps, writes } = makeDeps(dbData, nowMs);

  const makeOrderReq = (body, ip = '41.41.20.1') =>
    createOrderPOST({
      request: new Request('http://localhost:3000/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      clientAddress: ip,
      _deps: deps
    });

  const baseCustomer = {
    name: 'نور الهدى محمد',
    phone: '01012345678',
    email: 'nour@example.com',
    governorate: 'Gharbia',
    city: 'طنطا',
    address: 'شارع البحر 12'
  };

  // 43. Backwards compatibility: no coupon omits order.coupon and couponCode response fields
  const noCouponRes = await makeOrderReq({
    customer: baseCustomer,
    items: [{ productId: 'prod_hair', quantity: 1 }],
    turnstileToken: 'ok',
    clientRequestId: crypto.randomUUID()
  });
  assert.equal(noCouponRes.status, 200);
  const noCouponBody = await noCouponRes.json();
  assert.equal(noCouponBody.subtotal, 500);
  assert.equal(noCouponBody.shippingFee, 70);
  assert.equal(noCouponBody.totalAmount, 570);
  assert.equal('couponCode' in noCouponBody, false);
  assert.equal('couponDiscountAmount' in noCouponBody, false);
  assert.equal('coupon' in deps.adminDb._data.orders[noCouponBody.orderId], false);

  // 47, 56-60, 68, 69, 95, 97. Category coupon with tampered browser fields & forged coupon snapshot
  const idemId = crypto.randomUUID();
  const catReqPayload = {
    customer: baseCustomer,
    items: [
      {
        productId: 'prod_hair',
        quantity: 2, // 1000 hair-care
        price: 10,
        lineTotal: 20,
        categorySlug: 'skin-care',
        category: 'Skin care'
      },
      {
        productId: 'prod_skin',
        quantity: 1, // 400 skin-care
        categorySlug: 'hair-care'
      }
    ],
    couponCode: '  hair25  ', // 25% of 1000 = 250 -> capped at 200
    couponId: 'forged_id',
    discountAmount: 999,
    coupon: { code: 'FORGED', discountAmount: 999, email: 'attacker@evil.com' },
    totalAmount: 1,
    shippingFee: 0,
    turnstileToken: 'ok',
    clientRequestId: idemId
  };

  const catRes = await makeOrderReq(catReqPayload, '41.41.20.2');
  assert.equal(catRes.status, 200);
  const catBody = await catRes.json();
  assert.equal(catBody.subtotal, 1400);
  assert.equal(catBody.couponCode, 'HAIR25');
  assert.equal(catBody.couponDiscountAmount, 200);
  assert.equal(catBody.shippingFee, 70); // 1400 <= 2000 -> Gharbia 70
  assert.equal(catBody.totalAmount, 1270); // 1400 - 200 + 70

  const savedCatOrder = deps.adminDb._data.orders[catBody.orderId];
  assert.equal(savedCatOrder.subtotal, 1400);
  assert.equal(savedCatOrder.shippingFee, 70);
  assert.equal(savedCatOrder.totalAmount, 1270);
  assert.equal(savedCatOrder.coupon.id, 'cp_hair_pct');
  assert.equal(savedCatOrder.coupon.code, 'HAIR25');
  assert.equal(savedCatOrder.coupon.eligibleSubtotal, 1000);
  assert.equal(savedCatOrder.coupon.discountAmount, 200);
  assert.equal(savedCatOrder.coupon.eligibleProductLines.length, 1);
  assert.equal(savedCatOrder.coupon.eligibleProductLines[0].productId, 'prod_hair');
  assert.equal(savedCatOrder.coupon.eligibleProductLines[0].categorySlug, 'hair-care');
  assert.equal(savedCatOrder.coupon.eligibleProductLines[0].lineSubtotal, 1000);
  // 95. Zero PII inside coupon snapshot
  assert.equal('email' in savedCatOrder.coupon, false);
  assert.equal('phone' in savedCatOrder.coupon, false);
  assert.equal('name' in savedCatOrder.coupon, false);
  assert.equal('address' in savedCatOrder.coupon, false);

  // 78 & 82. Idempotency replay returns identical order + coupon summary with no duplicate write
  const orderCountBeforeReplay = Object.keys(deps.adminDb._data.orders).length;
  const replayRes = await makeOrderReq({
    ...catReqPayload,
    couponCode: 'HAIR25'
  }, '41.41.20.3');
  assert.equal(replayRes.status, 200);
  const replayBody = await replayRes.json();
  assert.equal(replayBody.orderId, catBody.orderId);
  assert.equal(replayBody.couponCode, 'HAIR25');
  assert.equal(replayBody.couponDiscountAmount, 200);
  assert.equal(Object.keys(deps.adminDb._data.orders).length, orderCountBeforeReplay);

  // 76. Same cart + DIFFERENT coupon with same clientRequestId -> 409 IDEMPOTENCY_CONFLICT!
  const conflictRes = await makeOrderReq({
    ...catReqPayload,
    couponCode: 'WELCOME20'
  }, '41.41.20.4');
  assert.equal(conflictRes.status, 409);
  assert.equal((await conflictRes.json()).error, 'IDEMPOTENCY_CONFLICT');

  // 62 & 63. Shipping threshold parity on exact 2000 EGP vs >2000 EGP
  const exact2000Res = await makeOrderReq({
    customer: baseCustomer,
    items: [{ productId: 'prod_2000', quantity: 1 }],
    couponCode: 'SAVE100',
    turnstileToken: 'ok',
    clientRequestId: crypto.randomUUID()
  }, '41.41.20.5');
  assert.equal(exact2000Res.status, 200);
  const exact2000Body = await exact2000Res.json();
  assert.equal(exact2000Body.subtotal, 2000);
  assert.equal(exact2000Body.shippingFee, 70); // Exact 2000 keeps shipping
  assert.equal(exact2000Body.totalAmount, 1970); // 2000 - 100 + 70

  const over2000Res = await makeOrderReq({
    customer: baseCustomer,
    items: [{ productId: 'prod_expensive', quantity: 1 }], // 2200 > 2000
    couponCode: 'WELCOME20', // 20% capped 150 -> discounted 2050; or SAVE100 -> 2100; even if discount dropped < 2000 shipping stays 0!
    turnstileToken: 'ok',
    clientRequestId: crypto.randomUUID()
  }, '41.41.20.6');
  assert.equal(over2000Res.status, 200);
  const over2000Body = await over2000Res.json();
  assert.equal(over2000Body.shippingFee, 0);
  assert.equal(over2000Body.totalAmount, 2050);

  // 65. Zero-payable order rejected (100% coupon + free shipping > 2000)
  const zeroIdem = crypto.randomUUID();
  const zeroRes = await makeOrderReq({
    customer: baseCustomer,
    items: [{ productId: 'prod_expensive', quantity: 1 }],
    couponCode: 'FREE100',
    turnstileToken: 'ok',
    clientRequestId: zeroIdem
  }, '41.41.20.7');
  assert.equal(zeroRes.status, 400);
  assert.equal((await zeroRes.json()).error, 'INVALID_COUPON_TOTAL');

  // 67 & 83. Failed coupon validation reconciled pending idempotency lock to FAILED (allow retry with new attempt/fingerprint)
  const badCouponIdem = crypto.randomUUID();
  const ordersBeforeFail = Object.keys(deps.adminDb._data.orders).length;
  const badCouponRes = await makeOrderReq({
    customer: baseCustomer,
    items: [{ productId: 'prod_hair', quantity: 1 }],
    couponCode: 'OFF50', // disabled
    turnstileToken: 'ok',
    clientRequestId: badCouponIdem
  }, '41.41.20.8');
  assert.equal(badCouponRes.status, 400);
  assert.equal(Object.keys(deps.adminDb._data.orders).length, ordersBeforeFail);
  const idemHash = crypto.createHash('sha256').update(badCouponIdem).digest('hex');
  assert.equal(deps.adminDb._data.privateOrderIdempotency[idemHash].status, 'FAILED');

  // 53 & 55. Pink Friday mixed cart rejected with 409 and creates no order
  const pfRejectRes = await makeOrderReq({
    customer: baseCustomer,
    items: [
      { productId: 'prod_hair', quantity: 1 },
      { productId: 'prod_pf_offer', quantity: 1 }
    ],
    couponCode: 'WELCOME20',
    turnstileToken: 'ok',
    clientRequestId: crypto.randomUUID()
  }, '41.41.20.9');
  assert.equal(pfRejectRes.status, 409);
  assert.equal((await pfRejectRes.json()).error, 'PINK_FRIDAY_NOT_COMBINABLE');

  // 98-103. Zero analytics/counters & zero extra redemption writes
  assert.equal('usageCount' in deps.adminDb._data.settings.coupons.cp_hair_pct, false);
  const couponWrites = writes.filter(w => w.path.startsWith('settings/coupons'));
  assert.equal(couponWrites.length, 0);
});

test('D.75-D.84 Client/Server Fingerprint Parity & Crash Recovery preserves coupon response', async () => {
  const flowSrc = await fs.readFile(path.resolve('public/assets/js/order-flow-helpers.js'), 'utf8');
  const flowSandbox = {
    crypto: globalThis.crypto,
    TextEncoder,
    Uint8Array,
    Math, Number, Object, Array, String, JSON, Date
  };
  flowSandbox.globalThis = flowSandbox;
  vm.runInNewContext(flowSrc, flowSandbox);

  const sampleInput = {
    name: 'سارة علي',
    phone: '01012345678',
    email: 'sara@example.com',
    governorate: 'Cairo',
    city: 'مدينة نصر',
    address: 'شارع عباس العقاد',
    customerId: null,
    items: [{ productId: 'prod_hair', quantity: 1 }]
  };

  // No coupon parity
  const clientNoCoupon = await flowSandbox.DandyOrderFlow.computeLocalOrderFingerprintHex(sampleInput);
  const serverNoCoupon = computeOrderRequestFingerprint(sampleInput);
  assert.equal(clientNoCoupon, serverNoCoupon);

  // Case + whitespace normalization parity
  const clientCoupon = await flowSandbox.DandyOrderFlow.computeLocalOrderFingerprintHex({
    ...sampleInput,
    couponCode: '  welcome20 '
  });
  const serverCoupon = computeOrderRequestFingerprint({
    ...sampleInput,
    couponCode: 'WELCOME20'
  });
  assert.equal(clientCoupon, serverCoupon);
  assert.notEqual(clientCoupon, clientNoCoupon);

  // 81. COMMITTING recovery returns couponCode & couponDiscountAmount
  const { nowMs, dbData } = buildFixtures();
  let abortedOnce = false;
  const crashClientReqId = crypto.randomUUID();
  const recoveryDeps = {
    adminDb: createMockAdminDb(dbData),
    adminAuth: null,
    redis: null,
    encryptionKey: crypto.randomBytes(32).toString('hex'),
    skipPublishedCampaignFallback: true,
    now: () => nowMs,
    commitLeaseMs: 10,
    beforeVerifyMaterialization: async () => {
      if (!abortedOnce) {
        abortedOnce = true;
        throw new Error('Crash during commit materialization');
      }
    },
    verifyTurnstileToken: async () => ({ success: true }),
    sendOrderNotification: async () => ({ success: true }),
    sendTelegramNotification: async () => ({ success: true })
  };
  const crashBody = {
    customer: {
      name: 'هند سمير',
      phone: '01099887766',
      email: 'hind@example.com',
      governorate: 'Gharbia',
      city: 'طنطا',
      address: 'شارع النحاس'
    },
    items: [{ productId: 'prod_hair', quantity: 2 }],
    couponCode: 'WELCOME20',
    turnstileToken: 'ok',
    clientRequestId: crashClientReqId
  };

  const firstAttempt = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(crashBody)
    }),
    clientAddress: '41.41.21.1',
    _deps: recoveryDeps
  });
  assert.equal(firstAttempt.status, 503);

  await new Promise(r => setTimeout(r, 25)); // Wait for 10ms commitLease to become stale

  const recoveredAttempt = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(crashBody)
    }),
    clientAddress: '41.41.21.2',
    _deps: recoveryDeps
  });
  assert.equal(recoveredAttempt.status, 200);
  const recJson = await recoveredAttempt.json();
  assert.equal(recJson.couponCode, 'WELCOME20');
  assert.equal(recJson.couponDiscountAmount, 150);
  assert.equal(recJson.totalAmount, 920); // 1000 - 150 + 70
});

// ============================================================================
// SECTION E & G: Presentation (Email, Telegram, Public Invoice, Dashboard) & Parity
// ============================================================================

test('E.85-E.96 & G Integration Parity: preview == order == snapshot == public invoice == email == telegram == admin modal', async () => {
  const { nowMs, dbData } = buildFixtures();
  const { deps } = makeDeps(dbData, nowMs);

  const cartItems = [
    { productId: 'prod_hair', quantity: 1 }, // 500 hair-care
    { productId: 'prod_skin', quantity: 1 }  // 400 skin-care
  ];

  // Step 1: Preview
  const prevRes = await validateCouponPOST({
    request: new Request('http://localhost:3000/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'HAIR25', items: cartItems })
    }),
    clientAddress: '41.41.30.1',
    _deps: deps
  });
  const prevJson = await prevRes.json();
  assert.equal(prevJson.discountAmount, 125); // 25% of 500 = 125

  // Step 2: Create order (Gharbia shipping 70)
  const orderRes = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name: 'مريم حسن',
          phone: '01122334455',
          email: 'mariam@example.com',
          governorate: 'Gharbia',
          city: 'المحلة',
          address: 'شارع شكري القوتلي'
        },
        items: cartItems,
        couponCode: 'HAIR25',
        turnstileToken: 'ok',
        clientRequestId: crypto.randomUUID()
      })
    }),
    clientAddress: '41.41.30.2',
    _deps: deps
  });
  assert.equal(orderRes.status, 200);
  const orderJson = await orderRes.json();
  assert.equal(orderJson.subtotal, 900);
  assert.equal(orderJson.couponDiscountAmount, 125);
  assert.equal(orderJson.shippingFee, 70);
  assert.equal(orderJson.totalAmount, 845); // 900 - 125 + 70

  const savedOrder = deps.adminDb._data.orders[orderJson.orderId];
  assert.equal(savedOrder.coupon.discountAmount, 125);

  // Step 3: Public Invoice API includes sanitized coupon
  const pubInvRes = await publicInvoicePOST({
    request: new Request('http://localhost:3000/api/public-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access: orderJson.invoiceAccessToken })
    }),
    clientAddress: '41.41.30.3',
    _deps: { adminDb: deps.adminDb, redis: null }
  });
  assert.equal(pubInvRes.status, 200);
  const pubInvJson = await pubInvRes.json();
  assert.equal(pubInvJson.order.coupon.code, 'HAIR25');
  assert.equal(pubInvJson.order.coupon.discountAmount, 125);
  assert.equal(pubInvJson.order.totalAmount, 845);

  // Step 4: Email financials, HTML & plain text (plus XSS escaping + legacy order.discount isolation)
  const fin = calculateOrderFinancials(savedOrder);
  assert.equal(fin.subtotal, 900);
  assert.equal(fin.couponCode, 'HAIR25');
  assert.equal(fin.couponDiscountAmount, 125);
  assert.equal(fin.shippingFee, 70);
  assert.equal(fin.totalAmount, 845);

  const confEmail = generateOrderConfirmationEmail(savedOrder, orderJson.orderId);
  assert.match(confEmail.htmlBody, /HAIR25/);
  assert.match(confEmail.htmlBody, /-125 ج\.م/);
  assert.match(confEmail.textBody, /HAIR25/);
  assert.match(confEmail.textBody, /-125 ج\.م/);

  const statusEmail = generateOrderStatusEmail(savedOrder, orderJson.orderId, 'تم الشحن');
  assert.match(statusEmail.htmlBody, /HAIR25/);
  assert.match(statusEmail.htmlBody, /-125 ج\.م/);
  assert.match(statusEmail.textBody, /HAIR25/);
  assert.match(statusEmail.textBody, /-125 ج\.م/);

  // Legacy order with generic order.discount must NOT be treated as couponDiscountAmount
  const legacyOrder = {
    name: 'عميل قديم',
    phone: '01011111111',
    governorate: 'Cairo',
    subtotal: 500,
    discount: 50,
    shippingFee: 85,
    totalAmount: 535,
    products: [{ name: 'شامبو', quantity: 1, price: 500, lineTotal: 500 }]
  };
  const legacyFin = calculateOrderFinancials(legacyOrder);
  assert.equal(legacyFin.couponCode, null);
  assert.equal(legacyFin.couponDiscountAmount, 0);
  assert.equal(legacyFin.totalAmount, 535);

  // Step 5: Telegram formatting (with XSS escaping on forged code & preserving order.discount)
  const tgMsg = formatOrderMessage(savedOrder, orderJson.orderId);
  assert.match(tgMsg, /HAIR25/);
  assert.match(tgMsg, /-125 EGP/);

  const tgXss = formatOrderMessage({
    ...savedOrder,
    coupon: { code: '<script>alert(1)</script>', discountAmount: 50 }
  }, 'ord_xss');
  assert.equal(tgXss.includes('<script>'), false);
  assert.ok(tgXss.includes('&lt;SCRIPT&gt;'));

  const tgLegacy = formatOrderMessage(legacyOrder, 'ord_leg');
  assert.match(tgLegacy, /الخصم:/);
  assert.equal(tgLegacy.includes('خصم الكوبون'), false);

  // Step 6: invoice.astro decimal-preserving display & dashboard-order.astro & dashboard-coupons.astro structural checks
  const [invoiceSrc, dashOrderSrc, dashCouponsSrc] = await Promise.all([
    fs.readFile(path.resolve('src/pages/invoice.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/dashboard-order.astro'), 'utf8'),
    fs.readFile(path.resolve('src/pages/dashboard-coupons.astro'), 'utf8')
  ]);

  assert.ok(invoiceSrc.includes('tableCouponRow'));
  assert.ok(invoiceSrc.includes('tableCouponLabel.textContent'));
  assert.ok(invoiceSrc.includes('formatInvoiceEgp'));

  assert.ok(dashOrderSrc.includes('md-coupon-row'));
  assert.ok(dashOrderSrc.includes('couponLabelEl.textContent'));
  assert.ok(dashOrderSrc.includes('md-subtotal'));

  assert.ok(dashCouponsSrc.includes('GROUP 2A.7'));
  assert.equal(/usageCount|usedCount|usageLimit|redemptions|revenueAttribution/i.test(dashCouponsSrc), false);
});

// ============================================================================
// SECTION F: GROUP 2A.6.1 Strict Stored Coupon Validation & Fail-Closed Checks
// ============================================================================

test('F.1-F.16 Stored coupon validation rejects malformed/corrupted definitions fail-closed in preview & create-order', async () => {
  const { nowMs, dbData } = buildFixtures();

  // F.1 & F.2: Valid percentage & fixed stored coupons with admin metadata remain applicable
  {
    const { deps } = makeDeps(dbData, nowMs);
    const pctPrev = await validateCouponPOST({
      request: new Request('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'WELCOME20', items: [{ productId: 'prod_hair', quantity: 1 }] })
      }),
      clientAddress: '41.41.30.1',
      _deps: deps
    });
    assert.equal(pctPrev.status, 200);
    const pctBody = await pctPrev.json();
    assert.equal(pctBody.eligible, true);
    assert.equal(pctBody.discountAmount, 100);

    const fixedPrev = await validateCouponPOST({
      request: new Request('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'SAVE100', items: [{ productId: 'prod_hair', quantity: 1 }] })
      }),
      clientAddress: '41.41.30.2',
      _deps: deps
    });
    assert.equal(fixedPrev.status, 200);
    const fixedBody = await fixedPrev.json();
    assert.equal(fixedBody.eligible, true);
    assert.equal(fixedBody.discountAmount, 100);
  }

  // F.3-F.15: All malformed/corrupted stored coupon configurations must be rejected by both validate & create-order
  const malformedCases = [
    {
      label: 'F.3 unknown scope must not default to all',
      record: {
        id: 'bad_scope',
        code: 'BADSCOPE',
        discountType: 'percentage',
        discountValue: 20,
        scope: 'unknown_scope',
        categorySlug: null,
        isActive: true,
        createdBy: 'admin_secret'
      }
    },
    {
      label: 'F.4 unknown discountType must not default to percentage',
      record: {
        id: 'bad_type',
        code: 'BADTYPE',
        discountType: 'bogo',
        discountValue: 20,
        scope: 'all',
        categorySlug: null,
        isActive: true
      }
    },
    {
      label: 'F.5 percentage > 100 rejected',
      record: {
        id: 'bad_pct',
        code: 'BADPCT',
        discountType: 'percentage',
        discountValue: 150,
        scope: 'all',
        isActive: true
      }
    },
    {
      label: 'F.6 invalid fixed discountValue <= 0 / NaN rejected',
      record: {
        id: 'bad_fixed',
        code: 'BADFIXED',
        discountType: 'fixed',
        discountValue: -50,
        scope: 'all',
        isActive: true
      }
    },
    {
      label: 'F.7 invalid categorySlug rejected',
      record: {
        id: 'bad_cat',
        code: 'BADCAT',
        discountType: 'fixed',
        discountValue: 50,
        scope: 'category',
        categorySlug: 'accessories-invalid',
        isActive: true
      }
    },
    {
      label: 'F.8 invalid minimumSubtotal rejected',
      record: {
        id: 'bad_min',
        code: 'BADMIN',
        discountType: 'fixed',
        discountValue: 50,
        scope: 'all',
        minimumSubtotal: -100,
        isActive: true
      }
    },
    {
      label: 'F.9 invalid maximumDiscount on fixed coupon / negative on percentage rejected',
      record: {
        id: 'bad_max',
        code: 'BADMAX',
        discountType: 'fixed',
        discountValue: 50,
        scope: 'all',
        maximumDiscount: 30,
        isActive: true
      }
    },
    {
      label: 'F.9b negative maximumDiscount on percentage rejected',
      record: {
        id: 'bad_max_pct',
        code: 'BADMAXP',
        discountType: 'percentage',
        discountValue: 20,
        scope: 'all',
        maximumDiscount: -10,
        isActive: true
      }
    },
    {
      label: 'F.10 invalid startsAt timestamp rejected',
      record: {
        id: 'bad_start',
        code: 'BADSTART',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        startsAt: 'not-a-timestamp',
        isActive: true
      }
    },
    {
      label: 'F.11 invalid expiresAt / expiresAt <= startsAt rejected',
      record: {
        id: 'bad_exp',
        code: 'BADEXP',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        startsAt: nowMs + 50_000,
        expiresAt: nowMs + 10_000,
        isActive: true
      }
    },
    {
      label: 'F.12a corrupted non-boolean isActive ("true") rejected',
      record: {
        id: 'bad_active_str',
        code: 'BADACT1',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all',
        isActive: 'true'
      }
    },
    {
      label: 'F.12b missing isActive (undefined) rejected fail-closed',
      record: {
        id: 'bad_active_undef',
        code: 'BADACT2',
        discountType: 'percentage',
        discountValue: 10,
        scope: 'all'
      }
    },
    {
      label: 'F.13 corrupted category coupon with missing slug or invalid scope cannot apply to all-products',
      record: {
        id: 'bad_cat_missing',
        code: 'BADCATM',
        discountType: 'percentage',
        discountValue: 25,
        scope: 'category',
        categorySlug: null,
        isActive: true
      }
    }
  ];

  for (let i = 0; i < malformedCases.length; i++) {
    const mc = malformedCases[i];
    const clonedData = clone(dbData);
    clonedData.settings.coupons[mc.record.id] = mc.record;
    const { deps } = makeDeps(clonedData, nowMs);

    // F.14: Preview API rejects cleanly without discount or leaking internal details
    const prevRes = await validateCouponPOST({
      request: new Request('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: mc.record.code,
          items: [{ productId: 'prod_hair', quantity: 2 }]
        })
      }),
      clientAddress: `41.41.31.${i + 1}`,
      _deps: deps
    });
    assert.equal(prevRes.status, 200, `${mc.label}: validate should return clean 200 envelope`);
    const prevBody = await prevRes.json();
    assert.equal(prevBody.eligible, false, `${mc.label}: preview must be ineligible`);
    assert.equal(prevBody.discountAmount, 0, `${mc.label}: preview must produce 0 discount`);
    assert.equal(prevBody.reason, 'INVALID_COUPON_CONFIGURATION', `${mc.label}: stable rejection reason`);
    assert.equal(prevBody.discountType, null, `${mc.label}: must not leak discountType`);
    assert.equal(prevBody.scope, null, `${mc.label}: must not leak scope`);
    assert.equal(JSON.stringify(prevBody).includes('admin_secret'), false);

    // F.15: Final create-order rejects cleanly without creating an order
    const reqId = crypto.randomUUID();
    const orderRes = await createOrderPOST({
      request: new Request('http://localhost:3000/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: 'سمر عادل',
            phone: '01012345678',
            email: 'samar@example.com',
            governorate: 'Cairo',
            city: 'المعادي',
            address: 'شارع 9'
          },
          items: [{ productId: 'prod_hair', quantity: 2 }],
          couponCode: mc.record.code,
          turnstileToken: 'ok',
          clientRequestId: reqId
        })
      }),
      clientAddress: `41.41.32.${i + 1}`,
      _deps: deps
    });
    assert.equal(orderRes.status, 400, `${mc.label}: create-order must reject with 400`);
    const orderErr = await orderRes.json();
    assert.equal(orderErr.success, false);
    assert.equal(orderErr.error, 'INVALID_COUPON_CONFIGURATION');
    assert.equal(Object.keys(deps.adminDb._data.orders || {}).length, 0, `${mc.label}: zero orders created`);
  }

  // F.16: Invalid stored coupon rejection reconciles pending idempotency lock safely to FAILED & allows retry with valid request
  const reconData = clone(dbData);
  reconData.settings.coupons.bad_scope = {
    id: 'bad_scope',
    code: 'BADSCOPE',
    discountType: 'percentage',
    discountValue: 20,
    scope: 'invalid_scope',
    isActive: true
  };
  const { deps: reconDeps } = makeDeps(reconData, nowMs);
  const sharedClientReqId = crypto.randomUUID();

  const failedOrderRes = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name: 'دينا كريم',
          phone: '01012345678',
          email: 'dina@example.com',
          governorate: 'Cairo',
          city: 'الزمالك',
          address: 'شارع 26 يوليو'
        },
        items: [{ productId: 'prod_hair', quantity: 2 }],
        couponCode: 'BADSCOPE',
        turnstileToken: 'ok',
        clientRequestId: sharedClientReqId
      })
    }),
    clientAddress: '41.41.33.1',
    _deps: reconDeps
  });
  assert.equal(failedOrderRes.status, 400);
  const idemRecords = Object.values(reconDeps.adminDb._data.privateOrderIdempotency || {});
  assert.equal(idemRecords.length, 1);
  assert.equal(idemRecords[0].status, 'FAILED');
  assert.equal(idemRecords[0].lastErrorCode, 'INVALID_COUPON_CONFIGURATION');
  assert.equal(Object.keys(reconDeps.adminDb._data.orders || {}).length, 0);

  // Repair the stored coupon and retry with identical clientRequestId & payload -> reconciles from FAILED and succeeds!
  reconDeps.adminDb._data.settings.coupons.bad_scope = {
    id: 'bad_scope',
    code: 'BADSCOPE',
    discountType: 'percentage',
    discountValue: 20,
    scope: 'all',
    isActive: true
  };
  const retryRes = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name: 'دينا كريم',
          phone: '01012345678',
          email: 'dina@example.com',
          governorate: 'Cairo',
          city: 'الزمالك',
          address: 'شارع 26 يوليو'
        },
        items: [{ productId: 'prod_hair', quantity: 2 }],
        couponCode: 'BADSCOPE',
        turnstileToken: 'ok',
        clientRequestId: sharedClientReqId
      })
    }),
    clientAddress: '41.41.33.2',
    _deps: reconDeps
  });
  assert.equal(retryRes.status, 200);
  const retryBody = await retryRes.json();
  assert.equal(retryBody.couponCode, 'BADSCOPE');
  assert.equal(retryBody.couponDiscountAmount, 200);
  assert.equal(retryBody.totalAmount, 885); // 1000 - 200 + 85 Cairo shipping
});

