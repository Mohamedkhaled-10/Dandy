import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../utils/products';
import {
  buildPdpCartPayload,
  computePdpEffectivePricing,
  computeReviewStats,
  extractProductHighlights,
  extractVolumeLabel,
  mergePdpCartItem,
  normalizeProductGalleryImages,
  parseDescriptionSections,
  selectRelatedProducts,
} from './product-pdp';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '-OvPo-cuVeLHWSU8KQ22',
    name: 'سيروم النضارة 3 في 1 للوجه | 30 مل',
    resolvedSlug: 'facial-serum-3x1-30ml',
    price: 275,
    originalPrice: 320,
    category: 'Skin care',
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1/serum.jpg',
    description:
      'سيروم مركز لنضارة البشرة اليومي.\n\nمميزات المنتج:\n- ترطيب خفيف سريع الامتصاص\n- مناسب للروتين الصباحي والمسائي\n\nطريقة الاستخدام:\n1) ضعي نقطتين على بشرة نظيفة\n2) دلكي بلطف حتى الامتصاص\n\nالنتائج:\nبشرة أكثر إشراقاً ومرونة.',
    onSale: false,
    isSoldOut: false,
    inStock: true,
    isHidden: false,
    ...overrides,
  };
}

test('normalizeProductGalleryImages never duplicates single-image product and supports multi-image arrays', () => {
  const single = makeProduct();
  const singleGallery = normalizeProductGalleryImages(single);
  assert.equal(singleGallery.length, 1);
  assert.equal(singleGallery[0].isFallback, false);
  assert.match(singleGallery[0].stageUrl, /w_960,h_960/);
  assert.match(singleGallery[0].zoomUrl, /w_1600,h_1600/);

  const multi = normalizeProductGalleryImages({
    name: 'معطر متعدد الصور',
    image: 'https://res.cloudinary.com/dogk78w9z/image/upload/v1/a.jpg',
    images: [
      'https://res.cloudinary.com/dogk78w9z/image/upload/v1/a.jpg', // duplicate should be stripped
      'https://res.cloudinary.com/dogk78w9z/image/upload/v1/b.jpg',
      'https://images.unsplash.com/photo-fake', // placeholder rejected
    ],
  });
  assert.equal(multi.length, 2);
  assert.equal(multi[0].alt, 'معطر متعدد الصور');
  assert.equal(multi[1].alt, 'معطر متعدد الصور — صورة 2');

  const empty = normalizeProductGalleryImages({ name: 'منتج بدون صورة', image: '' });
  assert.equal(empty.length, 1);
  assert.equal(empty[0].isFallback, true);
  assert.equal(empty[0].stageUrl, '/assets/images/logo.png');
});

test('parseDescriptionSections extracts structured Arabic sections faithfully', () => {
  const prod = makeProduct();
  const parsed = parseDescriptionSections(prod.description);
  assert.equal(parsed.hasCustomDescription, true);
  assert.equal(parsed.sections.map((s) => s.id).join(','), 'overview,features,usage,results');
  assert.equal(parsed.sections[1].bullets.length, 2);
  assert.equal(parsed.sections[2].bullets.length, 2);
  assert.match(parsed.sections[3].paragraphs[0], /إشراقاً/);

  const emptyParsed = parseDescriptionSections('   ');
  assert.equal(emptyParsed.hasCustomDescription, false);
  assert.equal(emptyParsed.sections.length, 0);

  const blankLineSeparated = parseDescriptionSections(
    'وصف أول للمجموعة.\n\nمميزات المجموعة:\n\nتنظيف لطيف\nترميم عميق\n\nطريقة الاستخدام:\n\nيغسل الشعر\nيترك الماسك'
  );
  const feat = blankLineSeparated.sections.find((s) => s.id === 'features');
  const usage = blankLineSeparated.sections.find((s) => s.id === 'usage');
  assert.equal(feat?.bullets.length, 2);
  assert.equal(usage?.bullets.length, 2);
  assert.equal(usage?.paragraphs.length, 0);
});

test('extractVolumeLabel & extractProductHighlights derive only grounded specs', () => {
  const shampoo = makeProduct({
    id: '-O_4D5IO_nPZf1fKcVlJ',
    name: 'شامبو خالي من السلفات | Free Sulfate Shampoo 500ml',
    resolvedSlug: 'free-sulfate-shampoo-500ml',
    category: 'Hair care',
  });
  assert.equal(extractVolumeLabel(shampoo), '500 مل');
  const highlights = extractProductHighlights(shampoo, parseDescriptionSections(shampoo.description));
  assert.ok(highlights.some((h) => h.id === 'volume' && h.value === '500 مل'));
  assert.ok(highlights.some((h) => h.id === 'sulfate-free' && h.value === 'خالي من السلفات'));
  assert.ok(highlights.some((h) => h.id === 'category' && h.value === 'العناية بالشعر'));

  const muskTola = makeProduct({
    id: '-Ox74e3NwfE2TabGBnUT',
    name: 'مجموعة مسك 3 تولات 3 مل',
    resolvedSlug: 'musk-collection-3-tola-3ml',
  });
  assert.equal(extractVolumeLabel(muskTola), '3 تولات · 3 مل');
});

test('computeReviewStats computes accurate distribution and verified flags from real reviews only', () => {
  const empty = computeReviewStats(null);
  assert.equal(empty.count, 0);
  assert.equal(empty.average, 0);
  assert.equal(empty.items.length, 0);

  const stats = computeReviewStats({
    r1: { rating: 5, comment: 'ممتاز جداً', customerName: 'منى', createdAt: 1700000002000, orderId: 'DNY-1001' },
    r2: { rating: 4, comment: 'رائع', customerName: 'سارة', createdAt: 1700000001000, orderId: 'N/A' },
  });
  assert.equal(stats.count, 2);
  assert.equal(stats.average, 4.5);
  assert.equal(stats.averageFormatted, '4.5');
  assert.equal(stats.items[0].author, 'منى');
  assert.equal(stats.items[0].isVerifiedPurchase, true);
  assert.equal(stats.items[1].isVerifiedPurchase, false);
  assert.equal(stats.distribution.find((d) => d.star === 5)?.percent, 50);
  assert.equal(stats.distribution.find((d) => d.star === 4)?.percent, 50);
  assert.equal(stats.distribution.find((d) => d.star === 3)?.percent, 0);
});

test('computePdpEffectivePricing matches ProductCard pricing parity and multi-scent multiplier', () => {
  const muskOffer = makeProduct({
    id: '-Ox74e3NwfE2TabGBnUT',
    price: 150,
    originalPrice: '',
    onSale: true,
    discount: 17,
  });
  const pricing = computePdpEffectivePricing(muskOffer, 0);
  assert.equal(pricing.unitBasePrice, 150);
  assert.equal(pricing.unitOldPrice, 181);
  assert.equal(pricing.discountPercent, 17);

  const splash = makeProduct({ price: 110, originalPrice: 130, onSale: false });
  const twoScents = computePdpEffectivePricing(splash, 2);
  assert.equal(twoScents.unitMultiplier, 2);
  assert.equal(twoScents.effectiveUnitPrice, 220);
  assert.equal(twoScents.effectiveOldPrice, 260);
  assert.equal(twoScents.savingsAmount, 40);
});

test('buildPdpCartPayload & mergePdpCartItem validate variants, sold-out state, and sort multi-scent keys', () => {
  const soldOut = makeProduct({ isSoldOut: true });
  const soldRes = buildPdpCartPayload({ product: soldOut, selectedVariants: [], quantity: 1 });
  assert.equal(soldRes.ok, false);
  assert.equal(soldRes.errorReason, 'sold_out');

  const mist = makeProduct({
    id: '-OWF6uqnhnu3TCvoqLSD',
    name: 'معطر جسم وشعر',
    price: 130,
    hasVariants: true,
    variantType: 'scent',
    variants: [
      { id: 'sweet_sugar', name: 'Sweet Sugar', isAvailable: true },
      { id: 'rose', name: 'Rose', isAvailable: true },
      { id: 'sold', name: 'Sold Scent', isAvailable: false },
    ],
  });

  const missingVar = buildPdpCartPayload({ product: mist, selectedVariants: [], quantity: 1 });
  assert.equal(missingVar.ok, false);
  assert.equal(missingVar.errorReason, 'missing_variant');

  const built = buildPdpCartPayload({
    product: mist,
    selectedVariants: [
      { id: 'sweet_sugar', name: 'Sweet Sugar' },
      { id: 'rose', name: 'Rose' },
      { id: 'sold', name: 'Sold Scent' }, // unavailable variant must be filtered out
    ],
    quantity: 2,
  });
  assert.equal(built.ok, true);
  assert.equal(built.item?.id, '-OWF6uqnhnu3TCvoqLSD::rose_sweet_sugar');
  assert.equal(built.item?.variantName, 'Rose، Sweet Sugar');
  assert.equal(built.item?.quantity, 2);

  // Adding same variants in reverse order merges quantity rather than duplicating row
  const builtReverse = buildPdpCartPayload({
    product: mist,
    selectedVariants: [
      { id: 'rose', name: 'Rose' },
      { id: 'sweet_sugar', name: 'Sweet Sugar' },
    ],
    quantity: 1,
  });
  let cart = mergePdpCartItem([], built.item!);
  cart = mergePdpCartItem(cart, builtReverse.item!);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
});

test('selectRelatedProducts excludes current/hidden items and returns max 4 same-category products', () => {
  const current = makeProduct({ id: 'p0', category: 'Body care' });
  const pool: Product[] = [
    current,
    makeProduct({ id: '-OvPqarOBOnNgQ_-kpTl', category: 'Perfume', name: 'Body Butter Overridden' }), // category override -> body-care
    makeProduct({ id: 'p2', category: 'Body care', isHidden: true }),
    makeProduct({ id: 'p3', category: 'Body care', name: 'Hand Cream' }),
    makeProduct({ id: 'p4', category: 'Body care', name: 'Foot Cream' }),
    makeProduct({ id: 'p5', category: 'Body care', name: 'Deodorant' }),
    makeProduct({ id: 'p6', category: 'Body care', name: 'Nail Serum', isSoldOut: true }),
    makeProduct({ id: 'p7', category: 'Hair care', name: 'Shampoo' }),
  ];

  const related = selectRelatedProducts(pool, current, 4);
  assert.equal(related.length, 4);
  assert.ok(!related.some((p) => p.id === 'p0' || p.id === 'p2' || p.id === 'p7'));
  // When 4 in-stock candidates exist, sold-out p6 is naturally excluded behind them
  assert.ok(!related.some((p) => p.id === 'p6'));

  // When fewer in-stock candidates exist, sold-out sorts last
  const smallPool = pool.filter((p) => p.id !== 'p5');
  const relatedWithSoldOut = selectRelatedProducts(smallPool, current, 4);
  assert.equal(relatedWithSoldOut.length, 4);
  assert.equal(relatedWithSoldOut[3].id, 'p6');
});
