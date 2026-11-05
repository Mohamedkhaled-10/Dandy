// public/assets/js/pink-friday.js
// Client-side Pink Friday Campaign Bridge for Dandy Cosmetics

(function(window) {
  'use strict';

  // Read config from server injection if present, else fallback to safe defaults
  const serverConfig = window.__PINK_FRIDAY_CONFIG || {};

  const config = {
    enabled: typeof serverConfig.enabled === 'boolean' ? serverConfig.enabled : false,
    campaignId: serverConfig.campaignId || 'pink-friday',
    title: serverConfig.title || 'Pink Friday',
    subtitleAr: serverConfig.subtitleAr || 'استعدّي لتجربة تسوّق استثنائية مع عروض Pink Friday من داندي.',
    timezone: serverConfig.timezone || 'Africa/Cairo',
    startAt: serverConfig.startAt || null,
    endAt: serverConfig.endAt || null,
    offers: Array.isArray(serverConfig.offers) ? serverConfig.offers : []
  };

  function getStatus(now) {
    if (!config.enabled) return 'disabled';
    const currentTime = (now || new Date()).getTime();

    if (config.startAt) {
      const start = Date.parse(config.startAt);
      if (!isNaN(start) && currentTime < start) return 'upcoming';
    }

    if (config.endAt) {
      const end = Date.parse(config.endAt);
      if (!isNaN(end) && currentTime > end) return 'ended';
    }

    return 'active';
  }

  function isActive(now) {
    return getStatus(now) === 'active';
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
    getOfferForProduct: getOfferForProduct,
    getPricing: getPricing
  };

})(typeof window !== 'undefined' ? window : globalThis);
