import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCreateOrderPayload,
  buildWhatsappOrderInquiryUrl,
  calculateCartItemCount,
  calculateCartSubtotal,
  calculateShippingQuote,
  computeFreeShippingProgress,
  doesOrderPhoneMatch,
  escapeHtml,
  formatOrderLineItem,
  getShippingFeeForGovernorate,
  normalizeOrderStatusMeta,
  parseCartArrayFromStrings,
  resolveEffectiveUnitPrice,
  resolveVariantsDisplayInfo,
  upsertRecentLookup,
  validateCheckoutForm,
  type CartItemInput,
} from './purchase-flow';

test('parseCartArrayFromStrings falls back to legacy dandy_cart when cart is empty or missing', () => {
  const legacyOnly = parseCartArrayFromStrings(
    null,
    JSON.stringify([{ id: 'col-1', type: 'collection', isCollection: true, price: 650, quantity: 1 }])
  );
  assert.equal(legacyOnly.length, 1);
  assert.equal(legacyOnly[0].collectionId ?? legacyOnly[0].id, 'col-1');

  const primaryTakesPrecedence = parseCartArrayFromStrings(
    JSON.stringify([{ id: 'p-1', name: 'Serum', price: 220, quantity: 2 }]),
    JSON.stringify([{ id: 'p-legacy', price: 100, quantity: 1 }])
  );
  assert.equal(primaryTakesPrecedence.length, 1);
  assert.equal(primaryTakesPrecedence[0].id, 'p-1');
});

test('multi-scent variants unit price multiplies base price cleanly like variants.js', () => {
  const singleScent: CartItemInput = {
    id: 'p1::rose',
    productId: 'p1',
    name: 'معطر جسم',
    price: 180,
    quantity: 2,
    selectedVariants: [{ id: 'rose', name: 'الورد' }],
  };
  assert.equal(resolveVariantsDisplayInfo(singleScent)?.label, 'الرائحة');
  assert.equal(resolveEffectiveUnitPrice(singleScent), 180);

  const multiScent: CartItemInput = {
    id: 'p1::musk_rose',
    productId: 'p1',
    name: 'معطر جسم',
    price: 180,
    quantity: 1,
    selectedVariants: [
      { id: 'musk', name: 'المسك' },
      { id: 'rose', name: 'الورد' },
    ],
  };
  const info = resolveVariantsDisplayInfo(multiScent);
  assert.equal(info?.count, 2);
  assert.equal(info?.label, 'الروائح');
  assert.equal(info?.text, 'المسك، الورد');
  assert.equal(resolveEffectiveUnitPrice(multiScent), 360);

  assert.equal(calculateCartSubtotal([singleScent, multiScent]), 720);
  assert.equal(calculateCartItemCount([singleScent, multiScent]), 3);
});

test('shipping fees match create-order.js tiers and free shipping triggers strictly above 2000 EGP', () => {
  assert.equal(getShippingFeeForGovernorate('Gharbia'), 70);
  assert.equal(getShippingFeeForGovernorate('Cairo'), 85);
  assert.equal(getShippingFeeForGovernorate('Fayoum'), 100);
  assert.equal(getShippingFeeForGovernorate('Aswan'), 120);
  assert.equal(getShippingFeeForGovernorate(''), null);

  // At exactly 2000 EGP, shipping is NOT free (subtotal > 2000 required)
  const at2000 = calculateShippingQuote(2000, 'Cairo');
  assert.equal(at2000.isFreeShipping, false);
  assert.equal(at2000.shippingFee, 85);
  assert.equal(at2000.totalAmount, 2085);

  const progAt2000 = computeFreeShippingProgress(2000);
  assert.equal(progAt2000.qualifies, false);
  assert.equal(progAt2000.remainingForFree, 1);

  // Above 2000 EGP, shipping becomes free
  const at2001 = calculateShippingQuote(2001, 'Aswan');
  assert.equal(at2001.isFreeShipping, true);
  assert.equal(at2001.shippingFee, 0);
  assert.equal(at2001.totalAmount, 2001);

  const progAt2001 = computeFreeShippingProgress(2001);
  assert.equal(progAt2001.qualifies, true);
  assert.equal(progAt2001.remainingForFree, 0);
  assert.equal(progAt2001.percentComplete, 100);
});

test('validateCheckoutForm catches invalid Egyptian phones, short names, bad emails, and missing address fields', () => {
  const invalid = validateCheckoutForm({
    name: 'سارة',
    phone: '01912345678',
    email: 'not-an-email',
    governorate: '',
    city: '',
    address: 'ش',
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.firstErrorField, 'name');
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.phone);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.governorate);
  assert.ok(invalid.errors.city);
  assert.ok(invalid.errors.address);

  const valid = validateCheckoutForm({
    name: 'سارة محمود أحمد',
    phone: '01012345678',
    email: '',
    governorate: 'Cairo',
    city: 'مدينة نصر',
    address: 'شارع عباس العقاد عمارة 12',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.firstErrorField, null);
});

test('buildCreateOrderPayload preserves standard, variant, and Pink Friday collection contracts', () => {
  const cart: CartItemInput[] = [
    {
      id: 'prod-1::vanilla',
      productId: 'prod-1',
      name: 'لوشن الجسم',
      price: 220,
      quantity: 2,
      image: 'https://res.cloudinary.com/demo/image/upload/v1/lotion.jpg',
      selectedVariants: [{ id: 'vanilla', name: 'فانيليا' }],
    },
    {
      type: 'collection',
      isCollection: true,
      isPinkFriday: true,
      collectionId: 'pf-bundle-1',
      name: 'مجموعة العناية الكاملة',
      price: 699,
      regularPrice: 950,
      image: 'https://res.cloudinary.com/demo/image/upload/v1/bundle.jpg',
      quantity: 1,
      selectedItems: [
        {
          collectionItemId: 'ci-1',
          productId: 'prod-2',
          productName: 'سيروم الوجه',
          selectedVariant: { id: 'rose', name: 'ورد' },
        },
      ],
    },
  ];

  const payload = buildCreateOrderPayload({
    form: {
      name: 'نور الهدى محمد',
      phone: '01123456789',
      email: '',
      governorate: 'Gharbia',
      city: 'طنطا',
      address: 'شارع البحر 14',
    },
    cart,
    idToken: null,
    turnstileToken: 'test-turnstile-token',
  });

  assert.equal(payload.customer.email, 'N/A');
  assert.equal(payload.idToken, null);
  assert.equal(payload.turnstileToken, 'test-turnstile-token');
  assert.equal(payload.items.length, 2);

  assert.deepEqual(payload.items[0], {
    productId: 'prod-1',
    name: 'لوشن الجسم',
    image: 'https://res.cloudinary.com/demo/image/upload/v1/lotion.jpg',
    quantity: 2,
    selectedVariants: [{ id: 'vanilla', name: 'فانيليا' }],
  });

  assert.equal(payload.items[1].type, 'collection');
  assert.equal(payload.items[1].isCollection, true);
  assert.equal(payload.items[1].isPinkFriday, true);
  assert.equal(payload.items[1].collectionId, 'pf-bundle-1');
  assert.equal(payload.items[1].selectedItems.length, 1);
});

test('normalizeOrderStatusMeta handles all 5 canonical statuses and historical aliases', () => {
  assert.deepEqual(normalizeOrderStatusMeta('New'), {
    key: 'new',
    isCancelled: false,
    label: 'قيد المراجعة',
    badgeTone: 'new',
    progressPercent: 0,
    activeStepIndex: 0,
  });
  assert.equal(normalizeOrderStatusMeta('قيد الانتظار').key, 'new');
  assert.equal(normalizeOrderStatusMeta('تم التواصل').key, 'processing');
  assert.equal(normalizeOrderStatusMeta('Processing').progressPercent, 33);
  assert.equal(normalizeOrderStatusMeta('جاري الشحن').key, 'shipped');
  assert.equal(normalizeOrderStatusMeta('Shipped').progressPercent, 66);
  assert.equal(normalizeOrderStatusMeta('مكتمل').key, 'delivered');
  assert.equal(normalizeOrderStatusMeta('Delivered').progressPercent, 100);

  const cancelled = normalizeOrderStatusMeta('ملغي');
  assert.equal(cancelled.isCancelled, true);
  assert.equal(cancelled.label, 'تم الإلغاء');
  assert.equal(cancelled.activeStepIndex, -1);
});

test('formatOrderLineItem formats collections, variants, discounts, and rejects Unsplash fallback URLs', () => {
  const colFormatted = formatOrderLineItem({
    type: 'collection',
    isCollection: true,
    isPinkFriday: true,
    name: 'باقة السعادة',
    price: 900,
    effectiveUnitPrice: 650,
    lineTotal: 650,
    quantity: 1,
    image: 'https://images.unsplash.com/photo-123',
    items: [
      { productName: 'مرطب جسم', variantName: 'فانيليا' },
      { productName: 'سيروم شعر', selectedVariant: { name: 'أرجان' } },
    ],
  });
  assert.equal(colFormatted.isCollection, true);
  assert.equal(colFormatted.image, '/assets/images/logo.png');
  assert.equal(colFormatted.crossedTotal, 900);
  assert.deepEqual(colFormatted.collectionItems, [
    { productName: 'مرطب جسم', variantName: 'فانيليا' },
    { productName: 'سيروم شعر', variantName: 'أرجان' },
  ]);
});

test('doesOrderPhoneMatch, upsertRecentLookup, escapeHtml, and buildWhatsappOrderInquiryUrl behave safely', () => {
  assert.equal(doesOrderPhoneMatch('+20 101-234-5678', '01012345678'), true);
  assert.equal(doesOrderPhoneMatch('+20 112-345-6789', '01123456789'), true);
  assert.equal(doesOrderPhoneMatch('01012345678', '010-1234-5678'), true);
  assert.equal(doesOrderPhoneMatch('01012345678', '01199999999'), false);
  assert.equal(doesOrderPhoneMatch('01012345678', '123'), false);
  assert.equal(escapeHtml('<script>"test"</script>'), '&lt;script&gt;&quot;test&quot;&lt;/script&gt;');

  const updated = upsertRecentLookup(
    [
      { code: 'DNY-111111', phone: '01000000001', time: 1 },
      { code: 'DNY-222222', phone: '01000000002', time: 2 },
      { code: 'DNY-333333', phone: '01000000003', time: 3 },
      { code: 'DNY-444444', phone: '01000000004', time: 4 },
    ],
    'dny-222222',
    '01099999999',
    99
  );
  assert.equal(updated.length, 4);
  assert.equal(updated[0].code, 'DNY-222222');
  assert.equal(updated[0].phone, '01099999999');

  const waUrl = buildWhatsappOrderInquiryUrl({
    invoiceCode: 'DNY-123456',
    customerName: 'مريم علي',
    statusLabel: 'قيد التجهيز',
    pageUrl: 'https://dandy-ebon.vercel.app/invoice?invoice=DNY-123456',
  });
  assert.ok(waUrl.startsWith('https://wa.me/201038941005?text='));
  assert.ok(decodeURIComponent(waUrl).includes('DNY-123456'));
});
