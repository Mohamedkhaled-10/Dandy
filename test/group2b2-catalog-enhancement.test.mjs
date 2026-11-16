// test/group2b2-catalog-enhancement.test.mjs
// DANDY PHASE 2 / GROUP 2B.2: Catalog UI/UX, Product Discovery & Shopping Experience Enhancement

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ALL_PRODUCTS_PATH = path.resolve('src/pages/all-products.astro');
const VARIANTS_JS_PATH = path.resolve('public/assets/js/variants.js');
const PINK_FRIDAY_JS_PATH = path.resolve('public/assets/js/pink-friday.js');
const PRODUCT_DETAIL_PATH = path.resolve('src/pages/product/[...slug].astro');

function createHarness(options = {}) {
  const {
    initialUrl = 'https://dandy-ebon.vercel.app/all-products',
    initialCart = null,
    initialCouponState = null,
    ssrSeedProducts = [],
    pinkFridayCampaign = null,
    firebaseMode = 'none', // 'none' | 'live' | 'error' | 'empty'
    firebaseLiveProducts = null,
    signedInUid = null
  } = options;

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
      cls.forEach((c) => s.add(c));
      this._save(s);
    }
    remove(...cls) {
      const s = this._tokens();
      cls.forEach((c) => s.delete(c));
      this._save(s);
    }
    toggle(c, force) {
      const s = this._tokens();
      if (force === true) s.add(c);
      else if (force === false) s.delete(c);
      else if (s.has(c)) s.delete(c);
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
      this.dataset = {};
      this.style = {};
      this.listeners = new Map();
      this._textContent = '';
      this._innerHTML = '';
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.type = '';
      this.name = '';
      this.title = '';
      this.options = [];
      this.classList = new MockClassList(this);
    }

    get textContent() {
      if (this._textContent) return this._textContent;
      if (this.children.length > 0) {
        return this.children.map((c) => c.textContent).join(' ').trim();
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
      return this._innerHTML;
    }

    set innerHTML(v) {
      this._innerHTML = String(v ?? '');
      this._textContent = '';
      if (!this._innerHTML) this.children = [];
    }

    setAttribute(k, v) {
      const val = String(v);
      this.attributes[k] = val;
      if (k === 'id') this.id = val;
      if (k === 'class') this.className = val;
    }

    getAttribute(k) {
      if (k === 'id') return this.id || null;
      if (k === 'class') return this.className || null;
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    }

    hasAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k);
    }

    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
        this.parentNode = null;
      }
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }

    removeEventListener(type, fn) {
      if (!this.listeners.has(type)) return;
      this.listeners.set(
        type,
        this.listeners.get(type).filter((f) => f !== fn)
      );
    }

    dispatchEvent(evt) {
      const eventObj = typeof evt === 'string'
        ? { type: evt, target: this, preventDefault() {}, stopPropagation() {} }
        : { preventDefault() {}, stopPropagation() {}, ...evt, target: evt.target || this };
      const list = this.listeners.get(eventObj.type) || [];
      list.forEach((fn) => fn.call(this, eventObj));
    }

    click() {
      this.dispatchEvent({ type: 'click', target: this });
    }

    focus() {
      mockDocument.activeElement = this;
    }

    contains(other) {
      if (other === this) return true;
      return this.children.some((c) => c === other || (c.contains && c.contains(other)));
    }

    matchesSimple(sel) {
      const s = sel.trim();
      if (s === 'input[type="checkbox"]:checked') {
        return this.tagName === 'INPUT' && this.type === 'checkbox' && this.checked === true;
      }
      if (s === 'input[type="checkbox"]') {
        return this.tagName === 'INPUT' && this.type === 'checkbox';
      }
      if (s === 'input[type="radio"]:checked') {
        return this.tagName === 'INPUT' && this.type === 'radio' && this.checked === true;
      }
      if (s === 'input[type="radio"]') {
        return this.tagName === 'INPUT' && this.type === 'radio';
      }
      if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1);
        const eqIdx = inner.indexOf('=');
        if (eqIdx === -1) return this.hasAttribute(inner);
        const attrName = inner.slice(0, eqIdx).trim();
        const attrVal = inner.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        return this.getAttribute(attrName) === attrVal;
      }
      if (s.startsWith('#')) return this.id === s.slice(1);
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      return this.tagName.toLowerCase() === s.toLowerCase();
    }

    matchesChain(selector) {
      const parts = selector.trim().split(/\s+/);
      const last = parts[parts.length - 1];
      if (!this.matchesSimple(last)) return false;
      if (parts.length === 1) return true;
      let cursor = this.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        while (cursor && !cursor.matchesSimple(parts[i])) {
          cursor = cursor.parentNode;
        }
        if (!cursor) return false;
        cursor = cursor.parentNode;
      }
      return true;
    }

    closest(selector) {
      let curr = this;
      while (curr) {
        if (curr.matchesSimple && curr.matchesSimple(selector)) return curr;
        curr = curr.parentNode;
      }
      return null;
    }

    querySelectorAll(selector) {
      const out = [];
      const selectors = selector.split(',').map((s) => s.trim()).filter(Boolean);
      const walk = (node) => {
        for (const child of node.children) {
          if (selectors.some((sel) => child.matchesChain(sel))) {
            out.push(child);
          }
          walk(child);
        }
      };
      walk(this);
      return out;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  const root = new MockElement('div', 'root');
  const body = new MockElement('body');
  root.appendChild(body);
  const catalogPageWrap = new MockElement('div', '', 'catalog-page-wrap');
  body.appendChild(catalogPageWrap);

  const sidebarOverlay = new MockElement('div', 'sidebar-overlay', 'sidebar-overlay');
  catalogPageWrap.appendChild(sidebarOverlay);

  const quickBar = new MockElement('div', 'quick-categories-bar', 'quick-categories-bar');
  ['', 'skin care', 'hair care', 'body care', 'perfume'].forEach((val, idx) => {
    const btn = new MockElement('button', '', idx === 0 ? 'quick-cat-btn active' : 'quick-cat-btn');
    btn.setAttribute('data-quick-category', val);
    btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
    quickBar.appendChild(btn);
  });
  catalogPageWrap.appendChild(quickBar);

  const mobileToggle = new MockElement('button', 'mobile-filter-toggle', 'mobile-filter-toggle');
  mobileToggle.setAttribute('aria-expanded', 'false');
  catalogPageWrap.appendChild(mobileToggle);
  const mobileBadge = new MockElement('span', 'mobile-filter-count-badge', 'mobile-filter-count-pill');
  mobileToggle.appendChild(mobileBadge);

  const sidebar = new MockElement('aside', 'shop-sidebar', 'shop-sidebar');
  catalogPageWrap.appendChild(sidebar);
  const closeDrawerBtn = new MockElement('button', 'close-drawer-btn', 'close-drawer-btn');
  sidebar.appendChild(closeDrawerBtn);
  const sidebarBadge = new MockElement('span', 'sidebar-badge', 'active-filters-badge');
  sidebar.appendChild(sidebarBadge);
  const clearAllBtn = new MockElement('button', 'clear-all-filters', 'clear-all-btn');
  sidebar.appendChild(clearAllBtn);

  const searchInput = new MockElement('input', 'search-input');
  searchInput.type = 'text';
  sidebar.appendChild(searchInput);
  const triggerSearchBtn = new MockElement('button', 'trigger-search');
  sidebar.appendChild(triggerSearchBtn);
  const clearSearchBtn = new MockElement('button', 'clear-search', 'clear-search');
  clearSearchBtn.style.display = 'none';
  sidebar.appendChild(clearSearchBtn);
  const suggestionsBox = new MockElement('div', 'search-suggestions', 'search-suggestions');
  sidebar.appendChild(suggestionsBox);
  const resultsCount = new MockElement('span', 'results-count');
  sidebar.appendChild(resultsCount);

  const categoryFilters = new MockElement('div', 'category-filters', 'filter-list');
  ['skin care', 'hair care', 'body care', 'perfume'].forEach((val) => {
    const chk = new MockElement('input');
    chk.type = 'checkbox';
    chk.value = val;
    categoryFilters.appendChild(chk);
  });
  sidebar.appendChild(categoryFilters);

  const statusFilters = new MockElement('div', 'status-filters', 'filter-list');
  ['offers', 'bestseller'].forEach((val) => {
    const chk = new MockElement('input');
    chk.type = 'checkbox';
    chk.value = val;
    statusFilters.appendChild(chk);
  });
  sidebar.appendChild(statusFilters);

  const minPriceInput = new MockElement('input', 'min-price-input');
  minPriceInput.type = 'text';
  const maxPriceInput = new MockElement('input', 'max-price-input');
  maxPriceInput.type = 'text';
  const applyPriceBtn = new MockElement('button', 'apply-price-filter');
  const resetPriceBtn = new MockElement('button', 'reset-price-filter');
  const priceSummaryEl = new MockElement('div', 'price-range-summary');
  const priceErrorEl = new MockElement('div', 'price-range-error');
  sidebar.appendChild(minPriceInput);
  sidebar.appendChild(maxPriceInput);
  sidebar.appendChild(applyPriceBtn);
  sidebar.appendChild(resetPriceBtn);
  sidebar.appendChild(priceSummaryEl);
  sidebar.appendChild(priceErrorEl);

  const ratingFilters = new MockElement('div', 'rating-filters', 'filter-list');
  ['', '5', '4', '3'].forEach((val) => {
    const radio = new MockElement('input');
    radio.type = 'radio';
    radio.name = 'minRating';
    radio.value = val;
    radio.checked = val === '';
    ratingFilters.appendChild(radio);
  });
  sidebar.appendChild(ratingFilters);

  const connectionNotice = new MockElement('div', 'catalog-connection-notice');
  connectionNotice.style.display = 'none';
  const retrySyncBtn = new MockElement('button', 'retry-firebase-sync');
  connectionNotice.appendChild(retrySyncBtn);
  catalogPageWrap.appendChild(connectionNotice);

  const heroTotal = new MockElement('strong', 'catalog-total-available');
  catalogPageWrap.appendChild(heroTotal);
  const visibleCountNum = new MockElement('strong', 'visible-count-num');
  catalogPageWrap.appendChild(visibleCountNum);
  const showingBatchSummary = new MockElement('span', 'showing-batch-summary');
  catalogPageWrap.appendChild(showingBatchSummary);

  const sortSelect = new MockElement('select', 'sort-select', 'sort-select');
  ['default', 'featured', 'price-asc', 'price-desc', 'rating-desc', 'reviews-desc'].forEach((v) => {
    sortSelect.options.push({ value: v });
  });
  sortSelect.value = 'default';
  catalogPageWrap.appendChild(sortSelect);

  const activeChipsBar = new MockElement('div', 'active-chips-bar', 'active-chips-bar');
  activeChipsBar.style.display = 'none';
  const activeChipsList = new MockElement('div', 'active-chips-list', 'chips-list');
  const chipsClearAllBtn = new MockElement('button', 'chips-clear-all');
  activeChipsBar.appendChild(activeChipsList);
  activeChipsBar.appendChild(chipsClearAllBtn);
  catalogPageWrap.appendChild(activeChipsBar);

  const productContainer = new MockElement('div', 'productContainer', 'product-grid');
  catalogPageWrap.appendChild(productContainer);

  const paginationWrap = new MockElement('div', 'catalog-pagination');
  const paginationText = new MockElement('p', 'pagination-status-text');
  const loadMoreBtn = new MockElement('button', 'load-more-btn');
  const loadMoreSpan = new MockElement('span');
  loadMoreSpan.textContent = 'عرض المزيد';
  loadMoreBtn.appendChild(loadMoreSpan);
  paginationWrap.appendChild(paginationText);
  paginationWrap.appendChild(loadMoreBtn);
  catalogPageWrap.appendChild(paginationWrap);

  const headerCartBadge = new MockElement('span', 'cart-count');
  const sharedCartBadge = new MockElement('span', 'shared-cart-count');
  body.appendChild(headerCartBadge);
  body.appendChild(sharedCartBadge);

  const ssrScriptEl = new MockElement('script', 'dandy-ssr-catalog-data');
  ssrScriptEl.textContent = JSON.stringify({
    products: ssrSeedProducts,
    categoryOverrides: {
      '-OvPqarOBOnNgQ_-kpTl': 'body-care',
      '-OW9WB1GTP1GaDoqcd2R': 'skin-care',
      '-OWF9Deint3XcB6iNdCE': 'skin-care',
      '-OvPpguWTAtcaWirD9Um': 'skin-care'
    }
  });
  body.appendChild(ssrScriptEl);

  // Storage & Tracking
  const storageMap = new Map();
  if (typeof initialCart === 'string') storageMap.set('cart', initialCart);
  else if (Array.isArray(initialCart)) storageMap.set('cart', JSON.stringify(initialCart));
  if (initialCouponState !== null) storageMap.set('appliedCoupon', initialCouponState);

  const localStorageMock = {
    getItem(k) {
      return storageMap.has(k) ? storageMap.get(k) : null;
    },
    setItem(k, v) {
      storageMap.set(k, String(v));
    },
    removeItem(k) {
      storageMap.delete(k);
    }
  };

  let currentUrlObj = new URL(initialUrl);
  let lastNavigation = null;
  const alerts = [];
  const fbqCalls = [];
  const dispatchedEvents = [];
  const wishlistWrites = [];
  let updateSharedCartCallCount = 0;

  const docListeners = new Map();
  const mockDocument = {
    body,
    activeElement: null,
    getElementById(id) {
      return root.querySelector(`#${id}`);
    },
    querySelectorAll(sel) {
      return root.querySelectorAll(sel);
    },
    querySelector(sel) {
      return root.querySelector(sel);
    },
    createElement(tag) {
      return new MockElement(tag);
    },
    createElementNS(_ns, tag) {
      return new MockElement(tag);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(evt) {
      const list = docListeners.get(evt.type) || [];
      list.forEach((fn) => fn(evt));
    }
  };

  const mockLocation = {
    get href() {
      return currentUrlObj.href;
    },
    set href(val) {
      lastNavigation = String(val);
    },
    get pathname() {
      return currentUrlObj.pathname;
    },
    get search() {
      return currentUrlObj.search;
    },
    get hash() {
      return currentUrlObj.hash;
    }
  };

  const mockHistory = {
    state: null,
    replaceState(_state, _title, nextUrl) {
      currentUrlObj = new URL(nextUrl, 'https://dandy-ebon.vercel.app');
    }
  };

  let mockDb = null;
  if (firebaseMode !== 'none') {
    mockDb = {
      ref(refPath) {
        return {
          on(event, onSuccess, onError) {
            if (refPath === 'products' && event === 'value') {
              if (firebaseMode === 'error' && onError) {
                onError(new Error('permission_denied'));
                return;
              }
              if (firebaseMode === 'empty') {
                onSuccess({ exists: () => false, forEach() {} });
                return;
              }
              if (firebaseMode === 'live') {
                const entries = Object.entries(firebaseLiveProducts || {});
                onSuccess({
                  exists: () => entries.length > 0,
                  forEach(cb) {
                    entries.forEach(([key, val]) => cb({ key, val: () => val }));
                  }
                });
              }
            }
          },
          once(event) {
            if (event === 'value' && signedInUid && refPath === `wishlists/${signedInUid}`) {
              return Promise.resolve({ exists: () => false, val: () => ({}) });
            }
            return Promise.resolve({ exists: () => false, val: () => null });
          },
          set(val) {
            wishlistWrites.push({ op: 'set', path: refPath, val });
            return Promise.resolve();
          },
          remove() {
            wishlistWrites.push({ op: 'remove', path: refPath });
            return Promise.resolve();
          }
        };
      }
    };
  }

  const mockAuth = {
    currentUser: signedInUid ? { uid: signedInUid } : null,
    onAuthStateChanged(cb) {
      cb(mockAuth.currentUser);
    }
  };

  const windowListeners = new Map();
  const sandbox = {
    window: null,
    globalThis: null,
    document: mockDocument,
    location: mockLocation,
    history: mockHistory,
    localStorage: localStorageMock,
    URL,
    URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    db: mockDb,
    auth: mockAuth,
    alert(msg) {
      alerts.push(String(msg));
    },
    fbq(...args) {
      fbqCalls.push(args);
    },
    updateSharedCartCount() {
      updateSharedCartCallCount += 1;
    },
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    dispatchEvent(evt) {
      dispatchedEvents.push(evt);
      const list = windowListeners.get(evt.type) || [];
      list.forEach((fn) => fn(evt));
    }
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // Load real shared modules: variants.js and pink-friday.js
  if (pinkFridayCampaign) {
    sandbox.__PINK_FRIDAY_CONFIG = pinkFridayCampaign;
  }

  const variantsSource = fsSync.readFileSync(VARIANTS_JS_PATH, 'utf8');
  vm.runInContext(variantsSource, sandbox);

  const pfSource = fsSync.readFileSync(PINK_FRIDAY_JS_PATH, 'utf8');
  vm.runInContext(pfSource, sandbox);

  // Extract inline script from src/pages/all-products.astro
  const astroSource = fsSync.readFileSync(ALL_PRODUCTS_PATH, 'utf8');
  const scriptMatch = astroSource.match(/<script is:inline>\n([\s\S]*?)\n\s*<\/script>\n<\/BaseLayout>/);
  assert.ok(scriptMatch, 'Expected main <script is:inline> in all-products.astro');

  // If SSR seed cards exist, pre-populate productContainer just as SSR HTML renders
  if (Array.isArray(ssrSeedProducts) && ssrSeedProducts.length > 0) {
    ssrSeedProducts.forEach((p, idx) => {
      const card = new MockElement('article', '', 'product-card product');
      card.setAttribute('data-product-id', p.id);
      card.setAttribute('data-category', p.category || 'Skin care');
      card.setAttribute('data-bestseller', p.bestSeller ? 'true' : 'false');
      card.setAttribute('data-offer', p.onSale ? 'true' : 'false');
      card.setAttribute('data-price', String(p.effectivePrice ?? p.price ?? 0));
      card.setAttribute('data-rating', String(p.avgRating || 0));
      card.setAttribute('data-reviews', String(p.reviewCount || 0));
      card.setAttribute('data-index', String(idx));
      const catEl = new MockElement('span', '', 'card-category');
      catEl.textContent = p.categoryArabicName || 'العناية بالبشرة';
      const titleEl = new MockElement('h3', '', 'card-title product-title');
      titleEl.textContent = p.name || 'Product';
      card.appendChild(catEl);
      card.appendChild(titleEl);
      productContainer.appendChild(card);
    });
  }

  vm.runInContext(scriptMatch[1], sandbox);

  return {
    sandbox,
    document: mockDocument,
    productContainer,
    sidebar,
    searchInput,
    clearSearchBtn,
    suggestionsBox,
    categoryFilters,
    statusFilters,
    minPriceInput,
    maxPriceInput,
    applyPriceBtn,
    resetPriceBtn,
    priceErrorEl,
    priceSummaryEl,
    ratingFilters,
    sortSelect,
    activeChipsBar,
    activeChipsList,
    visibleCountNum,
    heroTotal,
    connectionNotice,
    paginationWrap,
    loadMoreBtn,
    headerCartBadge,
    sharedCartBadge,
    mobileToggle,
    closeDrawerBtn,
    clearAllBtn,
    getCurrentUrl: () => currentUrlObj.href,
    getLastNavigation: () => lastNavigation,
    getStorage: () => storageMap,
    getAlerts: () => alerts,
    getFbqCalls: () => fbqCalls,
    getDispatchedEvents: () => dispatchedEvents,
    getWishlistWrites: () => wishlistWrites,
    getUpdateSharedCartCountCalls: () => updateSharedCartCallCount
  };
}

function makeProductList(count, overridesFn = null) {
  const obj = {};
  for (let i = 0; i < count; i++) {
    const id = `prod_${i + 1}`;
    const base = {
      name: `منتج دندي ${i + 1}`,
      category: i % 2 === 0 ? 'Skin care' : 'Hair care',
      price: 100 + i * 25,
      onSale: i % 3 === 0,
      bestSeller: i % 4 === 0,
      avgRating: i % 2 === 0 ? 4.5 : 0,
      reviewCount: i % 2 === 0 ? 3 + i : 0,
      image: `https://res.cloudinary.com/dogk78w9z/image/upload/p${i + 1}.jpg`
    };
    obj[id] = overridesFn ? { ...base, ...overridesFn(i, id) } : base;
  }
  return obj;
}

test('1-5. SSR visibility, hidden exclusion, image fallback, Firebase fallback & live refresh without duplicates', async () => {
  const source = await fs.readFile(ALL_PRODUCTS_PATH, 'utf8');

  // 1 & 2: SSR excludes isHidden and mirrors RTDB order cleanly
  assert.match(source, /\.filter\(\(p\) => p && !p\.isHidden\)\s*\.reverse\(\)/);
  assert.match(source, /<article[\s\S]*?class=\{`product-card product \$\{isBatchHidden \? 'batch-hidden' : ''\}`\.trim\(\)\}/);

  // 3: Invalid/missing image fallback in SSR & client
  assert.match(source, /function sanitizeSsrImageUrl/);
  assert.match(source, /if \(trimmed\.startsWith\('\/'\) && !trimmed\.startsWith\('\/\/'\)\)/);
  assert.match(source, /if \(parsed\.protocol === 'https:'\)/);

  // 4: Firebase failure does not erase SSR cards and reveals recoverable notice
  const ssrSeed = [
    { id: 'ssr_1', name: 'منتج مسبق 1', category: 'Skin care', price: 200, effectivePrice: 200, image: '/assets/images/logo.png' },
    { id: 'ssr_2', name: 'منتج مسبق 2', category: 'Hair care', price: 300, effectivePrice: 300, image: '/assets/images/logo.png' }
  ];
  const errHarness = createHarness({ ssrSeedProducts: ssrSeed, firebaseMode: 'error' });
  assert.equal(errHarness.productContainer.querySelectorAll('.product').length, 2, 'SSR cards must remain intact when Firebase errors');
  assert.equal(errHarness.connectionNotice.style.display, 'flex', 'Connection notice must appear on Firebase error');

  // 5: Live Firebase refresh replaces cards cleanly without duplicating SSR cards, hides notice, and drops isHidden products
  const liveHarness = createHarness({
    ssrSeedProducts: ssrSeed,
    firebaseMode: 'live',
    firebaseLiveProducts: {
      live_1: { name: 'منتج مباشر 1', category: 'Skin care', price: 150, image: 'http://insecure.example/x.jpg' },
      live_2: { name: 'منتج مخفي', category: 'Skin care', price: 999, isHidden: true },
      live_3: { name: 'منتج مباشر 2', category: 'Body care', price: 250, image: 'https://cdn.example.com/ok.jpg' }
    }
  });
  const liveCards = liveHarness.productContainer.querySelectorAll('.product');
  assert.equal(liveCards.length, 2, 'Live refresh must replace SSR cards without duplicates and exclude isHidden');
  assert.equal(liveHarness.connectionNotice.style.display, 'none', 'Connection notice should be hidden after successful sync');
  const firstImg = liveCards[liveCards.length - 1].querySelector('img');
  assert.equal(firstImg.getAttribute('src'), '/assets/images/logo.png', 'Unsafe http image URL must fall back safely');
});

test('6-13. Categories, overrides, OR semantics, combined filters & Arabic/English search normalization', () => {
  const h = createHarness({
    firebaseMode: 'live',
    firebaseLiveProducts: {
      '-OvPqarOBOnNgQ_-kpTl': {
        name: 'كريم ترطيب أبيض',
        category: 'Skin care', // Must be overridden to body-care
        price: 220,
        onSale: true,
        bestSeller: false
      },
      p_hair_arab: {
        name: 'شَامْبُو الأعشـــاب الطبيعى',
        category: 'منتجات الشعر',
        price: 310,
        onSale: false,
        bestSeller: true
      },
      p_perfume: {
        name: 'Dandy Vanilla Mist',
        category: 'Perfume',
        price: 450,
        onSale: true,
        bestSeller: true
      },
      p_skin: {
        name: 'سيروم إشراقة الوجه',
        category: 'عناية بالبشرة',
        price: 380,
        onSale: false,
        bestSeller: false
      }
    }
  });

  // 7: PRODUCT_CATEGORY_OVERRIDES respected
  assert.equal(
    h.sandbox.DandyCatalogHelpers.resolveCanonicalCategorySlug({ id: '-OvPqarOBOnNgQ_-kpTl', category: 'Skin care' }),
    'body-care'
  );

  // 6 & 8: Canonical category filtering with OR semantics across Skin care + Body care
  const catBoxes = Array.from(h.categoryFilters.querySelectorAll('input[type="checkbox"]'));
  catBoxes.find((c) => c.value === 'body care').checked = true;
  catBoxes.find((c) => c.value === 'skin care').checked = true;
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '2', 'Body care OR Skin care should match override item + p_skin');

  // Reset checkboxes
  catBoxes.forEach((c) => { c.checked = false; });

  // 9: Promotional status preserves OR semantics
  const statusBoxes = Array.from(h.statusFilters.querySelectorAll('input[type="checkbox"]'));
  statusBoxes.find((c) => c.value === 'offers').checked = true;
  statusBoxes.find((c) => c.value === 'bestseller').checked = true;
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '3', 'offers OR bestseller should match all items with either flag');

  // 10: Search + Category + Status combine with AND
  catBoxes.find((c) => c.value === 'hair care').checked = true;
  statusBoxes.forEach((c) => { c.checked = false; });
  statusBoxes.find((c) => c.value === 'bestseller').checked = true;
  h.searchInput.value = 'شامبو';
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '1');

  // 11 & 12: Arabic normalization handles Alef (أ/إ/آ -> ا), Ya/Alef Maksura (ى -> ي), diacritics & tatweel
  h.clearAllBtn.click();
  h.searchInput.value = 'ابيض'; // Matches "أبيض"
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '1', 'Alef normalization should match أبيض with ابيض');

  h.searchInput.value = 'الطبيعي الأعشاب'; // Just verify diacritics + tatweel + ى stripped properly
  assert.equal(
    h.sandbox.DandyCatalogHelpers.normalizeCatalogSearchText('شَامْبُو الأعشـــاب الطبيعى'),
    'شامبو الاعشاب الطبيعي'
  );
  h.searchInput.value = 'شامبو الاعشاب الطبيعي';
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '1', 'Normalized search without harakat/tatweel must match');

  // 13: English search is case-insensitive
  h.searchInput.value = 'VANILLA mist';
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '1');
});

test('14-18. Price range validation & filtering and genuine customer rating filter', () => {
  const h = createHarness({
    firebaseMode: 'live',
    pinkFridayCampaign: {
      enabled: true,
      campaignId: 'pf_test',
      offers: [
        { productId: 'pf_item', active: true, expectedBasePrice: 500, campaignPrice: 300, discountPercentage: 40, badgeText: 'Pink 40%' }
      ]
    },
    firebaseLiveProducts: {
      pf_item: { name: 'سيروم بينك فرايداي', category: 'Skin care', price: 500, avgRating: 4.9, reviewCount: 12 },
      unreviewed_fake_star: { name: 'منتج بدون تقييمات', category: 'Skin care', price: 250, rating: 5, avgRating: 0, reviewCount: 0 },
      low_price_rated: { name: 'غسول ميني', category: 'Skin care', price: 120, avgRating: 3.5, reviewCount: 2 },
      high_price_rated: { name: 'طقم فاخر', category: 'Skin care', price: 620, avgRating: 4.2, reviewCount: 5 }
    }
  });

  // 14 & 15: Min and Max price filter use effectivePrice (pf_item effectivePrice = 300)
  h.minPriceInput.value = '200';
  h.maxPriceInput.value = '350';
  h.applyPriceBtn.click();
  assert.equal(h.priceErrorEl.style.display, 'none');
  assert.equal(h.visibleCountNum.textContent, '2', '200..350 should include pf_item (effective 300) and unreviewed (250)');

  // 16: Reject negative / non-numeric / min > max price bounds without wiping catalog
  h.minPriceInput.value = '-50';
  h.maxPriceInput.value = '300';
  h.applyPriceBtn.click();
  assert.equal(h.priceErrorEl.style.display, 'block');
  assert.equal(h.visibleCountNum.textContent, '4', 'Invalid negative bound should not filter catalog empty');

  h.minPriceInput.value = '500';
  h.maxPriceInput.value = '100';
  h.applyPriceBtn.click();
  assert.equal(h.priceErrorEl.style.display, 'block');
  assert.equal(h.visibleCountNum.textContent, '4', 'Inverted range min > max must be rejected');

  // Reset price bounds and test rating filter
  h.resetPriceBtn.click();
  assert.equal(h.priceErrorEl.style.display, 'none');

  // 17 & 18: Minimum rating 4 uses real avgRating + reviewCount > 0 (ignores rating: 5 fallback!)
  const radios = Array.from(h.ratingFilters.querySelectorAll('input[type="radio"]'));
  radios.forEach((r) => { r.checked = r.value === '4'; });
  h.sandbox.applyFiltersAndSort();
  assert.equal(h.visibleCountNum.textContent, '2', 'Only pf_item (4.9, 12 reviews) and high_price_rated (4.2, 5 reviews) should pass');
});

test('19-27. Sorting options (including effective price & real ratings) and progressive pagination + URL page restoration', () => {
  const products18 = makeProductList(18, (idx, id) => {
    if (id === 'prod_1') return { price: 600, avgRating: 0, reviewCount: 0, rating: 5, bestSeller: false };
    if (id === 'prod_2') return { price: 150, avgRating: 3.2, reviewCount: 2, bestSeller: true };
    if (id === 'prod_3') return { price: 400, avgRating: 4.9, reviewCount: 25, bestSeller: false };
    return { price: 200 + idx * 10, avgRating: 4.0, reviewCount: 1, bestSeller: false };
  });

  // Verify initial batch size = 12 & Load More -> 18 & Filter reset to page 1
  const h = createHarness({
    firebaseMode: 'live',
    pinkFridayCampaign: {
      enabled: true,
      campaignId: 'pf_sort',
      offers: [
        { productId: 'prod_1', active: true, expectedBasePrice: 600, campaignPrice: 120, discountPercentage: 80 }
      ]
    },
    firebaseLiveProducts: products18
  });

  const allDomCards = h.productContainer.querySelectorAll('.product');
  assert.equal(allDomCards.length, 18);
  const shownInitially = allDomCards.filter((c) => !c.classList.contains('batch-hidden'));
  assert.equal(shownInitially.length, 12, '24: Initial batch size must be 12');
  assert.equal(h.paginationWrap.style.display, 'flex');

  // 25: Load more reveals remaining 6 cards and syncs page=2 to URL
  h.loadMoreBtn.click();
  const shownAfterLoadMore = h.productContainer.querySelectorAll('.product').filter((c) => !c.classList.contains('batch-hidden'));
  assert.equal(shownAfterLoadMore.length, 18);
  assert.match(h.getCurrentUrl(), /[?&]page=2/);

  // 26: Changing a filter resets progressive page back to 1
  const hairBox = Array.from(h.categoryFilters.querySelectorAll('input[type="checkbox"]')).find((c) => c.value === 'hair care');
  hairBox.checked = true;
  hairBox.dispatchEvent({ type: 'change', target: hairBox });
  assert.doesNotMatch(h.getCurrentUrl(), /[?&]page=/);
  hairBox.checked = false;
  hairBox.dispatchEvent({ type: 'change', target: hairBox });

  // 20 & 21: Price asc & desc sort use effectivePrice (prod_1 discounted 600 -> 120 must be cheapest)
  h.sortSelect.value = 'price-asc';
  h.sortSelect.dispatchEvent('change');
  assert.equal(h.productContainer.children[0].getAttribute('data-product-id'), 'prod_1', '20: Effective Pink Friday price 120 sorts first on price-asc');

  h.sortSelect.value = 'price-desc';
  h.sortSelect.dispatchEvent('change');
  assert.equal(h.productContainer.children[0].getAttribute('data-product-id'), 'prod_3', '21: Highest effective price (400) sorts first on price-desc');

  // 22 & 23: rating-desc ignores fallback rating=5 on unreviewed prod_1; reviews-desc uses reviewCount
  h.sortSelect.value = 'rating-desc';
  h.sortSelect.dispatchEvent('change');
  assert.equal(h.productContainer.children[0].getAttribute('data-product-id'), 'prod_3', '22: Reviewed 4.9 sorts first');
  const lastId = h.productContainer.children[h.productContainer.children.length - 1].getAttribute('data-product-id');
  assert.equal(lastId, 'prod_1', '22: Unreviewed product ranks behind reviewed products despite raw rating: 5');

  h.sortSelect.value = 'reviews-desc';
  h.sortSelect.dispatchEvent('change');
  assert.equal(h.productContainer.children[0].getAttribute('data-product-id'), 'prod_3', '23: Most reviewed (25) sorts first');

  // 27: Direct URL ?page=2 restoration reveals all 18 cards immediately on boot
  const hPage2 = createHarness({
    initialUrl: 'https://dandy-ebon.vercel.app/all-products?page=2',
    firebaseMode: 'live',
    firebaseLiveProducts: products18
  });
  const restoredShown = hPage2.productContainer.querySelectorAll('.product').filter((c) => !c.classList.contains('batch-hidden'));
  assert.equal(restoredShown.length, 18, '27: ?page=2 in URL must restore batch count 24 -> show 18');
});

test('28-36. New URL parameter restoration, invalid query param safety, UTM/hash preservation & SEO robots logic', async () => {
  // 29-34: URL restoration + invalid rejection + UTM & hash preservation
  const h = createHarness({
    initialUrl: 'https://dandy-ebon.vercel.app/all-products?category=hair-care&minPrice=120&maxPrice=350&minRating=4&utm_source=instagram&fbclid=xyz123#catalog-top',
    firebaseMode: 'live',
    firebaseLiveProducts: {
      h1: { name: 'شامبو', category: 'Hair care', price: 250, avgRating: 4.6, reviewCount: 4 },
      h2: { name: 'بلسم غالي', category: 'Hair care', price: 500, avgRating: 4.8, reviewCount: 4 }
    }
  });

  assert.equal(h.minPriceInput.value, '120');
  assert.equal(h.maxPriceInput.value, '350');
  const checkedRating = Array.from(h.ratingFilters.querySelectorAll('input[type="radio"]')).find((r) => r.checked);
  assert.equal(checkedRating.value, '4');
  assert.equal(h.visibleCountNum.textContent, '1');

  // Clear filters preserves utm_source, fbclid, and #catalog-top while deleting all catalog filter params
  h.clearAllBtn.click();
  const clearedUrl = new URL(h.getCurrentUrl());
  assert.equal(clearedUrl.searchParams.get('utm_source'), 'instagram');
  assert.equal(clearedUrl.searchParams.get('fbclid'), 'xyz123');
  assert.equal(clearedUrl.searchParams.has('minPrice'), false);
  assert.equal(clearedUrl.searchParams.has('maxPrice'), false);
  assert.equal(clearedUrl.searchParams.has('minRating'), false);
  assert.equal(clearedUrl.searchParams.has('category'), false);
  assert.equal(clearedUrl.hash, '#catalog-top');

  // 31: Invalid new query params are safely ignored
  const hBad = createHarness({
    initialUrl: 'https://dandy-ebon.vercel.app/all-products?minPrice=-10&maxPrice=abc&minRating=9&page=-2',
    firebaseMode: 'live',
    firebaseLiveProducts: {
      p1: { name: 'سيروم', category: 'Skin care', price: 200, avgRating: 0, reviewCount: 0 }
    }
  });
  assert.equal(hBad.minPriceInput.value, '');
  assert.equal(hBad.maxPriceInput.value, '');
  assert.equal(hBad.visibleCountNum.textContent, '1');

  // 35 & 36: SSR robots directive covers all audited params vs clean /all-products
  const astroSource = await fs.readFile(ALL_PRODUCTS_PATH, 'utf8');
  const paramMatch = astroSource.match(/const AUDITED_CATALOG_PARAMS = \[([^\]]+)\]/);
  assert.ok(paramMatch, 'AUDITED_CATALOG_PARAMS constant should exist');
  ['category', 'status', 'search', 'sort', 'page', 'minPrice', 'maxPrice', 'minRating'].forEach((p) => {
    assert.ok(paramMatch[1].includes(`'${p}'`), `SEO robots audited params must include ${p}`);
  });
  assert.match(astroSource, /hasAuditedCatalogParam \? 'noindex, follow' : 'index, follow'/);
  assert.match(astroSource, /canonical="https:\/\/dandy-ebon\.vercel\.app\/all-products"/);
});

test('37-47. Quick Add mergeProductToCart, corrupted cart recovery, variants redirect, sold-out, Pink Friday pricing, coupon preservation, events & toast', () => {
  // 38, 37, 39, 42, 44, 45, 46, 47: Corrupted storage + Pink Friday active + mismatch fallback + coupon preservation + Meta + Toast
  const couponBefore = JSON.stringify({ code: 'SAVE10', discount: 10 });
  const h = createHarness({
    initialCart: '{broken-json!!!',
    initialCouponState: couponBefore,
    firebaseMode: 'live',
    pinkFridayCampaign: {
      enabled: true,
      campaignId: 'pf_nov',
      offers: [
        { productId: 'pf_ok', active: true, expectedBasePrice: 400, campaignPrice: 300, discountPercentage: 25, badgeText: 'Pink 25%' },
        { productId: 'pf_mismatch', active: true, expectedBasePrice: 999, campaignPrice: 150, discountPercentage: 50 }
      ]
    },
    firebaseLiveProducts: {
      pf_ok: { name: 'سيروم <img src=x onerror=alert(1)>', category: 'Skin care', price: 400 },
      pf_mismatch: { name: 'كريم سعر مختلف', category: 'Skin care', price: 300 },
      var_prod: {
        name: 'بودي سبلاش بعطور',
        category: 'Perfume',
        price: 350,
        hasVariants: true,
        variantType: 'scent',
        variants: { vanilla: { id: 'vanilla', name: 'فانيليا', isAvailable: true } },
        resolvedSlug: 'body-splash-scents'
      },
      sold_prod: { name: 'منتج نافذ', category: 'Body care', price: 210, isSoldOut: true }
    }
  });

  // 43: Base price mismatch falls back cleanly to normal price (300)
  const mismatchPricing = h.sandbox.DandyCatalogHelpers.getEffectiveCatalogPricing({ id: 'pf_mismatch', price: 300 });
  assert.equal(mismatchPricing.isPinkFriday, false);
  assert.equal(mismatchPricing.effectivePrice, 300);

  // 37, 38, 42: First Quick Add recovers corrupted storage and uses Pink Friday price 300
  const res1 = h.sandbox.quickAddByProductId('pf_ok');
  assert.equal(res1.ok, true);
  let savedCart = JSON.parse(h.getStorage().get('cart'));
  assert.equal(savedCart.length, 1);
  assert.equal(savedCart[0].productId, 'pf_ok');
  assert.equal(savedCart[0].quantity, 1);
  assert.equal(savedCart[0].price, 300);
  assert.equal(savedCart[0].isPinkFriday, true);
  assert.equal(savedCart[0].campaignPrice, 300);
  assert.equal(savedCart[0].regularPrice, 400);
  assert.equal(savedCart[0].badgeText, 'Pink 25%');

  // 39: Second Quick Add merges into same line item cleanly (quantity = 2)
  const res2 = h.sandbox.quickAddByProductId('pf_ok');
  assert.equal(res2.ok, true);
  savedCart = JSON.parse(h.getStorage().get('cart'));
  assert.equal(savedCart.length, 1);
  assert.equal(savedCart[0].quantity, 2);

  // 44: Coupon state untouched
  assert.equal(h.getStorage().get('appliedCoupon'), couponBefore);

  // 45: Cart count & cart-updated event synchronized
  assert.equal(h.headerCartBadge.textContent, '2');
  assert.equal(h.sharedCartBadge.textContent, '2');
  assert.equal(h.getUpdateSharedCartCountCalls(), 2);
  assert.equal(h.getDispatchedEvents().filter((e) => e.type === 'cart-updated').length, 2);

  // 46: Meta AddToCart fired exactly twice for 2 successful adds
  const metaAddCalls = h.getFbqCalls().filter((c) => c[0] === 'track' && c[1] === 'AddToCart');
  assert.equal(metaAddCalls.length, 2);

  // 47: Toast rendered safely via textContent + /cart link (HTML inside product name remains inert)
  const toast = h.document.getElementById('dandy-catalog-cart-toast');
  assert.ok(toast, 'Cart toast must exist');
  const toastLink = toast.querySelector('a');
  assert.equal(toastLink.getAttribute('href'), '/cart');
  assert.ok(toast.textContent.includes('سيروم <img src=x onerror=alert(1)>'));
  assert.equal(toast.querySelectorAll('img').length, 0, 'XSS payload must not execute or parse as DOM element');

  // 41: Sold-out product cannot be added and does not increment Meta
  const resSold = h.sandbox.quickAddByProductId('sold_prod');
  assert.equal(resSold.ok, false);
  assert.equal(resSold.reason, 'PRODUCT_SOLD_OUT');
  assert.equal(h.getFbqCalls().filter((c) => c[0] === 'track' && c[1] === 'AddToCart').length, 2);

  // Check sold-out button state in DOM
  const soldCard = h.productContainer.querySelector('[data-product-id="sold_prod"]');
  const soldBtn = soldCard.querySelector('.card-add-btn');
  assert.equal(soldBtn.disabled, true);
  assert.equal(soldBtn.getAttribute('aria-disabled'), 'true');

  // 40: Multi-variant product renders detail link and quickAdd navigates to detail page
  const varCard = h.productContainer.querySelector('[data-product-id="var_prod"]');
  const varBtn = varCard.querySelector('.card-add-btn');
  assert.equal(varBtn.tagName, 'A');
  assert.equal(varBtn.getAttribute('href'), '/product/body-splash-scents');
  const resVar = h.sandbox.quickAddByProductId('var_prod');
  assert.equal(resVar.ok, false);
  assert.equal(resVar.reason, 'REDIRECT_TO_VARIANTS');
  assert.equal(h.getLastNavigation(), '/product/body-splash-scents');
});

test('48-56. XSS hardening, inline JS absence, wishlist behavior, no stockQuantity, Firebase paths & untouched architecture', async () => {
  const astroSource = await fs.readFile(ALL_PRODUCTS_PATH, 'utf8');

  // 48 & 49: Malicious name & malicious product ID remain inert in DOM
  const h = createHarness({
    signedInUid: 'uid_abc',
    firebaseMode: 'live',
    firebaseLiveProducts: {
      'bad" onclick="alert(1)': {
        name: '<script>window.__xss=true</script>سيروم آمن',
        category: 'Skin care',
        price: 190,
        image: 'javascript:alert(1)'
      }
    }
  });

  const card = h.productContainer.querySelectorAll('.product')[0];
  assert.equal(card.querySelectorAll('script').length, 0, '48: Product name HTML must not parse as <script>');
  assert.equal(card.querySelector('.product-title').textContent, '<script>window.__xss=true</script>سيروم آمن');
  assert.equal(card.getAttribute('data-product-id'), 'bad" onclick="alert(1)', '49: Malicious ID stays quoted attribute text');
  assert.equal(card.querySelector('img').getAttribute('src'), '/assets/images/logo.png', '50: javascript: image rejected');

  // 51: No inline JS handlers on SSR card markup or client card builder
  const ssrCardSnippet = astroSource.slice(
    astroSource.indexOf('<article'),
    astroSource.indexOf('</article>')
  );
  assert.equal(/on(click|error|load|mouseover|focus)=/i.test(ssrCardSnippet), false, '51: SSR card must contain zero inline JS event handlers');
  const builderSnippet = astroSource.slice(
    astroSource.indexOf('function buildProductCardElement'),
    astroSource.indexOf('function compareCatalogDomNodes')
  );
  assert.equal(/setAttribute\(\s*['"]on/i.test(builderSnippet), false, '51: Client card builder must never set inline on* handlers');

  // 52: Wishlist toggle works via delegation & RTDB wishlists/${uid}/${pid}
  const wishBtn = card.querySelector('[data-action="wishlist"]');
  await h.sandbox.toggleCardWishlist('bad" onclick="alert(1)', wishBtn);
  assert.equal(wishBtn.classList.contains('active'), true);
  assert.equal(wishBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(h.getWishlistWrites()[0].path, 'wishlists/uid_abc/bad" onclick="alert(1)');

  // Signed-out wishlist redirects to /account-login
  const hGuest = createHarness({
    signedInUid: null,
    firebaseMode: 'live',
    firebaseLiveProducts: { p1: { name: 'A', category: 'Skin care', price: 100 } }
  });
  await hGuest.sandbox.toggleCardWishlist('p1', hGuest.productContainer.querySelector('[data-action="wishlist"]'));
  assert.equal(hGuest.getLastNavigation(), '/account-login');

  // 53: No stockQuantity property read/write/exposure anywhere in catalog code or normalized entry
  const executableAstro = astroSource
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.equal(/stockQuantity/i.test(executableAstro), false, '53: Catalog must introduce zero stockQuantity logic');
  assert.equal('stockQuantity' in h.sandbox.DandyCatalogHelpers.normalizeCatalogProductEntry({ id: 'x', price: 10, stockQuantity: 5 }, 0), false);

  // 54 & 55: No forbidden Firebase reads/writes or coupon/order API mutations from catalog
  assert.equal(astroSource.includes("ref('orders')"), false);
  assert.equal(astroSource.includes("ref('settings')"), false);
  assert.equal(astroSource.includes("ref('coupons')"), false);
  assert.equal(astroSource.includes('/api/create-order'), false);
  assert.equal(astroSource.includes('/api/coupons/'), false);

  // 56: Product detail page exists untouched
  assert.ok(fsSync.existsSync(PRODUCT_DETAIL_PATH));
});
