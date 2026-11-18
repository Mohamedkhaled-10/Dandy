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
import {
  matchCanonicalCategorySlug,
  type HomepageStudioState,
} from '../../scripts/homepage-studio';
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

function pickNonEmptyString(...vals: Array<string | undefined | null>): string | undefined {
  for (const val of vals) {
    if (typeof val === 'string' && val.trim() !== '') {
      return val.trim();
    }
  }
  return undefined;
}

/**
 * Pure non-mutating presentation adapter for Homepage Studio state.
 * Preserves `sectionOrder`, `sectionsVisibility`, `manualProducts`, `limit`, `image`, `videoUrl`
 * untouched while deep-merging dynamic `state.enOverlay` (saved in Admin Studio) over
 * the static `HomepageStudioLocalizedOverlay` for complete AR/EN independence.
 */
export function resolveLocalizedHomepageStudioState(
  state: HomepageStudioState,
  locale: Locale,
  overlay?: HomepageStudioLocalizedOverlay | null
): HomepageStudioState {
  if (locale === 'ar') {
    return state;
  }

  const dyn = state.enOverlay || null;
  if (!overlay && !dyn) {
    return state;
  }

  const staticOv = overlay || null;

  return {
    ...state,
    heroMeta: {
      ...(state.heroMeta || {}),
      kicker: pickNonEmptyString(dyn?.heroMeta?.kicker, staticOv?.heroMeta?.kicker),
      secondaryCtaLabel: pickNonEmptyString(
        dyn?.heroMeta?.secondaryCtaLabel,
        staticOv?.heroMeta?.secondaryCtaLabel
      ),
      secondaryCtaHref: pickNonEmptyString(
        dyn?.heroMeta?.secondaryCtaHref,
        staticOv?.heroMeta?.secondaryCtaHref,
        state.heroMeta?.secondaryCtaHref
      ),
    },
    hero: state.hero.map((slide, idx) => {
      const sOv = staticOv?.heroSlides?.[idx];
      const dOv = dyn?.heroSlides?.[idx];
      if (!sOv && !dOv) return { ...slide };
      return {
        ...slide,
        title: pickNonEmptyString(dOv?.title, sOv?.title) ?? slide.title,
        subtitle: pickNonEmptyString(dOv?.subtitle, sOv?.subtitle) ?? slide.subtitle,
        buttonText: pickNonEmptyString(dOv?.buttonText, sOv?.buttonText) ?? slide.buttonText,
        link: pickNonEmptyString(dOv?.link, sOv?.link, slide.link) ?? slide.link,
        desktopImage: pickNonEmptyString(dOv?.desktopImage, sOv?.desktopImage, slide.desktopImage) ?? slide.desktopImage,
        mobileImage: pickNonEmptyString(dOv?.mobileImage, sOv?.mobileImage, slide.mobileImage) ?? slide.mobileImage,
      };
    }),
    sections: state.sections.map((sec) => {
      const altKey =
        sec.id === 'sec-special-offers'
          ? 'offers'
          : sec.id === 'sec-new-arrivals'
            ? 'newArrivals'
            : undefined;
      const dOv = dyn?.sections?.[sec.id] || (altKey ? dyn?.sections?.[altKey] : undefined);
      const sOv = staticOv?.sections?.[sec.id] || (altKey ? staticOv?.sections?.[altKey] : undefined);
      if (!dOv && !sOv) return { ...sec };
      return {
        ...sec,
        title: pickNonEmptyString(dOv?.title, sOv?.title) ?? sec.title,
        subtitle: pickNonEmptyString(dOv?.subtitle, sOv?.subtitle) ?? sec.subtitle,
        viewAllLabel: pickNonEmptyString(dOv?.viewAllLabel, sOv?.viewAllLabel, sec.viewAllLabel),
        viewAllHref: pickNonEmptyString(dOv?.viewAllHref, sOv?.viewAllHref, sec.viewAllHref),
      };
    }),
    trustSection: {
      ...(state.trustSection || {}),
      kicker: pickNonEmptyString(dyn?.trustSection?.kicker, staticOv?.trustSection?.kicker),
      title: pickNonEmptyString(dyn?.trustSection?.title, staticOv?.trustSection?.title),
    },
    trust: {
      item1: state.trust?.item1
        ? {
            ...state.trust.item1,
            title:
              pickNonEmptyString(dyn?.trustItems?.item1?.title, staticOv?.trustItems?.item1?.title) ??
              state.trust.item1.title,
            desc:
              pickNonEmptyString(dyn?.trustItems?.item1?.desc, staticOv?.trustItems?.item1?.desc) ??
              state.trust.item1.desc,
          }
        : undefined,
      item2: state.trust?.item2
        ? {
            ...state.trust.item2,
            title:
              pickNonEmptyString(dyn?.trustItems?.item2?.title, staticOv?.trustItems?.item2?.title) ??
              state.trust.item2.title,
            desc:
              pickNonEmptyString(dyn?.trustItems?.item2?.desc, staticOv?.trustItems?.item2?.desc) ??
              state.trust.item2.desc,
          }
        : undefined,
      item3: state.trust?.item3
        ? {
            ...state.trust.item3,
            title:
              pickNonEmptyString(dyn?.trustItems?.item3?.title, staticOv?.trustItems?.item3?.title) ??
              state.trust.item3.title,
            desc:
              pickNonEmptyString(dyn?.trustItems?.item3?.desc, staticOv?.trustItems?.item3?.desc) ??
              state.trust.item3.desc,
          }
        : undefined,
      item4: state.trust?.item4
        ? {
            ...state.trust.item4,
            title:
              pickNonEmptyString(dyn?.trustItems?.item4?.title, staticOv?.trustItems?.item4?.title) ??
              state.trust.item4.title,
            desc:
              pickNonEmptyString(dyn?.trustItems?.item4?.desc, staticOv?.trustItems?.item4?.desc) ??
              state.trust.item4.desc,
          }
        : undefined,
    },
    categoriesSection: {
      ...(state.categoriesSection || {}),
      kicker: pickNonEmptyString(dyn?.categoriesSection?.kicker, staticOv?.categoriesSection?.kicker),
      title: pickNonEmptyString(dyn?.categoriesSection?.title, staticOv?.categoriesSection?.title),
      ctaLabel: pickNonEmptyString(dyn?.categoriesSection?.ctaLabel, staticOv?.categoriesSection?.ctaLabel),
      ctaHref: pickNonEmptyString(
        dyn?.categoriesSection?.ctaHref,
        staticOv?.categoriesSection?.ctaHref,
        state.categoriesSection?.ctaHref
      ),
    },
    blogSection: {
      ...(state.blogSection || {}),
      kicker: pickNonEmptyString(dyn?.blogSection?.kicker, staticOv?.blogSection?.kicker),
      title: pickNonEmptyString(dyn?.blogSection?.title, staticOv?.blogSection?.title),
      viewAllLabel: pickNonEmptyString(
        dyn?.blogSection?.viewAllLabel,
        staticOv?.blogSection?.viewAllLabel
      ),
    },
    reviewsSection: {
      ...(state.reviewsSection || {}),
      kicker: pickNonEmptyString(dyn?.reviewsSection?.kicker, staticOv?.reviewsSection?.kicker),
      title: pickNonEmptyString(dyn?.reviewsSection?.title, staticOv?.reviewsSection?.title),
    },
    reviews: state.reviews.map((rev, idx) => {
      const dOv = dyn?.reviews?.[idx];
      const sOv = staticOv?.reviews?.[idx];
      if (!dOv && !sOv) return { ...rev };
      return {
        ...rev,
        author: pickNonEmptyString(dOv?.author, sOv?.author) ?? rev.author,
        text: pickNonEmptyString(dOv?.text, sOv?.text) ?? rev.text,
      };
    }),
    promoBanner:
      state.promoBanner || dyn?.promoBanner || staticOv?.promoBanner
        ? {
            ...(state.promoBanner || {}),
            eyebrow: pickNonEmptyString(dyn?.promoBanner?.eyebrow, staticOv?.promoBanner?.eyebrow),
            title: pickNonEmptyString(dyn?.promoBanner?.title, staticOv?.promoBanner?.title),
            desc: pickNonEmptyString(dyn?.promoBanner?.desc, staticOv?.promoBanner?.desc),
            ctaText: pickNonEmptyString(dyn?.promoBanner?.ctaText, staticOv?.promoBanner?.ctaText),
            ctaLink: pickNonEmptyString(
              dyn?.promoBanner?.ctaLink,
              staticOv?.promoBanner?.ctaLink,
              state.promoBanner?.ctaLink
            ),
          }
        : undefined,
    categories: Object.fromEntries(
      Object.entries(state.categories || {}).map(([key, catItem]) => {
        const canonicalSlug = matchCanonicalCategorySlug(catItem?.name, catItem?.id || key);
        const dOv = dyn?.categories?.[key] || (canonicalSlug ? dyn?.categories?.[canonicalSlug] : undefined);
        const sOv =
          staticOv?.categories?.[key] || (canonicalSlug ? staticOv?.categories?.[canonicalSlug] : undefined);
        const enTaxonomyDesc = canonicalSlug
          ? EN_CATEGORY_CONTENT[canonicalSlug]?.shortTagline || EN_CATEGORY_CONTENT[canonicalSlug]?.introText
          : undefined;

        return [
          key,
          {
            ...catItem,
            name: pickNonEmptyString(dOv?.name, sOv?.name) ?? catItem.name,
            tagline: pickNonEmptyString(dOv?.tagline, sOv?.tagline) ?? '',
            count: pickNonEmptyString(dOv?.count, sOv?.count) ?? catItem.count,
            description: pickNonEmptyString(dOv?.description, sOv?.description, enTaxonomyDesc) ?? '',
          },
        ];
      })
    ),
    customSections: state.customSections?.map((cs) => {
      const dOv = dyn?.customSections?.[cs.id];
      const sOv = staticOv?.customSections?.[cs.id];
      if (!dOv && !sOv) return { ...cs };
      return {
        ...cs,
        title: pickNonEmptyString(dOv?.title, sOv?.title) ?? cs.title,
        subtitle: pickNonEmptyString(dOv?.subtitle, sOv?.subtitle) ?? cs.subtitle,
        content: pickNonEmptyString(dOv?.content, sOv?.content) ?? cs.content,
        eyebrow: pickNonEmptyString(dOv?.eyebrow, sOv?.eyebrow) ?? cs.eyebrow,
        desc: pickNonEmptyString(dOv?.desc, sOv?.desc) ?? cs.desc,
        ctaText: pickNonEmptyString(dOv?.ctaText, sOv?.ctaText) ?? cs.ctaText,
        ctaLink: pickNonEmptyString(dOv?.ctaLink, sOv?.ctaLink, cs.ctaLink) ?? cs.ctaLink,
        linkText: pickNonEmptyString(dOv?.linkText, sOv?.linkText) ?? cs.linkText,
        linkUrl: pickNonEmptyString(dOv?.linkUrl, sOv?.linkUrl, cs.linkUrl) ?? cs.linkUrl,
        items: Array.isArray(cs.items)
          ? cs.items.map((item, idx) => {
              const itemDOv = dOv?.items?.[idx];
              const itemSOv = sOv?.items?.[idx];
              if (!itemDOv && !itemSOv) return { ...item };
              return {
                ...item,
                title: pickNonEmptyString(itemDOv?.title, itemSOv?.title) ?? item.title,
                desc: pickNonEmptyString(itemDOv?.desc, itemSOv?.desc) ?? item.desc,
                q: pickNonEmptyString(itemDOv?.q, itemSOv?.q) ?? item.q,
                a: pickNonEmptyString(itemDOv?.a, itemSOv?.a) ?? item.a,
                link: pickNonEmptyString(itemDOv?.link, itemSOv?.link, item.link) ?? item.link,
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
  if (locale === 'ar') {
    return campaign;
  }

  const staticOverlay =
    overlay &&
    (!overlay.campaignId ||
      overlay.campaignId === campaign.id ||
      String(campaign.id || '').startsWith('pink-friday'))
      ? overlay
      : null;

  const dynamicEn = campaign.i18n?.en || null;
  if (!staticOverlay && !dynamicEn) {
    return campaign;
  }

  const pick = (...vals: Array<string | undefined>): string | undefined => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
    return undefined;
  };

  const mergedSubtitle = pick(dynamicEn?.subtitle, staticOverlay?.subtitle, campaign.visuals?.subtitle, campaign.subtitleAr);
  const mergedHeadline = pick(dynamicEn?.headline, staticOverlay?.headline, campaign.visuals?.headline);
  const mergedCtaText = pick(dynamicEn?.ctaText, staticOverlay?.ctaText, campaign.visuals?.ctaText);
  const mergedBadgeText = pick(dynamicEn?.badgeText, staticOverlay?.badgeText, campaign.visuals?.badgeText);
  const mergedHeroImage = pick(dynamicEn?.heroImageOverride, staticOverlay?.heroImageOverride, campaign.visuals?.heroImageUrl);

  return {
    ...campaign,
    title: pick(dynamicEn?.title, staticOverlay?.title, campaign.title) || campaign.title,
    subtitleAr: mergedSubtitle || campaign.subtitleAr,
    visuals: campaign.visuals
      ? {
          ...campaign.visuals,
          ...(mergedSubtitle ? { subtitle: mergedSubtitle } : {}),
          ...(mergedCtaText ? { ctaText: mergedCtaText } : {}),
          ...(mergedBadgeText ? { badgeText: mergedBadgeText } : {}),
          ...(mergedHeadline ? { headline: mergedHeadline } : {}),
          ...(mergedHeroImage ? { heroImageUrl: mergedHeroImage } : {}),
        }
      : {
          ...(mergedSubtitle ? { subtitle: mergedSubtitle } : {}),
          ...(mergedCtaText ? { ctaText: mergedCtaText } : {}),
          ...(mergedBadgeText ? { badgeText: mergedBadgeText } : {}),
          ...(mergedHeadline ? { headline: mergedHeadline } : {}),
          ...(mergedHeroImage ? { heroImageUrl: mergedHeroImage } : {}),
        },
    collections: campaign.collections?.map((col) => {
      const staticColOv = staticOverlay?.collectionTextOverrides?.[col.id];
      const dynamicColOv = dynamicEn?.collectionTextOverrides?.[col.id];
      if (!staticColOv && !dynamicColOv) return { ...col };
      return {
        ...col,
        name: pick(dynamicColOv?.name, staticColOv?.name, col.name) || col.name,
        description: pick(dynamicColOv?.description, staticColOv?.description, col.description) ?? col.description,
        badgeText: pick(dynamicColOv?.badgeText, staticColOv?.badgeText, col.badgeText) ?? col.badgeText,
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
