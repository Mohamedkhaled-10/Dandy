// src/config/store-policy.ts
// Centralized Single Source of Truth for DANDY shipping rates, free-shipping threshold,
// delivery timeframe, and supported payment method.

export type PaymentMethod = 'COD';

export interface DeliveryEstimate {
  readonly minDays: number;
  readonly maxDays: number;
  readonly unit: 'business_days';
}

export interface ShippingFeeRange {
  readonly min: number;
  readonly max: number;
}

export interface StoreShippingPolicy {
  readonly ratesByGovernorate: Readonly<Record<string, number>>;
  readonly defaultFeeEgp: number;
  readonly freeShippingThresholdEgp: number;
  readonly feeRangeEgp: ShippingFeeRange;
  readonly deliveryEstimate: DeliveryEstimate;
  readonly paymentMethod: PaymentMethod;
}

/**
 * Exact shipping rates by Egyptian governorate (in EGP).
 * Preserved from server order-creation authority (`src/pages/api/create-order.js`).
 */
export const SHIPPING_RATES_BY_GOVERNORATE: Readonly<Record<string, number>> = Object.freeze({
  'Gharbia': 70,
  'Dakahlia': 85,
  'Sharqia': 85,
  'Kafr El Sheikh': 85,
  'Qalyubia': 85,
  'Port Said': 85,
  'Damietta': 85,
  'Suez': 85,
  'Ismailia': 85,
  'Cairo': 85,
  'Giza': 85,
  'Beheira': 85,
  'Monufia': 85,
  'Alexandria': 85,
  'Fayoum': 100,
  'Beni Suef': 100,
  'Minya': 100,
  'Luxor': 120,
  'Aswan': 120,
  'Assiut': 120,
  'Sohag': 120,
  'North Sinai': 120,
  'South Sinai': 120,
  'Qena': 120,
  'New Valley': 120,
  'Red Sea': 120,
  'Matrouh': 120
});

/**
 * Arabic governorate name aliases mapped to canonical keys in SHIPPING_RATES_BY_GOVERNORATE.
 * Rates remain strictly single-sourced in SHIPPING_RATES_BY_GOVERNORATE.
 */
export const GOVERNORATE_ALIASES: Readonly<Record<string, keyof typeof SHIPPING_RATES_BY_GOVERNORATE>> = Object.freeze({
  'الغربية': 'Gharbia',
  'الدقهلية': 'Dakahlia',
  'الشرقية': 'Sharqia',
  'كفر الشيخ': 'Kafr El Sheikh',
  'القليوبية': 'Qalyubia',
  'بورسعيد': 'Port Said',
  'دمياط': 'Damietta',
  'السويس': 'Suez',
  'الإسماعيلية': 'Ismailia',
  'القاهرة': 'Cairo',
  'الجيزة': 'Giza',
  'البحيرة': 'Beheira',
  'المنوفية': 'Monufia',
  'الإسكندرية': 'Alexandria',
  'الفيوم': 'Fayoum',
  'بني سويف': 'Beni Suef',
  'المنيا': 'Minya',
  'الأقصر': 'Luxor',
  'أسوان': 'Aswan',
  'أسيوط': 'Assiut',
  'سوهاج': 'Sohag',
  'شمال سيناء': 'North Sinai',
  'جنوب سيناء': 'South Sinai',
  'قنا': 'Qena',
  'الوادي الجديد': 'New Valley',
  'البحر الأحمر': 'Red Sea',
  'مطروح': 'Matrouh'
});

const NORMALIZED_GOVERNORATE_RATES: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const [gov, fee] of Object.entries(SHIPPING_RATES_BY_GOVERNORATE)) {
    map.set(gov.toLowerCase(), fee);
  }
  for (const [alias, canonical] of Object.entries(GOVERNORATE_ALIASES)) {
    const fee = SHIPPING_RATES_BY_GOVERNORATE[canonical];
    if (typeof fee === 'number') {
      map.set(alias.toLowerCase(), fee);
    }
  }
  return map;
})();

export const DEFAULT_SHIPPING_FEE_EGP = 120;

/**
 * Orders receive free shipping ONLY when subtotal is STRICTLY GREATER THAN 2000 EGP (`subtotal > 2000`).
 * Orders equal to 2000 EGP do NOT qualify for free shipping.
 */
export const FREE_SHIPPING_THRESHOLD_EGP = 2000;

export const SHIPPING_FEE_RANGE_EGP: ShippingFeeRange = Object.freeze({
  min: 70,
  max: 120
});

export const DELIVERY_ESTIMATE: DeliveryEstimate = Object.freeze({
  minDays: 2,
  maxDays: 5,
  unit: 'business_days'
});

export const SUPPORTED_PAYMENT_METHOD: PaymentMethod = 'COD';

export const STORE_SHIPPING_POLICY: StoreShippingPolicy = Object.freeze({
  ratesByGovernorate: SHIPPING_RATES_BY_GOVERNORATE,
  defaultFeeEgp: DEFAULT_SHIPPING_FEE_EGP,
  freeShippingThresholdEgp: FREE_SHIPPING_THRESHOLD_EGP,
  feeRangeEgp: SHIPPING_FEE_RANGE_EGP,
  deliveryEstimate: DELIVERY_ESTIMATE,
  paymentMethod: SUPPORTED_PAYMENT_METHOD
});

/**
 * Returns the governorate shipping rate in EGP (supporting English & Arabic governorate names
 * and case-insensitive matching), falling back to DEFAULT_SHIPPING_FEE_EGP (120) when empty or unrecognized.
 */
export function getShippingFeeForGovernorate(governorate?: string | null): number {
  if (!governorate || typeof governorate !== 'string') {
    return DEFAULT_SHIPPING_FEE_EGP;
  }
  const key = governorate.trim();
  if (!key) {
    return DEFAULT_SHIPPING_FEE_EGP;
  }
  if (Object.prototype.hasOwnProperty.call(SHIPPING_RATES_BY_GOVERNORATE, key)) {
    return SHIPPING_RATES_BY_GOVERNORATE[key];
  }
  const normalizedFee = NORMALIZED_GOVERNORATE_RATES.get(key.toLowerCase());
  if (normalizedFee !== undefined) {
    return normalizedFee;
  }
  return DEFAULT_SHIPPING_FEE_EGP;
}

/**
 * Free shipping is granted ONLY when subtotal > FREE_SHIPPING_THRESHOLD_EGP (2000).
 * Subtotal === 2000 returns false.
 */
export function isFreeShippingEligible(subtotal: number): boolean {
  return typeof subtotal === 'number' && Number.isFinite(subtotal) && subtotal > FREE_SHIPPING_THRESHOLD_EGP;
}

/**
 * Calculates the final shipping fee in EGP for a given governorate and order subtotal.
 */
export function calculateShippingFee(governorate: string | null | undefined, subtotal: number): number {
  if (isFreeShippingEligible(subtotal)) {
    return 0;
  }
  return getShippingFeeForGovernorate(governorate);
}

/**
 * Returns a plain, JSON-serializable object containing ONLY public non-secret shipping policy data
 * for safe injection into frontend checkout views.
 */
export function getPublicStoreShippingPolicy(): StoreShippingPolicy {
  return {
    ratesByGovernorate: { ...SHIPPING_RATES_BY_GOVERNORATE },
    defaultFeeEgp: DEFAULT_SHIPPING_FEE_EGP,
    freeShippingThresholdEgp: FREE_SHIPPING_THRESHOLD_EGP,
    feeRangeEgp: { ...SHIPPING_FEE_RANGE_EGP },
    deliveryEstimate: { ...DELIVERY_ESTIMATE },
    paymentMethod: SUPPORTED_PAYMENT_METHOD
  };
}
