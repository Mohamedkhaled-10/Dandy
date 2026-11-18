import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHIPPING_ANNOUNCEMENT,
  calculateCartQuantity,
  isNavHrefActive,
  normalizeRoutePath,
  resolveAnnouncementState,
  scoreAndFilterSearchProducts,
} from './shell';

test('normalizeRoutePath strips query, hash, and trailing slash consistently', () => {
  assert.equal(normalizeRoutePath('/'), '/');
  assert.equal(normalizeRoutePath(''), '/');
  assert.equal(normalizeRoutePath('/all-products/'), '/all-products');
  assert.equal(normalizeRoutePath('/category/skin-care/?sort=price#top'), '/category/skin-care');
});

test('isNavHrefActive matches exact routes, category prefixes, and ignores root partial matches', () => {
  assert.equal(isNavHrefActive('/', '/'), true);
  assert.equal(isNavHrefActive('/all-products', '/'), false);
  assert.equal(isNavHrefActive('/category/skin-care', '/category/skin-care'), true);
  assert.equal(isNavHrefActive('/category/hair-care', '/all-products', ['/category']), true);
  assert.equal(isNavHrefActive('/product/facial-serum-3x1-30ml', '/all-products', ['/category']), false);
  assert.equal(isNavHrefActive('/pink-friday', '/special-offers', ['/pink-friday']), true);
});

test('resolveAnnouncementState returns single bar payload for Pink Friday vs free shipping', () => {
  const shipping = resolveAnnouncementState(false, null);
  assert.deepEqual(shipping, {
    mode: 'shipping',
    headline: DEFAULT_SHIPPING_ANNOUNCEMENT,
  });

  const pf = resolveAnnouncementState(true, {
    visuals: {
      headline: 'عروض Pink Friday حتى 40%',
      ctaText: 'تسوقي العرض',
    },
  });
  assert.deepEqual(pf, {
    mode: 'pink-friday',
    headline: 'عروض Pink Friday حتى 40%',
    ctaText: 'تسوقي العرض',
    ctaHref: '/pink-friday',
  });
});

test('calculateCartQuantity sums valid item quantities and tolerates malformed storage', () => {
  assert.equal(calculateCartQuantity(null), 0);
  assert.equal(calculateCartQuantity('{bad-json'), 0);
  assert.equal(calculateCartQuantity('[]'), 0);
  assert.equal(
    calculateCartQuantity(JSON.stringify([{ id: '1', quantity: 2 }, { id: '2' }, { id: '3', quantity: -1 }])),
    3
  );
});

test('scoreAndFilterSearchProducts ranks exact and prefix matches above substring matches and computes old prices', () => {
  const ranked = scoreAndFilterSearchProducts(
    {
      p1: {
        name: 'كريم ترطيب البشرة',
        category: 'العناية بالبشرة',
        slug: 'moisturizing-cream',
        price: 350,
      },
      p2: {
        name: 'سيروم الوجه الثلاثي',
        category: 'العناية بالبشرة',
        slug: 'facial-serum-3x1-30ml',
        price: 450,
        onSale: true,
        discount: 25,
      },
      p3: {
        name: 'سيروم',
        category: 'العناية بالبشرة',
        slug: 'pure-serum',
        price: 500,
        originalPrice: 620,
      },
    },
    'سيروم'
  );

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'p3');
  assert.equal(ranked[0].oldPrice, 620);
  assert.equal(ranked[1].id, 'p2');
  assert.equal(ranked[1].oldPrice, 600);
  assert.equal(ranked[1].href, '/product/facial-serum-3x1-30ml');
});
