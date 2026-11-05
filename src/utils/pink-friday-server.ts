// src/utils/pink-friday-server.ts
// Server-Side Dynamic Pink Friday Campaign Service & Pricing Engine
// Supports Annual Multi-Year Configurations, Draft vs. Published States, and Automatic Cairo-Time Expiry

export interface PinkFridayOffer {
  productId: string;
  expectedBasePrice: number;
  discountPercentage: number;
  campaignPrice: number;
  active: boolean;
  badgeText?: string;
  allowWithGenericDiscount?: boolean;
}

export interface PinkFridayCollectionItem {
  collectionItemId: string; // Unique ID per item inside collection e.g. 'ci_1'
  productId: string;
  defaultVariantId?: string;
  sortOrder?: number;
}

export interface PinkFridayCollection {
  id: string; // e.g. 'col-1730823421'
  name: string;
  description?: string;
  coverImage?: string;
  allowDuplicates: boolean; // default false
  items: PinkFridayCollectionItem[];
  pricingType: 'package' | 'percentage'; // 'package' = fixed total, 'percentage' = % off
  packagePrice?: number; // when pricingType === 'package'
  discountPercentage?: number; // when pricingType === 'percentage'
  badgeText?: string;
  active: boolean;
  allowWithGenericDiscount?: boolean;
}

export interface PinkFridayVisuals {
  bannerImage?: string;
  bannerPosition?: string; // 'center' | 'top' | 'bottom'
  ctaText?: string;
  badgeText?: string;
}

export interface PinkFridayCampaignData {
  id: string; // e.g. 'pink-friday-2026'
  year: number;
  title: string;
  subtitleAr: string;
  timezone: string; // 'Africa/Cairo'
  startAt: string;  // ISO 8601 with offset
  endAt: string;    // ISO 8601 with offset
  enabled: boolean;
  offers: PinkFridayOffer[];
  collections?: PinkFridayCollection[];
  visuals?: PinkFridayVisuals;
  publishedAt?: string;
  publishedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type CampaignStatus = 'disabled' | 'upcoming' | 'active' | 'ended';

const RTDB_URL = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';

// Official Baseline Campaign for 2026 as mandated
export const INITIAL_2026_CAMPAIGN: PinkFridayCampaignData = {
  id: 'pink-friday-2026',
  year: 2026,
  title: 'Pink Friday',
  subtitleAr: 'استعدّي لتجربة تسوّق استثنائية مع عروض Pink Friday من داندي.',
  timezone: 'Africa/Cairo',
  startAt: '2026-11-06T00:00:00+02:00',
  endAt: '2026-11-30T23:59:59+02:00',
  enabled: true, // Enabled in system, ready for products to be added
  offers: [],
  collections: [],
  visuals: {
    bannerImage: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
    bannerPosition: 'center',
    ctaText: 'اكتشفي العروض',
    badgeText: 'Pink Friday'
  }
};

let cachedPublishedCampaign: PinkFridayCampaignData | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10 * 1000; // 10s memory cache for fast SSR

/**
 * Fetch the currently published campaign from Firebase Realtime Database.
 * Client-facing routes consume this snapshot. Draft edits never leak here.
 */
export async function getPublishedPinkFridayCampaign(forceFresh = false): Promise<PinkFridayCampaignData> {
  const now = Date.now();
  if (!forceFresh && cachedPublishedCampaign && (now - lastCacheTime) < CACHE_TTL_MS) {
    return cachedPublishedCampaign;
  }

  try {
    const res = await fetch(`${RTDB_URL}/settings/pinkFriday/publishedActiveCampaign.json`, {
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && data.id) {
        cachedPublishedCampaign = {
          ...INITIAL_2026_CAMPAIGN,
          ...data,
          offers: Array.isArray(data.offers) ? data.offers : []
        };
        lastCacheTime = now;
        return cachedPublishedCampaign;
      }
    }
  } catch (err) {
    console.warn('[PinkFriday] Could not fetch live published campaign from RTDB:', err);
  }

  // Fallback to initial 2026 baseline if not yet saved in database
  cachedPublishedCampaign = INITIAL_2026_CAMPAIGN;
  lastCacheTime = now;
  return INITIAL_2026_CAMPAIGN;
}

/**
 * Calculate the campaign lifecycle status strictly in Africa/Cairo time.
 */
export function getCampaignStatus(
  campaign: PinkFridayCampaignData = INITIAL_2026_CAMPAIGN,
  now: Date = new Date()
): CampaignStatus {
  if (!campaign || !campaign.enabled) {
    return 'disabled';
  }

  const currentTs = now.getTime();

  if (campaign.startAt) {
    const startTs = Date.parse(campaign.startAt);
    if (!isNaN(startTs) && currentTs < startTs) {
      return 'upcoming';
    }
  }

  if (campaign.endAt) {
    const endTs = Date.parse(campaign.endAt);
    if (!isNaN(endTs) && currentTs > endTs) {
      return 'ended';
    }
  }

  return 'active';
}

export function isCampaignActive(campaign?: PinkFridayCampaignData, now?: Date): boolean {
  return getCampaignStatus(campaign, now) === 'active';
}

export function isCampaignUpcoming(campaign?: PinkFridayCampaignData, now?: Date): boolean {
  return getCampaignStatus(campaign, now) === 'upcoming';
}

export function isCampaignEnded(campaign?: PinkFridayCampaignData, now?: Date): boolean {
  return getCampaignStatus(campaign, now) === 'ended';
}

/**
 * Whether the public website should display Pink Friday marketing elements
 * (requires active/upcoming status AND at least one valid participating offer or collection).
 */
export function shouldDisplayCampaignToCustomers(
  campaign: PinkFridayCampaignData,
  now: Date = new Date()
): boolean {
  const status = getCampaignStatus(campaign, now);
  if (status !== 'active' && status !== 'upcoming') return false;

  const activeOffers = (campaign.offers || []).filter(o => o.active);
  const activeCollections = (campaign.collections || []).filter(c => c.active);
  return activeOffers.length > 0 || activeCollections.length > 0;
}

export interface CollectionValidationResult {
  isValid: boolean;
  reason?: string;
  calculatedPrice?: number;
  totalRegularPrice?: number;
}

/**
 * Strict Collection Validation against authoritative product data and campaign rules.
 */
export function validateCollection(
  collection: PinkFridayCollection | undefined,
  productsMap: Map<string, { id: string; price: number; isHidden?: boolean; isSoldOut?: boolean }>,
  campaign: PinkFridayCampaignData,
  now: Date = new Date()
): CollectionValidationResult {
  if (!campaign.enabled) {
    return { isValid: false, reason: 'CAMPAIGN_DISABLED' };
  }

  const status = getCampaignStatus(campaign, now);
  if (status !== 'active') {
    return { isValid: false, reason: `CAMPAIGN_${status.toUpperCase()}` };
  }

  if (!collection) {
    return { isValid: false, reason: 'COLLECTION_NOT_FOUND' };
  }

  if (!collection.active) {
    return { isValid: false, reason: 'COLLECTION_INACTIVE' };
  }

  if (!Array.isArray(collection.items) || collection.items.length === 0) {
    return { isValid: false, reason: 'EMPTY_COLLECTION' };
  }

  // Check duplicate setting
  if (!collection.allowDuplicates) {
    const productIds = collection.items.map(item => String(item.productId));
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      return { isValid: false, reason: 'DUPLICATE_PRODUCTS_NOT_ALLOWED' };
    }
  }

  let totalRegularPrice = 0;
  for (const item of collection.items) {
    const p = productsMap.get(String(item.productId));
    if (!p) {
      return { isValid: false, reason: `PRODUCT_NOT_FOUND:${item.productId}` };
    }
    if (p.isHidden) {
      return { isValid: false, reason: `PRODUCT_HIDDEN:${item.productId}` };
    }
    if (p.isSoldOut) {
      return { isValid: false, reason: `PRODUCT_SOLD_OUT:${item.productId}` };
    }
    const price = Number(p.price);
    if (isNaN(price) || price <= 0) {
      return { isValid: false, reason: `INVALID_PRODUCT_PRICE:${item.productId}` };
    }
    totalRegularPrice += price;
  }

  let calculatedPrice = 0;
  if (collection.pricingType === 'package') {
    if (typeof collection.packagePrice !== 'number' || collection.packagePrice <= 0 || isNaN(collection.packagePrice)) {
      return { isValid: false, reason: 'INVALID_PACKAGE_PRICE' };
    }
    if (collection.packagePrice >= totalRegularPrice) {
      return { isValid: false, reason: 'PACKAGE_PRICE_NOT_LOWER' };
    }
    calculatedPrice = collection.packagePrice;
  } else if (collection.pricingType === 'percentage') {
    const pct = collection.discountPercentage;
    if (typeof pct !== 'number' || pct <= 0 || pct >= 100 || isNaN(pct)) {
      return { isValid: false, reason: 'INVALID_DISCOUNT_PERCENTAGE' };
    }
    calculatedPrice = Math.round(totalRegularPrice * (1 - pct / 100));
  } else {
    return { isValid: false, reason: 'INVALID_PRICING_TYPE' };
  }

  return {
    isValid: true,
    calculatedPrice,
    totalRegularPrice
  };
}

export interface OfferValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Strict Offer Validation against authoritative product data and campaign rules.
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
  campaign: PinkFridayCampaignData,
  now: Date = new Date()
): OfferValidationResult {
  if (!campaign.enabled) {
    return { isValid: false, reason: 'CAMPAIGN_DISABLED' };
  }

  const status = getCampaignStatus(campaign, now);
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

  // Base price mismatch: if database price changed since offer was configured, flag as mismatch
  if (offer.expectedBasePrice && basePrice !== offer.expectedBasePrice) {
    return { isValid: false, reason: 'PRICE_MISMATCH' };
  }

  if (typeof offer.campaignPrice !== 'number' || isNaN(offer.campaignPrice) || offer.campaignPrice <= 0) {
    return { isValid: false, reason: 'INVALID_CAMPAIGN_PRICE' };
  }

  if (offer.campaignPrice >= basePrice) {
    return { isValid: false, reason: 'CAMPAIGN_PRICE_NOT_LOWER' };
  }

  // Discount percentage sanity check
  if (offer.discountPercentage !== undefined && (offer.discountPercentage <= 0 || offer.discountPercentage >= 100)) {
    return { isValid: false, reason: 'INVALID_DISCOUNT_PERCENTAGE' };
  }

  // Stacking prevention
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
 * Shared calculation engine for pricing a product against a campaign.
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
  campaign: PinkFridayCampaignData,
  now: Date = new Date()
): CampaignPricingResult {
  const regularPrice = Number(product.price) || 0;

  if (!campaign || !campaign.enabled) {
    return {
      isEligible: false,
      regularPrice,
      campaignPrice: regularPrice,
      discountAmount: 0,
      discountPercentage: 0,
      reason: 'CAMPAIGN_DISABLED'
    };
  }

  const cleanId = String(product.id).split('::')[0];
  const offer = (campaign.offers || []).find(o => String(o.productId) === cleanId);
  const validation = validateOffer(offer, product, campaign, now);

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
  const discountPercentage = offer.discountPercentage || Math.round((discountAmount / regularPrice) * 100);

  return {
    isEligible: true,
    regularPrice,
    campaignPrice: offer.campaignPrice,
    discountAmount,
    discountPercentage,
    offer
  };
}
