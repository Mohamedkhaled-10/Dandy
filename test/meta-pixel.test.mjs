// test/meta-pixel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Meta Pixel Engine & Config Validation', async (t) => {
  const pixelScriptPath = path.resolve('public/assets/js/meta-pixel.js');
  assert.ok(fs.existsSync(pixelScriptPath), 'meta-pixel.js must exist in public/assets/js');

  const content = fs.readFileSync(pixelScriptPath, 'utf8');

  await t.test('Correct Meta Pixel ID is embedded', () => {
    assert.match(content, /1678552386587380/, 'Expected Pixel ID 1678552386587380');
  });

  await t.test('Excluded routes filter is defined', () => {
    assert.match(content, /isExcludedRoute/, 'isExcludedRoute function must exist');
    assert.match(content, /\/dashboard/, 'Dashboard routes must be excluded');
    assert.match(content, /\/login/, 'Admin login must be excluded');
    assert.match(content, /\/statues/, 'Internal stats must be excluded');
  });

  await t.test('Consent management gating is enforced', () => {
    assert.match(content, /getConsentStatus/, 'getConsentStatus must exist');
    assert.match(content, /setConsentStatus/, 'setConsentStatus must exist');
    assert.match(content, /granted/, 'Only granted status should allow tracking');
  });

  await t.test('Re-granting consent calls fbq consent grant even when initialized', () => {
    assert.match(content, /window\.fbq\('consent',\s*'grant'\)/, 'Must call consent grant upon re-granting');
  });

  await t.test('Standard events are implemented', () => {
    assert.match(content, /trackViewContent/, 'trackViewContent must exist');
    assert.match(content, /trackAddToCart/, 'trackAddToCart must exist');
    assert.match(content, /trackSearch/, 'trackSearch must exist');
    assert.match(content, /trackInitiateCheckout/, 'trackInitiateCheckout must exist');
    assert.match(content, /trackPurchase/, 'trackPurchase must exist');
  });

  await t.test('Duplicate purchase prevention mechanism exists and is protected by try/catch', () => {
    assert.match(content, /dandy_meta_purchase_fired_/, 'Purchase deduplication key must exist in storage check');
    assert.match(content, /try\s*\{\s*var\s+sStorage\s*=\s*window\.sessionStorage;/, 'sessionStorage get must be wrapped in try/catch');
    assert.match(content, /sStorage\.setItem\(storageKey,\s*'true'\);/, 'sessionStorage set must exist');
  });
});

test('BaseLayout integration', () => {
  const baseLayoutPath = path.resolve('src/layouts/BaseLayout.astro');
  const layoutContent = fs.readFileSync(baseLayoutPath, 'utf8');

  assert.match(layoutContent, /\/assets\/js\/meta-pixel\.js/, 'BaseLayout must include meta-pixel.js');
  assert.match(layoutContent, /<ConsentBanner \/>/, 'BaseLayout must render ConsentBanner');
});

test('Cart InitiateCheckout isolation check', () => {
  const cartPath = path.resolve('src/pages/cart.astro');
  const cartContent = fs.readFileSync(cartPath, 'utf8');

  // Must not call InitiateCheckout at root of script
  const endOfScript = cartContent.slice(-1000);
  assert.doesNotMatch(endOfScript, /fbq\('track',\s*'InitiateCheckout'/, 'InitiateCheckout must not be fired on initial page load');
  assert.match(cartContent, /step === 2 && !hasFiredInitiateCheckout/, 'InitiateCheckout must be tied to advancing to Step 2');
});

test('Invoice Purchase event uses clean product IDs and deduplication', () => {
  const invoicePath = path.resolve('src/pages/invoice.astro');
  const invoiceContent = fs.readFileSync(invoicePath, 'utf8');

  assert.match(invoiceContent, /window\.DandyMeta\.trackPurchase\(order\)/, 'Invoice must invoke trackPurchase on validated order snapshot');
});

test('Privacy policy has disclosure and user controls', () => {
  const privacyPath = path.resolve('src/pages/privacy-policy.astro');
  const privacyContent = fs.readFileSync(privacyPath, 'utf8');

  assert.match(privacyContent, /1678552386587380/, 'Privacy policy must disclose Meta Pixel ID');
  assert.match(privacyContent, /btn-grant-consent/, 'Privacy policy must have grant consent button');
  assert.match(privacyContent, /btn-revoke-consent/, 'Privacy policy must have revoke consent button');
});

test('Functional In-Memory Browser Pixel Simulation: Unset -> Granted -> Denied -> Granted & Purchase Protections', async (t) => {
  // Simulate DOM and Window environment for deep unit-level verification
  const fakeStorage = new Map();
  const fakeSession = new Map();
  let sessionBlocked = false;

  const mockWindow = {
    location: { pathname: '/product/natural-rose-mist' },
    localStorage: {
      getItem: (k) => fakeStorage.get(k) || null,
      setItem: (k, v) => fakeStorage.set(k, String(v))
    },
    sessionStorage: {
      getItem: (k) => {
        if (sessionBlocked) throw new Error('SecurityError: Access is denied for this document');
        return fakeSession.get(k) || null;
      },
      setItem: (k, v) => {
        if (sessionBlocked) throw new Error('SecurityError: Access is denied for this document');
        fakeSession.set(k, String(v));
      }
    },
    dispatchEvent: () => {}
  };

  const mockDocument = {
    readyState: 'complete',
    addEventListener: () => {},
    createElement: () => ({ setAttribute: () => {}, src: '', async: true }),
    getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }]
  };

  // Track calls to fbq
  const fbqCalls = [];
  mockWindow.fbq = function (...args) {
    fbqCalls.push(args);
  };
  mockWindow.fbq.queue = [];

  // Evaluate the exact logic from meta-pixel.js inside this mock scope
  const pixelCode = fs.readFileSync(path.resolve('public/assets/js/meta-pixel.js'), 'utf8');
  const fn = new Function('window', 'document', pixelCode);
  fn(mockWindow, mockDocument);

  await t.test('1. Initial state is unset, no events fired', () => {
    assert.equal(mockWindow.DandyMeta.getConsent(), 'unset');
    const fired = mockWindow.DandyMeta.track('ViewContent', { content_name: 'Rose' });
    assert.equal(fired, false, 'No events should fire when consent is unset');
  });

  await t.test('2. Transition to granted initializes and fires PageView', () => {
    mockWindow.DandyMeta.setConsent('granted');
    assert.equal(mockWindow.DandyMeta.getConsent(), 'granted');
    assert.ok(fbqCalls.some(c => c[0] === 'consent' && c[1] === 'grant'), 'fbq consent grant should be called');
    assert.ok(fbqCalls.some(c => c[0] === 'init'), 'fbq init should be called');
    assert.ok(fbqCalls.some(c => c[0] === 'track' && c[1] === 'PageView'), 'fbq PageView should be called');

    const fired = mockWindow.DandyMeta.track('ViewContent', { content_name: 'Rose' });
    assert.equal(fired, true, 'Events should fire when granted');
  });

  await t.test('3. Transition to denied revokes consent and halts events', () => {
    mockWindow.DandyMeta.setConsent('denied');
    assert.equal(mockWindow.DandyMeta.getConsent(), 'denied');
    assert.ok(fbqCalls.some(c => c[0] === 'consent' && c[1] === 'revoke'), 'fbq consent revoke should be called');

    const fired = mockWindow.DandyMeta.track('ViewContent', { content_name: 'Rose' });
    assert.equal(fired, false, 'Events MUST NOT fire when denied');
  });

  await t.test('4. Transition back to granted re-asserts consent grant and re-enables events', () => {
    const prevCallsCount = fbqCalls.length;
    mockWindow.DandyMeta.setConsent('granted');
    assert.equal(mockWindow.DandyMeta.getConsent(), 'granted');

    const newCalls = fbqCalls.slice(prevCallsCount);
    assert.ok(newCalls.some(c => c[0] === 'consent' && c[1] === 'grant'), 'fbq consent grant MUST be called again');

    const fired = mockWindow.DandyMeta.track('ViewContent', { content_name: 'Rose' });
    assert.equal(fired, true, 'Events should resume firing when granted again');
  });

  await t.test('5. Purchase event validation: rejects unconfirmed/empty/invalid orders', () => {
    // Empty order
    assert.equal(mockWindow.DandyMeta.trackPurchase(null), false);
    assert.equal(mockWindow.DandyMeta.trackPurchase({}), false);

    // Missing products
    assert.equal(mockWindow.DandyMeta.trackPurchase({ invoiceCode: 'DNY-1001', products: [], totalAmount: 500 }), false);

    // Missing total or zero total
    assert.equal(mockWindow.DandyMeta.trackPurchase({
      invoiceCode: 'DNY-1002',
      products: [{ id: 'p1', quantity: 1, price: 0 }],
      totalAmount: 0
    }), false);
  });

  await t.test('6. Purchase event fires for confirmed order and deduplicates', () => {
    const validOrder = {
      invoiceCode: 'DNY-998877',
      totalAmount: 450,
      products: [
        { id: 'prod_mist::scent_rose', name: 'Rose Mist', quantity: 1, price: 200 },
        {
          type: 'collection',
          name: 'Pink Friday Hair Set',
          quantity: 1,
          items: [{ productId: 'prod_shampoo' }, { productId: 'prod_oil' }]
        }
      ]
    };

    const firstFire = mockWindow.DandyMeta.trackPurchase(validOrder);
    assert.equal(firstFire, true, 'First purchase track must succeed');

    // Find the purchase call
    const purchaseCall = fbqCalls.find(c => c[0] === 'track' && c[1] === 'Purchase');
    assert.ok(purchaseCall, 'Purchase call must exist');
    assert.equal(purchaseCall[2].transaction_id, 'DNY-998877');
    assert.equal(purchaseCall[2].value, 450);
    assert.equal(purchaseCall[2].currency, 'EGP');
    assert.deepEqual(purchaseCall[2].content_ids, ['prod_mist', 'prod_shampoo', 'prod_oil']);
    assert.equal(purchaseCall[3].eventID, 'DNY-998877', 'eventID must match transaction_id for Conversions API deduplication');

    // Second fire with same invoiceCode must be deduplicated
    const secondFire = mockWindow.DandyMeta.trackPurchase(validOrder);
    assert.equal(secondFire, false, 'Duplicate purchase call MUST be blocked by sessionStorage');
  });

  await t.test('7. Purchase event survives sessionStorage SecurityError (Private Browsing / Blocked Storage)', () => {
    sessionBlocked = true;
    const anotherOrder = {
      invoiceCode: 'DNY-PRIV-123',
      totalAmount: 300,
      products: [{ id: 'p_serum', quantity: 1, price: 300 }]
    };

    assert.doesNotThrow(() => {
      const fired = mockWindow.DandyMeta.trackPurchase(anotherOrder);
      assert.equal(fired, true, 'Must execute safely and fire event without crashing');
    });
    sessionBlocked = false;
  });
});
