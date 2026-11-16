// test/group2a31-server-variant-pricing.test.mjs
// DANDY PHASE 2 / GROUP 2A.3.1: Server-Side Variant Pricing & Validation Alignment

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import fsSync from 'node:fs';
import vm from 'node:vm';
import {
  normalizeProductVariants,
  isSupportedVariantType,
  hasSelectableProductVariants,
  hasExposedCollectionVariantSelector,
  getExposedCollectionVariantOptions,
  validateAndResolveOrderItemVariants,
  validateAndResolveCollectionItemVariant,
  calculateAuthoritativeItemPricing
} from '../src/utils/server-variant-pricing.ts';
import {
  computeOrderRequestFingerprint,
  hashClientRequestId
} from '../src/utils/order-idempotency.ts';
import { calculateOrderFinancials } from '../src/utils/email-service.ts';
import { formatOrderMessage } from '../src/utils/telegram.js';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';

function loadFrontendVariants() {
  const source = fsSync.readFileSync(path.resolve('public/assets/js/variants.js'), 'utf8');
  const sandbox = {
    window: null,
    globalThis: null,
    module: { exports: {} },
    exports: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.DandyVariants;
}
const frontendVariants = loadFrontendVariants();

function createMockAdminDb(initialData = {}, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  let pushCounter = 0;

  function getAtPath(pathStr) {
    if (!pathStr) return data;
    const parts = pathStr.split('/').filter(Boolean);
    let curr = data;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return undefined;
      curr = curr[p];
    }
    return curr === undefined ? null : curr;
  }

  function setAtPath(pathStr, val) {
    const parts = pathStr.split('/').filter(Boolean);
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

  function makeRef(pathStr = '') {
    return {
      key: pathStr.split('/').filter(Boolean).pop() || null,
      async once() {
        const val = getAtPath(pathStr);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        setAtPath(pathStr, val);
      },
      async update(updates) {
        if (pathStr) {
          const existing = getAtPath(pathStr) || {};
          setAtPath(pathStr, { ...existing, ...updates });
        } else {
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
        }
      },
      push() {
        pushCounter++;
        const newKey = `-MockOrder_${pushCounter}`;
        const childPath = pathStr ? `${pathStr}/${newKey}` : newKey;
        return makeRef(childPath);
      },
      async transaction(updater) {
        const current = getAtPath(pathStr);
        const clonedCurrent =
          current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
        const nextVal = updater(clonedCurrent);
        if (nextVal !== undefined) {
          setAtPath(pathStr, nextVal);
        }
        const finalVal = getAtPath(pathStr);
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
      items: payload.items ?? [{ productId: 'prod_simple', quantity: 1 }],
      turnstileToken: payload.turnstileToken ?? 'valid_turnstile',
      ...(payload.clientRequestId !== undefined ? { clientRequestId: payload.clientRequestId } : {}),
      ...(payload.extraBody || {})
    })
  });
}

function createOrderDeps(adminDb, overrides = {}) {
  const sentEmails = [];
  const sentTelegrams = [];
  const hexKey = crypto.randomBytes(32).toString('hex');

  return {
    sentEmails,
    sentTelegrams,
    deps: {
      adminDb,
      adminAuth: null,
      redis: null,
      encryptionKey: hexKey,
      skipPublishedCampaignFallback: true,
      verifyTurnstileToken: async () => ({ success: true }),
      sendOrderNotification: async (payload) => {
        sentEmails.push(payload);
        return { success: true };
      },
      sendTelegramNotification: async (payload) => {
        sentTelegrams.push(payload);
        return { success: true, status: 'SUCCESS', totalSent: 1, totalFailed: 0 };
      },
      ...overrides
    }
  };
}

function createBaseProductsFixture() {
  return {
    prod_simple: {
      name: 'غسول الوجه اللطيف',
      price: 250,
      hasVariants: false,
      image: 'https://example.com/cleanser.jpg'
    },
    prod_scent: {
      name: 'مسك داندي',
      price: 500,
      hasVariants: true,
      variantType: 'scent',
      image: 'https://example.com/musk.jpg',
      variants: [
        { id: 'rose', name: 'الورد', isAvailable: true },
        { id: 'musk', name: 'المسك', isAvailable: true },
        { id: 'amber', name: 'العنبر', isAvailable: true },
        { id: 'oud', name: 'العود', isAvailable: false }
      ]
    },
    prod_other: {
      name: 'زبدة الجسم',
      price: 400,
      hasVariants: true,
      variantType: 'scent',
      variants: {
        vanilla: { name: 'فانيليا', isAvailable: true },
        coconut: 'جوز الهند'
      }
    },
    prod_all_unavailable: {
      name: 'معطر موسمي',
      price: 300,
      hasVariants: true,
      variantType: 'scent',
      variants: [
        { id: 'v1', name: 'نسيم البحر', isAvailable: false },
        { id: 'v2', name: 'الياسمين', isAvailable: false }
      ]
    }
  };
}

// ===========================================================================
// A. Pure Unit Tests: Normalization, Validation, & Pricing Multiplier
// ===========================================================================

test('1. Pure helper normalizes Firebase array, object-map, primitive, and sparse variant schemas identically to variants.js', () => {
  const fromArray = normalizeProductVariants({
    hasVariants: true,
    variants: [
      null,
      { name: '' },
      { id: 'rose', name: ' الورد ', isAvailable: true },
      { name: ' مسك أبيض ' }, // missing id -> fallback to trimmed name
      { id: 'oud', name: 'العود', isAvailable: false }
    ]
  });
  assert.deepEqual(fromArray, [
    { id: 'rose', name: 'الورد', isAvailable: true },
    { id: 'مسك أبيض', name: 'مسك أبيض', isAvailable: true },
    { id: 'oud', name: 'العود', isAvailable: false }
  ]);

  const fromObjectMap = normalizeProductVariants({
    hasVariants: 'true',
    variants: {
      nilEntry: null,
      vanilla: { name: 'فانيليا', isAvailable: true },
      coconut: 'جوز الهند',
      disabledKey: { id: 'lotus', name: 'لوتس', isAvailable: false }
    }
  });
  assert.deepEqual(fromObjectMap, [
    { id: 'vanilla', name: 'فانيليا', isAvailable: true },
    { id: 'coconut', name: 'جوز الهند', isAvailable: true },
    { id: 'lotus', name: 'لوتس', isAvailable: false }
  ]);

  assert.equal(hasSelectableProductVariants({ hasVariants: 'true', variants: { a: 'عنبر' } }), true);
  assert.equal(hasSelectableProductVariants({ hasVariants: false, variants: { a: 'عنبر' } }), false);
  assert.equal(hasSelectableProductVariants({ hasVariants: true, variants: [null, {}] }), false);
});

test('2. Pure pricing helper mirrors getEffectiveUnitPrice across single, multi-variant, and Pink Friday pricing', () => {
  const single = calculateAuthoritativeItemPricing({
    basePrice: 500,
    variantMultiplier: 1,
    quantity: 2
  });
  assert.deepEqual(single, {
    singleVariantUnitPrice: 500,
    variantMultiplier: 1,
    effectiveUnitPrice: 500,
    lineTotal: 1000
  });

  const multi = calculateAuthoritativeItemPricing({
    basePrice: 500,
    variantMultiplier: 3,
    quantity: 2
  });
  assert.deepEqual(multi, {
    singleVariantUnitPrice: 500,
    variantMultiplier: 3,
    effectiveUnitPrice: 1500,
    lineTotal: 3000
  });

  const pfMulti = calculateAuthoritativeItemPricing({
    basePrice: 500,
    campaignPrice: 399,
    isPinkFridayEligible: true,
    variantMultiplier: 2,
    quantity: 2
  });
  assert.deepEqual(pfMulti, {
    singleVariantUnitPrice: 399,
    variantMultiplier: 2,
    effectiveUnitPrice: 798,
    lineTotal: 1596
  });
});

// ===========================================================================
// B. Server API Integration Tests (`POST /api/create-order`)
// ===========================================================================

test('3. Product without variants works with omitted or empty selectedVariants at 1x base price and zero variant metadata', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  const req1 = makeOrderRequest({
    clientRequestId: crypto.randomUUID(),
    items: [{ productId: 'prod_simple', quantity: 2 }]
  });
  const res1 = await createOrderPOST({ request: req1, clientAddress: '41.41.1.1', _deps: deps });
  assert.equal(res1.status, 200);
  const body1 = await res1.json();
  assert.equal(body1.subtotal, 500);
  assert.equal(body1.shippingFee, 85);
  assert.equal(body1.totalAmount, 585);

  const savedOrder1 = db.data.orders[body1.orderId];
  assert.equal(savedOrder1.products[0].effectiveUnitPrice, 250);
  assert.equal(savedOrder1.products[0].lineTotal, 500);
  assert.equal(savedOrder1.products[0].selectedVariants, undefined);
  assert.equal(savedOrder1.products[0].variantName, undefined);

  // Also test cart.astro shape sending selectedVariants: []
  const req2 = makeOrderRequest({
    clientRequestId: crypto.randomUUID(),
    items: [{ productId: 'prod_simple', quantity: 1, selectedVariants: [] }]
  });
  const res2 = await createOrderPOST({ request: req2, clientAddress: '41.41.1.2', _deps: deps });
  assert.equal(res2.status, 200);
  const body2 = await res2.json();
  assert.equal(body2.subtotal, 250);
});

test('4. Product with single valid variant calculates 1x unit price and stores authoritative variant snapshot', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  const req = makeOrderRequest({
    clientRequestId: crypto.randomUUID(),
    items: [
      {
        productId: 'prod_scent',
        quantity: 2,
        selectedVariants: [{ id: 'rose', name: 'الورد' }]
      }
    ]
  });

  const res = await createOrderPOST({ request: req, clientAddress: '41.41.1.3', _deps: deps });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.subtotal, 1000);
  assert.equal(body.shippingFee, 85);
  assert.equal(body.totalAmount, 1085);

  const snap = db.data.orders[body.orderId].products[0];
  assert.equal(snap.price, 500);
  assert.equal(snap.effectiveUnitPrice, 500);
  assert.equal(snap.lineTotal, 1000);
  assert.deepEqual(snap.selectedVariants, [{ id: 'rose', name: 'الورد' }]);
  assert.deepEqual(snap.selectedVariant, { id: 'rose', name: 'الورد' });
  assert.equal(snap.variantName, 'الورد');
});

test('5. Multi-variant selection (2 and 3 scents, with quantity > 1) charges basePrice * variantCount * quantity', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  // 2 scents * 500 EGP * 1 qty = 1000 EGP
  const res2 = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 1,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'amber', name: 'العنبر' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.1.4',
    _deps: deps
  });
  assert.equal(res2.status, 200);
  const body2 = await res2.json();
  assert.equal(body2.subtotal, 1000);
  assert.equal(body2.shippingFee, 85);
  assert.equal(body2.totalAmount, 1085);

  const snap2 = db.data.orders[body2.orderId].products[0];
  assert.equal(snap2.effectiveUnitPrice, 1000);
  assert.equal(snap2.lineTotal, 1000);
  assert.deepEqual(snap2.selectedVariants, [
    { id: 'amber', name: 'العنبر' },
    { id: 'rose', name: 'الورد' }
  ]);
  assert.equal(snap2.selectedVariant, undefined);
  assert.equal(snap2.variantName, 'العنبر، الورد');

  // 3 scents * 500 EGP * 2 qty = 3000 EGP (> 2000 => free shipping)
  const res3 = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 2,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' },
            { id: 'amber', name: 'العنبر' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.1.5',
    _deps: deps
  });
  assert.equal(res3.status, 200);
  const body3 = await res3.json();
  assert.equal(body3.subtotal, 3000);
  assert.equal(body3.shippingFee, 0);
  assert.equal(body3.totalAmount, 3000);

  const snap3 = db.data.orders[body3.orderId].products[0];
  assert.equal(snap3.effectiveUnitPrice, 1500);
  assert.equal(snap3.lineTotal, 3000);
  assert.deepEqual(snap3.selectedVariants, [
    { id: 'amber', name: 'العنبر' },
    { id: 'musk', name: 'المسك' },
    { id: 'rose', name: 'الورد' }
  ]);
  assert.equal(snap3.variantName, 'العنبر، المسك، الورد');
});

test('6. Duplicate variant IDs are deterministically deduplicated so they cannot inflate the pricing multiplier', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  // Duplicate same scent 3 times -> multiplier MUST be 1, NOT 3
  const resSingleDup = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 2,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'rose', name: 'الورد' },
            { id: 'rose', name: 'الورد' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.1.6',
    _deps: deps
  });
  assert.equal(resSingleDup.status, 200);
  const bodySingleDup = await resSingleDup.json();
  assert.equal(bodySingleDup.subtotal, 1000); // 500 * 1 * 2

  const snapSingle = db.data.orders[bodySingleDup.orderId].products[0];
  assert.equal(snapSingle.effectiveUnitPrice, 500);
  assert.deepEqual(snapSingle.selectedVariants, [{ id: 'rose', name: 'الورد' }]);
  assert.deepEqual(snapSingle.selectedVariant, { id: 'rose', name: 'الورد' });
  assert.equal(snapSingle.variantName, 'الورد');

  // Mix of [rose, musk, rose] -> deduplicated to 2 distinct scents -> multiplier = 2
  const resMultiDup = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 1,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' },
            { id: 'rose', name: 'الورد' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.1.7',
    _deps: deps
  });
  assert.equal(resMultiDup.status, 200);
  const bodyMultiDup = await resMultiDup.json();
  assert.equal(bodyMultiDup.subtotal, 1000); // 500 * 2 * 1
  assert.equal(db.data.orders[bodyMultiDup.orderId].products[0].selectedVariants.length, 2);
});

test('7. Rejects unknown, foreign, and unavailable variants (including mixed valid + invalid arrays) with HTTP 400 and creates zero orders', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  const badPayloads = [
    // Unknown variant ID
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: 'nonexistent', name: 'غير موجود' }] },
    // Foreign variant ID belonging to prod_other
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: 'vanilla', name: 'فانيليا' }] },
    // Unavailable variant (`oud` has isAvailable: false)
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: 'oud', name: 'العود' }] },
    // Mixed valid + unavailable (must reject entire order, NOT silently strip)
    {
      productId: 'prod_scent',
      quantity: 1,
      selectedVariants: [
        { id: 'rose', name: 'الورد' },
        { id: 'oud', name: 'العود' }
      ]
    },
    // Mixed valid + foreign
    {
      productId: 'prod_scent',
      quantity: 1,
      selectedVariants: [
        { id: 'rose', name: 'الورد' },
        { id: 'vanilla', name: 'فانيليا' }
      ]
    }
  ];

  for (let i = 0; i < badPayloads.length; i++) {
    const reqId = crypto.randomUUID();
    const res = await createOrderPOST({
      request: makeOrderRequest({
        clientRequestId: reqId,
        items: [badPayloads[i]]
      }),
      clientAddress: `41.41.2.${i + 1}`,
      _deps: deps
    });
    assert.equal(res.status, 400, `Expected 400 for bad payload #${i}`);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(['VARIANT_NOT_FOUND', 'VARIANT_UNAVAILABLE'].includes(body.error));

    // Idempotency lock must be reconciled to FAILED (never left stuck in PENDING)
    const idemRec = db.data.privateOrderIdempotency[hashClientRequestId(reqId)];
    assert.equal(idemRec.status, 'FAILED');
  }

  assert.equal(db.data.orders, undefined);
});

test('8. Rejects empty selections on variant-enabled products and unavailable-only variant products', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  const emptyCases = [
    [{ productId: 'prod_scent', quantity: 1 }],
    [{ productId: 'prod_scent', quantity: 1, selectedVariants: [] }],
    [{ productId: 'prod_all_unavailable', quantity: 1 }],
    [{ productId: 'prod_all_unavailable', quantity: 1, selectedVariants: [{ id: 'v1', name: 'نسيم البحر' }] }]
  ];

  for (let i = 0; i < emptyCases.length; i++) {
    const res = await createOrderPOST({
      request: makeOrderRequest({
        clientRequestId: crypto.randomUUID(),
        items: emptyCases[i]
      }),
      clientAddress: `41.41.3.${i + 1}`,
      _deps: deps
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(['VARIANT_REQUIRED', 'NO_AVAILABLE_VARIANTS'].includes(body.error));
  }
  assert.equal(db.data.orders, undefined);
});

test('9. Rejects malformed variant structures and rejects variants submitted for non-variant products', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  const malformedItems = [
    { productId: 'prod_scent', quantity: 1, selectedVariants: 'rose' },
    { productId: 'prod_scent', quantity: 1, selectedVariants: { rose: true } },
    { productId: 'prod_scent', quantity: 1, selectedVariants: 123 },
    { productId: 'prod_scent', quantity: 1, selectedVariants: [null] },
    { productId: 'prod_scent', quantity: 1, selectedVariants: ['rose'] },
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{}] },
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: '' }] },
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: '   ', name: 'الورد' }] },
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: 123, name: 'الورد' }] },
    { productId: 'prod_scent', quantity: 1, selectedVariants: [{ id: 'rose', name: 999 }] },
    { productId: 'prod_scent', quantity: 1, selectedVariant: 'rose' },
    { productId: 'prod_scent', quantity: 1, selectedVariant: { name: 'الورد' } },
    { productId: 'prod_scent', quantity: 1, variantId: 123 },
    { productId: 'prod_scent', quantity: 1, variantName: 'الورد' },
    // Non-variant product with injected variant selections
    { productId: 'prod_simple', quantity: 1, selectedVariants: [{ id: 'rose', name: 'الورد' }] },
    { productId: 'prod_simple', quantity: 1, selectedVariant: { id: 'rose', name: 'الورد' } },
    { productId: 'prod_simple', quantity: 1, variantId: 'rose' },
    { productId: 'prod_simple', quantity: 1, variantName: 'الورد' }
  ];

  for (let i = 0; i < malformedItems.length; i++) {
    const res = await createOrderPOST({
      request: makeOrderRequest({
        clientRequestId: crypto.randomUUID(),
        items: [malformedItems[i]]
      }),
      clientAddress: `41.41.4.${i + 1}`,
      _deps: deps
    });
    assert.equal(res.status, 400, `Expected 400 for malformed payload #${i}`);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_VARIANT_SELECTION');
  }
  assert.equal(db.data.orders, undefined);
});

test('10. Rejects invalid quantities and illegal product IDs safely with HTTP 400', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  const badInputs = [
    { productId: 'prod_simple', quantity: 0 },
    { productId: 'prod_simple', quantity: -2 },
    { productId: 'prod_simple', quantity: 1.5 },
    { productId: 'prod_simple', quantity: 'abc' },
    { productId: 'prod_simple', quantity: null },
    { productId: '../orders', quantity: 1 },
    { productId: 'prod.bad', quantity: 1 },
    { productId: '', quantity: 1 }
  ];

  for (let i = 0; i < badInputs.length; i++) {
    const res = await createOrderPOST({
      request: makeOrderRequest({
        clientRequestId: crypto.randomUUID(),
        items: [badInputs[i]]
      }),
      clientAddress: `41.41.5.${i + 1}`,
      _deps: deps
    });
    assert.equal(res.status, 400, `Expected 400 for invalid qty/product #${i}`);
  }
  assert.equal(db.data.orders, undefined);
});

test('11. Client-submitted variant names and tampered prices are completely ignored in favor of authoritative Firebase product records', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps, sentEmails, sentTelegrams } = createOrderDeps(db);

  const req = makeOrderRequest({
    clientRequestId: crypto.randomUUID(),
    items: [
      {
        productId: 'prod_scent',
        name: 'منتج مزيف بسعر 1 جنيه',
        price: 1,
        effectiveUnitPrice: 1,
        lineTotal: 1,
        quantity: 2,
        selectedVariants: [
          { id: 'rose', name: '<script>alert(1)</script> خصم وهمي' },
          { id: 'amber', name: 'اسم مزور' }
        ]
      }
    ],
    extraBody: {
      subtotal: 1,
      shippingFee: 0,
      totalAmount: 1
    }
  });

  const res = await createOrderPOST({ request: req, clientAddress: '41.41.6.1', _deps: deps });
  assert.equal(res.status, 200);
  const body = await res.json();

  // 500 EGP * 2 variants * 2 qty = 2000 EGP (NOT > 2000, so shipping = 85 EGP!)
  assert.equal(body.subtotal, 2000);
  assert.equal(body.shippingFee, 85);
  assert.equal(body.totalAmount, 2085);

  const savedOrder = db.data.orders[body.orderId];
  assert.equal(savedOrder.products[0].name, 'مسك داندي');
  assert.deepEqual(savedOrder.products[0].selectedVariants, [
    { id: 'amber', name: 'العنبر' },
    { id: 'rose', name: 'الورد' }
  ]);
  assert.equal(savedOrder.products[0].variantName, 'العنبر، الورد');
  assert.equal(savedOrder.products[0].effectiveUnitPrice, 1000);
  assert.equal(savedOrder.products[0].lineTotal, 2000);

  // Downstream notifications match authoritative variant names and totals
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].order.totalAmount, 2085);
  assert.equal(sentEmails[0].order.products[0].variantName, 'العنبر، الورد');
  const emailFinancials = calculateOrderFinancials(sentEmails[0].order);
  assert.equal(emailFinancials.subtotal, 2000);
  assert.equal(emailFinancials.shippingFee, 85);
  assert.equal(emailFinancials.totalAmount, 2085);

  assert.equal(sentTelegrams.length, 1);
  const tgHtml = formatOrderMessage(sentTelegrams[0].order, body.orderId);
  assert.ok(tgHtml.includes('العنبر، الورد'));
  assert.ok(tgHtml.includes('2000 EGP'));
  assert.ok(tgHtml.includes('2085 EGP'));
});

test('12. Shipping free-threshold (> 2000 EGP strict) stays aligned with multi-variant subtotals', async () => {
  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  // 500 * 2 scents * 2 qty = 2000 EGP -> NOT free shipping (85 EGP Cairo)
  const atThresholdRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 2,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.7.1',
    _deps: deps
  });
  assert.equal(atThresholdRes.status, 200);
  const atBody = await atThresholdRes.json();
  assert.equal(atBody.subtotal, 2000);
  assert.equal(atBody.shippingFee, 85);
  assert.equal(atBody.totalAmount, 2085);

  // 500 * 2 scents * 2 qty + 250 simple = 2250 EGP (> 2000) -> free shipping (0 EGP)
  const aboveThresholdRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 2,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' }
          ]
        },
        { productId: 'prod_simple', quantity: 1 }
      ]
    }),
    clientAddress: '41.41.7.2',
    _deps: deps
  });
  assert.equal(aboveThresholdRes.status, 200);
  const aboveBody = await aboveThresholdRes.json();
  assert.equal(aboveBody.subtotal, 2250);
  assert.equal(aboveBody.shippingFee, 0);
  assert.equal(aboveBody.totalAmount, 2250);
});

test('13. Supports object-map, primitive, sparse-array Firebase variants, compound id, and legacy selectedVariant / variantId inputs', async () => {
  const db = createMockAdminDb({
    products: {
      ...createBaseProductsFixture(),
      prod_sparse: {
        name: 'عطر مركب',
        price: 300,
        hasVariants: 'true',
        variants: [null, { name: '   ' }, { name: 'مسك أبيض' }, { id: 'lavender', name: 'لافندر', isAvailable: true }]
      }
    }
  });
  const { deps } = createOrderDeps(db);

  const res = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        // Object map + primitive variant (`coconut`) + compound `id`
        {
          id: 'prod_other::coconut_vanilla',
          quantity: 1,
          selectedVariants: [
            { id: 'vanilla', name: 'Wrong' },
            { id: 'coconut', name: 'Wrong' }
          ]
        },
        // Legacy `selectedVariant` with missing-id fallback (`مسك أبيض`)
        {
          productId: 'prod_sparse',
          quantity: 1,
          selectedVariant: { id: 'مسك أبيض', name: 'أي اسم' }
        },
        // Legacy `variantId`
        {
          productId: 'prod_sparse',
          quantity: 2,
          variantId: 'lavender'
        }
      ]
    }),
    clientAddress: '41.41.8.1',
    _deps: deps
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  // prod_other: 400 * 2 = 800; prod_sparse #1: 300 * 1 = 300; prod_sparse #2: 300 * 2 = 600 => 1700
  assert.equal(body.subtotal, 1700);
  assert.equal(body.shippingFee, 85);
  assert.equal(body.totalAmount, 1785);

  const orderProds = db.data.orders[body.orderId].products;
  assert.equal(orderProds[0].variantName, 'جوز الهند، فانيليا');
  assert.equal(orderProds[1].variantName, 'مسك أبيض');
  assert.equal(orderProds[2].variantName, 'لافندر');
});

test('14. Preserves Pink Friday single-product multi-variant pricing, campaign conflict check, and Pink Friday collection bundles', async () => {
  const now = Date.now();
  const campaign = {
    enabled: true,
    startAt: new Date(now - 3600_000).toISOString(),
    endAt: new Date(now + 3600_000).toISOString(),
    offers: [
      {
        productId: 'prod_scent',
        expectedBasePrice: 500,
        campaignPrice: 399,
        active: true,
        badgeText: 'عرض Pink Friday'
      }
    ],
    collections: [
      {
        id: 'col_pf_1',
        name: 'باقة الروائح الفاخرة',
        active: true,
        pricingType: 'package',
        packagePrice: 650,
        badgeText: 'باقة خاصة',
        items: [
          { collectionItemId: 'slot_1', productId: 'prod_simple' },
          { collectionItemId: 'slot_2', productId: 'prod_scent' }
        ]
      }
    ]
  };

  const db = createMockAdminDb({
    products: createBaseProductsFixture(),
    settings: { pinkFriday: { publishedActiveCampaign: campaign } }
  });
  const { deps } = createOrderDeps(db);

  const res = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        // Single PF product with 2 variants * 2 qty = 399 * 2 * 2 = 1596
        {
          productId: 'prod_scent',
          quantity: 2,
          isPinkFriday: true,
          campaignPrice: 399,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' }
          ]
        },
        // PF collection bundle = 650 * 1 = 650
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_pf_1',
          quantity: 1,
          selectedItems: [
            { collectionItemId: 'slot_2', productId: 'prod_scent', selectedVariant: { id: 'amber', name: 'العنبر' } }
          ]
        }
      ]
    }),
    clientAddress: '41.41.9.1',
    _deps: deps
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.subtotal, 1596 + 650); // 2246 (> 2000 => free shipping)
  assert.equal(body.shippingFee, 0);
  assert.equal(body.totalAmount, 2246);

  const pfSnap = db.data.orders[body.orderId].products[0];
  assert.equal(pfSnap.isPinkFriday, true);
  assert.equal(pfSnap.campaignPrice, 399);
  assert.equal(pfSnap.regularPrice, 500);
  assert.equal(pfSnap.effectiveUnitPrice, 798);
  assert.equal(pfSnap.lineTotal, 1596);
  assert.equal(pfSnap.variantName, 'المسك، الورد');

  // Expired campaign claim must still fail with 409 CAMPAIGN_OFFER_CONFLICT
  const expiredDb = createMockAdminDb({
    products: createBaseProductsFixture(),
    settings: { pinkFriday: { publishedActiveCampaign: { enabled: false } } }
  });
  const expiredRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 1,
          isPinkFriday: true,
          campaignPrice: 399,
          selectedVariants: [{ id: 'rose', name: 'الورد' }]
        }
      ]
    }),
    clientAddress: '41.41.9.2',
    _deps: createOrderDeps(expiredDb).deps
  });
  assert.equal(expiredRes.status, 409);
  assert.equal((await expiredRes.json()).error, 'CAMPAIGN_OFFER_CONFLICT');
});

test('15. Idempotency fingerprint treats reordered equivalent variant sets as identical (replay 200) and rejects mismatched variant sets (409)', async () => {
  const baseInput = {
    name: 'ليلى محمد',
    phone: '01012345678',
    email: 'layla@example.com',
    governorate: 'Cairo',
    city: 'مدينة نصر',
    address: 'شارع عباس العقاد',
    customerId: null
  };

  const fpOrderA = computeOrderRequestFingerprint({
    ...baseInput,
    items: [
      {
        productId: 'prod_scent',
        quantity: 2,
        selectedVariants: [
          { id: 'rose', name: 'الورد' },
          { id: 'musk', name: 'المسك' }
        ]
      }
    ]
  });
  const fpOrderB = computeOrderRequestFingerprint({
    ...baseInput,
    items: [
      {
        productId: 'prod_scent',
        quantity: 2,
        selectedVariants: [
          { id: 'musk', name: 'المسك' },
          { id: 'rose', name: 'الورد' }
        ]
      }
    ]
  });
  const fpDifferent = computeOrderRequestFingerprint({
    ...baseInput,
    items: [
      {
        productId: 'prod_scent',
        quantity: 2,
        selectedVariants: [{ id: 'amber', name: 'العنبر' }]
      }
    ]
  });
  assert.equal(fpOrderA, fpOrderB);
  assert.notEqual(fpOrderA, fpDifferent);

  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);
  const reqId = crypto.randomUUID();

  // First submission: [rose, musk]
  const res1 = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqId,
      items: [
        {
          productId: 'prod_scent',
          quantity: 1,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.10.1',
    _deps: deps
  });
  assert.equal(res1.status, 200);
  const body1 = await res1.json();

  // Retry with same clientRequestId and reordered [musk, rose] -> idempotent 200 replay, same orderId
  const resReplay = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqId,
      items: [
        {
          productId: 'prod_scent',
          quantity: 1,
          selectedVariants: [
            { id: 'musk', name: 'المسك' },
            { id: 'rose', name: 'الورد' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.10.1',
    _deps: deps
  });
  assert.equal(resReplay.status, 200);
  const bodyReplay = await resReplay.json();
  assert.equal(bodyReplay.orderId, body1.orderId);
  assert.equal(Object.keys(db.data.orders).length, 1);

  // Reuse same clientRequestId with incompatible variant selection -> 409 IDEMPOTENCY_CONFLICT
  const resConflict = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: reqId,
      items: [
        {
          productId: 'prod_scent',
          quantity: 1,
          selectedVariants: [{ id: 'amber', name: 'العنبر' }]
        }
      ]
    }),
    clientAddress: '41.41.10.1',
    _deps: deps
  });
  assert.equal(resConflict.status, 409);
  assert.equal((await resConflict.json()).error, 'IDEMPOTENCY_CONFLICT');
});

test('16. Zero inventory system introduced: products without stockQuantity stay untouched and variant availability never reads stockQuantity', async () => {
  const pricingSrc = await fs.readFile(path.resolve('src/utils/server-variant-pricing.ts'), 'utf8');
  assert.equal(/stockQuantity/.test(pricingSrc), false);

  const db = createMockAdminDb({ products: createBaseProductsFixture() });
  const { deps } = createOrderDeps(db);

  // Product has no stockQuantity field, ordered with quantity 15 and 2 variants -> succeeds without creating stockQuantity
  const res = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          productId: 'prod_scent',
          quantity: 15,
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'musk', name: 'المسك' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.11.1',
    _deps: deps
  });
  assert.equal(res.status, 200);
  assert.equal(db.data.products.prod_scent.stockQuantity, undefined);
});

// ===========================================================================
// C. GROUP 2A.3.1.1 — Frontend/Backend Eligibility Parity & Pink Friday Collections
// ===========================================================================

test('17. GROUP 2A.3.1.2 Unified Eligibility Parity: product page, variants.js, and backend agree on supported vs unsupported variantType', async () => {
  const fixtures = [
    // 1. hasVariants: true with missing variantType (supported scent selector)
    {
      name: 'مسك بدون نوع',
      hasVariants: true,
      variants: [
        { id: 'rose', name: 'الورد', isAvailable: true },
        { id: 'oud', name: 'العود', isAvailable: false }
      ]
    },
    // 2. hasVariants: "true" with variantType: "scent" (supported scent selector)
    {
      name: 'بادي سبلاش',
      hasVariants: 'true',
      variantType: 'scent',
      variants: {
        musk: { name: 'المسك', isAvailable: true },
        amber: 'العنبر'
      }
    },
    // 3. Unsupported non-scent variantType values (`flavor`, `size`, `color`) -> MUST NOT require hidden selection
    {
      name: 'بلسم الشفاه',
      hasVariants: true,
      variantType: 'flavor',
      variants: [
        { id: 'strawberry', name: 'Strawberry', isAvailable: true },
        { id: 'توت بري', name: 'توت بري', isAvailable: true }
      ]
    },
    {
      name: 'زيت الشعر',
      hasVariants: true,
      variantType: 'size',
      variants: [{ name: '100ml' }, { id: '250ml', name: '250ml', isAvailable: false }]
    },
    // 4. Whitespace-only variantType treated cleanly as omitted/supported
    {
      name: 'معطر بمسافة فارغة في النوع',
      hasVariants: true,
      variantType: '   ',
      variants: [{ id: 'musk', name: 'المسك', isAvailable: true }]
    },
    // 5. Product without hasVariants / hasVariants: false / 'false'
    {
      name: 'غسول بسيط',
      variants: [{ id: 'v1', name: 'خيار' }]
    },
    {
      name: 'كريم يدين',
      hasVariants: false,
      variantType: 'scent',
      variants: [{ id: 'v1', name: 'لافندر' }]
    },
    {
      name: 'كريم يدين نصي',
      hasVariants: 'false',
      variantType: 'scent',
      variants: [{ id: 'v1', name: 'لافندر' }]
    },
    // 6. Malformed or empty variants
    { name: 'فارغ 1', hasVariants: true, variants: [] },
    { name: 'فارغ 2', hasVariants: true, variants: {} },
    { name: 'فارغ 3', hasVariants: true, variants: [null, undefined, {}, { name: '   ' }] },
    { name: 'فارغ 4', hasVariants: true, variants: 'not-an-object' },
    // 7. Arabic + English names, missing IDs, sparse arrays
    {
      name: 'عطر مختلط',
      hasVariants: true,
      variants: [
        null,
        { name: ' White Musk ' },
        { id: 'ar-oud', name: ' العود الملكي ', isAvailable: true },
        { id: 'vanilla-en', name: 'Warm Vanilla', isAvailable: false }
      ]
    }
  ];

  for (const prod of fixtures) {
    assert.equal(
      isSupportedVariantType(prod),
      frontendVariants.isSupportedVariantType(prod),
      `Parity mismatch on isSupportedVariantType for ${prod.name}`
    );

    const feSelectable = frontendVariants.hasSelectableVariants(prod);
    const beSelectable = hasSelectableProductVariants(prod);
    assert.equal(beSelectable, feSelectable, `Parity mismatch on hasSelectableVariants for ${prod.name}`);

    const feList = JSON.parse(
      JSON.stringify(
        frontendVariants.getProductVariants(prod).map((v) => ({
          id: String(v.id),
          name: String(v.name),
          isAvailable: v.isAvailable !== false
        }))
      )
    );
    const beList = normalizeProductVariants(prod);
    assert.deepEqual(beList, feList, `Parity mismatch on normalizeProductVariants for ${prod.name}`);
  }

  // Unsupported variantType products allow checkout WITHOUT selecting hidden options,
  // while missing/scent products still require valid selection and reject forged unsupported selections.
  const db = createMockAdminDb({
    products: {
      prod_no_type: {
        name: 'منتج بدون variantType',
        price: 350,
        hasVariants: true,
        variants: [{ id: 'jasmin', name: 'الياسمين', isAvailable: true }]
      },
      prod_custom_type: {
        name: 'مرطب شفاه بنكهات',
        price: 150,
        hasVariants: true,
        variantType: 'flavor',
        variants: [{ id: 'berry', name: 'Berry', isAvailable: true }]
      },
      prod_size_type: {
        name: 'زيت بأحجام',
        price: 200,
        hasVariants: true,
        variantType: 'size',
        variants: [{ id: '100ml', name: '100ml', isAvailable: true }]
      }
    }
  });
  const { deps } = createOrderDeps(db);

  const validRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        { productId: 'prod_no_type', quantity: 1, selectedVariants: [{ id: 'jasmin', name: 'الياسمين' }] },
        { productId: 'prod_custom_type', quantity: 2, selectedVariants: [] },
        { productId: 'prod_size_type', quantity: 1 }
      ]
    }),
    clientAddress: '41.41.12.1',
    _deps: deps
  });
  assert.equal(validRes.status, 200);
  const validBody = await validRes.json();
  assert.equal(validBody.subtotal, 350 + 150 * 2 + 200); // 850 (1x pricing for unsupported variantType)
  assert.equal(db.data.orders[validBody.orderId].products[0].variantName, 'الياسمين');
  assert.equal(db.data.orders[validBody.orderId].products[1].variantName, undefined);
  assert.equal(db.data.orders[validBody.orderId].products[2].variantName, undefined);

  // Submitting forged variant selection on unsupported variantType is rejected cleanly
  const forgedRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        { productId: 'prod_custom_type', quantity: 1, selectedVariants: [{ id: 'berry', name: 'Berry' }] }
      ]
    }),
    clientAddress: '41.41.12.2',
    _deps: deps
  });
  assert.equal(forgedRes.status, 400);
  assert.equal((await forgedRes.json()).error, 'INVALID_VARIANT_SELECTION');
});

test('18. GROUP 2A.3.1.1 Collection Validation: validates scents, overwrites forged names, preserves pricing & stores authoritative metadata', async () => {
  const now = Date.now();
  const campaign = {
    enabled: true,
    startAt: new Date(now - 3600_000).toISOString(),
    endAt: new Date(now + 3600_000).toISOString(),
    collections: [
      {
        id: 'col_pkg',
        name: 'بكج التوفير',
        active: true,
        allowDuplicates: false,
        pricingType: 'package',
        packagePrice: 600,
        badgeText: 'عرض البكج',
        items: [
          { collectionItemId: 'ci_simple', productId: 'prod_simple' },
          { collectionItemId: 'ci_scent', productId: 'prod_scent' }
        ]
      },
      {
        id: 'col_pct',
        name: 'بكج الخصم النسبي',
        active: true,
        allowDuplicates: false,
        pricingType: 'percentage',
        discountPercentage: 20,
        items: [
          { collectionItemId: 'ci_p1', productId: 'prod_simple' },
          { collectionItemId: 'ci_p2', productId: 'prod_scent' }
        ]
      }
    ]
  };

  const db = createMockAdminDb({
    products: createBaseProductsFixture(),
    settings: { pinkFriday: { publishedActiveCampaign: campaign } }
  });
  const { deps, sentTelegrams } = createOrderDeps(db);

  // Order both package collection (600) and percentage collection (Math.round((250+500)*0.8) = 600)
  // Submit forged variant name + forged price -> server must resolve Firebase 'الورد' and keep collection pricing
  const res = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_pkg',
          quantity: 1,
          price: 1,
          selectedItems: [
            { collectionItemId: 'ci_simple', productId: 'prod_simple', selectedVariant: null },
            {
              collectionItemId: 'ci_scent',
              productId: 'prod_scent',
              selectedVariant: { id: 'rose', name: '<script>اسم مزور</script>' }
            }
          ]
        },
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_pct',
          quantity: 2,
          selectedItems: [
            {
              collectionItemId: 'ci_p2',
              productId: 'prod_scent',
              selectedVariant: { id: 'amber', name: 'Forged Amber Name' }
            }
          ]
        }
      ]
    }),
    clientAddress: '41.41.13.1',
    _deps: deps
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  // Package: 600 * 1 = 600; Percentage: 600 * 2 = 1200 -> subtotal = 1800 (shipping 85)
  assert.equal(body.subtotal, 1800);
  assert.equal(body.shippingFee, 85);
  assert.equal(body.totalAmount, 1885);

  const savedOrder = db.data.orders[body.orderId];
  const pkgOrderItem = savedOrder.products[0];
  assert.equal(pkgOrderItem.effectiveUnitPrice, 600);
  assert.equal(pkgOrderItem.lineTotal, 600);
  assert.equal(pkgOrderItem.items[0].variantName, '');
  assert.equal(pkgOrderItem.items[0].variantId, undefined);
  assert.equal(pkgOrderItem.items[1].variantId, 'rose');
  assert.deepEqual(pkgOrderItem.items[1].selectedVariant, { id: 'rose', name: 'الورد' });
  assert.equal(pkgOrderItem.items[1].variantName, 'الورد');

  const pctOrderItem = savedOrder.products[1];
  assert.equal(pctOrderItem.effectiveUnitPrice, 600);
  assert.equal(pctOrderItem.lineTotal, 1200);
  assert.equal(pctOrderItem.items[1].variantId, 'amber');
  assert.equal(pctOrderItem.items[1].variantName, 'العنبر');

  // Telegram displays authoritative resolved variant names (not forged XSS)
  assert.equal(sentTelegrams.length, 1);
  const tgHtml = formatOrderMessage(sentTelegrams[0].order, body.orderId);
  assert.ok(tgHtml.includes('الورد'));
  assert.ok(tgHtml.includes('العنبر'));
  assert.ok(!tgHtml.includes('اسم مزور'));
  assert.ok(!tgHtml.includes('Forged Amber Name'));
});

test('19. GROUP 2A.3.1.1 Collection Rejection: rejects unknown, unavailable, foreign, malformed, ID-less, and missing required collection selections', async () => {
  const now = Date.now();
  const campaign = {
    enabled: true,
    startAt: new Date(now - 3600_000).toISOString(),
    endAt: new Date(now + 3600_000).toISOString(),
    collections: [
      {
        id: 'col_strict',
        name: 'بكج التحقق',
        active: true,
        allowDuplicates: false,
        pricingType: 'package',
        packagePrice: 600,
        items: [
          { collectionItemId: 'ci_simple', productId: 'prod_simple' },
          { collectionItemId: 'ci_scent', productId: 'prod_scent' }
        ]
      }
    ]
  };

  const db = createMockAdminDb({
    products: createBaseProductsFixture(),
    settings: { pinkFriday: { publishedActiveCampaign: campaign } }
  });
  const { deps } = createOrderDeps(db);

  const invalidCollectionItems = [
    // Unknown variant ID
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: { id: 'does_not_exist', name: 'وهمي' } }
      ]
    },
    // Unavailable variant (`oud` has isAvailable: false)
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: { id: 'oud', name: 'العود' } }
      ]
    },
    // Foreign variant belonging to another product (`vanilla` belongs to prod_other, not prod_scent)
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: { id: 'vanilla', name: 'فانيليا' } }
      ]
    },
    // Bare variantName without ID
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', variantName: 'الورد' }
      ]
    },
    // Bare legacy `variant` string without ID
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', variant: 'الورد' }
      ]
    },
    // selectedVariant missing required id
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: { name: 'الورد' } }
      ]
    },
    // Malformed selectedVariant string
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: 'rose' }
      ]
    },
    // Malformed selectedItems container
    {
      selectedItems: 'not-an-array'
    },
    // Malformed selectedItems entry
    {
      selectedItems: ['bad-entry']
    },
    // Missing required selection on collection component that exposes a scent selector
    {
      selectedItems: [
        { collectionItemId: 'ci_simple', productId: 'prod_simple', selectedVariant: null },
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: null }
      ]
    },
    // Attempting to inject variant on non-variant product inside collection
    {
      selectedItems: [
        { collectionItemId: 'ci_simple', productId: 'prod_simple', selectedVariant: { id: 'rose', name: 'الورد' } },
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'الورد' } }
      ]
    },
    // Attempting multi-variant array on single collection slot
    {
      selectedItems: [
        {
          collectionItemId: 'ci_scent',
          productId: 'prod_scent',
          selectedVariants: [
            { id: 'rose', name: 'الورد' },
            { id: 'amber', name: 'العنبر' }
          ]
        }
      ]
    },
    // Mismatched productId on collectionItemId
    {
      selectedItems: [
        {
          collectionItemId: 'ci_scent',
          productId: 'prod_other',
          selectedVariant: { id: 'vanilla', name: 'فانيليا' }
        }
      ]
    },
    // Unknown extra collectionItemId
    {
      selectedItems: [
        { collectionItemId: 'ci_scent', productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'الورد' } },
        { collectionItemId: 'ci_unknown', productId: 'prod_simple', selectedVariant: null }
      ]
    }
  ];

  for (let i = 0; i < invalidCollectionItems.length; i++) {
    const res = await createOrderPOST({
      request: makeOrderRequest({
        clientRequestId: crypto.randomUUID(),
        items: [
          {
            type: 'collection',
            isCollection: true,
            collectionId: 'col_strict',
            quantity: 1,
            ...invalidCollectionItems[i]
          }
        ]
      }),
      clientAddress: `41.41.14.${i + 1}`,
      _deps: deps
    });
    assert.equal(res.status, 400, `Expected HTTP 400 for invalid collection payload #${i}`);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(
      [
        'INVALID_VARIANT_SELECTION',
        'VARIANT_REQUIRED',
        'VARIANT_NOT_FOUND',
        'VARIANT_UNAVAILABLE',
        'NO_AVAILABLE_VARIANTS'
      ].includes(body.error),
      `Unexpected error code for invalid collection payload #${i}: ${body.error}`
    );
  }
  assert.equal(db.data.orders, undefined);
});

test('20. GROUP 2A.3.1.1 Duplicate Products & Legacy/Unexposed Selectors: matches by exact collectionItemId and preserves unexposed collection UX', async () => {
  const now = Date.now();
  const campaign = {
    enabled: true,
    startAt: new Date(now - 3600_000).toISOString(),
    endAt: new Date(now + 3600_000).toISOString(),
    collections: [
      {
        id: 'col_dups',
        name: 'بكج ثنائي المسك',
        active: true,
        allowDuplicates: true,
        pricingType: 'package',
        packagePrice: 800,
        items: [
          { collectionItemId: 'slot_a', productId: 'prod_scent' },
          { collectionItemId: 'slot_b', productId: 'prod_scent' }
        ]
      },
      {
        id: 'col_unexposed',
        name: 'بكج بدون أداة اختيار ظاهرة',
        active: true,
        allowDuplicates: false,
        pricingType: 'package',
        packagePrice: 550,
        items: [
          { collectionItemId: 'slot_simple', productId: 'prod_simple' },
          // prod_other has object-map variants -> pink-friday.astro does NOT render a <select>
          { collectionItemId: 'slot_obj_map', productId: 'prod_other' }
        ]
      }
    ]
  };

  const db = createMockAdminDb({
    products: createBaseProductsFixture(),
    settings: { pinkFriday: { publishedActiveCampaign: campaign } }
  });
  const { deps } = createOrderDeps(db);

  // Confirm pink-friday.astro selector parity helper
  assert.equal(hasExposedCollectionVariantSelector(db.data.products.prod_scent), true);
  assert.equal(hasExposedCollectionVariantSelector(db.data.products.prod_other), false);
  assert.equal(hasExposedCollectionVariantSelector(db.data.products.prod_simple), false);

  // 1. Duplicate product matched by exact collectionItemId even when submitted in reverse order
  const dupRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_dups',
          quantity: 1,
          selectedItems: [
            { collectionItemId: 'slot_b', productId: 'prod_scent', selectedVariant: { id: 'amber', name: 'Wrong B' } },
            { collectionItemId: 'slot_a', productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'Wrong A' } }
          ]
        }
      ]
    }),
    clientAddress: '41.41.15.1',
    _deps: deps
  });
  assert.equal(dupRes.status, 200);
  const dupBody = await dupRes.json();
  assert.equal(dupBody.subtotal, 800); // Package price fixed, NOT multiplied by 2 scents
  const dupOrderItems = db.data.orders[dupBody.orderId].products[0].items;
  assert.equal(dupOrderItems[0].collectionItemId, 'slot_a');
  assert.equal(dupOrderItems[0].variantId, 'rose');
  assert.equal(dupOrderItems[0].variantName, 'الورد');
  assert.equal(dupOrderItems[1].collectionItemId, 'slot_b');
  assert.equal(dupOrderItems[1].variantId, 'amber');
  assert.equal(dupOrderItems[1].variantName, 'العنبر');

  // 2. Legacy compatibility fallback: entries without collectionItemId match by productId 1-to-1
  const legacyRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_dups',
          quantity: 1,
          selectedItems: [
            { productId: 'prod_scent', selectedVariant: { id: 'musk', name: 'المسك' } },
            { productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'الورد' } }
          ]
        }
      ]
    }),
    clientAddress: '41.41.15.2',
    _deps: deps
  });
  assert.equal(legacyRes.status, 200);
  const legacyBody = await legacyRes.json();
  const legacyItems = db.data.orders[legacyBody.orderId].products[0].items;
  assert.equal(legacyItems[0].variantId, 'musk');
  assert.equal(legacyItems[1].variantId, 'rose');

  // 3. Collection items without an exposed selection control (prod_simple + object-map prod_other) succeed when selectedVariant is null
  const unexposedRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_unexposed',
          quantity: 1,
          selectedItems: [
            { collectionItemId: 'slot_simple', productId: 'prod_simple', selectedVariant: null },
            { collectionItemId: 'slot_obj_map', productId: 'prod_other', selectedVariant: null }
          ]
        }
      ]
    }),
    clientAddress: '41.41.15.3',
    _deps: deps
  });
  assert.equal(unexposedRes.status, 200);
  const unexposedBody = await unexposedRes.json();
  assert.equal(unexposedBody.subtotal, 550);
  assert.equal(db.data.orders[unexposedBody.orderId].products[0].items[0].variantName, '');
  assert.equal(db.data.orders[unexposedBody.orderId].products[0].items[1].variantName, '');

  // 4. Even on unexposed object-map product, if a variant ID IS submitted, it is still validated against Firebase
  const explicitValidObjMap = validateAndResolveCollectionItemVariant(
    db.data.products.prod_other,
    { collectionItemId: 'slot_obj_map', productId: 'prod_other', selectedVariant: { id: 'vanilla', name: 'Tampered' } },
    { expectedProductId: 'prod_other' }
  );
  assert.equal(explicitValidObjMap.ok, true);
  assert.deepEqual(explicitValidObjMap.variant, { id: 'vanilla', name: 'فانيليا' });

  const explicitInvalidObjMap = validateAndResolveCollectionItemVariant(
    db.data.products.prod_other,
    { collectionItemId: 'slot_obj_map', productId: 'prod_other', selectedVariant: { id: 'bogus', name: 'X' } },
    { expectedProductId: 'prod_other' }
  );
  assert.equal(explicitInvalidObjMap.ok, false);
  assert.equal(explicitInvalidObjMap.errorCode, 'VARIANT_NOT_FOUND');

  // 5. Idempotency replay & conflict for collection orders remain intact
  const colReqId = crypto.randomUUID();
  const colOrderPayload = {
    clientRequestId: colReqId,
    items: [
      {
        type: 'collection',
        isCollection: true,
        collectionId: 'col_dups',
        quantity: 1,
        selectedItems: [
          { collectionItemId: 'slot_a', productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'الورد' } },
          { collectionItemId: 'slot_b', productId: 'prod_scent', selectedVariant: { id: 'amber', name: 'العنبر' } }
        ]
      }
    ]
  };
  const replayFirst = await createOrderPOST({
    request: makeOrderRequest(colOrderPayload),
    clientAddress: '41.41.15.4',
    _deps: deps
  });
  assert.equal(replayFirst.status, 200);
  const replayFirstBody = await replayFirst.json();

  const replaySecond = await createOrderPOST({
    request: makeOrderRequest(colOrderPayload),
    clientAddress: '41.41.15.4',
    _deps: deps
  });
  assert.equal(replaySecond.status, 200);
  assert.equal((await replaySecond.json()).orderId, replayFirstBody.orderId);

  const replayConflict = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: colReqId,
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_dups',
          quantity: 1,
          selectedItems: [
            { collectionItemId: 'slot_a', productId: 'prod_scent', selectedVariant: { id: 'musk', name: 'المسك' } },
            { collectionItemId: 'slot_b', productId: 'prod_scent', selectedVariant: { id: 'amber', name: 'العنبر' } }
          ]
        }
      ]
    }),
    clientAddress: '41.41.15.4',
    _deps: deps
  });
  assert.equal(replayConflict.status, 409);
  assert.equal((await replayConflict.json()).error, 'IDEMPOTENCY_CONFLICT');

  // 6. Shipping threshold with collection + single item: 800 * 2 + 400 = 2000 (85 EGP shipping); +250 = 2250 (0 EGP free)
  const colAt2000 = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_dups',
          quantity: 2,
          selectedItems: [
            { collectionItemId: 'slot_a', productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'الورد' } },
            { collectionItemId: 'slot_b', productId: 'prod_scent', selectedVariant: { id: 'amber', name: 'العنبر' } }
          ]
        },
        { productId: 'prod_other', quantity: 1, selectedVariants: [{ id: 'vanilla', name: 'فانيليا' }] }
      ]
    }),
    clientAddress: '41.41.15.5',
    _deps: deps
  });
  assert.equal(colAt2000.status, 200);
  const colAt2000Body = await colAt2000.json();
  assert.equal(colAt2000Body.subtotal, 2000);
  assert.equal(colAt2000Body.shippingFee, 85);
  assert.equal(colAt2000Body.totalAmount, 2085);

  const colAbove2000 = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_dups',
          quantity: 2,
          selectedItems: [
            { collectionItemId: 'slot_a', productId: 'prod_scent', selectedVariant: { id: 'rose', name: 'الورد' } },
            { collectionItemId: 'slot_b', productId: 'prod_scent', selectedVariant: { id: 'amber', name: 'العنبر' } }
          ]
        },
        { productId: 'prod_other', quantity: 1, selectedVariants: [{ id: 'vanilla', name: 'فانيليا' }] },
        { productId: 'prod_simple', quantity: 1 }
      ]
    }),
    clientAddress: '41.41.15.6',
    _deps: deps
  });
  assert.equal(colAbove2000.status, 200);
  const colAbove2000Body = await colAbove2000.json();
  assert.equal(colAbove2000Body.subtotal, 2250);
  assert.equal(colAbove2000Body.shippingFee, 0);
  assert.equal(colAbove2000Body.totalAmount, 2250);

  // 7. Expired collection claim fails with 409 CAMPAIGN_COLLECTION_CONFLICT
  const expiredColDb = createMockAdminDb({
    products: createBaseProductsFixture(),
    settings: {
      pinkFriday: {
        publishedActiveCampaign: {
          ...campaign,
          endAt: new Date(now - 60_000).toISOString()
        }
      }
    }
  });
  const expiredColRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: colOrderPayload.items
    }),
    clientAddress: '41.41.15.7',
    _deps: createOrderDeps(expiredColDb).deps
  });
  assert.equal(expiredColRes.status, 409);
  assert.equal((await expiredColRes.json()).error, 'CAMPAIGN_COLLECTION_CONFLICT');
});

// ===========================================================================
// D. GROUP 2A.3.1.2 — Duplicate ID Normalization & Pink Friday Selector Parity
// ===========================================================================

test('21. GROUP 2A.3.1.2 Duplicate Variant ID Normalization: frontend variants.js & backend server-variant-pricing match identically', () => {
  const duplicateFixtures = [
    {
      label: 'Array duplicates with identical names',
      product: {
        hasVariants: true,
        variants: [
          { id: 'rose', name: 'الورد', isAvailable: true },
          { id: 'rose', name: 'الورد', isAvailable: false },
          { id: 'musk', name: 'المسك', isAvailable: true }
        ]
      },
      expected: [
        { id: 'rose', name: 'الورد', isAvailable: true },
        { id: 'musk', name: 'المسك', isAvailable: true }
      ]
    },
    {
      label: 'Array duplicates with conflicting names (first valid occurrence wins)',
      product: {
        hasVariants: true,
        variants: [
          { id: 'amber', name: 'العنبر الملكي', isAvailable: true },
          { id: 'amber', name: 'اسم لاحق متعارض', isAvailable: true }
        ]
      },
      expected: [{ id: 'amber', name: 'العنبر الملكي', isAvailable: true }]
    },
    {
      label: 'Duplicate IDs differing only by whitespace are trimmed & deduplicated',
      product: {
        hasVariants: true,
        variants: [
          { id: ' rose ', name: ' الورد الأحمر ', isAvailable: true },
          { id: 'rose', name: 'الورد المكرر', isAvailable: true }
        ]
      },
      expected: [{ id: 'rose', name: 'الورد الأحمر', isAvailable: true }]
    },
    {
      label: 'Missing-ID fallback deduplicates against explicit matching ID',
      product: {
        hasVariants: true,
        variants: [
          { name: ' مسك أبيض ', isAvailable: true },
          { id: 'مسك أبيض', name: 'اسم بديل مكرر', isAvailable: true }
        ]
      },
      expected: [{ id: 'مسك أبيض', name: 'مسك أبيض', isAvailable: true }]
    },
    {
      label: 'Invalid/empty entry preceding valid entry sharing ID is skipped before seenIds tracking',
      product: {
        hasVariants: true,
        variants: [
          null,
          { id: 'rose', name: '   ' },
          { id: 'rose', name: '' },
          { id: 'rose', name: ' الورد الصالح ', isAvailable: true }
        ]
      },
      expected: [{ id: 'rose', name: 'الورد الصالح', isAvailable: true }]
    },
    {
      label: 'Object-map duplicate explicit/key IDs keep first valid normalized entry',
      product: {
        hasVariants: true,
        variants: {
          k1: { id: 'vanilla', name: '' }, // invalid name -> skipped before seenIds
          k2: { id: 'vanilla', name: ' فانيليا مدغشقر ', isAvailable: true },
          k3: { id: ' vanilla ', name: 'فانيليا مكررة', isAvailable: true },
          coconut: 'جوز الهند'
        }
      },
      expected: [
        { id: 'vanilla', name: 'فانيليا مدغشقر', isAvailable: true },
        { id: 'coconut', name: 'جوز الهند', isAvailable: true }
      ]
    }
  ];

  for (const fx of duplicateFixtures) {
    const feNormalized = JSON.parse(
      JSON.stringify(
        frontendVariants.getProductVariants(fx.product).map((v) => ({
          id: String(v.id),
          name: String(v.name),
          isAvailable: v.isAvailable !== false
        }))
      )
    );
    const beNormalized = normalizeProductVariants(fx.product);

    assert.deepEqual(beNormalized, fx.expected, `Backend failed on ${fx.label}`);
    assert.deepEqual(feNormalized, beNormalized, `Frontend/backend mismatch on ${fx.label}`);
  }
});

test('22. GROUP 2A.3.1.2 Pink Friday Collection Selector Parity & SSR Contract Verification', async () => {
  // A. Pure selector exposure & options matrix
  const scProd = {
    name: 'عطر مجموعات',
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: ' الورد ', isAvailable: true },
      { id: 'rose', name: 'الورد المكرر', isAvailable: true },
      { id: 'oud', name: 'العود', isAvailable: false },
      { name: ' مسك أبيض ' }
    ]
  };
  assert.equal(hasExposedCollectionVariantSelector(scProd), true);
  assert.deepEqual(getExposedCollectionVariantOptions(scProd), [
    { id: 'rose', name: 'الورد' },
    { id: 'مسك أبيض', name: 'مسك أبيض' }
  ]);

  const noTypeArrProd = {
    name: 'عطر بدون نوع',
    hasVariants: 'true',
    variants: [{ id: 'amber', name: 'العنبر' }]
  };
  assert.equal(hasExposedCollectionVariantSelector(noTypeArrProd), true);
  assert.deepEqual(getExposedCollectionVariantOptions(noTypeArrProd), [{ id: 'amber', name: 'العنبر' }]);

  const nonVariantWithArray = {
    name: 'منتج بدون روائح رغم وجود مصفوفة',
    hasVariants: false,
    variants: [{ id: 'v1', name: 'خيار غير ظاهر' }]
  };
  assert.equal(hasExposedCollectionVariantSelector(nonVariantWithArray), false);
  assert.deepEqual(getExposedCollectionVariantOptions(nonVariantWithArray), []);

  const missingFlagWithArray = {
    name: 'منتج بدون hasVariants رغم وجود مصفوفة',
    variants: [{ id: 'v1', name: 'خيار غير ظاهر' }]
  };
  assert.equal(hasExposedCollectionVariantSelector(missingFlagWithArray), false);
  assert.deepEqual(getExposedCollectionVariantOptions(missingFlagWithArray), []);

  const flavorArrayProd = {
    name: 'منتج نكهات',
    hasVariants: true,
    variantType: 'flavor',
    variants: [{ id: 'mint', name: 'نعناع' }]
  };
  assert.equal(hasExposedCollectionVariantSelector(flavorArrayProd), false);
  assert.deepEqual(getExposedCollectionVariantOptions(flavorArrayProd), []);

  const objMapProd = {
    name: 'منتج بخريطة كائنات',
    hasVariants: true,
    variantType: 'scent',
    variants: { vanilla: 'فانيليا' }
  };
  assert.equal(hasExposedCollectionVariantSelector(objMapProd), false);
  assert.deepEqual(getExposedCollectionVariantOptions(objMapProd), []);

  // B. Verify SSR files use unified contract directly
  const productDetailSrc = await fs.readFile(path.resolve('src/pages/product/[...slug].astro'), 'utf8');
  assert.ok(productDetailSrc.includes('normalizeProductVariants(product)'));
  assert.ok(productDetailSrc.includes('hasSelectableProductVariants(product)'));

  const pinkFridaySrc = await fs.readFile(path.resolve('src/pages/pink-friday.astro'), 'utf8');
  assert.ok(pinkFridaySrc.includes('hasExposedCollectionVariantSelector'));
  assert.ok(pinkFridaySrc.includes('getExposedCollectionVariantOptions(prod)'));
  assert.equal(/\(prod\s+as\s+any\)\.scents|prod\.scents\b/.test(pinkFridaySrc), false, 'pink-friday.astro must not read nonexistent prod.scents field');

  // C. End-to-end collection checkout: non-exposed components succeed with selectedVariant: null & reject forged variants
  const now = Date.now();
  const db = createMockAdminDb({
    products: {
      prod_hidden_variants: {
        name: 'غسول بمصفوفة معطلة',
        price: 200,
        hasVariants: false,
        variants: [{ id: 'x1', name: 'غير مفعّل' }]
      },
      prod_missing_flag: {
        name: 'كريم بدون تفعيل',
        price: 250,
        variants: [{ id: 'x2', name: 'غير مفعّل' }]
      },
      prod_flavor_arr: {
        name: 'مرطب نكهات',
        price: 180,
        hasVariants: true,
        variantType: 'flavor',
        variants: [{ id: 'mint', name: 'نعناع' }]
      },
      prod_scent_dup: {
        name: 'معطر مكرر المعرف',
        price: 300,
        hasVariants: true,
        variantType: 'scent',
        variants: [
          { id: 'rose', name: 'الورد الأصلي', isAvailable: true },
          { id: 'rose', name: 'الورد المزاحم', isAvailable: false }
        ]
      }
    },
    settings: {
      pinkFriday: {
        publishedActiveCampaign: {
          enabled: true,
          startAt: new Date(now - 3600_000).toISOString(),
          endAt: new Date(now + 3600_000).toISOString(),
          collections: [
            {
              id: 'col_parity',
              name: 'كوليكشن التطابق الكامل',
              active: true,
              pricingType: 'package',
              packagePrice: 700,
              items: [
                { collectionItemId: 's_hidden', productId: 'prod_hidden_variants' },
                { collectionItemId: 's_missing', productId: 'prod_missing_flag' },
                { collectionItemId: 's_flavor', productId: 'prod_flavor_arr' },
                { collectionItemId: 's_scent', productId: 'prod_scent_dup' }
              ]
            }
          ]
        }
      }
    }
  });
  const { deps } = createOrderDeps(db);

  const okRes = await createOrderPOST({
    request: makeOrderRequest({
      clientRequestId: crypto.randomUUID(),
      items: [
        {
          type: 'collection',
          isCollection: true,
          collectionId: 'col_parity',
          quantity: 1,
          selectedItems: [
            { collectionItemId: 's_hidden', productId: 'prod_hidden_variants', selectedVariant: null },
            { collectionItemId: 's_missing', productId: 'prod_missing_flag', selectedVariant: null },
            { collectionItemId: 's_flavor', productId: 'prod_flavor_arr', selectedVariant: null },
            { collectionItemId: 's_scent', productId: 'prod_scent_dup', selectedVariant: { id: 'rose', name: 'مزور' } }
          ]
        }
      ]
    }),
    clientAddress: '41.41.16.1',
    _deps: deps
  });
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json();
  assert.equal(okBody.subtotal, 700);
  const resolved = db.data.orders[okBody.orderId].products[0].items;
  assert.equal(resolved[0].variantName, '');
  assert.equal(resolved[1].variantName, '');
  assert.equal(resolved[2].variantName, '');
  assert.deepEqual(resolved[3].selectedVariant, { id: 'rose', name: 'الورد الأصلي' });

  // Forged variant injection on hasVariants: false or variantType: 'flavor' MUST be rejected
  for (const [idx, forgedEntry] of [
    { collectionItemId: 's_hidden', productId: 'prod_hidden_variants', selectedVariant: { id: 'x1', name: 'X' } },
    { collectionItemId: 's_flavor', productId: 'prod_flavor_arr', selectedVariant: { id: 'mint', name: 'نعناع' } }
  ].entries()) {
    const forgedColRes = await createOrderPOST({
      request: makeOrderRequest({
        clientRequestId: crypto.randomUUID(),
        items: [
          {
            type: 'collection',
            isCollection: true,
            collectionId: 'col_parity',
            quantity: 1,
            selectedItems: [
              forgedEntry,
              { collectionItemId: 's_scent', productId: 'prod_scent_dup', selectedVariant: { id: 'rose', name: 'الورد الأصلي' } }
            ]
          }
        ]
      }),
      clientAddress: `41.41.16.${idx + 2}`,
      _deps: deps
    });
    assert.equal(forgedColRes.status, 400);
    assert.equal((await forgedColRes.json()).error, 'INVALID_VARIANT_SELECTION');
  }
});

