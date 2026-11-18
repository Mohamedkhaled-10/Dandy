import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../utils/products';
import type { CampaignPricingResult } from '../utils/pink-friday-server';
import {
  FALLBACK_PRODUCT_IMAGE,
  addDirectProductToCartArray,
  formatEgpPrice,
  requiresVariantSelection,
  resolveProductCardViewModel,
  resolveProductPricing,
  selectFeaturedProducts,
} from './product-card';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '-OvPo-cuVeLHWSU8KQ22',
    name: 'سيروم الوجه 3×1 - 30 مل | Serum 30 ml',
    resolvedSlug: 'facial-serum-3x1-30ml',
    price: 275,
    category: 'Skin care',
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1789147817/serum.jpg',
    inStock: true,
    isSoldOut: false,
    isHidden: false,
    hasVariants: false,
    ...overrides,
  };
}

test('resolveProductPricing handles normal price, genuine originalPrice discount, and suppresses invalid oldPrice', () => {
  const normal = resolveProductPricing(makeProduct({ price: 275 }));
  assert.equal(normal.currentPrice, 275);
  assert.equal(normal.oldPrice, null);
  assert.equal(normal.discountPercent, null);

  const genuineDiscount = resolveProductPricing(
    makeProduct({ price: 360, originalPrice: 460, discount: 22, onSale: true })
  );
  assert.equal(genuineDiscount.currentPrice, 360);
  assert.equal(genuineDiscount.oldPrice, 460);
  assert.equal(genuineDiscount.discountPercent, 22);

  const nonLowerOriginal = resolveProductPricing(
    makeProduct({ price: 300, originalPrice: 250 })
  );
  assert.equal(nonLowerOriginal.oldPrice, null);
  assert.equal(nonLowerOriginal.discountPercent, null);

  const onSalePctOnly = resolveProductPricing(
    makeProduct({ price: 150, discount: 17, onSale: true, originalPrice: undefined })
  );
  assert.equal(onSalePctOnly.currentPrice, 150);
  assert.equal(onSalePctOnly.oldPrice, 181);
  assert.equal(onSalePctOnly.discountPercent, 17);
});

test('resolveProductPricing prioritizes eligible Pink Friday pricing cleanly', () => {
  const pfPricing: CampaignPricingResult = {
    isEligible: true,
    regularPrice: 275,
    campaignPrice: 220,
    discountAmount: 55,
    discountPercentage: 20,
    offer: {
      productId: '-OvPo-cuVeLHWSU8KQ22',
      expectedBasePrice: 275,
      discountPercentage: 20,
      campaignPrice: 220,
      active: true,
      badgeText: 'Pink Friday',
    },
  };

  const vm = resolveProductCardViewModel(makeProduct(), pfPricing);
  assert.equal(vm.currentPrice, 220);
  assert.equal(vm.oldPrice, 275);
  assert.equal(vm.isPinkFriday, true);
  assert.deepEqual(vm.badge, { text: 'Pink Friday', tone: 'campaign' });
});

test('requiresVariantSelection requires both hasVariants flag and non-empty variants', () => {
  assert.equal(requiresVariantSelection({ hasVariants: true, variants: undefined }), false);
  assert.equal(requiresVariantSelection({ hasVariants: true, variants: [] }), false);
  assert.equal(
    requiresVariantSelection({
      hasVariants: true,
      variants: [{ id: 'v1', name: 'سويت شوجر', isAvailable: true }],
    }),
    true
  );
  assert.equal(
    requiresVariantSelection({
      hasVariants: true,
      variants: { k1: { id: 'k1', name: 'مسك أبيض', isAvailable: true } },
    }),
    true
  );
});

test('resolveProductCardViewModel handles sold-out, category overrides, ratings, and safe image fallback', () => {
  // Lip Balm category override -> skin-care
  const soldOutProduct = resolveProductCardViewModel(
    makeProduct({
      id: '-OvPpguWTAtcaWirD9Um',
      category: 'Body care',
      isSoldOut: true,
      image: '',
      rating: 5,
      reviewCount: 0,
    })
  );
  assert.equal(soldOutProduct.categorySlug, 'skin-care');
  assert.equal(soldOutProduct.categoryLabelAr, 'العناية بالبشرة');
  assert.equal(soldOutProduct.isSoldOut, true);
  assert.equal(soldOutProduct.ctaLabel, 'نفذت الكمية');
  assert.equal(soldOutProduct.cartPayload, null);
  assert.equal(soldOutProduct.imageUrl, FALLBACK_PRODUCT_IMAGE);
  assert.equal(soldOutProduct.isFallbackImage, true);
  assert.equal(soldOutProduct.shouldShowRating, false);
  assert.deepEqual(soldOutProduct.badge, { text: 'نفذت الكمية', tone: 'soldout' });

  // Product with real verified reviews
  const reviewed = resolveProductCardViewModel(
    makeProduct({ avgRating: 4.5, reviewCount: 2, hasVariants: true, variants: [{ id: 'a', name: 'A' }] })
  );
  assert.equal(reviewed.shouldShowRating, true);
  assert.equal(reviewed.ratingValue, '4.5');
  assert.equal(reviewed.reviewCount, 2);
  assert.equal(reviewed.requiresVariantSelection, true);
  assert.equal(reviewed.ctaLabel, 'اختاري الخيار');
  assert.equal(reviewed.cartPayload, null);
});

test('addDirectProductToCartArray increments single-product item quantity without duplicating', () => {
  const vm = resolveProductCardViewModel(makeProduct());
  assert.ok(vm.cartPayload);

  const first = addDirectProductToCartArray([], vm.cartPayload);
  assert.equal(first.length, 1);
  assert.equal(first[0].quantity, 1);
  assert.equal(first[0].productId, vm.id);

  const second = addDirectProductToCartArray(first, vm.cartPayload);
  assert.equal(second.length, 1);
  assert.equal(second[0].quantity, 2);
  assert.equal(formatEgpPrice(second[0].price), '275 ج.م');
});

test('selectFeaturedProducts excludes hidden items and provides balanced category coverage', () => {
  const pool: Product[] = [
    makeProduct({ id: '1', category: 'Skin care', resolvedSlug: 'p1', isHidden: true }),
    makeProduct({ id: '2', category: 'Skin care', resolvedSlug: 'p2' }),
    makeProduct({ id: '3', category: 'Hair care', resolvedSlug: 'p3', onSale: true }),
    makeProduct({ id: '4', category: 'Body care', resolvedSlug: 'p4' }),
    makeProduct({ id: '5', category: 'Perfume', resolvedSlug: 'p5' }),
  ];

  const featured = selectFeaturedProducts(pool, 4);
  assert.equal(featured.length, 4);
  assert.equal(featured.some((p) => p.id === '1'), false);
  const ids = featured.map((p) => p.id);
  assert.deepEqual(new Set(ids), new Set(['2', '3', '4', '5']));
});
