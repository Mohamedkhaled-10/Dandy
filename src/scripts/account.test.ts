import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectDeliveredProductIds,
  computeAccountStats,
  extractCustomerInitial,
  formatCustomerOrderViewModel,
  getRelatedProductsForArticle,
  isOrderStatusDelivered,
  mapFirebaseAuthErrorAr,
  normalizeCustomerAddress,
  normalizeEgyptianPhone,
  normalizeGovernorateCode,
  ratingDescriptionLabel,
  resolveWishlistCardModel,
  sortAddressesDefaultFirst,
  validateAddressInput,
  validateLoginInput,
  validateSignupInput,
} from './account';
import type { Product } from '../utils/products';

test('normalizeEgyptianPhone normalizes +20 and 20 prefixes cleanly', () => {
  assert.equal(normalizeEgyptianPhone('01038941005'), '01038941005');
  assert.equal(normalizeEgyptianPhone('+201038941005'), '01038941005');
  assert.equal(normalizeEgyptianPhone('201122334455'), '01122334455');
});

test('validateLoginInput rejects empty/invalid inputs and accepts valid credentials', () => {
  assert.equal(validateLoginInput({ email: '', password: '123' }).valid, false);
  assert.equal(validateLoginInput({ email: 'bad-email', password: '123' }).valid, false);
  assert.equal(validateLoginInput({ email: 'sara@example.com', password: '' }).valid, false);
  const ok = validateLoginInput({ email: ' sara@example.com ', password: 'secret' });
  assert.equal(ok.valid, true);
  assert.equal(ok.email, 'sara@example.com');
});

test('validateSignupInput enforces name, Egyptian phone, email, and 6+ password', () => {
  assert.equal(
    validateSignupInput({ name: 'أ', phone: '01038941005', email: 'a@b.com', password: 'password' }).field,
    'name'
  );
  assert.equal(
    validateSignupInput({ name: 'سارة أحمد', phone: '01938941005', email: 'a@b.com', password: 'password' }).field,
    'phone'
  );
  assert.equal(
    validateSignupInput({ name: 'سارة أحمد', phone: '01038941005', email: 'not-email', password: 'password' }).field,
    'email'
  );
  assert.equal(
    validateSignupInput({ name: 'سارة أحمد', phone: '01038941005', email: 'a@b.com', password: '123' }).field,
    'password'
  );
  const ok = validateSignupInput({
    name: ' سارة أحمد ',
    phone: '+201038941005',
    email: ' sara@dandy.com ',
    password: 'password123',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.sanitized.phone, '01038941005');
});

test('mapFirebaseAuthErrorAr returns readable Arabic messages', () => {
  assert.match(mapFirebaseAuthErrorAr('auth/wrong-password'), /غير صحيحة/);
  assert.match(mapFirebaseAuthErrorAr('auth/email-already-in-use', 'signup'), /مسجل بالفعل/);
  assert.match(mapFirebaseAuthErrorAr('auth/too-many-requests'), /حظر المحاولات/);
});

test('normalizeGovernorateCode fixes legacy Asyut to Assiut matching checkout', () => {
  assert.equal(normalizeGovernorateCode('Asyut'), 'Assiut');
  assert.equal(normalizeGovernorateCode('Cairo'), 'Cairo');
  const addr = normalizeCustomerAddress('addr-1', {
    label: 'المنزل',
    phone: '01038941005',
    governorate: 'Asyut',
    city: 'أسيوط',
    street: 'شارع الجمهورية 14',
    isDefault: true,
    createdAt: 100,
  });
  assert.equal(addr.governorate, 'Assiut');
  assert.equal(addr.governorateAr, 'أسيوط');
});

test('validateAddressInput validates required fields and normalizes governorate', () => {
  assert.equal(
    validateAddressInput({ label: 'م', phone: '01038941005', governorate: 'Cairo', city: 'نصر', street: 'شارع عباس العقاد' }).field,
    'label'
  );
  assert.equal(
    validateAddressInput({ label: 'المنزل', phone: '01038941005', governorate: 'UnknownGov', city: 'نصر', street: 'شارع عباس العقاد' }).field,
    'governorate'
  );
  const okNoPhone = validateAddressInput({
    label: ' المنزل ',
    governorate: 'Asyut',
    city: ' أسيوط ',
    address: ' شارع النميس 22 ',
    isDefault: true,
  });
  assert.equal(okNoPhone.valid, true);
  assert.equal(okNoPhone.sanitized.phone, '');
  assert.equal(okNoPhone.sanitized.governorate, 'Assiut');
  assert.equal(okNoPhone.sanitized.street, 'شارع النميس 22');

  const ok = validateAddressInput({
    label: ' المنزل ',
    phone: '+201038941005',
    governorate: 'Asyut',
    city: ' أسيوط ',
    street: ' شارع النميس 22 ',
    isDefault: true,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.sanitized.governorate, 'Assiut');
  assert.equal(ok.sanitized.phone, '01038941005');
});

test('sortAddressesDefaultFirst orders default address first, then newest', () => {
  const sorted = sortAddressesDefaultFirst([
    normalizeCustomerAddress('a', { label: 'A', isDefault: false, createdAt: 200 }),
    normalizeCustomerAddress('b', { label: 'B', isDefault: true, createdAt: 100 }),
    normalizeCustomerAddress('c', { label: 'C', isDefault: false, createdAt: 300 }),
  ]);
  assert.deepEqual(sorted.map((x) => x.id), ['b', 'c', 'a']);
});

test('formatCustomerOrderViewModel handles delivered status, invoiceCode, products, collection sub-items, and invoice/track URLs', () => {
  assert.equal(isOrderStatusDelivered('Delivered'), true);
  assert.equal(isOrderStatusDelivered('تم التسليم'), true);
  assert.equal(isOrderStatusDelivered('Pending'), false);

  const vm = formatCustomerOrderViewModel('-Ord1', {
    invoiceCode: 'DNY-9901',
    status: 'Delivered',
    governorate: 'Asyut',
    city: 'أسيوط',
    createdAt: 1700000000000,
    totalAmount: 520,
    products: [
      {
        id: 'col-1',
        type: 'collection',
        isCollection: true,
        name: 'باقة العناية بالشعر',
        price: 520,
        quantity: 1,
        selectedItems: [{ productName: 'شامبو', variantName: 'اللافندر' }],
      },
    ],
  });

  assert.equal(vm.code, 'DNY-9901');
  assert.equal(vm.isDelivered, true);
  assert.equal(vm.governorateAr, 'أسيوط');
  assert.equal(vm.city, 'أسيوط');
  assert.equal(vm.items.length, 1);
  assert.equal(vm.items[0].collectionItems[0].variantName, 'اللافندر');
  assert.equal(vm.invoiceHref, '/invoice?invoice=DNY-9901');
  assert.equal(vm.trackHref, '/track-order?invoice=DNY-9901');
});

test('collectDeliveredProductIds collects unique IDs only from delivered orders', () => {
  const ids = collectDeliveredProductIds([
    { status: 'Pending', items: [{ productId: 'p-pending' }] },
    { status: 'Delivered', items: [{ id: 'p-1' }, { productId: 'p-2' }] },
  ]);
  assert.equal(ids.has('p-pending'), false);
  assert.equal(ids.has('p-1'), true);
  assert.equal(ids.has('p-2'), true);
});

test('resolveWishlistCardModel replaces Unsplash fallback and respects hidden flag', () => {
  assert.equal(
    resolveWishlistCardModel('p1', { name: 'Serum', price: 250, isHidden: true }),
    null
  );

  const card = resolveWishlistCardModel('p2', {
    name: 'سيروم الوجه',
    resolvedSlug: 'facial-serum-3x1-30ml',
    price: 300,
    originalPrice: 400,
    image: 'https://images.unsplash.com/photo-123',
    category: 'skin-care',
  });
  assert.ok(card);
  assert.equal(card.isFallbackImage, true);
  assert.equal(card.imageUrl, '/assets/images/logo.png');
  assert.equal(card.href, '/product/facial-serum-3x1-30ml');
  assert.equal(card.currentPrice, 300);
  assert.equal(card.oldPrice, 400);
  assert.ok(card.cartPayload);
});

test('getRelatedProductsForArticle matches only visible mapped products for article slug', () => {
  const catalog: Product[] = [
    { id: '1', name: 'غسول الوجه', resolvedSlug: 'facial-cleanser-150ml', price: 180 },
    { id: '2', name: 'سيروم', resolvedSlug: 'facial-serum-3x1-30ml', price: 320, isHidden: true },
    { id: '3', name: 'مجموعة البشرة', resolvedSlug: 'skin-care-collection', price: 450 },
  ];
  const related = getRelatedProductsForArticle('daily-skincare-routine-healthy-skin', catalog);
  assert.deepEqual(related.map((p) => p.id), ['3', '1']);
  assert.deepEqual(getRelatedProductsForArticle('non-existent-article', catalog), []);
});

test('misc account display helpers', () => {
  assert.equal(extractCustomerInitial('نورهان', 'n@dandy.com'), 'ن');
  assert.equal(extractCustomerInitial('', 'sara@dandy.com'), 'S');
  assert.equal(extractCustomerInitial('', ''), 'D');
  assert.match(ratingDescriptionLabel(5), /ممتاز/);
  assert.deepEqual(computeAccountStats({ orders: 3, wishlist: 2, addresses: 1 }), {
    ordersCount: 3,
    wishlistCount: 2,
    addressesCount: 1,
  });
});
