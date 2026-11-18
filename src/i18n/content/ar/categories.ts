/**
 * ============================================================================
 * DANDY COSMETICS — ARABIC CATEGORY LOCALIZATION SOURCE (PHASE 10)
 * Extracts structured Arabic editorial copy from the canonical CATEGORY_TAXONOMY
 * without mutating `src/utils/categories.ts`.
 * ============================================================================
 */

import { CATEGORY_TAXONOMY } from '../../../utils/categories';
import type { CategoryLocalizedContent } from '../../types';

export const AR_CATEGORY_CONTENT: Readonly<Record<string, CategoryLocalizedContent>> = Object.freeze(
  Object.fromEntries(
    Object.values(CATEGORY_TAXONOMY).map((cat) => [
      cat.slug,
      {
        slug: cat.slug,
        name: cat.arabicName,
        h1Title: cat.h1Title,
        introText: cat.introText,
        seoTitle: cat.seoTitle,
        seoDescription: cat.seoDescription,
      },
    ])
  )
);
