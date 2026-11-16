// test/group2a4-cart-shipping-progress.test.mjs
// DANDY PHASE 2 / GROUP 2A.4: Cart Free Shipping Progress & Order Summary Clarity

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

import {
  FREE_SHIPPING_THRESHOLD_EGP,
  SHIPPING_FEE_RANGE_EGP,
  getPublicStoreShippingPolicy,
  calculateShippingFee
} from '../src/config/store-policy.ts';
import { POST as createOrderPOST } from '../src/pages/api/create-order.js';

const cartShippingHelperPath = path.resolve('public/assets/js/cart-shipping-progress.js');
const variantsHelperPath = path.resolve('public/assets/js/variants.js');
const pinkFridayPath = path.resolve('public/assets/js/pink-friday.js');
const cartAstroPath = path.resolve('src/pages/cart.astro');

async function loadPureHelpers() {
  const [shippingSrc, variantsSrc, pfSrc] = await Promise.all([
    fs.readFile(cartShippingHelperPath, 'utf8'),
    fs.readFile(variantsHelperPath, 'utf8'),
    fs.readFile(pinkFridayPath, 'utf8')
  ]);

  const shipMod = { exports: {} };
  vm.runInNewContext(shippingSrc, {
    module: shipMod,
    exports: shipMod.exports,
    globalThis: {},
    Math,
    Number,
    Object,
    Array,
    String,
    parseInt
  });

  const varMod = { exports: {} };
  const varWin = {};
  vm.runInNewContext(variantsSrc, {
    module: varMod,
    exports: varMod.exports,
    window: varWin,
    globalThis: varWin,
    Math,
    Number,
    Object,
    Array,
    String,
    Set,
    Map
  });

  return {
    cartShipping: shipMod.exports,
    variants: varMod.exports,
    pfSrc
  };
}

function createFakeElement(id = '', tag = 'div') {
  const attrs = new Map();
  const classes = new Set();
  const children = [];
  const listeners = new Map();
  let _innerHTML = '';
  let _textContent = '';

  const el = {
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
      list.forEach(fn => fn(evt));
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
  return el;
}

async function mountCartSimulation({ initialCart = [], pinkFridayConfig = null } = {}) {
  const [cartSource, shippingSrc, variantsSrc, pfSrc] = await Promise.all([
    fs.readFile(cartAstroPath, 'utf8'),
    fs.readFile(cartShippingHelperPath, 'utf8'),
    fs.readFile(variantsHelperPath, 'utf8'),
    fs.readFile(pinkFridayPath, 'utf8')
  ]);

  const policyJson = JSON.stringify(getPublicStoreShippingPolicy());

  // Extract inline script body from cart.astro
  const scriptMatches = [...cartSource.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)];
  assert.ok(scriptMatches.length >= 1, 'Expected inline script in cart.astro');
  const inlineScript = scriptMatches[scriptMatches.length - 1][1];

  const elements = new Map();
  const registerEl = (id, tag = 'div') => {
    const el = createFakeElement(id, tag);
    elements.set(id, el);
    return el;
  };

  const trackedIds = [
    'cartCheckoutContainer',
    'freeShippingProgressCard',
    'freeShippingIcon',
    'freeShippingTitle',
    'freeShippingMessage',
    'freeShippingBadge',
    'freeShippingProgressBar',
    'freeShippingProgressFill',
    'cartItemsList',
    'subtotalValSummary',
    'freeShippingStatusSummary1',
    'shippingCostSummary1',
    'grandTotalLabelSummary1',
    'grandTotalSummaryValue1',
    'shippingSummaryHint1',
    'subtotalValSummary2',
    'freeShippingStatusSummary2',
    'shippingCostSummary2',
    'grandTotalLabelSummary2',
    'grandTotalSummaryValue2',
    'shippingSummaryHint2',
    'summSubtotal',
    'freeShippingStatusSummary3',
    'summShipping',
    'finalSummaryTotal',
    'revCustName',
    'revCustPhone',
    'revCustEmail',
    'revCustLocation',
    'revCustAddress',
    'revProductsList',
    'f-name',
    'f-phone',
    'f-email',
    'f-gov',
    'f-city',
    'f-address',
    'stepperLineProgress',
    'step-panel-1',
    'step-panel-2',
    'step-panel-3',
    'stepper-step-1',
    'stepper-step-2',
    'stepper-step-3',
    'cart-count',
    'btnResetOrderAttempt',
    'checkoutStatusBanner',
    'checkoutStatusBannerText',
    'checkoutStatusBannerActions',
    'finalPlaceOrderBtn',
    'savingTextLoader',
    'savedAddressesSection',
    'savedAddressSelect'
  ];
  trackedIds.forEach(id => registerEl(id));

  const policyEl = registerEl('dandy-store-shipping-policy', 'script');
  policyEl.textContent = policyJson;

  // Populate #f-gov options from cart.astro markup
  const govSelect = elements.get('f-gov');
  const selectMatch = cartSource.match(/<select id="f-gov"[\s\S]*?<\/select>/);
  assert.ok(selectMatch, 'Expected #f-gov select in cart.astro');
  govSelect.options = [...selectMatch[0].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(m => ({
    value: m[1],
    text: m[2]
  }));
  govSelect.setGov = (val) => {
    const idx = govSelect.options.findIndex(o => o.value === val);
    govSelect.value = val;
    govSelect.selectedIndex = idx >= 0 ? idx : 0;
  };
  govSelect.setGov('');

  const storageMap = new Map();
  storageMap.set('cart', JSON.stringify(initialCart));

  const localStorageMock = {
    getItem(k) { return storageMap.has(k) ? storageMap.get(k) : null; },
    setItem(k, v) { storageMap.set(k, String(v)); },
    removeItem(k) { storageMap.delete(k); }
  };

  const doc = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tag) {
      return createFakeElement('', tag);
    },
    querySelectorAll(sel) {
      if (sel === '.checkout-step-panel') {
        return [elements.get('step-panel-1'), elements.get('step-panel-2'), elements.get('step-panel-3')];
      }
      if (sel === '.stepper-step') {
        return [elements.get('stepper-step-1'), elements.get('stepper-step-2'), elements.get('stepper-step-3')];
      }
      return [];
    },
    querySelector() { return null; }
  };

  const alerts = [];
  const sandbox = {
    __PINK_FRIDAY_CONFIG: pinkFridayConfig || { enabled: false, offers: [], collections: [] },
    localStorage: localStorageMock,
    sessionStorage: createFakeElement(),
    scrollTo: () => {},
    dispatchEvent: () => {},
    addEventListener: () => {},
    location: { href: 'http://localhost:3000/cart' },
    document: doc,
    firebase: {
      database: () => ({ ref: () => ({ once: async () => ({ exists: () => false }) }) }),
      auth: () => ({ onAuthStateChanged: () => {} })
    },
    CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
    alert: (msg) => alerts.push(msg),
    console,
    Math,
    Number,
    Object,
    Array,
    String,
    JSON,
    Date,
    Set,
    Map,
    parseInt
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const win = sandbox;

  vm.runInNewContext(variantsSrc, sandbox);
  vm.runInNewContext(pfSrc, sandbox);
  vm.runInNewContext(shippingSrc, sandbox);
  vm.runInNewContext(inlineScript, sandbox);

  return { sandbox, win, elements, govSelect, storageMap, alerts };
}

test('1. Empty cart behavior renders empty state cleanly with zero shipping progress errors', async () => {
  const { cartShipping } = await loadPureHelpers();
  const policy = getPublicStoreShippingPolicy();

  assert.equal(cartShipping.computeCartSubtotal([]), 0);
  const emptyProgress = cartShipping.evaluateFreeShippingProgress(0, policy);
  assert.equal(emptyProgress.state, 'below_threshold');
  assert.equal(emptyProgress.isEligible, false);
  assert.equal(emptyProgress.progressPercent, 0);

  const { elements } = await mountCartSimulation({ initialCart: [] });
  const containerHtml = elements.get('cartCheckoutContainer').innerHTML;
  assert.match(containerHtml, /حقيبة التسوق فارغة/);
  assert.match(containerHtml, /\/all-products/);
});

test('2. Subtotal below 2,000 EGP reports exact remaining amount to threshold and states threshold must be exceeded', async () => {
  const { cartShipping } = await loadPureHelpers();
  const policy = getPublicStoreShippingPolicy();

  const p1500 = cartShipping.evaluateFreeShippingProgress(1500, policy);
  assert.equal(p1500.state, 'below_threshold');
  assert.equal(p1500.isEligible, false);
  assert.equal(p1500.isAtThreshold, false);
  assert.equal(p1500.remainingToThreshold, 500);
  assert.equal(p1500.progressPercent, 75);
  assert.match(p1500.messageText, /500 ج\.م/);
  assert.match(p1500.messageText, /تجاوز/);
  assert.match(p1500.messageText, new RegExp(String(FREE_SHIPPING_THRESHOLD_EGP)));

  // 1999.5 must never display "0" remaining or 100% progress
  const pAlmost = cartShipping.evaluateFreeShippingProgress(1999.5, policy);
  assert.equal(pAlmost.state, 'below_threshold');
  assert.equal(pAlmost.isEligible, false);
  assert.equal(pAlmost.remainingFormatted, '0.5');
  assert.ok(pAlmost.progressPercent < 100);
  assert.match(pAlmost.messageText, /0\.5 ج\.م/);
});

test('3. Subtotal exactly 2,000 EGP does NOT qualify for free shipping and uses distinct at-threshold warning state', async () => {
  const { cartShipping } = await loadPureHelpers();
  const policy = getPublicStoreShippingPolicy();

  const p2000 = cartShipping.evaluateFreeShippingProgress(2000, policy);
  assert.equal(p2000.state, 'at_threshold');
  assert.equal(p2000.isEligible, false);
  assert.equal(p2000.isAtThreshold, true);
  assert.ok(p2000.progressPercent < 100, 'Exact 2000 must not visually look 100% unlocked');
  assert.match(p2000.badgeText, /عند الحد تماماً/);
  assert.match(p2000.messageText, /بالضبط|تماماً/);
  assert.match(p2000.messageText, /تجاوز/);
  // Must not invent a 1 EGP minimum increment
  assert.equal(p2000.messageText.includes('أضيفي 1'), false);

  const summaryGharbia = cartShipping.computeCheckoutSummaryState({
    subtotal: 2000,
    policy,
    selectedGovernorate: 'Gharbia',
    selectedGovernorateLabel: 'الغربية'
  });
  assert.equal(summaryGharbia.shippingFee, 70);
  assert.equal(summaryGharbia.finalTotal, 2070);
  assert.equal(summaryGharbia.step3ShippingText, '70 ج.م (الغربية)');
  assert.equal(summaryGharbia.step3TotalText, '2070 ج.م');
});

test('4. Subtotal strictly above 2,000 EGP unlocks free shipping and zeroes shipping fee', async () => {
  const { cartShipping } = await loadPureHelpers();
  const policy = getPublicStoreShippingPolicy();

  for (const sub of [2000.01, 2001, 2500]) {
    const p = cartShipping.evaluateFreeShippingProgress(sub, policy);
    assert.equal(p.state, 'unlocked');
    assert.equal(p.isEligible, true);
    assert.equal(p.progressPercent, 100);
    assert.match(p.badgeText, /مُفعّل/);

    const sumAswan = cartShipping.computeCheckoutSummaryState({
      subtotal: sub,
      policy,
      selectedGovernorate: 'Aswan',
      selectedGovernorateLabel: 'أسوان'
    });
    assert.equal(sumAswan.shippingFee, 0);
    assert.equal(sumAswan.finalTotal, sub);
    assert.match(sumAswan.shippingDisplayText, /شحن مجاني/);
  }
});

test('5 & 6. Quantity updates and product removal immediately update progress, status, and totals across steps', async () => {
  const { win, elements, govSelect } = await mountCartSimulation({
    initialCart: [
      { id: 'p1', productId: 'p1', name: 'سيروم', price: 1000, quantity: 1 },
      { id: 'p2', productId: 'p2', name: 'ماسك', price: 500, quantity: 1 }
    ]
  });
  govSelect.setGov('Cairo');
  win.handleGovChange();

  // Initial: 1500 EGP -> below_threshold, Cairo 85 -> 1585 total
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'below_threshold');
  assert.equal(elements.get('subtotalValSummary').textContent, '1500 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '1585 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '1585 ج.م');

  // Step 5a: Increase item 1 (p2 +1 -> +500 => subtotal 2000 exactly -> at_threshold, still 85 shipping!)
  win.changeQty(1, 1);
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'at_threshold');
  assert.equal(elements.get('subtotalValSummary').textContent, '2000 ج.م');
  assert.equal(elements.get('shippingCostSummary2').textContent, '85 ج.م (القاهرة)');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '2085 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '2085 ج.م');

  // Step 5b: Increase item 1 again (p2 +1 -> +500 => subtotal 2500 > 2000 -> unlocked, shipping 0!)
  win.changeQty(1, 1);
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'unlocked');
  assert.equal(elements.get('subtotalValSummary').textContent, '2500 ج.م');
  assert.match(elements.get('shippingCostSummary1').textContent, /شحن مجاني/);
  assert.match(elements.get('shippingCostSummary2').textContent, /شحن مجاني/);
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '2500 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '2500 ج.م');

  // Step 5c: Decrease qty back by 1 -> drops back to 2000 (at_threshold), shipping returns to 85 EGP
  win.changeQty(1, -1);
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'at_threshold');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '2085 ج.م');

  // Step 6: Remove item 0 (1000 EGP) -> subtotal drops to 1000 (below_threshold), total 1085 EGP
  win.removeItemFromCart(0);
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'below_threshold');
  assert.equal(elements.get('subtotalValSummary').textContent, '1000 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '1085 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '1085 ج.م');

  // Remove remaining item -> empty cart cleanly rendered without errors
  win.removeItemFromCart(0);
  assert.match(elements.get('cartCheckoutContainer').innerHTML, /حقيبة التسوق فارغة/);
});

test('7 & 8. Different governorates and unselected governorate display unambiguous shipping and totals', async () => {
  const { win, elements, govSelect } = await mountCartSimulation({
    initialCart: [{ id: 'p1', productId: 'p1', name: 'كريم', price: 1200, quantity: 1 }]
  });

  // 8. Before governorate is selected: must NOT present unknown fee or subtotal as confirmed final total
  assert.equal(govSelect.value, '');
  assert.match(elements.get('shippingCostSummary1').textContent, /70–120 ج\.م/);
  assert.match(elements.get('shippingCostSummary2').textContent, /70–120 ج\.م/);
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '1200 ج.م + الشحن');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, 'يُحدد بعد اختيار المحافظة');

  // 7. Switch across shipping zones
  const zoneExpectations = [
    { gov: 'Gharbia', label: 'الغربية', fee: 70, total: 1270 },
    { gov: 'Cairo', label: 'القاهرة', fee: 85, total: 1285 },
    { gov: 'Fayoum', label: 'الفيوم', fee: 100, total: 1300 },
    { gov: 'Aswan', label: 'أسوان', fee: 120, total: 1320 }
  ];

  for (const tc of zoneExpectations) {
    govSelect.setGov(tc.gov);
    win.handleGovChange();
    assert.equal(elements.get('shippingCostSummary2').textContent, `${tc.fee} ج.م (${tc.label})`);
    assert.equal(elements.get('grandTotalSummaryValue2').textContent, `${tc.total} ج.م`);
    assert.equal(elements.get('grandTotalSummaryValue1').textContent, `${tc.total} ج.م`);
  }
});

test('9. Checkout steps 1, 2, and 3 remain synchronized end-to-end', async () => {
  const { win, elements, govSelect, alerts } = await mountCartSimulation({
    initialCart: [{ id: 'p1', productId: 'p1', name: 'زيت طبيعي', price: 1800, quantity: 1 }]
  });

  // Step 1 -> Step 2
  win.goToStep(2);
  assert.equal(elements.get('subtotalValSummary2').textContent, '1800 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, 'يُحدد بعد اختيار المحافظة');

  // Fill valid shipping info & select Gharbia (70 EGP)
  elements.get('f-name').value = 'سلمى محمد علي';
  elements.get('f-phone').value = '01012345678';
  elements.get('f-email').value = 'salma@example.com';
  govSelect.setGov('Gharbia');
  elements.get('f-city').value = 'طنطا';
  elements.get('f-address').value = 'شارع البحر عمارة 4';
  win.handleGovChange();

  // Go to Step 3 Review
  win.validateAndGoToReview();
  assert.equal(alerts.length, 0);
  assert.equal(elements.get('summSubtotal').textContent, '1800 ج.م');
  assert.equal(elements.get('summShipping').textContent, '70 ج.م (الغربية)');
  assert.equal(elements.get('finalSummaryTotal').textContent, '1870 ج.م');
  assert.match(elements.get('freeShippingStatusSummary3').textContent, /غير مؤهل بعد/);

  // Navigate back to Step 1 and bump quantity to 2 (3600 > 2000) -> Step 1, 2, 3 all synchronize!
  win.goToStep(1);
  win.changeQty(0, 1);
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'unlocked');
  assert.equal(elements.get('subtotalValSummary').textContent, '3600 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue1').textContent, '3600 ج.م');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '3600 ج.م');
  assert.equal(elements.get('summSubtotal').textContent, '3600 ج.م');
  assert.equal(elements.get('summShipping').textContent, 'شحن مجاني (0 ج.م)');
  assert.equal(elements.get('finalSummaryTotal').textContent, '3600 ج.م');
});

test('10. Multi-variant scent selection pricing matches getEffectiveUnitPrice in progress and totals', async () => {
  // Unit price 500 with 2 selected scents = 1000 EGP effective unit price.
  // Qty 2 => 2000 EGP exactly => MUST be at_threshold (NOT free shipping)!
  const { win, elements, govSelect } = await mountCartSimulation({
    initialCart: [
      {
        id: 'musk::white_pomegranate',
        productId: 'musk',
        name: 'مسك داندى',
        price: 500,
        quantity: 2,
        selectedVariants: [
          { id: 'white', name: 'مسك أبيض' },
          { id: 'pomegranate', name: 'مسك رمان' }
        ]
      }
    ]
  });

  govSelect.setGov('Cairo');
  win.handleGovChange();
  assert.equal(elements.get('subtotalValSummary').textContent, '2000 ج.م');
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'at_threshold');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '2085 ج.م');

  // Qty 3 => 3000 EGP (> 2000) => unlocked, free shipping
  win.changeQty(0, 1);
  assert.equal(elements.get('subtotalValSummary').textContent, '3000 ج.م');
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'unlocked');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '3000 ج.م');
});

test('11. Pink Friday campaign pricing updates cart subtotal and free-shipping threshold accurately', async () => {
  const now = Date.now();
  const pfConfig = {
    enabled: true,
    startAt: new Date(now - 3600_000).toISOString(),
    endAt: new Date(now + 3600_000).toISOString(),
    offers: [
      {
        productId: 'pf_serum',
        expectedBasePrice: 2200,
        campaignPrice: 2000,
        active: true,
        badgeText: 'عرض Pink Friday'
      }
    ],
    collections: []
  };

  // Item saved in cart at regular price 2200, reconciled on load to PF price 2000 => drops from unlocked to at_threshold!
  const { win, elements, govSelect } = await mountCartSimulation({
    initialCart: [
      {
        id: 'pf_serum',
        productId: 'pf_serum',
        name: 'سيروم فاخر',
        price: 2200,
        quantity: 1
      }
    ],
    pinkFridayConfig: pfConfig
  });

  govSelect.setGov('Gharbia');
  win.handleGovChange();
  assert.equal(elements.get('subtotalValSummary').textContent, '2000 ج.م');
  assert.equal(elements.get('freeShippingProgressCard').getAttribute('data-state'), 'at_threshold');
  assert.equal(elements.get('shippingCostSummary2').textContent, '70 ج.م (الغربية)');
  assert.equal(elements.get('grandTotalSummaryValue2').textContent, '2070 ج.م');
});

test('12. Server-side shipping & order calculation in create-order.js remains authoritative and unchanged', async () => {
  const data = {
    products: {
      p_2000: { name: 'مجموعة', price: 2000, stockQuantity: 10 },
      p_2001: { name: 'مجموعة بلس', price: 2001, stockQuantity: 10 }
    }
  };
  const makeRef = (p = '') => ({
    key: p.split('/').filter(Boolean).pop() || null,
    async once() {
      const parts = p.split('/').filter(Boolean);
      let curr = data;
      for (const k of parts) curr = curr?.[k];
      const val = curr === undefined ? null : JSON.parse(JSON.stringify(curr));
      return { exists: () => val !== null, val: () => val };
    },
    async set(v) {
      const parts = p.split('/').filter(Boolean);
      let curr = data;
      for (let i = 0; i < parts.length - 1; i++) curr = curr[parts[i]] ??= {};
      curr[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v));
    },
    async update(u) {
      for (const [k, v] of Object.entries(u)) await makeRef(p ? `${p}/${k}` : k).set(v);
    },
    push() { return makeRef(`${p}/-Ord_${crypto.randomUUID().slice(0, 6)}`); },
    async transaction(fn) {
      const snap = await this.once();
      const next = fn(snap.val());
      if (next !== undefined) await this.set(next);
      const after = await this.once();
      return { committed: next !== undefined, snapshot: after };
    }
  });

  const hexKey = crypto.randomBytes(32).toString('hex');
  const mockDb = { ref: makeRef };
  const deps = {
    adminDb: mockDb,
    adminAuth: null,
    redis: null,
    encryptionKey: hexKey,
    skipPublishedCampaignFallback: true,
    verifyTurnstileToken: async () => ({ success: true }),
    sendOrderNotification: async () => ({ success: true }),
    sendTelegramNotification: async () => ({ success: true })
  };

  // At 2000 EGP Gharbia -> server charges 70 EGP (total 2070) even if spoofed 0
  const res2000 = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name: 'نور الهدى',
          phone: '01012345678',
          email: 'nour@example.com',
          governorate: 'Gharbia',
          city: 'طنطا',
          address: 'شارع الجيش 5'
        },
        items: [{ productId: 'p_2000', quantity: 1 }],
        turnstileToken: 'ok',
        clientRequestId: crypto.randomUUID(),
        shippingFee: 0,
        totalAmount: 2000
      })
    }),
    clientAddress: '41.41.70.1',
    _deps: deps
  });
  assert.equal(res2000.status, 200);
  const body2000 = await res2000.json();
  assert.equal(data.orders[body2000.orderId].shippingFee, 70);
  assert.equal(data.orders[body2000.orderId].totalAmount, 2070);
  assert.equal(calculateShippingFee('Gharbia', 2000), 70);

  // At 2001 EGP Aswan -> server grants free shipping (0 EGP)
  const res2001 = await createOrderPOST({
    request: new Request('http://localhost:3000/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          name: 'نور الهدى',
          phone: '01012345678',
          email: 'nour@example.com',
          governorate: 'Aswan',
          city: 'أسوان',
          address: 'كورنيش النيل'
        },
        items: [{ productId: 'p_2001', quantity: 1 }],
        turnstileToken: 'ok',
        clientRequestId: crypto.randomUUID()
      })
    }),
    clientAddress: '41.41.70.2',
    _deps: deps
  });
  assert.equal(res2001.status, 200);
  const body2001 = await res2001.json();
  assert.equal(data.orders[body2001.orderId].shippingFee, 0);
  assert.equal(data.orders[body2001.orderId].totalAmount, 2001);
  assert.deepEqual(SHIPPING_FEE_RANGE_EGP, { min: 70, max: 120 });
});

test('13. Shipping helper remains coupon-independent & threshold-dynamic, cart uses pre-coupon subtotal for shipping alongside coupon UI, and no inventory system exists', async () => {
  const [helperSrc, cartSrc] = await Promise.all([
    fs.readFile(cartShippingHelperPath, 'utf8'),
    fs.readFile(cartAstroPath, 'utf8')
  ]);

  // Helper remains strictly independent of coupons, inventory, and hardcoded 2000 threshold
  assert.equal(/stockQuantity|inventory|decrement|reserveStock/i.test(helperSrc), false);
  assert.equal(/coupon|promoCode|discountCode/i.test(helperSrc), false);
  assert.equal(helperSrc.includes('2000'), false, 'cart-shipping-progress.js must read threshold from policy, never hardcode 2000');

  // Cart has no inventory/stock management system
  assert.equal(/stockQuantity|inventory|reserveStock/i.test(cartSrc), false);

  // Cart consumes centralized shipping policy and computes shipping progress from pre-coupon subtotal
  assert.ok(cartSrc.includes('getPublicStoreShippingPolicy()'));
  assert.ok(cartSrc.includes('STORE_SHIPPING_POLICY'));
  assert.match(cartSrc, /computeCheckoutSummaryState\(\{\s*subtotal:\s*subtotal,\s*policy:\s*STORE_SHIPPING_POLICY/);
  assert.match(cartSrc, /isFreeShippingEligible\(subtotal\)/);

  // GROUP 2A.6 Cart coupon UI and financial summary integration are present
  assert.ok(cartSrc.includes('id="couponBoxCard"'));
  assert.ok(cartSrc.includes('id="couponCodeInput"'));
  assert.ok(cartSrc.includes('id="applyCouponBtn"'));
  assert.ok(cartSrc.includes('id="couponSummaryRow1"'));
  assert.ok(cartSrc.includes('id="couponSummaryRow2"'));
  assert.ok(cartSrc.includes('id="couponSummaryRow3"'));
  assert.ok(cartSrc.includes('/api/coupons/validate'));
});

