// test/group2a5-coupon-admin.test.mjs
// DANDY PHASE 2 / GROUP 2A.5: Coupon Backend Foundation & Admin Management Test Suite
// Covers Sections A–G (Requirements 1–74) deterministically without touching production Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import {
  CATEGORY_TAXONOMY,
  PRODUCT_CATEGORY_OVERRIDES,
  getCategorySlugForProduct,
  getStrictCategorySlugForProduct,
  getCouponCategoryOptions,
  isValidCanonicalCategorySlug
} from '../src/utils/categories.ts';
import {
  COUPON_SCHEMA_VERSION,
  normalizeCouponCode,
  validateCouponCode,
  validateCouponDefinition,
  getCouponStatus,
  resolveCouponEligibleProducts,
  calculateCouponDiscount,
  evaluateCouponEligibility,
  roundCurrency
} from '../src/utils/coupons.ts';
import {
  GET as couponsAdminGET,
  POST as couponsAdminPOST,
  ALL as couponsAdminALL
} from '../src/pages/api/coupons/admin.js';

function createAtomicRtdbMock(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const operationsLog = [];
  let pushCounter = 0;
  let txMutex = Promise.resolve();

  function tick() {
    return new Promise((r) => setTimeout(r, options.ioDelayMs ?? 1));
  }

  function getAtPath(targetPath) {
    if (!targetPath) return data;
    const parts = targetPath.split('/').filter(Boolean);
    let curr = data;
    for (const part of parts) {
      if (curr == null || typeof curr !== 'object') return undefined;
      curr = curr[part];
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
      async once(eventType) {
        operationsLog.push({ type: 'once', path: targetPath, eventType });
        await tick();
        const val = getAtPath(targetPath);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      push() {
        pushCounter++;
        const key = `-CouponKey_${String(pushCounter).padStart(4, '0')}`;
        operationsLog.push({ type: 'push', path: `${targetPath}/${key}` });
        return {
          key
        };
      },
      async set(val) {
        operationsLog.push({ type: 'set', path: targetPath });
        await tick();
        setAtPath(targetPath, val);
      },
      async transaction(updater) {
        operationsLog.push({ type: 'transaction', path: targetPath });
        let resolveOuter;
        let rejectOuter;
        const resultPromise = new Promise((res, rej) => {
          resolveOuter = res;
          rejectOuter = rej;
        });

        txMutex = txMutex.then(async () => {
          try {
            await tick();
            const current = getAtPath(targetPath);
            const currentClone =
              current === null || current === undefined
                ? null
                : JSON.parse(JSON.stringify(current));
            const nextVal = updater(currentClone);
            if (nextVal === undefined) {
              resolveOuter({
                committed: false,
                snapshot: { val: () => currentClone }
              });
              return;
            }
            setAtPath(targetPath, nextVal);
            const persistedClone = JSON.parse(JSON.stringify(nextVal));
            resolveOuter({
              committed: true,
              snapshot: { val: () => persistedClone }
            });
          } catch (err) {
            rejectOuter(err);
          }
        });

        return resultPromise;
      }
    };
  }

  return {
    ref: makeRef,
    _data: data,
    _log: operationsLog
  };
}

function createMockAdminAuth(tokenMap = {}) {
  return {
    async verifyIdToken(token) {
      if (Object.prototype.hasOwnProperty.call(tokenMap, token)) {
        const entry = tokenMap[token];
        if (entry instanceof Error) throw entry;
        return entry;
      }
      const err = new Error('Token invalid or expired');
      err.code = 'auth/id-token-expired';
      throw err;
    }
  };
}

function makeDeps({ initialData = {}, nowMs = 1794750000000, ioDelayMs = 1 } = {}) {
  let currentNow = nowMs;
  const adminDb = createAtomicRtdbMock(initialData, { ioDelayMs });
  const adminAuth = createMockAdminAuth({
    'token-admin-verified': {
      uid: 'admin-uid-1',
      email: 'admin@dandy.com',
      email_verified: true
    },
    'token-admin-unverified': {
      uid: 'admin-uid-2',
      email: 'admin@dandy.com',
      email_verified: false
    },
    'token-customer-verified': {
      uid: 'cust-uid-1',
      email: 'customer@example.com',
      email_verified: true
    }
  });

  return {
    adminDb,
    adminAuth,
    now: () => currentNow,
    setNow(next) {
      currentNow = next;
    }
  };
}

function makeRequest(method, { token = '', body = undefined, rawBody = undefined } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (method === 'POST') headers.set('Content-Type', 'application/json');

  return new Request('http://localhost:3000/api/coupons/admin', {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined
  });
}

// ============================================================================
// SECTION A: Coupon Code Validation (Tests 1–6)
// ============================================================================

test('A.1–A.5 Coupon code normalization, trimming, empty, invalid chars, and length limits', () => {
  assert.equal(normalizeCouponCode('welcome20'), 'WELCOME20');
  assert.equal(normalizeCouponCode('  Welcome_20-EG  '), 'WELCOME_20-EG');

  assert.equal(normalizeCouponCode(''), null);
  assert.equal(normalizeCouponCode('   '), null);
  assert.equal(validateCouponCode('').error, 'COUPON_CODE_REQUIRED');

  // Invalid characters (Arabic, spaces inside, symbols)
  for (const bad of ['WEL COME', 'خصم20', 'SALE$20', 'A!B', 'CODE/1']) {
    assert.equal(normalizeCouponCode(bad), null, `Expected invalid char code rejected: ${bad}`);
    assert.equal(validateCouponCode(bad).valid, false);
  }

  // Min length 3, max length 32
  assert.equal(normalizeCouponCode('AB'), null);
  assert.equal(validateCouponCode('AB').error, 'COUPON_CODE_LENGTH');
  assert.equal(normalizeCouponCode('ABC'), 'ABC');

  const exact32 = 'A'.repeat(32);
  const over32 = 'A'.repeat(33);
  assert.equal(normalizeCouponCode(exact32), exact32);
  assert.equal(normalizeCouponCode(over32), null);
  assert.equal(validateCouponCode(over32).error, 'COUPON_CODE_LENGTH');
});

test('A.6 Duplicate case-insensitive code detection across normalized coupon codes', async () => {
  const deps = makeDeps();
  const res1 = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'create',
        coupon: {
          code: 'welcome20',
          discountType: 'percentage',
          discountValue: 20,
          scope: 'all',
          isActive: true
        }
      }
    }),
    _deps: deps
  });
  assert.equal(res1.status, 200);
  const json1 = await res1.json();
  assert.equal(json1.coupon.code, 'WELCOME20');

  const res2 = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'create',
        coupon: {
          code: '  WeLcOmE20 ',
          discountType: 'fixed',
          discountValue: 30,
          scope: 'all',
          isActive: true
        }
      }
    }),
    _deps: deps
  });
  assert.equal(res2.status, 409);
  const json2 = await res2.json();
  assert.equal(json2.error, 'COUPON_CODE_EXISTS');
});

// ============================================================================
// SECTION B: Coupon Definition Validation (Tests 7–20)
// ============================================================================

test('B.7–B.19 Coupon definition validation covers valid/invalid types, scopes, thresholds, caps, dates, unexpected fields', () => {
  // 7. Valid percentage coupon
  const pctRes = validateCouponDefinition({
    code: 'save15',
    discountType: 'percentage',
    discountValue: 15.555,
    scope: 'category',
    categorySlug: 'hair-care',
    minimumSubtotal: 300,
    maximumDiscount: 150,
    startsAt: 1794750000000,
    expiresAt: 1794850000000,
    isActive: true
  });
  assert.equal(pctRes.valid, true);
  assert.equal(pctRes.value.code, 'SAVE15');
  assert.equal(pctRes.value.discountValue, 15.56);
  assert.equal(pctRes.value.categorySlug, 'hair-care');

  // 8. Valid fixed coupon
  const fixedRes = validateCouponDefinition({
    code: 'FIXED50',
    discountType: 'fixed',
    discountValue: 50,
    scope: 'all'
  });
  assert.equal(fixedRes.valid, true);
  assert.equal(fixedRes.value.categorySlug, null);
  assert.equal(fixedRes.value.maximumDiscount, null);
  assert.equal(fixedRes.value.minimumSubtotal, null);
  assert.equal(fixedRes.value.isActive, true);

  // 9. Invalid percentage above 100%
  assert.equal(
    validateCouponDefinition({
      code: 'OVER100',
      discountType: 'percentage',
      discountValue: 100.01,
      scope: 'all'
    }).valid,
    false
  );

  // 10. Zero or negative discount value
  for (const val of [0, -10, NaN, Infinity]) {
    assert.equal(
      validateCouponDefinition({
        code: 'BADVAL',
        discountType: 'fixed',
        discountValue: val,
        scope: 'all'
      }).valid,
      false
    );
  }

  // Invalid discountType
  assert.equal(
    validateCouponDefinition({
      code: 'BADTYPE',
      discountType: 'bogo',
      discountValue: 10,
      scope: 'all'
    }).valid,
    false
  );

  // 11. Invalid scope
  assert.equal(
    validateCouponDefinition({
      code: 'BADSCOPE',
      discountType: 'fixed',
      discountValue: 20,
      scope: 'product'
    }).valid,
    false
  );

  // 12. Missing category slug for category scope
  assert.equal(
    validateCouponDefinition({
      code: 'NOCAT',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'category'
    }).error,
    'MISSING_CATEGORY_SLUG'
  );

  // 13. Unsupported category slug
  assert.equal(
    validateCouponDefinition({
      code: 'BADCAT',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'category',
      categorySlug: 'unknown-cat'
    }).error,
    'UNSUPPORTED_CATEGORY_SLUG'
  );

  // 14. Category on all-products scope
  assert.equal(
    validateCouponDefinition({
      code: 'ALLWITHCAT',
      discountType: 'percentage',
      discountValue: 10,
      scope: 'all',
      categorySlug: 'hair-care'
    }).error,
    'UNEXPECTED_CATEGORY_FOR_ALL_SCOPE'
  );

  // 15. Invalid minimum subtotal
  for (const badMin of [0, -50, 'abc']) {
    assert.equal(
      validateCouponDefinition({
        code: 'BADMIN',
        discountType: 'fixed',
        discountValue: 20,
        scope: 'all',
        minimumSubtotal: badMin
      }).valid,
      false
    );
  }

  // 16. Maximum discount for percentage coupon
  const withMax = validateCouponDefinition({
    code: 'CAP100',
    discountType: 'percentage',
    discountValue: 25,
    scope: 'all',
    maximumDiscount: 100
  });
  assert.equal(withMax.valid, true);
  assert.equal(withMax.value.maximumDiscount, 100);

  // Invalid max discount <= 0
  assert.equal(
    validateCouponDefinition({
      code: 'BADCAP',
      discountType: 'percentage',
      discountValue: 25,
      scope: 'all',
      maximumDiscount: 0
    }).valid,
    false
  );

  // 17. Maximum discount rejected for fixed coupon
  assert.equal(
    validateCouponDefinition({
      code: 'FIXEDCAP',
      discountType: 'fixed',
      discountValue: 50,
      scope: 'all',
      maximumDiscount: 50
    }).error,
    'MAXIMUM_DISCOUNT_NOT_ALLOWED_FOR_FIXED'
  );

  // 18. Invalid timestamps
  for (const badTs of ['not-a-timestamp', -100, 12.5, NaN]) {
    assert.equal(
      validateCouponDefinition({
        code: 'BADTS',
        discountType: 'fixed',
        discountValue: 20,
        scope: 'all',
        startsAt: badTs
      }).valid,
      false
    );
  }

  // 19. Expiry before or equal to start
  assert.equal(
    validateCouponDefinition({
      code: 'EQDATE',
      discountType: 'fixed',
      discountValue: 20,
      scope: 'all',
      startsAt: 1794750000000,
      expiresAt: 1794750000000
    }).error,
    'EXPIRY_MUST_BE_AFTER_START'
  );
  assert.equal(
    validateCouponDefinition({
      code: 'REVDATE',
      discountType: 'fixed',
      discountValue: 20,
      scope: 'all',
      startsAt: 1794760000000,
      expiresAt: 1794750000000
    }).error,
    'EXPIRY_MUST_BE_AFTER_START'
  );

  // Reject unexpected analytics / inventory / forged audit fields
  for (const forbiddenField of ['usageCount', 'usageLimit', 'stockQuantity', 'createdAt', 'createdBy']) {
    const res = validateCouponDefinition({
      code: 'STRICT10',
      discountType: 'fixed',
      discountValue: 10,
      scope: 'all',
      [forbiddenField]: 5
    });
    assert.equal(res.valid, false);
    assert.equal(res.error, 'UNEXPECTED_COUPON_FIELD');
    assert.equal(res.field, forbiddenField);
  }
});

test('B.20 Active, scheduled, expired, disabled status derivation with boundary precision', () => {
  const start = 1794750000000;
  const end = 1794850000000;

  assert.equal(getCouponStatus({ isActive: false, startsAt: start, expiresAt: end }, start + 100), 'disabled');
  assert.equal(getCouponStatus({ isActive: true, startsAt: start, expiresAt: end }, start - 1), 'scheduled');
  assert.equal(getCouponStatus({ isActive: true, startsAt: start, expiresAt: end }, start), 'active');
  assert.equal(getCouponStatus({ isActive: true, startsAt: start, expiresAt: end }, end - 1), 'active');
  assert.equal(getCouponStatus({ isActive: true, startsAt: start, expiresAt: end }, end), 'expired');
  assert.equal(getCouponStatus({ isActive: true, startsAt: null, expiresAt: null }, start), 'active');
});

// ============================================================================
// SECTION C: Category Resolver (Tests 21–28)
// ============================================================================

test('C.21–C.28 Strict category resolver handles aliases & overrides without skin-care fallback', () => {
  // 21. Hair category aliases
  assert.equal(getStrictCategorySlugForProduct({ id: 'p1', category: 'Hair care' }), 'hair-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p2', category: 'hair care' }), 'hair-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p3', category: 'منتجات الشعر' }), 'hair-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p4', category: 'عناية بالشعر' }), 'hair-care');

  // 22. Body category aliases
  assert.equal(getStrictCategorySlugForProduct({ id: 'p5', category: 'Body care' }), 'body-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p6', category: 'منتجات الجسم' }), 'body-care');

  // 23. Fragrance category aliases
  assert.equal(getStrictCategorySlugForProduct({ id: 'p7', category: 'Perfume' }), 'fragrance');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p8', category: 'Fragrances' }), 'fragrance');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p9', category: 'منتجات العطور' }), 'fragrance');

  // 24. Skin category aliases (including legacy normalizeCategory aliases)
  assert.equal(getStrictCategorySlugForProduct({ id: 'p10', category: 'Skin care' }), 'skin-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p11', category: 'عناية بالبشرة' }), 'skin-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p12', category: 'الزيوت العضوية' }), 'skin-care');
  assert.equal(getStrictCategorySlugForProduct({ id: 'p13', category: 'مستحضرات النقاء' }), 'skin-care');

  // 25. PRODUCT_CATEGORY_OVERRIDES
  assert.equal(PRODUCT_CATEGORY_OVERRIDES['-OvPqarOBOnNgQ_-kpTl'], 'body-care');
  assert.equal(
    getStrictCategorySlugForProduct({ id: '-OvPqarOBOnNgQ_-kpTl', category: 'Perfume' }),
    'body-care'
  );
  assert.equal(
    getStrictCategorySlugForProduct({ id: '-OW9WB1GTP1GaDoqcd2R', category: 'Body care' }),
    'skin-care'
  );
  assert.equal(
    getStrictCategorySlugForProduct({ id: '-OWF9Deint3XcB6iNdCE', category: 'Body care' }),
    'skin-care'
  );
  assert.equal(
    getStrictCategorySlugForProduct({ id: '-OvPpguWTAtcaWirD9Um', category: 'Body care' }),
    'skin-care'
  );
  // Nail serum keeps body-care
  assert.equal(
    getStrictCategorySlugForProduct({ id: '-OWF2juQihSL1HV8PwTT', category: 'Body care' }),
    'body-care'
  );

  // 26. Unknown category returns null
  assert.equal(getStrictCategorySlugForProduct({ id: 'p_unknown', category: 'Accessories' }), null);
  assert.equal(getStrictCategorySlugForProduct({ id: 'p_unknown2', category: 'Gift Boxes' }), null);

  // 27. Empty category does not default to skin-care
  assert.equal(getStrictCategorySlugForProduct({ id: 'p_empty', category: '' }), null);
  assert.equal(getStrictCategorySlugForProduct({ id: 'p_null', category: null }), null);
  assert.equal(getStrictCategorySlugForProduct(null), null);

  // 28. Existing SEO helper getCategorySlugForProduct behavior remains unchanged (still falls back to skin-care)
  assert.equal(getCategorySlugForProduct({ id: 'p_empty', category: '' }), 'skin-care');
  assert.equal(getCategorySlugForProduct({ id: 'p_unknown', category: 'Accessories' }), 'skin-care');
  assert.equal(getCategorySlugForProduct({ id: '-OvPqarOBOnNgQ_-kpTl', category: 'Perfume' }), 'body-care');

  // Taxonomy helper checks
  const opts = getCouponCategoryOptions();
  assert.equal(opts.length, Object.keys(CATEGORY_TAXONOMY).length);
  assert.equal(isValidCanonicalCategorySlug('hair-care'), true);
  assert.equal(isValidCanonicalCategorySlug('other'), false);
});

// ============================================================================
// SECTION D: Pure Coupon Calculation Helpers (Tests 29–40)
// ============================================================================

const NOW_FIXED = 1794750000000;

function makeBaseCoupon(overrides = {}) {
  return {
    id: 'cpn_test',
    code: 'TEST10',
    discountType: 'percentage',
    discountValue: 10,
    scope: 'all',
    categorySlug: null,
    minimumSubtotal: null,
    maximumDiscount: null,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    createdAt: NOW_FIXED - 10000,
    updatedAt: NOW_FIXED - 10000,
    createdBy: 'admin@dandy.com',
    updatedBy: 'admin@dandy.com',
    schemaVersion: COUPON_SCHEMA_VERSION,
    ...overrides
  };
}

test('D.29–D.40 Pure business-rule helpers enforce scope, thresholds, caps, no shipping discount, no Pink Friday stacking, and status', () => {
  const productsMap = {
    hair_1: { id: 'hair_1', category: 'Hair care' },
    skin_1: { id: 'skin_1', category: 'Skin care' },
    unknown_1: { id: 'unknown_1', category: '' },
    '-OvPqarOBOnNgQ_-kpTl': { id: '-OvPqarOBOnNgQ_-kpTl', category: 'Perfume' } // overridden -> body-care
  };

  // 29. All-products percentage discount
  const allPct = makeBaseCoupon({ discountType: 'percentage', discountValue: 15, scope: 'all' });
  const r29 = evaluateCouponEligibility({
    coupon: allPct,
    items: [
      { productId: 'hair_1', unitPrice: 200, quantity: 1 },
      { productId: 'skin_1', unitPrice: 100, quantity: 1 }
    ],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r29.eligible, true);
  assert.equal(r29.eligibleSubtotal, 300);
  assert.equal(r29.discountAmount, 45);
  assert.equal(r29.discountedProductSubtotal, 255);

  // 30. Category-specific percentage discount
  const hairPct = makeBaseCoupon({
    discountType: 'percentage',
    discountValue: 20,
    scope: 'category',
    categorySlug: 'hair-care'
  });
  const r30 = evaluateCouponEligibility({
    coupon: hairPct,
    items: [
      { productId: 'hair_1', unitPrice: 250, quantity: 1 },
      { productId: 'skin_1', unitPrice: 500, quantity: 1 }
    ],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r30.eligible, true);
  assert.equal(r30.eligibleSubtotal, 250);
  assert.equal(r30.discountAmount, 50);
  assert.equal(r30.orderProductSubtotal, 750);
  assert.equal(r30.discountedProductSubtotal, 700);

  // 31. Category-specific fixed discount
  const bodyFixed = makeBaseCoupon({
    discountType: 'fixed',
    discountValue: 60,
    scope: 'category',
    categorySlug: 'body-care'
  });
  const r31 = evaluateCouponEligibility({
    coupon: bodyFixed,
    items: [
      // Spoofed browser categorySlug: 'skin-care', real product is body-care override!
      { productId: '-OvPqarOBOnNgQ_-kpTl', categorySlug: 'skin-care', unitPrice: 300, quantity: 1 },
      { productId: 'hair_1', unitPrice: 200, quantity: 1 }
    ],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r31.eligible, true);
  assert.equal(r31.eligibleSubtotal, 300);
  assert.equal(r31.discountAmount, 60);

  // Unknown category must NOT qualify for skin-care coupon
  const skinCoupon = makeBaseCoupon({
    discountType: 'percentage',
    discountValue: 20,
    scope: 'category',
    categorySlug: 'skin-care'
  });
  const rUnknown = evaluateCouponEligibility({
    coupon: skinCoupon,
    items: [{ productId: 'unknown_1', categorySlug: 'skin-care', unitPrice: 500, quantity: 1 }],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(rUnknown.eligible, false);
  assert.equal(rUnknown.reason, 'NO_ELIGIBLE_CATEGORY_ITEMS');

  // 32 & 33. Mixed cart eligible subtotal & minimum subtotal evaluated against eligible lines ONLY
  const hairWithMin = makeBaseCoupon({
    discountType: 'percentage',
    discountValue: 20,
    scope: 'category',
    categorySlug: 'hair-care',
    minimumSubtotal: 400
  });
  const r33Fail = evaluateCouponEligibility({
    coupon: hairWithMin,
    items: [
      { productId: 'hair_1', unitPrice: 300, quantity: 1 },
      { productId: 'skin_1', unitPrice: 1000, quantity: 1 } // total cart 1300, but hair only 300!
    ],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r33Fail.eligible, false);
  assert.equal(r33Fail.reason, 'MINIMUM_SUBTOTAL_NOT_MET');
  assert.equal(r33Fail.eligibleSubtotal, 300);
  assert.equal(r33Fail.discountAmount, 0);

  // 34. Maximum percentage discount cap
  const cappedPct = makeBaseCoupon({
    discountType: 'percentage',
    discountValue: 50,
    scope: 'all',
    maximumDiscount: 120
  });
  const r34 = evaluateCouponEligibility({
    coupon: cappedPct,
    items: [{ productId: 'hair_1', unitPrice: 500, quantity: 1 }],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r34.eligible, true);
  assert.equal(r34.discountAmount, 120);

  // 35. Fixed discount cannot exceed eligible subtotal
  const bigFixed = makeBaseCoupon({
    discountType: 'fixed',
    discountValue: 500,
    scope: 'category',
    categorySlug: 'hair-care'
  });
  const r35 = evaluateCouponEligibility({
    coupon: bigFixed,
    items: [
      { productId: 'hair_1', unitPrice: 180, quantity: 1 },
      { productId: 'skin_1', unitPrice: 1000, quantity: 1 }
    ],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r35.eligible, true);
  assert.equal(r35.discountAmount, 180);
  assert.equal(r35.discountedProductSubtotal, 1000);

  // 36. Zero eligible product subtotal rejected
  const r36 = evaluateCouponEligibility({
    coupon: allPct,
    items: [],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r36.eligible, false);
  assert.equal(r36.reason, 'EMPTY_ELIGIBLE_SUBTOTAL');

  // 37. Discount does not include shipping (calculation strictly operates on product eligibleSubtotal)
  const r37 = calculateCouponDiscount(
    makeBaseCoupon({ discountType: 'percentage', discountValue: 10 }),
    roundCurrency(200) // e.g., product subtotal 200 even if shipping is 70
  );
  assert.equal(r37, 20);

  // 38. Pink Friday presence rejects coupon eligibility across the entire order
  const r38Flag = evaluateCouponEligibility({
    coupon: allPct,
    items: [{ productId: 'hair_1', unitPrice: 300, quantity: 1 }],
    hasPinkFridayInOrder: true,
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r38Flag.eligible, false);
  assert.equal(r38Flag.reason, 'PINK_FRIDAY_NOT_COMBINABLE');

  const r38Line = evaluateCouponEligibility({
    coupon: skinCoupon,
    items: [
      { productId: 'skin_1', unitPrice: 300, quantity: 1 },
      { productId: 'hair_1', unitPrice: 200, quantity: 1, isPinkFridayOffer: true }
    ],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r38Line.eligible, false);
  assert.equal(r38Line.reason, 'PINK_FRIDAY_NOT_COMBINABLE');

  // 39. Inactive coupon rejected
  const r39 = evaluateCouponEligibility({
    coupon: makeBaseCoupon({ isActive: false }),
    items: [{ productId: 'hair_1', unitPrice: 300, quantity: 1 }],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r39.eligible, false);
  assert.equal(r39.reason, 'COUPON_DISABLED');

  // 40. Future and expired coupon rejected
  const r40Future = evaluateCouponEligibility({
    coupon: makeBaseCoupon({ startsAt: NOW_FIXED + 60000 }),
    items: [{ productId: 'hair_1', unitPrice: 300, quantity: 1 }],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r40Future.eligible, false);
  assert.equal(r40Future.reason, 'COUPON_NOT_STARTED');

  const r40Expired = evaluateCouponEligibility({
    coupon: makeBaseCoupon({ expiresAt: NOW_FIXED }),
    items: [{ productId: 'hair_1', unitPrice: 300, quantity: 1 }],
    productsMap,
    now: NOW_FIXED
  });
  assert.equal(r40Expired.eligible, false);
  assert.equal(r40Expired.reason, 'COUPON_EXPIRED');
});

// ============================================================================
// SECTION E: Admin API (Tests 41–60)
// ============================================================================

test('E.41–E.46 Admin API authentication and GET behavior + private no-cache headers', async () => {
  const deps = makeDeps();

  // 41. GET without authorization -> 401
  const noAuthRes = await couponsAdminGET({
    request: makeRequest('GET'),
    _deps: deps
  });
  assert.equal(noAuthRes.status, 401);
  assert.match(noAuthRes.headers.get('cache-control') || '', /no-store/);

  // 42. Invalid/expired token -> 401
  const badTokenRes = await couponsAdminGET({
    request: makeRequest('GET', { token: 'expired.or.invalid' }),
    _deps: deps
  });
  assert.equal(badTokenRes.status, 401);

  // 43. Unverified admin email -> 403 ADMIN_EMAIL_NOT_VERIFIED
  const unverifiedRes = await couponsAdminGET({
    request: makeRequest('GET', { token: 'token-admin-unverified' }),
    _deps: deps
  });
  assert.equal(unverifiedRes.status, 403);
  assert.equal((await unverifiedRes.json()).error, 'ADMIN_EMAIL_NOT_VERIFIED');

  // 44. Non-admin user -> 403 FORBIDDEN
  const custRes = await couponsAdminGET({
    request: makeRequest('GET', { token: 'token-customer-verified' }),
    _deps: deps
  });
  assert.equal(custRes.status, 403);
  assert.equal((await custRes.json()).error, 'FORBIDDEN');

  // 45 & 46. Valid verified admin GET on empty storage returns [] without bootstrapping
  const okEmptyRes = await couponsAdminGET({
    request: makeRequest('GET', { token: 'token-admin-verified' }),
    _deps: deps
  });
  assert.equal(okEmptyRes.status, 200);
  // 60. Private no-cache headers
  assert.match(okEmptyRes.headers.get('cache-control') || '', /no-store/);
  assert.equal(okEmptyRes.headers.get('pragma'), 'no-cache');
  const emptyJson = await okEmptyRes.json();
  assert.equal(emptyJson.success, true);
  assert.deepEqual(emptyJson.coupons, []);
  assert.equal(emptyJson.categories.length, 4);
  // Verify NO write/set occurred on empty GET
  assert.equal(deps.adminDb._log.some((op) => op.type === 'set' || op.type === 'transaction'), false);
  assert.equal(deps.adminDb._data.settings, undefined);
});

test('E.47–E.60 Admin API mutations: create, concurrency uniqueness, update, set_active, validation, no delete, settings/coupons path', async () => {
  const deps = makeDeps({
    initialData: {
      settings: {
        pinkFriday: { currentYear: 2026 }
      }
    }
  });

  // 47. Valid coupon creation
  const createRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'create',
        coupon: {
          code: '  hair25 ',
          discountType: 'percentage',
          discountValue: 25,
          scope: 'category',
          categorySlug: 'hair-care',
          minimumSubtotal: 300,
          maximumDiscount: 150,
          startsAt: 1794750000000,
          expiresAt: 1794850000000,
          isActive: true
        }
      }
    }),
    _deps: deps
  });
  assert.equal(createRes.status, 200);
  assert.match(createRes.headers.get('cache-control') || '', /no-store/);
  const createJson = await createRes.json();
  assert.equal(createJson.success, true);
  const createdId = createJson.coupon.id;
  assert.equal(createJson.coupon.code, 'HAIR25');
  assert.equal(createJson.coupon.createdBy, 'admin@dandy.com');
  assert.equal(createJson.coupon.updatedBy, 'admin@dandy.com');
  assert.equal(createJson.coupon.createdAt, 1794750000000);
  assert.equal(createJson.coupon.schemaVersion, 1);
  // Ensure no analytics/inventory fields
  assert.equal('usageCount' in createJson.coupon, false);
  assert.equal('stockQuantity' in createJson.coupon, false);
  // Ensure unrelated settings preserved!
  assert.deepEqual(deps.adminDb._data.settings.pinkFriday, { currentYear: 2026 });

  // 48. Duplicate code returns 409
  const dupRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'create',
        coupon: {
          code: 'HAIR25',
          discountType: 'fixed',
          discountValue: 20,
          scope: 'all'
        }
      }
    }),
    _deps: deps
  });
  assert.equal(dupRes.status, 409);
  assert.equal((await dupRes.json()).error, 'COUPON_CODE_EXISTS');

  // 49. Concurrent duplicate creation cannot persist duplicate codes
  const raceDeps = makeDeps({ ioDelayMs: 5 });
  const [raceA, raceB] = await Promise.all([
    couponsAdminPOST({
      request: makeRequest('POST', {
        token: 'token-admin-verified',
        body: {
          action: 'create',
          coupon: {
            code: 'race10',
            discountType: 'percentage',
            discountValue: 10,
            scope: 'all'
          }
        }
      }),
      _deps: raceDeps
    }),
    couponsAdminPOST({
      request: makeRequest('POST', {
        token: 'token-admin-verified',
        body: {
          action: 'create',
          coupon: {
            code: 'RACE10',
            discountType: 'percentage',
            discountValue: 15,
            scope: 'all'
          }
        }
      }),
      _deps: raceDeps
    })
  ]);
  const raceStatuses = [raceA.status, raceB.status].sort((a, b) => a - b);
  assert.deepEqual(raceStatuses, [200, 409]);
  assert.equal(Object.keys(raceDeps.adminDb._data.settings.coupons).length, 1);

  // 50. Invalid create payload rejected
  const invalidCreateRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'create',
        coupon: {
          code: 'BADFIX',
          discountType: 'fixed',
          discountValue: 40,
          scope: 'all',
          maximumDiscount: 30
        }
      }
    }),
    _deps: deps
  });
  assert.equal(invalidCreateRes.status, 400);

  // 51 & 52. Valid coupon update preserves stable ID, createdAt, createdBy
  deps.setNow(1794760000000);
  const updateRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'update',
        id: createdId,
        coupon: {
          code: 'hair30',
          discountType: 'fixed',
          discountValue: 75,
          scope: 'body-care'.includes('bad') ? 'all' : 'category',
          categorySlug: 'body-care',
          minimumSubtotal: 400,
          maximumDiscount: null,
          startsAt: null,
          expiresAt: null,
          isActive: true
        }
      }
    }),
    _deps: deps
  });
  assert.equal(updateRes.status, 200);
  const updateJson = await updateRes.json();
  assert.equal(updateJson.coupon.id, createdId);
  assert.equal(updateJson.coupon.code, 'HAIR30');
  assert.equal(updateJson.coupon.createdAt, 1794750000000);
  assert.equal(updateJson.coupon.createdBy, 'admin@dandy.com');
  assert.equal(updateJson.coupon.updatedAt, 1794760000000);
  assert.equal(updateJson.coupon.updatedBy, 'admin@dandy.com');

  // 53. Update checks code uniqueness against other records
  await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'create',
        coupon: {
          code: 'SECOND10',
          discountType: 'fixed',
          discountValue: 10,
          scope: 'all'
        }
      }
    }),
    _deps: deps
  });
  const updateDupRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: {
        action: 'update',
        id: createdId,
        coupon: {
          code: 'second10',
          discountType: 'fixed',
          discountValue: 75,
          scope: 'all'
        }
      }
    }),
    _deps: deps
  });
  assert.equal(updateDupRes.status, 409);
  assert.equal((await updateDupRes.json()).error, 'COUPON_CODE_EXISTS');

  // 54. Activate and deactivate actions work (only explicit boolean)
  const badToggle = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: { action: 'set_active', id: createdId, isActive: 'false' }
    }),
    _deps: deps
  });
  assert.equal(badToggle.status, 400);

  const deactRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: { action: 'set_active', id: createdId, isActive: false }
    }),
    _deps: deps
  });
  assert.equal(deactRes.status, 200);
  assert.equal((await deactRes.json()).coupon.isActive, false);

  const reactRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      body: { action: 'set_active', id: createdId, isActive: true }
    }),
    _deps: deps
  });
  assert.equal(reactRes.status, 200);
  assert.equal((await reactRes.json()).coupon.isActive, true);

  // 55 & 57. Unknown action and no hard deletion action
  for (const badAction of ['delete', 'remove', 'purge', 'unknown_op']) {
    const res = await couponsAdminPOST({
      request: makeRequest('POST', {
        token: 'token-admin-verified',
        body: { action: badAction, id: createdId }
      }),
      _deps: deps
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'UNKNOWN_ACTION');
  }

  // 56. Malformed JSON rejected safely
  const malformedRes = await couponsAdminPOST({
    request: makeRequest('POST', {
      token: 'token-admin-verified',
      rawBody: '{bad-json'
    }),
    _deps: deps
  });
  assert.equal(malformedRes.status, 400);
  assert.equal((await malformedRes.json()).error, 'INVALID_JSON');

  // Method check
  const putRes = await couponsAdminALL();
  assert.equal(putRes.status, 405);

  // 58. All RTDB persistence uses settings/coupons
  const couponOps = deps.adminDb._log.filter((op) => op.type === 'transaction' || op.type === 'push');
  assert.ok(couponOps.length > 0);
  for (const op of couponOps) {
    assert.ok(
      op.path === 'settings/coupons' || op.path.startsWith('settings/coupons/'),
      `Unexpected RTDB write/transaction path: ${op.path}`
    );
  }

  // 45. GET reflects created/updated coupons
  const listRes = await couponsAdminGET({
    request: makeRequest('GET', { token: 'token-admin-verified' }),
    _deps: deps
  });
  assert.equal(listRes.status, 200);
  const listJson = await listRes.json();
  assert.equal(listJson.coupons.length, 2);
});

// ============================================================================
// SECTION F: Admin Dashboard (Tests 61–68)
// ============================================================================

function createDashboardDomHarness() {
  class MockEl {
    constructor(tag, id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.required = false;
      this.style = {};
      this.attributes = {};
      this.children = [];
      this.parentNode = null;
      this._textContent = '';
      this._innerHTML = '';
      this.className = '';
      this.listeners = new Map();
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'id') this.id = String(v);
    }
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    }
    removeAttribute(k) {
      delete this.attributes[k];
    }
    addEventListener(evt, fn) {
      if (!this.listeners.has(evt)) this.listeners.set(evt, []);
      this.listeners.get(evt).push(fn);
    }
    async dispatchEvent(evtObj) {
      const event = typeof evtObj === 'string' ? { type: evtObj, target: this, preventDefault() {} } : evtObj;
      if (!event.target) event.target = this;
      if (!event.preventDefault) event.preventDefault = () => {};
      const fns = this.listeners.get(event.type) || [];
      for (const fn of fns) {
        await fn(event);
      }
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    get textContent() {
      return this._textContent;
    }
    set textContent(v) {
      this._textContent = String(v ?? '');
      this.children = [];
    }
    get innerHTML() {
      return this._innerHTML;
    }
    set innerHTML(v) {
      this._innerHTML = String(v ?? '');
      if (this._innerHTML === '') this.children = [];
    }
    get classList() {
      const self = this;
      return {
        add(c) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          set.add(c);
          self.className = Array.from(set).join(' ');
        },
        remove(c) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          set.delete(c);
          self.className = Array.from(set).join(' ');
        }
      };
    }
    closest(selector) {
      if (selector.includes('button[data-action]')) {
        return this.attributes['data-action'] ? this : null;
      }
      return null;
    }
  }

  const elementsById = new Map();
  const ids = [
    'summaryTotalCount', 'summaryActiveCount', 'summaryScheduledCount', 'summaryInactiveCount',
    'couponSearchInput', 'filterStatusSelect', 'filterTypeSelect', 'filterScopeSelect',
    'btnRefreshCoupons', 'couponsTableBody', 'btnOpenCreateCoupon', 'couponFormModal',
    'couponModalTitle', 'couponFormWarningBanner', 'couponFormErrorBox', 'couponForm',
    'couponCodeInput', 'couponDiscountTypeSelect', 'couponDiscountValueInput',
    'couponDiscountValueLabel', 'couponMaxDiscountInput', 'couponMaxDiscountHint',
    'couponScopeSelect', 'couponCategoryFieldWrap', 'couponCategorySelect',
    'couponMinSubtotalInput', 'couponStartsAtInput', 'couponExpiresAtInput',
    'couponIsActiveToggle', 'btnSubmitCouponForm', 'btnSubmitCouponText',
    'couponConfirmModal', 'confirmModalTitle', 'confirmModalBody', 'btnConfirmModalAction',
    'couponToast'
  ];
  for (const id of ids) {
    const tag = id.includes('Select') ? 'select' : id.includes('Input') ? 'input' : id.includes('Form') ? 'form' : 'div';
    elementsById.set(id, new MockEl(tag, id));
  }
  elementsById.get('couponDiscountTypeSelect').value = 'percentage';
  elementsById.get('couponScopeSelect').value = 'all';
  elementsById.get('filterStatusSelect').value = 'all';
  elementsById.get('filterTypeSelect').value = 'all';
  elementsById.get('filterScopeSelect').value = 'all';
  elementsById.get('couponIsActiveToggle').checked = true;

  const documentListeners = new Map();
  const mockDocument = {
    readyState: 'complete',
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    createElement(tag) {
      return new MockEl(tag);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(evt, fn) {
      if (!documentListeners.has(evt)) documentListeners.set(evt, []);
      documentListeners.get(evt).push(fn);
    }
  };

  return { elementsById, mockDocument, MockEl };
}

test('E.59 & F.61–F.68 Dashboard page uses existing nav/auth, server-provided categories, protected API, and has no fake analytics or delete UI', async () => {
  const dashSrc = await fs.readFile(path.resolve('src/pages/dashboard-coupons.astro'), 'utf8');
  const navSrc = await fs.readFile(path.resolve('src/components/DashboardNav.astro'), 'utf8');

  // 61. Uses existing nav & auth guard
  assert.match(navSrc, /href:\s*'\/dashboard-coupons'/);
  assert.match(navSrc, /label:\s*'الكوبونات'/);
  assert.match(dashSrc, /showDashboardNav=\{true\}/);
  assert.match(dashSrc, /admin@dandy\.com/);
  assert.match(dashSrc, /emailVerified\s*!==\s*true/);
  assert.match(dashSrc, /getIdToken\(\)/);

  // 59 & 62. Uses /api/coupons/admin with Bearer token, zero direct RTDB client coupon access
  assert.match(dashSrc, /\/api\/coupons\/admin/);
  assert.match(dashSrc, /Bearer\s+\$\{token\}/);
  assert.equal(/settings\/coupons/.test(dashSrc), false);
  assert.equal(/firebase\.database\(\)/.test(dashSrc), false);

  // 67. No fake analytics counters
  assert.equal(/usageCount|usedCount|usageLimit|redemptions|revenueAttribution/i.test(dashSrc), false);

  // 68. No hard-delete UI & no browser alert()
  assert.equal(/\balert\s*\(/.test(dashSrc), false);
  assert.equal(/\bconfirm\s*\(/.test(dashSrc), false);
  assert.equal(/action:\s*['"]delete['"]/.test(dashSrc), false);

  // Extract inline script and run against DOM + real backend handler!
  const scriptMatches = [...dashSrc.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)];
  assert.equal(scriptMatches.length, 1);
  const scriptCode = scriptMatches[0][1];

  const deps = makeDeps();
  const { elementsById, mockDocument, MockEl } = createDashboardDomHarness();
  const fetchLog = [];

  const mockWindow = {
    location: { href: 'http://localhost:3000/dashboard-coupons', replace(u) { this.href = u; } },
    auth: {
      currentUser: {
        email: 'admin@dandy.com',
        emailVerified: true,
        async getIdToken() {
          return 'token-admin-verified';
        }
      },
      onAuthStateChanged(cb) {
        cb(this.currentUser);
      }
    }
  };

  async function mockFetch(url, init = {}) {
    fetchLog.push({ url, method: init.method || 'GET', headers: init.headers || {} });
    const req = new Request(`http://localhost:3000${url}`, {
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body
    });
    if ((init.method || 'GET').toUpperCase() === 'POST') {
      return await couponsAdminPOST({ request: req, _deps: deps });
    }
    return await couponsAdminGET({ request: req, _deps: deps });
  }

  vm.runInNewContext(scriptCode, {
    window: mockWindow,
    document: mockDocument,
    fetch: mockFetch,
    Intl,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Promise,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console
  });

  // Allow initial loadCoupons async cycle to complete
  await new Promise((r) => setTimeout(r, 25));

  assert.ok(fetchLog.some((f) => f.url === '/api/coupons/admin' && f.headers.Authorization === 'Bearer token-admin-verified'));

  // 63. Category options populated from server-provided taxonomy
  const catOptions = elementsById.get('couponCategorySelect').children.map((o) => o.value).filter(Boolean);
  assert.deepEqual(catOptions.sort(), Object.keys(CATEGORY_TAXONOMY).sort());

  // 64 & 65. Switching scope makes category dropdown required
  const scopeSelect = elementsById.get('couponScopeSelect');
  const catSelect = elementsById.get('couponCategorySelect');
  scopeSelect.value = 'category';
  await scopeSelect.dispatchEvent('change');
  assert.equal(catSelect.required, true);

  scopeSelect.value = 'all';
  await scopeSelect.dispatchEvent('change');
  assert.equal(catSelect.required, false);

  // Create a coupon via form submission
  await elementsById.get('btnOpenCreateCoupon').dispatchEvent('click');
  elementsById.get('couponCodeInput').value = 'dash15';
  elementsById.get('couponDiscountTypeSelect').value = 'percentage';
  elementsById.get('couponDiscountValueInput').value = '15';
  elementsById.get('couponScopeSelect').value = 'category';
  await elementsById.get('couponScopeSelect').dispatchEvent('change');
  elementsById.get('couponCategorySelect').value = 'skin-care';
  await elementsById.get('couponForm').dispatchEvent({ type: 'submit', preventDefault() {} });
  await new Promise((r) => setTimeout(r, 25));

  // 66. Created coupon persisted via API and reflected in summary counters
  assert.equal(elementsById.get('summaryTotalCount').textContent, '1');
  assert.equal(elementsById.get('summaryActiveCount').textContent, '1');
  const storedList = Object.values(deps.adminDb._data.settings.coupons);
  assert.equal(storedList.length, 1);
  assert.equal(storedList[0].code, 'DASH15');

  // Trigger deactivate flow via confirmation modal (no hard delete)
  const toggleBtn = new MockEl('button');
  toggleBtn.setAttribute('data-action', 'toggle-active');
  toggleBtn.setAttribute('data-coupon-id', storedList[0].id);
  await elementsById.get('couponsTableBody').dispatchEvent({ type: 'click', target: toggleBtn });
  await elementsById.get('btnConfirmModalAction').dispatchEvent('click');
  await new Promise((r) => setTimeout(r, 25));

  assert.equal(deps.adminDb._data.settings.coupons[storedList[0].id].isActive, false);
  assert.equal(elementsById.get('summaryActiveCount').textContent, '0');
  assert.equal(elementsById.get('summaryInactiveCount').textContent, '1');
});

// ============================================================================
// SECTION G: Regression & Scope Isolation Verification (Tests 69–74)
// ============================================================================

test('G.69–G.74 Scope isolation: approved checkout coupon integration exists while analytics counters, redemption writes, and inventory tracking remain absent', async () => {
  const [createOrderSrc, validateSrc, storePolicySrc, couponsSrc, apiSrc, dashCouponsSrc, rulesSrc] = await Promise.all([
    fs.readFile(path.resolve('src/pages/api/create-order.js'), 'utf8'),
    fs.readFile(path.resolve('src/pages/api/coupons/validate.js'), 'utf8'),
    fs.readFile(path.resolve('src/config/store-policy.ts'), 'utf8'),
    fs.readFile(path.resolve('src/utils/coupons.ts'), 'utf8'),
    fs.readFile(path.resolve('src/pages/api/coupons/admin.js'), 'utf8'),
    fs.readFile(path.resolve('src/pages/dashboard-coupons.astro'), 'utf8'),
    fs.readFile(path.resolve('firebase/database.rules.json'), 'utf8')
  ]);

  // Coupon administration remains in src/pages/api/coupons/admin.js
  assert.ok(apiSrc.includes("const COUPONS_RTDB_PATH = 'settings/coupons'"));
  assert.ok(apiSrc.includes('verifyAdminRequest'));

  // Approved GROUP 2A.6 checkout integration exists in create-order via server-side evaluateCouponEligibility() and orderData.coupon
  assert.ok(createOrderSrc.includes('evaluateCouponEligibility('));
  assert.ok(createOrderSrc.includes('validateCouponDefinition('));
  assert.ok(createOrderSrc.includes('orderData.coupon = appliedCouponSnapshot'));

  // 70. Free shipping rule remains untouched
  assert.match(storePolicySrc, /FREE_SHIPPING_THRESHOLD_EGP\s*=\s*2000/);

  // 72. No inventory logic or stockQuantity added in coupon files or coupon validate API
  assert.equal(/stockQuantity/i.test(couponsSrc), false);
  assert.equal(/stockQuantity/i.test(apiSrc), false);
  assert.equal(/stockQuantity/i.test(validateSrc), false);
  // Pre-existing product stock deduction in create-order does not interact with coupons
  assert.equal(/coupon[^\n]{0,80}stock|stock[^\n]{0,80}coupon/i.test(createOrderSrc), false);

  // No GROUP 2A.7 analytics/usage counters in coupon module, admin API, validate API, create-order, or coupon dashboard
  assert.equal(/usageCount|usedCount|usageLimit|lastUsedAt/i.test(couponsSrc), false);
  assert.equal(/usageCount|usedCount|usageLimit|lastUsedAt/i.test(apiSrc), false);
  assert.equal(/usageCount|usedCount|usageLimit|lastUsedAt/i.test(validateSrc), false);
  assert.equal(/usageCount|usedCount|usageLimit|lastUsedAt/i.test(createOrderSrc), false);
  assert.equal(/usageCount|usedCount|usageLimit|lastUsedAt/i.test(dashCouponsSrc), false);

  // No separate coupon redemption writes in checkout or preview APIs
  assert.equal(/couponRedemptions|settings\/coupons[^\n]*\.(set|update|push|transaction)/i.test(createOrderSrc), false);
  assert.equal(/couponRedemptions|settings\/coupons[^\n]*\.(set|update|push|transaction)/i.test(validateSrc), false);
  assert.ok(dashCouponsSrc.includes('GROUP 2A.7'));

  // Firebase rules still deny client reads/writes on settings
  const parsedRules = JSON.parse(rulesSrc);
  assert.equal(parsedRules.rules.settings['.read'], false);
  assert.equal(parsedRules.rules.settings['.write'], false);
});

