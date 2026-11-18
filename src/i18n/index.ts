/**
 * ============================================================================
 * DANDY COSMETICS — I18N FOUNDATION BARREL EXPORT (PHASE 10)
 * ============================================================================
 */

export * from './types';
export * from './config';
export * from './resolve-locale';
export * from './routes';
export * from './translator';
export * from './format';
export * from './metadata';
export * from './translation-check';
export * from './content/adapters';
export { AR_MESSAGES } from './messages/ar';
export { EN_MESSAGES } from './messages/en';
export { AR_CATEGORY_CONTENT } from './content/ar/categories';
export { EN_CATEGORY_CONTENT } from './content/en/categories';
export {
  CANONICAL_PRODUCT_IDS,
  EN_PRODUCT_CONTENT,
  EN_PRODUCT_SUMMARY_MAP,
  resolveClientLocalizedProductName,
  resolveClientLocalizedVariantName,
} from './content/en/products';
export { EN_ARTICLE_CONTENT } from './content/en/articles';
export { EN_HOMEPAGE_STUDIO_OVERLAY } from './content/en/homepage-studio';
export { EN_PINK_FRIDAY_OVERLAY } from './content/en/pink-friday';
