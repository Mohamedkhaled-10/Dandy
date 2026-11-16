// test/group2a2-catalog-url-state.test.mjs
// DANDY PHASE 2 / GROUP 2A.2: Catalog Search, Filters & URL State Integrity

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const ALL_PRODUCTS_PATH = path.resolve('src/pages/all-products.astro');

const SAMPLE_PRODUCTS = {
  p_skin_1: {
    name: 'سيروم فيتامين سي',
    category: 'Skin care',
    price: 499,
    onSale: true,
    bestSeller: true
  },
  p_skin_2: {
    name: 'غسول الوجه اللطيف',
    category: 'عناية بالبشرة',
    price: 250,
    onSale: false,
    bestSeller: false
  },
  p_hair_1: {
    name: 'شامبو خالي من السلفات',
    category: 'Hair care',
    price: 320,
    originalPrice: 400,
    bestSeller: false
  },
  p_hair_2: {
    name: 'زيت الإنبات الطبيعي',
    category: 'منتجات الشعر',
    price: 180,
    onSale: false,
    bestSeller: true
  },
  p_body_1: {
    name: 'زبدة الجسم المرطبة',
    category: 'Body care',
    price: 410,
    onSale: true,
    bestSeller: false
  },
  p_perfume_1: {
    name: 'بادي سبلاش فانيليا',
    category: 'Perfume',
    price: 550,
    onSale: false,
    bestSeller: true
  }
};

function createMockCatalogHarness(initialUrl = 'https://dandy-ebon.vercel.app/all-products') {
  class MockElement {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
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
      this.type = '';
      this.title = '';
      this.options = [];
      this.onclick = null;
    }

    get classList() {
      const self = this;
      const tokens = () => new Set((self.className || '').split(/\s+/).filter(Boolean));
      const write = (set) => {
        self.className = Array.from(set).join(' ');
      };
      return {
        add(...cls) {
          const s = tokens();
          cls.forEach(c => s.add(c));
          write(s);
        },
        remove(...cls) {
          const s = tokens();
          cls.forEach(c => s.delete(c));
          write(s);
        },
        toggle(c) {
          const s = tokens();
          if (s.has(c)) s.delete(c);
          else s.add(c);
          write(s);
        },
        contains(c) {
          return tokens().has(c);
        }
      };
    }

    get textContent() {
      if (this._textContent) return this._textContent;
      if (this._innerHTML) {
        return this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      return this.children.map(c => c.textContent).join(' ').trim();
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
      const str = String(v ?? '');
      this._innerHTML = str;
      this._textContent = '';
      if (!str) {
        this.children = [];
        return;
      }
      // Extract .card-category and .product-title spans/headings when product cards are populated
      this.children = [];
      const catMatch = str.match(/class="card-category">([^<]*)</);
      if (catMatch) {
        const span = new MockElement('span', '', 'card-category');
        span.textContent = catMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'");
        this.appendChild(span);
      }
      const titleMatch = str.match(/class="card-title product-title">([^<]*)</);
      if (titleMatch) {
        const h3 = new MockElement('h3', '', 'card-title product-title');
        h3.textContent = titleMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'");
        this.appendChild(h3);
      }
    }

    appendChild(child) {
      if (child.parentNode) {
        const idx = child.parentNode.children.indexOf(child);
        if (idx !== -1) child.parentNode.children.splice(idx, 1);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
    }

    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }

    dispatchEvent(evt) {
      const eventObj = typeof evt === 'string' ? { type: evt, target: this } : { ...evt, target: this };
      const list = this.listeners.get(eventObj.type) || [];
      list.forEach(fn => fn.call(this, eventObj));
    }

    focus() {}
    contains(other) {
      if (other === this) return true;
      return this.children.some(c => c.contains(other));
    }

    matchesSimple(sel) {
      if (sel.startsWith('#')) {
        return this.id === sel.slice(1);
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return this.classList.contains(cls);
      }
      if (sel === 'input[type="checkbox"]:checked') {
        return this.tagName === 'INPUT' && this.type === 'checkbox' && this.checked === true;
      }
      if (sel === 'input[type="checkbox"]') {
        return this.tagName === 'INPUT' && this.type === 'checkbox';
      }
      return false;
    }

    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+/);
      const results = [];
      const walk = (node) => {
        for (const child of node.children) {
          if (parts.length === 1) {
            if (child.matchesSimple(parts[0])) results.push(child);
          } else if (parts.length === 2) {
            if (node.matchesSimple(parts[0]) || isDescendantOf(node, parts[0])) {
              if (child.matchesSimple(parts[1])) results.push(child);
            }
          }
          walk(child);
        }
      };
      const isDescendantOf = (el, sel) => {
        let cur = el;
        while (cur) {
          if (cur.matchesSimple(sel)) return true;
          cur = cur.parentNode;
        }
        return false;
      };
      walk(this);
      return results;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  const root = new MockElement('html');
  const body = new MockElement('body');
  root.appendChild(body);

  const sidebar = new MockElement('aside', 'shop-sidebar', 'shop-sidebar');
  const sidebarOverlay = new MockElement('div', 'sidebar-overlay', 'sidebar-overlay');
  const sidebarBadge = new MockElement('span', 'sidebar-badge', 'active-filters-badge');
  const clearAllBtn = new MockElement('button', 'clear-all-filters', 'clear-all-btn');
  const searchInput = new MockElement('input', 'search-input');
  searchInput.type = 'text';
  const triggerSearch = new MockElement('button', 'trigger-search');
  const clearSearchBtn = new MockElement('button', 'clear-search', 'clear-search');
  const searchSuggestions = new MockElement('div', 'search-suggestions', 'search-suggestions');
  const resultsCount = new MockElement('span', 'results-count');

  const categoryFilters = new MockElement('div', 'category-filters', 'filter-list');
  const catCheckboxes = {};
  for (const val of ['skin care', 'hair care', 'body care', 'perfume']) {
    const chk = new MockElement('input');
    chk.type = 'checkbox';
    chk.value = val;
    catCheckboxes[val] = chk;
    categoryFilters.appendChild(chk);
  }

  const statusFilters = new MockElement('div', 'status-filters', 'filter-list');
  const statusCheckboxes = {};
  for (const val of ['offers', 'bestseller']) {
    const chk = new MockElement('input');
    chk.type = 'checkbox';
    chk.value = val;
    statusCheckboxes[val] = chk;
    statusFilters.appendChild(chk);
  }

  sidebar.appendChild(sidebarBadge);
  sidebar.appendChild(clearAllBtn);
  sidebar.appendChild(searchInput);
  sidebar.appendChild(triggerSearch);
  sidebar.appendChild(clearSearchBtn);
  sidebar.appendChild(searchSuggestions);
  sidebar.appendChild(resultsCount);
  sidebar.appendChild(categoryFilters);
  sidebar.appendChild(statusFilters);

  const visibleCountNum = new MockElement('strong', 'visible-count-num');
  visibleCountNum.textContent = '0';
  const sortSelect = new MockElement('select', 'sort-select', 'sort-select');
  sortSelect.options = [
    { value: 'default' },
    { value: 'price-asc' },
    { value: 'price-desc' }
  ];
  sortSelect.value = 'default';

  const activeChipsBar = new MockElement('div', 'active-chips-bar', 'active-chips-bar');
  const activeChipsList = new MockElement('div', 'active-chips-list', 'chips-list');
  const productContainer = new MockElement('div', 'productContainer', 'product-grid');

  body.appendChild(sidebarOverlay);
  body.appendChild(sidebar);
  body.appendChild(visibleCountNum);
  body.appendChild(sortSelect);
  body.appendChild(activeChipsBar);
  body.appendChild(activeChipsList);
  body.appendChild(productContainer);

  const parsedInitial = new URL(initialUrl);
  const locationState = {
    protocol: parsedInitial.protocol,
    host: parsedInitial.host,
    origin: parsedInitial.origin,
    pathname: parsedInitial.pathname,
    search: parsedInitial.search,
    hash: parsedInitial.hash,
    get href() {
      return `${this.origin}${this.pathname}${this.search}${this.hash}`;
    }
  };

  let replaceStateCalls = 0;
  let pushStateCalls = 0;
  let reloadCalls = 0;
  let navigationAttempts = 0;
  let dbValueCallback = null;

  const historyObj = {
    state: null,
    replaceState(state, _title, nextUrl) {
      replaceStateCalls++;
      this.state = state;
      const u = new URL(nextUrl, locationState.origin);
      locationState.pathname = u.pathname;
      locationState.search = u.search;
      locationState.hash = u.hash;
    },
    pushState() {
      pushStateCalls++;
    }
  };

  Object.defineProperty(locationState, 'href', {
    get() {
      return `${this.origin}${this.pathname}${this.search}${this.hash}`;
    },
    set() {
      navigationAttempts++;
    }
  });
  locationState.reload = () => {
    reloadCalls++;
  };

  const mockDb = {
    ref(pathName) {
      assert.equal(pathName, 'products');
      return {
        on(event, cb) {
          if (event === 'value') {
            dbValueCallback = cb;
          }
        }
      };
    }
  };

  const documentObj = {
    getElementById(id) {
      const walk = (node) => {
        if (node.id === id) return node;
        for (const c of node.children) {
          const found = walk(c);
          if (found) return found;
        }
        return null;
      };
      return walk(root);
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
    addEventListener(type, fn) {
      root.addEventListener(type, fn);
    },
    body
  };

  const windowObj = {
    location: locationState,
    history: historyObj,
    db: mockDb,
    document: documentObj,
    localStorage: { getItem: () => null, setItem: () => {} }
  };

  return {
    window: windowObj,
    document: documentObj,
    elements: {
      searchInput,
      clearSearchBtn,
      catCheckboxes,
      statusCheckboxes,
      sortSelect,
      activeChipsBar,
      activeChipsList,
      productContainer,
      visibleCountNum,
      resultsCount,
      sidebarBadge,
      clearAllBtn
    },
    getMetrics: () => ({
      replaceStateCalls,
      pushStateCalls,
      reloadCalls,
      navigationAttempts,
      href: locationState.href,
      search: locationState.search,
      hash: locationState.hash,
      pathname: locationState.pathname
    }),
    emitProducts(productsObj = SAMPLE_PRODUCTS) {
      assert.ok(dbValueCallback, 'Expected Firebase db.ref("products").on("value", ...) listener');
      const entries = Object.entries(productsObj);
      dbValueCallback({
        exists: () => entries.length > 0,
        forEach: (iter) => {
          entries.forEach(([key, val]) => {
            iter({ key, val: () => val });
          });
        }
      });
    }
  };
}

async function bootCatalogPage(initialUrl) {
  const source = await fs.readFile(ALL_PRODUCTS_PATH, 'utf8');
  const scriptMatch = source.match(/<script is:inline>\n([\s\S]*?)\n\s*<\/script>\n<\/BaseLayout>/);
  assert.ok(scriptMatch, 'Expected inline script block in src/pages/all-products.astro');

  const harness = createMockCatalogHarness(initialUrl);
  const sandbox = {
    window: harness.window,
    document: harness.document,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    parseFloat,
    parseInt,
    encodeURIComponent,
    decodeURIComponent,
    Array,
    Object,
    String,
    Number,
    Set,
    Map
  };

  vm.runInNewContext(scriptMatch[1], sandbox);
  return { harness, source };
}

function getVisibleProductTitles(harness) {
  return harness.elements.productContainer.children
    .filter(el => el.classList.contains('product') && !el.classList.contains('hidden'))
    .map(el => el.querySelector('.product-title')?.textContent);
}

test('1. Single category URL param restores the matching checkbox and filters async products', async () => {
  const { harness } = await bootCatalogPage('https://dandy-ebon.vercel.app/all-products?category=skin%20care');

  assert.equal(harness.elements.catCheckboxes['skin care'].checked, true);
  assert.equal(harness.elements.catCheckboxes['hair care'].checked, false);
  assert.equal(harness.elements.sidebarBadge.textContent, '1');

  harness.emitProducts();

  const visible = getVisibleProductTitles(harness);
  assert.deepEqual(visible.sort(), ['سيروم فيتامين سي', 'غسول الوجه اللطيف'].sort());
  assert.equal(harness.elements.visibleCountNum.textContent, '2');
});

test('2. Multiple category URL parameters restore all valid selected categories', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?category=skin%20care&category=hair%20care'
  );

  assert.equal(harness.elements.catCheckboxes['skin care'].checked, true);
  assert.equal(harness.elements.catCheckboxes['hair care'].checked, true);
  assert.equal(harness.elements.catCheckboxes['body care'].checked, false);
  assert.equal(harness.elements.catCheckboxes['perfume'].checked, false);

  harness.emitProducts();

  const visible = getVisibleProductTitles(harness);
  assert.equal(visible.length, 4);
  assert.equal(harness.elements.visibleCountNum.textContent, '4');
});

test('3. Valid search URL param restores search input and filters products safely without XSS', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?search=%D8%B3%D9%8A%D8%B1%D9%88%D9%85'
  );

  assert.equal(harness.elements.searchInput.value, 'سيروم');
  assert.equal(harness.elements.clearSearchBtn.style.display, 'flex');

  harness.emitProducts();
  assert.deepEqual(getVisibleProductTitles(harness), ['سيروم فيتامين سي']);
  assert.equal(harness.elements.visibleCountNum.textContent, '1');

  // Also test XSS payload in search param stays inert text and does not execute or inject HTML
  const xssAttempt = `');alert(1);//<img src=x onerror=alert(1)>`;
  const { harness: xssHarness } = await bootCatalogPage(
    `https://dandy-ebon.vercel.app/all-products?search=${encodeURIComponent(xssAttempt)}`
  );
  xssHarness.emitProducts();
  assert.equal(xssHarness.elements.searchInput.value, xssAttempt);
  assert.equal(xssHarness.elements.visibleCountNum.textContent, '0');
  const chipBtn = xssHarness.elements.activeChipsList.children[0]?.children[1];
  assert.ok(chipBtn, 'Expected chip remove button');
  assert.equal(chipBtn.attributes.onclick, undefined, 'Chip remove button must not use inline onclick string interpolation');
});

test('4. Valid status URL parameters restore offers and bestseller checkboxes', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?status=offers&status=bestseller'
  );

  assert.equal(harness.elements.statusCheckboxes['offers'].checked, true);
  assert.equal(harness.elements.statusCheckboxes['bestseller'].checked, true);

  harness.emitProducts();
  const visible = getVisibleProductTitles(harness);
  // Offers OR bestseller: p_skin_1 (both), p_hair_1 (offer), p_hair_2 (bestseller), p_body_1 (offer), p_perfume_1 (bestseller)
  assert.equal(visible.length, 5);
  assert.equal(visible.includes('غسول الوجه اللطيف'), false);
});

test('5. sort=price-asc and sort=price-desc restore sorting select and product DOM order', async () => {
  const { harness: ascHarness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?sort=price-asc'
  );
  assert.equal(ascHarness.elements.sortSelect.value, 'price-asc');
  ascHarness.emitProducts();
  assert.deepEqual(getVisibleProductTitles(ascHarness), [
    'زيت الإنبات الطبيعي',      // 180
    'غسول الوجه اللطيف',        // 250
    'شامبو خالي من السلفات',    // 320
    'زبدة الجسم المرطبة',       // 410
    'سيروم فيتامين سي',         // 499
    'بادي سبلاش فانيليا'        // 550
  ]);

  const { harness: descHarness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?sort=price-desc'
  );
  assert.equal(descHarness.elements.sortSelect.value, 'price-desc');
  descHarness.emitProducts();
  assert.deepEqual(getVisibleProductTitles(descHarness), [
    'بادي سبلاش فانيليا',       // 550
    'سيروم فيتامين سي',         // 499
    'زبدة الجسم المرطبة',       // 410
    'شامبو خالي من السلفات',    // 320
    'غسول الوجه اللطيف',        // 250
    'زيت الإنبات الطبيعي'       // 180
  ]);
});

test('6. Invalid category, status, and sort URL parameters are safely ignored', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?category=unknown_cat&status=bogus&sort=random_sort'
  );

  Object.values(harness.elements.catCheckboxes).forEach(chk => assert.equal(chk.checked, false));
  Object.values(harness.elements.statusCheckboxes).forEach(chk => assert.equal(chk.checked, false));
  assert.equal(harness.elements.sortSelect.value, 'default');

  harness.emitProducts();
  assert.equal(harness.elements.visibleCountNum.textContent, '6');
});

test('7. Combined category + status + search + sort state survives serialization and restoration on refresh', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?utm_source=meta&fbclid=fb123#catalog-top'
  );
  harness.emitProducts();

  // Interactive selections without page reload
  harness.elements.catCheckboxes['skin care'].checked = true;
  harness.elements.catCheckboxes['skin care'].dispatchEvent('change');

  harness.elements.catCheckboxes['hair care'].checked = true;
  harness.elements.catCheckboxes['hair care'].dispatchEvent('change');

  harness.elements.statusCheckboxes['bestseller'].checked = true;
  harness.elements.statusCheckboxes['bestseller'].dispatchEvent('change');

  harness.elements.searchInput.value = 'سيروم';
  harness.elements.searchInput.dispatchEvent('input');

  harness.elements.sortSelect.value = 'price-desc';
  harness.elements.sortSelect.dispatchEvent('change');

  const metrics = harness.getMetrics();
  assert.equal(metrics.reloadCalls, 0);
  assert.equal(metrics.navigationAttempts, 0);
  assert.equal(metrics.pushStateCalls, 0);
  assert.ok(metrics.replaceStateCalls > 0);
  assert.equal(metrics.hash, '#catalog-top');

  const syncedParams = new URLSearchParams(metrics.search);
  assert.deepEqual(syncedParams.getAll('category'), ['skin care', 'hair care']);
  assert.deepEqual(syncedParams.getAll('status'), ['bestseller']);
  assert.equal(syncedParams.get('search'), 'سيروم');
  assert.equal(syncedParams.get('sort'), 'price-desc');
  assert.equal(syncedParams.get('utm_source'), 'meta');
  assert.equal(syncedParams.get('fbclid'), 'fb123');

  // Simulate full page refresh using the generated URL
  const { harness: reloaded } = await bootCatalogPage(metrics.href);
  assert.equal(reloaded.elements.catCheckboxes['skin care'].checked, true);
  assert.equal(reloaded.elements.catCheckboxes['hair care'].checked, true);
  assert.equal(reloaded.elements.statusCheckboxes['bestseller'].checked, true);
  assert.equal(reloaded.elements.searchInput.value, 'سيروم');
  assert.equal(reloaded.elements.sortSelect.value, 'price-desc');

  reloaded.emitProducts();
  assert.deepEqual(getVisibleProductTitles(reloaded), ['سيروم فيتامين سي']);
});

test('8. Removing an individual filter chip updates checkboxes, results, and URL without reload', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?category=skin%20care&category=hair%20care&status=offers&search=%D8%B3%D9%8A%D8%B1%D9%88%D9%85&utm_campaign=spring'
  );
  harness.emitProducts();

  // Remove status chip 'offers'
  harness.window.removeFilterChip('status', 'offers');
  let params = new URLSearchParams(harness.getMetrics().search);
  assert.deepEqual(params.getAll('status'), []);
  assert.deepEqual(params.getAll('category'), ['skin care', 'hair care']);
  assert.equal(params.get('search'), 'سيروم');
  assert.equal(params.get('utm_campaign'), 'spring');

  // Remove search chip via rendered button click
  const searchChipBtn = harness.elements.activeChipsList.children
    .map(chip => chip.children[1])
    .find(btn => btn?.dataset?.filterType === 'search');
  assert.ok(searchChipBtn);
  searchChipBtn.dispatchEvent('click');

  params = new URLSearchParams(harness.getMetrics().search);
  assert.equal(params.has('search'), false);
  assert.deepEqual(params.getAll('category'), ['skin care', 'hair care']);
  assert.equal(harness.elements.visibleCountNum.textContent, '4');
  assert.equal(harness.getMetrics().reloadCalls, 0);
});

test('9. Clear-all removes catalog filter/search params while preserving unrelated tracking params and hash', async () => {
  const { harness } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?category=skin%20care&status=offers&search=%D8%BA%D8%B3%D9%88%D9%84&utm_source=ig&fbclid=abc999#grid'
  );
  harness.emitProducts();
  assert.equal(harness.elements.visibleCountNum.textContent, '0'); // غسول is not an offer

  harness.window.clearAllFilters();

  const metrics = harness.getMetrics();
  const params = new URLSearchParams(metrics.search);
  assert.equal(params.has('category'), false);
  assert.equal(params.has('status'), false);
  assert.equal(params.has('search'), false);
  assert.equal(params.get('utm_source'), 'ig');
  assert.equal(params.get('fbclid'), 'abc999');
  assert.equal(metrics.hash, '#grid');
  assert.equal(harness.elements.visibleCountNum.textContent, '6');
  assert.equal(harness.getMetrics().reloadCalls, 0);
});

test('10-12. Empty state, async product loading order, default sort return, and parameter-aware SEO robots handling', async () => {
  const { harness, source } = await bootCatalogPage(
    'https://dandy-ebon.vercel.app/all-products?category=perfume&search=nonexistent'
  );
  // Before async products load, controls & chips are already restored
  assert.equal(harness.elements.catCheckboxes['perfume'].checked, true);
  assert.equal(harness.elements.searchInput.value, 'nonexistent');
  assert.equal(harness.elements.activeChipsBar.style.display, 'flex');

  // When async products arrive, empty state appears with count 0
  harness.emitProducts();
  assert.equal(harness.elements.visibleCountNum.textContent, '0');
  const emptyEl = harness.document.getElementById('empty-products-state');
  assert.ok(emptyEl && emptyEl.style.display !== 'none');

  // Switching sort to price-asc then back to default removes sort param from URL
  harness.elements.sortSelect.value = 'price-asc';
  harness.elements.sortSelect.dispatchEvent('change');
  assert.equal(new URLSearchParams(harness.getMetrics().search).get('sort'), 'price-asc');

  harness.elements.sortSelect.value = 'default';
  harness.elements.sortSelect.dispatchEvent('change');
  assert.equal(new URLSearchParams(harness.getMetrics().search).has('sort'), false);

  // SEO robots check on Astro frontmatter
  const auditedMatch = source.match(/const AUDITED_CATALOG_PARAMS = (\[[^\]]+\]);/);
  assert.ok(auditedMatch, 'Expected AUDITED_CATALOG_PARAMS in all-products.astro');
  const auditedParams = JSON.parse(auditedMatch[1].replace(/'/g, '"'));
  ['category', 'status', 'search', 'sort', 'page'].forEach(param => {
    assert.equal(auditedParams.includes(param), true, `Expected AUDITED_CATALOG_PARAMS to include ${param}`);
  });
  assert.match(source, /canonical="https:\/\/dandy-ebon\.vercel\.app\/all-products"/);
  assert.match(source, /const robotsDirective = hasAuditedCatalogParam \? 'noindex, follow' : 'index, follow';/);
});
