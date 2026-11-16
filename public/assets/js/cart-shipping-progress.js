// public/assets/js/cart-shipping-progress.js
// Pure, shared browser + Node-testable helpers for DANDY Cart Free-Shipping Progress & Order Summaries.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DandyCartShipping = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function roundToCents(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
  }

  function formatCurrencyAmount(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '0';
    var rounded = Math.round(num * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
      return String(Math.round(rounded));
    }
    return String(rounded);
  }

  function formatRemainingAmount(threshold, subtotal) {
    var diff = threshold - subtotal;
    if (!Number.isFinite(diff) || diff <= 0) return '0';
    var roundedCents = Math.round(diff * 100) / 100;
    if (roundedCents > 0) {
      return formatCurrencyAmount(roundedCents);
    }
    // Preserve sub-piaster difference without rounding down to misleading "0"
    return String(Number(diff.toPrecision(2)));
  }

  function resolvePolicyThreshold(policy) {
    var raw = policy && Number(policy.freeShippingThresholdEgp);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  function resolveFeeRange(policy) {
    var rates = policy && policy.ratesByGovernorate && typeof policy.ratesByGovernorate === 'object'
      ? Object.values(policy.ratesByGovernorate).filter(function (v) {
          return typeof v === 'number' && Number.isFinite(v) && v >= 0;
        })
      : [];
    var minRaw = policy && policy.feeRangeEgp ? Number(policy.feeRangeEgp.min) : NaN;
    var maxRaw = policy && policy.feeRangeEgp ? Number(policy.feeRangeEgp.max) : NaN;
    var defaultFee = policy && Number.isFinite(Number(policy.defaultFeeEgp)) ? Number(policy.defaultFeeEgp) : 0;

    var minFee = Number.isFinite(minRaw)
      ? minRaw
      : (rates.length > 0 ? Math.min.apply(null, rates) : defaultFee);
    var maxFee = Number.isFinite(maxRaw)
      ? maxRaw
      : (rates.length > 0 ? Math.max.apply(null, rates) : defaultFee);

    return { min: minFee, max: maxFee };
  }

  function getShippingFeeForGovFromPolicy(policy, govName) {
    var defaultFee = policy && Number.isFinite(Number(policy.defaultFeeEgp))
      ? Number(policy.defaultFeeEgp)
      : 0;
    if (!govName || typeof govName !== 'string') return defaultFee;
    var key = govName.trim();
    if (!key) return defaultFee;
    var rates = policy && policy.ratesByGovernorate && typeof policy.ratesByGovernorate === 'object'
      ? policy.ratesByGovernorate
      : {};
    return Object.prototype.hasOwnProperty.call(rates, key) ? Number(rates[key]) : defaultFee;
  }

  /**
   * Computes cart product subtotal using the exact same item pricing rule as cart checkout.
   * Respects Pink Friday unit prices and multi-variant multipliers via getEffectiveUnitPriceFn.
   */
  function computeCartSubtotal(cartItems, getEffectiveUnitPriceFn) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) return 0;
    var total = 0;
    for (var i = 0; i < cartItems.length; i++) {
      var item = cartItems[i];
      if (!item || typeof item !== 'object') continue;
      var unitPrice = typeof getEffectiveUnitPriceFn === 'function'
        ? Number(getEffectiveUnitPriceFn(item)) || 0
        : (Number(item.price) || 0);
      var parsedQty = parseInt(item.quantity, 10);
      var qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      total += unitPrice * qty;
    }
    return roundToCents(total);
  }

  /**
   * Evaluates strict `subtotal > freeShippingThresholdEgp` progress state.
   * Never grants free shipping when subtotal === threshold.
   */
  function evaluateFreeShippingProgress(subtotalInput, policy) {
    var threshold = resolvePolicyThreshold(policy);
    var thresholdFormatted = formatCurrencyAmount(threshold);
    var rawSub = Number(subtotalInput);
    var subtotal = Number.isFinite(rawSub) && rawSub > 0 ? rawSub : 0;
    var feeRange = resolveFeeRange(policy);

    var isEligible = threshold > 0 ? subtotal > threshold : subtotal > 0;
    var isAtThreshold = threshold > 0 && subtotal === threshold;
    var state = isEligible ? 'unlocked' : (isAtThreshold ? 'at_threshold' : 'below_threshold');

    var remainingToThreshold = 0;
    if (state === 'below_threshold' && threshold > 0) {
      remainingToThreshold = Math.max(0, roundToCents(threshold - subtotal));
    }

    var progressPercent = 0;
    if (state === 'unlocked') {
      progressPercent = 100;
    } else if (state === 'at_threshold') {
      // Visual width stays under 100% and uses distinct warning state so exact threshold never appears unlocked.
      progressPercent = 99;
    } else if (threshold > 0 && subtotal > 0) {
      progressPercent = Math.min(98, Math.max(1, Math.round((subtotal / threshold) * 100)));
    }

    var badgeText = '';
    var titleText = '';
    var messageText = '';
    var statusChipText = '';
    var ariaValueText = '';

    if (state === 'unlocked') {
      badgeText = 'شحن مجاني مُفعّل';
      titleText = 'تهانينا! طلبكِ مؤهل للشحن المجاني';
      messageText = 'تم تفعيل الشحن المجاني تلقائياً لأن مجموع المنتجات (' + formatCurrencyAmount(subtotal) + ' ج.م) تجاوز ' + thresholdFormatted + ' ج.م.';
      statusChipText = 'مُفعّل (تجاوز ' + thresholdFormatted + ' ج.م)';
      ariaValueText = 'تم تفعيل الشحن المجاني — مجموع المنتجات ' + formatCurrencyAmount(subtotal) + ' ج.م تجاوز ' + thresholdFormatted + ' ج.م';
    } else if (state === 'at_threshold') {
      badgeText = 'عند الحد تماماً — لم يتفعّل بعد';
      titleText = 'وصلتِ إلى ' + thresholdFormatted + ' ج.م تماماً — يلزم تجاوز الحد';
      messageText = 'مجموع المنتجات وصل إلى ' + thresholdFormatted + ' ج.م بالضبط، والشحن المجاني يتفعّل فقط عند تجاوز ' + thresholdFormatted + ' ج.م. أضيفي أي مبلغ إضافي لإلغاء مصاريف الشحن.';
      statusChipText = 'غير مؤهل بعد (يلزم تجاوز ' + thresholdFormatted + ' ج.م)';
      ariaValueText = 'مجموع المنتجات ' + thresholdFormatted + ' ج.م بالضبط، لم يتفعّل الشحن المجاني بعد ويلزم تجاوز ' + thresholdFormatted + ' ج.م';
    } else {
      var remainingStr = formatRemainingAmount(threshold, subtotal);
      badgeText = 'متبقي للشحن المجاني';
      titleText = 'اقتربتِ من الشحن المجاني (فوق ' + thresholdFormatted + ' ج.م)';
      messageText = 'يتبقى ' + remainingStr + ' ج.م للوصول إلى حد ' + thresholdFormatted + ' ج.م، ويلزم أن يتجاوز مجموع المنتجات ' + thresholdFormatted + ' ج.م لتفعيل الشحن المجاني (تكلفة الشحن الحالية ' + formatCurrencyAmount(feeRange.min) + '–' + formatCurrencyAmount(feeRange.max) + ' ج.م حسب المحافظة).';
      statusChipText = 'غير مؤهل بعد (يتبقى للوصول ' + remainingStr + ' ج.م ثم التجاوز)';
      ariaValueText = 'مجموع المنتجات ' + formatCurrencyAmount(subtotal) + ' ج.م من أصل ' + thresholdFormatted + ' ج.م، يتبقى ' + remainingStr + ' ج.م للوصول للحد ويلزم تجاوزه';
    }

    return {
      state: state,
      isEligible: isEligible,
      isAtThreshold: isAtThreshold,
      subtotal: subtotal,
      subtotalFormatted: formatCurrencyAmount(subtotal),
      threshold: threshold,
      thresholdFormatted: thresholdFormatted,
      remainingToThreshold: remainingToThreshold,
      remainingFormatted: formatRemainingAmount(threshold, subtotal),
      progressPercent: progressPercent,
      feeRange: feeRange,
      badgeText: badgeText,
      titleText: titleText,
      messageText: messageText,
      statusChipText: statusChipText,
      ariaValueText: ariaValueText
    };
  }

  /**
   * Builds consistent, unambiguous summary presentation values across checkout steps 1, 2, and 3.
   */
  function computeCheckoutSummaryState(params) {
    var safe = params && typeof params === 'object' ? params : {};
    var policy = safe.policy || {};
    var progress = evaluateFreeShippingProgress(safe.subtotal, policy);
    var selectedGov = typeof safe.selectedGovernorate === 'string' ? safe.selectedGovernorate.trim() : '';
    var selectedGovLabel = typeof safe.selectedGovernorateLabel === 'string' ? safe.selectedGovernorateLabel.trim() : selectedGov;
    var hasSelectedGov = Boolean(selectedGov);

    var shippingFee = null;
    var shippingConfirmed = false;
    var shippingDisplayText = '';
    var totalConfirmed = false;
    var finalTotal = null;
    var step1TotalLabel = '';
    var step1TotalText = '';
    var step1TotalHint = '';
    var step2TotalLabel = '';
    var step2TotalText = '';
    var step2TotalHint = '';
    var step3ShippingText = '';
    var step3TotalText = '';

    if (progress.isEligible) {
      shippingFee = 0;
      shippingConfirmed = true;
      shippingDisplayText = 'شحن مجاني (0 ج.م)';
      totalConfirmed = true;
      finalTotal = progress.subtotal;

      step1TotalLabel = 'الإجمالي المستحق:';
      step1TotalText = progress.subtotalFormatted + ' ج.م';
      step1TotalHint = 'طلبكِ مؤهل للشحن المجاني أياً كانت المحافظة.';
      step2TotalLabel = 'الإجمالي النهائي:';
      step2TotalText = progress.subtotalFormatted + ' ج.م';
      step2TotalHint = hasSelectedGov
        ? 'تم تطبيق الشحن المجاني لمحافظة ' + selectedGovLabel + '.'
        : 'تم تفعيل الشحن المجاني أياً كانت المحافظة.';
      step3ShippingText = 'شحن مجاني (0 ج.م)';
      step3TotalText = progress.subtotalFormatted + ' ج.م';
    } else if (hasSelectedGov) {
      shippingFee = getShippingFeeForGovFromPolicy(policy, selectedGov);
      shippingConfirmed = true;
      shippingDisplayText = formatCurrencyAmount(shippingFee) + ' ج.م' + (selectedGovLabel ? ' (' + selectedGovLabel + ')' : '');
      totalConfirmed = true;
      finalTotal = roundToCents(progress.subtotal + shippingFee);

      step1TotalLabel = 'الإجمالي شامل الشحن (' + selectedGovLabel + '):';
      step1TotalText = formatCurrencyAmount(finalTotal) + ' ج.م';
      step1TotalHint = 'يشمل مصاريف شحن محافظة ' + selectedGovLabel + ' (' + formatCurrencyAmount(shippingFee) + ' ج.م).';
      step2TotalLabel = 'الإجمالي الكلي (شامل الشحن):';
      step2TotalText = formatCurrencyAmount(finalTotal) + ' ج.م';
      step2TotalHint = step1TotalHint;
      step3ShippingText = formatCurrencyAmount(shippingFee) + ' ج.م' + (selectedGovLabel ? ' (' + selectedGovLabel + ')' : '');
      step3TotalText = formatCurrencyAmount(finalTotal) + ' ج.م';
    } else {
      shippingFee = null;
      shippingConfirmed = false;
      shippingDisplayText = 'تُحدد حسب المحافظة (' + formatCurrencyAmount(progress.feeRange.min) + '–' + formatCurrencyAmount(progress.feeRange.max) + ' ج.م)';
      totalConfirmed = false;
      finalTotal = null;

      step1TotalLabel = 'مجموع المنتجات (قبل الشحن):';
      step1TotalText = progress.subtotalFormatted + ' ج.م + الشحن';
      step1TotalHint = 'تُحسب تكلفة الشحن النهائية بعد اختيار المحافظة في الخطوة التالية.';
      step2TotalLabel = 'الإجمالي النهائي:';
      step2TotalText = 'يُحدد بعد اختيار المحافظة';
      step2TotalHint = 'المنتجات: ' + progress.subtotalFormatted + ' ج.م + شحن المحافظة (' + formatCurrencyAmount(progress.feeRange.min) + '–' + formatCurrencyAmount(progress.feeRange.max) + ' ج.م).';
      step3ShippingText = shippingDisplayText;
      step3TotalText = step2TotalText;
    }

    return {
      progress: progress,
      hasSelectedGovernorate: hasSelectedGov,
      selectedGovernorate: selectedGov,
      selectedGovernorateLabel: selectedGovLabel,
      subtotal: progress.subtotal,
      subtotalText: progress.subtotalFormatted + ' ج.م',
      shippingFee: shippingFee,
      shippingConfirmed: shippingConfirmed,
      shippingDisplayText: shippingDisplayText,
      freeShippingStatusText: progress.statusChipText,
      totalConfirmed: totalConfirmed,
      finalTotal: finalTotal,
      step1TotalLabel: step1TotalLabel,
      step1TotalText: step1TotalText,
      step1TotalHint: step1TotalHint,
      step2TotalLabel: step2TotalLabel,
      step2TotalText: step2TotalText,
      step2TotalHint: step2TotalHint,
      step3ShippingText: step3ShippingText,
      step3TotalText: step3TotalText
    };
  }

  return {
    roundToCents: roundToCents,
    formatCurrencyAmount: formatCurrencyAmount,
    formatRemainingAmount: formatRemainingAmount,
    computeCartSubtotal: computeCartSubtotal,
    evaluateFreeShippingProgress: evaluateFreeShippingProgress,
    computeCheckoutSummaryState: computeCheckoutSummaryState
  };
});
