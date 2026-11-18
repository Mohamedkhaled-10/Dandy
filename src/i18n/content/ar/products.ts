/**
 * ============================================================================
 * DANDY COSMETICS — ARABIC PRODUCT CONTENT ADAPTER (PHASE 10)
 * Builds `ProductLocalizedContent` from live/cached Firebase RTDB `Product`
 * records strictly by stable `product.id` without mutating the source object.
 * ============================================================================
 */

import type { Product } from '../../../utils/products';
import { normalizeProductVariants } from '../../../scripts/product-card';
import { parseDescriptionSections } from '../../../scripts/product-pdp';
import type { ProductLocalizedContent } from '../../types';

export function extractArabicProductContent(product: Product): ProductLocalizedContent {
  const normalizedVariants = normalizeProductVariants(product.variants);
  const variantLabels: Record<string, string> = {};
  for (const variant of normalizedVariants) {
    variantLabels[variant.id] = variant.name;
  }

  const parsedDesc = parseDescriptionSections(product.description || '');

  return {
    productId: product.id,
    name: product.name,
    description: product.description || '',
    shortDescription: parsedDesc.leadIntro || undefined,
    structuredSections: parsedDesc.sections.map((section) => ({
      id: section.id,
      title: section.title,
      paragraphs: [...section.paragraphs],
      bullets: [...section.bullets],
    })),
    variantLabels,
  };
}
