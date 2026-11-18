import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActiveCatalogChips,
  buildCatalogItemMeta,
  computeCairoCountdown,
  countActiveFilters,
  filterAndSortCatalogItems,
  getDefaultCatalogFilterState,
  isSpecialOfferEligible,
  normalizeCatalogCategoryParam,
  parseCatalogQueryState,
  resolvePinkFridayDisplayMode,
  serializeCatalogQueryState,
  type CatalogItemMeta,
} from './catalog';
import type { Product } from '../utils/products';
import type { CampaignPricingResult } from '../utils/pink-friday-server';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id || 'prod-1',
    name: overrides.name || 'سيروم الوجه الطبيعي',
    resolvedSlug: overrides.resolvedSlug || 'facial-serum',
    price: overrides.price ?? 220,
    category: overrides.category || 'Skin care',
    onSale: overrides.onSale ?? false,
    bestSeller: overrides.bestSeller ?? false,
    isSoldOut: overrides.isSoldOut ?? false,
    inStock: overrides.inStock ?? true,
    ...overrides,
  };
}

test('normalizeCatalogCategoryParam maps legacy Firebase labels and canonical slugs', () => {
  assert.equal(normalizeCatalogCategoryParam('skin care'), 'skin-care');
  assert.equal(normalizeCatalogCategoryParam('hair care'), 'hair-care');
  assert.equal(normalizeCatalogCategoryParam('body care'), 'body-care');
  assert.equal(normalizeCatalogCategoryParam('perfume'), 'fragrance');
  assert.equal(normalizeCatalogCategoryParam('fragrance'), 'fragrance');
  assert.equal(normalizeCatalogCategoryParam('منتجات الشعر'), 'hair-care');
  assert.equal(normalizeCatalogCategoryParam('unknown-slug'), null);
});

test('parseCatalogQueryState and serializeCatalogQueryState round-trip multi-filter queries cleanly', () => {
  const parsed = parseCatalogQueryState('?search=سيروم&category=skin%20care,hair-care&price=150-300&sale=1&availability=in-stock&bestseller=1&sort=price-asc');
  assert.equal(parsed.search, 'سيروم');
  assert.deepEqual(parsed.categories, ['skin-care', 'hair-care']);
  assert.equal(parsed.priceRange, '150-300');
  assert.equal(parsed.saleOnly, true);
  assert.equal(parsed.inStockOnly, true);
  assert.equal(parsed.bestSellerOnly, true);
  assert.equal(parsed.sort, 'price-asc');

  const serialized = serializeCatalogQueryState(parsed);
  assert.equal(
    serialized,
    'search=%D8%B3%D9%8A%D8%B1%D9%88%D9%85&category=skin-care%2Chair-care&price=150-300&sale=1&availability=in-stock&bestseller=1&sort=price-asc'
  );
});

test('parseCatalogQueryState ignores category query parameter when lockedCategorySlug is set', () => {
  const parsed = parseCatalogQueryState('?category=hair-care&sort=price-desc', {
    lockedCategorySlug: 'skin-care',
  });
  assert.deepEqual(parsed.categories, []);
  assert.equal(parsed.sort, 'price-desc');
});

test('filterAndSortCatalogItems intersects search, category, price range, sale, stock, and bestSeller filters and sorts cleanly', () => {
  const sampleProducts: Product[] = [
    makeProduct({ id: 'p1', name: 'سيروم فيتامين سي', price: 240, category: 'Skin care', bestSeller: true, onSale: false }),
    makeProduct({ id: 'p2', name: 'مجموعة القشرة', price: 360, originalPrice: 460, category: 'Hair care', onSale: true }),
    makeProduct({ id: 'p3', name: 'مرطب شفاه طبيعي', price: 85, category: 'Skin care', onSale: false, isSoldOut: true }),
    makeProduct({ id: 'p4', name: 'مسك داندي', price: 150, discount: 17, category: 'Perfume', onSale: true, bestSeller: true }),
  ];

  const items: CatalogItemMeta[] = sampleProducts.map((p, idx) => buildCatalogItemMeta(p, idx));

  // Filter by Skin care + price 150-300 + bestSellerOnly
  const skinBest = filterAndSortCatalogItems(items, {
    ...getDefaultCatalogFilterState(),
    categories: ['skin-care'],
    priceRange: '150-300',
    bestSellerOnly: true,
  });
  assert.deepEqual(skinBest.map((i) => i.id), ['p1']);

  // Filter inStockOnly hides sold-out p3
  const inStockSkin = filterAndSortCatalogItems(items, {
    ...getDefaultCatalogFilterState(),
    categories: ['skin-care'],
    inStockOnly: true,
  });
  assert.deepEqual(inStockSkin.map((i) => i.id), ['p1']);

  // Price descending order across all items
  const desc = filterAndSortCatalogItems(items, {
    ...getDefaultCatalogFilterState(),
    sort: 'price-desc',
  });
  assert.deepEqual(desc.map((i) => i.id), ['p2', 'p1', 'p4', 'p3']);

  // Price ascending order across all items
  const asc = filterAndSortCatalogItems(items, {
    ...getDefaultCatalogFilterState(),
    sort: 'price-asc',
  });
  assert.deepEqual(asc.map((i) => i.id), ['p3', 'p4', 'p1', 'p2']);

  // Empty result when query does not match
  const empty = filterAndSortCatalogItems(items, {
    ...getDefaultCatalogFilterState(),
    search: 'كلمة غير موجودة تماما',
  });
  assert.equal(empty.length, 0);
});

test('isSpecialOfferEligible preserves legacy strict onSale / eligible Pink Friday rule without leaking non-sale originalPrice products', () => {
  const nonSaleWithStaticOldPrice = makeProduct({
    id: 'static-old',
    price: 200,
    originalPrice: 260,
    onSale: false,
  });
  const genuineOnSale = makeProduct({
    id: 'real-sale',
    price: 150,
    discount: 17,
    onSale: true,
  });
  const eligiblePinkFriday: CampaignPricingResult = {
    isEligible: true,
    regularPrice: 200,
    campaignPrice: 160,
    discountAmount: 40,
    discountPercentage: 20,
  };

  assert.equal(isSpecialOfferEligible(nonSaleWithStaticOldPrice, null), false);
  assert.equal(isSpecialOfferEligible(genuineOnSale, null), true);
  assert.equal(isSpecialOfferEligible(nonSaleWithStaticOldPrice, eligiblePinkFriday), true);
});

test('active filter chips and count exclude hidden category filter when showCategoryFilter is false', () => {
  const state = {
    ...getDefaultCatalogFilterState(),
    categories: ['skin-care'],
    priceRange: 'under-150' as const,
    saleOnly: true,
  };
  assert.equal(countActiveFilters(state, { showCategoryFilter: true }), 3);
  assert.equal(countActiveFilters(state, { showCategoryFilter: false }), 2);

  const chips = buildActiveCatalogChips(state, { showCategoryFilter: false });
  assert.deepEqual(chips.map((c) => c.key), ['priceRange', 'saleOnly']);
});

test('computeCairoCountdown appends +02:00 to naive ISO timestamps and clamps expired timestamps to zero', () => {
  const targetIso = '2026-11-30T23:59:00';
  const targetUtcMs = Date.parse('2026-11-30T23:59:00+02:00');
  const oneDayTwoHoursAgo = targetUtcMs - (1 * 86400 + 2 * 3600 + 3 * 60 + 4) * 1000;

  const active = computeCairoCountdown(targetIso, oneDayTwoHoursAgo);
  assert.equal(active.isExpired, false);
  assert.equal(active.days, 1);
  assert.equal(active.hours, 2);
  assert.equal(active.minutes, 3);
  assert.equal(active.seconds, 4);

  const expired = computeCairoCountdown(targetIso, targetUtcMs + 999999);
  assert.equal(expired.isExpired, true);
  assert.equal(expired.totalMs, 0);
  assert.equal(expired.days, 0);
  assert.equal(expired.hours, 0);
  assert.equal(expired.minutes, 0);
  assert.equal(expired.seconds, 0);
});

test('resolvePinkFridayDisplayMode resolves all campaign lifecycle and inventory combinations accurately', () => {
  assert.equal(resolvePinkFridayDisplayMode('active', 3, 5), 'active-full');
  assert.equal(resolvePinkFridayDisplayMode('active', 0, 16), 'active-bundles-only');
  assert.equal(resolvePinkFridayDisplayMode('active', 4, 0), 'active-offers-only');
  assert.equal(resolvePinkFridayDisplayMode('active', 0, 0), 'active-empty');
  assert.equal(resolvePinkFridayDisplayMode('upcoming', 0, 0), 'upcoming');
  assert.equal(resolvePinkFridayDisplayMode('ended', 4, 2), 'ended');
  assert.equal(resolvePinkFridayDisplayMode('disabled', 4, 2), 'disabled');
});
