// public/assets/js/meta-pixel.js
// Central Meta Pixel & Consent Management Engine for Dandy Cosmetics
// Pixel ID: 1678552386587380

(function (window, document) {
  'use strict';

  var PIXEL_ID = '1678552386587380';
  var CONSENT_STORAGE_KEY = 'dandy_marketing_consent'; // 'granted' | 'denied'
  var CONSENT_COOKIE_KEY = 'dandy_consent_choice'; // 'all' | 'essential' | 'refused'

  var isInitialized = false;
  var pageViewFired = false;

  // Determine if the current page should be strictly excluded from tracking
  function isExcludedRoute() {
    try {
      var path = (window.location.pathname || '').toLowerCase();
      // Exclude dashboard, admin login, internal statues, private API routes
      if (
        path.startsWith('/dashboard') ||
        path === '/login' ||
        path.startsWith('/login/') ||
        path === '/statues' ||
        path.startsWith('/statues/') ||
        path.startsWith('/api/') ||
        path.includes('/dashboard-')
      ) {
        return true;
      }
    } catch (e) {
      // In case of error, fail safe
    }
    return false;
  }

  // Check user consent status
  function getConsentStatus() {
    try {
      var storage = window.localStorage;
      if (!storage) return 'unset';
      var stored = storage.getItem(CONSENT_STORAGE_KEY);
      if (stored === 'granted' || stored === 'denied') {
        return stored;
      }
      var cookieVal = storage.getItem(CONSENT_COOKIE_KEY);
      if (cookieVal === 'all') return 'granted';
      if (cookieVal === 'essential' || cookieVal === 'refused') return 'denied';
    } catch (e) {}
    return 'unset';
  }

  function setConsentStatus(status) {
    try {
      var storage = window.localStorage;
      if (storage) {
        if (status === 'granted') {
          storage.setItem(CONSENT_STORAGE_KEY, 'granted');
          storage.setItem(CONSENT_COOKIE_KEY, 'all');
        } else {
          storage.setItem(CONSENT_STORAGE_KEY, 'denied');
          storage.setItem(CONSENT_COOKIE_KEY, 'essential');
        }
      }
    } catch (e) {}

    // Dispatch event so other components / banner can update UI
    window.dispatchEvent(new CustomEvent('dandy:consent-changed', { detail: { consent: status } }));

    if (status === 'granted') {
      initPixelIfAllowed();
    } else {
      // If denied, revoke consent in Meta Pixel runtime if already loaded
      if (typeof window.fbq === 'function') {
        try {
          window.fbq('consent', 'revoke');
        } catch (err) {}
      }
    }
  }

  // Inject Meta Pixel Base Script safely (exactly once)
  function injectPixelBaseCode() {
    if (window.fbq) return;

    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
  }

  function initPixelIfAllowed() {
    if (isExcludedRoute()) {
      return;
    }

    var consent = getConsentStatus();
    if (consent !== 'granted') {
      return;
    }

    if (!isInitialized) {
      injectPixelBaseCode();
      if (typeof window.fbq === 'function') {
        window.fbq('consent', 'grant');
        window.fbq('init', PIXEL_ID);
        isInitialized = true;
      }
    } else {
      // If already initialized and re-granted after being denied, ensure grant is re-asserted
      if (typeof window.fbq === 'function') {
        try {
          window.fbq('consent', 'grant');
        } catch (e) {}
      }
    }

    if (!pageViewFired && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');
      pageViewFired = true;
    }
  }

  // Helper to format standard products and collection items into valid Meta payload
  function normalizeContentIds(ids) {
    if (!Array.isArray(ids)) {
      if (ids === undefined || ids === null) return [];
      ids = [ids];
    }
    return ids
      .map(function (id) {
        if (!id) return '';
        var str = String(id).trim();
        // Strip custom variant suffix if present (e.g. prod_1::variant_id)
        return str.split('::')[0];
      })
      .filter(function (id) {
        return id.length > 0;
      });
  }

  // Unified Central Tracking Dispatcher
  function trackEvent(eventName, params, options) {
    if (isExcludedRoute()) {
      return false;
    }

    var consent = getConsentStatus();
    if (consent !== 'granted') {
      return false;
    }

    // Ensure Pixel is initialized if consent is granted
    if (!isInitialized) {
      initPixelIfAllowed();
    }

    if (typeof window.fbq !== 'function') {
      return false;
    }

    var cleanParams = Object.assign({}, params || {});

    // Ensure clean content_ids
    if (cleanParams.content_ids) {
      cleanParams.content_ids = normalizeContentIds(cleanParams.content_ids);
    }

    // Ensure currency
    if (!cleanParams.currency) {
      cleanParams.currency = 'EGP';
    }

    // Ensure value is a clean numeric
    if (cleanParams.value !== undefined) {
      var val = parseFloat(cleanParams.value);
      cleanParams.value = isNaN(val) ? 0 : parseFloat(val.toFixed(2));
    }

    // Support Conversions API deduplication eventID if provided
    var eventID = options && options.eventID ? options.eventID : cleanParams.eventID;
    if (eventID) {
      delete cleanParams.eventID;
      window.fbq('track', eventName, cleanParams, { eventID: String(eventID) });
    } else {
      window.fbq('track', eventName, cleanParams);
    }

    return true;
  }

  // Expose Global DandyMeta Bridge
  window.DandyMeta = {
    PIXEL_ID: PIXEL_ID,
    getConsent: getConsentStatus,
    setConsent: setConsentStatus,
    isExcludedRoute: isExcludedRoute,
    normalizeContentIds: normalizeContentIds,
    track: trackEvent,

    // Specific standard event helpers
    trackViewContent: function (product, options) {
      if (!product) return false;
      var cleanId = normalizeContentIds([product.id || product.productId])[0] || '';
      var price = parseFloat(product.price) || 0;
      return trackEvent('ViewContent', {
        content_name: product.name || '',
        content_ids: [cleanId],
        content_type: 'product',
        value: price,
        currency: 'EGP'
      }, options);
    },

    trackAddToCart: function (item, options) {
      if (!item) return false;

      // Handle Pink Friday collection bundle
      if (item.type === 'collection' || item.isCollection || item.collectionId) {
        var subItems = Array.isArray(item.selectedItems) ? item.selectedItems : (Array.isArray(item.items) ? item.items : []);
        var contentIds = subItems.map(function (si) {
          return si.productId || si.id;
        });
        var colPrice = parseFloat(item.price) || parseFloat(item.calculatedPrice) || 0;
        var qty = parseInt(item.quantity) || 1;

        return trackEvent('AddToCart', {
          content_name: item.name || 'كوليكشن Pink Friday',
          content_ids: normalizeContentIds(contentIds),
          content_type: 'product_group',
          value: parseFloat((colPrice * qty).toFixed(2)),
          currency: 'EGP',
          num_items: contentIds.length * qty
        }, options);
      }

      // Standard Product
      var prodId = item.productId || item.id;
      var prodPrice = parseFloat(item.price) || 0;
      var prodQty = parseInt(item.quantity) || 1;

      return trackEvent('AddToCart', {
        content_name: item.name || '',
        content_ids: normalizeContentIds([prodId]),
        content_type: 'product',
        value: parseFloat((prodPrice * prodQty).toFixed(2)),
        currency: 'EGP',
        num_items: prodQty
      }, options);
    },

    trackSearch: function (searchQuery, options) {
      var query = (searchQuery || '').trim();
      if (!query || query.length < 2) return false;
      return trackEvent('Search', {
        search_string: query
      }, options);
    },

    trackInitiateCheckout: function (cartItems, totalValue, options) {
      var items = Array.isArray(cartItems) ? cartItems : [];
      if (items.length === 0) return false;

      var allIds = [];
      var totalCount = 0;

      items.forEach(function (item) {
        var qty = parseInt(item.quantity) || 1;
        totalCount += qty;

        if (item.type === 'collection' || item.isCollection || item.collectionId) {
          var subs = Array.isArray(item.selectedItems) ? item.selectedItems : (Array.isArray(item.items) ? item.items : []);
          subs.forEach(function (s) {
            if (s.productId || s.id) allIds.push(s.productId || s.id);
          });
        } else {
          var pid = item.productId || item.id;
          if (pid) allIds.push(pid);
        }
      });

      var val = parseFloat(totalValue);
      if (isNaN(val) || val <= 0) val = 0;

      return trackEvent('InitiateCheckout', {
        content_ids: normalizeContentIds(allIds),
        content_type: 'product',
        value: parseFloat(val.toFixed(2)),
        currency: 'EGP',
        num_items: totalCount
      }, options);
    },

    trackPurchase: function (order, options) {
      if (!order || typeof order !== 'object') return false;

      // Ensure order has valid items and verified total amount
      var transactionId = String(order.invoiceCode || order.orderId || order.id || '').trim();
      if (!transactionId) {
        return false;
      }

      var products = Array.isArray(order.products) ? order.products : [];
      if (products.length === 0) {
        return false;
      }

      var storageKey = 'dandy_meta_purchase_fired_' + transactionId;

      // Safe check against sessionStorage (Prevent duplicate fires, handle blocked storage gracefully)
      try {
        var sStorage = window.sessionStorage;
        if (sStorage && sStorage.getItem(storageKey)) {
          return false;
        }
      } catch (e) {
        // If sessionStorage is disabled/blocked by browser, continue safely
      }

      var contentIds = [];
      var numItems = 0;

      products.forEach(function (p) {
        if (!p) return;
        var qty = parseInt(p.quantity) || 1;
        numItems += qty;

        if (p.type === 'collection' || p.isCollection || p.collectionId) {
          var subs = Array.isArray(p.items) ? p.items : (Array.isArray(p.selectedItems) ? p.selectedItems : []);
          subs.forEach(function (s) {
            if (s && (s.productId || s.id)) contentIds.push(s.productId || s.id);
          });
        } else {
          var pid = p.productId || p.id;
          if (pid) contentIds.push(pid);
        }
      });

      var finalValue = parseFloat(order.totalAmount !== undefined ? order.totalAmount : (order.subtotal || 0));
      if (isNaN(finalValue) || finalValue <= 0) {
        return false;
      }

      var fired = trackEvent('Purchase', {
        content_ids: normalizeContentIds(contentIds),
        content_type: 'product',
        value: parseFloat(finalValue.toFixed(2)),
        currency: 'EGP',
        num_items: numItems,
        transaction_id: transactionId
      }, Object.assign({ eventID: transactionId }, options || {}));

      if (fired) {
        try {
          var sStorage = window.sessionStorage;
          if (sStorage) {
            sStorage.setItem(storageKey, 'true');
          }
        } catch (e) {
          // sessionStorage quota exceeded or storage blocked; gracefully ignore
        }
      }

      return fired;
    }
  };

  // Attempt auto-initialization on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPixelIfAllowed);
  } else {
    initPixelIfAllowed();
  }

})(window, document);
