/**
 * Dandy Cosmetics - Variants Helper Utilities
 * Lightweight helper functions for handling product scent variants consistently (single, multi, and optional).
 */

(function (window) {
  'use strict';

  /**
   * Normalizes and returns the array of variants for a product.
   * Preserves explicit IDs, missing-ID fallback to trimmed name, Arabic/English names,
   * array/object-map/primitive/sparse schemas, and deduplicates by variant ID keeping
   * the first valid normalized variant entry.
   * @param {Object} product
   * @returns {Array<{id: string, name: string, isAvailable: boolean}>}
   */
  function getProductVariants(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product) || !product.variants) {
      return [];
    }

    const collected = [];
    if (Array.isArray(product.variants)) {
      for (let i = 0; i < product.variants.length; i++) {
        const v = product.variants[i];
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
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
          ...v,
          id: cleanId,
          name: cleanName,
          isAvailable: v.isAvailable !== false
        });
      }
    } else if (typeof product.variants === 'object') {
      const entries = Object.entries(product.variants);
      for (let i = 0; i < entries.length; i++) {
        const key = entries[i][0];
        const v = entries[i][1];
        if (v === null || v === undefined) continue;
        if (typeof v === 'object' && !Array.isArray(v)) {
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
            ...v,
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

    const seenIds = new Set();
    const unique = [];
    for (let i = 0; i < collected.length; i++) {
      const item = collected[i];
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      unique.push(item);
    }
    return unique;
  }

  /**
   * Checks whether the product's variantType is supported by the storefront selector UI.
   * Currently the storefront exposes scent selection only (`!variantType || variantType === 'scent'`).
   * @param {Object} product
   * @returns {boolean}
   */
  function isSupportedVariantType(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return false;
    const rawType = product.variantType;
    if (rawType === undefined || rawType === null) return true;
    const cleanType = typeof rawType === 'string' ? rawType.trim() : String(rawType).trim();
    return !cleanType || cleanType === 'scent';
  }

  /**
   * Checks if a product has active, selectable variants enabled under the unified storefront contract.
   * @param {Object} product
   * @returns {boolean}
   */
  function hasSelectableVariants(product) {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return false;
    const hasFlag = product.hasVariants === true || product.hasVariants === 'true';
    if (!hasFlag) return false;
    if (!isSupportedVariantType(product)) return false;
    const variants = getProductVariants(product);
    return variants.length > 0;
  }

  /**
   * Checks if a specific variant in a product is available.
   * @param {Object} product
   * @param {string} variantId
   * @returns {boolean}
   */
  function isVariantAvailable(product, variantId) {
    if (!product || variantId === undefined || variantId === null) return false;
    const cleanTargetId = String(variantId).trim();
    if (!cleanTargetId) return false;
    const variants = getProductVariants(product);
    const variant = variants.find(v => String(v.id) === cleanTargetId);
    if (!variant) return false;
    return variant.isAvailable !== false;
  }

  function compareLexicographically(a, b) {
    const sa = String(a);
    const sb = String(b);
    return sa < sb ? -1 : (sa > sb ? 1 : 0);
  }

  /**
   * Generates a deterministic unique key for an item in the cart.
   * Sorts selected variants deterministically so order of selection does not matter:
   * e.g., [Rose, Musk] and [Musk, Rose] result in the exact same cart key.
   * Fully backward-compatible with legacy items without variants or with legacy selectedVariant.
   * @param {Object} item 
   * @returns {string}
   */
  function getCartItemKey(item) {
    if (!item) return '';
    const prodId = item.productId || (typeof item.id === 'string' ? item.id.split('::')[0] : item.id) || '';
    if (!prodId) return '';

    // Multiple variants array
    if (Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0) {
      const uniqueIds = Array.from(new Set(
        item.selectedVariants
          .map(v => (v && typeof v === 'object' ? (v.id || v.name) : (v != null ? String(v) : '')))
          .map(s => String(s).trim())
          .filter(Boolean)
      )).sort(compareLexicographically);

      const sortedIds = uniqueIds.join('_');
      return sortedIds ? `${prodId}_${sortedIds}` : String(prodId);
    }

    // Legacy single variant object
    if (item.selectedVariant && (item.selectedVariant.id || item.selectedVariant.name)) {
      return `${prodId}_${String(item.selectedVariant.id || item.selectedVariant.name).trim()}`;
    }

    // Legacy single variant id string
    if (item.variantId) {
      return `${prodId}_${String(item.variantId).trim()}`;
    }

    return String(prodId);
  }

  /**
   * Normalizes a product quantity input to a strict positive integer in [min, max] (default 1..99).
   * Handles strings, Arabic numerals, decimals, negative numbers, and malformed values deterministically.
   * Does NOT read or enforce any inventory/stock values.
   * @param {unknown} rawValue
   * @param {{ min?: number, max?: number, defaultValue?: number }} [options]
   * @returns {number}
   */
  function normalizeProductQuantity(rawValue, options) {
    const opts = options || {};
    const min = Number.isInteger(opts.min) ? opts.min : 1;
    const max = Number.isInteger(opts.max) ? opts.max : 99;
    const fallback = Number.isInteger(opts.defaultValue) ? opts.defaultValue : min;

    let parsed = NaN;
    if (typeof rawValue === 'number') {
      parsed = rawValue;
    } else if (typeof rawValue === 'string') {
      const normalized = rawValue
        .trim()
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
        parsed = Number(normalized);
      }
    }

    if (!Number.isFinite(parsed)) {
      return Math.min(max, Math.max(min, fallback));
    }

    const truncated = Math.trunc(parsed);
    if (truncated < min) return min;
    if (truncated > max) return max;
    return truncated;
  }

  /**
   * Filters, deduplicates, canonicalizes, and sorts selected variants against the loaded product's
   * own available variants. Rejects foreign, unknown, or unavailable variant IDs.
   * @param {Object} product
   * @param {Array} selectedVariants
   * @returns {Array<{id: string, name: string}>}
   */
  function resolveValidSelectedVariants(product, selectedVariants) {
    if (!product || !Array.isArray(selectedVariants) || selectedVariants.length === 0) return [];
    const productVariants = getProductVariants(product);
    if (productVariants.length === 0) return [];

    const availableById = new Map();
    productVariants.forEach(v => {
      if (v && v.id && v.isAvailable !== false) {
        availableById.set(String(v.id), v);
      }
    });

    const seen = new Set();
    const resolved = [];

    selectedVariants.forEach(sv => {
      const rawId = sv && typeof sv === 'object' ? sv.id : sv;
      if (rawId === undefined || rawId === null) return;
      const key = String(rawId).trim();
      if (!key || seen.has(key)) return;
      const matched = availableById.get(key);
      if (!matched) return;
      seen.add(key);
      resolved.push({
        id: String(matched.id),
        name: matched.name
      });
    });

    resolved.sort((a, b) => compareLexicographically(a.id, b.id));
    return resolved;
  }

  /**
   * Safely parses cart JSON or array without throwing on malformed storage data.
   * @param {unknown} rawCart
   * @returns {Array<Object>}
   */
  function safeParseCart(rawCart) {
    if (Array.isArray(rawCart)) {
      return rawCart.filter(item => item && typeof item === 'object');
    }
    if (typeof rawCart === 'string' && rawCart.trim()) {
      try {
        const parsed = JSON.parse(rawCart);
        return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  /**
   * Pure add-to-cart and cart-merging logic for a product page.
   * Enforces valid variant selection, positive integer quantity [1..99], Pink Friday pricing preservation,
   * and deterministic cart item merging without any inventory tracking or deduction.
   * @param {unknown} existingCart
   * @param {Object} product
   * @param {{ selectedVariants?: Array, quantity?: unknown, pinkFridayPricing?: Object | null }} [options]
   */
  function mergeProductToCart(existingCart, product, options) {
    const opts = options || {};
    const cart = safeParseCart(existingCart).map(item => ({ ...item }));

    if (!product || !product.id) {
      return { ok: false, reason: 'PRODUCT_NOT_FOUND', cart };
    }

    if (product.isSoldOut === true || product.isSoldOut === 'true') {
      return { ok: false, reason: 'PRODUCT_SOLD_OUT', cart };
    }

    const hasVars = hasSelectableVariants(product);
    const validSelectedVariants = hasVars
      ? resolveValidSelectedVariants(product, opts.selectedVariants || [])
      : [];

    if (hasVars && validSelectedVariants.length === 0) {
      const hasAnyAvailableVariant = getProductVariants(product).some(v => v.isAvailable !== false);
      return {
        ok: false,
        reason: hasAnyAvailableVariant ? 'VARIANT_REQUIRED' : 'NO_AVAILABLE_VARIANTS',
        cart
      };
    }

    const qty = normalizeProductQuantity(opts.quantity, { min: 1, max: 99, defaultValue: 1 });
    const hasChosenVariants = validSelectedVariants.length > 0;
    const sortedIdsStr = hasChosenVariants ? validSelectedVariants.map(v => v.id).join('_') : '';
    const cartItemId = hasChosenVariants ? `${product.id}::${sortedIdsStr}` : String(product.id);

    const productItem = {
      id: cartItemId,
      productId: String(product.id),
      name: product.name || 'منتج داندي',
      price: Number(product.price) || 0,
      image: product.image || '',
      discount: product.discount || null,
      onSale: Boolean(product.onSale),
      quantity: qty
    };

    const pf = opts.pinkFridayPricing;
    if (pf && pf.isEligible) {
      productItem.isPinkFriday = true;
      productItem.campaignPrice = pf.campaignPrice;
      productItem.regularPrice = pf.regularPrice;
      productItem.price = pf.campaignPrice;
      productItem.badgeText = pf.badgeText;
    }

    if (hasChosenVariants) {
      productItem.hasVariants = true;
      productItem.variantType = 'scent';
      productItem.selectedVariants = validSelectedVariants.map(v => ({ id: v.id, name: v.name }));
      if (validSelectedVariants.length === 1) {
        productItem.selectedVariant = { id: validSelectedVariants[0].id, name: validSelectedVariants[0].name };
        productItem.variantId = validSelectedVariants[0].id;
        productItem.variantName = validSelectedVariants[0].name;
      } else {
        productItem.variantName = validSelectedVariants.map(v => v.name).join('، ');
      }
    }

    const targetItemKey = getCartItemKey(productItem);
    const existIndex = cart.findIndex(item => getCartItemKey(item) === targetItemKey);

    let finalItem;
    if (existIndex !== -1) {
      const prevRaw = Number(cart[existIndex].quantity);
      const prevQty = Number.isFinite(prevRaw) && prevRaw > 0 ? Math.trunc(prevRaw) : 0;
      const mergedItem = {
        ...cart[existIndex],
        id: productItem.id,
        productId: productItem.productId,
        name: productItem.name,
        price: productItem.price,
        image: productItem.image,
        discount: productItem.discount,
        onSale: productItem.onSale,
        quantity: prevQty + qty
      };

      if (productItem.isPinkFriday) {
        mergedItem.isPinkFriday = true;
        mergedItem.campaignPrice = productItem.campaignPrice;
        mergedItem.regularPrice = productItem.regularPrice;
        mergedItem.badgeText = productItem.badgeText;
      } else {
        delete mergedItem.isPinkFriday;
        delete mergedItem.campaignPrice;
        delete mergedItem.regularPrice;
        delete mergedItem.badgeText;
      }

      if (hasChosenVariants) {
        mergedItem.hasVariants = true;
        mergedItem.variantType = 'scent';
        mergedItem.selectedVariants = productItem.selectedVariants;
        mergedItem.variantName = productItem.variantName;
        if (productItem.selectedVariant) {
          mergedItem.selectedVariant = productItem.selectedVariant;
          mergedItem.variantId = productItem.variantId;
        } else {
          delete mergedItem.selectedVariant;
          delete mergedItem.variantId;
        }
      }

      cart[existIndex] = mergedItem;
      finalItem = mergedItem;
    } else {
      cart.push(productItem);
      finalItem = productItem;
    }

    return {
      ok: true,
      cart,
      item: finalItem,
      addedQuantity: qty,
      merged: existIndex !== -1,
      itemKey: targetItemKey
    };
  }

  /**
   * Extracts structured display info for variants (0, 1, or multiple).
   * Supports `selectedVariants` (array), `selectedVariant` (legacy object), and `variantName` (legacy string).
   * @param {Object} item 
   * @returns {{ count: number, label: string, text: string, list: string[] } | null}
   */
  function getVariantsDisplayInfo(item) {
    if (!item) return null;

    // 1. Array of selected variants
    if (Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0) {
      const list = item.selectedVariants
        .map(v => (v && typeof v === 'object' ? (v.name || v.id) : String(v)))
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(s => s && s !== 'undefined' && s !== 'null');

      if (list.length === 0) return null;
      if (list.length === 1) {
        return {
          count: 1,
          label: 'الرائحة',
          text: list[0],
          list: list
        };
      }
      return {
        count: list.length,
        label: 'الروائح',
        text: list.join('، '),
        list: list
      };
    }

    // 2. Legacy single variant object
    if (item.selectedVariant && item.selectedVariant.name) {
      const name = String(item.selectedVariant.name).trim();
      if (name && name !== 'undefined' && name !== 'null') {
        return {
          count: 1,
          label: 'الرائحة',
          text: name,
          list: [name]
        };
      }
    }

    // 3. Legacy variantName string
    if (item.variantName) {
      const name = String(item.variantName).trim();
      if (name && name !== 'undefined' && name !== 'null') {
        return {
          count: 1,
          label: 'الرائحة',
          text: name,
          list: [name]
        };
      }
    }

    return null;
  }

  /**
   * Safely gets the display string of variants from a cart item or order item.
   * @param {Object} item 
   * @returns {string}
   */
  function getVariantDisplayName(item) {
    const info = getVariantsDisplayInfo(item);
    return info ? info.text : '';
  }

  /**
   * يحسب عدد "وحدات السعر" المطلوبة بناءً على عدد الروائح المختارة.
   * منتج بدون variants أو برائحة واحدة = 1 (بدون أي ضرب إضافي).
   * @param {Object} item
   * @returns {number}
   */
  function getVariantPriceMultiplier(item) {
    const info = getVariantsDisplayInfo(item);
    return (info && info.count > 0) ? info.count : 1;
  }

  /**
   * يحسب السعر الفعلي للوحدة الواحدة بعد ضرب عدد الروائح المختارة.
   * @param {Object} item - يجب أن يحتوي على price
   * @returns {number}
   */
  function getEffectiveUnitPrice(item) {
    if (!item) return 0;
    const basePrice = Number(item.price) || 0;
    return basePrice * getVariantPriceMultiplier(item);
  }

  // Export to global window object
  const DandyVariants = {
    getProductVariants,
    isSupportedVariantType,
    hasSelectableVariants,
    isVariantAvailable,
    getCartItemKey,
    normalizeProductQuantity,
    resolveValidSelectedVariants,
    safeParseCart,
    mergeProductToCart,
    getVariantsDisplayInfo,
    getVariantDisplayName,
    getVariantPriceMultiplier,
    getEffectiveUnitPrice
  };

  window.DandyVariants = DandyVariants;
  window.getProductVariants = getProductVariants;
  window.isSupportedVariantType = isSupportedVariantType;
  window.hasSelectableVariants = hasSelectableVariants;
  window.isVariantAvailable = isVariantAvailable;
  window.getCartItemKey = getCartItemKey;
  window.normalizeProductQuantity = normalizeProductQuantity;
  window.resolveValidSelectedVariants = resolveValidSelectedVariants;
  window.safeParseCart = safeParseCart;
  window.mergeProductToCart = mergeProductToCart;
  window.getVariantsDisplayInfo = getVariantsDisplayInfo;
  window.getVariantDisplayName = getVariantDisplayName;
  window.getVariantPriceMultiplier = getVariantPriceMultiplier;
  window.getEffectiveUnitPrice = getEffectiveUnitPrice;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DandyVariants;
  }

})(typeof window !== 'undefined' ? window : globalThis);
