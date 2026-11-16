// src/utils/server-variant-pricing.ts
// Authoritative server-side product variant normalization, selection validation,
// and unit pricing multiplier calculation aligned with public/assets/js/variants.js.

export interface NormalizedProductVariant {
  id: string;
  name: string;
  isAvailable: boolean;
}

export interface ValidatedOrderVariant {
  id: string;
  name: string;
}

export type VariantValidationErrorCode =
  | 'INVALID_VARIANT_SELECTION'
  | 'VARIANT_REQUIRED'
  | 'NO_AVAILABLE_VARIANTS'
  | 'VARIANT_NOT_FOUND'
  | 'VARIANT_UNAVAILABLE';

export interface VariantValidationResult {
  ok: boolean;
  errorCode?: VariantValidationErrorCode;
  message?: string;
  hasSelectableVariants: boolean;
  variants: ValidatedOrderVariant[];
  multiplier: number;
  variantName: string;
}

function compareLexicographically(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Normalizes product variants from Firebase RTDB (array, object map, or sparse/partial entries)
 * using exact semantics matching `public/assets/js/variants.js#getProductVariants`.
 */
export function normalizeProductVariants(product: any): NormalizedProductVariant[] {
  if (!isPlainObject(product) || !product.variants) {
    return [];
  }

  const rawVariants = product.variants;
  const collected: NormalizedProductVariant[] = [];

  if (Array.isArray(rawVariants)) {
    for (const v of rawVariants) {
      if (!isPlainObject(v)) continue;
      if (typeof v.name !== 'string' && typeof v.name !== 'number') continue;
      const cleanName = String(v.name).trim();
      if (!cleanName) continue;

      const hasExplicitId =
        v.id !== undefined &&
        v.id !== null &&
        (typeof v.id === 'string' || typeof v.id === 'number') &&
        String(v.id).trim() !== '';
      const cleanId = hasExplicitId ? String(v.id).trim() : cleanName;

      collected.push({
        id: cleanId,
        name: cleanName,
        isAvailable: v.isAvailable !== false
      });
    }
  } else if (typeof rawVariants === 'object') {
    for (const [key, v] of Object.entries(rawVariants)) {
      if (v === null || v === undefined) continue;
      if (isPlainObject(v)) {
        const hasExplicitId =
          v.id !== undefined &&
          v.id !== null &&
          (typeof v.id === 'string' || typeof v.id === 'number') &&
          String(v.id).trim() !== '';
        const cleanId = hasExplicitId ? String(v.id).trim() : String(key).trim();
        const cleanName =
          typeof v.name === 'string' || typeof v.name === 'number'
            ? String(v.name).trim()
            : '';
        if (!cleanId || !cleanName) continue;

        collected.push({
          id: cleanId,
          name: cleanName,
          isAvailable: v.isAvailable !== false
        });
      } else if (typeof v === 'string' || typeof v === 'number') {
        const cleanId = String(key).trim();
        const cleanName = String(v).trim();
        if (!cleanId || !cleanName) continue;

        collected.push({
          id: cleanId,
          name: cleanName,
          isAvailable: true
        });
      }
    }
  }

  // Deduplicate by variant ID preserving first valid normalized occurrence
  const seenIds = new Set<string>();
  const unique: NormalizedProductVariant[] = [];
  for (const variant of collected) {
    if (seenIds.has(variant.id)) continue;
    seenIds.add(variant.id);
    unique.push(variant);
  }
  return unique;
}

/**
 * Checks whether the product's `variantType` is supported by customer-facing selector UIs.
 * Currently only missing/empty or `'scent'` variant selectors are exposed across the storefront.
 */
export function isSupportedVariantType(product: any): boolean {
  if (!isPlainObject(product)) return false;
  const rawType = product.variantType;
  if (rawType === undefined || rawType === null) return true;
  const cleanType = typeof rawType === 'string' ? rawType.trim() : String(rawType).trim();
  return !cleanType || cleanType === 'scent';
}

/**
 * Unified eligibility contract across standard product page SSR, `variants.js`, Pink Friday,
 * and checkout validation:
 * - `hasVariants === true` or `hasVariants === 'true'`
 * - Supported `variantType` (missing/empty or `'scent'`)
 * - At least one valid normalized variant entry
 */
export function hasSelectableProductVariants(product: any): boolean {
  if (!isPlainObject(product)) return false;
  const hasFlag = product.hasVariants === true || product.hasVariants === 'true';
  if (!hasFlag) return false;
  if (!isSupportedVariantType(product)) return false;
  return normalizeProductVariants(product).length > 0;
}

/**
 * Authoritative Pink Friday collection selector visibility rule:
 * renders `<select>` only when the product satisfies the unified eligibility contract
 * AND its `variants` field is an Array.
 */
export function hasExposedCollectionVariantSelector(product: any): boolean {
  return hasSelectableProductVariants(product) && Array.isArray(product?.variants);
}

/**
 * Returns authoritative selectable (available, deduplicated) variant options exposed in
 * `src/pages/pink-friday.astro` collection modals under `hasExposedCollectionVariantSelector`.
 */
export function getExposedCollectionVariantOptions(product: any): ValidatedOrderVariant[] {
  if (!hasExposedCollectionVariantSelector(product)) return [];
  return normalizeProductVariants(product)
    .filter((v) => v.isAvailable !== false)
    .map((v) => ({ id: v.id, name: v.name }));
}

function extractSubmittedVariantIds(item: any): {
  ok: boolean;
  errorCode?: VariantValidationErrorCode;
  message?: string;
  ids: string[];
} {
  if (!isPlainObject(item)) {
    return {
      ok: false,
      errorCode: 'INVALID_VARIANT_SELECTION',
      message: 'بيانات المنتج المرسلة غير صالحة.',
      ids: []
    };
  }

  const productLabel =
    typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'المنتج';

  // Validate selectedVariant structure if explicitly supplied (even if empty selectedVariants array also sent)
  if (item.selectedVariant !== undefined && item.selectedVariant !== null) {
    if (
      !isPlainObject(item.selectedVariant) ||
      typeof item.selectedVariant.id !== 'string' ||
      !item.selectedVariant.id.trim() ||
      (item.selectedVariant.name !== undefined &&
        item.selectedVariant.name !== null &&
        typeof item.selectedVariant.name !== 'string')
    ) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `تنسيق الرائحة المختارة للمنتج "${productLabel}" غير صالح.`,
        ids: []
      };
    }
  }

  if (item.variantId !== undefined && item.variantId !== null) {
    if (typeof item.variantId !== 'string' || !item.variantId.trim()) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `معرّف الرائحة للمنتج "${productLabel}" غير صالح.`,
        ids: []
      };
    }
  }

  if (item.variantName !== undefined && item.variantName !== null) {
    if (typeof item.variantName !== 'string') {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `اسم الرائحة للمنتج "${productLabel}" غير صالح.`,
        ids: []
      };
    }
  }

  // 1. Primary multi-variant array field (`selectedVariants`)
  if (item.selectedVariants !== undefined && item.selectedVariants !== null) {
    if (!Array.isArray(item.selectedVariants)) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `تنسيق قائمة الروائح للمنتج "${productLabel}" غير صالح.`,
        ids: []
      };
    }

    if (item.selectedVariants.length > 0) {
      const ids: string[] = [];
      for (const entry of item.selectedVariants) {
        if (
          !isPlainObject(entry) ||
          typeof entry.id !== 'string' ||
          !entry.id.trim() ||
          (entry.name !== undefined &&
            entry.name !== null &&
            typeof entry.name !== 'string')
        ) {
          return {
            ok: false,
            errorCode: 'INVALID_VARIANT_SELECTION',
            message: `أحد خيارات الروائح المرسلة للمنتج "${productLabel}" غير صالح.`,
            ids: []
          };
        }
        ids.push(entry.id.trim());
      }
      return { ok: true, ids };
    }
  }

  // 2. Legacy single variant object (`selectedVariant`)
  if (item.selectedVariant !== undefined && item.selectedVariant !== null) {
    return {
      ok: true,
      ids: [item.selectedVariant.id.trim()]
    };
  }

  // 3. Legacy single variant ID string (`variantId`)
  if (item.variantId !== undefined && item.variantId !== null) {
    return {
      ok: true,
      ids: [item.variantId.trim()]
    };
  }

  // 4. Reject bare `variantName` without any authoritative variant ID
  if (typeof item.variantName === 'string' && item.variantName.trim().length > 0) {
    return {
      ok: false,
      errorCode: 'INVALID_VARIANT_SELECTION',
      message: `يرجى إعادة اختيار الرائحة للمنتج "${productLabel}" من صفحة المنتج لضمان مطابقتها.`,
      ids: []
    };
  }

  return { ok: true, ids: [] };
}

/**
 * Validates client-submitted variant selections against the authoritative Firebase RTDB product record.
 * - Rejects malformed structures, unknown/foreign variant IDs, unavailable variants,
 *   empty selections on variant-enabled products, and non-empty selections on non-variant products.
 * - Deduplicates repeated valid variant IDs so duplicate submissions cannot inflate the multiplier.
 * - Always resolves authoritative `id` and `name` from Firebase rather than trusting client-submitted names.
 * - Sorts resolved variants deterministically by `id` matching `public/assets/js/variants.js`.
 */
export function validateAndResolveOrderItemVariants(
  product: any,
  clientItem: any
): VariantValidationResult {
  const productName =
    (product && typeof product.name === 'string' && product.name.trim()) ||
    (clientItem && typeof clientItem.name === 'string' && clientItem.name.trim()) ||
    'المنتج';

  const extraction = extractSubmittedVariantIds(clientItem);
  if (!extraction.ok) {
    return {
      ok: false,
      errorCode: extraction.errorCode,
      message: extraction.message,
      hasSelectableVariants: hasSelectableProductVariants(product),
      variants: [],
      multiplier: 1,
      variantName: ''
    };
  }

  const submittedIds = extraction.ids;
  const normalizedProductVariants = normalizeProductVariants(product);
  const selectable = hasSelectableProductVariants(product);

  if (!selectable) {
    if (submittedIds.length > 0) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `المنتج "${productName}" لا يدعم اختيار روائح إضافية.`,
        hasSelectableVariants: false,
        variants: [],
        multiplier: 1,
        variantName: ''
      };
    }

    return {
      ok: true,
      hasSelectableVariants: false,
      variants: [],
      multiplier: 1,
      variantName: ''
    };
  }

  const variantById = new Map<string, NormalizedProductVariant>();
  for (const v of normalizedProductVariants) {
    variantById.set(v.id, v);
  }

  const hasAnyAvailable = normalizedProductVariants.some((v) => v.isAvailable !== false);
  if (!hasAnyAvailable) {
    return {
      ok: false,
      errorCode: 'NO_AVAILABLE_VARIANTS',
      message: `عذراً، جميع الروائح المتاحة للمنتج "${productName}" غير متوفرة حالياً.`,
      hasSelectableVariants: true,
      variants: [],
      multiplier: 1,
      variantName: ''
    };
  }

  if (submittedIds.length === 0) {
    return {
      ok: false,
      errorCode: 'VARIANT_REQUIRED',
      message: `يرجى اختيار الرائحة المفضلة للمنتج "${productName}" قبل إتمام الطلب.`,
      hasSelectableVariants: true,
      variants: [],
      multiplier: 1,
      variantName: ''
    };
  }

  const seenValidIds = new Set<string>();
  const resolved: ValidatedOrderVariant[] = [];

  for (const rawVariantId of submittedIds) {
    const matched = variantById.get(rawVariantId);
    if (!matched) {
      return {
        ok: false,
        errorCode: 'VARIANT_NOT_FOUND',
        message: `عذراً، إحدى الروائح المختارة للمنتج "${productName}" غير صالحة أو لم تعد موجودة.`,
        hasSelectableVariants: true,
        variants: [],
        multiplier: 1,
        variantName: ''
      };
    }

    if (matched.isAvailable === false) {
      return {
        ok: false,
        errorCode: 'VARIANT_UNAVAILABLE',
        message: `عذراً، الرائحة "${matched.name}" للمنتج "${productName}" غير متوفرة حالياً.`,
        hasSelectableVariants: true,
        variants: [],
        multiplier: 1,
        variantName: ''
      };
    }

    if (!seenValidIds.has(matched.id)) {
      seenValidIds.add(matched.id);
      resolved.push({
        id: matched.id,
        name: matched.name
      });
    }
  }

  resolved.sort((a, b) => compareLexicographically(a.id, b.id));

  const multiplier = resolved.length > 0 ? resolved.length : 1;
  const variantName =
    resolved.length === 1 ? resolved[0].name : resolved.map((v) => v.name).join('، ');

  return {
    ok: true,
    hasSelectableVariants: true,
    variants: resolved,
    multiplier,
    variantName
  };
}

/**
 * Computes authoritative unit price, variant multiplier, and line total for a validated order item.
 * Mirrors `public/assets/js/variants.js#getEffectiveUnitPrice`:
 *   effectiveUnitPrice = (pinkFridayEligible ? campaignPrice : basePrice) * variantMultiplier
 *   lineTotal = effectiveUnitPrice * quantity
 */
export function calculateAuthoritativeItemPricing(params: {
  basePrice: number;
  campaignPrice?: number | null;
  isPinkFridayEligible?: boolean;
  variantMultiplier: number;
  quantity: number;
}): {
  singleVariantUnitPrice: number;
  variantMultiplier: number;
  effectiveUnitPrice: number;
  lineTotal: number;
} {
  const unitBase =
    params.isPinkFridayEligible &&
    typeof params.campaignPrice === 'number' &&
    Number.isFinite(params.campaignPrice) &&
    params.campaignPrice >= 0
      ? params.campaignPrice
      : Number.isFinite(params.basePrice) && params.basePrice >= 0
        ? params.basePrice
        : 0;

  const multiplier =
    Number.isInteger(params.variantMultiplier) && params.variantMultiplier >= 1
      ? params.variantMultiplier
      : 1;

  const quantity =
    Number.isInteger(params.quantity) && params.quantity >= 1 ? params.quantity : 1;

  const singleVariantUnitPrice = parseFloat(unitBase.toFixed(2));
  const effectiveUnitPrice = parseFloat((singleVariantUnitPrice * multiplier).toFixed(2));
  const lineTotal = parseFloat((effectiveUnitPrice * quantity).toFixed(2));

  return {
    singleVariantUnitPrice,
    variantMultiplier: multiplier,
    effectiveUnitPrice,
    lineTotal
  };
}

export interface CollectionItemVariantValidationResult {
  ok: boolean;
  errorCode?: VariantValidationErrorCode;
  message?: string;
  variant: ValidatedOrderVariant | null;
  variantName: string;
}

/**
 * Validates the raw `selectedItems` / `items` container submitted on a Pink Friday collection order item.
 */
export function validateCollectionSelectedItemsInput(item: any): {
  ok: boolean;
  errorCode?: VariantValidationErrorCode;
  message?: string;
  selectedItems: any[];
} {
  if (!isPlainObject(item)) {
    return {
      ok: false,
      errorCode: 'INVALID_VARIANT_SELECTION',
      message: 'بيانات الكوليكشن المرسلة غير صالحة.',
      selectedItems: []
    };
  }

  let rawList: unknown = undefined;
  if (item.selectedItems !== undefined && item.selectedItems !== null) {
    if (!Array.isArray(item.selectedItems)) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: 'تنسيق اختيارات منتجات الكوليكشن غير صالح.',
        selectedItems: []
      };
    }
    rawList = item.selectedItems;
  }

  if (item.items !== undefined && item.items !== null) {
    if (!Array.isArray(item.items)) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: 'تنسيق عناصر الكوليكشن غير صالح.',
        selectedItems: []
      };
    }
    if (rawList === undefined) {
      rawList = item.items;
    }
  }

  const list = Array.isArray(rawList) ? rawList : [];
  for (const entry of list) {
    if (!isPlainObject(entry)) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: 'أحد اختيارات منتجات الكوليكشن غير صالح.',
        selectedItems: []
      };
    }
  }

  return { ok: true, selectedItems: list };
}

/**
 * Matches a collection component (`cItem`) to the customer's submitted selection entry:
 * 1. Primary match: exact `collectionItemId` (prevents duplicate-product collisions).
 * 2. Compatibility fallback: match by `productId` ONLY when the client entry omits `collectionItemId`,
 *    consuming each legacy entry at most once.
 */
export function matchCollectionClientChoice(
  collectionItem: any,
  clientSelectedItems: any[],
  usedChoiceIndices: Set<number>
): any | null {
  if (!isPlainObject(collectionItem) || !Array.isArray(clientSelectedItems) || clientSelectedItems.length === 0) {
    return null;
  }

  const rawColItemId =
    collectionItem.collectionItemId !== undefined && collectionItem.collectionItemId !== null
      ? String(collectionItem.collectionItemId).trim()
      : '';

  if (rawColItemId) {
    for (let i = 0; i < clientSelectedItems.length; i++) {
      if (usedChoiceIndices.has(i)) continue;
      const csi = clientSelectedItems[i];
      if (!isPlainObject(csi)) continue;
      const csiColItemId =
        csi.collectionItemId !== undefined && csi.collectionItemId !== null
          ? String(csi.collectionItemId).trim()
          : '';
      if (csiColItemId && csiColItemId === rawColItemId) {
        usedChoiceIndices.add(i);
        return csi;
      }
    }
  }

  const targetProductId =
    collectionItem.productId !== undefined && collectionItem.productId !== null
      ? String(collectionItem.productId).trim()
      : '';

  if (targetProductId) {
    for (let i = 0; i < clientSelectedItems.length; i++) {
      if (usedChoiceIndices.has(i)) continue;
      const csi = clientSelectedItems[i];
      if (!isPlainObject(csi)) continue;
      const csiColItemId =
        csi.collectionItemId !== undefined && csi.collectionItemId !== null
          ? String(csi.collectionItemId).trim()
          : '';
      // Never cross-match an entry that explicitly targets a different collectionItemId
      if (csiColItemId) continue;

      const csiProductId =
        csi.productId !== undefined && csi.productId !== null ? String(csi.productId).trim() : '';
      if (csiProductId && csiProductId === targetProductId) {
        usedChoiceIndices.add(i);
        return csi;
      }
    }
  }

  return null;
}

/**
 * Validates and resolves a Pink Friday collection component's submitted variant selection
 * against the authoritative Firebase product record.
 * - Rejects unknown, foreign, unavailable, malformed, or ID-less selections.
 * - Ignores client-submitted variant display names and resolves authoritative ID + name from Firebase.
 * - Requires a valid selection when the collection component exposes a selectable scent choice.
 * - Preserves existing behavior when a component has no variants or does not expose a selection control.
 */
export function validateAndResolveCollectionItemVariant(
  product: any,
  clientChoice: any,
  options?: { expectedProductId?: string }
): CollectionItemVariantValidationResult {
  const productName =
    (product && typeof product.name === 'string' && product.name.trim()) || 'المنتج';

  if (clientChoice !== undefined && clientChoice !== null) {
    if (!isPlainObject(clientChoice)) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `بيانات الرائحة المختارة للمنتج "${productName}" غير صالحة.`,
        variant: null,
        variantName: ''
      };
    }

    if (clientChoice.productId !== undefined && clientChoice.productId !== null) {
      if (typeof clientChoice.productId !== 'string' || !clientChoice.productId.trim()) {
        return {
          ok: false,
          errorCode: 'INVALID_VARIANT_SELECTION',
          message: `معرّف المنتج "${productName}" داخل الكوليكشن غير صالح.`,
          variant: null,
          variantName: ''
        };
      }
      if (
        options?.expectedProductId !== undefined &&
        clientChoice.productId.trim() !== String(options.expectedProductId).trim()
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_VARIANT_SELECTION',
          message: `المنتج المحدد "${productName}" لا يطابق عنصر الكوليكشن المطلوب.`,
          variant: null,
          variantName: ''
        };
      }
    }
  }

  // Normalize legacy `variant` property if supplied so malformed/ID-less entries are rejected
  let normalizedChoice: Record<string, any> = clientChoice ? { ...clientChoice } : {};
  if (normalizedChoice.variant !== undefined && normalizedChoice.variant !== null) {
    if (
      !isPlainObject(normalizedChoice.variant) ||
      typeof normalizedChoice.variant.id !== 'string' ||
      !normalizedChoice.variant.id.trim() ||
      (normalizedChoice.variant.name !== undefined &&
        normalizedChoice.variant.name !== null &&
        typeof normalizedChoice.variant.name !== 'string')
    ) {
      return {
        ok: false,
        errorCode: 'INVALID_VARIANT_SELECTION',
        message: `تنسيق الرائحة المختارة للمنتج "${productName}" غير صالح.`,
        variant: null,
        variantName: ''
      };
    }
    if (normalizedChoice.selectedVariant === undefined || normalizedChoice.selectedVariant === null) {
      normalizedChoice.selectedVariant = normalizedChoice.variant;
    }
  }

  if (
    Array.isArray(normalizedChoice.selectedVariants) &&
    normalizedChoice.selectedVariants.length > 1
  ) {
    return {
      ok: false,
      errorCode: 'INVALID_VARIANT_SELECTION',
      message: `يمكن اختيار رائحة واحدة فقط للمنتج "${productName}" داخل الكوليكشن.`,
      variant: null,
      variantName: ''
    };
  }

  const extraction = extractSubmittedVariantIds({
    ...normalizedChoice,
    name: productName
  });

  if (!extraction.ok) {
    return {
      ok: false,
      errorCode: extraction.errorCode,
      message: extraction.message,
      variant: null,
      variantName: ''
    };
  }

  // If no variant selection was submitted and this component does not expose a selector in UI,
  // preserve existing behavior without inventing a new required selection.
  if (extraction.ids.length === 0 && !hasExposedCollectionVariantSelector(product)) {
    return {
      ok: true,
      variant: null,
      variantName: ''
    };
  }

  const resolvedResult = validateAndResolveOrderItemVariants(product, {
    ...normalizedChoice,
    name: productName
  });

  if (!resolvedResult.ok) {
    return {
      ok: false,
      errorCode: resolvedResult.errorCode,
      message: resolvedResult.message,
      variant: null,
      variantName: ''
    };
  }

  const chosenVariant = resolvedResult.variants[0] || null;
  return {
    ok: true,
    variant: chosenVariant,
    variantName: chosenVariant ? chosenVariant.name : ''
  };
}
