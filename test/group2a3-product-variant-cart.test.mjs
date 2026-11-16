// test/group2a3-product-variant-cart.test.mjs
// DANDY PHASE 2 / GROUP 2A.3: Product Detail, Variant Selection, Quantity, & Cart Integrity

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const VARIANTS_JS_PATH = path.resolve('public/assets/js/variants.js');
const PINK_FRIDAY_JS_PATH = path.resolve('public/assets/js/pink-friday.js');
const PRODUCT_PAGE_PATH = path.resolve('src/pages/product/[...slug].astro');
const CART_PAGE_PATH = path.resolve('src/pages/cart.astro');

function loadVariantsModule() {
  const source = fsSync.readFileSync(VARIANTS_JS_PATH, 'utf8');
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

class MockClassList {
  constructor(el) {
    this.el = el;
  }
  _tokens() {
    return new Set((this.el.className || '').split(/\s+/).filter(Boolean));
  }
  _save(set) {
    this.el.className = Array.from(set).join(' ');
  }
  add(...cls) {
    const s = this._tokens();
    cls.forEach(c => s.add(c));
    this._save(s);
  }
  remove(...cls) {
    const s = this._tokens();
    cls.forEach(c => s.delete(c));
    this._save(s);
  }
  toggle(c) {
    const s = this._tokens();
    if (s.has(c)) s.delete(c);
    else s.add(c);
    this._save(s);
  }
  contains(c) {
    return this._tokens().has(c);
  }
}

class MockElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.listeners = new Map();
    this._textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.disabled = false;
    this.href = '';
    this.classList = new MockClassList(this);
  }

  setAttribute(k, v) {
    const val = String(v);
    this.attributes[k] = val;
    if (k === 'id') this.id = val;
    if (k === 'class') this.className = val;
    if (k === 'href') this.href = val;
  }

  getAttribute(k) {
    if (k === 'id') return this.id || null;
    if (k === 'class') return this.className || null;
    if (k === 'href') return this.attributes.href ?? (this.href || null);
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }

  removeAttribute(k) {
    delete this.attributes[k];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(c => c !== this);
      this.parentNode = null;
    }
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join(' ').trim();
    }
    if (this._innerHTML) {
      return this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  set textContent(v) {
    this._textContent = String(v ?? '');
    this._innerHTML = '';
    this.children = [];
  }

  get innerHTML() {
    if (this._innerHTML) return this._innerHTML;
    return this.children.map(c => c.outerHTML).join('');
  }

  set innerHTML(v) {
    this._innerHTML = String(v ?? '');
    this._textContent = '';
    this.children = [];
  }

  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = Object.entries(this.attributes)
      .map(([k, v]) => `${k}="${String(v)}"`)
      .join(' ');
    const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
    return `${open}${this._textContent || this.innerHTML}</${tag}>`;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatchEvent(type, extra = {}) {
    const ev = {
      type,
      target: this,
      currentTarget: this,
      stopPropagation() {},
      preventDefault() {},
      ...extra
    };
    const handlers = this.listeners.get(type) || [];
    for (const h of handlers) {
      h.call(this, ev);
    }
    if (type === 'click' && typeof this.onclick === 'function') {
      this.onclick(ev);
    }
  }

  click() {
    if (this.disabled) return;
    this.dispatchEvent('click');
  }

  scrollIntoView() {}

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const matchSimple = (el, sel) => {
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
      return el.tagName.toLowerCase() === sel.toLowerCase();
    };
    const parts = selector.trim().split(/\s+/);
    const walk = (node) => {
      for (const child of node.children) {
        if (parts.length === 1) {
          if (matchSimple(child, parts[0])) results.push(child);
        } else if (parts.length === 2) {
          if (matchSimple(child, parts[1])) {
            let p = child.parentNode;
            let matchedAncestor = false;
            while (p) {
              if (matchSimple(p, parts[0])) {
                matchedAncestor = true;
                break;
              }
              p = p.parentNode;
            }
            if (matchedAncestor) results.push(child);
          }
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

async function createProductPageHarness(product, options = {}) {
  const astroSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');
  const scriptMarker = '<script is:inline define:vars={{ serverProduct: product }}>';
  const startIdx = astroSrc.indexOf(scriptMarker);
  assert.ok(startIdx !== -1, 'Could not locate product detail inline script');
  const afterStart = astroSrc.slice(startIdx + scriptMarker.length);
  const endIdx = afterStart.indexOf('</script>');
  assert.ok(endIdx !== -1, 'Could not locate closing script tag');
  const inlineScript = afterStart.slice(0, endIdx);

  const variantsSource = await fs.readFile(VARIANTS_JS_PATH, 'utf8');
  const pfSource = await fs.readFile(PINK_FRIDAY_JS_PATH, 'utf8');

  const root = new MockElement('html');
  const body = new MockElement('body');
  root.appendChild(body);

  const byId = new Map();
  const register = (el) => {
    if (el.id) byId.set(el.id, el);
    return el;
  };

  const variantSection = register(new MockElement('div', 'variant-section-container', 'variant-selector-wrapper'));
  const variantPills = register(new MockElement('div', 'variant-pills-container', 'variant-pills-list'));
  const variantStatus = register(new MockElement('div', 'variant-selection-status', 'variant-selection-status'));
  const variantValidation = register(new MockElement('div', 'variant-validation-msg', 'variant-validation-msg'));
  variantValidation.style.display = 'none';
  variantSection.appendChild(variantPills);
  variantSection.appendChild(variantStatus);
  variantSection.appendChild(variantValidation);
  body.appendChild(variantSection);

  // Build variant buttons matching shared normalizeProductVariants / hasSelectableProductVariants contract
  const { normalizeProductVariants, hasSelectableProductVariants } = await import('../src/utils/server-variant-pricing.ts');
  const variantsList = normalizeProductVariants(product);
  const hasVarsSSR = hasSelectableProductVariants(product);
  variantSection.style.display = hasVarsSSR ? 'block' : 'none';

  for (const v of variantsList) {
    const isAvail = v.isAvailable !== false;
    const btn = new MockElement('button', '', `variant-pill-btn ${isAvail ? '' : 'disabled'}`.trim());
    btn.setAttribute('data-id', v.id);
    btn.setAttribute('data-name', v.name);
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-disabled', isAvail ? 'false' : 'true');
    btn.disabled = !isAvail;
    const icon = new MockElement('i', '', 'fas fa-check');
    icon.style.display = 'none';
    btn.appendChild(icon);
    const label = new MockElement('span');
    label.textContent = v.name;
    btn.appendChild(label);
    variantPills.appendChild(btn);
  }

  const qtyMinus = register(new MockElement('button', 'qty-minus', 'qty-btn'));
  const qtyInput = register(new MockElement('input', 'qty-input', 'qty-input'));
  qtyInput.value = '1';
  const qtyPlus = register(new MockElement('button', 'qty-plus', 'qty-btn'));
  const addToCartBtn = register(new MockElement('button', 'add-to-cart-btn', 'btn-add-to-cart'));
  addToCartBtn.disabled = Boolean(product?.isSoldOut);
  body.appendChild(qtyMinus);
  body.appendChild(qtyInput);
  body.appendChild(qtyPlus);
  body.appendChild(addToCartBtn);

  const sharedCartBadge = register(new MockElement('span', 'shared-cart-count'));
  const headerCartBadge = register(new MockElement('span', 'cart-count'));
  sharedCartBadge.textContent = '0';
  headerCartBadge.textContent = '0';
  body.appendChild(sharedCartBadge);
  body.appendChild(headerCartBadge);

  const storageMap = new Map(Object.entries(options.initialStorage || {}));
  const localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k)
  };

  let alertCalls = 0;
  const trackedEvents = [];
  const dispatchedEvents = [];
  const timers = [];

  const mockDocument = {
    body,
    getElementById: (id) => {
      if (byId.has(id)) return byId.get(id);
      return body.querySelector(`#${id}`);
    },
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    createElement: (tag) => new MockElement(tag),
    addEventListener: () => {}
  };

  const sandbox = {
    console,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    JSON,
    Date,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    setTimeout: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (t) => {
      if (t) t.cleared = true;
    },
    alert: () => {
      alertCalls++;
    },
    localStorage,
    document: mockDocument,
    serverProduct: JSON.parse(JSON.stringify(product)),
    __PINK_FRIDAY_CONFIG: options.pinkFridayConfig || { enabled: false },
    firebase: {
      database: () => ({
        ref: () => ({
          once: async () => ({ exists: () => false, val: () => null })
        })
      }),
      auth: () => ({
        currentUser: options.currentUser ?? null,
        onAuthStateChanged: () => {}
      })
    },
    DandyMeta: {
      trackViewContent: (p) => trackedEvents.push({ event: 'ViewContent', payload: p }),
      trackAddToCart: (item) => trackedEvents.push({ event: 'AddToCart', payload: item })
    },
    updateSharedCartCount: () => {
      try {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const count = Array.isArray(cart)
          ? cart.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0)
          : 0;
        sharedCartBadge.textContent = String(count);
        headerCartBadge.textContent = String(count);
      } catch (_) {}
    },
    addEventListener: () => {},
    dispatchEvent: (ev) => {
      dispatchedEvents.push(ev.type);
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.auth = sandbox.firebase.auth();
  sandbox.updateCartCount = () => sandbox.updateSharedCartCount();

  vm.runInNewContext(variantsSource, sandbox);
  vm.runInNewContext(pfSource, sandbox);
  vm.runInNewContext(inlineScript, sandbox);

  return {
    sandbox,
    body,
    variantSection,
    variantPills,
    variantStatus,
    variantValidation,
    qtyMinus,
    qtyInput,
    qtyPlus,
    addToCartBtn,
    sharedCartBadge,
    headerCartBadge,
    localStorage,
    trackedEvents,
    dispatchedEvents,
    getAlertCalls: () => alertCalls,
    getCart: () => JSON.parse(localStorage.getItem('cart') || '[]'),
    getVariantButtons: () => variantPills.querySelectorAll('.variant-pill-btn'),
    getToast: () => body.querySelector('#dandy-product-cart-toast')
  };
}

// ============================================================================
// Tests 1–15: Full Requirement Coverage
// ============================================================================

test('1. Product without variants adds cleanly with expected cart item shape and zero scent metadata', async () => {
  const simpleProduct = {
    id: 'prod-cleanser',
    name: 'غسول الوجه اللطيف',
    price: 250,
    image: 'https://example.com/cleanser.jpg',
    hasVariants: false,
    isSoldOut: false,
    onSale: false
  };
  const h = await createProductPageHarness(simpleProduct);
  h.addToCartBtn.click();

  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.deepEqual(cart[0], {
    id: 'prod-cleanser',
    productId: 'prod-cleanser',
    name: 'غسول الوجه اللطيف',
    price: 250,
    image: 'https://example.com/cleanser.jpg',
    discount: null,
    onSale: false,
    quantity: 1
  });
  assert.equal(h.sharedCartBadge.textContent, '1');
  assert.equal(h.getAlertCalls(), 0);

  const toast = h.getToast();
  assert.ok(toast, 'Success toast should be rendered');
  assert.equal(toast.getAttribute('role'), 'status');
  assert.ok(toast.textContent.includes('غسول الوجه اللطيف'));
  const cartLink = toast.querySelector('a');
  assert.ok(cartLink && cartLink.getAttribute('href') === '/cart');
});

test('2. Product requiring a scent variant blocks Add to Cart without selection and shows non-blocking inline error', async () => {
  const scentProduct = {
    id: 'prod-splash',
    name: 'بادي سبلاش',
    price: 300,
    image: 'https://example.com/splash.jpg',
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: 'الورد', isAvailable: true },
      { id: 'musk', name: 'المسك', isAvailable: true }
    ]
  };
  const h = await createProductPageHarness(scentProduct);
  h.addToCartBtn.click();

  assert.equal(h.getCart().length, 0, 'Cart must remain empty when no scent is selected');
  assert.equal(h.getAlertCalls(), 0, 'Should use inline validation instead of blocking window.alert');
  assert.equal(h.variantValidation.style.display, 'flex');
  assert.ok(h.variantValidation.textContent.includes('اختيار الرائحة'));
  assert.equal(h.variantSection.classList.contains('needs-selection'), true);
  assert.equal(h.trackedEvents.filter(e => e.event === 'AddToCart').length, 0);
});

test('3. Selecting an available scent variant saves exact chosen variant identity and clears validation message', async () => {
  const scentProduct = {
    id: 'prod-splash',
    name: 'بادي سبلاش',
    price: 300,
    image: 'https://example.com/splash.jpg',
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: 'الورد', isAvailable: true },
      { id: 'musk', name: 'المسك', isAvailable: true }
    ]
  };
  const h = await createProductPageHarness(scentProduct);
  h.addToCartBtn.click();
  assert.equal(h.variantValidation.style.display, 'flex');

  const roseBtn = h.getVariantButtons().find(b => b.getAttribute('data-id') === 'rose');
  roseBtn.click();

  assert.equal(roseBtn.classList.contains('selected'), true);
  assert.equal(roseBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(h.variantValidation.style.display, 'none');
  assert.ok(h.variantStatus.textContent.includes('الورد'));

  h.addToCartBtn.click();
  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].id, 'prod-splash::rose');
  assert.equal(cart[0].productId, 'prod-splash');
  assert.equal(cart[0].variantId, 'rose');
  assert.equal(cart[0].variantName, 'الورد');
  assert.deepEqual(cart[0].selectedVariant, { id: 'rose', name: 'الورد' });
  assert.deepEqual(cart[0].selectedVariants, [{ id: 'rose', name: 'الورد' }]);
});

test('4. Unavailable variant cannot be selected via click or programmatic toggle, and cannot enter cart', async () => {
  const scentProduct = {
    id: 'prod-musk',
    name: 'مسك داندي',
    price: 220,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'white', name: 'مسك أبيض', isAvailable: false },
      { id: 'amber', name: 'مسك عنبر', isAvailable: true }
    ]
  };
  const h = await createProductPageHarness(scentProduct);
  const whiteBtn = h.getVariantButtons().find(b => b.getAttribute('data-id') === 'white');
  assert.equal(whiteBtn.disabled, true);
  assert.equal(whiteBtn.classList.contains('disabled'), true);

  // Attempt click and programmatic toggle on unavailable variant
  whiteBtn.click();
  h.sandbox.toggleScentVariant('white');
  assert.equal(whiteBtn.classList.contains('selected'), false);

  h.addToCartBtn.click();
  assert.equal(h.getCart().length, 0);

  // Direct helper check as well
  const DandyVariants = loadVariantsModule();
  const direct = DandyVariants.mergeProductToCart([], scentProduct, {
    selectedVariants: [{ id: 'white', name: 'مسك أبيض' }],
    quantity: 1
  });
  assert.equal(direct.ok, false);
  assert.equal(direct.reason, 'VARIANT_REQUIRED');
  assert.equal(direct.cart.length, 0);
});

test('5. Foreign or invalid variant ID is rejected and never causes a variant product to enter cart without variants', async () => {
  const DandyVariants = loadVariantsModule();
  const scentProduct = {
    id: 'prod-butter',
    name: 'زبدة الجسم',
    price: 400,
    hasVariants: true,
    variantType: 'scent',
    variants: {
      vanilla: { name: 'فانيليا', isAvailable: true },
      coconut: { name: 'جوز الهند', isAvailable: true }
    }
  };

  // Foreign variant ID from another product or XSS string
  const res = DandyVariants.mergeProductToCart([], scentProduct, {
    selectedVariants: [{ id: 'other-product-scent', name: '<script>alert(1)</script>' }],
    quantity: 2
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'VARIANT_REQUIRED');
  assert.equal(res.cart.length, 0);

  // Mix of foreign + valid keeps ONLY canonical valid variant from product
  const mixedRes = DandyVariants.mergeProductToCart([], scentProduct, {
    selectedVariants: [
      { id: 'foreign-id', name: 'Fake' },
      { id: 'vanilla', name: 'Tampered Name' }
    ],
    quantity: 1
  });
  assert.equal(mixedRes.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(mixedRes.item.selectedVariants)), [{ id: 'vanilla', name: 'فانيليا' }]);

  // Also check special-character variant IDs in DOM lookup (no CSS selector injection error)
  const specialProduct = {
    id: 'prod-special',
    name: 'منتج خاص',
    price: 150,
    hasVariants: true,
    variantType: 'scent',
    variants: [{ id: 'v"1.[special]', name: 'رائحة خاصة', isAvailable: true }]
  };
  const h = await createProductPageHarness(specialProduct);
  h.sandbox.toggleScentVariant('v"1.[special]');
  h.addToCartBtn.click();
  assert.equal(h.getCart().length, 1);
  assert.equal(h.getCart()[0].variantId, 'v"1.[special]');
});

test('6. Selecting multiple available variants saves canonical sorted variant identities and names without duplicates', async () => {
  const multiProduct = {
    id: 'prod-mist',
    name: 'معطر جسم وشعر',
    price: 200,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: 'الورد', isAvailable: true },
      { id: 'musk', name: 'المسك', isAvailable: true },
      { id: 'amber', name: 'العنبر', isAvailable: true }
    ]
  };
  const h = await createProductPageHarness(multiProduct);
  const roseBtn = h.getVariantButtons().find(b => b.getAttribute('data-id') === 'rose');
  const amberBtn = h.getVariantButtons().find(b => b.getAttribute('data-id') === 'amber');

  roseBtn.click();
  amberBtn.click();
  // Calling toggle again programmatically would deselect; ensure selecting same twice in helper deduplicates
  assert.ok(h.variantStatus.textContent.includes('الروائح المختارة (2)'));

  h.addToCartBtn.click();
  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].id, 'prod-mist::amber_rose');
  assert.deepEqual(cart[0].selectedVariants, [
    { id: 'amber', name: 'العنبر' },
    { id: 'rose', name: 'الورد' }
  ]);
  assert.equal(cart[0].variantName, 'العنبر، الورد');

  const DandyVariants = loadVariantsModule();
  const displayInfo = DandyVariants.getVariantsDisplayInfo(cart[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(displayInfo)), {
    count: 2,
    label: 'الروائح',
    text: 'العنبر، الورد',
    list: ['العنبر', 'الورد']
  });
});

test('7. Adding the same product with the same variant combination merges quantity cleanly regardless of selection order', async () => {
  const multiProduct = {
    id: 'prod-mist',
    name: 'معطر جسم وشعر',
    price: 200,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: 'الورد', isAvailable: true },
      { id: 'musk', name: 'المسك', isAvailable: true }
    ]
  };

  // First visit: select [rose, musk] with qty 2
  const h1 = await createProductPageHarness(multiProduct);
  h1.getVariantButtons().find(b => b.getAttribute('data-id') === 'rose').click();
  h1.getVariantButtons().find(b => b.getAttribute('data-id') === 'musk').click();
  h1.qtyPlus.click(); // qty = 2
  h1.addToCartBtn.click();

  // Second visit with persisted storage: select [musk, rose] (reverse order) with qty 3
  const h2 = await createProductPageHarness(multiProduct, {
    initialStorage: { cart: h1.localStorage.getItem('cart') }
  });
  h2.getVariantButtons().find(b => b.getAttribute('data-id') === 'musk').click();
  h2.getVariantButtons().find(b => b.getAttribute('data-id') === 'rose').click();
  h2.qtyPlus.click();
  h2.qtyPlus.click(); // qty = 3
  h2.addToCartBtn.click();

  const cart = h2.getCart();
  assert.equal(cart.length, 1, 'Reverse selection order of same variants must merge into one cart item');
  assert.equal(cart[0].quantity, 5);
  assert.equal(h2.sharedCartBadge.textContent, '5');
});

test('8. Adding the same product with different variant combinations keeps distinct cart entries', async () => {
  const multiProduct = {
    id: 'prod-mist',
    name: 'معطر جسم وشعر',
    price: 200,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: 'الورد', isAvailable: true },
      { id: 'musk', name: 'المسك', isAvailable: true }
    ]
  };

  const h = await createProductPageHarness(multiProduct);
  const roseBtn = h.getVariantButtons().find(b => b.getAttribute('data-id') === 'rose');
  const muskBtn = h.getVariantButtons().find(b => b.getAttribute('data-id') === 'musk');

  // Add Rose
  roseBtn.click();
  h.addToCartBtn.click();

  // Deselect Rose, select Musk, add Musk
  roseBtn.click();
  muskBtn.click();
  h.addToCartBtn.click();

  // Keep Musk, add Rose -> multi [musk, rose]
  roseBtn.click();
  h.addToCartBtn.click();

  const cart = h.getCart();
  assert.equal(cart.length, 3);
  assert.deepEqual(
    cart.map(i => i.id),
    ['prod-mist::rose', 'prod-mist::musk', 'prod-mist::musk_rose']
  );
});

test('9. Quantity below 1 is normalized cleanly to 1 and synced on the UI input', async () => {
  const simpleProduct = { id: 'p-qty', name: 'بلسم', price: 150, hasVariants: false };
  const h = await createProductPageHarness(simpleProduct);

  h.qtyInput.value = '0';
  h.qtyInput.dispatchEvent('change');
  assert.equal(h.qtyInput.value, '1');
  assert.equal(h.qtyMinus.disabled, true);

  h.qtyInput.value = '-5';
  h.addToCartBtn.click();
  assert.equal(h.qtyInput.value, '1', 'Input value must match saved quantity');
  assert.equal(h.getCart()[0].quantity, 1);
});

test('10. Quantity above 99 is clamped cleanly to 99 and +/- buttons stay in sync', async () => {
  const simpleProduct = { id: 'p-qty-max', name: 'بلسم', price: 150, hasVariants: false };
  const h = await createProductPageHarness(simpleProduct);

  h.qtyInput.value = '150';
  h.addToCartBtn.click();
  assert.equal(h.qtyInput.value, '99');
  assert.equal(h.qtyPlus.disabled, true);
  assert.equal(h.getCart()[0].quantity, 99);

  // Clicking plus while at 99 stays at 99; clicking minus decrements to 98
  h.qtyPlus.click();
  assert.equal(h.qtyInput.value, '99');
  h.qtyMinus.click();
  assert.equal(h.qtyInput.value, '98');
  assert.equal(h.qtyPlus.disabled, false);
});

test('11. Fractional, Arabic-digit, and malformed quantity inputs are normalized deterministically', async () => {
  const DandyVariants = loadVariantsModule();
  assert.equal(DandyVariants.normalizeProductQuantity('2.7'), 2);
  assert.equal(DandyVariants.normalizeProductQuantity('0.5'), 1);
  assert.equal(DandyVariants.normalizeProductQuantity('-3.9'), 1);
  assert.equal(DandyVariants.normalizeProductQuantity('120.8'), 99);
  assert.equal(DandyVariants.normalizeProductQuantity('abc'), 1);
  assert.equal(DandyVariants.normalizeProductQuantity('2abc'), 1);
  assert.equal(DandyVariants.normalizeProductQuantity(''), 1);
  assert.equal(DandyVariants.normalizeProductQuantity(null), 1);
  assert.equal(DandyVariants.normalizeProductQuantity('0x10'), 1);
  assert.equal(DandyVariants.normalizeProductQuantity('٣'), 3);

  const simpleProduct = { id: 'p-frac', name: 'كريم', price: 100, hasVariants: false };
  const h = await createProductPageHarness(simpleProduct);
  h.qtyInput.value = '2.9';
  h.addToCartBtn.click();
  assert.equal(h.qtyInput.value, '2');
  assert.equal(h.getCart()[0].quantity, 2);
});

test('12. Pink Friday campaign price and metadata are preserved when adding and merging cart items', async () => {
  const pfProduct = {
    id: 'pf-prod-1',
    name: 'كريم بديل الليزر',
    price: 500,
    image: 'https://example.com/laser.jpg',
    hasVariants: true,
    variantType: 'scent',
    variants: [{ id: 'rose', name: 'الورد', isAvailable: true }]
  };
  const pinkFridayConfig = {
    enabled: true,
    startAt: '2020-01-01T00:00:00Z',
    endAt: '2099-12-31T23:59:59Z',
    offers: [
      {
        productId: 'pf-prod-1',
        expectedBasePrice: 500,
        campaignPrice: 399,
        active: true,
        badgeText: 'عرض Pink Friday'
      }
    ]
  };

  const h = await createProductPageHarness(pfProduct, { pinkFridayConfig });
  h.getVariantButtons()[0].click();
  h.qtyInput.value = '2';
  h.addToCartBtn.click();

  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].isPinkFriday, true);
  assert.equal(cart[0].price, 399);
  assert.equal(cart[0].campaignPrice, 399);
  assert.equal(cart[0].regularPrice, 500);
  assert.equal(cart[0].badgeText, 'عرض Pink Friday');
  assert.equal(cart[0].quantity, 2);
});

test('13. Cart count badges and cart-updated event synchronize consistently after Add to Cart', async () => {
  const product = { id: 'p-badge', name: 'زيت طبيعي', price: 180, hasVariants: false };
  const existingCart = JSON.stringify([{ id: 'other', productId: 'other', name: 'منتج سابق', price: 100, quantity: 2 }]);

  const h = await createProductPageHarness(product, {
    initialStorage: { cart: existingCart }
  });
  h.qtyInput.value = '3';
  h.addToCartBtn.click();

  assert.equal(h.sharedCartBadge.textContent, '5');
  assert.equal(h.headerCartBadge.textContent, '5');
  assert.equal(h.dispatchedEvents.includes('cart-updated'), true);
});

test('14. Guest customers add products freely without authentication barriers, and XSS names render safely as text', async () => {
  const guestProduct = {
    id: 'p-guest',
    name: '<img src=x onerror=alert(1)> كريم',
    price: 250,
    hasVariants: true,
    variantType: 'scent',
    variants: [{ id: 'scent1', name: '<b>ورد</b>', isAvailable: true }]
  };
  const h = await createProductPageHarness(guestProduct, { currentUser: null });
  h.getVariantButtons()[0].click();
  h.addToCartBtn.click();

  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 1);

  const toast = h.getToast();
  assert.ok(toast);
  // Toast textContent contains literal string rather than injected DOM elements
  assert.equal(toast.querySelectorAll('img').length, 0);
  assert.equal(toast.querySelectorAll('b').length, 0);

  // Verify cart.astro contains HTML escaping for rendered product/variant names and safeParseCart
  const cartSrc = await fs.readFile(CART_PAGE_PATH, 'utf8');
  assert.ok(cartSrc.includes('function escapeCartHtml('));
  assert.ok(cartSrc.includes('escapeCartHtml(varInfo.text)'));
  assert.ok(cartSrc.includes('safeParseCart'));
});

test('15. Zero inventory system introduced: stockQuantity is never read, decremented, reserved, or gated on Add to Cart', async () => {
  const variantsSrc = await fs.readFile(VARIANTS_JS_PATH, 'utf8');
  const productSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');

  assert.equal(/stockQuantity/.test(variantsSrc), false, 'variants.js must not reference stockQuantity');
  assert.equal(/stockQuantity/.test(productSrc), false, 'product/[...slug].astro must not reference stockQuantity');

  // Even if a product object happens to carry stockQuantity: 1, adding 10 units succeeds without modifying stockQuantity
  const productWithLegacyStockField = {
    id: 'p-no-inv',
    name: 'سيروم داندي',
    price: 350,
    stockQuantity: 1,
    hasVariants: false,
    isSoldOut: false
  };
  const snapshotBefore = JSON.stringify(productWithLegacyStockField);
  const h = await createProductPageHarness(productWithLegacyStockField);
  h.qtyInput.value = '10';
  h.addToCartBtn.click();

  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 10);
  assert.equal(JSON.stringify(h.sandbox.serverProduct), snapshotBefore, 'Product stockQuantity must remain untouched');
});

test('16. Unsupported variantType hides selector and adds cleanly at 1x price; duplicate variant IDs render deduplicated pills', async () => {
  // 1. Unsupported variantType (`flavor`) must NOT show variant selector and must add to cart cleanly
  const flavorProduct = {
    id: 'p-flavor',
    name: 'مرطب شفاه',
    price: 120,
    hasVariants: true,
    variantType: 'flavor',
    variants: [{ id: 'berry', name: 'توت', isAvailable: true }]
  };
  const hFlavor = await createProductPageHarness(flavorProduct);
  assert.equal(hFlavor.variantSection.style.display, 'none');
  hFlavor.addToCartBtn.click();
  assert.equal(hFlavor.variantValidation.style.display, 'none');
  const flavorCart = hFlavor.getCart();
  assert.equal(flavorCart.length, 1);
  assert.equal(flavorCart[0].id, 'p-flavor');
  assert.equal(flavorCart[0].price, 120);
  assert.equal(flavorCart[0].selectedVariants, undefined);

  // 2. Duplicate variant IDs render only one button per unique normalized ID
  const dupProduct = {
    id: 'p-dup',
    name: 'مسك مكرر',
    price: 300,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      null,
      { id: 'rose', name: '' },
      { id: ' rose ', name: ' الورد الأول ', isAvailable: true },
      { id: 'rose', name: 'الورد الثاني', isAvailable: false },
      { name: ' المسك ' },
      { id: 'المسك', name: 'المسك المكرر' }
    ]
  };
  const hDup = await createProductPageHarness(dupProduct);
  assert.equal(hDup.variantSection.style.display, 'block');
  const buttons = hDup.getVariantButtons();
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].getAttribute('data-id'), 'rose');
  assert.equal(buttons[0].getAttribute('data-name'), 'الورد الأول');
  assert.equal(buttons[1].getAttribute('data-id'), 'المسك');

  buttons[0].click();
  hDup.addToCartBtn.click();
  const dupCart = hDup.getCart();
  assert.equal(dupCart.length, 1);
  assert.deepEqual(dupCart[0].selectedVariants, [{ id: 'rose', name: 'الورد الأول' }]);
});
