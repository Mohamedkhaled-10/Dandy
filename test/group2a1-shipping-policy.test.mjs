// test/group2a1-shipping-policy.test.mjs
// DANDY PHASE 2 / GROUP 2A.1: Shipping Policy Single Source of Truth & Checkout Alignment

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import {
  SHIPPING_RATES_BY_GOVERNORATE,
  DEFAULT_SHIPPING_FEE_EGP,
  FREE_SHIPPING_THRESHOLD_EGP,
  SHIPPING_FEE_RANGE_EGP,
  DELIVERY_ESTIMATE,
  SUPPORTED_PAYMENT_METHOD,
  STORE_SHIPPING_POLICY,
  getShippingFeeForGovernorate,
  isFreeShippingEligible,
  calculateShippingFee,
  getPublicStoreShippingPolicy
} from '../src/config/store-policy.ts';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';
import {
  getShippingFeeForGov as emailServiceGetShippingFee,
  calculateOrderFinancials as emailServiceCalculateFinancials
} from '../src/utils/email-service.ts';

function createRtdbMock(initialData = {}) {
  const data = JSON.parse(JSON.stringify(initialData));
  const versions = new Map();
  let pushCounter = 0;

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
    if (!parts.length) return;
    let curr = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (curr[key] == null || typeof curr[key] !== 'object') {
        curr[key] = {};
      }
      curr = curr[key];
    }
    const leaf = parts[parts.length - 1];
    if (val === null || val === undefined) {
      delete curr[leaf];
    } else {
      curr[leaf] = JSON.parse(JSON.stringify(val));
    }
    bumpVersion(p);
  }

  function makeRef(p = '') {
    return {
      key: p.split('/').filter(Boolean).pop() || null,
      async once() {
        const val = getAtPath(p);
        const cloned = val === null || val === undefined ? null : JSON.parse(JSON.stringify(val));
        return {
          exists: () => cloned !== null && cloned !== undefined,
          val: () => cloned
        };
      },
      async set(val) {
        setAtPath(p, val);
      },
      async update(updates) {
        if (p) {
          const existing = getAtPath(p) || {};
          setAtPath(p, { ...existing, ...updates });
        } else {
          for (const [k, v] of Object.entries(updates)) {
            setAtPath(k, v);
          }
        }
      },
      push() {
        pushCounter++;
        const newKey = `-MockOrd2A1_${pushCounter}`;
        return makeRef(p ? `${p}/${newKey}` : newKey);
      },
      async transaction(updater) {
        const current = getAtPath(p);
        const cloned = current === null || current === undefined ? null : JSON.parse(JSON.stringify(current));
        const nextVal = updater(cloned);
        if (nextVal !== undefined) {
          setAtPath(p, nextVal);
        }
        const finalVal = getAtPath(p);
        return {
          committed: nextVal !== undefined,
          snapshot: {
            val: () => (finalVal === null || finalVal === undefined ? null : JSON.parse(JSON.stringify(finalVal)))
          }
        };
      }
    };
  }

  return { data, ref: makeRef };
}

function makeOrderReq(overrides = {}) {
  return new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'سلمى حسام',
        phone: '01099887766',
        email: 'salma@example.com',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9',
        ...(overrides.customer || {})
      },
      items: overrides.items || [{ productId: 'prod_1', quantity: 1 }],
      turnstileToken: overrides.turnstileToken ?? 'valid_turnstile',
      clientRequestId: overrides.clientRequestId ?? crypto.randomUUID(),
      ...(overrides.extraBody || {})
    })
  });
}

function makeDeps(mockDb, hexKey, extras = {}) {
  return {
    adminDb: mockDb,
    adminAuth: null,
    redis: null,
    encryptionKey: hexKey,
    skipPublishedCampaignFallback: true,
    verifyTurnstileToken: async () => ({ success: true }),
    sendOrderNotification: async () => ({ success: true, status: 'accepted_by_mailapp' }),
    sendTelegramNotification: async () => ({ success: true, status: 'SUCCESS', allSuccessful: true }),
    ...extras
  };
}

// ===========================================================================
// 1-8. Core Centralized Shipping Policy Rules & Edge Cases
// ===========================================================================
test('1-5. Exact governorate rates (Gharbia=70, Dakahlia/etc.=85, Fayoum/etc.=100, 120-zone, unknown=120)', () => {
  // 1. Gharbia -> 70 EGP
  assert.equal(getShippingFeeForGovernorate('Gharbia'), 70);
  assert.equal(calculateShippingFee('Gharbia', 500), 70);

  // 2. Dakahlia and all 85 EGP governorates
  const zone85 = [
    'Dakahlia', 'Sharqia', 'Kafr El Sheikh', 'Qalyubia', 'Port Said',
    'Damietta', 'Suez', 'Ismailia', 'Cairo', 'Giza', 'Beheira',
    'Monufia', 'Alexandria'
  ];
  for (const gov of zone85) {
    assert.equal(getShippingFeeForGovernorate(gov), 85, `Expected 85 EGP for ${gov}`);
    assert.equal(calculateShippingFee(gov, 1000), 85);
  }

  // 3. Fayoum and 100 EGP governorates
  for (const gov of ['Fayoum', 'Beni Suef', 'Minya']) {
    assert.equal(getShippingFeeForGovernorate(gov), 100, `Expected 100 EGP for ${gov}`);
    assert.equal(calculateShippingFee(gov, 1000), 100);
  }

  // 4. 120 EGP governorates
  const zone120 = [
    'Luxor', 'Aswan', 'Assiut', 'Sohag', 'North Sinai',
    'South Sinai', 'Qena', 'New Valley', 'Red Sea', 'Matrouh'
  ];
  for (const gov of zone120) {
    assert.equal(getShippingFeeForGovernorate(gov), 120, `Expected 120 EGP for ${gov}`);
    assert.equal(calculateShippingFee(gov, 1000), 120);
  }

  // Total verified governorate count = 27
  assert.equal(Object.keys(SHIPPING_RATES_BY_GOVERNORATE).length, 27);

  // 5. Unknown / empty / prototype-key fallback -> 120 EGP
  assert.equal(DEFAULT_SHIPPING_FEE_EGP, 120);
  assert.equal(getShippingFeeForGovernorate('UnknownGov'), 120);
  assert.equal(getShippingFeeForGovernorate(''), 120);
  assert.equal(getShippingFeeForGovernorate(null), 120);
  assert.equal(getShippingFeeForGovernorate(undefined), 120);
  assert.equal(getShippingFeeForGovernorate('constructor'), 120);
  assert.equal(getShippingFeeForGovernorate('toString'), 120);
});

test('6-8. Free shipping threshold is strictly subtotal > 2000 (2000 still pays shipping)', () => {
  assert.equal(FREE_SHIPPING_THRESHOLD_EGP, 2000);
  assert.deepEqual(SHIPPING_FEE_RANGE_EGP, { min: 70, max: 120 });
  assert.deepEqual(DELIVERY_ESTIMATE, { minDays: 2, maxDays: 5, unit: 'business_days' });
  assert.equal(SUPPORTED_PAYMENT_METHOD, 'COD');
  assert.equal(STORE_SHIPPING_POLICY.paymentMethod, 'COD');

  // 6. Subtotal < 2000 -> paid shipping
  assert.equal(isFreeShippingEligible(1999), false);
  assert.equal(isFreeShippingEligible(1999.99), false);
  assert.equal(calculateShippingFee('Gharbia', 1999.99), 70);
  assert.equal(calculateShippingFee('Cairo', 1500), 85);

  // 7. Subtotal === 2000 -> paid shipping (STRICTLY > 2000 required!)
  assert.equal(isFreeShippingEligible(2000), false);
  assert.equal(calculateShippingFee('Gharbia', 2000), 70);
  assert.equal(calculateShippingFee('Cairo', 2000), 85);
  assert.equal(calculateShippingFee('Fayoum', 2000), 100);
  assert.equal(calculateShippingFee('Aswan', 2000), 120);

  // 8. Subtotal > 2000 -> free shipping (0 EGP)
  assert.equal(isFreeShippingEligible(2000.01), true);
  assert.equal(isFreeShippingEligible(2001), true);
  assert.equal(calculateShippingFee('Gharbia', 2000.01), 0);
  assert.equal(calculateShippingFee('Aswan', 2001), 0);
  assert.equal(calculateShippingFee('UnknownGov', 2500), 0);
});

// ===========================================================================
// 9. Frontend (cart.astro) and Backend (create-order.js & email-service.ts) Parity
// ===========================================================================
test('9. Cart frontend shipping helpers match centralized policy & backend with zero secrets exposed', async () => {
  const publicPolicy = getPublicStoreShippingPolicy();
  const serialized = JSON.stringify(publicPolicy);

  // Ensure ONLY safe public fields exist (zero credentials/tokens/env keys)
  assert.deepEqual(
    Object.keys(publicPolicy).sort(),
    ['defaultFeeEgp', 'deliveryEstimate', 'feeRangeEgp', 'freeShippingThresholdEgp', 'paymentMethod', 'ratesByGovernorate']
  );
  assert.equal(/secret|token|key|password|firebase|admin|relay/i.test(serialized), false);

  const cartSource = await fs.readFile(path.resolve('src/pages/cart.astro'), 'utf8');
  const createOrderSource = await fs.readFile(path.resolve('src/pages/api/create-order.js'), 'utf8');

  // Verify neither cart.astro nor create-order.js keeps duplicated local shippingRates tables
  assert.equal(cartSource.includes('const shippingRates = {'), false);
  assert.equal(createOrderSource.includes('const shippingRates = {'), false);
  assert.match(cartSource, /import\s+\{\s*getPublicStoreShippingPolicy\s*\}\s+from\s+['"]\.\.\/config\/store-policy['"]/);
  assert.match(createOrderSource, /import\s+\{\s*calculateShippingFee\s*\}\s+from\s+['"]\.\.\/\.\.\/config\/store-policy\.ts['"]/);

  // Verify every governorate option in cart.astro's #f-gov dropdown is covered in STORE_SHIPPING_POLICY
  const selectMatch = cartSource.match(/<select id="f-gov"[\s\S]*?<\/select>/);
  assert.ok(selectMatch, 'Expected #f-gov select element in cart.astro');
  const optionValues = [...selectMatch[0].matchAll(/<option value="([^"]*)">/g)]
    .map((m) => m[1])
    .filter(Boolean);
  assert.equal(optionValues.length, 27);
  for (const gov of optionValues) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SHIPPING_RATES_BY_GOVERNORATE, gov),
      `Missing ${gov} in centralized SHIPPING_RATES_BY_GOVERNORATE`
    );
  }

  // Extract cart.astro's shipping helper functions and execute them in a VM sandbox fed with serialized publicPolicy
  const fnBlockMatch = cartSource.match(
    /const STORE_SHIPPING_POLICY = [\s\S]*?function calculateShippingFeeForGov\(govName, subtotal\) \{[\s\S]*?\n    \}/
  );
  assert.ok(fnBlockMatch, 'Expected STORE_SHIPPING_POLICY and client shipping helpers in cart.astro');

  const sandbox = {
    document: {
      getElementById(id) {
        if (id === 'dandy-store-shipping-policy') {
          return { textContent: serialized };
        }
        return null;
      }
    },
    Object,
    Number
  };
  vm.runInNewContext(
    `${fnBlockMatch[0]}\nglobalThis.__exports = { getShippingFeeForGov, isFreeShippingEligible, calculateShippingFeeForGov };`,
    sandbox
  );
  const clientHelpers = sandbox.__exports;

  // Verify 100% parity across all 27 governorates + unknown + subtotals 1500, 2000, 2001
  const testGovs = [...Object.keys(SHIPPING_RATES_BY_GOVERNORATE), 'UnknownGov', ''];
  for (const gov of testGovs) {
    for (const sub of [500, 1999, 2000, 2000.01, 2500]) {
      assert.equal(
        clientHelpers.calculateShippingFeeForGov(gov, sub),
        calculateShippingFee(gov, sub),
        `Frontend/central parity mismatch for gov="${gov}", subtotal=${sub}`
      );
    }
    assert.equal(
      emailServiceGetShippingFee(gov),
      getShippingFeeForGovernorate(gov),
      `email-service/central parity mismatch for gov="${gov}"`
    );
  }

  // Also verify email-service calculateOrderFinancials respects strictly > 2000
  const finAt2000 = emailServiceCalculateFinancials({
    governorate: 'Gharbia',
    subtotal: 2000,
    products: [{ name: 'Item', price: 2000, quantity: 1 }]
  });
  assert.equal(finAt2000.shippingFee, 70);
  assert.equal(finAt2000.isFreeShipping, false);

  const finAt2001 = emailServiceCalculateFinancials({
    governorate: 'Gharbia',
    subtotal: 2001,
    products: [{ name: 'Item', price: 2001, quantity: 1 }]
  });
  assert.equal(finAt2001.shippingFee, 0);
  assert.equal(finAt2001.isFreeShipping, true);
});

// ===========================================================================
// 10. Guest Checkout Flow & Server Authority via create-order.js POST
// ===========================================================================
test('10. Guest checkout via create-order POST computes authoritative rates for Gharbia/Dakahlia/Fayoum/Aswan/Unknown & >2000 boundary', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createRtdbMock({
    products: {
      p500: { name: 'سيروم', price: 500, stockQuantity: 50 },
      p2000: { name: 'روتين كامل', price: 2000, stockQuantity: 50 },
      p2001: { name: 'روتين فاخر', price: 2001, stockQuantity: 50 }
    }
  });

  const cases = [
    { gov: 'Gharbia', prodId: 'p500', expectedSub: 500, expectedShip: 70 },
    { gov: 'Dakahlia', prodId: 'p500', expectedSub: 500, expectedShip: 85 },
    { gov: 'Fayoum', prodId: 'p500', expectedSub: 500, expectedShip: 100 },
    { gov: 'Aswan', prodId: 'p500', expectedSub: 500, expectedShip: 120 },
    { gov: 'UnknownGov', prodId: 'p500', expectedSub: 500, expectedShip: 120 },
    // Boundary: subtotal === 2000 must still pay shipping (e.g. Gharbia 70, Cairo 85)
    { gov: 'Gharbia', prodId: 'p2000', expectedSub: 2000, expectedShip: 70 },
    { gov: 'Cairo', prodId: 'p2000', expectedSub: 2000, expectedShip: 85 },
    // Boundary: subtotal > 2000 gets free shipping
    { gov: 'Aswan', prodId: 'p2001', expectedSub: 2001, expectedShip: 0 }
  ];

  for (const tc of cases) {
    const res = await createOrderPOST({
      request: makeOrderReq({
        customer: { governorate: tc.gov },
        items: [{ productId: tc.prodId, quantity: 1 }],
        // Spoofed client shippingFee/totalAmount must be ignored by server
        extraBody: { shippingFee: 0, totalAmount: 1 }
      }),
      clientAddress: '41.41.60.1',
      _deps: makeDeps(mockDb, hexKey)
    });

    assert.equal(res.status, 200, `Expected 200 for ${tc.gov}/${tc.prodId}`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.orderId);
    assert.ok(body.invoiceAccessToken);

    const savedOrder = mockDb.data.orders[body.orderId];
    assert.equal(savedOrder.subtotal, tc.expectedSub);
    assert.equal(savedOrder.shippingFee, tc.expectedShip);
    assert.equal(savedOrder.totalAmount, tc.expectedSub + tc.expectedShip);
    assert.equal(savedOrder.customerId, undefined); // guest checkout
  }
});

// ===========================================================================
// 11. Pink Friday Checkout Compatibility
// ===========================================================================
test('11. Pink Friday campaign and collection pricing interact accurately with >2000 free shipping threshold', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const startAt = new Date(now.getTime() - 3600_000).toISOString();
  const endAt = new Date(now.getTime() + 3600_000).toISOString();

  const mockDb = createRtdbMock({
    products: {
      pf_item: { name: 'زيت طبيعي', price: 2200, stockQuantity: 20 },
      col_p1: { name: 'منتج 1', price: 1200, stockQuantity: 20 },
      col_p2: { name: 'منتج 2', price: 1100, stockQuantity: 20 }
    },
    settings: {
      pinkFriday: {
        publishedActiveCampaign: {
          id: 'pf-active-2a1',
          year: now.getUTCFullYear(),
          enabled: true,
          startAt,
          endAt,
          offers: [
            {
              productId: 'pf_item',
              expectedBasePrice: 2200,
              campaignPrice: 2000, // Regular price > 2000, but PF campaign price === 2000 => shipping MUST still apply!
              active: true,
              badgeText: 'Pink Friday'
            }
          ],
          collections: {
            col_vip: {
              id: 'col_vip',
              name: 'كوليكشن VIP',
              active: true,
              pricingType: 'package',
              packagePrice: 2050, // > 2000 => free shipping applies!
              items: [
                { collectionItemId: 'ci1', productId: 'col_p1' },
                { collectionItemId: 'ci2', productId: 'col_p2' }
              ]
            }
          }
        }
      }
    }
  });

  // Case A: Pink Friday single product drops subtotal from 2200 to 2000 -> NOT free shipping (Gharbia = 70)
  const resPfItem = await createOrderPOST({
    request: makeOrderReq({
      customer: { governorate: 'Gharbia' },
      items: [{ productId: 'pf_item', quantity: 1, isPinkFriday: true, campaignPrice: 2000 }]
    }),
    clientAddress: '41.41.60.2',
    _deps: makeDeps(mockDb, hexKey, { skipPublishedCampaignFallback: false })
  });
  assert.equal(resPfItem.status, 200);
  const bodyA = await resPfItem.json();
  const orderA = mockDb.data.orders[bodyA.orderId];
  assert.equal(orderA.subtotal, 2000);
  assert.equal(orderA.shippingFee, 70);
  assert.equal(orderA.totalAmount, 2070);

  // Case B: Pink Friday collection package = 2050 (> 2000) -> Free shipping (0 EGP) even for Aswan (120 zone)
  const resCol = await createOrderPOST({
    request: makeOrderReq({
      customer: { governorate: 'Aswan' },
      items: [
        {
          type: 'collection',
          isCollection: true,
          isPinkFriday: true,
          collectionId: 'col_vip',
          quantity: 1,
          selectedItems: [
            { collectionItemId: 'ci1', productId: 'col_p1' },
            { collectionItemId: 'ci2', productId: 'col_p2' }
          ]
        }
      ]
    }),
    clientAddress: '41.41.60.3',
    _deps: makeDeps(mockDb, hexKey, { skipPublishedCampaignFallback: false })
  });
  assert.equal(resCol.status, 200);
  const bodyB = await resCol.json();
  const orderB = mockDb.data.orders[bodyB.orderId];
  assert.equal(orderB.subtotal, 2050);
  assert.equal(orderB.shippingFee, 0);
  assert.equal(orderB.totalAmount, 2050);
});

// ===========================================================================
// 12. Order Idempotency & Submission Preservation
// ===========================================================================
test('12. Idempotency replay preserves exact shippingFee and rejects governorate mutation with 409', async () => {
  const hexKey = crypto.randomBytes(32).toString('hex');
  const reqUuid = crypto.randomUUID();
  const mockDb = createRtdbMock({
    products: { p1: { name: 'كريم', price: 450, stockQuantity: 10 } }
  });

  const firstRes = await createOrderPOST({
    request: makeOrderReq({
      clientRequestId: reqUuid,
      customer: { governorate: 'Gharbia' },
      items: [{ productId: 'p1', quantity: 1 }]
    }),
    clientAddress: '41.41.60.4',
    _deps: makeDeps(mockDb, hexKey)
  });
  assert.equal(firstRes.status, 200);
  const firstBody = await firstRes.json();
  assert.equal(mockDb.data.orders[firstBody.orderId].shippingFee, 70);
  assert.equal(mockDb.data.products.p1.stockQuantity, 9);

  // Replay with identical payload -> returns same orderId/token without extra stock deduction
  const replayRes = await createOrderPOST({
    request: makeOrderReq({
      clientRequestId: reqUuid,
      customer: { governorate: 'Gharbia' },
      items: [{ productId: 'p1', quantity: 1 }]
    }),
    clientAddress: '41.41.60.4',
    _deps: makeDeps(mockDb, hexKey)
  });
  assert.equal(replayRes.status, 200);
  const replayBody = await replayRes.json();
  assert.equal(replayBody.orderId, firstBody.orderId);
  assert.equal(replayBody.invoiceAccessToken, firstBody.invoiceAccessToken);
  assert.equal(mockDb.data.products.p1.stockQuantity, 9);

  // Mutating governorate with same clientRequestId -> 409 IDEMPOTENCY_CONFLICT
  const conflictRes = await createOrderPOST({
    request: makeOrderReq({
      clientRequestId: reqUuid,
      customer: { governorate: 'Cairo' },
      items: [{ productId: 'p1', quantity: 1 }]
    }),
    clientAddress: '41.41.60.4',
    _deps: makeDeps(mockDb, hexKey)
  });
  assert.equal(conflictRes.status, 409);
  const conflictBody = await conflictRes.json();
  assert.equal(conflictBody.error, 'IDEMPOTENCY_CONFLICT');
});

// ===========================================================================
// 13. Customer-Facing Policy Copy, Terms Guest Linking & Returns Preservation
// ===========================================================================
test('13. Customer-facing pages & B.A.B knowledge reflect 70-120 EGP, >2000 free shipping, COD-only, verified-email linking, and preserve returns text', async () => {
  const helpSource = await fs.readFile(path.resolve('src/pages/help.astro'), 'utf8');
  const termsSource = await fs.readFile(path.resolve('src/pages/terms.astro'), 'utf8');
  const knowledgeRaw = await fs.readFile(path.resolve('public/assets/bab/data/knowledge.json'), 'utf8');
  const babWidgetSource = await fs.readFile(path.resolve('public/assets/bab/widget/bab-widget.js'), 'utf8');

  // help.astro: uses centralized 70-120 range (no old 85 إلى 120) and preserves returns notice verbatim
  assert.equal(helpSource.includes('85 إلى 120'), false);
  assert.match(helpSource, /STORE_SHIPPING_POLICY\.feeRangeEgp\.min/);
  assert.match(helpSource, /STORE_SHIPPING_POLICY\.feeRangeEgp\.max/);
  assert.match(helpSource, /لا تتوفر معاينة للطرد مع المندوب أو إرجاع للمنتجات بعد الاستلام/);

  // terms.astro: accurately documents verified-email requirement (not automatic phone linking) and preserves returns paragraph verbatim
  assert.equal(termsSource.includes('تلقائياً برقم الهاتف المسجل'), false);
  assert.match(termsSource, /بريد إلكتروني موثّق ومُفعّل/);
  assert.match(termsSource, /في حال استلام منتج تالف أو وجود خطأ في الشحنة، يرجى التواصل فوراً مع خدمة العملاء عبر الواتساب لمعالجة الأمر واستبدال المنتج/);

  // knowledge.json & bab-widget.js bundled fallback stay synchronized and aligned
  const knowledge = JSON.parse(knowledgeRaw);
  const feesArticle = knowledge.articles.find((a) => a.id === 'shipping-fees');
  const payArticle = knowledge.articles.find((a) => a.id === 'pay-methods-available');
  const freeArticle = knowledge.articles.find((a) => a.id === 'shipping-free');
  const timeArticle = knowledge.articles.find((a) => a.id === 'shipping-delivery-time');

  assert.match(feesArticle.answer.text, /70 إلى 120/);
  assert.match(feesArticle.answer.text, /2,000/);
  assert.match(freeArticle.answer.text, /تتجاوز.*2,000/);
  assert.match(timeArticle.answer.text, /2 - 5/);
  assert.match(payArticle.answer.text, /الدفع نقداً عند الاستلام \(Cash on Delivery - COD\) فقط/);
  assert.match(payArticle.answer.text, /لا تتوفر حالياً خدمة الدفع الإلكتروني/);

  const bundledMatch = babWidgetSource.match(/export const BUNDLED_KNOWLEDGE = (\{[\s\S]*?\});\n\/\/ --- BUNDLED_KNOWLEDGE_END ---/);
  assert.ok(bundledMatch, 'Expected BUNDLED_KNOWLEDGE in bab-widget.js');
  const bundled = JSON.parse(bundledMatch[1]);
  assert.deepEqual(bundled, knowledge);
});

// ===========================================================================
// 14. Group 2A.1.1: Arabic & Case-Insensitive Parity Across Policy, Email Service & Order API
// ===========================================================================
test('14. Arabic & case-insensitive governorate names resolve identically across store-policy, email-service, and create-order API', async () => {
  const { GOVERNORATE_ALIASES } = await import('../src/config/store-policy.ts');

  assert.equal(Object.keys(GOVERNORATE_ALIASES).length, 27);

  for (const [arGov, engGov] of Object.entries(GOVERNORATE_ALIASES)) {
    const expectedFee = SHIPPING_RATES_BY_GOVERNORATE[engGov];
    assert.equal(getShippingFeeForGovernorate(arGov), expectedFee);
    assert.equal(emailServiceGetShippingFee(arGov), expectedFee);
    assert.equal(calculateShippingFee(arGov, 2000), expectedFee);
    assert.equal(calculateShippingFee(arGov, 2001), 0);
  }

  // Verify end-to-end create-order POST with Arabic governorate at === 2000 boundary
  const hexKey = crypto.randomBytes(32).toString('hex');
  const mockDb = createRtdbMock({
    products: {
      p2000: { name: 'روتين كامل', price: 2000, stockQuantity: 50 }
    }
  });
  const res = await createOrderPOST({
    request: makeOrderReq({
      customer: { governorate: 'الغربية' },
      items: [{ productId: 'p2000', quantity: 1 }]
    }),
    clientAddress: '41.41.60.9',
    _deps: makeDeps(mockDb, hexKey)
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  const savedOrder = mockDb.data.orders[body.orderId];
  assert.equal(savedOrder.shippingFee, 70);
  assert.equal(savedOrder.totalAmount, 2070);
});

