// src/utils/categories.ts
// Centralized Category Taxonomy & SEO Configuration for Dandy Cosmetics
// Scope: Application-level SEO categories mapping, overrides, and Schema.org generators

import { SITE_URL, type Product } from './products';

export interface CategoryTaxonomy {
  slug: string;
  name: string;
  arabicName: string;
  h1Title: string;
  seoTitle: string;
  seoDescription: string;
  introText: string;
  sourceFirebaseCategories: string[];
  image: string;
}

// 1. Centralized Category Taxonomy Definition (Approved 4 Primary Categories)
export const CATEGORY_TAXONOMY: Record<string, CategoryTaxonomy> = {
  'hair-care': {
    slug: 'hair-care',
    name: 'Hair Care',
    arabicName: 'العناية بالشعر',
    h1Title: 'منتجات العناية بالشعر',
    seoTitle: 'منتجات العناية بالشعر الطبيعية | داندي كوزمتكس Dandy Cosmetics',
    seoDescription: 'اكتشفي مجموعة داندي للعناية بالشعر: شامبو خالي من السلفات، ماسك ترميم الشعر، زيوت الإنبات، وحلول تساقط الشعر والقشرة بتركيبات لطيفة ومغذية.',
    introText: 'مجموعة متكاملة للعناية بصحة ومظهر شعركِ، تشمل الشامبو الخالي من السلفات، ماسكات الترميم، وزيوت التغذية المصممة لروتين عناية يومي متوازن.',
    sourceFirebaseCategories: ['Hair care', 'hair care', 'منتجات الشعر', 'عناية بالشعر'],
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1789208037/Gemini_Generated_Image_hgbam1hgbam1hgba.jpg',
  },
  'body-care': {
    slug: 'body-care',
    name: 'Body Care',
    arabicName: 'العناية بالجسم',
    h1Title: 'منتجات العناية بالجسم',
    seoTitle: 'منتجات العناية بالجسم والترطيب | داندي كوزمتكس Dandy Cosmetics',
    seoDescription: 'تسوقي مستحضرات العناية بالجسم من داندي: زبدة الجسم، كريم تقشير القدمين، كريم اليدين، بديل الليزر، ومزيلات العرق الطبيعية لترطيب ونعومة تدوم.',
    introText: 'تشكيلة مختارة من مستحضرات ترطيب وتنعيم الجسم، من زبدة الجسم الغنية وكريمات اليدين والقدمين إلى بديل الليزر ومزيلات العرق الطبيعية.',
    sourceFirebaseCategories: ['Body care', 'body care', 'منتجات الجسم'],
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1789208358/Gemini_Generated_Image_b5iehjb5iehjb5ie.jpg',
  },
  'fragrance': {
    slug: 'fragrance',
    name: 'Fragrance',
    arabicName: 'العطور والمعطرات',
    h1Title: 'العطور والمعطرات',
    seoTitle: 'عطور وبادي سبلاش ومسك فاخر | داندي كوزمتكس Dandy Cosmetics',
    seoDescription: 'استمتعي بتشكيلة العطور والمعطرات من داندي: بادي سبلاش بأحجام مختلفة، معطر الجسم والشعر، مسك داندي، والمخمرية بروائح ثابتة ومنعشة طوال اليوم.',
    introText: 'عطور يومية منعشة ومعطرات للجسم والشعر، تضم بادي سبلاش بأحجام متعددة، مخمرية ناعمة، ومسك داندي بروائح تدوم طويلاً.',
    sourceFirebaseCategories: ['Perfume', 'perfume', 'منتجات العطور', 'Fragrances'],
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1789147702/WhatsApp_Image_2026-07-10_at_10.14.43_PM.jpg',
  },
  'skin-care': {
    slug: 'skin-care',
    name: 'Skin Care',
    arabicName: 'العناية بالبشرة',
    h1Title: 'منتجات العناية بالبشرة',
    seoTitle: 'منتجات العناية بالبشرة والوجه | داندي كوزمتكس Dandy Cosmetics',
    seoDescription: 'مستحضرات العناية بالبشرة والوجه من داندي: غسول للبشرة الدهنية والمختلطة، سيروم نضارة 3 في 1، مرطب شفاه وتنت طبيعي لروتين يومي مشرق.',
    introText: 'روتين يومي لطيف لنضارة وترطيب البشرة، يشمل غسول الوجه المنعش، سيروم العناية المتكاملة، ومستحضرات الشفاه والرموش الطبيعية.',
    sourceFirebaseCategories: ['Skin care', 'skin care', 'عناية بالبشرة'],
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1789147700/WhatsApp_Image_2026-07-10_at_6.13.03_PM_1.jpg',
  },
};

// 2. Application-level Product Category Overrides
// Resolves misplaced products identified in Phase 2A audit without modifying Firebase Realtime Database.
export const PRODUCT_CATEGORY_OVERRIDES: Record<string, string> = {
  // Body Butter: Stored as 'Perfume' in DB, functionally body moisturizing cream
  '-OvPqarOBOnNgQ_-kpTl': 'body-care',

  // Treatment Mascara: Stored as 'Body care' in DB, functionally facial lash/eye care
  '-OW9WB1GTP1GaDoqcd2R': 'skin-care',

  // Tint: Stored as 'Body care' in DB, functionally facial cheek & lip tint
  '-OWF9Deint3XcB6iNdCE': 'skin-care',

  // Lip Balm: Stored as 'Body care' in DB, functionally lip skin care
  '-OvPpguWTAtcaWirD9Um': 'skin-care',

  // Note: Nail Serum (-OWF2juQihSL1HV8PwTT) is kept in 'body-care' as instructed.
};

// 3. Helper: Get category taxonomy by slug
export function getCategoryBySlug(slug?: string): CategoryTaxonomy | null {
  if (!slug) return null;
  const normalized = slug.toLowerCase().trim();
  return CATEGORY_TAXONOMY[normalized] || null;
}

// 4. Helper: Get all category taxonomies
export function getAllCategories(): CategoryTaxonomy[] {
  return Object.values(CATEGORY_TAXONOMY);
}

// 5. Helper: Determine which public SEO category slug a product belongs to
export function getCategorySlugForProduct(product: { id: string; category?: string }): string {
  // 1. Check application-level manual override
  if (product.id && PRODUCT_CATEGORY_OVERRIDES[product.id]) {
    return PRODUCT_CATEGORY_OVERRIDES[product.id];
  }

  // 2. Match against source Firebase category lists
  const rawCat = (product.category || '').toLowerCase().trim();
  for (const cat of Object.values(CATEGORY_TAXONOMY)) {
    for (const src of cat.sourceFirebaseCategories) {
      if (src.toLowerCase().trim() === rawCat) {
        return cat.slug;
      }
    }
  }

  // 3. Fallbacks
  if (rawCat.includes('hair') || rawCat.includes('شعر')) return 'hair-care';
  if (rawCat.includes('body') || rawCat.includes('جسم')) return 'body-care';
  if (rawCat.includes('perfume') || rawCat.includes('عطر') || rawCat.includes('fragrance')) return 'fragrance';
  return 'skin-care';
}

// 6. Helper: Filter products belonging to a category
export function getProductsForCategory(categorySlug: string, allProducts: Product[]): Product[] {
  const targetCat = categorySlug.toLowerCase().trim();
  return allProducts.filter(p => !p.isHidden && getCategorySlugForProduct(p) === targetCat);
}

// 7. Helper: Generate Schema.org structured data (CollectionPage, ItemList, BreadcrumbList)
export function generateCategoryJsonLd(
  category: CategoryTaxonomy,
  products: Product[],
  canonicalUrl: string
): Record<string, any>[] {
  const collectionPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonicalUrl}#webpage`,
    'url': canonicalUrl,
    'name': category.seoTitle,
    'description': category.seoDescription,
    'inLanguage': 'ar',
    'isPartOf': {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      'name': 'Dandy Cosmetics',
      'url': SITE_URL,
    },
  };

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${canonicalUrl}#itemlist`,
    'name': category.arabicName,
    'description': category.seoDescription,
    'numberOfItems': products.length,
    'itemListElement': products.map((p, idx) => ({
      '@type': 'ListItem',
      'position': idx + 1,
      'name': p.name,
      'url': `${SITE_URL}/product/${encodeURIComponent(p.resolvedSlug)}`,
    })),
  };

  const breadcrumbListSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumb`,
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': 'الرئيسية',
        'item': `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': category.arabicName,
        'item': canonicalUrl,
      },
    ],
  };

  return [collectionPageSchema, itemListSchema, breadcrumbListSchema];
}
