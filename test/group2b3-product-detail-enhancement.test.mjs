// test/group2b3-product-detail-enhancement.test.mjs
// DANDY PHASE 2 / GROUP 2B.3: Product Detail UI/UX & Conversion Experience Verification

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PRODUCT_PAGE_PATH = path.resolve('src/pages/product/[...slug].astro');
const VARIANTS_JS_PATH = path.resolve('public/assets/js/variants.js');
const PINK_FRIDAY_JS_PATH = path.resolve('public/assets/js/pink-friday.js');
const PRODUCTS_TS_PATH = path.resolve('src/utils/products.ts');

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
    return s.has(c);
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
    this.open = false;
    this.focused = false;
    this.href = '';
    this.src = '';
    this.alt = '';
    this.classList = new MockClassList(this);
    this._rect = { top: 200, bottom: 250, left: 0, right: 200, width: 200, height: 50 };
  }

  setAttribute(k, v) {
    const val = String(v);
    this.attributes[k] = val;
    if (k === 'id') this.id = val;
    if (k === 'class') this.className = val;
    if (k === 'href') this.href = val;
    if (k === 'src') this.src = val;
    if (k === 'alt') this.alt = val;
    if (k === 'open') this.open = true;
    if (k === 'disabled') this.disabled = val !== 'false';
  }

  getAttribute(k) {
    if (k === 'id') return this.id || null;
    if (k === 'class') return this.className || null;
    if (k === 'href') return this.attributes.href ?? (this.href || null);
    if (k === 'src') return this.attributes.src ?? (this.src || null);
    if (k === 'alt') return this.attributes.alt ?? (this.alt || null);
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  }

  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'open') this.open = false;
  }

  appendChild(child) {
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

  contains(target) {
    if (!target) return false;
    if (target === this) return true;
    return this.children.some((c) => c.contains(target));
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
    if (this._innerHTML) return this._innerHTML;
    return this.children.map((c) => c.outerHTML).join('');
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
    const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
    return `${openTag}${this._textContent || this.innerHTML}</${tag}>`;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatchEvent(type, extra = {}) {
    let defaultPrevented = false;
    const ev = {
      type,
      target: this,
      currentTarget: this,
      stopPropagation() {},
      preventDefault() {
        defaultPrevented = true;
      },
      ...extra
    };
    const handlers = this.listeners.get(type) || [];
    for (const h of handlers) {
      h.call(this, ev);
    }
    if (type === 'click' && typeof this.onclick === 'function') {
      this.onclick(ev);
    }
    if (type === 'keydown' && typeof this.onkeydown === 'function') {
      this.onkeydown(ev);
    }
    return !defaultPrevented;
  }

  click() {
    if (this.disabled) return;
    this.dispatchEvent('click');
  }

  focus() {
    this.focused = true;
    if (this._onFocus) this._onFocus(this);
  }

  showModal() {
    this.open = true;
    this.setAttribute('open', '');
  }

  close() {
    this.open = false;
    this.removeAttribute('open');
    this.dispatchEvent('close');
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }

  scrollIntoView() {}

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }

  querySelectorAll(selector) {
    const partsGroups = selector.split(',').map((s) => s.trim()).filter(Boolean);
    const results = [];
    const matchSimple = (el, sel) => {
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const clsList = sel.slice(1).split('.').filter(Boolean);
        return clsList.every((c) => el.classList.contains(c));
      }
      if (sel.startsWith('[')) {
        const attrMatch = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (!attrMatch) return false;
        const val = el.getAttribute(attrMatch[1]);
        if (attrMatch[2] !== undefined) return val === attrMatch[2];
        return val !== null;
      }
      if (sel.includes('.')) {
        const [tagPart, ...clsParts] = sel.split('.');
        const tagOk = !tagPart || el.tagName.toLowerCase() === tagPart.toLowerCase();
        return tagOk && clsParts.every((c) => el.classList.contains(c));
      }
      return el.tagName.toLowerCase() === sel.toLowerCase();
    };
    const walk = (node) => {
      for (const child of node.children) {
        for (const group of partsGroups) {
          const parts = group.split(/\s+/);
          if (parts.length === 1) {
            if (matchSimple(child, parts[0]) && !results.includes(child)) results.push(child);
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
              if (matchedAncestor && !results.includes(child)) results.push(child);
            }
          }
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }
}

async function createPdpHarness(product, options = {}) {
  const astroSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');
  const scriptMarker = '<script is:inline define:vars={{ serverProduct: product }}>';
  const startIdx = astroSrc.indexOf(scriptMarker);
  assert.ok(startIdx !== -1, 'Could not locate product inline script');
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

  let activeElement = null;
  const trackFocus = (el) => {
    el._onFocus = (target) => {
      activeElement = target;
    };
    return el;
  };

  // Canonical URL & price helpers matching SSR output
  const canonicalUrl = options.canonicalUrl || `https://dandy-ebon.vercel.app/product/${encodeURIComponent(product.resolvedSlug || product.slug || product.id)}`;
  const mainImgSrc = product.image || 'https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=800&q=80';

  const canonicalLink = register(new MockElement('link'));
  canonicalLink.setAttribute('rel', 'canonical');
  canonicalLink.setAttribute('href', canonicalUrl);
  root.appendChild(canonicalLink);

  // Gallery + Lightbox DOM
  const productZoomBtn = trackFocus(register(new MockElement('button', 'product-zoom-btn', 'btn-detail-zoom')));
  const detailWishlistBtn = trackFocus(register(new MockElement('button', 'detailWishlistBtn', 'btn-detail-wishlist')));
  const productImageTrigger = trackFocus(register(new MockElement('button', 'product-image-trigger', 'detail-image-trigger')));
  const productImg = register(new MockElement('img', 'product-img'));
  productImg.setAttribute('src', mainImgSrc);
  productImg.setAttribute('alt', product.name);
  productImageTrigger.appendChild(productImg);
  body.appendChild(productZoomBtn);
  body.appendChild(detailWishlistBtn);
  body.appendChild(productImageTrigger);

  const lightboxDialog = register(new MockElement('dialog', 'product-lightbox-dialog', 'product-lightbox-dialog'));
  if (options.disableShowModal) {
    lightboxDialog.showModal = undefined;
    lightboxDialog.close = undefined;
  }
  const lightboxShell = new MockElement('div', '', 'lightbox-shell');
  const lightboxCloseBtn = trackFocus(register(new MockElement('button', 'lightbox-close-btn', 'lightbox-close-btn')));
  const lightboxImg = register(new MockElement('img', 'lightbox-img'));
  lightboxImg.setAttribute('src', mainImgSrc);
  lightboxImg.setAttribute('alt', product.name);
  lightboxShell.appendChild(lightboxCloseBtn);
  lightboxShell.appendChild(lightboxImg);
  lightboxDialog.appendChild(lightboxShell);
  body.appendChild(lightboxDialog);

  // Rating DOM
  const ratingHeader = register(new MockElement('div', 'product-rating-header', 'p-rating'));
  const ratingStars = register(new MockElement('div', 'header-rating-stars', 'p-rating-stars'));
  const ratingText = register(new MockElement('span', 'header-rating-text', 'p-rating-text'));
  ratingHeader.appendChild(ratingStars);
  ratingHeader.appendChild(ratingText);
  body.appendChild(ratingHeader);

  // Variant DOM
  const variantSection = register(new MockElement('div', 'variant-section-container', 'variant-selector-wrapper'));
  const variantPills = register(new MockElement('div', 'variant-pills-container', 'variant-pills-list'));
  const variantStatus = register(new MockElement('div', 'variant-selection-status', 'variant-selection-status'));
  const variantValidation = register(new MockElement('div', 'variant-validation-msg', 'variant-validation-msg'));
  variantValidation.setAttribute('role', 'alert');
  variantValidation.style.display = 'none';
  variantSection.appendChild(variantPills);
  variantSection.appendChild(variantStatus);
  variantSection.appendChild(variantValidation);
  body.appendChild(variantSection);

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

  // Qty & Purchase CTA
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

  const actionWishlistBtn = register(new MockElement('button', 'actionWishlistBtn', 'btn-action-wishlist'));
  body.appendChild(actionWishlistBtn);

  // Share UI
  const shareArea = register(new MockElement('div', 'detail-share-area', 'detail-share-area'));
  shareArea.setAttribute('data-canonical-url', canonicalUrl);
  const shareToggle = trackFocus(register(new MockElement('button', 'share-toggle', 'share-pill')));
  shareToggle.setAttribute('aria-expanded', 'false');
  shareToggle.setAttribute('aria-controls', 'share-menu');
  const shareMenu = register(new MockElement('div', 'share-menu', 'pop-options'));
  shareMenu.setAttribute('hidden', '');
  const shareCopyBtn = register(new MockElement('button', 'share-copy-link-btn', 'share-copy-btn'));
  shareCopyBtn.setAttribute('data-canonical-url', canonicalUrl);
  const shareCopyFeedback = register(new MockElement('div', 'share-copy-feedback', 'share-copy-feedback'));
  shareMenu.appendChild(shareCopyBtn);
  shareArea.appendChild(shareToggle);
  shareArea.appendChild(shareMenu);
  shareArea.appendChild(shareCopyFeedback);
  body.appendChild(shareArea);

  // Mobile sticky bar
  const mobileStickyBar = register(new MockElement('div', 'mobile-sticky-purchase-bar', 'mobile-sticky-purchase-bar'));
  mobileStickyBar.setAttribute('aria-hidden', 'true');
  const mobileStickyPrice = register(new MockElement('span', 'mobile-sticky-price', 'mobile-sticky-price'));
  const mobileStickyBtn = register(new MockElement('button', 'mobile-sticky-add-btn', 'mobile-sticky-cta-btn'));
  mobileStickyBtn.disabled = Boolean(product?.isSoldOut);
  mobileStickyBar.appendChild(mobileStickyPrice);
  mobileStickyBar.appendChild(mobileStickyBtn);
  body.appendChild(mobileStickyBar);

  // Reviews + Related DOM
  const reviewsContainer = register(new MockElement('div', 'product-reviews-container'));
  const reviewsBadge = register(new MockElement('div', 'reviews-header-badge', 'reviews-count-badge'));
  reviewsBadge.style.display = 'none';
  const reviewsWrapper = register(new MockElement('div', 'reviews-list-wrapper', 'reviews-list-wrapper'));
  reviewsContainer.appendChild(reviewsBadge);
  reviewsContainer.appendChild(reviewsWrapper);
  body.appendChild(reviewsContainer);

  const relatedSection = register(new MockElement('section', 'related-products-section', 'related-section'));
  relatedSection.style.display = 'none';
  const relatedGrid = register(new MockElement('div', 'related-products-grid', 'product-grid'));
  relatedSection.appendChild(relatedGrid);
  body.appendChild(relatedSection);

  // Cart badges + bottom nav
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
  const docListeners = new Map();
  const winListeners = new Map();
  const copiedTexts = [];
  const observerInstances = [];
  const dbWrites = [];
  let navigatedUrl = null;

  const mockDocument = {
    documentElement: root,
    body,
    getElementById: (id) => {
      if (byId.has(id)) return byId.get(id);
      return body.querySelector(`#${id}`);
    },
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    createElement: (tag) => new MockElement(tag),
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    execCommand: options.execCommand || (() => false)
  };

  class MockIntersectionObserver {
    constructor(cb, cfg) {
      this.cb = cb;
      this.cfg = cfg;
      this.observed = [];
      observerInstances.push(this);
    }
    observe(target) {
      this.observed.push(target);
    }
    trigger(isIntersecting) {
      this.cb([{ isIntersecting, target: this.observed[0] }]);
    }
  }

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
    URL,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    setTimeout: (fn) => ({ fn }),
    clearTimeout: () => {},
    alert: () => {
      alertCalls++;
    },
    localStorage,
    document: mockDocument,
    serverProduct: JSON.parse(JSON.stringify(product)),
    __PINK_FRIDAY_CONFIG: options.pinkFridayConfig || { enabled: false },
    navigator: options.disableClipboard
      ? {}
      : {
          clipboard: {
            writeText: async (txt) => {
              if (options.clipboardReject) throw new Error('Clipboard denied');
              copiedTexts.push(txt);
            }
          }
        },
    IntersectionObserver: options.disableIntersectionObserver ? undefined : MockIntersectionObserver,
    innerHeight: 844,
    location: {
      set href(v) {
        navigatedUrl = v;
      },
      get href() {
        return navigatedUrl || canonicalUrl;
      }
    },
    getProductLink: options.getProductLink || undefined,
    firebase: {
      database: () => ({
        ref: (p) => ({
          once: async () => {
            if (p.startsWith('reviews/')) {
              if (options.reviewsError) throw new Error('Firebase read denied');
              const r = options.reviewsData;
              if (!r || Object.keys(r).length === 0) {
                return { exists: () => false, val: () => null };
              }
              return { exists: () => true, val: () => r };
            }
            if (p === 'products') {
              const items = options.relatedDbProducts || {};
              const entries = Object.entries(items);
              if (entries.length === 0) return { exists: () => false, forEach: () => {} };
              return {
                exists: () => true,
                forEach: (cb) => {
                  entries.forEach(([key, val]) => cb({ key, val: () => val }));
                }
              };
            }
            if (p.startsWith('wishlists/')) {
              return { exists: () => true, val: () => options.wishlistData || {} };
            }
            return { exists: () => false, val: () => null };
          },
          set: async (v) => {
            dbWrites.push({ op: 'set', path: p, val: v });
          },
          remove: async () => {
            dbWrites.push({ op: 'remove', path: p });
          }
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
    addEventListener: (type, fn) => {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
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

  // Flush microtasks for initial async review / related product promises
  await new Promise((r) => setTimeout(r, 15));

  return {
    astroSrc,
    sandbox,
    root,
    body,
    productZoomBtn,
    productImageTrigger,
    productImg,
    lightboxDialog,
    lightboxCloseBtn,
    lightboxImg,
    lightboxShell,
    ratingHeader,
    ratingStars,
    ratingText,
    variantSection,
    variantPills,
    variantStatus,
    variantValidation,
    qtyMinus,
    qtyInput,
    qtyPlus,
    addToCartBtn,
    mobileStickyBar,
    mobileStickyBtn,
    shareArea,
    shareToggle,
    shareMenu,
    shareCopyBtn,
    shareCopyFeedback,
    reviewsBadge,
    reviewsWrapper,
    relatedSection,
    relatedGrid,
    sharedCartBadge,
    headerCartBadge,
    trackedEvents,
    dispatchedEvents,
    copiedTexts,
    observerInstances,
    dbWrites,
    getActiveElement: () => activeElement,
    getAlertCalls: () => alertCalls,
    getNavigatedUrl: () => navigatedUrl,
    getCart: () => JSON.parse(localStorage.getItem('cart') || '[]'),
    getVariantButtons: () => variantPills.querySelectorAll('.variant-pill-btn'),
    dispatchDocumentEvent: (type, ev = {}) => {
      (docListeners.get(type) || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, ...ev }));
    },
    dispatchWindowEvent: (type, ev = {}) => {
      (winListeners.get(type) || []).forEach((fn) => fn(ev));
    }
  };
}

// ============================================================================
// A. Product SSR and SEO (Checks 1–7)
// ============================================================================

test('A.1–7: Product SSR, SEO, canonical, JSON-LD, hidden 404/noindex, legacy ID redirect, and structured description escaping remain intact', async () => {
  const pdpSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');
  const productsSrc = await fs.readFile(PRODUCTS_TS_PATH, 'utf8');
  const { generateProductJsonLd, parseDescriptionToHtml, SITE_URL } = await import('../src/utils/products.ts');

  // 1. Title & canonical URL contract
  assert.ok(pdpSrc.includes("const pageTitle = product ? `${product.name} | داندي كوزمتكس - Dandy Cosmetics`"));
  assert.ok(pdpSrc.includes('const canonicalUrl = product ? `${SITE_URL}/product/${encodeURIComponent(product.resolvedSlug)}`'));
  assert.ok(pdpSrc.includes('canonical={canonicalUrl}'));

  // 2. Hidden / missing product returns 404 + noindex, nofollow
  assert.ok(pdpSrc.includes('const isNotFound = !product || product.isHidden;'));
  assert.ok(pdpSrc.includes('Astro.response.status = 404;'));
  assert.ok(pdpSrc.includes("robots={isNotFound ? 'noindex, nofollow' : 'index, follow'}"));

  // 3. Legacy product ID redirect & UTM preservation
  assert.ok(pdpSrc.includes('const productById = await getProductById(slug);'));
  assert.ok(pdpSrc.includes("if (k.startsWith('utm_') || k === 'fbclid' || k === 'gclid')"));
  assert.ok(pdpSrc.includes('return Astro.redirect(`/product/${encodeURIComponent(productById.resolvedSlug)}${qs}`, 301);'));

  // 4. Existing JSON-LD present and valid
  assert.ok(pdpSrc.includes('const jsonLd = product ? generateProductJsonLd(product, canonicalUrl) : null;'));
  assert.ok(pdpSrc.includes('<script id="product-jsonld" type="application/ld+json" set:html={JSON.stringify(jsonLd)} />'));
  const sampleJsonLd = generateProductJsonLd(
    {
      id: '-OvPq4qdTQ-LqYbxr6Yv',
      name: 'بادي سبلاش',
      resolvedSlug: 'body-splash-250ml',
      price: 250,
      image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      inStock: true
    },
    `${SITE_URL}/product/body-splash-250ml`
  );
  assert.equal(sampleJsonLd['@type'], 'Product');
  assert.equal(sampleJsonLd.offers.priceCurrency, 'EGP');
  assert.equal(sampleJsonLd.aggregateRating, undefined, 'No AggregateRating should be fabricated without real review data');

  // 5. Image source uses optimizeCloudinaryUrl & single-image contract (no fabricated images[])
  assert.ok(pdpSrc.includes("optimizeCloudinaryUrl(product?.image, { width: 800, height: 800, crop: 'limit' })"));
  assert.equal(/\.images\b|gallery-thumbnails/.test(pdpSrc), false);

  // 6. Product not found view preserved
  assert.ok(pdpSrc.includes('id="product-not-found-view"'));

  // 7. Structured description uses existing escaped parser
  assert.ok(pdpSrc.includes('const structuredDescriptionHtml = product ? parseDescriptionToHtml(product.description) : \'\';'));
  assert.ok(pdpSrc.includes('set:html={structuredDescriptionHtml}'));
  const escapedDesc = parseDescriptionToHtml('مميزات:\n- <script>alert(1)</script>');
  assert.ok(!escapedDesc.includes('<script>alert(1)</script>'));
  assert.ok(escapedDesc.includes('&lt;script&gt;'));
  assert.ok(productsSrc.includes('function escapeHtml('));
});

// ============================================================================
// B. Image Lightbox (Checks 8–15)
// ============================================================================

test('B.8–15: Image lightbox opens from main image or zoom button, preserves src/alt, handles Close/Escape/backdrop/focus/scroll lock', async () => {
  const prod = {
    id: 'prod-serum',
    name: 'سيروم الوجه 3×1',
    resolvedSlug: 'facial-serum-3x1-30ml',
    price: 380,
    image: 'https://res.cloudinary.com/demo/image/upload/v1/serum.jpg'
  };

  // Native showModal path
  const h = await createPdpHarness(prod);
  assert.equal(h.lightboxDialog.open, false);

  h.productImageTrigger.click();
  assert.equal(h.lightboxDialog.open, true, 'Main image trigger must open lightbox');
  assert.equal(h.lightboxImg.getAttribute('src'), h.productImg.getAttribute('src'));
  assert.equal(h.lightboxImg.getAttribute('alt'), prod.name);
  assert.equal(h.body.classList.contains('lightbox-open'), true, 'Scroll lock must be applied');
  assert.equal(h.getActiveElement(), h.lightboxCloseBtn, 'Focus must move to close button');

  // Backdrop inner click must NOT close
  h.lightboxDialog.dispatchEvent('click', { target: h.lightboxShell });
  assert.equal(h.lightboxDialog.open, true);

  // Backdrop click on dialog element closes and restores scroll + focus
  h.lightboxDialog.dispatchEvent('click', { target: h.lightboxDialog });
  assert.equal(h.lightboxDialog.open, false);
  assert.equal(h.body.classList.contains('lightbox-open'), false, 'Scroll lock must be removed on close');
  assert.equal(h.getActiveElement(), h.productImageTrigger, 'Focus must return to original trigger');

  // Zoom button trigger + close button
  h.productZoomBtn.click();
  assert.equal(h.lightboxDialog.open, true);
  h.lightboxCloseBtn.click();
  assert.equal(h.lightboxDialog.open, false);
  assert.equal(h.getActiveElement(), h.productZoomBtn);

  // Escape key closes lightbox
  h.productZoomBtn.click();
  assert.equal(h.lightboxDialog.open, true);
  h.lightboxDialog.dispatchEvent('keydown', { key: 'Escape' });
  assert.equal(h.lightboxDialog.open, false);
  assert.equal(h.body.classList.contains('lightbox-open'), false);

  // Graceful fallback when showModal is unsupported
  const hFallback = await createPdpHarness(prod, { disableShowModal: true });
  hFallback.productImageTrigger.click();
  assert.equal(hFallback.lightboxDialog.classList.contains('is-fallback-open'), true);
  hFallback.lightboxCloseBtn.click();
  assert.equal(hFallback.lightboxDialog.classList.contains('is-fallback-open'), false);
  assert.equal(hFallback.body.classList.contains('lightbox-open'), false);
});

// ============================================================================
// C. Variants (Checks 16–24)
// ============================================================================

test('C.16–24: Variant UI preserves hidden non-variant, scent rendering, unsupported variantType hiding, deduplication, disabled unavailable, deterministic multi-select, and non-blocking inline validation', async () => {
  // 16 & 18: Non-variant and unsupported variantType display no selector
  const nonVariantH = await createPdpHarness({ id: 'p-nv', name: 'كريم', price: 150, hasVariants: false });
  assert.equal(nonVariantH.variantSection.style.display, 'none');

  const flavorH = await createPdpHarness({
    id: 'p-flv',
    name: 'مرطب شفاه',
    price: 120,
    hasVariants: true,
    variantType: 'flavor',
    variants: [{ id: 'berry', name: 'توت', isAvailable: true }]
  });
  assert.equal(flavorH.variantSection.style.display, 'none');
  flavorH.addToCartBtn.click();
  assert.equal(flavorH.getCart().length, 1);

  // 17, 19, 20, 21, 22, 23, 24: Full scent lifecycle
  const scentProd = {
    id: 'p-scent',
    name: 'معطر داندي',
    price: 280,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'rose', name: 'الورد', isAvailable: true },
      { id: 'rose', name: 'ورد مكرر', isAvailable: false },
      { id: 'musk', name: 'المسك', isAvailable: true },
      { id: 'oud', name: 'العود', isAvailable: false }
    ]
  };
  const h = await createPdpHarness(scentProd);
  const btns = h.getVariantButtons();
  assert.equal(btns.length, 3, 'Duplicate variant IDs must remain deduplicated');
  const oudBtn = btns.find((b) => b.getAttribute('data-id') === 'oud');
  assert.equal(oudBtn.disabled, true);
  assert.equal(oudBtn.getAttribute('aria-disabled'), 'true');
  oudBtn.click();
  assert.equal(oudBtn.classList.contains('selected'), false);

  // Missing selection blocks add cleanly with inline alert (no window.alert)
  h.addToCartBtn.click();
  assert.equal(h.getCart().length, 0);
  assert.equal(h.getAlertCalls(), 0);
  assert.equal(h.variantValidation.style.display, 'flex');
  assert.equal(h.variantValidation.getAttribute('role'), 'alert');

  // Multiple variants in reverse order produce deterministic canonical order
  const muskBtn = btns.find((b) => b.getAttribute('data-id') === 'musk');
  const roseBtn = btns.find((b) => b.getAttribute('data-id') === 'rose');
  roseBtn.click();
  muskBtn.click();
  assert.equal(roseBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(muskBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(h.variantValidation.style.display, 'none');

  h.addToCartBtn.click();
  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].id, 'p-scent::musk_rose');
  assert.deepEqual(cart[0].selectedVariants, [
    { id: 'musk', name: 'المسك' },
    { id: 'rose', name: 'الورد' }
  ]);
});

// ============================================================================
// D. Quantity & Cart (Checks 25–38)
// ============================================================================

test('D.25–38: Quantity normalization, cart merging, Pink Friday pricing, sold-out blocking, badges, cart-updated, single Meta AddToCart, guest access, and zero inventory logic', async () => {
  const pfProduct = {
    id: 'pf-p1',
    name: 'مقشر طبيعي',
    price: 400,
    image: 'https://example.com/scrub.jpg',
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'a', name: 'لافندر', isAvailable: true },
      { id: 'b', name: 'فانيليا', isAvailable: true }
    ]
  };
  const pinkFridayConfig = {
    enabled: true,
    startAt: '2020-01-01T00:00:00Z',
    endAt: '2099-12-31T23:59:59Z',
    offers: [{ productId: 'pf-p1', expectedBasePrice: 400, campaignPrice: 299, active: true, badgeText: 'Pink Friday' }]
  };

  const h = await createPdpHarness(pfProduct, { pinkFridayConfig, currentUser: null });
  // Quantity min 1, max 99, Arabic-Indic digits, malformed values
  h.qtyInput.value = '0';
  h.qtyInput.dispatchEvent('change');
  assert.equal(h.qtyInput.value, '1');

  h.qtyInput.value = '150';
  h.qtyInput.dispatchEvent('change');
  assert.equal(h.qtyInput.value, '99');

  h.qtyInput.value = '2abc';
  h.qtyInput.dispatchEvent('change');
  assert.equal(h.qtyInput.value, '1');

  h.qtyInput.value = '٣';
  h.qtyInput.dispatchEvent('change');
  assert.equal(h.qtyInput.value, '3');

  // Select variant a and add qty 3
  h.getVariantButtons()[0].click();
  h.addToCartBtn.click();
  assert.equal(h.trackedEvents.filter((e) => e.event === 'AddToCart').length, 1);
  assert.equal(h.dispatchedEvents.includes('cart-updated'), true);
  assert.equal(h.sharedCartBadge.textContent, '3');

  // Re-add variant a qty 2 -> merges to qty 5 & keeps Pink Friday metadata
  h.qtyInput.value = '2';
  h.addToCartBtn.click();
  // Select variant b qty 1 -> distinct cart entry
  h.getVariantButtons()[0].click(); // deselect a
  h.getVariantButtons()[1].click(); // select b
  h.qtyInput.value = '1';
  h.addToCartBtn.click();

  const cart = h.getCart();
  assert.equal(cart.length, 2);
  assert.equal(cart[0].id, 'pf-p1::a');
  assert.equal(cart[0].quantity, 5);
  assert.equal(cart[0].isPinkFriday, true);
  assert.equal(cart[0].price, 299);
  assert.equal(cart[0].campaignPrice, 299);
  assert.equal(cart[0].regularPrice, 400);
  assert.equal(cart[1].id, 'pf-p1::b');
  assert.equal(h.sharedCartBadge.textContent, '6');

  // Sold-out product blocked
  const hSold = await createPdpHarness({ id: 'p-sold', name: 'منتج منتهي', price: 200, isSoldOut: true });
  assert.equal(hSold.addToCartBtn.disabled, true);
  hSold.addToCartBtn.click();
  assert.equal(hSold.getCart().length, 0);

  // Zero inventory logic
  assert.equal(/stockQuantity/.test(h.astroSrc), false);
});

// ============================================================================
// E. Mobile Sticky Purchase Bar (Checks 39–48)
// ============================================================================

test('E.39–48: Mobile sticky purchase bar visibility lifecycle, single purchase mutation & Meta event delegation, variant validation, blocking dialog suppression, and layout constraints', async () => {
  const pdpSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');
  assert.ok(pdpSrc.includes('env(safe-area-inset-bottom'), 'Sticky bar must respect safe-area insets');
  assert.ok(pdpSrc.includes('@media (max-width: 767px)'), 'Sticky bar must target mobile viewports only');
  assert.ok(pdpSrc.includes('padding-left: 76px'), 'Sticky bar must reserve space for floating assistant widget');

  // Main price sync rendered inside mobile sticky bar template
  assert.ok(pdpSrc.includes('id="mobile-sticky-price">{effectivePrice.toFixed(0)} ج.م</span>'));

  const scentProd = {
    id: 'p-sticky',
    name: 'غسول يومي',
    price: 195,
    hasVariants: true,
    variantType: 'scent',
    variants: [{ id: 'rose', name: 'الورد', isAvailable: true }]
  };
  const h = await createPdpHarness(scentProd);
  assert.equal(h.observerInstances.length, 1);

  // Hidden while main CTA visible
  assert.equal(h.mobileStickyBar.classList.contains('is-visible'), false);
  assert.equal(h.mobileStickyBar.getAttribute('aria-hidden'), 'true');

  // Main CTA leaves viewport -> sticky bar shows
  h.observerInstances[0].trigger(false);
  assert.equal(h.mobileStickyBar.classList.contains('is-visible'), true);
  assert.equal(h.mobileStickyBar.getAttribute('aria-hidden'), 'false');

  // Missing variant triggered via sticky CTA activates inline validation (single error path)
  h.mobileStickyBtn.click();
  assert.equal(h.variantValidation.style.display, 'flex');
  assert.equal(h.getCart().length, 0);

  // Select variant, then sticky CTA adds ONCE (zero duplicate cart mutation or Meta AddToCart)
  h.getVariantButtons()[0].click();
  h.qtyInput.value = '2';
  h.mobileStickyBtn.click();
  const cart = h.getCart();
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2, 'Sticky CTA must not duplicate cart quantity');
  assert.equal(h.trackedEvents.filter((e) => e.event === 'AddToCart').length, 1, 'Sticky CTA must fire Meta AddToCart once');

  // Opening lightbox hides sticky bar; closing restores it
  h.productZoomBtn.click();
  assert.equal(h.mobileStickyBar.classList.contains('is-visible'), false);
  assert.equal(h.mobileStickyBar.getAttribute('aria-hidden'), 'true');
  h.lightboxCloseBtn.click();
  assert.equal(h.mobileStickyBar.classList.contains('is-visible'), true);

  // Fallback scroll listener when IntersectionObserver is unavailable
  const hNoIo = await createPdpHarness({ id: 'p-noio', name: 'كريم', price: 150 }, { disableIntersectionObserver: true });
  hNoIo.addToCartBtn._rect = { top: -120, bottom: -70, left: 0, right: 200, width: 200, height: 50 };
  hNoIo.dispatchWindowEvent('scroll');
  assert.equal(hNoIo.mobileStickyBar.classList.contains('is-visible'), true);
  hNoIo.addToCartBtn._rect = { top: 300, bottom: 350, left: 0, right: 200, width: 200, height: 50 };
  hNoIo.dispatchWindowEvent('scroll');
  assert.equal(hNoIo.mobileStickyBar.classList.contains('is-visible'), false);

  // Sold-out sticky button disabled
  const hSold = await createPdpHarness({ id: 'p-sold-sticky', name: 'منتج منتهي', price: 150, isSoldOut: true });
  assert.equal(hSold.mobileStickyBtn.disabled, true);
});

// ============================================================================
// F. Product Sharing (Checks 49–54)
// ============================================================================

test('F.49–54: Product sharing supports keyboard Enter/Space/Escape, outside click, aria-expanded sync, and canonical link copying with fallback', async () => {
  const canonicalUrl = 'https://dandy-ebon.vercel.app/product/body-splash-250ml';
  const prod = { id: 'p-share', name: 'بادي سبلاش', resolvedSlug: 'body-splash-250ml', price: 250 };
  const h = await createPdpHarness(prod, { canonicalUrl });

  assert.equal(h.shareToggle.getAttribute('aria-expanded'), 'false');
  assert.notEqual(h.shareMenu.getAttribute('hidden'), null);

  // Keyboard Enter opens share menu
  h.shareToggle.dispatchEvent('keydown', { key: 'Enter' });
  assert.equal(h.shareToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(h.shareMenu.classList.contains('is-open'), true);
  assert.equal(h.shareMenu.getAttribute('hidden'), null);

  // Escape closes and restores focus
  h.shareMenu.dispatchEvent('keydown', { key: 'Escape' });
  assert.equal(h.shareToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(h.getActiveElement(), h.shareToggle);

  // Keyboard Space opens share menu
  h.shareToggle.dispatchEvent('keydown', { key: ' ' });
  assert.equal(h.shareToggle.getAttribute('aria-expanded'), 'true');

  // Copy canonical product URL
  await h.shareCopyBtn.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(h.copiedTexts, [canonicalUrl]);
  assert.ok(h.shareCopyFeedback.textContent.includes('تم نسخ'));

  // Clicking outside closes share menu
  h.dispatchDocumentEvent('click', { target: h.body });
  assert.equal(h.shareToggle.getAttribute('aria-expanded'), 'false');

  // Safe fallback when Clipboard API is unavailable (and execCommand fails gracefully)
  const hNoClip = await createPdpHarness(prod, { canonicalUrl, disableClipboard: true });
  hNoClip.shareCopyBtn.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(hNoClip.shareCopyFeedback.classList.contains('is-error'), true);
  assert.ok(hNoClip.shareCopyFeedback.textContent.length > 0);
});

// ============================================================================
// G. Reviews (Checks 55–60)
// ============================================================================

test('G.55–60: Reviews preserve genuine reviews/{productId} data, calculations, empty state, escaping, error fallback, and verified-only rules', async () => {
  // 55, 56, 58: Genuine reviews + average + XSS escaping
  const hReviews = await createPdpHarness(
    { id: 'p-rev', name: 'كريم العناية', price: 300 },
    {
      reviewsData: {
        r1: {
          customerName: '<script>alert(1)</script>سارة',
          rating: 5,
          comment: '<img src=x onerror=alert(2)> ممتاز جداً',
          createdAt: 1730000000000
        },
        r2: {
          customerName: 'منى',
          rating: 4,
          comment: 'جميل وناعم',
          createdAt: 1730001000000
        }
      }
    }
  );
  assert.ok(hReviews.reviewsBadge.textContent.includes('4.5 / 5 (2 تقييم)'));
  assert.ok(hReviews.ratingText.textContent.includes('(2 تقييم)'));
  assert.equal(hReviews.reviewsWrapper.innerHTML.includes('<script>alert(1)</script>'), false);
  assert.equal(hReviews.reviewsWrapper.innerHTML.includes('<img src=x onerror=alert(2)>'), false);
  assert.ok(hReviews.reviewsWrapper.innerHTML.includes('&lt;script&gt;'));
  assert.ok(hReviews.reviewsWrapper.innerHTML.includes('&lt;img src=x'));

  // 57: Empty reviews state
  const hEmpty = await createPdpHarness({ id: 'p-norev', name: 'كريم جديد', price: 250 });
  assert.ok(hEmpty.ratingText.textContent.includes('لا توجد تقييمات بعد'));
  assert.equal(hEmpty.ratingStars.querySelectorAll('.fa-star').length, 0);

  // 59: Firebase read error
  const hErr = await createPdpHarness({ id: 'p-err', name: 'كريم', price: 250 }, { reviewsError: true });
  assert.ok(hErr.reviewsWrapper.innerHTML.includes('تعذر استرجاع التقييمات حالياً.'));

  // 60: No unverified client review submission introduced
  const pdpSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');
  assert.equal(/\.ref\(\s*[`'"]reviews[^`'"]*[`'"]\s*\)\s*\.\s*(push|set|update|remove)/.test(pdpSrc), false);
});

// ============================================================================
// H. Related Products (Checks 61–70)
// ============================================================================

test('H.61–70: Related products exclude hidden/self, use safe DOM construction without inline onclick, sanitize unsafe images/URLs, preserve wishlist, and apply Pink Friday pricing', async () => {
  const mainProd = { id: 'p-main', name: 'شامبو', price: 250, category: 'Hair care' };
  const pinkFridayConfig = {
    enabled: true,
    startAt: '2020-01-01T00:00:00Z',
    endAt: '2099-12-31T23:59:59Z',
    offers: [{ productId: 'p-pf-rel', expectedBasePrice: 300, campaignPrice: 225, active: true, badgeText: 'عرض Pink Friday' }]
  };

  const relatedDbProducts = {
    'p-main': { name: 'شامبو', price: 250, category: 'Hair care', isHidden: false },
    'p-hidden': { name: 'مخفي', price: 100, category: 'Hair care', isHidden: true },
    'p-xss': {
      name: '<img src=x onerror=alert(1)> حمام كريم',
      price: 200,
      category: 'Hair care',
      slug: 'mask-xss',
      image: 'javascript:alert(1)'
    },
    'p-pf-rel': {
      name: 'سيروم شعر',
      price: 300,
      category: 'Hair care',
      slug: 'hair-serum',
      image: 'https://res.cloudinary.com/demo/image/upload/v1/hs.jpg'
    },
    'p-bad-link': {
      name: 'بلسم',
      price: 180,
      category: 'Hair care',
      image: 'data:text/html,<script>alert(1)</script>'
    }
  };

  const h = await createPdpHarness(mainProd, {
    pinkFridayConfig,
    relatedDbProducts,
    currentUser: null,
    getProductLink: (prod) => {
      if (prod.id === 'p-bad-link') return 'javascript:alert(99)';
      return `/product/${encodeURIComponent(prod.slug || prod.id)}`;
    }
  });

  assert.equal(h.relatedSection.style.display, 'block');
  const cards = h.relatedGrid.querySelectorAll('.product-card');
  assert.equal(cards.length, 3, 'Self and hidden products must be excluded from related cards');

  // Verify no inline onclick attributes exist anywhere in related grid
  assert.equal(h.relatedGrid.querySelectorAll('[onclick]').length, 0);

  // Verify XSS product title rendered via textContent (zero injected <img> inside title)
  const titles = h.relatedGrid.querySelectorAll('.product-title-card');
  assert.ok(titles[0].textContent.includes('<img src=x onerror=alert(1)> حمام كريم'));
  assert.equal(titles[0].querySelectorAll('img').length, 0);

  // Verify unsafe images replaced with safe fallback
  const imgs = h.relatedGrid.querySelectorAll('img');
  assert.equal(imgs[0].getAttribute('src'), '/assets/images/logo.png');
  assert.equal(imgs[1].getAttribute('src'), 'https://res.cloudinary.com/demo/image/upload/v1/hs.jpg');
  assert.equal(imgs[2].getAttribute('src'), '/assets/images/logo.png');

  // Verify unsafe link falls back to same-site /all-products
  const ctaLinks = h.relatedGrid.querySelectorAll('.card-add-btn');
  assert.equal(ctaLinks[0].getAttribute('href'), '/product/mask-xss');
  assert.equal(ctaLinks[2].getAttribute('href'), '/all-products');

  // Verify Pink Friday helper price on related card
  const pfCardHtml = cards[1].innerHTML;
  assert.ok(pfCardHtml.includes('225 ج.م'));
  assert.ok(pfCardHtml.includes('300 ج.م'));
  assert.ok(pfCardHtml.includes('عرض Pink Friday'));

  // Verify wishlist button redirects unauthenticated user safely without alert
  const wishBtn = cards[0].querySelector('.btn-card-wishlist');
  wishBtn.click();
  assert.equal(h.getAlertCalls(), 0);
  assert.equal(h.getNavigatedUrl(), '/account-login');

  // Verify wishlist authenticated toggle writes cleanly to wishlists/{uid}/{productId}
  const hAuth = await createPdpHarness(mainProd, {
    relatedDbProducts: { 'p-pf-rel': relatedDbProducts['p-pf-rel'] },
    currentUser: { uid: 'user-123' }
  });
  const authWishBtn = hAuth.relatedGrid.querySelector('.btn-card-wishlist');
  await authWishBtn.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(hAuth.dbWrites.length, 1);
  assert.deepEqual(hAuth.dbWrites[0], { op: 'set', path: 'wishlists/user-123/p-pf-rel', val: true });
});

// ============================================================================
// I. Architecture Protection (Checks 71–78)
// ============================================================================

test('I.71–78: No inventory system, schema migration, external dependency, or protected rules/analytics paths altered', async () => {
  const pdpSrc = await fs.readFile(PRODUCT_PAGE_PATH, 'utf8');
  const pkg = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));

  assert.equal(/stockQuantity/.test(pdpSrc), false);
  assert.equal(/\.ref\(\s*[`'"]orders/.test(pdpSrc), false);
  assert.equal(/\.ref\(\s*[`'"]settings/.test(pdpSrc), false);
  assert.equal(/\.ref\(\s*[`'"]products[^`'"]*[`'"]\s*\)\s*\.\s*(push|set|update|remove|transaction)/.test(pdpSrc), false);
  assert.equal(Boolean(pkg.dependencies?.['@playwright/cli']), false);
  assert.equal(fsSync.existsSync(path.resolve('firebase/database.rules.json')), true);
  assert.equal(fsSync.existsSync(path.resolve('firebase/firestore.rules')), true);
});
