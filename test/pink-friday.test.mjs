// test/pink-friday.test.mjs
// Automated Test Suite for Dandy Cosmetics Pink Friday Campaign Pricing & Validation Engine

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCampaignStatus,
  isCampaignActive,
  isCampaignUpcoming,
  isCampaignEnded,
  validateOffer,
  calculatePinkFridayPricing
} from '../src/config/pink-friday.ts';

// Base mock product
const baseProduct = {
  id: 'prod-001',
  name: 'كريم بديل الليزر',
  price: 500,
  isHidden: false,
  isSoldOut: false,
  onSale: false
};

// Base mock valid offer
const baseOffer = {
  productId: 'prod-001',
  expectedBasePrice: 500,
  campaignPrice: 425,
  active: true,
  badgeText: 'Pink Friday'
};

// Base mock active config
const activeConfig = {
  enabled: true,
  campaignId: 'pink-friday',
  title: 'Pink Friday',
  subtitleAr: 'عروض حصرية',
  timezone: 'Africa/Cairo',
  startAt: '2026-11-01T00:00:00+02:00',
  endAt: '2026-11-30T23:59:59+02:00',
  offers: [baseOffer]
};

const fixedNow = new Date('2026-11-15T12:00:00+02:00');

// 1. Valid campaign product during active dates
test('Case 1: Valid campaign product during active dates is eligible', () => {
  const pricing = calculatePinkFridayPricing(baseProduct, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, true);
  assert.equal(pricing.regularPrice, 500);
  assert.equal(pricing.campaignPrice, 425);
  assert.equal(pricing.discountAmount, 75);
  assert.equal(pricing.discountPercentage, 15);
});

// 2. Non-campaign product
test('Case 2: Non-campaign product is not eligible and retains regular price', () => {
  const otherProd = { ...baseProduct, id: 'prod-999', price: 300 };
  const pricing = calculatePinkFridayPricing(otherProd, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.campaignPrice, 300);
  assert.equal(pricing.discountAmount, 0);
  assert.equal(pricing.reason, 'OFFER_NOT_FOUND');
});

// 3. Campaign disabled
test('Case 3: Campaign disabled results in no discount', () => {
  const disabledConfig = { ...activeConfig, enabled: false };
  assert.equal(getCampaignStatus(disabledConfig, fixedNow), 'disabled');
  const pricing = calculatePinkFridayPricing(baseProduct, disabledConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.campaignPrice, 500);
  assert.equal(pricing.reason, 'CAMPAIGN_DISABLED');
});

// 4. Campaign before start date
test('Case 4: Campaign before start date is upcoming and discounts are inactive', () => {
  const beforeTime = new Date('2026-10-25T10:00:00+02:00');
  assert.equal(getCampaignStatus(activeConfig, beforeTime), 'upcoming');
  assert.equal(isCampaignUpcoming(activeConfig, beforeTime), true);
  const pricing = calculatePinkFridayPricing(baseProduct, activeConfig, beforeTime);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.campaignPrice, 500);
});

// 5. Campaign after end date
test('Case 5: Campaign after end date is ended and discounts are inactive', () => {
  const afterTime = new Date('2026-12-05T10:00:00+02:00');
  assert.equal(getCampaignStatus(activeConfig, afterTime), 'ended');
  assert.equal(isCampaignEnded(activeConfig, afterTime), true);
  const pricing = calculatePinkFridayPricing(baseProduct, activeConfig, afterTime);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.campaignPrice, 500);
});

// 6. Expired / Inactive offer
test('Case 6: Inactive offer is rejected', () => {
  const inactiveOfferConfig = {
    ...activeConfig,
    offers: [{ ...baseOffer, active: false }]
  };
  const pricing = calculatePinkFridayPricing(baseProduct, inactiveOfferConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'OFFER_INACTIVE');
});

// 7. Invalid product ID
test('Case 7: Invalid or empty product ID in offer is rejected', () => {
  const invalidIdConfig = {
    ...activeConfig,
    offers: [{ ...baseOffer, productId: '' }]
  };
  const pricing = calculatePinkFridayPricing(baseProduct, invalidIdConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
});

// 8. Hidden product
test('Case 8: Hidden product cannot receive campaign discount', () => {
  const hiddenProd = { ...baseProduct, isHidden: true };
  const pricing = calculatePinkFridayPricing(hiddenProd, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'PRODUCT_HIDDEN');
});

// 9. Sold-out product
test('Case 9: Sold-out product cannot receive campaign discount', () => {
  const soldOutProd = { ...baseProduct, isSoldOut: true };
  const pricing = calculatePinkFridayPricing(soldOutProd, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'PRODUCT_SOLD_OUT');
});

// 10. Zero or negative product price
test('Case 10: Zero or negative product price is rejected', () => {
  const zeroPriceProd = { ...baseProduct, price: 0 };
  const pricingZero = calculatePinkFridayPricing(zeroPriceProd, activeConfig, fixedNow);
  assert.equal(pricingZero.isEligible, false);

  const negPriceProd = { ...baseProduct, price: -50 };
  const pricingNeg = calculatePinkFridayPricing(negPriceProd, activeConfig, fixedNow);
  assert.equal(pricingNeg.isEligible, false);
});

// 11. Campaign price equal to regular price
test('Case 11: Campaign price equal to regular price is rejected', () => {
  const equalOfferConfig = {
    ...activeConfig,
    offers: [{ ...baseOffer, campaignPrice: 500 }]
  };
  const pricing = calculatePinkFridayPricing(baseProduct, equalOfferConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'CAMPAIGN_PRICE_NOT_LOWER');
});

// 12. Campaign price higher than regular price
test('Case 12: Campaign price higher than regular price is rejected', () => {
  const higherOfferConfig = {
    ...activeConfig,
    offers: [{ ...baseOffer, campaignPrice: 550 }]
  };
  const pricing = calculatePinkFridayPricing(baseProduct, higherOfferConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'CAMPAIGN_PRICE_NOT_LOWER');
});

// 13. Database base price different from expectedBasePrice
test('Case 13: Database base price mismatch with expectedBasePrice is safely rejected', () => {
  const priceChangedProd = { ...baseProduct, price: 600 }; // Changed from expected 500
  const pricing = calculatePinkFridayPricing(priceChangedProd, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'PRICE_MISMATCH');
  assert.equal(pricing.campaignPrice, 600); // Does NOT charge outdated 425
});

// 14. Product with an existing generic promotion
test('Case 14: No double discount stacking unless explicitly allowed', () => {
  const onSaleProd = { ...baseProduct, onSale: true, discount: 20 };
  const pricing = calculatePinkFridayPricing(onSaleProd, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, false);
  assert.equal(pricing.reason, 'DISCOUNT_STACKING_DISALLOWED');

  // When explicitly allowed
  const stackingAllowedConfig = {
    ...activeConfig,
    offers: [{ ...baseOffer, allowWithGenericDiscount: true }]
  };
  const pricingAllowed = calculatePinkFridayPricing(onSaleProd, stackingAllowedConfig, fixedNow);
  assert.equal(pricingAllowed.isEligible, true);
  assert.equal(pricingAllowed.campaignPrice, 425);
});

// 15. Invalid or missing campaign dates
test('Case 15: Missing dates default to active if enabled, invalid strings fail gracefully', () => {
  const noDatesConfig = { ...activeConfig, startAt: null, endAt: null };
  assert.equal(getCampaignStatus(noDatesConfig, fixedNow), 'active');

  const invalidDatesConfig = { ...activeConfig, startAt: 'invalid-date', endAt: 'also-invalid' };
  assert.equal(getCampaignStatus(invalidDatesConfig, fixedNow), 'active');
});

// 16. Product with variants
test('Case 16: Product with variants calculates effective price correctly', () => {
  const variantProd = { ...baseProduct, hasVariants: true, variantType: 'scent' };
  const pricing = calculatePinkFridayPricing(variantProd, activeConfig, fixedNow);
  assert.equal(pricing.isEligible, true);
  assert.equal(pricing.campaignPrice, 425);
  // Unit price is 425; multiplier for multiple variants will scale from 425
  const multiVariantPrice = pricing.campaignPrice * 2;
  assert.equal(multiVariantPrice, 850);
});

// 17. Multiple eligible products in one cart
test('Case 17: Multiple eligible products calculate correct cart subtotal', () => {
  const prodA = { id: 'prod-001', price: 500 };
  const prodB = { id: 'prod-002', price: 300 };

  const multiConfig = {
    ...activeConfig,
    offers: [
      { productId: 'prod-001', expectedBasePrice: 500, campaignPrice: 425, active: true },
      { productId: 'prod-002', expectedBasePrice: 300, campaignPrice: 250, active: true }
    ]
  };

  const pA = calculatePinkFridayPricing(prodA, multiConfig, fixedNow);
  const pB = calculatePinkFridayPricing(prodB, multiConfig, fixedNow);

  const cart = [
    { product: prodA, quantity: 2, unitPrice: pA.campaignPrice },
    { product: prodB, quantity: 1, unitPrice: pB.campaignPrice }
  ];

  const subtotal = cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  assert.equal(subtotal, 425 * 2 + 250 * 1); // 1100
});

// 18. Mixed eligible and non-eligible products
test('Case 18: Mixed eligible and non-eligible items in cart', () => {
  const eligibleProd = { id: 'prod-001', price: 500 };
  const normalProd = { id: 'prod-003', price: 200 };

  const p1 = calculatePinkFridayPricing(eligibleProd, activeConfig, fixedNow);
  const p2 = calculatePinkFridayPricing(normalProd, activeConfig, fixedNow);

  assert.equal(p1.isEligible, true);
  assert.equal(p1.campaignPrice, 425);

  assert.equal(p2.isEligible, false);
  assert.equal(p2.campaignPrice, 200);

  const subtotal = p1.campaignPrice * 1 + p2.campaignPrice * 1;
  assert.equal(subtotal, 625);
});

// 19. Stale localStorage cart data
test('Case 19: Stale localStorage cart claiming campaign price on ended campaign is caught', () => {
  const endedTime = new Date('2026-12-10T12:00:00+02:00');
  const staleCartItem = {
    id: 'prod-001',
    isPinkFriday: true,
    price: 425, // Stale discounted price
    regularPrice: 500
  };

  // Re-evaluation on server
  const serverPricing = calculatePinkFridayPricing(baseProduct, activeConfig, endedTime);
  assert.equal(serverPricing.isEligible, false); // Campaign ended!
  assert.equal(serverPricing.campaignPrice, 500); // Authoritative price is 500

  // The server rejects the order with 409 Conflict if isClientClaimingCampaign && !serverPricing.isEligible
  const isConflict = Boolean(staleCartItem.isPinkFriday) && !serverPricing.isEligible;
  assert.equal(isConflict, true);
});
