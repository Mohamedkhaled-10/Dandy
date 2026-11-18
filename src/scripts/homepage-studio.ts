/**
 * DANDY COSMETICS — HOMEPAGE & ADMIN STUDIO SYNCHRONIZATION ENGINE
 * Pure, deterministic data resolvers shared between SSR (`index.astro`)
 * and live Admin Studio iframe preview (`homepage-studio-client.ts`).
 *
 * Strictly reuses existing Firebase RTDB contracts from `src/pages/dashboard-index.astro`.
 */

import { getAllCategories, CATEGORY_TAXONOMY } from '../utils/categories';
import type { Product } from '../utils/products';
import { selectFeaturedProducts, isProductSoldOut } from './product-card';
import type { DandyIconName } from './icons';
import type { Locale } from '../i18n/types';
import { buildLocalizedPath } from '../i18n/routes';
import { EN_CATEGORY_CONTENT } from '../i18n/content/en/categories';

export interface HeroSlide {
  desktopImage?: string;
  mobileImage?: string;
  image?: string;
  duration?: number;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  link?: string;
}

export interface DynamicSection {
  id: string;
  order?: number;
  visible?: boolean;
  title?: string;
  subtitle?: string;
  type?: 'manual' | 'bestsellers' | 'offers' | 'newArrivals' | string;
  manualProducts?: Record<string, boolean>;
  limit?: number;
}

export interface TrustItem {
  icon?: string;
  title?: string;
  desc?: string;
}

export interface ReviewItem {
  author?: string;
  text?: string;
  image?: string;
}

export interface StudioCategoryItem {
  id?: string;
  name?: string;
  tagline?: string;
  count?: string;
  layoutVariant?: 'auto' | 'wide' | 'large' | 'tall' | 'small';
  desktopImage?: string;
  mobileImage?: string;
  image?: string;
}

export interface PromoBannerConfig {
  eyebrow?: string;
  title?: string;
  desc?: string;
  ctaText?: string;
  ctaLink?: string;
  image?: string;
}

export interface CustomSectionItem {
  id?: string;
  title?: string;
  desc?: string;
  q?: string;
  a?: string;
  image?: string;
  link?: string;
  icon?: string;
}

export interface CustomSection {
  id: string;
  type: 'products' | 'banner' | 'trust' | 'story' | 'faq' | 'video' | 'gallery';
  title?: string;
  subtitle?: string;
  content?: string;
  author?: string;
  videoUrl?: string;
  poster?: string;
  eyebrow?: string;
  desc?: string;
  ctaText?: string;
  ctaLink?: string;
  image?: string;
  productSource?: 'all' | 'offers' | 'bestsellers' | 'manual';
  manualProducts?: Record<string, boolean>;
  limit?: number;
  linkText?: string;
  linkUrl?: string;
  items?: CustomSectionItem[];
}

export interface HomepageStudioState {
  hero: HeroSlide[];
  sections: DynamicSection[];
  trust: {
    item1?: TrustItem;
    item2?: TrustItem;
    item3?: TrustItem;
  };
  reviews: ReviewItem[];
  categories: Record<string, StudioCategoryItem>;
  promoBanner?: PromoBannerConfig;
  customSections?: CustomSection[];
  sectionOrder?: string[];
  sectionsVisibility?: Record<string, boolean>;
}

export const DEFAULT_SECTION_ORDER: readonly string[] = [
  'hero',
  'trust',
  'offers',
  'categories',
  'promo',
  'newArrivals',
  'blog',
  'reviews',
];

export const DEFAULT_HERO_SLIDE = {
  title: 'عناية طبيعية متوازنة لبشرة أكثر إشراقاً وشعر أكثر قوة',
  subtitle:
    'تركيبات صيدلانية لطيفة محضّرة من الزيوت النباتية والزبدات المغذية والفيتامينات، مصممة بعناية لتمنحكِ روتين عناية يومياً موثوقاً وخالياً من الإضافات القاسية.',
  buttonText: 'تسوقي الآن',
  link: '/all-products',
  desktopImage: '/assets/images/editorial/hero-botanical.jpg',
  mobileImage: '/assets/images/editorial/hero-botanical.jpg',
  durationSeconds: 5,
};

export const DEFAULT_PROMO_BANNER = {
  eyebrow: 'قصتنا وفلسفة التصنيع',
  title: 'تركيبات صيدلانية متطورة تجمع بين نقاء الطبيعة والفاعلية العلمية',
  desc: 'تأسست DANDY برؤية صيدلانية متخصصة في علم تصنيع مستحضرات التجميل، لتقديم منتجات للعناية بالبشرة والشعر والجسم تعتمد على الاختيار الدقيق للزيوت النباتية والزبدات المغذية والفيتامينات، بتركيبات متوازنة خالية من الإضافات الكيميائية القاسية.',
  ctaText: 'اكتشفي المجموعة',
  ctaLink: '/all-products',
  image: '/assets/images/editorial/story-botanical.jpg',
};

export const DEFAULT_TRUST_ITEMS: readonly {
  iconName: DandyIconName;
  title: string;
  desc: string;
}[] = [
  {
    iconName: 'leaf',
    title: 'تركيبات نباتية لطيفة',
    desc: 'زيوت نباتية وزبدات مغذية مختارة بعناية للاستخدام اليومي.',
  },
  {
    iconName: 'truck',
    title: 'توصيل لجميع المحافظات',
    desc: 'شحن منظم وموثوق لباب المنزل في القاهرة والمحافظات.',
  },
  {
    iconName: 'shield-check',
    title: 'جودة صيدلانية موثوقة',
    desc: 'تركيبات متوازنة خالية من الإضافات القاسية ومجربة.',
  },
];

export const DEFAULT_HERO_SLIDE_EN = {
  title: 'Balanced Botanical Care for Radiant Skin & Stronger Hair',
  subtitle:
    'Gentle pharmacist-formulated botanical blends enriched with plant oils, nourishing butters, and vitamins for a trusted daily ritual free from harsh additives.',
  buttonText: 'Shop Now',
  link: '/en/all-products',
  desktopImage: '/assets/images/editorial/hero-botanical.jpg',
  mobileImage: '/assets/images/editorial/hero-botanical.jpg',
  durationSeconds: 5,
};

export const DEFAULT_PROMO_BANNER_EN = {
  eyebrow: 'Our Story & Formulation Philosophy',
  title: 'Pharmacist-Crafted Formulas Blending Botanical Purity with Proven Care',
  desc: 'Founded with specialized pharmaceutical formulation expertise, DANDY offers thoughtfully balanced skincare, haircare, body care, and fragrance essentials powered by pure plant oils, rich butters, and vitamins—free from harsh chemicals.',
  ctaText: 'Explore the Collection',
  ctaLink: '/en/all-products',
  image: '/assets/images/editorial/story-botanical.jpg',
};

export const DEFAULT_TRUST_ITEMS_EN: readonly {
  iconName: DandyIconName;
  title: string;
  desc: string;
}[] = [
  {
    iconName: 'leaf',
    title: 'Gentle Botanical Formulas',
    desc: 'Carefully selected plant oils and nourishing butters for daily care.',
  },
  {
    iconName: 'truck',
    title: 'Nationwide Delivery',
    desc: 'Organized door-to-door shipping across Cairo and all governorates.',
  },
  {
    iconName: 'shield-check',
    title: 'Trusted Pharmacist Quality',
    desc: 'Balanced formulas free from harsh additives and thoughtfully tested.',
  },
];

export interface ResolvedHeroSlide {
  index: number;
  desktopImage: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  buttonText: string;
  link: string;
  durationSeconds: number;
  hasCustomCopy: boolean;
}

export interface ResolvedTrustItem {
  iconName: DandyIconName;
  title: string;
  desc: string;
}

export interface ResolvedCategoryCard {
  key: string;
  slug: string | null;
  href: string;
  name: string;
  englishName: string;
  tagline: string;
  count: string;
  description: string;
  layoutVariant: 'auto' | 'wide' | 'large' | 'tall' | 'small';
  desktopImage: string;
  mobileImage: string;
}

export interface ResolvedDynamicProductSection {
  sectionKey: 'offers' | 'newArrivals';
  id: string;
  type: 'offers' | 'bestsellers' | 'manual' | 'newArrivals';
  title: string;
  subtitle: string;
  visible: boolean;
  manualProducts: Record<string, boolean>;
  limit: number;
  viewAllHref: string;
  viewAllLabel: string;
}

export interface OrderedHomepageEntry {
  id: string;
  kind: 'builtin' | 'custom' | 'pink-friday';
  visible: boolean;
  customSection?: CustomSection;
}

export type ResolvedVideoMedia =
  | { kind: 'youtube'; embedUrl: string; poster: string }
  | { kind: 'vimeo'; embedUrl: string; poster: string }
  | { kind: 'video'; src: string; poster: string }
  | { kind: 'invalid'; poster: string };

/**
 * Sanitizes external and relative asset URLs while eliminating fragile/unsafe URLs.
 */
export function sanitizeMediaUrl(rawUrl: unknown, fallback = ''): string {
  if (typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return fallback;
  if (trimmed.includes('images.unsplash.com')) return fallback;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:text/html')) {
    return fallback;
  }
  return trimmed;
}

/**
 * Sanitizes navigation target URLs for CTAs and gallery links.
 */
export function sanitizeNavHref(rawHref: unknown, fallback = '/all-products'): string {
  if (typeof rawHref !== 'string') return fallback;
  const trimmed = rawHref.trim();
  if (!trimmed) return fallback;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return fallback;
  }
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    lower.startsWith('https://') ||
    lower.startsWith('http://')
  ) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+/, '')}`;
}

export function localizeInternalStoreHref(rawHref: string, locale: Locale): string {
  if (locale !== 'en') return rawHref;
  if (!rawHref.startsWith('/')) return rawHref;
  const lower = rawHref.toLowerCase();
  if (
    lower.startsWith('/en/') ||
    lower === '/en' ||
    lower.startsWith('/dashboard') ||
    lower.startsWith('/login') ||
    lower.startsWith('/api/')
  ) {
    return rawHref;
  }
  const [pathPart, hashPart] = rawHref.split('#');
  const [pathname, searchPart] = pathPart.split('?');
  const canonicalPath = pathname.toLowerCase() === '/offers' ? '/special-offers' : pathname;
  const localizedPath = buildLocalizedPath(canonicalPath || '/', 'en');
  return `${localizedPath}${searchPart ? `?${searchPart}` : ''}${hashPart ? `#${hashPart}` : ''}`;
}

/**
 * Maps legacy Studio FontAwesome tokens (e.g. `fas fa-seedling`, `fa-truck-fast`)
 * cleanly onto the unified Lucide SVG icon registry without FontAwesome dependencies.
 */
export function mapStudioIconToLucide(rawIcon?: string): DandyIconName {
  const token = (rawIcon || '').toLowerCase();
  if (!token) return 'sparkles';
  if (token.includes('leaf') || token.includes('seedling') || token.includes('spa')) return 'leaf';
  if (token.includes('truck') || token.includes('shipping')) return 'truck';
  if (token.includes('shield') || token.includes('award') || token.includes('medal') || token.includes('lock')) {
    return 'shield-check';
  }
  if (token.includes('heart') || token.includes('hand-holding')) return 'heart';
  if (token.includes('star') || token.includes('thumbs')) return 'star';
  if (token.includes('undo') || token.includes('rotate') || token.includes('sync')) return 'rotate-ccw';
  if (token.includes('tag') || token.includes('percent')) return 'tag';
  if (token.includes('gift')) return 'gift';
  if (token.includes('clock')) return 'clock';
  if (token.includes('box') || token.includes('package')) return 'package-check';
  if (token.includes('check')) return 'check-circle';
  if (token.includes('phone')) return 'phone';
  if (token.includes('comment') || token.includes('whatsapp') || token.includes('message')) {
    return 'message-circle';
  }
  return 'sparkles';
}

/**
 * Resolves Hero slides cleanly, falling back to grounded Botanical Editorial copy
 * when RTDB slides contain only imagery (empty strings) while applying custom text
 * immediately when set in the Admin Studio.
 */
export function resolveHeroSlides(
  rawHero?: HeroSlide[] | Record<string, HeroSlide>,
  locale: Locale = 'ar'
): ResolvedHeroSlide[] {
  const defaultSlide = locale === 'en' ? DEFAULT_HERO_SLIDE_EN : DEFAULT_HERO_SLIDE;
  const list: HeroSlide[] = Array.isArray(rawHero)
    ? rawHero
    : rawHero && typeof rawHero === 'object'
      ? Object.values(rawHero)
      : [];

  if (list.length === 0) {
    return [{ index: 0, ...defaultSlide, hasCustomCopy: false }];
  }

  const normalized: ResolvedHeroSlide[] = [];
  list.forEach((slide, idx) => {
    if (!slide || typeof slide !== 'object') return;
    const desktop = sanitizeMediaUrl(
      slide.desktopImage || slide.image || slide.mobileImage,
      defaultSlide.desktopImage
    );
    const mobile = sanitizeMediaUrl(
      slide.mobileImage || slide.desktopImage || slide.image,
      desktop || defaultSlide.mobileImage
    );
    const titleTrimmed = typeof slide.title === 'string' ? slide.title.trim() : '';
    const subtitleTrimmed = typeof slide.subtitle === 'string' ? slide.subtitle.trim() : '';
    const btnTrimmed = typeof slide.buttonText === 'string' ? slide.buttonText.trim() : '';
    const linkTrimmed = typeof slide.link === 'string' ? slide.link.trim() : '';

    const rawDuration = Number(slide.duration);
    const durationSeconds =
      Number.isFinite(rawDuration) && rawDuration >= 1 && rawDuration <= 60
        ? rawDuration
        : defaultSlide.durationSeconds;

    const rawSanitizedLink = linkTrimmed ? sanitizeNavHref(linkTrimmed, defaultSlide.link) : defaultSlide.link;

    normalized.push({
      index: idx,
      desktopImage: desktop,
      mobileImage: mobile,
      title: titleTrimmed || defaultSlide.title,
      subtitle: subtitleTrimmed || defaultSlide.subtitle,
      buttonText: btnTrimmed || defaultSlide.buttonText,
      link: localizeInternalStoreHref(rawSanitizedLink, locale),
      durationSeconds,
      hasCustomCopy: Boolean(titleTrimmed || subtitleTrimmed || btnTrimmed),
    });
  });

  if (normalized.length === 0) {
    return [{ index: 0, ...defaultSlide, hasCustomCopy: false }];
  }
  return normalized;
}

/**
 * Resolves standard `trust` strip (`{ item1, item2, item3 }`) or custom `trust` items.
 */
export function resolveTrustItems(
  trustConfig?: HomepageStudioState['trust'],
  customItems?: CustomSectionItem[],
  locale: Locale = 'ar'
): ResolvedTrustItem[] {
  const defaultTrust = locale === 'en' ? DEFAULT_TRUST_ITEMS_EN : DEFAULT_TRUST_ITEMS;

  if (Array.isArray(customItems) && customItems.length > 0) {
    return customItems
      .filter((item) => item && (item.title || item.desc))
      .map((item, idx) => ({
        iconName: mapStudioIconToLucide(item.icon || (idx === 0 ? 'fa-leaf' : idx === 1 ? 'fa-truck' : 'fa-shield-alt')),
        title: (item.title || '').trim() || defaultTrust[idx % 3].title,
        desc: (item.desc || '').trim() || '',
      }));
  }

  const keys: Array<'item1' | 'item2' | 'item3'> = ['item1', 'item2', 'item3'];
  const mapped: ResolvedTrustItem[] = [];

  keys.forEach((key, idx) => {
    const raw = trustConfig?.[key];
    const fallback = defaultTrust[idx];
    if (raw && (raw.title?.trim() || raw.desc?.trim())) {
      mapped.push({
        iconName: mapStudioIconToLucide(raw.icon),
        title: (raw.title || '').trim() || fallback.title,
        desc: (raw.desc || '').trim() || '',
      });
    } else if (!trustConfig || (!trustConfig.item1 && !trustConfig.item2 && !trustConfig.item3)) {
      mapped.push({ ...fallback });
    }
  });

  return mapped.length > 0 ? mapped : defaultTrust.map((i) => ({ ...i }));
}

/**
 * Resolves the `offers` or `newArrivals` dynamic product section record from Studio state
 * preserving compatibility with both explicit section IDs and legacy `type` lookup.
 */
export function resolveDynamicProductSection(
  state: Pick<HomepageStudioState, 'sections' | 'sectionsVisibility'>,
  secKey: 'offers' | 'newArrivals',
  locale: Locale = 'ar'
): ResolvedDynamicProductSection {
  const list = Array.isArray(state.sections) ? state.sections : [];

  const offersCandidate =
    list.find((s) => s && (s.id === 'sec-special-offers' || s.id === 'sec-offers')) ||
    list.find((s) => s && s.type === 'offers');

  const newArrivalsCandidate =
    list.find((s) => s && (s.id === 'sec-new-arrivals' || s.id === 'sec-newArrivals')) ||
    list.find((s) => s && s.id !== offersCandidate?.id && s.type !== 'offers');

  const matched = secKey === 'offers' ? offersCandidate : newArrivalsCandidate;

  const defaultTitle =
    locale === 'en'
      ? secKey === 'offers'
        ? 'Special Offers'
        : 'Curated Everyday Essentials'
      : secKey === 'offers'
        ? 'العروض الخاصة'
        : 'مستحضرات مختارة لروتينكِ اليومي';
  const defaultSubtitle =
    locale === 'en'
      ? secKey === 'offers'
        ? 'Limited Deals'
        : 'DANDY Picks'
      : secKey === 'offers'
        ? 'مختارات العروض'
        : 'مختارات داندي';

  const rawType = matched?.type;
  const resolvedType: ResolvedDynamicProductSection['type'] =
    rawType === 'offers' || rawType === 'bestsellers' || rawType === 'manual'
      ? rawType
      : secKey === 'offers'
        ? 'offers'
        : 'newArrivals';

  const visMap = state.sectionsVisibility;
  let visible = true;
  if (visMap && visMap[secKey] !== undefined) {
    visible = visMap[secKey] !== false;
  } else if (matched && matched.visible !== undefined) {
    visible = matched.visible !== false;
  }

  const rawLimit = Number(matched?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit >= 2 && rawLimit <= 12 ? Math.round(rawLimit) : 8;
  const isOffers = secKey === 'offers' || resolvedType === 'offers';

  return {
    sectionKey: secKey,
    id: matched?.id || `sec-${secKey}`,
    type: resolvedType,
    title: (matched?.title || '').trim() || defaultTitle,
    subtitle: (matched?.subtitle || '').trim() || defaultSubtitle,
    visible,
    manualProducts:
      matched?.manualProducts && typeof matched.manualProducts === 'object'
        ? { ...matched.manualProducts }
        : {},
    limit,
    viewAllHref:
      locale === 'en'
        ? buildLocalizedPath(isOffers ? '/special-offers' : '/all-products', 'en')
        : isOffers
          ? '/offers'
          : '/all-products',
    viewAllLabel:
      locale === 'en'
        ? isOffers
          ? 'Browse Offers'
          : 'Shop Full Catalog'
        : isOffers
          ? 'تصفحي العروض'
          : 'عرض المتجر بالكامل',
  };
}

/**
 * Selects visible products for either built-in product sections (`offers`, `newArrivals`)
 * or custom `products` sections.
 */
export function selectProductsForStudioSection(
  allProducts: Product[],
  options: {
    source: 'all' | 'offers' | 'bestsellers' | 'manual' | 'newArrivals' | string;
    manualProducts?: Record<string, boolean>;
    limit?: number;
  }
): Product[] {
  const safeLimit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(12, Math.round(options.limit)))
      : 8;

  const visible = (allProducts || []).filter((p) => p && !p.isHidden && Number(p.price) > 0);
  if (visible.length === 0) return [];

  const inStockFirst = (arr: Product[]) => {
    const inStock = arr.filter((p) => !isProductSoldOut(p));
    const soldOut = arr.filter((p) => isProductSoldOut(p));
    return [...inStock, ...soldOut];
  };

  if (options.source === 'manual') {
    const selectedIds = options.manualProducts || {};
    const manualMatches = visible.filter((p) => Boolean(selectedIds[p.id]));
    if (manualMatches.length > 0) {
      return inStockFirst(manualMatches).slice(0, safeLimit);
    }
    return selectFeaturedProducts(visible, safeLimit);
  }

  if (options.source === 'offers') {
    const offerMatches = visible.filter((p) => {
      const hasDiscount = Number(p.discount) > 0;
      const hasOriginalHigher = Number(p.originalPrice) > Number(p.price);
      return Boolean(p.onSale || hasDiscount || hasOriginalHigher);
    });
    if (offerMatches.length > 0) {
      return inStockFirst(offerMatches).slice(0, safeLimit);
    }
    return selectFeaturedProducts(visible, safeLimit);
  }

  if (options.source === 'bestsellers') {
    const bestMatches = [...visible].sort((a, b) => {
      const aScore = (a.bestSeller ? 10 : 0) + (Number(a.reviewCount) || 0) * 0.2 + (Number(a.avgRating) || 0);
      const bScore = (b.bestSeller ? 10 : 0) + (Number(b.reviewCount) || 0) * 0.2 + (Number(b.avgRating) || 0);
      return bScore - aScore;
    });
    return inStockFirst(bestMatches).slice(0, safeLimit);
  }

  return selectFeaturedProducts(visible, safeLimit);
}

/**
 * Matches an RTDB/Studio category record name/key onto one of the 4 canonical SEO category slugs.
 */
function matchCanonicalCategorySlug(rawName?: string, rawId?: string): string | null {
  const probe = `${rawName || ''} ${rawId || ''}`.toLowerCase().trim();
  if (!probe) return null;
  if (probe.includes('hair') || probe.includes('شعر')) return 'hair-care';
  if (probe.includes('body') || probe.includes('جسم')) return 'body-care';
  if (probe.includes('fragrance') || probe.includes('perfume') || probe.includes('عطور') || probe.includes('عطر')) {
    return 'fragrance';
  }
  if (probe.includes('skin') || probe.includes('بشرة') || probe.includes('وجه')) return 'skin-care';
  return null;
}

/**
 * Resolves Studio `/categories` entries synchronized with canonical SEO `/category/<slug>` routes.
 * Always keeps responsive images cleanly sanitized and preserves custom Studio categories safely.
 */
export function resolveCategoriesForShowcase(
  studioCategories?: Record<string, StudioCategoryItem>,
  locale: Locale = 'ar'
): ResolvedCategoryCard[] {
  const canonicalList = getAllCategories();
  const entries =
    studioCategories && typeof studioCategories === 'object' ? Object.entries(studioCategories) : [];

  if (entries.length === 0) {
    return canonicalList.map((cat) => {
      const enCat = EN_CATEGORY_CONTENT[cat.slug];
      return {
        key: cat.slug,
        slug: cat.slug,
        href: buildLocalizedPath(`/category/${cat.slug}`, locale),
        name: locale === 'en' ? enCat?.name || cat.name : cat.arabicName,
        englishName: cat.name,
        tagline: '',
        count: '',
        description: locale === 'en' ? enCat?.shortTagline || enCat?.introText || cat.introText : cat.introText,
        layoutVariant: 'auto',
        desktopImage: sanitizeMediaUrl(cat.image, '/assets/images/index-products/product-2.jpg'),
        mobileImage: sanitizeMediaUrl(cat.image, '/assets/images/index-products/product-2.jpg'),
      };
    });
  }

  const fallbackImg = '/assets/images/index-products/product-2.jpg';
  const resolved: ResolvedCategoryCard[] = [];
  const usedCanonicalSlugs = new Set<string>();

  for (const [key, item] of entries) {
    if (!item || typeof item !== 'object') continue;
    const rawName = (item.name || '').trim();
    if (!rawName) continue;

    const matchedSlug = matchCanonicalCategorySlug(rawName, item.id || key);
    const taxonomy = matchedSlug ? CATEGORY_TAXONOMY[matchedSlug] : null;
    if (matchedSlug) usedCanonicalSlugs.add(matchedSlug);

    const desktop = sanitizeMediaUrl(
      item.desktopImage || item.image || item.mobileImage || taxonomy?.image,
      fallbackImg
    );
    const mobile = sanitizeMediaUrl(
      item.mobileImage || item.desktopImage || item.image || taxonomy?.image,
      desktop || fallbackImg
    );

    const layoutVariant: ResolvedCategoryCard['layoutVariant'] =
      item.layoutVariant === 'wide' ||
      item.layoutVariant === 'large' ||
      item.layoutVariant === 'tall' ||
      item.layoutVariant === 'small'
        ? item.layoutVariant
        : 'auto';

    const enCat = taxonomy ? EN_CATEGORY_CONTENT[taxonomy.slug] : undefined;
    const isExactCanonicalEnglish =
      taxonomy &&
      (rawName.toLowerCase() === taxonomy.name.toLowerCase() ||
        (rawName.toLowerCase() === 'fragrances' && taxonomy.slug === 'fragrance'));

    const displayName =
      locale === 'en'
        ? enCat?.name || taxonomy?.name || rawName
        : taxonomy && isExactCanonicalEnglish
          ? taxonomy.arabicName
          : rawName;
    const englishName = enCat?.name || taxonomy?.name || rawName;
    const baseHref = taxonomy
      ? `/category/${taxonomy.slug}`
      : `/all-products?category=${encodeURIComponent(rawName)}`;

    resolved.push({
      key,
      slug: taxonomy?.slug || null,
      href: locale === 'en' ? localizeInternalStoreHref(baseHref, 'en') : baseHref,
      name: displayName,
      englishName,
      tagline: (item.tagline || '').trim(),
      count: (item.count || '').trim(),
      description:
        locale === 'en'
          ? enCat?.shortTagline || enCat?.introText || (item.tagline || '').trim() || 'Curated DANDY Essentials'
          : taxonomy?.introText || (item.tagline || '').trim() || 'منتجات مختارة من داندي',
      layoutVariant,
      desktopImage: desktop,
      mobileImage: mobile,
    });
  }

  return resolved.length > 0 ? resolved : resolveCategoriesForShowcase(undefined, locale);
}

/**
 * Resolves the editorial Promo Banner (`promo` section) with Botanical Editorial fallback.
 */
export function resolvePromoBanner(
  promo?: PromoBannerConfig,
  locale: Locale = 'ar'
): {
  eyebrow: string;
  title: string;
  desc: string;
  ctaText: string;
  ctaLink: string;
  image: string;
  isCustomized: boolean;
} {
  const defaultPromo = locale === 'en' ? DEFAULT_PROMO_BANNER_EN : DEFAULT_PROMO_BANNER;
  const eyebrow = (promo?.eyebrow || '').trim() || defaultPromo.eyebrow;
  const title = (promo?.title || '').trim() || defaultPromo.title;
  const desc = (promo?.desc || '').trim() || defaultPromo.desc;
  const ctaText = (promo?.ctaText || '').trim() || defaultPromo.ctaText;
  const ctaLink = localizeInternalStoreHref(sanitizeNavHref(promo?.ctaLink, defaultPromo.ctaLink), locale);
  const image = sanitizeMediaUrl(promo?.image, defaultPromo.image);

  const isCustomized = Boolean(
    promo && (promo.eyebrow?.trim() || promo.title?.trim() || promo.desc?.trim() || promo.image?.trim())
  );

  return { eyebrow, title, desc, ctaText, ctaLink, image, isCustomized };
}

/**
 * Checks whether a Studio section ID should be visible.
 */
export function resolveSectionVisibility(sectionId: string, state: HomepageStudioState): boolean {
  if (state.sectionsVisibility && state.sectionsVisibility[sectionId] !== undefined) {
    return state.sectionsVisibility[sectionId] !== false;
  }
  if (sectionId === 'offers' || sectionId === 'newArrivals') {
    return resolveDynamicProductSection(state, sectionId).visible;
  }
  return true;
}

/**
 * Produces the exact ordered section list honoring `sectionOrder`, `sectionsVisibility`,
 * `customSections`, and conditional `pink-friday` placement.
 */
export function resolveOrderedHomepageEntries(
  state: HomepageStudioState,
  includePinkFriday = false
): OrderedHomepageEntry[] {
  const customList = Array.isArray(state.customSections) ? state.customSections : [];
  const customMap = new Map<string, CustomSection>();
  customList.forEach((sec) => {
    if (sec && sec.id) {
      customMap.set(sec.id, sec);
    }
  });

  const baseOrder =
    Array.isArray(state.sectionOrder) && state.sectionOrder.length > 0
      ? [...state.sectionOrder]
      : [...DEFAULT_SECTION_ORDER];

  const entries: OrderedHomepageEntry[] = [];
  const seen = new Set<string>();

  const builtinSet = new Set(DEFAULT_SECTION_ORDER);

  for (const id of baseOrder) {
    if (!id || seen.has(id)) continue;

    if (builtinSet.has(id)) {
      seen.add(id);
      entries.push({
        id,
        kind: 'builtin',
        visible: resolveSectionVisibility(id, state),
      });
    } else if (customMap.has(id)) {
      seen.add(id);
      entries.push({
        id,
        kind: 'custom',
        visible: resolveSectionVisibility(id, state),
        customSection: customMap.get(id),
      });
    }
  }

  // Ensure all built-in Studio sections not explicitly dropped from order are appended safely
  for (const id of DEFAULT_SECTION_ORDER) {
    if (!seen.has(id)) {
      seen.add(id);
      entries.push({
        id,
        kind: 'builtin',
        visible: resolveSectionVisibility(id, state),
      });
    }
  }

  // Ensure any customSections not present in sectionOrder are appended
  for (const sec of customList) {
    if (sec?.id && !seen.has(sec.id)) {
      seen.add(sec.id);
      entries.push({
        id: sec.id,
        kind: 'custom',
        visible: resolveSectionVisibility(sec.id, state),
        customSection: sec,
      });
    }
  }

  // Insert conditional Pink Friday campaign showcase right after `offers` (or `categories` / `hero`)
  if (includePinkFriday && !seen.has('pink-friday')) {
    const anchorIds = ['offers', 'categories', 'hero'];
    let insertIdx = entries.length;
    for (const anchor of anchorIds) {
      const idx = entries.findIndex((e) => e.id === anchor);
      if (idx !== -1) {
        insertIdx = idx + 1;
        break;
      }
    }
    entries.splice(insertIdx, 0, {
      id: 'pink-friday',
      kind: 'pink-friday',
      visible: true,
    });
  }

  return entries;
}

/**
 * Safely parses YouTube, Vimeo, or direct MP4/WebM URLs for Studio custom `video` sections.
 */
export function resolveVideoMedia(rawVideoUrl?: string, rawPoster?: string): ResolvedVideoMedia {
  const poster = sanitizeMediaUrl(rawPoster, '/assets/images/editorial/hero-botanical.jpg');
  const trimmed = typeof rawVideoUrl === 'string' ? rawVideoUrl.trim() : '';
  if (!trimmed) {
    return { kind: 'invalid', poster };
  }

  // Reject unsafe schemes immediately
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('https://') && !lower.startsWith('http://') && !trimmed.startsWith('/')) {
    return { kind: 'invalid', poster };
  }

  try {
    const parsed = new URL(trimmed, 'https://dandy-ebon.vercel.app');
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (id && /^[\w-]{6,}$/.test(id)) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`,
          poster,
        };
      }
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[\w-]{6,}$/.test(v)) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}?rel=0`,
          poster,
        };
      }
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 2 && (segments[0] === 'embed' || segments[0] === 'shorts')) {
        const id = segments[1];
        if (id && /^[\w-]{6,}$/.test(id)) {
          return {
            kind: 'youtube',
            embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`,
            poster,
          };
        }
      }
    }

    if (host === 'vimeo.com') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (id && /^\d+$/.test(id)) {
        return {
          kind: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${id}`,
          poster,
        };
      }
    }
  } catch {
    return { kind: 'invalid', poster };
  }

  return { kind: 'video', src: trimmed, poster };
}

/**
 * Merges incoming `STUDIO_UPDATE_STATE` payload cleanly with an existing HomepageStudioState.
 */
export function mergeStudioPreviewState(
  baseState: HomepageStudioState,
  incoming: Partial<HomepageStudioState> | null | undefined
): HomepageStudioState {
  if (!incoming || typeof incoming !== 'object') {
    return baseState;
  }

  return {
    hero: Array.isArray(incoming.hero) ? incoming.hero : baseState.hero,
    sections: Array.isArray(incoming.sections) ? incoming.sections : baseState.sections,
    trust: incoming.trust && typeof incoming.trust === 'object' ? incoming.trust : baseState.trust,
    reviews: Array.isArray(incoming.reviews) ? incoming.reviews : baseState.reviews,
    categories:
      incoming.categories && typeof incoming.categories === 'object'
        ? incoming.categories
        : baseState.categories,
    promoBanner:
      incoming.promoBanner && typeof incoming.promoBanner === 'object'
        ? incoming.promoBanner
        : baseState.promoBanner,
    customSections: Array.isArray(incoming.customSections)
      ? incoming.customSections
      : baseState.customSections,
    sectionOrder: Array.isArray(incoming.sectionOrder)
      ? incoming.sectionOrder
      : baseState.sectionOrder,
    sectionsVisibility:
      incoming.sectionsVisibility && typeof incoming.sectionsVisibility === 'object'
        ? incoming.sectionsVisibility
        : baseState.sectionsVisibility,
  };
}
