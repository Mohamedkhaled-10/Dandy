/**
 * DANDY COSMETICS — PURE PRODUCT CARD VIEW-MODEL & CART LOGIC (PHASE 3)
 * Decoupled from Astro/DOM rendering for deterministic unit testing and reuse.
 */

import { getCategoryBySlug, getCategorySlugForProduct } from '../utils/categories';
import { getDeterministicSlug, optimizeCloudinaryUrl, type Product, type VariantItem } from '../utils/products';
import type { CampaignPricingResult } from '../utils/pink-friday-server';
import type { Locale } from '../i18n/types';
import { buildLocalizedPath } from '../i18n/routes';
import { EN_CATEGORY_CONTENT } from '../i18n/content/en/categories';
import { EN_PRODUCT_SUMMARY_MAP } from '../i18n/content/en/products';

export const FALLBACK_PRODUCT_IMAGE = '/assets/images/logo.png';

export interface ProductBadgeModel {
  text: string;
  tone: 'soldout' | 'campaign' | 'discount';
}

export interface ProductCardViewModel {
  id: string;
  name: string;
  href: string;
  categorySlug: string;
  categoryLabelAr: string;
  imageUrl: string;
  isFallbackImage: boolean;
  isSoldOut: boolean;
  requiresVariantSelection: boolean;
  ctaLabel: string;
  currentPrice: number;
  oldPrice: number | null;
  discountPercent: number | null;
  isPinkFriday: boolean;
  badge: ProductBadgeModel | null;
  shouldShowRating: boolean;
  ratingValue: string | null;
  reviewCount: number;
  cartPayload: CartAddPayload | null;
}

export interface CartAddPayload {
  id: string;
  productId: string;
  name: string;
  price: number;
  image: string;
  discount: number | string | null;
  onSale: boolean;
  quantity: number;
}

function toFinitePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export function normalizeProductVariants(rawVariants: Product['variants']): VariantItem[] {
  if (!rawVariants) return [];
  if (Array.isArray(rawVariants)) {
    return rawVariants.filter((v) => Boolean(v && (v.id || v.name)));
  }
  if (typeof rawVariants === 'object') {
    return Object.entries(rawVariants)
      .map(([key, val]) => ({
        ...(val || {}),
        id: (val && val.id) || key,
        name: (val && val.name) || key,
      }))
      .filter((v) => Boolean(v && v.name));
  }
  return [];
}

export function requiresVariantSelection(product: Pick<Product, 'hasVariants' | 'variants'>): boolean {
  const hasVariantsFlag = product.hasVariants === true || (product.hasVariants as unknown) === 'true';
  if (!hasVariantsFlag) return false;
  return normalizeProductVariants(product.variants).length > 0;
}

export function isProductSoldOut(product: Pick<Product, 'isSoldOut' | 'inStock' | 'stockQuantity'>): boolean {
  if (product.isSoldOut === true) return true;
  if (product.inStock === false) return true;
  if (typeof product.stockQuantity === 'number' && Number.isFinite(product.stockQuantity) && product.stockQuantity <= 0) {
    return true;
  }
  return false;
}

export function resolveProductImage(rawImage?: string): { url: string; isFallback: boolean } {
  const trimmed = typeof rawImage === 'string' ? rawImage.trim() : '';
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    return { url: FALLBACK_PRODUCT_IMAGE, isFallback: true };
  }
  if (trimmed.includes('images.unsplash.com')) {
    return { url: FALLBACK_PRODUCT_IMAGE, isFallback: true };
  }
  if (trimmed.includes('res.cloudinary.com')) {
    return {
      url: optimizeCloudinaryUrl(trimmed, 640),
      isFallback: false,
    };
  }
  return { url: trimmed, isFallback: false };
}

export function resolveCategoryArabicLabel(
  product: Pick<Product, 'id' | 'category'>,
  locale: Locale = 'ar'
): {
  slug: string;
  labelAr: string;
} {
  const slug = getCategorySlugForProduct({ id: product.id || '', category: product.category });
  const taxonomy = getCategoryBySlug(slug);
  if (locale === 'en') {
    const enCat = EN_CATEGORY_CONTENT[slug];
    return {
      slug,
      labelAr: enCat?.name || taxonomy?.name || 'Natural Care',
    };
  }
  return {
    slug,
    labelAr: taxonomy ? taxonomy.arabicName : 'العناية الطبيعية',
  };
}

export function resolveProductPricing(
  product: Pick<Product, 'price' | 'originalPrice' | 'discount' | 'onSale'>,
  pinkFridayPricing?: CampaignPricingResult | null
): {
  currentPrice: number;
  oldPrice: number | null;
  discountPercent: number | null;
  isPinkFriday: boolean;
  campaignBadgeText?: string;
} {
  const basePrice = toFinitePositiveNumber(product.price) ?? 0;

  if (
    pinkFridayPricing &&
    pinkFridayPricing.isEligible &&
    Number.isFinite(pinkFridayPricing.campaignPrice) &&
    pinkFridayPricing.campaignPrice > 0 &&
    pinkFridayPricing.campaignPrice < pinkFridayPricing.regularPrice
  ) {
    const pct =
      pinkFridayPricing.discountPercentage > 0
        ? Math.round(pinkFridayPricing.discountPercentage)
        : Math.round(((pinkFridayPricing.regularPrice - pinkFridayPricing.campaignPrice) / pinkFridayPricing.regularPrice) * 100);
    return {
      currentPrice: Math.round(pinkFridayPricing.campaignPrice),
      oldPrice: Math.round(pinkFridayPricing.regularPrice),
      discountPercent: pct > 0 && pct < 100 ? pct : null,
      isPinkFriday: true,
      campaignBadgeText: pinkFridayPricing.offer?.badgeText?.trim() || 'Pink Friday',
    };
  }

  const storedOriginal = toFinitePositiveNumber(product.originalPrice);
  const storedDiscountRaw = toFinitePositiveNumber(product.discount);
  const validStoredDiscount =
    storedDiscountRaw !== null && storedDiscountRaw > 0 && storedDiscountRaw < 100
      ? Math.round(storedDiscountRaw)
      : null;

  if (storedOriginal !== null && basePrice > 0 && storedOriginal > basePrice) {
    const computedPct =
      validStoredDiscount ?? Math.round(((storedOriginal - basePrice) / storedOriginal) * 100);
    return {
      currentPrice: basePrice,
      oldPrice: Math.round(storedOriginal),
      discountPercent: computedPct > 0 && computedPct < 100 ? computedPct : null,
      isPinkFriday: false,
    };
  }

  if (product.onSale && validStoredDiscount !== null && basePrice > 0) {
    const derivedOld = Math.round(basePrice / (1 - validStoredDiscount / 100));
    return {
      currentPrice: basePrice,
      oldPrice: derivedOld > basePrice ? derivedOld : null,
      discountPercent: validStoredDiscount,
      isPinkFriday: false,
    };
  }

  return {
    currentPrice: basePrice,
    oldPrice: null,
    discountPercent: null,
    isPinkFriday: false,
  };
}

export function resolveProductCardViewModel(
  product: Product,
  pinkFridayPricing?: CampaignPricingResult | null,
  locale: Locale = 'ar'
): ProductCardViewModel {
  const slug = product.resolvedSlug || getDeterministicSlug(product);
  const href = buildLocalizedPath(`/product/${encodeURIComponent(slug)}`, locale);
  const { slug: categorySlug, labelAr: categoryLabelAr } = resolveCategoryArabicLabel(product, locale);
  const localizedName =
    locale === 'en' ? EN_PRODUCT_SUMMARY_MAP[product.id]?.name || product.name : product.name;
  const { url: imageUrl, isFallback: isFallbackImage } = resolveProductImage(product.image);
  const soldOut = isProductSoldOut(product);
  const hasVariants = requiresVariantSelection(product);

  const pricing = resolveProductPricing(product, pinkFridayPricing);

  let badge: ProductBadgeModel | null = null;
  if (soldOut) {
    badge = { text: locale === 'en' ? 'Sold Out' : 'نفذت الكمية', tone: 'soldout' };
  } else if (pricing.isPinkFriday) {
    badge = {
      text:
        locale === 'en'
          ? pricing.discountPercent
            ? `Pink Friday · -${pricing.discountPercent}%`
            : 'Pink Friday'
          : pricing.campaignBadgeText ||
            (pricing.discountPercent ? `Pink Friday · -${pricing.discountPercent}%` : 'Pink Friday'),
      tone: 'campaign',
    };
  } else if (pricing.oldPrice && pricing.discountPercent) {
    badge = {
      text: locale === 'en' ? `Save ${pricing.discountPercent}%` : `خصم ${pricing.discountPercent}%`,
      tone: 'discount',
    };
  } else if (pricing.oldPrice) {
    badge = { text: locale === 'en' ? 'Sale' : 'تخفيض', tone: 'discount' };
  }

  const reviewCount = Number(product.reviewCount) || 0;
  const avgRatingRaw = Number(product.avgRating) || 0;
  const shouldShowRating = reviewCount > 0 && avgRatingRaw > 0;
  const ratingValue = shouldShowRating ? avgRatingRaw.toFixed(1) : null;

  let ctaLabel = locale === 'en' ? 'Add to Bag' : 'أضيفي للسلة';
  if (soldOut) {
    ctaLabel = locale === 'en' ? 'Sold Out' : 'نفذت الكمية';
  } else if (hasVariants) {
    ctaLabel = locale === 'en' ? 'Choose Option' : 'اختاري الخيار';
  }

  const cartPayload: CartAddPayload | null =
    soldOut || hasVariants
      ? null
      : {
          id: product.id,
          productId: product.id,
          name: localizedName,
          price: pricing.currentPrice,
          image: imageUrl,
          discount: pricing.discountPercent ?? product.discount ?? null,
          onSale: Boolean(product.onSale || pricing.isPinkFriday || pricing.oldPrice),
          quantity: 1,
        };

  return {
    id: product.id,
    name: localizedName,
    href,
    categorySlug,
    categoryLabelAr,
    imageUrl,
    isFallbackImage,
    isSoldOut: soldOut,
    requiresVariantSelection: hasVariants,
    ctaLabel,
    currentPrice: pricing.currentPrice,
    oldPrice: pricing.oldPrice,
    discountPercent: pricing.discountPercent,
    isPinkFriday: pricing.isPinkFriday,
    badge,
    shouldShowRating,
    ratingValue,
    reviewCount,
    cartPayload,
  };
}

/**
 * Curates featured visible products for the homepage showcase,
 * prioritizing in-stock diversity across categories without inventing fake sections.
 */
export function selectFeaturedProducts(products: Product[], limit = 8): Product[] {
  const visible = products.filter((p) => p && !p.isHidden && Number(p.price) > 0);
  const inStock = visible.filter((p) => !isProductSoldOut(p));
  const soldOut = visible.filter((p) => isProductSoldOut(p));

  const orderedPool = [...inStock, ...soldOut];
  const selected: Product[] = [];
  const selectedIds = new Set<string>();

  // Pass 1: Ensure representation across canonical categories (preferring on-sale or signature SKUs first)
  const categoriesOrder = ['skin-care', 'hair-care', 'body-care', 'fragrance'];
  for (const catSlug of categoriesOrder) {
    if (selected.length >= limit) break;
    const catMatches = orderedPool.filter(
      (p) => !selectedIds.has(p.id) && getCategorySlugForProduct(p) === catSlug
    );
    // Prefer items with reviewCount > 0 or genuine discount or multi-variant signature item first
    catMatches.sort((a, b) => {
      const aScore = (a.onSale ? 2 : 0) + ((a.reviewCount || 0) > 0 ? 2 : 0) + (a.bestSeller ? 1 : 0);
      const bScore = (b.onSale ? 2 : 0) + ((b.reviewCount || 0) > 0 ? 2 : 0) + (b.bestSeller ? 1 : 0);
      return bScore - aScore;
    });
    for (const item of catMatches.slice(0, 2)) {
      if (selected.length >= limit) break;
      selected.push(item);
      selectedIds.add(item.id);
    }
  }

  // Pass 2: Fill remaining slots up to limit
  for (const item of orderedPool) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(item.id)) {
      selected.push(item);
      selectedIds.add(item.id);
    }
  }

  return selected;
}

/**
 * Pure cart array updater for direct single-product additions (compatible with cart.astro schema).
 */
export function addDirectProductToCartArray(
  existingCart: any[],
  payload: CartAddPayload
): any[] {
  const safeCart = Array.isArray(existingCart) ? existingCart.map((item) => ({ ...item })) : [];
  const existIndex = safeCart.findIndex(
    (item) =>
      (item.productId || item.id) === payload.id &&
      (!item.selectedVariants || item.selectedVariants.length === 0) &&
      !item.selectedVariant
  );

  if (existIndex !== -1) {
    const prevQty = parseInt(String(safeCart[existIndex].quantity), 10) || 0;
    safeCart[existIndex].quantity = prevQty + 1;
    safeCart[existIndex].price = payload.price;
  } else {
    safeCart.push({ ...payload, quantity: 1 });
  }

  return safeCart;
}

export function formatEgpPrice(amount: number, locale: Locale = 'ar'): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return locale === 'en' ? `${safe} EGP` : `${safe} ج.م`;
}
