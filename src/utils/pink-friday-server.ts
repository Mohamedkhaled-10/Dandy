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

export type PinkFridayCampaign = PinkFridayCampaignData;

export type CampaignStatus = 'disabled' | 'upcoming' | 'active' | 'ended';

import { getAdminDb } from './firebase-admin.ts';

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

export function resetPinkFridayCampaignCacheForTests(): void {
  cachedPublishedCampaign = null;
  lastCacheTime = 0;
}

/**
 * Strips any admin/draft/internal metadata (draft, meta, updatedBy, publishedBy, updatedAt)
 * and keeps strictly the fields needed for public campaign display and server pricing.
 */
export function sanitizePublishedPinkFridayCampaign(rawData: any): PinkFridayCampaignData {
  if (!rawData || typeof rawData !== 'object' || (!rawData.id && !rawData.year)) {
    return {
      ...INITIAL_2026_CAMPAIGN,
      offers: [...INITIAL_2026_CAMPAIGN.offers],
      collections: [...(INITIAL_2026_CAMPAIGN.collections || [])],
      visuals: { ...INITIAL_2026_CAMPAIGN.visuals }
    };
  }

  const rawOffers = rawData.offers;
  const offersList = Array.isArray(rawOffers)
    ? rawOffers
    : (rawOffers && typeof rawOffers === 'object' ? Object.values(rawOffers) : []);

  const sanitizedOffers: PinkFridayOffer[] = offersList
    .filter((o: any) => o && typeof o === 'object' && o.productId)
    .map((o: any) => ({
      productId: String(o.productId),
      expectedBasePrice: Number(o.expectedBasePrice) || 0,
      discountPercentage: Number(o.discountPercentage) || 0,
      campaignPrice: Number(o.campaignPrice) || 0,
      active: o.active !== false,
      ...(typeof o.badgeText === 'string' ? { badgeText: o.badgeText } : {}),
      ...(o.allowWithGenericDiscount !== undefined
        ? { allowWithGenericDiscount: Boolean(o.allowWithGenericDiscount) }
        : {})
    }));

  const rawCollections = rawData.collections;
  const collectionsList = Array.isArray(rawCollections)
    ? rawCollections
    : (rawCollections && typeof rawCollections === 'object' ? Object.values(rawCollections) : []);

  const sanitizedCollections: PinkFridayCollection[] = collectionsList
    .filter((c: any) => c && typeof c === 'object')
    .map((col: any) => {
      const rawItems = col.items;
      const itemsList = Array.isArray(rawItems)
        ? rawItems
        : (rawItems && typeof rawItems === 'object' ? Object.values(rawItems) : []);

      return {
        id: String(col.id || ''),
        name: typeof col.name === 'string' ? col.name : '',
        description: typeof col.description === 'string' ? col.description : '',
        coverImage: typeof col.coverImage === 'string' ? col.coverImage : '',
        allowDuplicates: Boolean(col.allowDuplicates),
        items: itemsList
          .filter((it: any) => it && typeof it === 'object')
          .map((it: any) => ({
            collectionItemId: String(it.collectionItemId || ''),
            productId: String(it.productId || ''),
            ...(typeof it.defaultVariantId === 'string' ? { defaultVariantId: it.defaultVariantId } : {}),
            ...(it.sortOrder !== undefined ? { sortOrder: Number(it.sortOrder) } : {})
          })),
        pricingType: col.pricingType === 'percentage' ? 'percentage' : 'package',
        ...(col.packagePrice !== undefined ? { packagePrice: Number(col.packagePrice) } : {}),
        ...(col.discountPercentage !== undefined ? { discountPercentage: Number(col.discountPercentage) } : {}),
        ...(typeof col.badgeText === 'string' ? { badgeText: col.badgeText } : {}),
        active: col.active !== false,
        ...(col.allowWithGenericDiscount !== undefined
          ? { allowWithGenericDiscount: Boolean(col.allowWithGenericDiscount) }
          : {})
      };
    });

  const rawVisuals = rawData.visuals && typeof rawData.visuals === 'object' ? rawData.visuals : {};
  const sanitizedVisuals: PinkFridayVisuals = {
    ...(INITIAL_2026_CAMPAIGN.visuals || {}),
    ...(typeof rawVisuals.bannerImage === 'string' ? { bannerImage: rawVisuals.bannerImage } : {}),
    ...(typeof rawVisuals.bannerPosition === 'string' ? { bannerPosition: rawVisuals.bannerPosition } : {}),
    ...(typeof rawVisuals.ctaText === 'string' ? { ctaText: rawVisuals.ctaText } : {}),
    ...(typeof rawVisuals.badgeText === 'string' ? { badgeText: rawVisuals.badgeText } : {}),
    ...(typeof (rawVisuals as any).headline === 'string' ? { headline: (rawVisuals as any).headline } : {})
  };

  const resolvedYear = Number(rawData.year) || INITIAL_2026_CAMPAIGN.year;

  return {
    id: typeof rawData.id === 'string' && rawData.id.trim() ? rawData.id : `pink-friday-${resolvedYear}`,
    year: resolvedYear,
    title: typeof rawData.title === 'string' && rawData.title.trim() ? rawData.title : INITIAL_2026_CAMPAIGN.title,
    subtitleAr:
      typeof rawData.subtitleAr === 'string' && rawData.subtitleAr.trim()
        ? rawData.subtitleAr
        : INITIAL_2026_CAMPAIGN.subtitleAr,
    timezone:
      typeof rawData.timezone === 'string' && rawData.timezone.trim()
        ? rawData.timezone
        : INITIAL_2026_CAMPAIGN.timezone,
    startAt: rawData.startAt || rawData.startDate || INITIAL_2026_CAMPAIGN.startAt,
    endAt: rawData.endAt || rawData.endDate || INITIAL_2026_CAMPAIGN.endAt,
    enabled: typeof rawData.enabled === 'boolean' ? rawData.enabled : INITIAL_2026_CAMPAIGN.enabled,
    offers: sanitizedOffers,
    collections: sanitizedCollections,
    visuals: sanitizedVisuals
  };
}

/**
 * Fetch the currently published campaign strictly via Firebase Admin SDK (server-only).
 * Never reads settings via unauthenticated REST and never exposes draft, meta, or admin emails.
 */
export async function getPublishedPinkFridayCampaign(
  forceFresh = false,
  options?: { adminDb?: any }
): Promise<PinkFridayCampaignData> {
  const now = Date.now();
  const useCache = !forceFresh && !options?.adminDb;
  if (useCache && cachedPublishedCampaign && (now - lastCacheTime) < CACHE_TTL_MS) {
    return cachedPublishedCampaign;
  }

  try {
    let adminDb = options?.adminDb || null;
    if (!adminDb && process.env.FIREBASE_SERVICE_ACCOUNT) {
      adminDb = getAdminDb();
    }

    if (adminDb && typeof adminDb.ref === 'function') {
      const snap = await adminDb.ref('settings/pinkFriday/publishedActiveCampaign').once('value');
      const data = snap?.val?.();
      if (data && typeof data === 'object' && (data.id || data.year)) {
        const sanitized = sanitizePublishedPinkFridayCampaign(data);
        if (!options?.adminDb) {
          cachedPublishedCampaign = sanitized;
          lastCacheTime = now;
        }
        return sanitized;
      }
    }
  } catch (err) {
    console.warn('[PinkFriday] Could not fetch live published campaign via Admin SDK:', err);
  }

  const fallback = sanitizePublishedPinkFridayCampaign(null);
  if (!options?.adminDb) {
    cachedPublishedCampaign = fallback;
    lastCacheTime = now;
  }
  return fallback;
}

/**
 * Calculate the campaign lifecycle status strictly in Africa/Cairo time.
 */
export function getCampaignStatus(
  campaign: PinkFridayCampaignData = INITIAL_2026_CAMPAIGN,
  now: Date = new Date()
): CampaignStatus {
  if (!campaign || campaign.enabled === false) {
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
 * Whether the public website should display Pink Friday marketing elements.
 * A campaign is considered to have valid offers if it has at least one active individual offer OR at least one active collection.
 */
export function shouldDisplayCampaignToCustomers(
  campaign: PinkFridayCampaignData,
  now: Date = new Date()
): boolean {
  if (!campaign) return false;
  const status = getCampaignStatus(campaign, now);
  if (status !== 'active' && status !== 'upcoming') return false;

  const rawOffers = campaign.offers;
  const offersList = Array.isArray(rawOffers)
    ? rawOffers
    : (rawOffers && typeof rawOffers === 'object' ? Object.values(rawOffers) : []);
  const activeOffers = offersList.filter(o => o && o.active !== false && o.productId);

  const rawCollections = campaign.collections;
  const collectionsList = Array.isArray(rawCollections)
    ? rawCollections
    : (rawCollections && typeof rawCollections === 'object' ? Object.values(rawCollections) : []);
  const activeCollections = collectionsList.filter(c => {
    if (!c || c.active === false) return false;
    const items = Array.isArray(c.items)
      ? c.items
      : (c.items && typeof c.items === 'object' ? Object.values(c.items) : []);
    return items.length > 0;
  });

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
