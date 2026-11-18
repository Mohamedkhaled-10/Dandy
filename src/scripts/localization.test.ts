import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALE,
  LANGUAGE_SWITCHER_CONTRACT,
  LOCALE_CONFIGS,
  LOCALE_PREFERENCE_STORAGE_KEY,
  ROUTE_REGISTRY,
  SUPPORTED_LOCALES,
  buildCanonicalUrl,
  buildHreflangAlternates,
  buildLocalizedBreadcrumbJsonLd,
  buildLocalizedPath,
  buildLocalizedSeoMetadata,
  buildLocalizedWebPageJsonLd,
  classifyLocalizedRoute,
  filterPublishableSitemapUrls,
  formatCurrencyEgp,
  formatDate,
  formatMixedMeasurement,
  formatNumber,
  formatPercent,
  formatQuantity,
  getDocumentAttributes,
  getLocaleConfig,
  hasEnglishRoutePrefix,
  hasTranslation,
  isLocalePublished,
  persistLocalePreference,
  readStoredLocalePreference,
  resolveDocumentLocale,
  resolveLocaleFromPath,
  resolveLocalizedArticle,
  resolveLocalizedCategory,
  resolveLocalizedGovernorateLabel,
  resolveLocalizedHomepageStudioState,
  resolveLocalizedOrderStatusLabel,
  resolveLocalizedPinkFridayCampaign,
  resolveLocalizedProduct,
  resolveRouteCounterpart,
  resolveTranslation,
  runLocalizationCompletenessAudit,
  sanitizeLocalizedQueryParams,
  stripLocalePrefix,
  t,
  AR_MESSAGES,
  EN_MESSAGES,
  EN_CATEGORY_CONTENT,
  EN_PRODUCT_CONTENT,
  EN_ARTICLE_CONTENT,
} from '../i18n/index';
import { EN_HOMEPAGE_STUDIO_OVERLAY } from '../i18n/content/en/homepage-studio';
import { EN_PINK_FRIDAY_OVERLAY } from '../i18n/content/en/pink-friday';
import type { Product } from '../utils/products';
import type { Article } from '../utils/articles';
import { INITIAL_2026_CAMPAIGN } from '../utils/pink-friday-server';
import type { HomepageStudioState } from './homepage-studio';
import { calculateShippingQuote, SHIPPING_RATES } from './purchase-flow';
import { formatCustomerOrderViewModel } from './account';

test('locale configuration sets Arabic RTL default and English LTR published target in Phase 11', () => {
  assert.equal(DEFAULT_LOCALE, 'ar');
  assert.deepEqual([...SUPPORTED_LOCALES], ['ar', 'en']);

  assert.equal(LOCALE_CONFIGS.ar.dir, 'rtl');
  assert.equal(LOCALE_CONFIGS.ar.isPubliclyPublished, true);
  assert.equal(LOCALE_CONFIGS.ar.routePrefix, '');

  assert.equal(LOCALE_CONFIGS.en.dir, 'ltr');
  assert.equal(LOCALE_CONFIGS.en.isPubliclyPublished, true);
  assert.equal(LOCALE_CONFIGS.en.routePrefix, '/en');

  assert.equal(isLocalePublished('ar'), true);
  assert.equal(isLocalePublished('en'), true);
  assert.deepEqual(getDocumentAttributes('ar'), { lang: 'ar', dir: 'rtl' });
  assert.deepEqual(getDocumentAttributes('en'), { lang: 'en', dir: 'ltr' });
  assert.equal(getLocaleConfig('fr-FR').code, 'ar');

  // All 20 storefront routes in ROUTE_REGISTRY are published for English
  assert.equal(ROUTE_REGISTRY.length, 20);
  assert.equal(ROUTE_REGISTRY.every((r) => r.englishPublished === true), true);
});

test('URL-first locale resolution ignores stored preferences and browser headers on Arabic routes', () => {
  assert.equal(resolveLocaleFromPath('/'), 'ar');
  assert.equal(resolveLocaleFromPath('/all-products'), 'ar');
  assert.equal(resolveLocaleFromPath('/product/facial-serum-3x1-30ml'), 'ar');
  assert.equal(resolveLocaleFromPath('/offers'), 'ar');
  assert.equal(resolveLocaleFromPath('/post'), 'ar');
  assert.equal(resolveLocaleFromPath('/en-sample'), 'ar');
  assert.equal(resolveLocaleFromPath('/english'), 'ar');

  assert.equal(hasEnglishRoutePrefix('/en'), true);
  assert.equal(hasEnglishRoutePrefix('/en/'), true);
  assert.equal(hasEnglishRoutePrefix('/en/all-products?sort=price-asc'), true);
  assert.equal(hasEnglishRoutePrefix('/en-gift-set'), false);

  const arabicWithEnPref = resolveDocumentLocale({
    pathname: '/all-products',
    storedPreference: 'en',
    browserLanguages: ['en-US', 'en'],
  });
  assert.equal(arabicWithEnPref.locale, 'ar');
  assert.equal(arabicWithEnPref.dir, 'rtl');
  assert.equal(arabicWithEnPref.source, 'default-unprefixed');
  assert.equal(arabicWithEnPref.storedPreferenceIgnoredDueToUrl, true);
  assert.equal(arabicWithEnPref.nonAuthoritativeBrowserHint, 'en');

  const publishedEn = resolveDocumentLocale({
    pathname: '/en/all-products',
    enforcePublishedOnly: true,
  });
  assert.equal(publishedEn.locale, 'en');
  assert.equal(publishedEn.dir, 'ltr');
  assert.equal(publishedEn.source, 'url-prefix');
});

test('locale preference storage contract stays pure and safe without auto-redirects', () => {
  assert.equal(LANGUAGE_SWITCHER_CONTRACT.autoRedirectByBrowserOrIp, false);
  assert.equal(LANGUAGE_SWITCHER_CONTRACT.urlPrecedesStoredPreference, true);

  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  assert.equal(persistLocalePreference('en', mockStorage), true);
  assert.equal(mem.get(LOCALE_PREFERENCE_STORAGE_KEY), 'en');
  assert.equal(readStoredLocalePreference(mockStorage), 'en');
  assert.equal(readStoredLocalePreference(null), null);
});

test('route counterpart mapping preserves entities, handles duplicate prefixes, and enforces query allowlists', () => {
  // Duplicate `/en/en/` prefix collapse
  assert.equal(stripLocalePrefix('/en/en/cart/'), '/cart');
  assert.equal(buildLocalizedPath('/en/en/product/facial-serum-3x1-30ml', 'en'), '/en/product/facial-serum-3x1-30ml');
  assert.equal(buildLocalizedPath('/en/all-products', 'ar'), '/all-products');

  // Published Phase 11 catalog switch preserves allowlisted search/price params & strips token
  const catalogSwitch = resolveRouteCounterpart('/all-products?search=serum&price=150-300&token=secret', 'en');
  assert.equal(catalogSwitch.targetPath, '/en/all-products');
  assert.equal(catalogSwitch.isSwitchSafe, true);
  assert.equal(catalogSwitch.isCounterpartPublished, true);
  assert.deepEqual(catalogSwitch.preservedQueryParams, ['search', 'price']);
  assert.deepEqual(catalogSwitch.strippedQueryParams, ['token']);

  // Product switch preserves tracking params and fragment
  const productSwitch = resolveRouteCounterpart(
    '/product/facial-serum-3x1-30ml?utm_source=ig#reviews',
    'en'
  );
  assert.equal(productSwitch.fullTargetUrl, '/en/product/facial-serum-3x1-30ml?utm_source=ig#reviews');
  assert.equal(productSwitch.isSwitchSafe, true);
  assert.equal(productSwitch.usedFallback, false);

  // Invoice route strips sensitive hash tokens (#access=...) and keeps only invoice ref
  const invoiceSwitch = resolveRouteCounterpart(
    '/invoice?invoice=INV-9001&token=leak#access=private-secret',
    'en'
  );
  assert.equal(invoiceSwitch.fullTargetUrl, '/en/invoice?invoice=INV-9001');
  assert.deepEqual(invoiceSwitch.strippedQueryParams, ['token']);

  // Missing translated blog article safely falls back to /en/blog
  const missingArticleSwitch = resolveRouteCounterpart(
    '/blog/arabic-only-post?utm_campaign=spring',
    'en',
    { targetEntityExists: false }
  );
  assert.equal(missingArticleSwitch.targetPath, '/en/blog');
  assert.equal(missingArticleSwitch.fullTargetUrl, '/en/blog?utm_campaign=spring');
  assert.equal(missingArticleSwitch.usedFallback, true);
  assert.equal(missingArticleSwitch.fallbackReason, 'entity-untranslated');
  assert.equal(missingArticleSwitch.isSwitchSafe, false);

  // Legacy route `/offers` maps to canonical `/en/special-offers`
  const offersSwitch = resolveRouteCounterpart('/offers?utm_medium=social', 'en');
  assert.equal(offersSwitch.fullTargetUrl, '/en/special-offers?utm_medium=social');

  // Admin / Studio / Login routes stay excluded from localization switching
  const adminRoute = resolveRouteCounterpart('/dashboard-index?tab=hero', 'en');
  assert.equal(adminRoute.routeKind, 'admin-excluded');
  assert.equal(adminRoute.targetPath, '/dashboard-index');
  assert.equal(adminRoute.isSwitchSafe, false);
  assert.equal(adminRoute.fallbackReason, 'route-excluded');

  assert.equal(classifyLocalizedRoute('/login').kind, 'admin-excluded');
  assert.equal(classifyLocalizedRoute('/statues').kind, 'admin-excluded');
  assert.deepEqual(sanitizeLocalizedQueryParams('?sort=price-asc&auth=bad', ['sort']).preserved, ['sort']);

  // Account order links respect locale and preserve ?invoice= code
  const enOrderVm = formatCustomerOrderViewModel(
    '-OrdEn1',
    {
      invoiceCode: 'DNY-9901',
      status: 'Delivered',
      governorate: 'Cairo',
      city: 'Nasr City',
      totalAmount: 500,
      items: [],
    },
    'en'
  );
  assert.equal(enOrderVm.invoiceHref, '/en/invoice?invoice=DNY-9901');
  assert.equal(enOrderVm.trackHref, '/en/track-order?invoice=DNY-9901');
});

test('translator resolves Arabic & complete Phase 11 English keys, and flags unknown keys explicitly', () => {
  assert.equal(t('ar', 'common.currencyEgp'), 'ج.م');
  assert.equal(t('en', 'navigation.home'), 'Home');
  assert.equal(t('en', 'common.discountBadge', { percent: 25 }), '25% OFF');
  assert.equal(t('ar', 'common.discountBadge', { percent: 25 }), 'خصم 25%');

  assert.equal(hasTranslation('ar', 'cart.confirmOrderCta'), true);
  assert.equal(hasTranslation('en', 'cart.confirmOrderCta'), true);
  assert.equal(resolveTranslation('en', 'cart.confirmOrderCta').isTranslated, true);
  assert.equal(resolveTranslation('en', 'cart.confirmOrderCta').fallbackUsed, false);

  // Every key in AR_MESSAGES has a non-empty English translation in Phase 11
  for (const [ns, fields] of Object.entries(AR_MESSAGES)) {
    for (const field of Object.keys(fields)) {
      const fullKey = `${ns}.${field}`;
      assert.equal(hasTranslation('en', fullKey), true, `Missing EN key: ${fullKey}`);
    }
  }

  // Invalid unknown key flagged explicitly
  const badKey = resolveTranslation('ar', 'unknown.nonexistentKey' as never);
  assert.equal(badKey.missingKey, true);
  assert.equal(badKey.text, '[missing-key:unknown.nonexistentKey]');
});

test('formatting helpers render locale-appropriate currency, numbers, dates, and isolated units', () => {
  assert.equal(formatNumber(1250, 'ar'), '1,250');
  assert.equal(formatNumber(1250, 'en'), '1,250');

  assert.equal(formatCurrencyEgp(275, 'ar'), '275 ج.م');
  assert.equal(formatCurrencyEgp(275, 'en'), '275 EGP');
  assert.equal(formatPercent(20, 'en'), '20%');

  assert.equal(formatQuantity(1, 'ar'), '1 قطعة');
  assert.equal(formatQuantity(3, 'ar'), '3 قطع');
  assert.equal(formatQuantity(1, 'en'), '1 item');
  assert.equal(formatQuantity(3, 'en'), '3 items');

  const mixedAr = formatMixedMeasurement(30, 'ml', 'ar');
  assert.equal(mixedAr, '\u206630 مل\u2069');
  assert.equal(formatMixedMeasurement(30, 'ml', 'en'), '30 ml');

  const formattedDateEn = formatDate('2026-11-18T12:00:00Z', 'en');
  assert.match(formattedDateEn, /2026/);
  assert.equal(formatDate('not-a-date', 'en'), '—');
});

test('metadata & SEO builders generate reciprocal hreflang tags in Phase 11 and omit untranslated/unpublished entries', () => {
  // Arabic canonicals remain unprefixed; English canonicals use /en/...
  assert.equal(buildCanonicalUrl('/'), 'https://dandy-ebon.vercel.app/');
  assert.equal(buildCanonicalUrl('/all-products'), 'https://dandy-ebon.vercel.app/all-products');
  assert.equal(buildCanonicalUrl('/en/all-products'), 'https://dandy-ebon.vercel.app/en/all-products');

  // Reciprocal hreflang alternates emitted for published routes
  assert.deepEqual(buildHreflangAlternates('/all-products'), [
    { hreflang: 'ar', href: 'https://dandy-ebon.vercel.app/all-products' },
    { hreflang: 'en', href: 'https://dandy-ebon.vercel.app/en/all-products' },
    { hreflang: 'x-default', href: 'https://dandy-ebon.vercel.app/all-products' },
  ]);

  // Isolated suppression guard still works when enPublishedOverride is false
  assert.deepEqual(
    buildHreflangAlternates('/all-products', { enPublishedOverride: false }),
    []
  );

  // Sitemap filter keeps /en/ paths when English is published, and drops when overridden false
  const sampleSitemapUrls = [
    'https://dandy-ebon.vercel.app/',
    'https://dandy-ebon.vercel.app/all-products',
    'https://dandy-ebon.vercel.app/en/',
    'https://dandy-ebon.vercel.app/en/all-products',
  ];
  assert.deepEqual(filterPublishableSitemapUrls(sampleSitemapUrls), sampleSitemapUrls);
  assert.deepEqual(
    filterPublishableSitemapUrls(sampleSitemapUrls, { enPublishedOverride: false }),
    ['https://dandy-ebon.vercel.app/', 'https://dandy-ebon.vercel.app/all-products']
  );

  const publishedMeta = buildLocalizedSeoMetadata({
    pathname: '/en/product/facial-serum-3x1-30ml',
    locale: 'en',
    title: '3-in-1 Facial Serum 30ml | Dandy Cosmetics',
    description: 'Botanical daily glow serum.',
    targetEntityExists: true,
  });
  assert.equal(publishedMeta.canonical, 'https://dandy-ebon.vercel.app/en/product/facial-serum-3x1-30ml');
  assert.equal(publishedMeta.dir, 'ltr');
  assert.equal(publishedMeta.ogLocale, 'en_US');
  assert.deepEqual(publishedMeta.alternates, [
    { hreflang: 'ar', href: 'https://dandy-ebon.vercel.app/product/facial-serum-3x1-30ml' },
    { hreflang: 'en', href: 'https://dandy-ebon.vercel.app/en/product/facial-serum-3x1-30ml' },
    { hreflang: 'x-default', href: 'https://dandy-ebon.vercel.app/product/facial-serum-3x1-30ml' },
  ]);

  // Missing translated entity omits hreflang alternates cleanly even though English is published
  assert.deepEqual(
    buildHreflangAlternates('/blog/untranslated-post', { targetEntityExists: false }),
    []
  );

  const webPageLd = buildLocalizedWebPageJsonLd({
    locale: 'en',
    canonicalUrl: 'https://dandy-ebon.vercel.app/en/',
    name: 'Dandy Cosmetics',
    description: 'Natural Skincare & Haircare',
  });
  assert.equal(webPageLd.inLanguage, 'en');

  const breadcrumbLd = buildLocalizedBreadcrumbJsonLd({
    locale: 'en',
    canonicalUrl: 'https://dandy-ebon.vercel.app/en/all-products',
    items: [{ name: 'All Products', pathOrUrl: '/en/all-products' }],
  }) as { itemListElement: Array<{ name: string }> };
  assert.equal(breadcrumbLd.itemListElement[0].name, 'Home');
});

test('localized content adapters never mutate commerce data, pricing, variants, or Studio layout', () => {
  const sampleProduct: Product = {
    id: '-OvPo-cuVeLHWSU8KQ22',
    name: 'سيروم الوجه 3×1',
    resolvedSlug: 'facial-serum-3x1-30ml',
    description: 'سيروم طبيعي للبشرة',
    price: 275,
    originalPrice: 320,
    discount: 14,
    category: 'Skin care',
    image: 'https://example.com/serum.jpg',
    inStock: true,
    stockQuantity: 12,
    hasVariants: true,
    variants: [
      { id: 'v_rose', name: 'الورد الدمشقي', isAvailable: true },
      { id: 'v_lavender', name: 'اللافندر', isAvailable: false },
    ],
  };

  const enView = resolveLocalizedProduct(sampleProduct, 'en', {
    customEnCatalog: {
      '-OvPo-cuVeLHWSU8KQ22': {
        productId: '-OvPo-cuVeLHWSU8KQ22',
        name: '3-in-1 Facial Serum 30ml',
        description: 'Botanical brightening facial serum.',
        variantLabels: {
          v_rose: 'Damask Rose',
          v_lavender: 'Wild Lavender',
        },
      },
    },
  });

  // Commercial fields and IDs remain untouched
  assert.equal(enView.product.id, sampleProduct.id);
  assert.equal(enView.product.price, 275);
  assert.equal(enView.product.discount, 14);
  assert.equal(enView.product.stockQuantity, 12);
  assert.equal(sampleProduct.name, 'سيروم الوجه 3×1');
  assert.equal(enView.localization.hasTranslation, true);
  assert.equal(enView.localization.content.name, '3-in-1 Facial Serum 30ml');
  assert.equal(enView.localization.variants[0].id, 'v_rose');
  assert.equal(enView.localization.variants[0].localizedName, 'Damask Rose');
  assert.equal(enView.localization.variants[1].isAvailable, false);

  // Category & Governorate & Order status adapters keep backend keys intact
  const enCat = resolveLocalizedCategory('skin-care', 'en');
  assert.equal(enCat.content.name, 'Skin Care');
  assert.equal(enCat.hasTranslation, true);

  assert.equal(resolveLocalizedGovernorateLabel('Gharbia', 'ar'), 'الغربية');
  assert.equal(resolveLocalizedGovernorateLabel('Gharbia', 'en'), 'Gharbia');
  assert.equal(calculateShippingQuote(500, 'Gharbia').shippingFee, SHIPPING_RATES.Gharbia);
  assert.equal(resolveLocalizedOrderStatusLabel('قيد التجهيز', 'en').label, 'Preparing Order');

  // Homepage Studio adapter preserves section order, visibility, and products strictly
  const studioBaseline: HomepageStudioState = {
    hero: [{ title: 'جمال طبيعي', subtitle: 'عناية يومية', buttonText: 'تسوقي الآن', image: '/hero.jpg' }],
    sections: [{ id: 'offers', order: 1, visible: true, title: 'العروض', type: 'offers', limit: 8 }],
    trust: { item1: { title: 'شحن سريع', desc: 'لجميع المحافظات' } },
    reviews: [],
    categories: {},
    sectionOrder: ['hero', 'trust', 'offers', 'categories'],
    sectionsVisibility: { hero: true, trust: true, offers: true, categories: true },
  };
  const localizedStudio = resolveLocalizedHomepageStudioState(
    studioBaseline,
    'en',
    EN_HOMEPAGE_STUDIO_OVERLAY
  );
  assert.deepEqual(localizedStudio.sectionOrder, studioBaseline.sectionOrder);
  assert.deepEqual(localizedStudio.sectionsVisibility, studioBaseline.sectionsVisibility);
  assert.equal(localizedStudio.hero[0].title, EN_HOMEPAGE_STUDIO_OVERLAY.heroSlides?.[0]?.title);
  assert.equal(studioBaseline.hero[0].title, 'جمال طبيعي'); // Non-mutating

  // Pink Friday adapter preserves dates & pricing math with real Phase 11 overlay
  const pfLocalized = resolveLocalizedPinkFridayCampaign(
    {
      ...INITIAL_2026_CAMPAIGN,
      visuals: {
        ...INITIAL_2026_CAMPAIGN.visuals,
        subtitle: 'استمتعي خصومات على كل المنتجات المفضلة ليكي من داندي',
        headline: 'عروض Pink Friday',
        ctaText: 'اكتشفي العروض',
        badgeText: 'الجمعة الوردية',
      },
    },
    'en',
    EN_PINK_FRIDAY_OVERLAY
  );
  assert.equal(pfLocalized.endAt, INITIAL_2026_CAMPAIGN.endAt);
  assert.equal(pfLocalized.title, 'Pink Friday');
  assert.equal(pfLocalized.subtitleAr, EN_PINK_FRIDAY_OVERLAY.subtitle);
  assert.equal(pfLocalized.visuals?.subtitle, EN_PINK_FRIDAY_OVERLAY.subtitle);
  assert.equal(pfLocalized.visuals?.headline, EN_PINK_FRIDAY_OVERLAY.headline);
  assert.equal(pfLocalized.visuals?.ctaText, EN_PINK_FRIDAY_OVERLAY.ctaText);
  assert.equal(pfLocalized.visuals?.badgeText, EN_PINK_FRIDAY_OVERLAY.badgeText);

  // Article adapter flags missing English article explicitly
  const sampleArticle: Article = {
    id: 'art_missing',
    title: 'روتين العناية بالشعر',
    slug: 'untranslated-hair-care-routine',
    category: 'العناية بالشعر',
    status: 'published',
    image: '/img.jpg',
    excerpt: 'ملخص المقال',
    content: '<p>محتوى المقال</p>',
  };
  assert.equal(resolveLocalizedArticle(sampleArticle, 'en').hasTranslation, false);
});

test('translation completeness audit passes real Phase 11 dictionary/categories and flags missing synthetic fixtures', () => {
  const mockProducts: Product[] = [
    { id: '-OvPo-cuVeLHWSU8KQ22', name: 'سيروم الوجه', resolvedSlug: 'facial-serum-3x1-30ml', price: 275 },
  ];
  const mockArticles: Article[] = [
    {
      id: '0tZxM9DLSOffrbIBMMs1',
      title: 'روتين العناية بالشعر المتساقط والضعيف',
      slug: 'hair-loss-routine',
      category: 'العناية بالشعر',
      status: 'published',
      image: '/a.jpg',
      excerpt: 'ملخص',
      content: '<p>نص</p>',
    },
  ];

  // Real Phase 11 dictionary, categories, products, and articles must pass publication gate
  const realPhase11Audit = runLocalizationCompletenessAudit({
    products: mockProducts,
    articles: mockArticles,
  });
  assert.equal(realPhase11Audit.readyForPublication, true);
  assert.equal(realPhase11Audit.uiDictionary.missingKeys.length, 0);
  assert.equal(realPhase11Audit.categories.translatedCount, 4);
  assert.equal(realPhase11Audit.products.translatedCount, 1);
  assert.equal(realPhase11Audit.articles.translatedCount, 1);

  // Verify real EN content registries cover all 32 products and 8 articles
  assert.ok(Object.keys(EN_PRODUCT_CONTENT).length >= 32);
  assert.ok(Object.keys(EN_ARTICLE_CONTENT).length >= 8);
  assert.equal(Object.keys(EN_CATEGORY_CONTENT).length, 4);
  assert.ok(Object.keys(EN_MESSAGES).length >= 20);

  // Synthetic incomplete fixture must fail publication gate cleanly
  const incompleteAudit = runLocalizationCompletenessAudit({
    products: [{ id: 'missing-id', name: 'منتج', resolvedSlug: 'missing-prod', price: 100 }],
    articles: [{ id: 'missing-art', title: 'مقال', slug: 'missing-art', category: 'شعر', status: 'published', image: '/a.jpg', excerpt: 'x', content: '<p>x</p>' }],
    enMessages: {},
  });
  assert.equal(incompleteAudit.readyForPublication, false);
  assert.ok(incompleteAudit.uiDictionary.missingKeys.length > 50);
  assert.deepEqual(incompleteAudit.products.missingProductIds, ['missing-id']);
  assert.deepEqual(incompleteAudit.articles.missingArticleIds, ['missing-art']);
  assert.ok(incompleteAudit.sharedCommerceExemptions.includes('product.price'));
});
