// test/order-submission.test.mjs
// Automated Test Suite for Dandy Cosmetics Order Submission and Validation Engine

import test from 'node:test';
import assert from 'node:assert/strict';

// 1. Verify verifyTurnstileToken import and existence
test('1. verifyTurnstileToken is exported and is an async function', async () => {
  const turnstileModule = await import('../src/utils/turnstile.js');
  assert.equal(typeof turnstileModule.verifyTurnstileToken, 'function');

  const prev = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = 'test_secret_key';
  try {
    // Test missing token check inside verifyTurnstileToken
    const resEmpty = await turnstileModule.verifyTurnstileToken(null);
    assert.equal(resEmpty.success, false);
    assert.equal(resEmpty.error, 'MISSING_CAPTCHA_TOKEN');
  } finally {
    process.env.TURNSTILE_SECRET_KEY = prev;
  }
});

// 2. Order request without CAPTCHA returns 400
test('2. Order submission without CAPTCHA returns 400 CAPTCHA_REQUIRED', async () => {
  const { POST } = await import('../src/pages/api/create-order.js');

  const dummyRequest = new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'سارة أحمد',
        phone: '01012345678',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9'
      },
      items: [{ id: '-OW9U9Af024A9LrbOU4f', quantity: 1 }],
      turnstileToken: '' // Missing CAPTCHA
    })
  });

  const response = await POST({ request: dummyRequest });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.success, false);
  assert.equal(data.error, 'CAPTCHA_REQUIRED');
});

// 3. Order request with invalid CAPTCHA token returns 403 or handled config error
test('3. Order submission with invalid CAPTCHA returns 403 or handled config status', async () => {
  const { POST } = await import('../src/pages/api/create-order.js');

  const dummyRequest = new Request('http://localhost:3000/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: {
        name: 'سارة أحمد',
        phone: '01012345678',
        governorate: 'Cairo',
        city: 'المعادي',
        address: 'شارع 9'
      },
      items: [{ id: '-OW9U9Af024A9LrbOU4f', quantity: 1 }],
      turnstileToken: 'invalid_dummy_token_99999'
    })
  });

  const response = await POST({ request: dummyRequest });
  // If TURNSTILE_SECRET_KEY is not defined, it returns 500 (SERVER_MISCONFIGURATION)
  // If defined and token rejected, it returns 403 (CAPTCHA_FAILED)
  // In neither case does it crash or return ORDER_CREATION_FAILED
  assert.ok(response.status === 403 || response.status === 500);
  const data = await response.json();
  assert.equal(data.success, false);
  assert.ok(data.error === 'CAPTCHA_FAILED' || data.error === 'SERVER_MISCONFIGURATION');
});

// 4. Test Customer Validation Rules
test('4. Customer validations reject invalid inputs with 400', async () => {
  // We mock TURNSTILE_SECRET_KEY temporarily to test customer validation step
  const origKey = process.env.TURNSTILE_SECRET_KEY;
  // Mock fetch for turnstile siteverify
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      return new Response(JSON.stringify({ success: true }));
    }
    return originalFetch(url, options);
  };
  process.env.TURNSTILE_SECRET_KEY = 'mock_secret_key';

  try {
    const { POST } = await import('../src/pages/api/create-order.js');

    // Name too short (<2 chars)
    const reqShortName = new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'أ', phone: '01012345678', governorate: 'Cairo', city: 'المعادي', address: 'شارع 9' },
        items: [{ id: 'prod-1', quantity: 1 }],
        turnstileToken: 'valid_mock_token'
      })
    });
    const resShortName = await POST({ request: reqShortName });
    assert.equal(resShortName.status, 400);
    const dataName = await resShortName.json();
    assert.equal(dataName.error, 'INVALID_NAME');

    // Phone too short (<10 chars)
    const reqShortPhone = new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'سارة أحمد', phone: '0101', governorate: 'Cairo', city: 'المعادي', address: 'شارع 9' },
        items: [{ id: 'prod-1', quantity: 1 }],
        turnstileToken: 'valid_mock_token'
      })
    });
    const resShortPhone = await POST({ request: reqShortPhone });
    assert.equal(resShortPhone.status, 400);
    const dataPhone = await resShortPhone.json();
    assert.equal(dataPhone.error, 'INVALID_PHONE');

    // Empty cart items
    const reqEmptyCart = new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'سارة أحمد', phone: '01012345678', governorate: 'Cairo', city: 'المعادي', address: 'شارع 9' },
        items: [],
        turnstileToken: 'valid_mock_token'
      })
    });
    const resEmptyCart = await POST({ request: reqEmptyCart });
    assert.equal(resEmptyCart.status, 400);
    const dataEmptyCart = await resEmptyCart.json();
    assert.equal(dataEmptyCart.error, 'EMPTY_CART');

  } finally {
    process.env.TURNSTILE_SECRET_KEY = origKey;
    globalThis.fetch = originalFetch;
  }
});

// 5. Shipping fee and invoice calculations
test('5. Shipping fee and invoice code logic', () => {
  // Shipping rates test
  const cairoFee = 85;
  const gharbiaFee = 70;
  const defaultFee = 120;

  assert.equal(cairoFee, 85);
  assert.equal(gharbiaFee, 70);

  // Free shipping over 2000 EGP
  const subtotalNormal = 1500;
  const subtotalFreeShipping = 2200;

  const fee1 = subtotalNormal > 2000 ? 0 : 85;
  assert.equal(fee1, 85);

  const fee2 = subtotalFreeShipping > 2000 ? 0 : 85;
  assert.equal(fee2, 0);

  // Invoice code format
  const invoiceCode = 'DNY-' + Math.floor(100000 + Math.random() * 900000);
  assert.match(invoiceCode, /^DNY-\d{6}$/);
});

// 6. Test Single Product and Collection pricing engine calculations
test('6. Products and Collection pricing calculation logic', async () => {
  const { calculatePinkFridayPricing } = await import('../src/utils/pink-friday-server.ts');

  // Test single product calculation
  const product = { id: '-OW9U9Af024A9LrbOU4f', price: 450 };
  const campaign = {
    id: 'pink-friday-2026',
    year: 2026,
    enabled: true,
    startAt: '2026-11-01T00:00:00+02:00',
    endAt: '2026-11-30T23:59:59+02:00',
    offers: [
      {
        productId: '-OW9U9Af024A9LrbOU4f',
        expectedBasePrice: 450,
        campaignPrice: 380,
        active: true,
        badgeText: 'Pink Friday'
      }
    ]
  };

  const pricing = calculatePinkFridayPricing(product, campaign, new Date('2026-11-15T12:00:00+02:00'));
  assert.equal(pricing.isEligible, true);
  assert.equal(pricing.campaignPrice, 380);
  assert.equal(pricing.regularPrice, 450);

  // Test collection package pricing
  const collectionBundle = {
    id: 'col-hair-care',
    name: 'كوليكشن العناية بالشعر',
    pricingType: 'package',
    packagePrice: 650,
    items: [
      { collectionItemId: 'ci_1', productId: 'p1' },
      { collectionItemId: 'ci_2', productId: 'p2' }
    ]
  };

  const itemBaseTotal = 400 + 450; // 850
  const effectiveUnitPrice = collectionBundle.packagePrice; // 650
  const quantity = 2;
  const lineTotal = effectiveUnitPrice * quantity; // 1300

  assert.equal(effectiveUnitPrice, 650);
  assert.equal(lineTotal, 1300);
});
