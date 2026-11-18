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
    enabled: serverConfig.enabled === true && serverConfig.unpublished !== true,
    unpublished: serverConfig.unpublished === true,
    campaignId: serverConfig.campaignId || serverConfig.id || 'pink-friday',
    title: serverConfig.title || 'Pink Friday',
    subtitleAr: serverConfig.subtitleAr || 'استعدّي لتجربة تسوّق استثنائية مع عروض Pink Friday من داندي.',
    timezone: serverConfig.timezone || 'Africa/Cairo',
    startAt: serverConfig.startAt || serverConfig.startDate || null,
    endAt: serverConfig.endAt || serverConfig.endDate || null,
    offers: rawOffers,
    collections: rawCollections
  };

  function isFlagActive(item) {
    if (!item) return false;
    if (item.active === false || item.active === 'false' || item.active === 0 || item.active === null) {
      return false;
    }
    return item.active === true || item.active === undefined;
  }

  function getStatus(now) {
    if (config.enabled !== true || config.unpublished === true) return 'disabled';
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
    return config.enabled === true && config.unpublished !== true && getStatus(now) === 'active';
  }

  function hasValidCampaign() {
    if (!isActive()) return false;
    const activeOffers = config.offers.filter(function(o) {
      return isFlagActive(o) && Boolean(o.productId) && Number(o.campaignPrice) > 0;
    });
    const activeCollections = config.collections.filter(function(c) {
      if (!isFlagActive(c)) return false;
      var items = Array.isArray(c.items) ? c.items : (c.items && typeof c.items === 'object' ? Object.values(c.items) : []);
      return items.length > 0;
    });
    return activeOffers.length > 0 || activeCollections.length > 0;
  }

  function getCollections() {
    if (!isActive()) return [];
    return config.collections.filter(function(c) {
      if (!isFlagActive(c)) return false;
      var items = Array.isArray(c.items) ? c.items : (c.items && typeof c.items === 'object' ? Object.values(c.items) : []);
      return items.length > 0;
    });
  }

  function getCollectionById(id) {
    if (!isActive() || !id) return null;
    return getCollections().find(function(c) {
      return String(c.id) === String(id);
    }) || null;
  }

  function getOfferForProduct(productId) {
    if (!isActive()) return null;
    if (!productId) return null;
    const cleanId = String(productId).split('::')[0];
    return config.offers.find(function(o) {
      return isFlagActive(o) && String(o.productId) === cleanId;
    }) || null;
  }

  function getPricing(product) {
    if (!product) return { isEligible: false, regularPrice: 0, campaignPrice: 0, savings: 0, discountPercentage: 0 };
    const basePrice = Number(product.price) || 0;
    if (product.isHidden || product.isSoldOut || basePrice <= 0) {
      return {
        isEligible: false,
        regularPrice: basePrice,
        campaignPrice: basePrice,
        savings: 0,
        discountPercentage: 0
      };
    }

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

    if (product.onSale && product.discount && !offer.allowWithGenericDiscount) {
      return {
        isEligible: false,
        regularPrice: basePrice,
        campaignPrice: basePrice,
        savings: 0,
        discountPercentage: 0,
        stackingBlocked: true
      };
    }

    // Check price mismatch with expectedBasePrice
    if (offer.expectedBasePrice && basePrice !== Number(offer.expectedBasePrice)) {
      return {
        isEligible: false,
        regularPrice: basePrice,
        campaignPrice: basePrice,
        savings: 0,
        discountPercentage: 0,
        mismatch: true
      };
    }

    const campaignPrice = Number(offer.campaignPrice) || 0;
    if (campaignPrice <= 0 || campaignPrice >= basePrice) {
      return {
        isEligible: false,
        regularPrice: basePrice,
        campaignPrice: basePrice,
        savings: 0,
        discountPercentage: 0
      };
    }

    const savings = Math.max(0, basePrice - campaignPrice);
    const discountPercentage = offer.discountPercentage
      ? Number(offer.discountPercentage)
      : (basePrice > 0 ? Math.round((savings / basePrice) * 100) : 0);

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
