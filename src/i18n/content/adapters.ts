/**
 * ============================================================================
 * DANDY COSMETICS — PURE LOCALIZED CONTENT ADAPTERS (PHASE 10)
 *
 * Architectural Contract:
 *  - Decouples Firebase RTDB (`Product`, `HomepageStudioState`, `PinkFridayCampaignData`)
 *    and Firestore (`Article`) records from localized presentation text.
 *  - NEVER mutates input objects, product IDs, prices, discounts, stock quantities,
 *    variant IDs, category slugs, Pink Friday pricing rules, or Studio ordering/visibility.
 *  - Returns explicit translation status (`hasTranslation`, `fallbackUsed`) alongside
 *    normalized localized copy so missing English copy never triggers silent mixed-language
 *    errors without detection.
 * ============================================================================
 */

import { getCategoryBySlug, getCategorySlugForProduct, type CategoryTaxonomy } from '../../utils/categories';
import type { Product, VariantItem } from '../../utils/products';
import type { Article } from '../../utils/articles';
import type { PinkFridayCampaignData } from '../../utils/pink-friday-server';
import type { HomepageStudioState } from '../../scripts/homepage-studio';
import { normalizeProductVariants } from '../../scripts/product-card';
import { GOVERNORATES, normalizeOrderStatusMeta } from '../../scripts/purchase-flow';
import { t } from '../translator';
import type {
  ArticleLocalizedContent,
  CategoryLocalizedContent,
  HomepageStudioLocalizedOverlay,
  Locale,
  PinkFridayLocalizedOverlay,
  ProductLocalizedContent,
} from '../types';
import { AR_CATEGORY_CONTENT } from './ar/categories';
import { EN_CATEGORY_CONTENT } from './en/categories';
import { extractArabicProductContent } from './ar/products';
import { EN_PRODUCT_CONTENT } from './en/products';
import { extractArabicArticleContent } from './ar/articles';
import { EN_ARTICLE_CONTENT } from './en/articles';

export interface LocalizedProductView {
  /** Exact source product preserved intact (price, id, stock, slug, variants, discount). */
  product: Product;
  categorySlug: string;
  locale: Locale;
  localization: {
    hasTranslation: boolean;
    fallbackUsed: boolean;
    content: ProductLocalizedContent;
    variants: Array<{
      id: string;
      sourceName: string;
      localizedName: string;
      isAvailable: boolean;
      price: number | null;
      hasVariantTranslation: boolean;
    }>;
  };
}

export interface LocalizedCategoryView {
  taxonomy: CategoryTaxonomy | null;
  slug: string;
  locale: Locale;
  hasTranslation: boolean;
  fallbackUsed: boolean;
  content: CategoryLocalizedContent;
}

export interface LocalizedArticleView {
  article: Article;
  locale: Locale;
  hasTranslation: boolean;
  fallbackUsed: boolean;
  content: ArticleLocalizedContent;
}

export interface ResolveProductContentOptions {
  customEnCatalog?: Readonly<Record<string, ProductLocalizedContent>>;
  fallbackToArabicWhenMissing?: boolean;
}

export interface ResolveCategoryContentOptions {
  customEnCatalog?: Readonly<Record<string, Partial<CategoryLocalizedContent>>>;
  fallbackToArabicWhenMissing?: boolean;
}

export interface ResolveArticleContentOptions {
  customEnCatalog?: Readonly<Record<string, ArticleLocalizedContent>>;
  fallbackToArabicWhenMissing?: boolean;
}

/**
 * Resolves localized product presentation without mutating `product` or its numeric/relational fields.
 */
export function resolveLocalizedProduct(
  product: Product,
  locale: Locale,
  options: ResolveProductContentOptions = {}
): LocalizedProductView {
  const categorySlug = getCategorySlugForProduct(product);
  const arContent = extractArabicProductContent(product);
  const normalizedVariants: VariantItem[] = normalizeProductVariants(product.variants);

  if (locale === 'ar') {
    return {
      product,
      categorySlug,
      locale: 'ar',
      localization: {
        hasTranslation: true,
        fallbackUsed: false,
        content: arContent,
        variants: normalizedVariants.map((v) => ({
          id: v.id,
          sourceName: v.name,
          localizedName: v.name,
          isAvailable: v.isAvailable !== false,
          price: typeof v.price === 'number' ? v.price : null,
          hasVariantTranslation: true,
        })),
      },
    };
  }

  const enCatalog = options.customEnCatalog || EN_PRODUCT_CONTENT;
  const enEntry = product.id ? enCatalog[product.id] : undefined;
  const fallbackAllowed = options.fallbackToArabicWhenMissing === true;

  if (enEntry) {
    const enVariantMap = enEntry.variantLabels || {};
    return {
      product,
      categorySlug,
      locale: 'en',
      localization: {
        hasTranslation: true,
        fallbackUsed: false,
        content: {
          ...enEntry,
          productId: product.id,
        },
        variants: normalizedVariants.map((v) => {
          const translatedLabel = enVariantMap[v.id];
          return {
            id: v.id,
            sourceName: v.name,
            localizedName: translatedLabel || v.name,
            isAvailable: v.isAvailable !== false,
            price: typeof v.price === 'number' ? v.price : null,
            hasVariantTranslation: Boolean(translatedLabel),
          };
        }),
      },
    };
  }

  const content: ProductLocalizedContent = fallbackAllowed
    ? { ...arContent }
    : {
        productId: product.id,
        name: `[untranslated:en:product:${product.id}:name]`,
        description: '',
        variantLabels: {},
      };

  return {
    product,
    categorySlug,
    locale: 'en',
    localization: {
      hasTranslation: false,
      fallbackUsed: fallbackAllowed,
      content,
      variants: normalizedVariants.map((v) => ({
        id: v.id,
        sourceName: v.name,
        localizedName: fallbackAllowed ? v.name : `[untranslated:en:variant:${v.id}]`,
        isAvailable: v.isAvailable !== false,
        price: typeof v.price === 'number' ? v.price : null,
        hasVariantTranslation: false,
      })),
    },
  };
}

/**
 * Resolves localized category copy cleanly by canonical slug.
 */
export function resolveLocalizedCategory(
  slug: string,
  locale: Locale,
  options: ResolveCategoryContentOptions = {}
): LocalizedCategoryView {
  const normalizedSlug = (slug || '').trim().toLowerCase();
  const taxonomy = getCategoryBySlug(normalizedSlug);
  const arEntry: CategoryLocalizedContent = AR_CATEGORY_CONTENT[normalizedSlug] || {
    slug: normalizedSlug,
    name: taxonomy?.arabicName || t('ar', 'categories.naturalCareFallback'),
    h1Title: taxonomy?.h1Title || t('ar', 'categories.naturalCareFallback'),
    introText: taxonomy?.introText || '',
    seoTitle: taxonomy?.seoTitle || t('ar', 'common.brandName'),
    seoDescription: taxonomy?.seoDescription || '',
  };

  if (locale === 'ar') {
    return {
      taxonomy,
      slug: normalizedSlug,
      locale: 'ar',
      hasTranslation: true,
      fallbackUsed: false,
      content: arEntry,
    };
  }

  const enCatalog = options.customEnCatalog || EN_CATEGORY_CONTENT;
  const enEntry = enCatalog[normalizedSlug];
  const fallbackAllowed = options.fallbackToArabicWhenMissing === true;
  const hasFullTranslation = Boolean(
    enEntry &&
      enEntry.name &&
      enEntry.h1Title &&
      enEntry.introText &&
      enEntry.seoTitle &&
      enEntry.seoDescription
  );

  const canonicalName = enEntry?.name || taxonomy?.name || t('en', 'categories.naturalCareFallback');

  return {
    taxonomy,
    slug: normalizedSlug,
    locale: 'en',
    hasTranslation: hasFullTranslation,
    fallbackUsed: !hasFullTranslation && fallbackAllowed,
    content: {
      slug: normalizedSlug,
      name: canonicalName,
      h1Title:
        enEntry?.h1Title ||
        (fallbackAllowed ? arEntry.h1Title : `[untranslated:en:category:${normalizedSlug}:h1Title]`),
      introText:
        enEntry?.introText ||
        (fallbackAllowed ? arEntry.introText : `[untranslated:en:category:${normalizedSlug}:introText]`),
      seoTitle:
        enEntry?.seoTitle ||
        (fallbackAllowed ? arEntry.seoTitle : `[untranslated:en:category:${normalizedSlug}:seoTitle]`),
      seoDescription:
        enEntry?.seoDescription ||
        (fallbackAllowed
          ? arEntry.seoDescription
          : `[untranslated:en:category:${normalizedSlug}:seoDescription]`),
      shortTagline: enEntry?.shortTagline,
    },
  };
}

/**
 * Resolves localized blog article content by document ID or canonical slug.
 */
export function resolveLocalizedArticle(
  article: Article,
  locale: Locale,
  options: ResolveArticleContentOptions = {}
): LocalizedArticleView {
  const arContent = extractArabicArticleContent(article);

  if (locale === 'ar') {
    return {
      article,
      locale: 'ar',
      hasTranslation: true,
      fallbackUsed: false,
      content: arContent,
    };
  }

  const enCatalog = options.customEnCatalog || EN_ARTICLE_CONTENT;
  const enEntry = enCatalog[article.id] || enCatalog[article.slug];
  const fallbackAllowed = options.fallbackToArabicWhenMissing === true;

  if (enEntry && enEntry.publishedInLocale) {
    return {
      article,
      locale: 'en',
      hasTranslation: true,
      fallbackUsed: false,
      content: {
        ...enEntry,
        articleId: article.id,
      },
    };
  }

  return {
    article,
    locale: 'en',
    hasTranslation: false,
    fallbackUsed: fallbackAllowed,
    content: fallbackAllowed
      ? { ...arContent }
      : {
          articleId: article.id,
          slug: article.slug,
          title: `[untranslated:en:article:${article.slug}:title]`,
          category: `[untranslated:en:article:${article.slug}:category]`,
          excerpt: '',
          contentHtml: '',
          publishedInLocale: false,
        },
  };
}

/**
 * Pure non-mutating presentation adapter for Homepage Studio state.
 * Preserves `sectionOrder`, `sectionsVisibility`, `manualProducts`, `limit`, `image`, `videoUrl`
 * untouched while overlaying optional localized copy for Phase 11 English homepage rendering.
 */
export function resolveLocalizedHomepageStudioState(
  state: HomepageStudioState,
  locale: Locale,
  overlay?: HomepageStudioLocalizedOverlay | null
): HomepageStudioState {
  if (locale === 'ar' || !overlay) {
    return state;
  }

  return {
    ...state,
    hero: state.hero.map((slide, idx) => {
      const ov = overlay.heroSlides?.[idx];
      if (!ov) return { ...slide };
      return {
        ...slide,
        title: ov.title ?? slide.title,
        subtitle: ov.subtitle ?? slide.subtitle,
        buttonText: ov.buttonText ?? slide.buttonText,
        link: ov.link ?? slide.link,
        desktopImage: ov.desktopImage ?? slide.desktopImage,
        mobileImage: ov.mobileImage ?? slide.mobileImage,
      };
    }),
    sections: state.sections.map((sec) => {
      const ov = overlay.sections?.[sec.id];
      if (!ov) return { ...sec };
      return {
        ...sec,
        title: ov.title ?? sec.title,
        subtitle: ov.subtitle ?? sec.subtitle,
      };
    }),
    trust: {
      item1: state.trust?.item1
        ? {
            ...state.trust.item1,
            title: overlay.trustItems?.item1?.title ?? state.trust.item1.title,
            desc: overlay.trustItems?.item1?.desc ?? state.trust.item1.desc,
          }
        : undefined,
      item2: state.trust?.item2
        ? {
            ...state.trust.item2,
            title: overlay.trustItems?.item2?.title ?? state.trust.item2.title,
            desc: overlay.trustItems?.item2?.desc ?? state.trust.item2.desc,
          }
        : undefined,
      item3: state.trust?.item3
        ? {
            ...state.trust.item3,
            title: overlay.trustItems?.item3?.title ?? state.trust.item3.title,
            desc: overlay.trustItems?.item3?.desc ?? state.trust.item3.desc,
          }
        : undefined,
    },
    reviews: state.reviews.map((rev, idx) => {
      const ov = overlay.reviews?.[idx];
      if (!ov) return { ...rev };
      return {
        ...rev,
        author: ov.author ?? rev.author,
        text: ov.text ?? rev.text,
      };
    }),
    promoBanner: state.promoBanner
      ? {
          ...state.promoBanner,
          eyebrow: overlay.promoBanner?.eyebrow ?? state.promoBanner.eyebrow,
          title: overlay.promoBanner?.title ?? state.promoBanner.title,
          desc: overlay.promoBanner?.desc ?? state.promoBanner.desc,
          ctaText: overlay.promoBanner?.ctaText ?? state.promoBanner.ctaText,
          ctaLink: overlay.promoBanner?.ctaLink ?? state.promoBanner.ctaLink,
        }
      : undefined,
    categories: Object.fromEntries(
      Object.entries(state.categories || {}).map(([key, catItem]) => {
        const ov = overlay.categories?.[key];
        return [
          key,
          ov
            ? {
                ...catItem,
                name: ov.name ?? catItem.name,
                tagline: ov.tagline ?? catItem.tagline,
                count: ov.count ?? catItem.count,
              }
            : { ...catItem },
        ];
      })
    ),
    customSections: state.customSections?.map((cs) => {
      const ov = overlay.customSections?.[cs.id];
      if (!ov) return { ...cs };
      return {
        ...cs,
        title: ov.title ?? cs.title,
        subtitle: ov.subtitle ?? cs.subtitle,
        content: ov.content ?? cs.content,
        eyebrow: ov.eyebrow ?? cs.eyebrow,
        desc: ov.desc ?? cs.desc,
        ctaText: ov.ctaText ?? cs.ctaText,
        ctaLink: ov.ctaLink ?? cs.ctaLink,
        linkText: ov.linkText ?? cs.linkText,
        linkUrl: ov.linkUrl ?? cs.linkUrl,
        items: Array.isArray(cs.items)
          ? cs.items.map((item, idx) => {
              const itemOv = ov.items?.[idx];
              if (!itemOv) return { ...item };
              return {
                ...item,
                title: itemOv.title ?? item.title,
                desc: itemOv.desc ?? item.desc,
                q: itemOv.q ?? item.q,
                a: itemOv.a ?? item.a,
                link: itemOv.link ?? item.link,
              };
            })
          : cs.items,
      };
    }),
  };
}

/**
 * Pure non-mutating Pink Friday localization overlay preserving pricing, offers, and collections math.
 */
export function resolveLocalizedPinkFridayCampaign(
  campaign: PinkFridayCampaignData,
  locale: Locale,
  overlay?: PinkFridayLocalizedOverlay | null
): PinkFridayCampaignData {
  if (locale === 'ar' || !overlay || overlay.campaignId !== campaign.id) {
    return campaign;
  }

  return {
    ...campaign,
    title: overlay.title || campaign.title,
    subtitleAr: overlay.subtitle || campaign.subtitleAr,
    visuals: campaign.visuals
      ? {
          ...campaign.visuals,
          subtitle: overlay.subtitle || campaign.visuals.subtitle,
          ctaText: overlay.ctaText || campaign.visuals.ctaText,
          badgeText: overlay.badgeText || campaign.visuals.badgeText,
          headline: overlay.headline || campaign.visuals.headline,
          heroImageUrl: overlay.heroImageOverride || campaign.visuals.heroImageUrl,
        }
      : campaign.visuals,
    collections: campaign.collections?.map((col) => {
      const colOv = overlay.collectionTextOverrides?.[col.id];
      if (!colOv) return { ...col };
      return {
        ...col,
        name: colOv.name ?? col.name,
        description: colOv.description ?? col.description,
        badgeText: colOv.badgeText ?? col.badgeText,
      };
    }),
  };
}

/**
 * Resolves customer-facing governorate label while keeping the backend `value`
 * (`Cairo`, `Gharbia`, `Assiut`, etc.) and `shippingFee` strictly intact.
 */
export function resolveLocalizedGovernorateLabel(
  governorateValue: string,
  locale: Locale = 'ar'
): string {
  const clean = (governorateValue || '').trim();
  const normalizedValue = clean === 'Asyut' ? 'Assiut' : clean;
  const entry = GOVERNORATES.find(
    (g) => g.value.toLowerCase() === normalizedValue.toLowerCase()
  );
  if (!entry) return clean;
  return locale === 'en' ? entry.value : entry.labelAr;
}

/**
 * Resolves localized order status label from `normalizeOrderStatusMeta` without modifying DB statuses.
 */
export function resolveLocalizedOrderStatusLabel(
  rawStatus: string | null | undefined,
  locale: Locale = 'ar'
): {
  canonicalKey: 'new' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  label: string;
} {
  const meta = normalizeOrderStatusMeta(rawStatus);
  if (locale === 'ar') {
    return { canonicalKey: meta.key, label: meta.label };
  }

  const enMap: Record<typeof meta.key, string> = {
    new: 'Pending Review',
    processing: 'Preparing Order',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return {
    canonicalKey: meta.key,
    label: enMap[meta.key],
  };
}
