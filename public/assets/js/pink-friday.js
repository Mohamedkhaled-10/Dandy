// public/assets/js/pink-friday.js
// Client-side Pink Friday Campaign Bridge for Dandy Cosmetics

(function(window) {
  'use strict';

  // Read config from server injection if present, else fallback to safe defaults
  const serverConfig = window.__PINK_FRIDAY_CONFIG || {};

  const rawOffers = Array.isArray(serverConfig.offers)
    ? serverConfig.offers
    : (serverConfig.offers && typeof serverConfig.offers === 'object' ? Object.values(serverConfig.offers) : []);

  const rawCollections = Array.isArray(serverConfig.collections)
    ? serverConfig.collections
    : (serverConfig.collections && typeof serverConfig.collections === 'object' ? Object.values(serverConfig.collections) : []);

  const config = {
    enabled: typeof serverConfig.enabled === 'boolean' ? serverConfig.enabled : false,
    campaignId: serverConfig.campaignId || serverConfig.id || 'pink-friday',
    title: serverConfig.title || 'Pink Friday',
    subtitleAr: serverConfig.subtitleAr || 'استعدّي لتجربة تسوّق استثنائية مع عروض Pink Friday من داندي.',
    timezone: serverConfig.timezone || 'Africa/Cairo',
    startAt: serverConfig.startAt || serverConfig.startDate || null,
    endAt: serverConfig.endAt || serverConfig.endDate || null,
    offers: rawOffers,
    collections: rawCollections
  };

  function parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return NaN;
    var s = dateStr.trim();
    if (!s) return NaN;
    if (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) {
      return Date.parse(s);
    }
    var normalized = s.length === 16 ? s + ':00+02:00' : s + '+02:00';
    var ts = Date.parse(normalized);
    if (!isNaN(ts)) return ts;
    return Date.parse(s);
  }

  function getStatus(now) {
    if (!config.enabled) return 'disabled';
    const currentTime = (now || new Date()).getTime();

    if (config.startAt) {
      const start = parseDate(config.startAt);
      if (!isNaN(start) && currentTime < start) return 'upcoming';
    }

    if (config.endAt) {
      const end = parseDate(config.endAt);
      if (!isNaN(end) && currentTime > end) return 'ended';
    }

    return 'active';
  }

  function isActive(now) {
    return getStatus(now) === 'active';
  }

  function hasValidCampaign() {
    if (!config.enabled || !isActive()) return false;
    const activeOffers = config.offers.filter(function(o) { return o && o.active !== false && o.productId; });
    const activeCollections = config.collections.filter(function(c) {
      if (!c || c.active === false) return false;
      var items = Array.isArray(c.items) ? c.items : (c.items && typeof c.items === 'object' ? Object.values(c.items) : []);
      return items.length > 0;
    });
    return activeOffers.length > 0 || activeCollections.length > 0;
  }

  function getCollections() {
    if (!config.enabled || !isActive()) return [];
    return config.collections.filter(function(c) {
      return c && c.active !== false;
    });
  }

  function getCollectionById(id) {
    if (!config.enabled || !isActive() || !id) return null;
    return config.collections.find(function(c) {
      return c && String(c.id) === String(id) && c.active !== false;
    }) || null;
  }

  function getOfferForProduct(productId) {
    if (!config.enabled || !isActive()) return null;
    if (!productId) return null;
    const cleanId = String(productId).split('::')[0];
    return config.offers.find(function(o) {
      return String(o.productId) === cleanId && o.active;
    }) || null;
  }

  function getPricing(product) {
    if (!product) return { isEligible: false, price: 0 };
    const basePrice = Number(product.price) || 0;
    const offer = getOfferForProduct(product.id || product.productId);

    if (!offer) {
      return {
        isEligible: false,
        regularPrice: basePrice,
        campaignPrice: basePrice,
        savings: 0,
        discountPercentage: 0
      };
    }

    // Check price mismatch with expectedBasePrice
    if (offer.expectedBasePrice && basePrice !== offer.expectedBasePrice) {
      return {
        isEligible: false,
        regularPrice: basePrice,
        campaignPrice: basePrice,
        savings: 0,
        discountPercentage: 0,
        mismatch: true
      };
    }

    const campaignPrice = Number(offer.campaignPrice) || basePrice;
    const savings = Math.max(0, basePrice - campaignPrice);
    const discountPercentage = basePrice > 0 ? Math.round((savings / basePrice) * 100) : 0;

    return {
      isEligible: true,
      regularPrice: basePrice,
      campaignPrice: campaignPrice,
      savings: savings,
      discountPercentage: discountPercentage,
      badgeText: offer.badgeText || 'Pink Friday'
    };
  }

  // Expose on window
  window.DandyPinkFriday = {
    config: config,
    getStatus: getStatus,
    isActive: isActive,
    hasValidCampaign: hasValidCampaign,
    getCollections: getCollections,
    getCollectionById: getCollectionById,
    getOfferForProduct: getOfferForProduct,
    getPricing: getPricing
  };

})(typeof window !== 'undefined' ? window : globalThis);
