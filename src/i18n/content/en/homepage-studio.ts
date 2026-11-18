/**
 * ============================================================================
 * DANDY COSMETICS — ENGLISH HOMEPAGE STUDIO LOCALIZATION OVERLAY
 * Pure presentation overlay for live Firebase RTDB Homepage Studio sections,
 * preserving `sectionOrder`, `sectionsVisibility`, `manualProducts`, limits,
 * and product/media anchors untouched.
 * ============================================================================
 */

import type { HomepageStudioLocalizedOverlay } from '../../types';

export const EN_HOMEPAGE_STUDIO_OVERLAY: HomepageStudioLocalizedOverlay = {
  locale: 'en',
  heroSlides: {
    0: {
      title: 'Balanced Botanical Care for Radiant Skin & Stronger Hair',
      subtitle:
        'Gentle pharmacist-formulated botanical blends enriched with plant oils, nourishing butters, and vitamins for a trusted daily ritual free from harsh additives.',
      buttonText: 'Shop Now',
      link: '/en/all-products',
    },
    1: {
      title: 'Pure Botanical Formulas Crafted for Everyday Glow',
      subtitle:
        'Cold-pressed botanicals, vitamin-rich actives, and lightweight hydration designed to nurture skin and hair naturally.',
      buttonText: 'Explore Collection',
      link: '/en/all-products',
    },
    2: {
      title: 'Curated Skincare, Haircare & Body Rituals',
      subtitle:
        'Discover pharmacist-guided routines crafted in Egypt with botanical precision and lasting comfort.',
      buttonText: 'Discover Routines',
      link: '/en/special-offers',
    },
  },
  trustItems: {
    item1: {
      title: '100% Botanical Ingredients',
      desc: 'Ultra-pure care crafted without harsh additives',
    },
    item2: {
      title: 'Nationwide Delivery',
      desc: 'Reliable door-to-door shipping across all Egyptian governorates',
    },
    item3: {
      title: 'Trusted Pharmacist Quality',
      desc: 'Balanced formulas designed for gentle daily effectiveness',
    },
  },
  sections: {
    'sec-special-offers': {
      title: 'Special Offers',
      subtitle: "Don't Miss Out",
      viewAllLabel: 'Browse Offers',
    },
    'sec-offers': {
      title: 'Special Offers',
      subtitle: "Don't Miss Out",
      viewAllLabel: 'Browse Offers',
    },
    'sec-new-arrivals': {
      title: 'Skin Care',
      subtitle: 'Shop the Absolute Best',
      viewAllLabel: 'View All Products',
    },
    'sec-newArrivals': {
      title: 'Skin Care',
      subtitle: 'Shop the Absolute Best',
      viewAllLabel: 'View All Products',
    },
    'sec-bestsellers': {
      title: 'Hair Care',
      subtitle: 'Most Loved',
      viewAllLabel: 'View All Products',
    },
  },
  promoBanner: {
    eyebrow: 'Our Story & Formulation Philosophy',
    title: 'Pharmacist-Crafted Formulas Blending Botanical Purity with Proven Care',
    desc: 'Founded with specialized pharmaceutical formulation expertise, DANDY brings carefully balanced skincare, haircare, body care, and fragrance essentials powered by pure plant oils, rich butters, and gentle actives.',
    ctaText: 'Explore the Collection',
    ctaLink: '/en/all-products',
  },
  categories: {
    'hair-care': {
      name: 'Hair Care',
      tagline: 'Botanical oils, serums, and shampoos to strengthen & nourish',
    },
    'body-care': {
      name: 'Body Care',
      tagline: 'Deep moisture & silky smoothness with natural butters',
    },
    fragrance: {
      name: 'Fragrance',
      tagline: 'Signature body splashes & solid perfumes',
    },
    'skin-care': {
      name: 'Skin Care',
      tagline: 'Gentle cleansers, serums, & vitamin-rich creams',
    },
  },
  reviews: {
    0: {
      author: 'Verified Customer',
      text: 'Dandy Beauty Skin Care Outcome',
    },
    1: {
      author: 'Verified Customer',
      text: 'Dandy Beauty Skin Care Outcome',
    },
    2: {
      author: 'Verified Customer',
      text: 'Dandy Beauty Skin Care Outcome',
    },
    3: {
      author: 'DANDY Customer',
      text: 'Wonderful experience',
    },
    4: {
      author: 'DANDY Customer',
      text: 'Wonderful experience',
    },
    5: {
      author: 'DANDY Customer',
      text: 'Wonderful experience',
    },
  },
  customSections: {
    'sec-custom-mtybjcz3-xcqb': {
      title: 'Hair Care',
      subtitle: 'Botanical Hair Care Collection',
      linkText: 'View All Products',
      linkUrl: '/en/all-products',
    },
    'sec-custom-mtyc16g8-bwsf': {
      title: 'Frequently Asked Questions',
      subtitle: 'Everything you need to know about DANDY products and delivery',
      items: {
        0: {
          q: 'Are DANDY products 100% natural and safe?',
          a: 'Yes. All DANDY formulas are crafted from pure organic plant oils and botanical extracts, free from harsh or harmful additives.',
        },
        1: {
          q: 'How long does shipping take?',
          a: 'Orders are delivered across all Egyptian governorates within 48 hours, with Cash on Delivery available.',
        },
      },
    },
    'sec-custom-mtyc2ji8-ak18': {
      title: 'A little unboxing… of something NEW from Dandy',
      subtitle: 'A little unboxing…',
    },
  },
};
