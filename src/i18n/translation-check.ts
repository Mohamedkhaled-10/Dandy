/**
 * ============================================================================
 * DANDY COSMETICS — TRANSLATION COMPLETENESS & PHASE 11 PUBLICATION GATE
 *
 * Audits English readiness across:
 *   1. UI Dictionary (`AR_MESSAGES` vs `EN_MESSAGES`)
 *   2. Categories (`CATEGORY_TAXONOMY` vs `EN_CATEGORY_CONTENT`)
 *   3. Active Catalog Products (`products` vs `EN_PRODUCT_CONTENT` by `product.id`)
 *   4. Published Editorial Articles (`articles` vs `EN_ARTICLE_CONTENT` by `article.id` / `slug`)
 *   5. Indexable Route Mappings (`ROUTE_REGISTRY`)
 *
 * Explicitly exempts shared commerce/backend identifiers from translation checks
 * (`product.id`, `price`, `discount`, `stockQuantity`, `image`, `variants[].id`, `cart.*`, `order.*`).
 * ============================================================================
 */

import { CATEGORY_TAXONOMY } from '../utils/categories';
import type { Article } from '../utils/articles';
import type { Product } from '../utils/products';
import { EN_ARTICLE_CONTENT } from './content/en/articles';
import { EN_CATEGORY_CONTENT } from './content/en/categories';
import { EN_PRODUCT_CONTENT } from './content/en/products';
import { AR_MESSAGES } from './messages/ar';
import { EN_MESSAGES } from './messages/en';
import { ROUTE_REGISTRY } from './routes';
import type {
  ArticleLocalizedContent,
  CategoryLocalizedContent,
  DeepPartial,
  ProductLocalizedContent,
  TranslationCatalog,
  TranslationCompletenessReport,
} from './types';

export const SHARED_COMMERCE_EXEMPTIONS: readonly string[] = Object.freeze([
  'product.id',
  'product.resolvedSlug',
  'product.price',
  'product.originalPrice',
  'product.discount',
  'product.onSale',
  'product.isSoldOut',
  'product.stockQuantity',
  'product.image',
  'product.variants[].id',
  'product.variants[].price',
  'product.variants[].isAvailable',
  'article.id',
  'article.slug',
  'article.image',
  'cart.*',
  'order.*',
  'checkout.governorateValueCodes',
  'checkout.shippingRatesEgp',
]);

export function collectTranslationCatalogKeys(
  catalog: TranslationCatalog | DeepPartial<TranslationCatalog>
): string[] {
  const keys: string[] = [];
  for (const [namespace, fields] of Object.entries(catalog)) {
    if (!fields || typeof fields !== 'object') continue;
    for (const [field, value] of Object.entries(fields)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        keys.push(`${namespace}.${field}`);
      }
    }
  }
  return keys.sort();
}

export interface LocalizationAuditInput {
  products?: readonly Product[];
  articles?: readonly Article[];
  enMessages?: DeepPartial<TranslationCatalog>;
  enCategories?: Readonly<Record<string, Partial<CategoryLocalizedContent>>>;
  enProducts?: Readonly<Record<string, ProductLocalizedContent>>;
  enArticles?: Readonly<Record<string, ArticleLocalizedContent>>;
  checkedAtIso?: string;
}

const REQUIRED_CATEGORY_FIELDS: ReadonlyArray<keyof CategoryLocalizedContent> = [
  'name',
  'h1Title',
  'introText',
  'seoTitle',
  'seoDescription',
];

export function runLocalizationCompletenessAudit(
  input: LocalizationAuditInput = {}
): TranslationCompletenessReport {
  const enMessages = input.enMessages || EN_MESSAGES;
  const enCategories = input.enCategories || EN_CATEGORY_CONTENT;
  const enProducts = input.enProducts || EN_PRODUCT_CONTENT;
  const enArticles = input.enArticles || EN_ARTICLE_CONTENT;

  // 1. UI Dictionary check
  const sourceKeys = collectTranslationCatalogKeys(AR_MESSAGES);
  const targetKeysSet = new Set(collectTranslationCatalogKeys(enMessages));
  const missingKeys = sourceKeys.filter((k) => !targetKeysSet.has(k));
  const translatedKeysCount = sourceKeys.length - missingKeys.length;

  // 2. Categories check
  const allCategories = Object.values(CATEGORY_TAXONOMY);
  const missingSlugs: string[] = [];
  const incompleteFields: Array<{ slug: string; missingFields: string[] }> = [];
  let translatedCategoriesCount = 0;

  for (const cat of allCategories) {
    const entry = enCategories[cat.slug];
    if (!entry) {
      missingSlugs.push(cat.slug);
      continue;
    }
    const missing = REQUIRED_CATEGORY_FIELDS.filter((field) => {
      const val = entry[field];
      return typeof val !== 'string' || val.trim().length === 0;
    });
    if (missing.length > 0) {
      incompleteFields.push({ slug: cat.slug, missingFields: [...missing] });
    } else {
      translatedCategoriesCount++;
    }
  }

  // 3. Active Products check
  const activeProducts = (input.products || []).filter((p) => !p.isHidden);
  const missingProductIds: string[] = [];
  const incompleteProducts: Array<{ productId: string; missingFields: string[] }> = [];
  let translatedProductsCount = 0;

  for (const prod of activeProducts) {
    const entry = enProducts[prod.id];
    if (!entry) {
      missingProductIds.push(prod.id);
      continue;
    }
    const missingFields: string[] = [];
    if (!entry.name || !entry.name.trim()) missingFields.push('name');
    if (!entry.description || !entry.description.trim()) missingFields.push('description');
    if (missingFields.length > 0) {
      incompleteProducts.push({ productId: prod.id, missingFields });
    } else {
      translatedProductsCount++;
    }
  }

  // 4. Published Articles check
  const publishedArticles = (input.articles || []).filter((a) => a.status === 'published');
  const missingArticleIds: string[] = [];
  let translatedArticlesCount = 0;

  for (const art of publishedArticles) {
    const entry = enArticles[art.id] || enArticles[art.slug];
    if (
      !entry ||
      !entry.publishedInLocale ||
      !entry.title?.trim() ||
      !entry.excerpt?.trim() ||
      !entry.contentHtml?.trim()
    ) {
      missingArticleIds.push(art.id);
    } else {
      translatedArticlesCount++;
    }
  }

  // 5. Route mapping check
  const indexableRoutes = ROUTE_REGISTRY.filter((r) => r.indexable);
  const unmappedRouteIds = indexableRoutes
    .filter((r) => !r.englishPattern || !r.supportsSwitch)
    .map((r) => r.id);
  const mappedRoutesCount = indexableRoutes.length - unmappedRouteIds.length;

  const readyForPublication =
    missingKeys.length === 0 &&
    missingSlugs.length === 0 &&
    incompleteFields.length === 0 &&
    missingProductIds.length === 0 &&
    incompleteProducts.length === 0 &&
    missingArticleIds.length === 0 &&
    unmappedRouteIds.length === 0;

  return {
    targetLocale: 'en',
    checkedAtIso: input.checkedAtIso || new Date().toISOString(),
    readyForPublication,
    uiDictionary: {
      totalSourceKeys: sourceKeys.length,
      translatedKeysCount,
      missingKeys,
      completionRatio: sourceKeys.length > 0 ? translatedKeysCount / sourceKeys.length : 1,
    },
    categories: {
      totalCategories: allCategories.length,
      translatedCount: translatedCategoriesCount,
      missingSlugs,
      incompleteFields,
    },
    products: {
      totalActiveProducts: activeProducts.length,
      translatedCount: translatedProductsCount,
      missingProductIds,
      incompleteProducts,
    },
    articles: {
      totalPublishedArticles: publishedArticles.length,
      translatedCount: translatedArticlesCount,
      missingArticleIds,
    },
    routes: {
      totalIndexableRoutes: indexableRoutes.length,
      mappedRoutesCount,
      unmappedRouteIds,
    },
    sharedCommerceExemptions: SHARED_COMMERCE_EXEMPTIONS,
  };
}
