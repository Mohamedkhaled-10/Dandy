/**
 * Dandy Cosmetics - Variants Helper Utilities
 * Lightweight helper functions for handling product scent variants consistently (single, multi, and optional).
 */

(function (window) {
  'use strict';

  /**
   * Normalizes and returns the array of variants for a product.
   * @param {Object} product 
   * @returns {Array<{id: string, name: string, isAvailable?: boolean}>}
   */
  function getProductVariants(product) {
    if (!product || !product.variants) return [];
    if (Array.isArray(product.variants)) {
      return product.variants.filter(v => v && typeof v === 'object' && v.name);
    }
    if (typeof product.variants === 'object') {
      return Object.entries(product.variants)
        .map(([id, v]) => (typeof v === 'object' ? { id: v.id || id, ...v } : { id, name: String(v), isAvailable: true }))
        .filter(v => v && v.name);
    }
    return [];
  }

  /**
   * Checks if a product has active, selectable variants enabled.
   * @param {Object} product 
   * @returns {boolean}
   */
  function hasSelectableVariants(product) {
    if (!product) return false;
    const hasFlag = product.hasVariants === true || product.hasVariants === 'true';
    if (!hasFlag) return false;
    const variants = getProductVariants(product);
    return variants.length > 0;
  }

  /**
   * Checks if a specific variant in a product is available in stock.
   * @param {Object} product 
   * @param {string} variantId 
   * @returns {boolean}
   */
  function isVariantAvailable(product, variantId) {
    if (!product || !variantId) return false;
    const variants = getProductVariants(product);
    const variant = variants.find(v => String(v.id) === String(variantId));
    if (!variant) return false;
    return variant.isAvailable !== false;
  }

  /**
   * Generates a deterministic unique key for an item in the cart.
   * Sorts selected variants alphabetically so order of selection does not matter:
   * e.g., [Rose, Musk] and [Musk, Rose] result in the exact same cart key.
   * Fully backward-compatible with legacy items without variants or with legacy selectedVariant.
   * @param {Object} item 
   * @returns {string}
   */
  function getCartItemKey(item) {
    if (!item) return '';
    const prodId = item.productId || (typeof item.id === 'string' ? item.id.split('::')[0] : item.id) || '';
    
    // Multiple variants array
    if (Array.isArray(item.selectedVariants) && item.selectedVariants.length > 0) {
      const sortedIds = item.selectedVariants
        .map(v => (v && typeof v === 'object' ? (v.id || v.name) : String(v)))
        .filter(Boolean)
        .map(String)
        .sort()
        .join('_');
      return sortedIds ? `${prodId}_${sortedIds}` : String(prodId);
    }

    // Legacy single variant object
    if (item.selectedVariant && item.selectedVariant.id) {
      return `${prodId}_${item.selectedVariant.id}`;
    }

    // Legacy single variant name string
    if (item.variantId) {
      return `${prodId}_${item.variantId}`;
    }

    return String(prodId);
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

  // Export to global window object
  const DandyVariants = {
    getProductVariants,
    hasSelectableVariants,
    isVariantAvailable,
    getCartItemKey,
    getVariantsDisplayInfo,
    getVariantDisplayName
  };

  window.DandyVariants = DandyVariants;
  window.getProductVariants = getProductVariants;
  window.hasSelectableVariants = hasSelectableVariants;
  window.isVariantAvailable = isVariantAvailable;
  window.getCartItemKey = getCartItemKey;
  window.getVariantsDisplayInfo = getVariantsDisplayInfo;
  window.getVariantDisplayName = getVariantDisplayName;

})(typeof window !== 'undefined' ? window : globalThis);
