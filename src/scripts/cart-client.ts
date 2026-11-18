/**
 * ============================================================================
 * DANDY COSMETICS — CART & CHECKOUT CLIENT CONTROLLER (PHASE 6)
 * Preserves localStorage cart/dandy_cart compatibility, multi-scent pricing,
 * Pink Friday campaign reconciliation, saved customer addresses, Meta Pixel
 * InitiateCheckout tracking, Cloudflare Turnstile verification, and
 * POST /api/create-order payload contracts. Zero native alert()/confirm().
 * ============================================================================
 */
import { resolveClientLocalizedProductName, resolveClientLocalizedVariantName } from '../i18n/content/en/products';
import { EN_PINK_FRIDAY_OVERLAY } from '../i18n/content/en/pink-friday';
import { getIconSvg } from './icons';
import {
  buildCreateOrderPayload,
  calculateCartSubtotal,
  calculateShippingQuote,
  computeFreeShippingProgress,
  escapeHtml,
  extractCollectionSubItems,
  FALLBACK_CART_IMAGE,
  formatOrderLineItem,
  getGovernorateLabel,
  parseCartArrayFromStrings,
  resolveEffectiveUnitPrice,
  resolveItemQuantity,
  resolveVariantsDisplayInfo,
  sanitizeImageUrl,
  upsertRecentLookup,
  validateCheckoutForm,
  type CartItemInput,
  type CheckoutFieldKey,
  type RecentLookupEntry,
} from './purchase-flow';

function getRuntimeLocale(): 'ar' | 'en' {
  if (typeof document !== 'undefined') {
    const lang = (document.documentElement.getAttribute('lang') || '').trim().toLowerCase();
    if (lang.startsWith('en')) return 'en';
  }
  if (typeof window !== 'undefined') {
    const p = (window.location.pathname || '/').toLowerCase();
    if (p === '/en' || p.startsWith('/en/')) return 'en';
  }
  return 'ar';
}

declare global {
  interface Window {
    db?: any;
    auth?: any;
    firebase?: any;
    turnstile?: {
      getResponse: () => string;
      reset: () => void;
    };
    DandyPinkFriday?: {
      isActive?: () => boolean;
      getPricing?: (item: { id: string; price: number }) => {
        isEligible: boolean;
        campaignPrice: number;
        regularPrice: number;
        badgeText: string;
      };
    };
    DandyMeta?: {
      trackInitiateCheckout?: (cart: any[], value: number) => void;
    };
    fbq?: (...args: any[]) => void;
    updateSharedCartCount?: () => void;
    __dandyResolveVariantName?: (productId?: string, variantId?: string, fallbackName?: string) => string;
    goToStep?: (step: number) => void;
    validateAndGoToReview?: () => void;
    submitFinalOrder?: () => Promise<void>;
    changeQty?: (index: number, delta: number) => void;
    removeItemFromCart?: (index: number) => void;
    handleGovChange?: () => void;
    toggleAddressMode?: (mode: 'saved' | 'new') => void;
    applySavedAddress?: (key: string) => void;
  }
}

export function initCartCheckoutPage(): void {
  const root = document.getElementById('cartCheckoutContainer');
  if (!root) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const currencyLabel = isEn ? 'EGP' : 'ج.م';

  window.__dandyResolveVariantName = (productId?: string, variantId?: string, fallbackName?: string) =>
    resolveClientLocalizedVariantName(productId, variantId, fallbackName || '', locale);

  function resolveCartItemDisplayName(item: Partial<CartItemInput>): string {
    const fallback = String(item?.name || (isEn ? 'DANDY Product' : 'منتج داندي'));
    if (!isEn) return fallback;
    if (item?.type === 'collection' || item?.isCollection || item?.collectionId) {
      const colId = String(item.collectionId || item.id || '').split('::')[0];
      const colOv = EN_PINK_FRIDAY_OVERLAY.collectionTextOverrides?.[colId]?.name;
      if (colOv) return colOv;
    }
    return resolveClientLocalizedProductName(item?.productId || item?.id, fallback, 'en');
  }

  let cart: CartItemInput[] = parseCartArrayFromStrings(
    safeGetStorage('cart'),
    safeGetStorage('dandy_cart')
  );
  let currentStep = 1;
  let hasFiredInitiateCheckout = false;
  let isSubmitting = false;
  let pendingRemoveIndex: number | null = null;
  let lastRemoveTrigger: HTMLElement | null = null;
  let customerSavedAddresses: Record<string, any> = {};

  const checkoutFlowViews = document.getElementById('checkoutFlowViews');
  const cartEmptyState = document.getElementById('cartEmptyState');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartItemsCountBadge = document.getElementById('cartItemsCountBadge');
  const freeShippingBox = document.getElementById('freeShippingProgressBox');
  const freeShippingText = document.getElementById('freeShippingText');
  const freeShippingFill = document.getElementById('freeShippingFill');
  const freeShippingPctLabel = document.getElementById('freeShippingPctLabel');

  const subtotalValSummary = document.getElementById('subtotalValSummary');
  const shippingCostSummary1 = document.getElementById('shippingCostSummary1');
  const grandTotalSummaryValue1 = document.getElementById('grandTotalSummaryValue1');

  const subtotalValSummary2 = document.getElementById('subtotalValSummary2');
  const shippingCostSummary2 = document.getElementById('shippingCostSummary2');
  const grandTotalSummaryValue2 = document.getElementById('grandTotalSummaryValue2');

  const revCustName = document.getElementById('revCustName');
  const revCustPhone = document.getElementById('revCustPhone');
  const revCustEmail = document.getElementById('revCustEmail');
  const revCustLocation = document.getElementById('revCustLocation');
  const revCustAddress = document.getElementById('revCustAddress');
  const revProductsList = document.getElementById('revProductsList');
  const summSubtotal = document.getElementById('summSubtotal');
  const summShipping = document.getElementById('summShipping');
  const finalSummaryTotal = document.getElementById('finalSummaryTotal');

  const checkoutErrorSummary = document.getElementById('checkoutErrorSummary');
  const reviewSubmitError = document.getElementById('reviewSubmitError');
  const savingTextLoader = document.getElementById('savingTextLoader');
  const finalPlaceOrderBtn = document.getElementById('finalPlaceOrderBtn') as HTMLButtonElement | null;

  const removeDialog = document.getElementById('cartRemoveDialog') as HTMLDialogElement | null;
  const removeItemNameEl = document.getElementById('cartRemoveItemName');
  const removeCancelBtn = document.getElementById('cartRemoveCancelBtn');
  const removeConfirmBtn = document.getElementById('cartRemoveConfirmBtn');

  function safeGetStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function persistCart(nextCart: CartItemInput[]): void {
    const serialized = JSON.stringify(nextCart);
    try {
      localStorage.setItem('cart', serialized);
      localStorage.setItem('dandy_cart', serialized);
    } catch {
      // Ignore private browsing quota errors
    }
    window.dispatchEvent(new CustomEvent('cart-updated'));
    if (typeof window.updateSharedCartCount === 'function') {
      window.updateSharedCartCount();
    }
  }

  function clearPersistedCart(): void {
    try {
      localStorage.removeItem('cart');
      localStorage.removeItem('dandy_cart');
    } catch {
      // Ignore storage errors
    }
    window.dispatchEvent(new CustomEvent('cart-updated'));
    if (typeof window.updateSharedCartCount === 'function') {
      window.updateSharedCartCount();
    }
  }

  function showToast(type: 'success' | 'error' | 'info', message: string): void {
    window.DandyToast?.show({ type, message });
  }

  function reconcileCartWithCampaign(): void {
    let modified = false;
    cart.forEach((item) => {
      if (item.type === 'collection' || item.isCollection || item.collectionId) {
        if (window.DandyPinkFriday && typeof window.DandyPinkFriday.isActive === 'function') {
          if (!window.DandyPinkFriday.isActive()) {
            if (item.isPinkFriday) modified = true;
            item.isPinkFriday = false;
            if (item.regularPrice) item.price = item.regularPrice;
          } else {
            item.isPinkFriday = true;
            if (!item.badgeText) {
              item.badgeText = isEn ? 'Pink Friday Collection' : 'كوليكشن Pink Friday';
            }
          }
        }
        return;
      }

      const rawId = item.productId || (item.id ? String(item.id).split('::')[0] : '');
      if (window.DandyPinkFriday && typeof window.DandyPinkFriday.getPricing === 'function') {
        const regularBase = Number(item.regularPrice || item.price) || 0;
        const pf = window.DandyPinkFriday.getPricing({ id: rawId, price: regularBase });
        if (pf.isEligible) {
          if (!item.isPinkFriday || Number(item.price) !== pf.campaignPrice) {
            item.isPinkFriday = true;
            item.campaignPrice = pf.campaignPrice;
            item.regularPrice = pf.regularPrice;
            item.price = pf.campaignPrice;
            item.badgeText = pf.badgeText;
            modified = true;
          }
        } else if (item.isPinkFriday) {
          item.isPinkFriday = false;
          if (item.regularPrice) {
            item.price = item.regularPrice;
          }
          delete item.campaignPrice;
          delete item.regularPrice;
          delete item.badgeText;
          modified = true;
        }
      }
    });

    if (modified) {
      persistCart(cart);
    }
  }

  function getFormInputValues() {
    const fName = document.getElementById('f-name') as HTMLInputElement | null;
    const fPhone = document.getElementById('f-phone') as HTMLInputElement | null;
    const fEmail = document.getElementById('f-email') as HTMLInputElement | null;
    const fGov = document.getElementById('f-gov') as HTMLSelectElement | null;
    const fCity = document.getElementById('f-city') as HTMLInputElement | null;
    const fAddress = document.getElementById('f-address') as HTMLInputElement | null;

    return {
      name: fName?.value || '',
      phone: fPhone?.value || '',
      email: fEmail?.value || '',
      governorate: fGov?.value || '',
      city: fCity?.value || '',
      address: fAddress?.value || '',
    };
  }

  function updateFreeShippingBanner(subtotal: number): void {
    if (!freeShippingBox || !freeShippingText || !freeShippingFill) return;
    const prog = computeFreeShippingProgress(subtotal);
    freeShippingFill.style.width = `${prog.percentComplete}%`;
    if (freeShippingPctLabel) {
      freeShippingPctLabel.textContent = `${prog.percentComplete}%`;
    }
    freeShippingBox.classList.toggle('is-qualified', prog.qualifies);

    if (prog.qualifies) {
      freeShippingText.textContent = isEn
        ? 'Your order qualifies for free shipping across all governorates.'
        : 'طلبكِ مؤهل للشحن المجاني لجميع المحافظات.';
    } else {
      freeShippingText.textContent = isEn
        ? `Add ${prog.remainingForFree.toLocaleString('en-US')} EGP more to exceed 2,000 EGP and unlock free shipping.`
        : `أضيفي منتجات بقيمة ${prog.remainingForFree.toLocaleString('en-US')} ج.م لتجاوز 2000 ج.م والحصول على شحن مجاني.`;
    }
  }

  function updateSummaryTotals(): void {
    const subtotal = calculateCartSubtotal(cart);
    const { governorate } = getFormInputValues();
    const quote = calculateShippingQuote(subtotal, governorate);

    if (subtotalValSummary) subtotalValSummary.textContent = `${subtotal.toFixed(0)} ${currencyLabel}`;
    if (subtotalValSummary2) subtotalValSummary2.textContent = `${subtotal.toFixed(0)} ${currencyLabel}`;
    if (grandTotalSummaryValue1) grandTotalSummaryValue1.textContent = `${subtotal.toFixed(0)} ${currencyLabel}`;

    if (shippingCostSummary1) {
      if (quote.isFreeShipping) {
        shippingCostSummary1.textContent = isEn ? 'Free Shipping' : 'شحن مجاني';
        shippingCostSummary1.className = 'dandy-sum-value dandy-sum-value--free';
      } else {
        shippingCostSummary1.textContent = isEn ? 'Calculated at checkout' : 'تُحدد عند اختيار المحافظة';
        shippingCostSummary1.className = 'dandy-sum-value dandy-sum-value--muted';
      }
    }

    if (shippingCostSummary2) {
      if (quote.hasGovernorate) {
        if (quote.isFreeShipping) {
          shippingCostSummary2.textContent = isEn ? 'Free Shipping' : 'شحن مجاني';
          shippingCostSummary2.className = 'dandy-sum-value dandy-sum-value--free';
        } else {
          shippingCostSummary2.textContent = `${quote.shippingFee} ${currencyLabel}`;
          shippingCostSummary2.className = 'dandy-sum-value';
        }
      } else if (quote.isFreeShipping) {
        shippingCostSummary2.textContent = isEn ? 'Free Shipping' : 'شحن مجاني';
        shippingCostSummary2.className = 'dandy-sum-value dandy-sum-value--free';
      } else {
        shippingCostSummary2.textContent = isEn ? 'Select a governorate to calculate' : 'اختاري المحافظة لحساب الشحن';
        shippingCostSummary2.className = 'dandy-sum-value dandy-sum-value--muted';
      }
    }

    if (grandTotalSummaryValue2) {
      grandTotalSummaryValue2.textContent = `${quote.totalAmount.toFixed(0)} ${currencyLabel}`;
    }

    updateFreeShippingBanner(subtotal);
  }

  function renderCartItems(): void {
    if (typeof window.updateSharedCartCount === 'function') {
      window.updateSharedCartCount();
    }

    const totalItemsCount = cart.reduce((sum, item) => sum + resolveItemQuantity(item?.quantity), 0);
    if (cartItemsCountBadge) {
      cartItemsCountBadge.textContent = isEn
        ? `${totalItemsCount} ${totalItemsCount === 1 ? 'item' : 'items'}`
        : `${totalItemsCount} ${totalItemsCount === 1 ? 'منتج' : 'منتجات'}`;
    }

    if (!cart || cart.length === 0) {
      if (checkoutFlowViews) checkoutFlowViews.hidden = true;
      if (cartEmptyState) cartEmptyState.hidden = false;
      return;
    }

    if (checkoutFlowViews) checkoutFlowViews.hidden = false;
    if (cartEmptyState) cartEmptyState.hidden = true;

    if (!cartItemsList) return;
    cartItemsList.innerHTML = '';

    const minusIcon = getIconSvg('minus', { size: 15, strokeWidth: 2 });
    const plusIcon = getIconSvg('plus', { size: 15, strokeWidth: 2 });
    const trashIcon = getIconSvg('trash', { size: 16, strokeWidth: 1.8 });
    const sparklesIcon = getIconSvg('sparkles', { size: 13, strokeWidth: 1.9 });
    const packageIcon = getIconSvg('package', { size: 13, strokeWidth: 1.9 });

    cart.forEach((item, index) => {
      const qtyVal = resolveItemQuantity(item.quantity);
      const unitPrice = resolveEffectiveUnitPrice(item);
      const rowSubtotal = unitPrice * qtyVal;
      const displayName = resolveCartItemDisplayName(item);
      const safeName = escapeHtml(displayName);
      const safeImage = escapeHtml(sanitizeImageUrl(item.image));
      const varInfo = resolveVariantsDisplayInfo(item, locale);

      const pfTagLabel = isEn
        ? item.isCollection
          ? 'Pink Friday Collection'
          : 'Pink Friday'
        : item.badgeText || (item.isCollection ? 'كوليكشن Pink Friday' : 'Pink Friday');

      const pfBadgeHtml = item.isPinkFriday
        ? `<div class="dandy-cart-badge-row">
             <span class="dandy-cart-offer-tag">${escapeHtml(pfTagLabel)}</span>
             ${item.regularPrice ? `<span class="dandy-cart-old-price dandy-tabular">${Number(item.regularPrice).toFixed(0)} ${currencyLabel}</span>` : ''}
           </div>`
        : '';

      const variantHtml =
        varInfo && varInfo.text
          ? `<div class="dandy-cart-variant-line">
               ${sparklesIcon}
               <span>${escapeHtml(varInfo.label)}: <strong>${escapeHtml(varInfo.text)}</strong></span>
             </div>`
          : '';

      const subItems = extractCollectionSubItems(item, locale);
      const collectionHtml =
        item.isCollection && subItems.length > 0
          ? `<div class="dandy-cart-col-box">
               <div class="dandy-cart-col-title">${packageIcon} <span>${isEn ? 'Collection includes:' : 'محتويات الكوليكشن:'}</span></div>
               <ul class="dandy-cart-col-list">
                 ${subItems
                   .map((si) => {
                     return `<li>${escapeHtml(si.productName)}${si.variantName ? ` <span class="dandy-cart-col-scent">(${escapeHtml(si.variantName)})</span>` : ''}</li>`;
                   })
                   .join('')}
               </ul>
             </div>`
          : '';

      const li = document.createElement('li');
      li.className = 'dandy-cart-item-row';
      li.dataset.cartIndex = String(index);

      li.innerHTML = `
        <div class="dandy-cart-item-main">
          <img
            src="${safeImage}"
            alt="${safeName}"
            width="80"
            height="80"
            loading="lazy"
            class="dandy-cart-item-img"
            onerror="this.onerror=null;this.src='${FALLBACK_CART_IMAGE}';this.style.objectFit='contain';this.style.padding='6px';"
          />
          <div class="dandy-cart-item-meta">
            <h3 class="dandy-cart-item-title">${safeName}</h3>
            ${pfBadgeHtml}
            ${variantHtml}
            ${collectionHtml}
            <div class="dandy-cart-unit-price dandy-tabular">${unitPrice.toFixed(0)} ${currencyLabel}${isEn ? ' each' : ' للقطعة'}</div>
          </div>
        </div>

        <div class="dandy-cart-item-controls">
          <div class="dandy-qty-stepper" role="group" aria-label="${escapeHtml(isEn ? `Quantity controls for ${displayName}` : `التحكم بكمية ${displayName}`)}">
            <button
              type="button"
              class="dandy-qty-btn"
              data-qty-action="dec"
              data-index="${index}"
              aria-label="${escapeHtml(isEn ? `Decrease quantity of ${displayName}` : `تقليل كمية ${displayName}`)}"
              ${qtyVal <= 1 ? 'disabled' : ''}
            >
              ${minusIcon}
            </button>
            <span class="dandy-qty-value dandy-tabular" aria-label="${isEn ? 'Quantity' : 'الكمية'}">${qtyVal}</span>
            <button
              type="button"
              class="dandy-qty-btn"
              data-qty-action="inc"
              data-index="${index}"
              aria-label="${escapeHtml(isEn ? `Increase quantity of ${displayName}` : `زيادة كمية ${displayName}`)}"
            >
              ${plusIcon}
            </button>
          </div>

          <div class="dandy-cart-item-end">
            <div class="dandy-cart-row-total dandy-tabular">${rowSubtotal.toFixed(0)} ${currencyLabel}</div>
            <button
              type="button"
              class="dandy-cart-remove-btn"
              data-remove-index="${index}"
              aria-label="${escapeHtml(isEn ? `Remove ${displayName} from bag` : `إزالة ${displayName} من الحقيبة`)}"
              title="${isEn ? 'Remove from bag' : 'إزالة من الحقيبة'}"
            >
              ${trashIcon}
            </button>
          </div>
        </div>
      `;
      cartItemsList.appendChild(li);
    });

    updateSummaryTotals();
  }

  function changeQty(index: number, delta: number): void {
    const item = cart[index];
    if (!item) return;
    const nextQty = resolveItemQuantity(item.quantity) + delta;
    if (nextQty < 1) return;
    item.quantity = Math.min(99, nextQty);
    persistCart(cart);
    renderCartItems();
  }

  function openRemoveDialog(index: number, triggerEl: HTMLElement | null): void {
    const item = cart[index];
    if (!item) return;

    if (!removeDialog || typeof removeDialog.showModal !== 'function') {
      performRemove(index);
      return;
    }

    pendingRemoveIndex = index;
    lastRemoveTrigger = triggerEl;
    if (removeItemNameEl) {
      removeItemNameEl.textContent = resolveCartItemDisplayName(item);
    }
    removeDialog.showModal();
  }

  function closeRemoveDialog(): void {
    if (removeDialog?.open) {
      removeDialog.close();
    }
    pendingRemoveIndex = null;
    if (lastRemoveTrigger && document.contains(lastRemoveTrigger)) {
      lastRemoveTrigger.focus();
    }
    lastRemoveTrigger = null;
  }

  function performRemove(index: number): void {
    const removed = cart[index];
    if (!removed) return;
    const removedName = resolveCartItemDisplayName(removed);
    cart.splice(index, 1);
    persistCart(cart);
    renderCartItems();
    showToast(
      'info',
      isEn ? `Removed "${removedName}" from your bag.` : `تمت إزالة "${removedName}" من حقيبة التسوق.`
    );
  }

  function clearFieldError(fieldKey: CheckoutFieldKey): void {
    const inputMap: Record<CheckoutFieldKey, string> = {
      name: 'f-name',
      phone: 'f-phone',
      email: 'f-email',
      governorate: 'f-gov',
      city: 'f-city',
      address: 'f-address',
    };
    const inputEl = document.getElementById(inputMap[fieldKey]);
    const errEl = document.getElementById(`err-${inputMap[fieldKey]}`);
    if (inputEl) {
      inputEl.removeAttribute('aria-invalid');
      inputEl.closest('.dandy-field')?.classList.remove('has-error');
    }
    if (errEl) {
      errEl.textContent = '';
      errEl.hidden = true;
    }
  }

  function clearAllFieldErrors(): void {
    (['name', 'phone', 'email', 'governorate', 'city', 'address'] as CheckoutFieldKey[]).forEach(
      clearFieldError
    );
    if (checkoutErrorSummary) {
      checkoutErrorSummary.textContent = '';
      checkoutErrorSummary.hidden = true;
    }
  }

  function applyFieldErrors(errors: Partial<Record<CheckoutFieldKey, string>>, firstField: CheckoutFieldKey | null): void {
    const inputMap: Record<CheckoutFieldKey, string> = {
      name: 'f-name',
      phone: 'f-phone',
      email: 'f-email',
      governorate: 'f-gov',
      city: 'f-city',
      address: 'f-address',
    };

    const messages: string[] = [];
    (Object.keys(errors) as CheckoutFieldKey[]).forEach((key) => {
      const msg = errors[key];
      if (!msg) return;
      messages.push(msg);
      const inputEl = document.getElementById(inputMap[key]);
      const errEl = document.getElementById(`err-${inputMap[key]}`);
      if (inputEl) {
        inputEl.setAttribute('aria-invalid', 'true');
        inputEl.closest('.dandy-field')?.classList.add('has-error');
      }
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
    });

    if (checkoutErrorSummary && messages.length > 0) {
      checkoutErrorSummary.textContent = messages[0];
      checkoutErrorSummary.hidden = false;
    }

    if (firstField) {
      const focusEl = document.getElementById(inputMap[firstField]);
      focusEl?.focus();
    }
  }

  function goToStep(step: number): void {
    if (step < 1 || step > 3) return;
    if (cart.length === 0 && step > 1) {
      renderCartItems();
      return;
    }

    currentStep = step;

    if (step === 2 && !hasFiredInitiateCheckout && cart.length > 0) {
      hasFiredInitiateCheckout = true;
      const cartVal = calculateCartSubtotal(cart);
      if (window.DandyMeta && typeof window.DandyMeta.trackInitiateCheckout === 'function') {
        window.DandyMeta.trackInitiateCheckout(cart, cartVal);
      } else if (typeof window.fbq === 'function') {
        window.fbq('track', 'InitiateCheckout', {
          value: cartVal,
          currency: 'EGP',
          num_items: cart.reduce((sum, item) => sum + resolveItemQuantity(item.quantity), 0),
        });
      }
    }

    document.querySelectorAll('.checkout-step-panel').forEach((panel) => {
      panel.classList.remove('active');
    });

    document.querySelectorAll('.stepper-step').forEach((stepEl, idx) => {
      const stepNum = idx + 1;
      stepEl.classList.remove('active', 'completed');
      stepEl.removeAttribute('aria-current');
      const btn = stepEl.querySelector('button') as HTMLButtonElement | null;
      if (stepNum < step) {
        stepEl.classList.add('completed');
        if (btn) btn.disabled = false;
      } else if (stepNum === step) {
        stepEl.classList.add('active');
        stepEl.setAttribute('aria-current', 'step');
        if (btn) btn.disabled = false;
      } else if (btn && stepNum === 3) {
        btn.disabled = true;
      }
    });

    const progressLine = document.getElementById('stepperLineProgress');
    if (progressLine) {
      const pct = ((step - 1) / 2) * 100;
      progressLine.style.width = `${pct}%`;
    }

    const activePanel = document.getElementById(`step-panel-${step}`);
    activePanel?.classList.add('active');

    if (reviewSubmitError) {
      reviewSubmitError.textContent = '';
      reviewSubmitError.hidden = true;
    }

    window.DandyToast?.clear();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function populateReviewAndAdvance(): void {
    clearAllFieldErrors();
    const formValues = getFormInputValues();
    const validation = validateCheckoutForm(formValues, locale);

    if (!validation.valid) {
      applyFieldErrors(validation.errors, validation.firstErrorField);
      if (validation.firstErrorMessage) {
        showToast('error', validation.firstErrorMessage);
      }
      return;
    }

    const { sanitized } = validation;
    const subtotal = calculateCartSubtotal(cart);
    const quote = calculateShippingQuote(subtotal, sanitized.governorate);

    if (revCustName) revCustName.textContent = sanitized.name;
    if (revCustPhone) revCustPhone.textContent = sanitized.phone;
    if (revCustEmail) revCustEmail.textContent = sanitized.email || (isEn ? 'Not provided' : 'لا يوجد');
    if (revCustLocation) {
      const govText = getGovernorateLabel(sanitized.governorate, locale);
      revCustLocation.textContent = isEn
        ? `${sanitized.city}, ${govText} Governorate`
        : `${sanitized.city}، محافظة ${govText}`;
    }
    if (revCustAddress) revCustAddress.textContent = sanitized.address;

    if (revProductsList) {
      revProductsList.innerHTML = '';
      const listEl = document.createElement('ul');
      listEl.className = 'dandy-rev-products';
      const sparklesIcon = getIconSvg('sparkles', { size: 12, strokeWidth: 1.9 });

      cart.forEach((rawItem) => {
        const formatted = formatOrderLineItem(
          {
            ...rawItem,
            effectiveUnitPrice: resolveEffectiveUnitPrice(rawItem),
            lineTotal: resolveEffectiveUnitPrice(rawItem) * resolveItemQuantity(rawItem.quantity),
          },
          locale
        );
        const varInfo = formatted.variants;
        const variantBadgeHtml =
          varInfo && varInfo.text
            ? `<span class="dandy-rev-variant">${sparklesIcon} ${escapeHtml(varInfo.label)}: <strong>${escapeHtml(varInfo.text)}</strong></span>`
            : '';

        const colSubHtml =
          formatted.isCollection && formatted.collectionItems.length > 0
            ? `<div class="dandy-rev-col-sub">
                 <span>${isEn ? 'Collection includes:' : 'محتويات الكوليكشن:'}</span>
                 ${formatted.collectionItems
                   .map((si) => `${escapeHtml(si.productName)}${si.variantName ? ` (${escapeHtml(si.variantName)})` : ''}`)
                   .join(' · ')}
               </div>`
            : '';

        const li = document.createElement('li');
        li.className = 'dandy-rev-product-item';
        li.innerHTML = `
          <div class="dandy-rev-product-start">
            <img
              src="${escapeHtml(formatted.image)}"
              alt="${escapeHtml(formatted.name)}"
              width="52"
              height="52"
              loading="lazy"
              class="dandy-rev-product-img"
              onerror="this.onerror=null;this.src='${FALLBACK_CART_IMAGE}';this.style.objectFit='contain';this.style.padding='6px';"
            />
            <div class="dandy-rev-product-info">
              <h4 class="dandy-rev-product-name">${escapeHtml(formatted.name)}</h4>
              <div class="dandy-rev-product-meta">
                ${variantBadgeHtml}
                <span class="dandy-rev-qty dandy-tabular">${isEn ? 'Qty:' : 'الكمية:'} <strong>${formatted.quantity}</strong> × ${formatted.unitPrice.toFixed(0)} ${currencyLabel}</span>
              </div>
              ${colSubHtml}
            </div>
          </div>
          <div class="dandy-rev-product-total dandy-tabular">${formatted.lineTotal.toFixed(0)} ${currencyLabel}</div>
        `;
        listEl.appendChild(li);
      });

      revProductsList.appendChild(listEl);
    }

    if (summSubtotal) summSubtotal.textContent = `${subtotal.toFixed(0)} ${currencyLabel}`;
    if (summShipping) {
      summShipping.textContent = quote.isFreeShipping
        ? isEn
          ? 'Free Shipping'
          : 'شحن مجاني'
        : `${quote.shippingFee ?? 0} ${currencyLabel}`;
      summShipping.className = quote.isFreeShipping
        ? 'dandy-sum-value dandy-sum-value--free dandy-tabular'
        : 'dandy-sum-value dandy-tabular';
    }
    if (finalSummaryTotal) finalSummaryTotal.textContent = `${quote.totalAmount.toFixed(0)} ${currencyLabel}`;

    goToStep(3);
  }

  function showReviewError(message: string): void {
    if (reviewSubmitError) {
      reviewSubmitError.textContent = message;
      reviewSubmitError.hidden = false;
    }
    showToast('error', message);
  }

  async function submitFinalOrder(): Promise<void> {
    if (isSubmitting) return;
    if (!finalPlaceOrderBtn) return;

    const formValues = getFormInputValues();
    const validation = validateCheckoutForm(formValues, locale);
    if (!validation.valid) {
      goToStep(2);
      applyFieldErrors(validation.errors, validation.firstErrorField);
      if (validation.firstErrorMessage) showToast('error', validation.firstErrorMessage);
      return;
    }

    let turnstileToken = '';
    if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
      try {
        turnstileToken = window.turnstile.getResponse() || '';
      } catch {
        // Ignore
      }
    }
    if (!turnstileToken) {
      const turnstileInput = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null;
      if (turnstileInput) turnstileToken = turnstileInput.value || '';
    }

    if (!turnstileToken) {
      showReviewError(
        isEn
          ? 'Please complete the security CAPTCHA check above before confirming your order.'
          : 'يرجى إكمال التحقق الأمني (CAPTCHA) أعلاه قبل تأكيد الطلب.'
      );
      return;
    }

    if (reviewSubmitError) {
      reviewSubmitError.textContent = '';
      reviewSubmitError.hidden = true;
    }

    isSubmitting = true;
    const originalBtnHtml = finalPlaceOrderBtn.innerHTML;
    finalPlaceOrderBtn.disabled = true;
    finalPlaceOrderBtn.textContent = isEn ? 'Placing your order...' : 'جاري تنفيذ الطلب...';
    if (savingTextLoader) {
      savingTextLoader.textContent = isEn
        ? 'Saving your invoice and confirming your order...'
        : 'جاري حفظ الفاتورة وتأكيد الطلب...';
    }

    let idToken: string | null = null;
    try {
      const auth = window.auth || (window.firebase?.auth ? window.firebase.auth() : null);
      const currentUser = auth?.currentUser || null;
      if (currentUser) {
        idToken = await currentUser.getIdToken();
      }
    } catch {
      // Optional customer binding only; guest checkout proceeds seamlessly
    }

    const payload = buildCreateOrderPayload({
      form: validation.sanitized,
      cart,
      idToken,
      turnstileToken,
    });

    try {
      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        try {
          window.turnstile?.reset();
        } catch {
          // Ignore
        }
        throw new Error(
          result.message ||
            (isEn
              ? 'Unable to place your order right now. Please try again.'
              : 'تعذر إتمام الطلب في الوقت الحالي. يرجى المحاولة مجدداً.')
        );
      }

      const generatedKey = String(result.orderId || '');
      const invoiceCode = String(result.invoiceCode || '');

      clearPersistedCart();

      let existingLookups: RecentLookupEntry[] = [];
      try {
        const parsed = JSON.parse(safeGetStorage('dandy_recent_lookups') || '[]');
        if (Array.isArray(parsed)) existingLookups = parsed;
      } catch {
        // Ignore
      }
      const nextLookups = upsertRecentLookup(existingLookups, invoiceCode, validation.sanitized.phone);
      try {
        localStorage.setItem('dandy_recent_lookups', JSON.stringify(nextLookups));
      } catch {
        // Ignore
      }

      const invBase = isEn ? '/en/invoice' : '/invoice';
      window.location.href = `${invBase}?id=${encodeURIComponent(generatedKey)}&invoice=${encodeURIComponent(invoiceCode)}`;
    } catch (err: any) {
      isSubmitting = false;
      try {
        window.turnstile?.reset();
      } catch {
        // Ignore
      }
      const message =
        err?.message ||
        (isEn
          ? 'A server connection error occurred. Please try again.'
          : 'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
      showReviewError(message);
      finalPlaceOrderBtn.disabled = false;
      finalPlaceOrderBtn.innerHTML = originalBtnHtml;
      if (savingTextLoader) {
        savingTextLoader.textContent = isEn
          ? 'Confirming your order records it securely and gives you an instant tracking code.'
          : 'تأكيد الطلب يسجله بأمان ويوفر لكِ كود تتبع فوري.';
      }
    }
  }

  function applySavedAddress(key: string): void {
    if (!key || !customerSavedAddresses[key]) return;
    const addr = customerSavedAddresses[key];
    const govInput = document.getElementById('f-gov') as HTMLSelectElement | null;
    const cityInput = document.getElementById('f-city') as HTMLInputElement | null;
    const addrInput = document.getElementById('f-address') as HTMLInputElement | null;

    if (govInput && addr.governorate) govInput.value = addr.governorate;
    if (cityInput && addr.city) cityInput.value = addr.city;
    if (addrInput && addr.address) addrInput.value = addr.address;

    clearFieldError('governorate');
    clearFieldError('city');
    clearFieldError('address');
    updateSummaryTotals();
  }

  function toggleAddressMode(mode: 'saved' | 'new'): void {
    const selectWrap = document.getElementById('savedSelectWrap');
    const govInput = document.getElementById('f-gov') as HTMLSelectElement | null;
    const cityInput = document.getElementById('f-city') as HTMLInputElement | null;
    const addrInput = document.getElementById('f-address') as HTMLInputElement | null;

    if (mode === 'saved') {
      if (selectWrap) selectWrap.style.display = 'block';
      const select = document.getElementById('savedAddressSelect') as HTMLSelectElement | null;
      if (select?.value) applySavedAddress(select.value);
    } else {
      if (selectWrap) selectWrap.style.display = 'none';
      if (govInput) govInput.value = '';
      if (cityInput) cityInput.value = '';
      if (addrInput) addrInput.value = '';
      updateSummaryTotals();
    }
  }

  function initCustomerCheckoutAddresses(): void {
    const auth = window.auth || (window.firebase?.auth ? window.firebase.auth() : null);
    const db = window.db || (window.firebase?.database ? window.firebase.database() : null);
    if (!auth || !db || typeof auth.onAuthStateChanged !== 'function') return;

    auth.onAuthStateChanged(async (user: any) => {
      const sec = document.getElementById('savedAddressesSection');
      if (!user) {
        if (sec) sec.style.display = 'none';
        return;
      }

      try {
        const snap = await db.ref(`customers/${user.uid}/addresses`).once('value');
        if (snap.exists()) {
          customerSavedAddresses = snap.val() || {};
          const keys = Object.keys(customerSavedAddresses);
          if (keys.length > 0) {
            const select = document.getElementById('savedAddressSelect') as HTMLSelectElement | null;
            if (sec) sec.style.display = 'block';
            if (select) {
              select.innerHTML = `<option value="">${isEn ? '-- Select a saved address --' : '-- اختاري عنواناً محفوظاً --'}</option>`;
              let defaultKey: string | null = null;
              keys.forEach((k) => {
                const addr = customerSavedAddresses[k];
                const govLabel = getGovernorateLabel(addr.governorate, locale);
                const opt = document.createElement('option');
                opt.value = k;
                const defaultTag = addr.isDefault ? (isEn ? ' ★ (Default)' : ' ★ (افتراضي)') : '';
                opt.textContent = `${addr.label || (isEn ? 'Address' : 'عنوان')} (${govLabel} - ${addr.city || ''})${defaultTag}`;
                select.appendChild(opt);
                if (addr.isDefault) defaultKey = k;
              });
              const targetKey = defaultKey || keys[0];
              select.value = targetKey;
              applySavedAddress(targetKey);
            }
          } else if (sec) {
            sec.style.display = 'none';
          }
        } else if (sec) {
          sec.style.display = 'none';
        }

        const custSnap = await db.ref(`customers/${user.uid}`).once('value');
        if (custSnap.exists()) {
          const cData = custSnap.val();
          const nameInput = document.getElementById('f-name') as HTMLInputElement | null;
          const phoneInput = document.getElementById('f-phone') as HTMLInputElement | null;
          const emailInput = document.getElementById('f-email') as HTMLInputElement | null;
          if (nameInput && !nameInput.value && cData.name) nameInput.value = cData.name;
          if (phoneInput && !phoneInput.value && cData.phone) phoneInput.value = cData.phone;
          if (emailInput && !emailInput.value && (cData.email || user.email)) {
            emailInput.value = cData.email || user.email;
          }
        }
      } catch (e) {
        console.warn('Could not load saved customer addresses:', e);
      }
    });
  }

  // Event bindings
  cartItemsList?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const qtyBtn = target.closest('[data-qty-action]') as HTMLButtonElement | null;
    if (qtyBtn) {
      const idx = Number.parseInt(qtyBtn.dataset.index || '-1', 10);
      const delta = qtyBtn.dataset.qtyAction === 'inc' ? 1 : -1;
      changeQty(idx, delta);
      return;
    }

    const removeBtn = target.closest('[data-remove-index]') as HTMLButtonElement | null;
    if (removeBtn) {
      const idx = Number.parseInt(removeBtn.dataset.removeIndex || '-1', 10);
      openRemoveDialog(idx, removeBtn);
    }
  });

  removeCancelBtn?.addEventListener('click', () => closeRemoveDialog());
  removeConfirmBtn?.addEventListener('click', () => {
    const idx = pendingRemoveIndex;
    closeRemoveDialog();
    if (idx !== null && idx >= 0) {
      performRemove(idx);
    }
  });
  removeDialog?.addEventListener('click', (event) => {
    if (event.target === removeDialog) {
      closeRemoveDialog();
    }
  });
  removeDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeRemoveDialog();
  });

  document.querySelectorAll('[data-step-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetStep = Number.parseInt((btn as HTMLElement).dataset.stepTarget || '1', 10);
      if (targetStep === 3 && currentStep < 3) {
        populateReviewAndAdvance();
      } else {
        goToStep(targetStep);
      }
    });
  });

  document.getElementById('btnProceedToShipping')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btnBackToCart')?.addEventListener('click', () => goToStep(1));
  document.getElementById('btnProceedToReview')?.addEventListener('click', populateReviewAndAdvance);
  document.getElementById('btnBackToShipping')?.addEventListener('click', () => goToStep(2));
  finalPlaceOrderBtn?.addEventListener('click', () => void submitFinalOrder());

  document.getElementById('f-gov')?.addEventListener('change', () => {
    clearFieldError('governorate');
    updateSummaryTotals();
  });

  const fieldBindingPairs: Array<[string, CheckoutFieldKey]> = [
    ['f-name', 'name'],
    ['f-phone', 'phone'],
    ['f-email', 'email'],
    ['f-city', 'city'],
    ['f-address', 'address'],
  ];
  fieldBindingPairs.forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', () => clearFieldError(key));
  });

  document.getElementById('addrModeSaved')?.addEventListener('change', () => toggleAddressMode('saved'));
  document.getElementById('addrModeNew')?.addEventListener('change', () => toggleAddressMode('new'));
  document.getElementById('savedAddressSelect')?.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    applySavedAddress(sel.value);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'cart' || event.key === 'dandy_cart') {
      cart = parseCartArrayFromStrings(safeGetStorage('cart'), safeGetStorage('dandy_cart'));
      reconcileCartWithCampaign();
      renderCartItems();
    }
  });

  // Expose compatibility shims
  window.goToStep = goToStep;
  window.validateAndGoToReview = populateReviewAndAdvance;
  window.submitFinalOrder = submitFinalOrder;
  window.changeQty = changeQty;
  window.removeItemFromCart = (idx: number) => openRemoveDialog(idx, null);
  window.handleGovChange = updateSummaryTotals;
  window.toggleAddressMode = toggleAddressMode;
  window.applySavedAddress = applySavedAddress;

  // Initialize
  reconcileCartWithCampaign();
  initCustomerCheckoutAddresses();
  renderCartItems();
}
