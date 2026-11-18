/**
 * ============================================================================
 * DANDY COSMETICS — ENGLISH CATEGORY LOCALIZATION CONTENT (PHASE 11)
 * Canonical 4 categories keyed by immutable category slugs without changing
 * membership rules, `PRODUCT_CATEGORY_OVERRIDES`, or product counts.
 * ============================================================================
 */

import { CATEGORY_TAXONOMY } from '../../../utils/categories';
import type { CategoryLocalizedContent } from '../../types';

export const EN_CATEGORY_CONTENT: Readonly<Record<string, CategoryLocalizedContent>> = Object.freeze({
  'hair-care': {
    slug: 'hair-care',
    name: CATEGORY_TAXONOMY['hair-care'].name,
    h1Title: 'Hair Care Essentials',
    introText:
      'A complete botanical collection crafted for scalp balance and hair vitality — featuring sulfate-free cleansing shampoos, intensive repair masks, nourishing botanical oil blends, and targeted sprays.',
    seoTitle: 'Natural Hair Care Products | Dandy Cosmetics',
    seoDescription:
      'Shop Dandy Cosmetics natural hair care essentials: sulfate-free shampoo, intensive hair repair mask, 18-oil Hair Booster, anti-hair-loss and anti-dandruff care.',
    shortTagline: 'Sulfate-free shampoos, repair masks & botanical oils',
  },
  'body-care': {
    slug: 'body-care',
    name: CATEGORY_TAXONOMY['body-care'].name,
    h1Title: 'Body Care & Daily Hydration',
    introText:
      'Rich whipped body butters, lightweight body lotions, targeted hand, nail, and foot treatments, gentle botanical deodorants, and smoothing post-removal care for velvety skin.',
    seoTitle: 'Natural Body Care & Hydration | Dandy Cosmetics',
    seoDescription:
      'Explore Dandy Cosmetics body care collection: whipped body butter, fast-absorbing body lotion, hand cream, foot peeling cream, nail serum, and gentle deodorants.',
    shortTagline: 'Velvety hydration, hand & foot care & gentle protection',
  },
  fragrance: {
    slug: 'fragrance',
    name: CATEGORY_TAXONOMY['fragrance'].name,
    h1Title: 'Body Splash, Mists & Musk',
    introText:
      'Layer your daily scent with Dandy refreshing body splashes in travel and full sizes, moisturizing hair and body mists, creamy solid perfumes, and classic musk oils.',
    seoTitle: 'Body Splash, Hair Mist & Musk Oils | Dandy Cosmetics',
    seoDescription:
      'Discover Dandy Cosmetics signature fragrances: Body Splash (25 ml, 100 ml, 250 ml), Body & Hair Mist, Solid Perfume, and Musk oils in captivating notes.',
    shortTagline: 'Refreshing mists, creamy solid perfumes & musk oils',
  },
  'skin-care': {
    slug: 'skin-care',
    name: CATEGORY_TAXONOMY['skin-care'].name,
    h1Title: 'Skin Care & Facial Rituals',
    introText:
      'Gentle daily facial care designed for clarity, balanced hydration, and natural radiance — from purifying facial cleansers and 3-in-1 brightening serums to nourishing lip, tint, and lash essentials.',
    seoTitle: 'Natural Skin Care & Facial Serums | Dandy Cosmetics',
    seoDescription:
      'Shop Dandy Cosmetics skin care rituals: facial cleanser for oily and combination skin, 3-in-1 brightening serum, nourishing lip balm, natural tint, and treatment mascara.',
    shortTagline: 'Purifying cleansers, brightening serums & lip rituals',
  },
});
