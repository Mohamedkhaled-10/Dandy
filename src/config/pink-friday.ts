// src/config/pink-friday.ts
// Centralized Single Source of Truth for the Dandy Cosmetics Pink Friday Campaign

export interface PinkFridayOffer {
  productId: string;
  expectedBasePrice: number;
  campaignPrice: number;
  active: boolean;
  badgeText?: string;
  allowWithGenericDiscount?: boolean;
}

export interface PinkFridayConfig {
  enabled: boolean;
  campaignId: string;
  title: string;
  subtitleAr: string;
  timezone: string;
  startAt: string | null; // ISO 8601 with offset, e.g. "2026-11-20T00:00:00+02:00"
  endAt: string | null;   // ISO 8601 with offset, e.g. "2026-11-30T23:59:59+02:00"
  offers: PinkFridayOffer[];
}

export type CampaignStatus = 'disabled' | 'upcoming' | 'active' | 'ended';

/**
 * Single Authoritative Pink Friday Configuration.
 * Defaults to enabled: false and empty offers until real, approved campaign parameters are entered.
 */
export const PINK_FRIDAY_CONFIG: PinkFridayConfig = {
  enabled: false,
  campaignId: 'pink-friday',
  title: 'Pink Friday',
  subtitleAr: 'استعدّي لتجربة تسوّق استثنائية مع عروض Pink Friday من داندي.',
  timezone: 'Africa/Cairo',
  startAt: null,
  endAt: null,
  offers: [
    /*
      Real, approved offers only.
      Example schema:
      {
        productId: '-OW9U9Af024A9LrbOU4f',
        expectedBasePrice: 500,
        campaignPrice: 425,
        active: true,
        badgeText: 'عرض Pink Friday'
      }
    */
  ]
};

/**
 * Determine the current lifecycle state of the campaign.
 */
export function getCampaignStatus(
  config: PinkFridayConfig = PINK_FRIDAY_CONFIG,
  now: Date = new Date()
): CampaignStatus {
  if (!config.enabled) {
    return 'disabled';
  }

  const currentTs = now.getTime();

  // If startAt is specified and we haven't reached it yet
  if (config.startAt) {
    const startTs = Date.parse(config.startAt);
    if (!isNaN(startTs) && currentTs < startTs) {
      return 'upcoming';
    }
  }

  // If endAt is specified and we have passed it
  if (config.endAt) {
    const endTs = Date.parse(config.endAt);
    if (!isNaN(endTs) && currentTs > endTs) {
      return 'ended';
    }
  }

  // If enabled and either no window is set or we are inside [startAt, endAt]
  return 'active';
}

export function isCampaignActive(
  config: PinkFridayConfig = PINK_FRIDAY_CONFIG,
  now: Date = new Date()
): boolean {
  return getCampaignStatus(config, now) === 'active';
}

export function isCampaignUpcoming(
  config: PinkFridayConfig = PINK_FRIDAY_CONFIG,
  now: Date = new Date()
): boolean {
  return getCampaignStatus(config, now) === 'upcoming';
}

export function isCampaignEnded(
  config: PinkFridayConfig = PINK_FRIDAY_CONFIG,
  now: Date = new Date()
): boolean {
  return getCampaignStatus(config, now) === 'ended';
}

export interface OfferValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validate a campaign offer against current authoritative product data and campaign rules.
 */
export function validateOffer(
  offer: PinkFridayOffer | undefined,
  actualProduct: {
    id: string;
    price: number;
    isHidden?: boolean;
    isSoldOut?: boolean;
    onSale?: boolean;
    discount?: any;
  },
  config: PinkFridayConfig = PINK_FRIDAY_CONFIG,
  now: Date = new Date()
): OfferValidationResult {
  if (!config.enabled) {
    return { isValid: false, reason: 'CAMPAIGN_DISABLED' };
  }

  const status = getCampaignStatus(config, now);
  if (status !== 'active') {
    return { isValid: false, reason: `CAMPAIGN_${status.toUpperCase()}` };
  }

  if (!offer) {
    return { isValid: false, reason: 'OFFER_NOT_FOUND' };
  }

  if (!offer.active) {
    return { isValid: false, reason: 'OFFER_INACTIVE' };
  }

  if (!offer.productId || String(offer.productId).trim() === '') {
    return { isValid: false, reason: 'INVALID_PRODUCT_ID' };
  }

  if (actualProduct.isHidden) {
    return { isValid: false, reason: 'PRODUCT_HIDDEN' };
  }

  if (actualProduct.isSoldOut) {
    return { isValid: false, reason: 'PRODUCT_SOLD_OUT' };
  }

  const basePrice = Number(actualProduct.price);
  if (isNaN(basePrice) || basePrice <= 0) {
    return { isValid: false, reason: 'INVALID_BASE_PRICE' };
  }

  // Prevent charging an outdated campaign price if database price no longer matches expectedBasePrice
  if (basePrice !== offer.expectedBasePrice) {
    return { isValid: false, reason: 'PRICE_MISMATCH' };
  }

  if (typeof offer.campaignPrice !== 'number' || isNaN(offer.campaignPrice) || offer.campaignPrice <= 0) {
    return { isValid: false, reason: 'INVALID_CAMPAIGN_PRICE' };
  }

  if (offer.campaignPrice >= basePrice) {
    return { isValid: false, reason: 'CAMPAIGN_PRICE_NOT_LOWER' };
  }

  // No stacking: If product already has a generic promotional price and offer does not allow it
  if (actualProduct.onSale && actualProduct.discount && !offer.allowWithGenericDiscount) {
    return { isValid: false, reason: 'DISCOUNT_STACKING_DISALLOWED' };
  }

  return { isValid: true };
}

export interface CampaignPricingResult {
  isEligible: boolean;
  regularPrice: number;
  campaignPrice: number;
  discountAmount: number;
  discountPercentage: number;
  offer?: PinkFridayOffer;
  reason?: string;
}

/**
 * Shared campaign pricing engine for a given product.
 */
export function calculatePinkFridayPricing(
  product: {
    id: string;
    price: number;
    isHidden?: boolean;
    isSoldOut?: boolean;
    onSale?: boolean;
    discount?: any;
  },
  config: PinkFridayConfig = PINK_FRIDAY_CONFIG,
  now: Date = new Date()
): CampaignPricingResult {
  const regularPrice = Number(product.price) || 0;

  if (!config.enabled) {
    return {
      isEligible: false,
      regularPrice,
      campaignPrice: regularPrice,
      discountAmount: 0,
      discountPercentage: 0,
      reason: 'CAMPAIGN_DISABLED'
    };
  }

  const offer = config.offers.find(o => String(o.productId) === String(product.id));
  const validation = validateOffer(offer, product, config, now);

  if (!validation.isValid || !offer) {
    return {
      isEligible: false,
      regularPrice,
      campaignPrice: regularPrice,
      discountAmount: 0,
      discountPercentage: 0,
      reason: validation.reason
    };
  }

  const discountAmount = regularPrice - offer.campaignPrice;
  const discountPercentage = Math.round((discountAmount / regularPrice) * 100);

  return {
    isEligible: true,
    regularPrice,
    campaignPrice: offer.campaignPrice,
    discountAmount,
    discountPercentage,
    offer
  };
}
