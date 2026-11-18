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
  heroImageUrl?: string;
  bannerPosition?: string; // 'center' | 'top' | 'bottom'
  headline?: string;
  subtitle?: string;
  ctaText?: string;
  badgeText?: string;
}

export interface PinkFridayEnglishVisualOverlay {
  title?: string;
  headline?: string;
  subtitle?: string;
  ctaText?: string;
  badgeText?: string;
  heroImageOverride?: string;
  collectionTextOverrides?: Record<
    string,
    {
      name?: string;
      description?: string;
      badgeText?: string;
    }
  >;
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
  i18n?: {
    en?: PinkFridayEnglishVisualOverlay;
  };
  unpublished?: boolean;
  unpublishedAt?: string;
  unpublishedBy?: string;
  publishedAt?: string;
  publishedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type PinkFridayCampaign = PinkFridayCampaignData;

export type CampaignStatus = 'disabled' | 'upcoming' | 'active' | 'ended';

export type PinkFridayStateDecision =
  | 'disabled'
  | 'unpublished'
  | 'upcoming'
  | 'ended'
  | 'active-full'
  | 'active-offers-only'
  | 'active-bundles-only'
  | 'active-empty'
  | 'invalid';

export interface PinkFridayEvaluationResult {
  decision: PinkFridayStateDecision;
  status: CampaignStatus;
  shouldDisplay: boolean;
  isPricingActive: boolean;
  validOfferCount: number;
  validCollectionCount: number;
  reason: string;
}

const RTDB_URL = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';

// Official Baseline Campaign for 2026 — Fail-closed by default until explicitly enabled & published
export const INITIAL_2026_CAMPAIGN: PinkFridayCampaignData = {
  id: 'pink-friday-2026',
  year: 2026,
  title: 'Pink Friday',
  subtitleAr: 'استعدّي لتجربة تسوّق استثنائية مع عروض Pink Friday من داندي.',
  timezone: 'Africa/Cairo',
  startAt: '2026-11-06T00:00:00+02:00',
  endAt: '2026-11-30T23:59:59+02:00',
  enabled: false,
  offers: [],
  collections: [],
  visuals: {
    bannerImage: '/assets/images/index-products/product-2.jpg',
    heroImageUrl: '/assets/images/index-products/product-2.jpg',
    bannerPosition: 'center',
    ctaText: 'اكتشفي العروض',
    badgeText: 'Pink Friday'
  }
};

export function createFailClosedCampaign(): PinkFridayCampaignData {
  return {
    ...INITIAL_2026_CAMPAIGN,
    enabled: false,
    unpublished: true,
    offers: [],
    collections: [],
    visuals: { ...INITIAL_2026_CAMPAIGN.visuals }
  };
}

let cachedPublishedCampaign: PinkFridayCampaignData | null = null;
let lastCacheTime = 0;

export function invalidatePinkFridayCache(): void {
  cachedPublishedCampaign = null;
  lastCacheTime = 0;
}

export function isOfferFlagActive(offer: { active?: unknown } | null | undefined): boolean {
  if (!offer) return false;
  if (offer.active === false || offer.active === 'false' || offer.active === 0 || offer.active === null) {
    return false;
  }
  return offer.active === true || offer.active === undefined;
}

export function isCollectionFlagActive(col: { active?: unknown } | null | undefined): boolean {
  if (!col) return false;
  if (col.active === false || col.active === 'false' || col.active === 0 || col.active === null) {
    return false;
  }
  return col.active === true || col.active === undefined;
}

/**
 * Fetch the currently published campaign from Firebase Realtime Database.
 * Client-facing routes consume this snapshot. Draft edits never leak here.
 * Always fetches fresh from RTDB so admin disable/unpublish applies immediately,
 * and fails CLOSED (disabled: true, empty offers/collections) when RTDB has no published record.
 */
export async function getPublishedPinkFridayCampaign(forceFresh = false): Promise<PinkFridayCampaignData> {
  const now = Date.now();
  if (!forceFresh && cachedPublishedCampaign && now - lastCacheTime < 1500) {
    return cachedPublishedCampaign;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`${RTDB_URL}/settings/pinkFriday/publishedActiveCampaign.json`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      const data = await res.json();
      if (!data || typeof data !== 'object' || (!data.id && !data.year)) {
        const failClosed = createFailClosedCampaign();
        cachedPublishedCampaign = failClosed;
        lastCacheTime = now;
        return failClosed;
      }

      const rawOffers = data.offers;
      const normalizedOffers = Array.isArray(rawOffers)
        ? rawOffers
        : (rawOffers && typeof rawOffers === 'object' ? Object.values(rawOffers) : []);

      const rawCollections = data.collections;
      const collectionsList = Array.isArray(rawCollections)
        ? rawCollections
        : (rawCollections && typeof rawCollections === 'object' ? Object.values(rawCollections) : []);

      const normalizedCollections = collectionsList.filter(Boolean).map((col: any) => ({
        ...col,
        allowDuplicates: Boolean(col.allowDuplicates),
        active: isCollectionFlagActive(col),
        items: Array.isArray(col.items)
          ? col.items
          : (col.items && typeof col.items === 'object' ? Object.values(col.items) : [])
      }));

      cachedPublishedCampaign = {
        ...INITIAL_2026_CAMPAIGN,
        ...data,
        enabled: data.enabled === true,
        id: data.id || `pink-friday-${data.year || 2026}`,
        startAt: data.startAt || data.startDate || INITIAL_2026_CAMPAIGN.startAt,
        endAt: data.endAt || data.endDate || INITIAL_2026_CAMPAIGN.endAt,
        offers: normalizedOffers,
        collections: normalizedCollections
      };
      lastCacheTime = now;
      return cachedPublishedCampaign;
    }
  } catch (err) {
    console.warn('[PinkFriday] Could not fetch live published campaign from RTDB:', err);
  }

  if (cachedPublishedCampaign && !forceFresh) {
    return cachedPublishedCampaign;
  }

  const failClosed = createFailClosedCampaign();
  cachedPublishedCampaign = failClosed;
  lastCacheTime = now;
  return failClosed;
}

/**
 * Calculate the campaign lifecycle status strictly in Africa/Cairo time.
 */
export function getCampaignStatus(
  campaign: PinkFridayCampaignData | null | undefined = INITIAL_2026_CAMPAIGN,
  now: Date = new Date()
): CampaignStatus {
  if (!campaign || campaign.enabled !== true || campaign.unpublished === true) {
    return 'disabled';
  }

  const currentTs = now.getTime();
  const startAt = campaign.startAt || (campaign as any).startDate;
  const endAt = campaign.endAt || (campaign as any).endDate;

  if (startAt) {
    const startTs = Date.parse(startAt);
    if (!isNaN(startTs) && currentTs < startTs) {
      return 'upcoming';
    }
  }

  if (endAt) {
    const endTs = Date.parse(endAt);
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
 * Unified authoritative 8-state Pink Friday decision gate used across all customer placements.
 */
export function evaluatePinkFridayState(
  campaign: PinkFridayCampaignData | null | undefined,
  now: Date = new Date()
): PinkFridayEvaluationResult {
  if (!campaign || typeof campaign !== 'object') {
    return {
      decision: 'invalid',
      status: 'disabled',
      shouldDisplay: false,
      isPricingActive: false,
      validOfferCount: 0,
      validCollectionCount: 0,
      reason: 'CAMPAIGN_MISSING',
    };
  }

  if (campaign.unpublished === true) {
    return {
      decision: 'unpublished',
      status: 'disabled',
      shouldDisplay: false,
      isPricingActive: false,
      validOfferCount: 0,
      validCollectionCount: 0,
      reason: 'CAMPAIGN_UNPUBLISHED',
    };
  }

  if (campaign.enabled !== true) {
    return {
      decision: 'disabled',
      status: 'disabled',
      shouldDisplay: false,
      isPricingActive: false,
      validOfferCount: 0,
      validCollectionCount: 0,
      reason: 'CAMPAIGN_DISABLED',
    };
  }

  const startAt = campaign.startAt || (campaign as any).startDate;
  const endAt = campaign.endAt || (campaign as any).endDate;
  const startTs = startAt ? Date.parse(startAt) : NaN;
  const endTs = endAt ? Date.parse(endAt) : NaN;

  if (!isNaN(startTs) && !isNaN(endTs) && endTs <= startTs) {
    return {
      decision: 'invalid',
      status: 'disabled',
      shouldDisplay: false,
      isPricingActive: false,
      validOfferCount: 0,
      validCollectionCount: 0,
      reason: 'INVALID_CAMPAIGN_DATES',
    };
  }

  const status = getCampaignStatus(campaign, now);

  const rawOffers = campaign.offers;
  const offersList = Array.isArray(rawOffers)
    ? rawOffers
    : (rawOffers && typeof rawOffers === 'object' ? Object.values(rawOffers) : []);
  const activeOffers = offersList.filter((o) => isOfferFlagActive(o) && Boolean(o?.productId));

  const rawCollections = campaign.collections;
  const collectionsList = Array.isArray(rawCollections)
    ? rawCollections
    : (rawCollections && typeof rawCollections === 'object' ? Object.values(rawCollections) : []);
  const activeCollections = collectionsList.filter((c) => {
    if (!isCollectionFlagActive(c)) return false;
    const items = Array.isArray(c.items)
      ? c.items
      : (c.items && typeof c.items === 'object' ? Object.values(c.items) : []);
    return items.length > 0;
  });

  if (status === 'upcoming') {
    const hasItems = activeOffers.length > 0 || activeCollections.length > 0;
    return {
      decision: hasItems ? 'upcoming' : 'active-empty',
      status,
      shouldDisplay: hasItems,
      isPricingActive: false,
      validOfferCount: activeOffers.length,
      validCollectionCount: activeCollections.length,
      reason: hasItems ? 'CAMPAIGN_UPCOMING' : 'NO_ELIGIBLE_ITEMS',
    };
  }

  if (status === 'ended') {
    return {
      decision: 'ended',
      status,
      shouldDisplay: false,
      isPricingActive: false,
      validOfferCount: activeOffers.length,
      validCollectionCount: activeCollections.length,
      reason: 'CAMPAIGN_ENDED',
    };
  }

  if (activeOffers.length > 0 && activeCollections.length > 0) {
    return {
      decision: 'active-full',
      status: 'active',
      shouldDisplay: true,
      isPricingActive: true,
      validOfferCount: activeOffers.length,
      validCollectionCount: activeCollections.length,
      reason: 'ACTIVE_FULL',
    };
  }

  if (activeOffers.length > 0) {
    return {
      decision: 'active-offers-only',
      status: 'active',
      shouldDisplay: true,
      isPricingActive: true,
      validOfferCount: activeOffers.length,
      validCollectionCount: 0,
      reason: 'ACTIVE_OFFERS_ONLY',
    };
  }

  if (activeCollections.length > 0) {
    return {
      decision: 'active-bundles-only',
      status: 'active',
      shouldDisplay: true,
      isPricingActive: true,
      validOfferCount: 0,
      validCollectionCount: activeCollections.length,
      reason: 'ACTIVE_BUNDLES_ONLY',
    };
  }

  return {
    decision: 'active-empty',
    status: 'active',
    shouldDisplay: false,
    isPricingActive: false,
    validOfferCount: 0,
    validCollectionCount: 0,
    reason: 'NO_ELIGIBLE_ITEMS',
  };
}

/**
 * Whether the public website should display Pink Friday marketing elements.
 */
export function shouldDisplayCampaignToCustomers(
  campaign: PinkFridayCampaignData | null | undefined,
  now: Date = new Date()
): boolean {
  return evaluatePinkFridayState(campaign, now).shouldDisplay;
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
  if (!campaign || campaign.enabled !== true || campaign.unpublished === true) {
    return { isValid: false, reason: 'CAMPAIGN_DISABLED' };
  }

  const status = getCampaignStatus(campaign, now);
  if (status !== 'active') {
    return { isValid: false, reason: `CAMPAIGN_${status.toUpperCase()}` };
  }

  if (!collection) {
    return { isValid: false, reason: 'COLLECTION_NOT_FOUND' };
  }

  if (!isCollectionFlagActive(collection)) {
    return { isValid: false, reason: 'COLLECTION_INACTIVE' };
  }

  const items = Array.isArray(collection.items)
    ? collection.items
    : (collection.items && typeof collection.items === 'object' ? Object.values(collection.items) : []);

  if (items.length === 0) {
    return { isValid: false, reason: 'EMPTY_COLLECTION' };
  }

  // Check duplicate setting
  if (!collection.allowDuplicates) {
    const productIds = items.map((item: any) => String(item.productId));
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      return { isValid: false, reason: 'DUPLICATE_PRODUCTS_NOT_ALLOWED' };
    }
  }

  let totalRegularPrice = 0;
  for (const item of items) {
    const p = productsMap.get(String((item as any).productId));
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
  if (!campaign || campaign.enabled !== true || campaign.unpublished === true) {
    return { isValid: false, reason: 'CAMPAIGN_DISABLED' };
  }

  const status = getCampaignStatus(campaign, now);
  if (status !== 'active') {
    return { isValid: false, reason: `CAMPAIGN_${status.toUpperCase()}` };
  }

  if (!offer) {
    return { isValid: false, reason: 'OFFER_NOT_FOUND' };
  }

  if (!isOfferFlagActive(offer)) {
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

  if (!campaign || campaign.enabled !== true || campaign.unpublished === true) {
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
  const rawOffers = campaign.offers;
  const offersList = Array.isArray(rawOffers)
    ? rawOffers
    : (rawOffers && typeof rawOffers === 'object' ? Object.values(rawOffers) : []);
  const offer = offersList.find(o => o && String(o.productId) === cleanId);
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
