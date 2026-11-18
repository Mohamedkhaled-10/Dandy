/**
 * DANDY COSMETICS — PURE PDP VIEW-MODEL, GALLERY, PRICING, REVIEWS & CART LOGIC (PHASE 4)
 * Decoupled from Astro/DOM rendering for deterministic unit testing and SSR/client parity.
 */

import { getCategorySlugForProduct } from '../utils/categories';
import { optimizeCloudinaryUrl, type Product, type VariantItem } from '../utils/products';
import type { CampaignPricingResult } from '../utils/pink-friday-server';
import type { Locale } from '../i18n/types';
import { EN_PRODUCT_CONTENT } from '../i18n/content/en/products';
import {
  FALLBACK_PRODUCT_IMAGE,
  isProductSoldOut,
  normalizeProductVariants,
  requiresVariantSelection,
  resolveCategoryArabicLabel,
  resolveProductPricing,
} from './product-card';

export interface GalleryImageItem {
  index: number;
  rawUrl: string;
  stageUrl: string;
  zoomUrl: string;
  thumbUrl: string;
  alt: string;
  isFallback: boolean;
}

export interface DescriptionSection {
  id: 'overview' | 'features' | 'usage' | 'results' | 'ingredients' | 'routine';
  title: string;
  paragraphs: string[];
  bullets: string[];
}

export interface ParsedDescriptionResult {
  hasCustomDescription: boolean;
  leadIntro: string;
  sections: DescriptionSection[];
}

export interface ProductHighlightItem {
  id: string;
  icon: 'leaf' | 'sparkles' | 'package-check' | 'sliders' | 'tag' | 'check-circle';
  label: string;
  value: string;
}

export interface ReviewRecordInput {
  id?: string;
  rating?: number | string;
  comment?: string;
  customerName?: string;
  name?: string;
  userName?: string;
  createdAt?: number | string;
  orderId?: string;
}

export interface NormalizedReviewItem {
  id: string;
  author: string;
  initial: string;
  rating: number;
  comment: string;
  createdAt: number | null;
  isVerifiedPurchase: boolean;
}

export interface StarDistributionRow {
  star: 5 | 4 | 3 | 2 | 1;
  count: number;
  percent: number;
}

export interface ReviewStatsResult {
  count: number;
  average: number;
  averageFormatted: string;
  distribution: StarDistributionRow[];
  items: NormalizedReviewItem[];
}

export interface PdpEffectivePricing {
  unitBasePrice: number;
  unitOldPrice: number | null;
  discountPercent: number | null;
  isPinkFriday: boolean;
  campaignBadgeText?: string;
  unitMultiplier: number;
  effectiveUnitPrice: number;
  effectiveOldPrice: number | null;
  savingsAmount: number | null;
}

export interface PdpCartBuildResult {
  ok: boolean;
  errorReason?: 'sold_out' | 'missing_variant' | 'invalid_product';
  errorMessage?: string;
  item?: Record<string, any>;
}

function collectRawImageStrings(source: unknown): string[] {
  if (!source) return [];
  if (typeof source === 'string') {
    return [source];
  }
  if (Array.isArray(source)) {
    return source.flatMap((entry) => {
      if (typeof entry === 'string') return [entry];
      if (entry && typeof entry === 'object' && 'url' in entry && typeof (entry as any).url === 'string') {
        return [(entry as any).url];
      }
      return [];
    });
  }
  if (typeof source === 'object') {
    return Object.values(source as Record<string, unknown>).flatMap((entry) =>
      typeof entry === 'string' ? [entry] : []
    );
  }
  return [];
}

function isUsableProductImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return false;
  if (trimmed.includes('images.unsplash.com')) return false;
  return true;
}

/**
 * Normalizes product image(s) strictly from real product fields.
 * Never duplicates a single image into fake gallery thumbnails.
 */
export function normalizeProductGalleryImages(
  product: Pick<Product, 'name' | 'image'> & {
    images?: unknown;
    gallery?: unknown;
    additionalImages?: unknown;
  },
  locale: Locale = 'ar',
  localizedName?: string
): GalleryImageItem[] {
  const fallbackName = locale === 'en' ? 'DANDY Product' : 'منتج داندي';
  const productName = (localizedName || product?.name || fallbackName).trim();
  const candidates = [
    ...collectRawImageStrings(product?.image),
    ...collectRawImageStrings(product?.images),
    ...collectRawImageStrings(product?.gallery),
    ...collectRawImageStrings(product?.additionalImages),
  ]
    .map((u) => u.trim())
    .filter(isUsableProductImageUrl);

  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  for (const url of candidates) {
    if (!seen.has(url)) {
      seen.add(url);
      uniqueUrls.push(url);
    }
  }

  if (uniqueUrls.length === 0) {
    return [
      {
        index: 0,
        rawUrl: FALLBACK_PRODUCT_IMAGE,
        stageUrl: FALLBACK_PRODUCT_IMAGE,
        zoomUrl: FALLBACK_PRODUCT_IMAGE,
        thumbUrl: FALLBACK_PRODUCT_IMAGE,
        alt: productName,
        isFallback: true,
      },
    ];
  }

  return uniqueUrls.map((url, idx) => ({
    index: idx,
    rawUrl: url,
    stageUrl: optimizeCloudinaryUrl(url, { width: 960, height: 960, crop: 'limit' }),
    zoomUrl: optimizeCloudinaryUrl(url, { width: 1600, height: 1600, crop: 'limit' }),
    thumbUrl: optimizeCloudinaryUrl(url, { width: 200, height: 200, crop: 'fill' }),
    alt: idx === 0 ? productName : locale === 'en' ? `${productName} — Image ${idx + 1}` : `${productName} — صورة ${idx + 1}`,
    isFallback: false,
  }));
}

/**
 * Parses real RTDB multi-paragraph Arabic descriptions into clean sections without fabricating claims.
 */
export function parseDescriptionSections(rawDescription?: string): ParsedDescriptionResult {
  const trimmed = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  if (!trimmed) {
    return {
      hasCustomDescription: false,
      leadIntro: 'مستحضر للعناية اليومية من داندي كوزمتكس مصر.',
      sections: [],
    };
  }

  const chunks = trimmed
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  const overviewParagraphs: string[] = [];
  const sectionsMap = new Map<DescriptionSection['id'], DescriptionSection>();
  let activeSectionId: DescriptionSection['id'] | null = null;

  const getOrCreateSection = (
    id: DescriptionSection['id'],
    defaultTitle: string
  ): DescriptionSection => {
    const existing = sectionsMap.get(id);
    if (existing) return existing;
    const created: DescriptionSection = {
      id,
      title: defaultTitle,
      paragraphs: [],
      bullets: [],
    };
    sectionsMap.set(id, created);
    return created;
  };

  function classifyHeading(firstLine: string): { id: DescriptionSection['id']; title: string } | null {
    const cleanTitle = firstLine.replace(/:\s*$/, '').trim();
    if (firstLine.includes('مميزات')) {
      return { id: 'features', title: cleanTitle || 'المميزات' };
    }
    if (firstLine.includes('طريقة الاستخدام')) {
      return { id: 'usage', title: cleanTitle || 'طريقة الاستخدام' };
    }
    if (firstLine.includes('النتائج')) {
      return { id: 'results', title: cleanTitle || 'النتائج' };
    }
    if (firstLine.includes('المكونات') || firstLine.includes('الفوائد')) {
      return { id: 'ingredients', title: cleanTitle || 'المكونات والفوائد' };
    }
    return null;
  }

  function appendLinesToSection(sec: DescriptionSection, bodyLines: string[]): void {
    for (const line of bodyLines) {
      const cleaned = line.replace(/^[-*•●▪︎\s\d.)]+/, '').trim();
      if (!cleaned) continue;
      if (sec.id === 'features' || sec.id === 'usage' || (sec.id === 'ingredients' && bodyLines.length > 1)) {
        sec.bullets.push(cleaned);
      } else {
        sec.paragraphs.push(cleaned);
      }
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    const restLines = lines.slice(1);
    const matchedHeading = classifyHeading(firstLine);

    if (matchedHeading) {
      const sec = getOrCreateSection(matchedHeading.id, matchedHeading.title);
      activeSectionId = matchedHeading.id;
      if (restLines.length > 0) {
        appendLinesToSection(sec, restLines);
      }
      continue;
    }

    if (activeSectionId) {
      const sec = sectionsMap.get(activeSectionId);
      if (sec) {
        appendLinesToSection(sec, lines);
        continue;
      }
    }

    overviewParagraphs.push(...lines);
  }

  const orderedIds: DescriptionSection['id'][] = [
    'overview',
    'features',
    'ingredients',
    'usage',
    'results',
  ];
  const sections: DescriptionSection[] = [];

  if (overviewParagraphs.length > 0) {
    sections.push({
      id: 'overview',
      title: 'وصف المستحضر',
      paragraphs: overviewParagraphs,
      bullets: [],
    });
  }

  for (const id of orderedIds) {
    if (id === 'overview') continue;
    const sec = sectionsMap.get(id);
    if (sec && (sec.paragraphs.length > 0 || sec.bullets.length > 0)) {
      sections.push(sec);
    }
  }

  const leadIntro =
    overviewParagraphs[0] ||
    sections[0]?.bullets[0] ||
    sections[0]?.paragraphs[0] ||
    '';

  return {
    hasCustomDescription: true,
    leadIntro,
    sections,
  };
}

export function resolveLocalizedParsedDescription(
  product: Pick<Product, 'id' | 'description'>,
  locale: Locale = 'ar'
): ParsedDescriptionResult {
  if (locale === 'en' && product.id && EN_PRODUCT_CONTENT[product.id]) {
    const enEntry = EN_PRODUCT_CONTENT[product.id];
    const sections: DescriptionSection[] = (enEntry.structuredSections || []).map((s) => ({
      id: s.id,
      title: s.title,
      paragraphs: [...(s.paragraphs || [])],
      bullets: [...(s.bullets || [])],
    }));
    const leadIntro =
      enEntry.shortDescription ||
      sections[0]?.paragraphs[0] ||
      sections[0]?.bullets[0] ||
      enEntry.description ||
      'Daily botanical care formula from Dandy Cosmetics Egypt.';
    return {
      hasCustomDescription: sections.length > 0 || Boolean(enEntry.description),
      leadIntro,
      sections:
        sections.length > 0
          ? sections
          : enEntry.description
            ? [
                {
                  id: 'overview',
                  title: 'Product Overview',
                  paragraphs: [enEntry.description],
                  bullets: [],
                },
              ]
            : [],
    };
  }
  return parseDescriptionSections(product.description);
}

/**
 * Extracts explicit size/volume/weight from real product name or slug without guessing.
 */
export function extractVolumeLabel(
  product: Pick<Product, 'name' | 'resolvedSlug'>,
  locale: Locale = 'ar'
): string | null {
  const source = `${product.name || ''} ${product.resolvedSlug || ''}`;

  const tolaMatch = source.match(/(\d+)\s*(?:تولات|تولة|tola).*?(\d+)\s*(?:مل|ml)/i);
  if (tolaMatch) {
    return locale === 'en'
      ? `${tolaMatch[1]} Tola · ${tolaMatch[2]} ml`
      : `${tolaMatch[1]} تولات · ${tolaMatch[2]} مل`;
  }

  const mlMatch = source.match(/(\d+)\s*(?:مل|ml)\b/i);
  if (mlMatch) {
    return locale === 'en' ? `${mlMatch[1]} ml` : `${mlMatch[1]} مل`;
  }

  const gmMatch = source.match(/(\d+)\s*(?:جم|جرام|gm|g)\b/i);
  if (gmMatch) {
    return locale === 'en' ? `${gmMatch[1]} g` : `${gmMatch[1]} جم`;
  }

  return null;
}

/**
 * Builds factual, non-fabricated highlights strictly from verified product attributes & description.
 */
export function extractProductHighlights(
  product: Product,
  parsed: ParsedDescriptionResult,
  locale: Locale = 'ar'
): ProductHighlightItem[] {
  const items: ProductHighlightItem[] = [];
  const { labelAr: categoryLabel } = resolveCategoryArabicLabel(product, locale);
  const volumeLabel = extractVolumeLabel(product, locale);
  const variants = normalizeProductVariants(product.variants);
  const hasVariants = requiresVariantSelection(product);
  const soldOut = isProductSoldOut(product);

  items.push({
    id: 'category',
    icon: 'tag',
    label: locale === 'en' ? 'Category' : 'التصنيف',
    value: categoryLabel,
  });

  if (volumeLabel) {
    items.push({
      id: 'volume',
      icon: 'package-check',
      label: locale === 'en' ? 'Size / Weight' : 'الحجم / الوزن',
      value: volumeLabel,
    });
  }

  if (hasVariants && variants.length > 0) {
    const availCount = variants.filter((v) => v.isAvailable !== false).length;
    items.push({
      id: 'variants',
      icon: 'sliders',
      label: locale === 'en' ? 'Scent Options' : 'خيارات الروائح',
      value:
        locale === 'en'
          ? availCount === variants.length
            ? `${variants.length} scents available`
            : `${availCount} of ${variants.length} available`
          : availCount === variants.length
            ? `${variants.length} روائح متاحة`
            : `${availCount} من ${variants.length} متاحة`,
    });
  }

  const fullText = `${product.name || ''} ${product.description || ''}`.toLowerCase();
  if (fullText.includes('خالي من السلفات') || fullText.includes('خالى من السلفات') || fullText.includes('free sulfate')) {
    items.push({
      id: 'sulfate-free',
      icon: 'leaf',
      label: locale === 'en' ? 'Formula' : 'التركيبة',
      value: locale === 'en' ? 'Sulfate-Free' : 'خالي من السلفات',
    });
  }

  if (locale === 'en' && product.id && EN_PRODUCT_CONTENT[product.id]?.highlights?.length) {
    const enHighlights = EN_PRODUCT_CONTENT[product.id].highlights || [];
    for (let i = 0; i < Math.min(2, enHighlights.length); i++) {
      const bullet = enHighlights[i];
      if (bullet.length <= 92) {
        items.push({
          id: `feature-${i}`,
          icon: 'sparkles',
          label: 'Key Benefit',
          value: bullet,
        });
      }
    }
  } else {
    const featuresSec = parsed.sections.find((s) => s.id === 'features');
    if (featuresSec && featuresSec.bullets.length > 0) {
      for (let i = 0; i < Math.min(2, featuresSec.bullets.length); i++) {
        const bullet = featuresSec.bullets[i];
        if (bullet.length <= 72) {
          items.push({
            id: `feature-${i}`,
            icon: 'sparkles',
            label: locale === 'en' ? 'Key Benefit' : 'ميزة مذكورة',
            value: bullet,
          });
        }
      }
    }
  }

  items.push({
    id: 'availability',
    icon: 'check-circle',
    label: locale === 'en' ? 'Availability' : 'التوافر',
    value: soldOut
      ? locale === 'en'
        ? 'Currently Sold Out'
        : 'نفذت الكمية حالياً'
      : locale === 'en'
        ? 'In Stock'
        : 'متوفر للطلب',
  });

  return items.slice(0, 6);
}

/**
 * Computes exact review statistics and 5-to-1 distribution strictly from real DB records.
 */
export function computeReviewStats(
  rawReviews: ReviewRecordInput[] | Record<string, ReviewRecordInput> | null | undefined,
  locale: Locale = 'ar'
): ReviewStatsResult {
  const rawEntries: Array<{ id: string; rec: ReviewRecordInput }> = [];

  if (Array.isArray(rawReviews)) {
    rawReviews.forEach((rec, idx) => {
      if (rec && typeof rec === 'object') {
        rawEntries.push({ id: rec.id || `rev-${idx}`, rec });
      }
    });
  } else if (rawReviews && typeof rawReviews === 'object') {
    Object.entries(rawReviews).forEach(([key, rec]) => {
      if (rec && typeof rec === 'object') {
        rawEntries.push({ id: rec.id || key, rec });
      }
    });
  }

  const defaultAuthor = locale === 'en' ? 'DANDY Customer' : 'عميلة داندي';
  const defaultInitial = locale === 'en' ? 'D' : 'د';
  const items: NormalizedReviewItem[] = rawEntries
    .map(({ id, rec }) => {
      const parsedRating = Number(rec.rating);
      const rating = Number.isFinite(parsedRating)
        ? Math.min(5, Math.max(1, Math.round(parsedRating)))
        : 5;
      const rawName = (rec.customerName || rec.name || rec.userName || defaultAuthor).trim();
      const author = rawName || defaultAuthor;
      const initial = Array.from(author)[0]?.toUpperCase() || defaultInitial;
      const createdNum = Number(rec.createdAt);
      const createdAt = Number.isFinite(createdNum) && createdNum > 0 ? createdNum : null;
      const orderRef = typeof rec.orderId === 'string' ? rec.orderId.trim() : '';
      const isVerifiedPurchase = Boolean(orderRef && orderRef.toUpperCase() !== 'N/A');

      return {
        id,
        author,
        initial,
        rating,
        comment: typeof rec.comment === 'string' ? rec.comment.trim() : '',
        createdAt,
        isVerifiedPurchase,
      };
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const count = items.length;
  const buckets: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  for (const item of items) {
    sum += item.rating;
    const starKey = item.rating as 1 | 2 | 3 | 4 | 5;
    buckets[starKey] = (buckets[starKey] || 0) + 1;
  }

  const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  const distribution: StarDistributionRow[] = ([5, 4, 3, 2, 1] as const).map((star) => ({
    star,
    count: buckets[star],
    percent: count > 0 ? Math.round((buckets[star] / count) * 100) : 0,
  }));

  return {
    count,
    average,
    averageFormatted: average.toFixed(1),
    distribution,
    items,
  };
}

/**
 * Selects related products from the same normalized category, excluding the current product and hidden items.
 */
export function selectRelatedProducts(
  allProducts: Product[],
  currentProduct: Pick<Product, 'id' | 'category'>,
  limit = 4
): Product[] {
  const targetCategorySlug = getCategorySlugForProduct(currentProduct);
  const seen = new Set<string>([currentProduct.id]);

  const candidates = (allProducts || []).filter((p) => {
    if (!p || !p.id || p.isHidden || seen.has(p.id)) return false;
    if (!(Number(p.price) > 0)) return false;
    if (getCategorySlugForProduct(p) !== targetCategorySlug) return false;
    seen.add(p.id);
    return true;
  });

  candidates.sort((a, b) => {
    const aSold = isProductSoldOut(a) ? 1 : 0;
    const bSold = isProductSoldOut(b) ? 1 : 0;
    if (aSold !== bSold) return aSold - bSold;
    const aScore = (a.onSale ? 2 : 0) + ((a.reviewCount || 0) > 0 ? 2 : 0) + (a.bestSeller ? 1 : 0);
    const bScore = (b.onSale ? 2 : 0) + ((b.reviewCount || 0) > 0 ? 2 : 0) + (b.bestSeller ? 1 : 0);
    return bScore - aScore;
  });

  return candidates.slice(0, limit);
}

/**
 * Computes consistent PDP pricing matching ProductCard + variants.js multi-scent pricing rule.
 */
export function computePdpEffectivePricing(
  product: Pick<Product, 'price' | 'originalPrice' | 'discount' | 'onSale'>,
  selectedVariantsCount = 0,
  pinkFridayPricing?: CampaignPricingResult | null
): PdpEffectivePricing {
  const base = resolveProductPricing(product, pinkFridayPricing);
  const multiplier = selectedVariantsCount > 0 ? selectedVariantsCount : 1;
  const effectiveUnitPrice = base.currentPrice * multiplier;
  const effectiveOldPrice = base.oldPrice !== null ? base.oldPrice * multiplier : null;
  const savingsAmount =
    effectiveOldPrice !== null && effectiveOldPrice > effectiveUnitPrice
      ? Math.round(effectiveOldPrice - effectiveUnitPrice)
      : null;

  return {
    unitBasePrice: base.currentPrice,
    unitOldPrice: base.oldPrice,
    discountPercent: base.discountPercent,
    isPinkFriday: base.isPinkFriday,
    campaignBadgeText: base.campaignBadgeText,
    unitMultiplier: multiplier,
    effectiveUnitPrice,
    effectiveOldPrice,
    savingsAmount,
  };
}

/**
 * Builds a validated cart payload matching cart.astro + variants.js + DandyPinkFriday contracts.
 */
export function buildPdpCartPayload(params: {
  product: Product | null | undefined;
  selectedVariants: Array<{ id: string; name: string }>;
  quantity: number;
  pinkFridayPricing?: CampaignPricingResult | null;
  locale?: Locale;
}): PdpCartBuildResult {
  const { product, selectedVariants, quantity, pinkFridayPricing, locale = 'ar' } = params;
  if (!product || !product.id) {
    return {
      ok: false,
      errorReason: 'invalid_product',
      errorMessage: locale === 'en' ? 'Product data is incomplete.' : 'بيانات المنتج غير مكتملة.',
    };
  }

  if (isProductSoldOut(product)) {
    return {
      ok: false,
      errorReason: 'sold_out',
      errorMessage:
        locale === 'en'
          ? 'Sorry, this product is currently out of stock.'
          : 'نعتذر، هذا المنتج غير متوفر حالياً (نفدت الكمية).',
    };
  }

  const hasVars = requiresVariantSelection(product);
  const availableVariants = normalizeProductVariants(product.variants).filter(
    (v) => v.isAvailable !== false
  );

  let validSelectedVariants: VariantItem[] = [];
  if (hasVars) {
    const selectedIds = new Set((selectedVariants || []).map((v) => String(v.id)));
    validSelectedVariants = availableVariants
      .filter((rv) => selectedIds.has(String(rv.id)))
      .map((rv) => ({ id: String(rv.id), name: rv.name }))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (validSelectedVariants.length === 0) {
      return {
        ok: false,
        errorReason: 'missing_variant',
        errorMessage:
          locale === 'en'
            ? 'Please choose your favorite scent first before adding to your bag.'
            : 'يرجى اختيار الرائحة المفضلة أولاً قبل الإضافة إلى السلة.',
      };
    }
  }

  const safeQty = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
  const hasChosenVariants = validSelectedVariants.length > 0;
  const sortedIdsStr = hasChosenVariants ? validSelectedVariants.map((v) => v.id).join('_') : '';
  const cartItemId = hasChosenVariants ? `${product.id}::${sortedIdsStr}` : product.id;

  const basePricing = resolveProductPricing(product, pinkFridayPricing);
  const item: Record<string, any> = {
    id: cartItemId,
    productId: product.id,
    name: product.name,
    price: basePricing.currentPrice,
    image: product.image || FALLBACK_PRODUCT_IMAGE,
    discount: product.discount || null,
    onSale: Boolean(product.onSale || basePricing.isPinkFriday || basePricing.oldPrice),
    quantity: safeQty,
  };

  if (basePricing.isPinkFriday && pinkFridayPricing?.isEligible) {
    item.isPinkFriday = true;
    item.campaignPrice = basePricing.currentPrice;
    item.regularPrice = Math.round(pinkFridayPricing.regularPrice);
    item.price = basePricing.currentPrice;
    item.badgeText = basePricing.campaignBadgeText || 'Pink Friday';
  }

  if (hasChosenVariants) {
    item.hasVariants = true;
    item.variantType = 'scent';
    item.selectedVariants = validSelectedVariants;
    if (validSelectedVariants.length === 1) {
      item.selectedVariant = validSelectedVariants[0];
      item.variantId = validSelectedVariants[0].id;
      item.variantName = validSelectedVariants[0].name;
    } else {
      item.variantName = validSelectedVariants.map((v) => v.name).join('، ');
    }
  }

  return { ok: true, item };
}

function resolveCartItemKeyPure(item: Record<string, any>): string {
  const prodId =
    item.productId || (typeof item.id === 'string' ? item.id.split('::')[0] : item.id) || '';
  if (Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0) {
    const sortedIds = item.selectedVariants
      .map((v: any) => (v && typeof v === 'object' ? v.id || v.name : String(v)))
      .filter(Boolean)
      .map(String)
      .sort()
      .join('_');
    return sortedIds ? `${prodId}_${sortedIds}` : String(prodId);
  }
  if (item.selectedVariant && item.selectedVariant.id) {
    return `${prodId}_${item.selectedVariant.id}`;
  }
  if (item.variantId) {
    return `${prodId}_${item.variantId}`;
  }
  return String(prodId);
}

/**
 * Merges a PDP cart item into existing cart array with deterministic multi-scent key parity.
 */
export function mergePdpCartItem(
  existingCart: any[],
  cartItem: Record<string, any>
): any[] {
  const safeCart = Array.isArray(existingCart) ? existingCart.map((entry) => ({ ...entry })) : [];
  const targetKey = resolveCartItemKeyPure(cartItem);
  const existingIdx = safeCart.findIndex((entry) => resolveCartItemKeyPure(entry) === targetKey);

  if (existingIdx !== -1) {
    const prevQty = parseInt(String(safeCart[existingIdx].quantity), 10) || 0;
    const addQty = parseInt(String(cartItem.quantity), 10) || 1;
    safeCart[existingIdx] = {
      ...safeCart[existingIdx],
      ...cartItem,
      quantity: Math.min(99, prevQty + addQty),
    };
  } else {
    safeCart.push({ ...cartItem });
  }

  return safeCart;
}
