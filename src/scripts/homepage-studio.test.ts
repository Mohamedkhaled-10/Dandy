import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HERO_SLIDE,
  DEFAULT_PROMO_BANNER,
  DEFAULT_SECTION_ORDER,
  mapStudioIconToLucide,
  mergeStudioPreviewState,
  resolveBlogSectionMeta,
  resolveCategoriesForShowcase,
  resolveCategoriesSectionMeta,
  resolveDynamicProductSection,
  resolveHeroMeta,
  resolveHeroSlides,
  resolveOrderedHomepageEntries,
  resolvePromoBanner,
  resolveReviewsSectionMeta,
  resolveSectionVisibility,
  resolveTrustItems,
  resolveTrustSectionMeta,
  resolveVideoMedia,
  selectProductsForStudioSection,
  type HomepageStudioState,
} from './homepage-studio';
import type { Product } from '../utils/products';

const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'سيروم النضارة',
    resolvedSlug: 'glow-serum',
    price: 300,
    originalPrice: 400,
    onSale: true,
    category: 'Skin care',
    bestSeller: true,
    reviewCount: 15,
    avgRating: 4.9,
    inStock: true,
  },
  {
    id: 'p2',
    name: 'شامبو خالي من السلفات',
    resolvedSlug: 'sulfate-free-shampoo',
    price: 260,
    category: 'Hair care',
    bestSeller: true,
    reviewCount: 8,
    avgRating: 4.7,
    inStock: true,
  },
  {
    id: 'p3',
    name: 'زبدة الجسم الطبيعية',
    resolvedSlug: 'body-butter',
    price: 220,
    category: 'Body care',
    inStock: true,
  },
  {
    id: 'p4',
    name: 'منتج مخفي',
    resolvedSlug: 'hidden-product',
    price: 150,
    category: 'Skin care',
    isHidden: true,
    inStock: true,
  },
];

test('resolveHeroSlides falls back to grounded Arabic defaults when RTDB text is empty', () => {
  const slides = resolveHeroSlides([
    {
      desktopImage: 'https://res.cloudinary.com/demo/image/upload/desktop.jpg',
      mobileImage: 'https://res.cloudinary.com/demo/image/upload/mobile.jpg',
      title: '',
      subtitle: '',
      buttonText: '',
      link: '',
      duration: 4,
    },
  ]);

  assert.equal(slides.length, 1);
  assert.equal(slides[0].desktopImage, 'https://res.cloudinary.com/demo/image/upload/desktop.jpg');
  assert.equal(slides[0].mobileImage, 'https://res.cloudinary.com/demo/image/upload/mobile.jpg');
  assert.equal(slides[0].title, DEFAULT_HERO_SLIDE.title);
  assert.equal(slides[0].buttonText, DEFAULT_HERO_SLIDE.buttonText);
  assert.equal(slides[0].hasCustomCopy, false);
  assert.equal(slides[0].durationSeconds, 4);
});

test('resolveHeroSlides applies Admin Studio custom copy and rejects Unsplash URLs', () => {
  const slides = resolveHeroSlides([
    {
      desktopImage: 'https://images.unsplash.com/photo-123',
      title: 'مجموعة الشتاء الجديدة',
      subtitle: 'ترطيب عميق بمكونات نباتية',
      buttonText: 'اكتشفي المجموعة',
      link: 'offers',
    },
  ]);

  assert.equal(slides[0].desktopImage, DEFAULT_HERO_SLIDE.desktopImage);
  assert.equal(slides[0].title, 'مجموعة الشتاء الجديدة');
  assert.equal(slides[0].subtitle, 'ترطيب عميق بمكونات نباتية');
  assert.equal(slides[0].buttonText, 'اكتشفي المجموعة');
  assert.equal(slides[0].link, '/offers');
  assert.equal(slides[0].hasCustomCopy, true);
});

test('mapStudioIconToLucide maps FontAwesome classes cleanly without FA runtime dependency', () => {
  assert.equal(mapStudioIconToLucide('fas fa-seedling'), 'leaf');
  assert.equal(mapStudioIconToLucide('fas fa-truck-moving'), 'truck');
  assert.equal(mapStudioIconToLucide('fas fa-award'), 'shield-check');
  assert.equal(mapStudioIconToLucide('fa-hand-holding-heart'), 'heart');
  assert.equal(mapStudioIconToLucide(''), 'sparkles');
});

test('resolveOrderedHomepageEntries honors Studio sectionOrder, visibility, customSections, and Pink Friday position', () => {
  const state: HomepageStudioState = {
    hero: [],
    sections: [
      { id: 'sec-special-offers', type: 'offers', visible: true, title: 'عروض خاصة' },
      { id: 'sec-new-arrivals', type: 'manual', visible: false, title: 'أحدث المنتجات' },
    ],
    trust: {},
    reviews: [],
    categories: {},
    customSections: [
      { id: 'sec-custom-faq-1', type: 'faq', title: 'الأسئلة الشائعة', items: [{ q: 'سؤال', a: 'جواب' }] },
      { id: 'sec-custom-unlisted', type: 'story', title: 'قصة مضافة', content: 'نص' },
    ],
    sectionOrder: ['hero', 'offers', 'sec-custom-faq-1', 'categories', 'newArrivals', 'blog', 'reviews'],
    sectionsVisibility: {
      blog: false,
      'sec-custom-faq-1': true,
    },
  };

  const ordered = resolveOrderedHomepageEntries(state, true);
  assert.deepEqual(
    ordered.map((e) => e.id),
    ['hero', 'offers', 'pink-friday', 'sec-custom-faq-1', 'categories', 'newArrivals', 'blog', 'reviews', 'trust', 'promo', 'sec-custom-unlisted']
  );

  const newArrivalsEntry = ordered.find((e) => e.id === 'newArrivals');
  const blogEntry = ordered.find((e) => e.id === 'blog');
  const offersEntry = ordered.find((e) => e.id === 'offers');
  assert.equal(newArrivalsEntry?.visible, false);
  assert.equal(blogEntry?.visible, false);
  assert.equal(offersEntry?.visible, true);
});

test('resolveSectionVisibility prefers sectionsVisibility over dynamicSections[].visible', () => {
  const state: HomepageStudioState = {
    hero: [],
    sections: [{ id: 'sec-special-offers', type: 'offers', visible: true }],
    trust: {},
    reviews: [],
    categories: {},
    sectionsVisibility: { offers: false },
  };
  assert.equal(resolveSectionVisibility('offers', state), false);
});

test('resolveDynamicProductSection resolves offers vs newArrivals independently even when manual', () => {
  const state: HomepageStudioState = {
    hero: [],
    sections: [
      { id: 'sec-special-offers', type: 'offers', title: 'Special Offers', subtitle: 'Hot', visible: true, manualProducts: { p1: true } },
      { id: 'sec-new-arrivals', type: 'manual', title: 'Skin Care', subtitle: 'Fresh', visible: true, manualProducts: { p2: true, p3: true } },
    ],
    trust: {},
    reviews: [],
    categories: {},
  };

  const offers = resolveDynamicProductSection(state, 'offers');
  const newArrivals = resolveDynamicProductSection(state, 'newArrivals');

  assert.equal(offers.title, 'Special Offers');
  assert.equal(offers.type, 'offers');
  assert.equal(newArrivals.title, 'Skin Care');
  assert.equal(newArrivals.type, 'manual');
  assert.deepEqual(Object.keys(newArrivals.manualProducts), ['p2', 'p3']);
});

test('selectProductsForStudioSection supports offers, bestsellers, and manual filtering while excluding hidden items', () => {
  const offers = selectProductsForStudioSection(MOCK_PRODUCTS, { source: 'offers', limit: 4 });
  assert.deepEqual(offers.map((p) => p.id), ['p1']);

  const manual = selectProductsForStudioSection(MOCK_PRODUCTS, {
    source: 'manual',
    manualProducts: { p2: true, p3: true, p4: true },
    limit: 4,
  });
  assert.deepEqual(manual.map((p) => p.id), ['p2', 'p3']);

  const bestsellers = selectProductsForStudioSection(MOCK_PRODUCTS, { source: 'bestsellers', limit: 2 });
  assert.equal(bestsellers[0].id, 'p1');
  assert.equal(bestsellers.length, 2);
});

test('resolveCategoriesForShowcase maps canonical routes and preserves custom images/taglines', () => {
  const cats = resolveCategoriesForShowcase({
    '-Ox1': {
      name: 'Body Care',
      tagline: 'ترطيب عميق',
      count: '8',
      layoutVariant: 'wide',
      desktopImage: 'https://res.cloudinary.com/demo/body-d.jpg',
      mobileImage: 'https://res.cloudinary.com/demo/body-m.jpg',
    },
    '-OxCustom': {
      name: 'Sun Care',
      tagline: 'حماية يومية',
      count: '2',
      layoutVariant: 'small',
      image: 'https://res.cloudinary.com/demo/sun.jpg',
    },
  });

  assert.equal(cats.length, 2);
  assert.equal(cats[0].href, '/category/body-care');
  assert.equal(cats[0].name, 'العناية بالجسم');
  assert.equal(cats[0].tagline, 'ترطيب عميق');
  assert.equal(cats[0].layoutVariant, 'wide');
  assert.equal(cats[1].href, '/all-products?category=Sun%20Care');
});

test('resolvePromoBanner uses Botanical Editorial fallback when promoBanner is empty', () => {
  const defaultPromo = resolvePromoBanner(undefined);
  assert.equal(defaultPromo.image, DEFAULT_PROMO_BANNER.image);
  assert.equal(defaultPromo.isCustomized, false);

  const customPromo = resolvePromoBanner({
    eyebrow: 'إصدار محدود',
    title: 'باقة الإشراقة',
    desc: 'عناية يومية متكاملة',
    ctaText: 'اكتشفي الآن',
    ctaLink: '/offers',
    image: 'https://res.cloudinary.com/demo/promo.jpg',
  });
  assert.equal(customPromo.title, 'باقة الإشراقة');
  assert.equal(customPromo.ctaLink, '/offers');
  assert.equal(customPromo.isCustomized, true);
});

test('resolveVideoMedia parses YouTube, Vimeo, direct MP4, and rejects javascript URIs', () => {
  const yt = resolveVideoMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt.kind, 'youtube');
  if (yt.kind === 'youtube') {
    assert.ok(yt.embedUrl.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  }

  const mp4 = resolveVideoMedia('https://l.top4top.io/m_3907ef80b1.mp4', 'https://i.postimg.cc/test.jpg');
  assert.equal(mp4.kind, 'video');
  if (mp4.kind === 'video') {
    assert.equal(mp4.src, 'https://l.top4top.io/m_3907ef80b1.mp4');
  }

  const unsafe = resolveVideoMedia('javascript:alert(1)');
  assert.equal(unsafe.kind, 'invalid');
});

test('resolveTrustItems handles both standard trust config and custom trust items', () => {
  const std = resolveTrustItems({
    item1: { icon: 'fas fa-seedling', title: '100% Organic', desc: 'Safe ingredients' },
    item2: { icon: 'fas fa-truck', title: 'Fast Delivery', desc: 'All Egypt' },
  });
  assert.equal(std.length, 2);
  assert.equal(std[0].iconName, 'leaf');
  assert.equal(std[1].iconName, 'truck');

  const custom = resolveTrustItems(undefined, [
    { icon: 'fa-gift', title: 'هدايا مجانية', desc: 'مع كل طلب' },
  ]);
  assert.equal(custom.length, 1);
  assert.equal(custom[0].iconName, 'gift');
});

test('mergeStudioPreviewState merges incoming postMessage payloads non-destructively', () => {
  const base: HomepageStudioState = {
    hero: [{ title: 'قديم' }],
    sections: [{ id: 'sec-special-offers', type: 'offers', title: 'عروض' }],
    trust: { item1: { title: 'ميزة 1' } },
    reviews: [],
    categories: {},
    sectionOrder: [...DEFAULT_SECTION_ORDER],
  };

  const merged = mergeStudioPreviewState(base, {
    hero: [{ title: 'معدل من الاستوديو' }],
    sectionsVisibility: { reviews: false },
  });

  assert.equal(merged.hero[0].title, 'معدل من الاستوديو');
  assert.equal(merged.sections[0].title, 'عروض');
  assert.equal(merged.sectionsVisibility?.reviews, false);
});

test('resolveHeroMeta, resolveTrustSectionMeta, resolveCategoriesSectionMeta, resolveBlogSectionMeta, resolveReviewsSectionMeta resolve custom & localized metadata cleanly', () => {
  const heroMetaAr = resolveHeroMeta({ kicker: 'كود خصم', secondaryCtaLabel: 'عن المتجر', secondaryCtaHref: 'about-us' }, 'ar');
  assert.equal(heroMetaAr.kicker, 'كود خصم');
  assert.equal(heroMetaAr.secondaryCtaLabel, 'عن المتجر');
  assert.equal(heroMetaAr.secondaryCtaHref, '/about-us');

  const heroMetaEn = resolveHeroMeta({ secondaryCtaHref: '/about-us' }, 'en');
  assert.equal(heroMetaEn.secondaryCtaHref, '/en/about-us');
  assert.ok(heroMetaEn.kicker.includes('Dandy Cosmetics'));

  const trustMeta = resolveTrustSectionMeta({ kicker: 'مزايا', title: 'لماذا داندي؟' });
  assert.equal(trustMeta.subtitle, 'مزايا');
  assert.equal(trustMeta.title, 'لماذا داندي؟');

  const catsMeta = resolveCategoriesSectionMeta({ kicker: 'استكشفي', title: 'أقسامنا', ctaLabel: 'عرض الكل', ctaHref: '/offers' }, 'en');
  assert.equal(catsMeta.ctaHref, '/en/special-offers');
  assert.equal(catsMeta.title, 'أقسامنا');

  const blogMeta = resolveBlogSectionMeta({ kicker: 'مجلة', title: 'العناية', viewAllLabel: 'المزيد', limit: 6 }, 'ar');
  assert.equal(blogMeta.limit, 6);
  assert.equal(resolveBlogSectionMeta({ limit: 99 }, 'ar').limit, 3);

  const reviewsMeta = resolveReviewsSectionMeta({ kicker: 'تجارب', title: 'آراء حقيقية' }, 'ar');
  assert.equal(reviewsMeta.kicker, 'تجارب');
  assert.equal(reviewsMeta.title, 'آراء حقيقية');
});

test('resolveTrustItems supports optional item4 without duplicating defaults', () => {
  const items = resolveTrustItems({
    item1: { icon: 'fa-leaf', title: 'نباتي 100%', desc: 'وصف 1' },
    item2: { icon: 'fa-truck', title: 'شحن سريع', desc: 'وصف 2' },
    item3: { icon: 'fa-shield-alt', title: 'أمان', desc: 'وصف 3' },
    item4: { icon: 'fa-gift', title: 'هدايا', desc: 'عينة مجانية' },
  });
  assert.equal(items.length, 4);
  assert.equal(items[3].iconName, 'gift');
  assert.equal(items[3].title, 'هدايا');
});

test('selectProductsForStudioSection supports newArrivals timestamp sorting and resolveDynamicProductSection supports viewAll overrides', () => {
  const datedProducts: Product[] = [
    { ...MOCK_PRODUCTS[0], createdAt: '2026-01-01T00:00:00Z' } as Product,
    { ...MOCK_PRODUCTS[1], createdAt: '2026-03-01T00:00:00Z' } as Product,
    { ...MOCK_PRODUCTS[2], createdAt: '2026-02-01T00:00:00Z' } as Product,
  ];
  const newest = selectProductsForStudioSection(datedProducts, { source: 'newArrivals', limit: 2 });
  assert.deepEqual(newest.map((p) => p.id), ['p2', 'p3']);

  const sec = resolveDynamicProductSection(
    {
      sections: [
        {
          id: 'sec-new-arrivals',
          type: 'newArrivals',
          visible: true,
          title: 'أحدث الوصول',
          subtitle: 'وصل حديثاً',
          limit: 6,
          viewAllLabel: 'شوفي الكل',
          viewAllHref: '/all-products?sort=newest',
        },
      ],
    },
    'newArrivals',
    'en'
  );
  assert.equal(sec.limit, 6);
  assert.equal(sec.viewAllLabel, 'شوفي الكل');
  assert.equal(sec.viewAllHref, '/en/all-products?sort=newest');
});

test('resolveCategoriesForShowcase honors visible: false, custom order, and description', () => {
  const cats = resolveCategoriesForShowcase({
    catB: { name: 'Hair Care', order: 1, visible: true, description: 'شعر صحي ولامع' },
    catHidden: { name: 'Skin Care', order: 0, visible: false, description: 'مخفي' },
    catA: { name: 'Body Care', order: 0, visible: true, description: 'ترطيب عميق للجسم' },
  });
  assert.equal(cats.length, 2);
  assert.equal(cats[0].slug, 'body-care');
  assert.equal(cats[0].description, 'ترطيب عميق للجسم');
  assert.equal(cats[1].slug, 'hair-care');
});

test('mergeStudioPreviewState preserves heroMeta, section headers, and enOverlay', () => {
  const base: HomepageStudioState = {
    hero: [],
    sections: [],
    trust: {},
    reviews: [],
    categories: {},
  };
  const merged = mergeStudioPreviewState(base, {
    heroMeta: { kicker: 'New Kicker' },
    trustSection: { title: 'Trust Title' },
    categoriesSection: { title: 'Cats Title' },
    blogSection: { limit: 5 },
    reviewsSection: { title: 'Reviews Title' },
    enOverlay: { heroMeta: { kicker: 'EN Kicker' } },
  });
  assert.equal(merged.heroMeta?.kicker, 'New Kicker');
  assert.equal(merged.trustSection?.title, 'Trust Title');
  assert.equal(merged.categoriesSection?.title, 'Cats Title');
  assert.equal(merged.blogSection?.limit, 5);
  assert.equal(merged.reviewsSection?.title, 'Reviews Title');
  assert.equal(merged.enOverlay?.heroMeta?.kicker, 'EN Kicker');
});

