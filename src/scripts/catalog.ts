/**
 * DANDY COSMETICS — PURE CATALOG, FILTERING, SPECIAL OFFERS & CAMPAIGN LOGIC (PHASE 5)
 * Decoupled from Astro/DOM rendering for deterministic Node unit tests and SSR/CSR parity.
 */

import { getCategoryBySlug, getCategorySlugForProduct } from '../utils/categories';
import { type Product } from '../utils/products';
import type { CampaignPricingResult, CampaignStatus } from '../utils/pink-friday-server';
import { isProductSoldOut, resolveProductPricing } from './product-card';
import type { Locale } from '../i18n/types';
import { EN_CATEGORY_CONTENT } from '../i18n/content/en/categories';
import { EN_PRODUCT_CONTENT } from '../i18n/content/en/products';

export type CatalogSortOption = 'default' | 'price-asc' | 'price-desc' | 'name-asc';
export type CatalogPriceRange = 'all' | 'under-150' | '150-300' | 'over-300';

export interface CatalogFilterState {
  search: string;
  categories: string[];
  priceRange: CatalogPriceRange;
  saleOnly: boolean;
  inStockOnly: boolean;
  bestSellerOnly: boolean;
  sort: CatalogSortOption;
}

export interface CatalogItemMeta {
  id: string;
  index: number;
  name: string;
  categorySlug: string;
  categoryLabelAr: string;
  currentPrice: number;
  isOnSale: boolean;
  isBestSeller: boolean;
  isSoldOut: boolean;
  searchText: string;
}

export interface CatalogFilterChip {
  key: 'search' | 'category' | 'priceRange' | 'saleOnly' | 'inStockOnly' | 'bestSellerOnly';
  value: string;
  label: string;
}

export interface CairoCountdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export type PinkFridayDisplayMode =
  | 'active-full'
  | 'active-bundles-only'
  | 'active-offers-only'
  | 'active-empty'
  | 'upcoming'
  | 'ended'
  | 'disabled';

export const CATEGORY_FILTER_OPTIONS: Array<{ slug: string; labelAr: string; labelEn: string }> = [
  { slug: 'skin-care', labelAr: 'العناية بالبشرة', labelEn: 'Skin Care' },
  { slug: 'hair-care', labelAr: 'العناية بالشعر', labelEn: 'Hair Care' },
  { slug: 'body-care', labelAr: 'العناية بالجسم', labelEn: 'Body Care' },
  { slug: 'fragrance', labelAr: 'العطور والمعطرات', labelEn: 'Fragrance' },
];

export const PRICE_RANGE_OPTIONS: Array<{ value: CatalogPriceRange; labelAr: string; labelEn: string }> = [
  { value: 'all', labelAr: 'كل الأسعار', labelEn: 'All Prices' },
  { value: 'under-150', labelAr: 'أقل من 150 ج.م', labelEn: 'Under 150 EGP' },
  { value: '150-300', labelAr: '150 – 300 ج.م', labelEn: '150 – 300 EGP' },
  { value: 'over-300', labelAr: 'أكثر من 300 ج.م', labelEn: 'Over 300 EGP' },
];

export const SORT_OPTIONS: Array<{ value: CatalogSortOption; labelAr: string; labelEn: string }> = [
  { value: 'default', labelAr: 'الترتيب الافتراضي', labelEn: 'Featured Order' },
  { value: 'price-asc', labelAr: 'السعر: من الأقل للأعلى', labelEn: 'Price: Low to High' },
  { value: 'price-desc', labelAr: 'السعر: من الأعلى للأقل', labelEn: 'Price: High to Low' },
  { value: 'name-asc', labelAr: 'الاسم: أ – ي', labelEn: 'Name: A – Z' },
];

export function getCategoryFilterOptions(locale: Locale = 'ar'): Array<{ slug: string; label: string }> {
  return CATEGORY_FILTER_OPTIONS.map((opt) => ({
    slug: opt.slug,
    label: locale === 'en' ? opt.labelEn : opt.labelAr,
  }));
}

export function getPriceRangeOptions(locale: Locale = 'ar'): Array<{ value: CatalogPriceRange; label: string }> {
  return PRICE_RANGE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: locale === 'en' ? opt.labelEn : opt.labelAr,
  }));
}

export function getSortOptions(locale: Locale = 'ar'): Array<{ value: CatalogSortOption; label: string }> {
  return SORT_OPTIONS.map((opt) => ({
    value: opt.value,
    label: locale === 'en' ? opt.labelEn : opt.labelAr,
  }));
}

const CATEGORY_ALIASES: Record<string, string> = {
  'skin-care': 'skin-care',
  'skin care': 'skin-care',
  'skincare': 'skin-care',
  'عناية بالبشرة': 'skin-care',
  'العناية بالبشرة': 'skin-care',
  'hair-care': 'hair-care',
  'hair care': 'hair-care',
  'haircare': 'hair-care',
  'منتجات الشعر': 'hair-care',
  'عناية بالشعر': 'hair-care',
  'العناية بالشعر': 'hair-care',
  'body-care': 'body-care',
  'body care': 'body-care',
  'bodycare': 'body-care',
  'منتجات الجسم': 'body-care',
  'العناية بالجسم': 'body-care',
  'fragrance': 'fragrance',
  'fragrances': 'fragrance',
  'perfume': 'fragrance',
  'perfumes': 'fragrance',
  'منتجات العطور': 'fragrance',
  'العطور والمعطرات': 'fragrance',
};

export function normalizeCatalogCategoryParam(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (CATEGORY_ALIASES[clean]) return CATEGORY_ALIASES[clean];
  if (clean.includes('hair') || clean.includes('شعر')) return 'hair-care';
  if (clean.includes('body') || clean.includes('جسم')) return 'body-care';
  if (clean.includes('perfume') || clean.includes('fragrance') || clean.includes('عطر')) return 'fragrance';
  if (clean.includes('skin') || clean.includes('بشرة')) return 'skin-care';
  return null;
}

export function normalizeSortOption(raw?: string | null): CatalogSortOption {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'price-asc' || val === 'price-desc' || val === 'name-asc') {
    return val;
  }
  return 'default';
}

export function normalizePriceRange(raw?: string | null): CatalogPriceRange {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'under-150' || val === '150-300' || val === 'over-300') {
    return val;
  }
  return 'all';
}

export function getDefaultCatalogFilterState(): CatalogFilterState {
  return {
    search: '',
    categories: [],
    priceRange: 'all',
    saleOnly: false,
    inStockOnly: false,
    bestSellerOnly: false,
    sort: 'default',
  };
}

export function parseCatalogQueryState(
  searchString: string,
  options: { lockedCategorySlug?: string | null } = {}
): CatalogFilterState {
  const state = getDefaultCatalogFilterState();
  const cleanQuery = String(searchString || '').replace(/^\?/, '');
  if (!cleanQuery) return state;

  const params = new URLSearchParams(cleanQuery);

  const rawSearch = params.get('search') ?? params.get('q') ?? '';
  state.search = rawSearch.trim();

  if (!options.lockedCategorySlug) {
    const categoryEntries = params.getAll('category');
    const resolvedCategories = new Set<string>();
    for (const entry of categoryEntries) {
      for (const token of entry.split(',')) {
        const normalizedSlug = normalizeCatalogCategoryParam(token);
        if (normalizedSlug) resolvedCategories.add(normalizedSlug);
      }
    }
    state.categories = Array.from(resolvedCategories);
  }

  state.priceRange = normalizePriceRange(params.get('price'));

  const saleRaw = (params.get('sale') || params.get('offers') || '').toLowerCase();
  state.saleOnly = saleRaw === '1' || saleRaw === 'true';

  const availRaw = (params.get('availability') || '').toLowerCase();
  state.inStockOnly = availRaw === 'in-stock' || availRaw === '1' || availRaw === 'true';

  const bestRaw = (params.get('bestseller') || '').toLowerCase();
  state.bestSellerOnly = bestRaw === '1' || bestRaw === 'true';

  state.sort = normalizeSortOption(params.get('sort'));

  return state;
}

export function serializeCatalogQueryState(
  state: CatalogFilterState,
  options: { lockedCategorySlug?: string | null } = {}
): string {
  const params = new URLSearchParams();

  if (state.search.trim()) {
    params.set('search', state.search.trim());
  }
  if (!options.lockedCategorySlug && state.categories.length > 0) {
    const valid = state.categories
      .map((c) => normalizeCatalogCategoryParam(c))
      .filter((c): c is string => Boolean(c));
    if (valid.length > 0) {
      params.set('category', Array.from(new Set(valid)).join(','));
    }
  }
  if (state.priceRange !== 'all') {
    params.set('price', state.priceRange);
  }
  if (state.saleOnly) {
    params.set('sale', '1');
  }
  if (state.inStockOnly) {
    params.set('availability', 'in-stock');
  }
  if (state.bestSellerOnly) {
    params.set('bestseller', '1');
  }
  if (state.sort !== 'default') {
    params.set('sort', state.sort);
  }

  return params.toString();
}

export function isSpecialOfferEligible(
  product: Pick<Product, 'onSale'>,
  pinkFridayPricing?: CampaignPricingResult | null
): boolean {
  if (product.onSale === true) return true;
  if (pinkFridayPricing && pinkFridayPricing.isEligible === true) return true;
  return false;
}

export function buildCatalogItemMeta(
  product: Product,
  index: number,
  pinkFridayPricing?: CampaignPricingResult | null,
  locale: Locale = 'ar'
): CatalogItemMeta {
  const categorySlug = getCategorySlugForProduct({ id: product.id, category: product.category });
  const taxonomy = getCategoryBySlug(categorySlug);
  const enCat = EN_CATEGORY_CONTENT[categorySlug];
  const enProd = product.id ? EN_PRODUCT_CONTENT[product.id] : undefined;

  const categoryLabelAr =
    locale === 'en'
      ? enCat?.name || taxonomy?.name || 'Natural Care'
      : taxonomy
        ? taxonomy.arabicName
        : 'العناية الطبيعية';
  const localizedName = locale === 'en' ? enProd?.name || product.name || '' : product.name || '';
  const pricing = resolveProductPricing(product, pinkFridayPricing);
  const soldOut = isProductSoldOut(product);

  const searchParts = [
    localizedName,
    product.name || '',
    enProd?.shortDescription || '',
    enProd?.description || '',
    categoryLabelAr,
    enCat?.name || '',
    taxonomy?.arabicName || '',
    categorySlug,
    product.category || '',
    product.description || '',
  ]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return {
    id: product.id,
    index,
    name: localizedName,
    categorySlug,
    categoryLabelAr,
    currentPrice: pricing.currentPrice,
    isOnSale: isSpecialOfferEligible(product, pinkFridayPricing),
    isBestSeller: Boolean(product.bestSeller),
    isSoldOut: soldOut,
    searchText: searchParts,
  };
}

export function matchesPriceRange(price: number, priceRange: CatalogPriceRange): boolean {
  if (priceRange === 'all') return true;
  if (!Number.isFinite(price)) return false;
  if (priceRange === 'under-150') return price < 150;
  if (priceRange === '150-300') return price >= 150 && price <= 300;
  if (priceRange === 'over-300') return price > 300;
  return true;
}

export function filterAndSortCatalogItems(
  items: CatalogItemMeta[],
  state: CatalogFilterState,
  locale: Locale = 'ar'
): CatalogItemMeta[] {
  const query = state.search.trim().toLowerCase();
  const catSet = new Set(
    state.categories
      .map((c) => normalizeCatalogCategoryParam(c) || c)
      .filter(Boolean)
  );

  const filtered = items.filter((item) => {
    if (query && !item.searchText.includes(query)) return false;
    if (catSet.size > 0 && !catSet.has(item.categorySlug)) return false;
    if (!matchesPriceRange(item.currentPrice, state.priceRange)) return false;
    if (state.saleOnly && !item.isOnSale) return false;
    if (state.inStockOnly && item.isSoldOut) return false;
    if (state.bestSellerOnly && !item.isBestSeller) return false;
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (state.sort === 'price-asc') {
      return a.currentPrice - b.currentPrice || a.index - b.index;
    }
    if (state.sort === 'price-desc') {
      return b.currentPrice - a.currentPrice || a.index - b.index;
    }
    if (state.sort === 'name-asc') {
      return a.name.localeCompare(b.name, locale === 'en' ? 'en' : 'ar') || a.index - b.index;
    }
    return a.index - b.index;
  });

  return sorted;
}

export function buildActiveCatalogChips(
  state: CatalogFilterState,
  options: { showCategoryFilter?: boolean } = {},
  locale: Locale = 'ar'
): CatalogFilterChip[] {
  const chips: CatalogFilterChip[] = [];

  if (state.search.trim()) {
    chips.push({
      key: 'search',
      value: state.search.trim(),
      label: locale === 'en' ? `Search: "${state.search.trim()}"` : `بحث: «${state.search.trim()}»`,
    });
  }

  if (options.showCategoryFilter !== false) {
    for (const catSlug of state.categories) {
      const cat = CATEGORY_FILTER_OPTIONS.find((opt) => opt.slug === catSlug);
      chips.push({
        key: 'category',
        value: catSlug,
        label: cat ? (locale === 'en' ? cat.labelEn : cat.labelAr) : catSlug,
      });
    }
  }

  if (state.priceRange !== 'all') {
    const pr = PRICE_RANGE_OPTIONS.find((opt) => opt.value === state.priceRange);
    chips.push({
      key: 'priceRange',
      value: state.priceRange,
      label: pr ? (locale === 'en' ? pr.labelEn : pr.labelAr) : state.priceRange,
    });
  }

  if (state.saleOnly) {
    chips.push({
      key: 'saleOnly',
      value: '1',
      label: locale === 'en' ? 'Active Offers' : 'العروض النشطة',
    });
  }

  if (state.inStockOnly) {
    chips.push({
      key: 'inStockOnly',
      value: '1',
      label: locale === 'en' ? 'In Stock Only' : 'المتوفر فقط',
    });
  }

  if (state.bestSellerOnly) {
    chips.push({
      key: 'bestSellerOnly',
      value: '1',
      label: locale === 'en' ? 'Best Sellers' : 'الأكثر مبيعاً',
    });
  }

  return chips;
}

export function countActiveFilters(
  state: CatalogFilterState,
  options: { showCategoryFilter?: boolean } = {}
): number {
  return buildActiveCatalogChips(state, options).length;
}

/**
 * Ensures naive ISO timestamps emitted by campaign admin controls default to Africa/Cairo (+02:00).
 */
export function normalizeCairoIsoTimestamp(rawIso?: string | null): string | null {
  if (!rawIso || typeof rawIso !== 'string') return null;
  const trimmed = rawIso.trim();
  if (!trimmed) return null;
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+02:00`;
  }
  return trimmed;
}

export function computeCairoCountdown(
  targetIso?: string | null,
  nowMs: number = Date.now()
): CairoCountdown {
  const normalized = normalizeCairoIsoTimestamp(targetIso);
  if (!normalized) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const targetMs = Date.parse(normalized);
  if (!Number.isFinite(targetMs)) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const totalMs = Math.max(0, targetMs - nowMs);
  if (totalMs <= 0) {
    return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalMs,
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
  };
}

export function resolvePinkFridayDisplayMode(
  status: CampaignStatus,
  validOffersCount: number,
  validCollectionsCount: number
): PinkFridayDisplayMode {
  if (status === 'disabled') return 'disabled';
  if (status === 'upcoming') return 'upcoming';
  if (status === 'ended') return 'ended';

  const hasOffers = validOffersCount > 0;
  const hasCollections = validCollectionsCount > 0;
  if (hasOffers && hasCollections) return 'active-full';
  if (!hasOffers && hasCollections) return 'active-bundles-only';
  if (hasOffers && !hasCollections) return 'active-offers-only';
  return 'active-empty';
}
