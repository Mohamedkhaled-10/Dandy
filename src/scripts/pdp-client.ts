/**
 * DANDY COSMETICS — CLIENT INTERACTIVE HYDRATION FOR PDP (PHASE 4)
 * Connects Gallery/Lightbox, Variant Swatches, Quantity Stepper, Multi-Scent Pricing,
 * Cart Persistence, DandyToast, Meta Pixel, Share Popover, and Auth-Safe Wishlist.
 */

import { resolveClientLocalizedProductName, resolveClientLocalizedVariantName } from '../i18n/content/en/products';
import { formatEgpPrice } from './product-card';
import {
  buildPdpCartPayload,
  computePdpEffectivePricing,
  mergePdpCartItem,
} from './product-pdp';
import type { Product } from '../utils/products';
import type { CampaignPricingResult } from '../utils/pink-friday-server';

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

interface BootstrapPayload {
  product: Product;
  canonicalUrl: string;
  pinkFridayPricing: CampaignPricingResult | null;
}

declare global {
  interface Window {
    toggleScentVariant?: (variantId: string) => void;
    selectScentVariant?: (variantId: string) => void;
    DandyPinkFriday?: {
      getPricing?: (product: Product) => CampaignPricingResult;
    };
    DandyMeta?: {
      trackViewContent?: (product: Record<string, any>) => void;
      trackAddToCart?: (item: Record<string, any>) => void;
    };
    auth?: any;
    db?: any;
  }
}

function showToast(
  type: 'success' | 'error' | 'info',
  message: string,
  actionLabel?: string,
  actionUrl?: string
): void {
  if (window.DandyToast && typeof window.DandyToast.show === 'function') {
    window.DandyToast.show({
      type,
      message,
      actionLabel,
      actionUrl,
      duration: type === 'error' ? 5000 : 4200,
    });
  }
}

function resolveLivePinkFridayPricing(
  product: Product,
  fallbackPricing: CampaignPricingResult | null
): CampaignPricingResult | null {
  try {
    if (window.DandyPinkFriday && typeof window.DandyPinkFriday.getPricing === 'function') {
      return window.DandyPinkFriday.getPricing(product);
    }
  } catch {
    // fallback to SSR pricing
  }
  return fallbackPricing;
}

export function initProductDetailPage(): void {
  const bootstrapEl = document.getElementById('pdp-bootstrap-data');
  if (!bootstrapEl || !bootstrapEl.textContent) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';

  let bootstrap: BootstrapPayload;
  try {
    bootstrap = JSON.parse(bootstrapEl.textContent) as BootstrapPayload;
  } catch {
    return;
  }

  const product = bootstrap.product;
  if (!product || !product.id) return;

  // 1. Meta Pixel ViewContent event
  try {
    if (window.DandyMeta && typeof window.DandyMeta.trackViewContent === 'function') {
      window.DandyMeta.trackViewContent(product);
    } else if (typeof window.fbq === 'function') {
      window.fbq('track', 'ViewContent', {
        content_name: product.name,
        content_ids: [product.id],
        content_type: 'product',
        value: Number(product.price) || 0,
        currency: 'EGP',
      });
    }
  } catch {
    // ignore tracking failures
  }

  // 2. Gallery thumbnails & accessible Lightbox dialog
  initGalleryAndLightbox();

  // 3. Variant Selection + Dynamic Pricing Update
  let selectedVariants: Array<{ id: string; name: string }> = [];
  const priceEl = document.getElementById('product-price');
  const oldPriceEl = document.getElementById('product-old-price');
  const discountNoteEl = document.getElementById('product-discount-note');
  const multiScentNoteEl = document.getElementById('multi-scent-price-note');
  const variantsSummaryEl = document.getElementById('selected-variants-summary');

  function syncVariantPricingUI(): void {
    const livePf = resolveLivePinkFridayPricing(product, bootstrap.pinkFridayPricing);
    const pricing = computePdpEffectivePricing(product, selectedVariants.length, livePf);

    if (priceEl) {
      priceEl.textContent = formatEgpPrice(pricing.effectiveUnitPrice, locale);
    }
    if (oldPriceEl) {
      if (pricing.effectiveOldPrice !== null) {
        oldPriceEl.textContent = formatEgpPrice(pricing.effectiveOldPrice, locale);
        oldPriceEl.hidden = false;
        oldPriceEl.setAttribute(
          'aria-label',
          isEn
            ? `Regular price ${formatEgpPrice(pricing.effectiveOldPrice, locale)}`
            : `السعر قبل الخصم ${formatEgpPrice(pricing.effectiveOldPrice, locale)}`
        );
      } else {
        oldPriceEl.hidden = true;
      }
    }
    if (discountNoteEl && pricing.savingsAmount !== null && !pricing.isPinkFriday) {
      discountNoteEl.textContent = isEn
        ? pricing.discountPercent
          ? `${pricing.discountPercent}% off · Save ${formatEgpPrice(pricing.savingsAmount, locale)}`
          : `Save ${formatEgpPrice(pricing.savingsAmount, locale)}`
        : pricing.discountPercent
          ? `خصم ${pricing.discountPercent}% · توفير ${formatEgpPrice(pricing.savingsAmount, locale)}`
          : `توفير ${formatEgpPrice(pricing.savingsAmount, locale)}`;
    }
    if (multiScentNoteEl) {
      if (selectedVariants.length > 1) {
        multiScentNoteEl.textContent = isEn
          ? `Total for ${selectedVariants.length} scents (${formatEgpPrice(pricing.unitBasePrice, locale)} each)`
          : `الإجمالي لعدد ${selectedVariants.length} روائح (سعر الرائحة الواحدة ${formatEgpPrice(pricing.unitBasePrice, locale)})`;
        multiScentNoteEl.hidden = false;
      } else {
        multiScentNoteEl.hidden = true;
        multiScentNoteEl.textContent = '';
      }
    }
    if (variantsSummaryEl) {
      if (selectedVariants.length > 0) {
        const namesText = selectedVariants
          .map((v) => resolveClientLocalizedVariantName(product.id, v.id, v.name, locale))
          .join(isEn ? ', ' : '، ');
        variantsSummaryEl.textContent = isEn ? `Selected: ${namesText}` : `المختار: ${namesText}`;
        variantsSummaryEl.classList.add('is-selected');
      } else {
        variantsSummaryEl.textContent = isEn ? 'Choose one or more scents' : 'يمكنكِ اختيار رائحة أو أكثر';
        variantsSummaryEl.classList.remove('is-selected');
      }
    }
  }

  window.toggleScentVariant = function (variantId: string): void {
    const btn = document.querySelector<HTMLButtonElement>(
      `.variant-pill-btn[data-id="${CSS.escape(String(variantId))}"]`
    );
    if (!btn || btn.disabled || btn.classList.contains('disabled')) return;

    const alreadySelected = btn.classList.contains('selected');
    if (alreadySelected) {
      btn.classList.remove('selected');
      btn.setAttribute('aria-pressed', 'false');
      selectedVariants = selectedVariants.filter((v) => v.id !== variantId);
    } else {
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
      const vName = btn.getAttribute('data-name') || variantId;
      selectedVariants.push({ id: variantId, name: vName });
    }
    syncVariantPricingUI();
  };
  window.selectScentVariant = window.toggleScentVariant;

  // 4. Quantity Stepper
  const qtyInput = document.getElementById('qty-input') as HTMLInputElement | null;
  const qtyMinus = document.getElementById('qty-minus') as HTMLButtonElement | null;
  const qtyPlus = document.getElementById('qty-plus') as HTMLButtonElement | null;

  function clampQty(raw: string | number): number {
    const parsed = parseInt(String(raw), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    if (parsed > 99) return 99;
    return parsed;
  }

  if (qtyInput && qtyMinus && qtyPlus) {
    qtyMinus.addEventListener('click', () => {
      const next = Math.max(1, clampQty(qtyInput.value) - 1);
      qtyInput.value = String(next);
    });
    qtyPlus.addEventListener('click', () => {
      const next = Math.min(99, clampQty(qtyInput.value) + 1);
      qtyInput.value = String(next);
    });
    qtyInput.addEventListener('change', () => {
      qtyInput.value = String(clampQty(qtyInput.value));
    });
  }

  // 5. Add to Cart with Loading/Settled Feedback & Toast
  const addBtn = document.getElementById('add-to-cart-btn') as HTMLButtonElement | null;
  let isAddCooldown = false;

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (isAddCooldown || addBtn.disabled) return;

      const qty = qtyInput ? clampQty(qtyInput.value) : 1;
      const livePf = resolveLivePinkFridayPricing(product, bootstrap.pinkFridayPricing);
      const built = buildPdpCartPayload({
        product,
        selectedVariants,
        quantity: qty,
        pinkFridayPricing: livePf,
        locale,
      });

      if (!built.ok || !built.item) {
        showToast(
          'error',
          built.errorMessage || (isEn ? 'Could not add product to bag.' : 'تعذر إضافة المنتج للسلة.')
        );
        if (built.errorReason === 'missing_variant') {
          const variantSection = document.getElementById('variant-section-container');
          variantSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const firstAvailBtn = variantSection?.querySelector<HTMLButtonElement>(
            '.variant-pill-btn:not(:disabled)'
          );
          firstAvailBtn?.focus({ preventScroll: true });
        }
        return;
      }

      isAddCooldown = true;
      try {
        const rawCart = window.localStorage.getItem('cart');
        const existingCart = rawCart ? JSON.parse(rawCart) : [];
        const nextCart = mergePdpCartItem(Array.isArray(existingCart) ? existingCart : [], built.item);
        window.localStorage.setItem('cart', JSON.stringify(nextCart));

        if (window.DandyMeta && typeof window.DandyMeta.trackAddToCart === 'function') {
          window.DandyMeta.trackAddToCart(built.item);
        } else if (typeof window.fbq === 'function') {
          window.fbq('track', 'AddToCart', {
            content_name: product.name,
            content_ids: [product.id],
            content_type: 'product',
            value: (Number(built.item.price) || 0) * qty,
            currency: 'EGP',
          });
        }

        if (typeof window.updateSharedCartCount === 'function') {
          window.updateSharedCartCount();
        }
        if (typeof window.updateCartCount === 'function') {
          window.updateCartCount();
        }
        window.dispatchEvent(new CustomEvent('cart-updated', { detail: { productId: product.id } }));

        const labelEl = addBtn.querySelector<HTMLElement>('[data-add-label]');
        const defaultLabel = labelEl?.textContent || (isEn ? 'Add to Bag' : 'أضيفي للسلة');
        addBtn.classList.add('is-added');
        if (labelEl) labelEl.textContent = isEn ? 'Added to Bag' : 'تمت الإضافة للسلة';

        const displayName = resolveClientLocalizedProductName(product.id, product.name, locale);
        const displayVariantText =
          Array.isArray(built.item.selectedVariants) && built.item.selectedVariants.length > 0
            ? built.item.selectedVariants
                .map((sv: any) => resolveClientLocalizedVariantName(product.id, sv.id, sv.name, locale))
                .join(isEn ? ', ' : '، ')
            : built.item.variantName
              ? resolveClientLocalizedVariantName(product.id, built.item.variantId, built.item.variantName, locale)
              : '';
        const variantSuffix = displayVariantText ? ` (${displayVariantText})` : '';
        showToast(
          'success',
          isEn
            ? `Added “${displayName}${variantSuffix}” to your shopping bag.`
            : `تمت إضافة «${displayName}${variantSuffix}» إلى سلة التسوق.`,
          isEn ? 'View Bag' : 'عرض السلة',
          isEn ? '/en/cart' : '/cart'
        );

        window.setTimeout(() => {
          addBtn.classList.remove('is-added');
          if (labelEl) labelEl.textContent = defaultLabel;
          isAddCooldown = false;
        }, 1200);
      } catch {
        isAddCooldown = false;
        showToast(
          'error',
          isEn
            ? 'Could not save the product to your bag. Please check browser settings.'
            : 'تعذر حفظ المنتج في السلة، تأكدي من إعدادات المتصفح.'
        );
      }
    });
  }

  // 6. Share Popover & Copy Link
  initShareControls(bootstrap.canonicalUrl, locale);

  // 7. Auth-safe Wishlist Controls (no window.alert fallback)
  initWishlistControls(product.id, locale);
}

function initGalleryAndLightbox(): void {
  const mainImg = document.getElementById('product-img') as HTMLImageElement | null;
  const zoomBtn = document.getElementById('gallery-zoom-btn') as HTMLButtonElement | null;
  const stageEl = document.getElementById('pdp-gallery-stage');
  const dialog = document.getElementById('pdp-lightbox-dialog') as HTMLDialogElement | null;
  const dialogImg = document.getElementById('pdp-lightbox-img') as HTMLImageElement | null;
  const dialogCaption = document.getElementById('pdp-lightbox-caption');
  const dialogClose = document.getElementById('pdp-lightbox-close') as HTMLButtonElement | null;
  const prevBtn = document.getElementById('pdp-lightbox-prev') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('pdp-lightbox-next') as HTMLButtonElement | null;
  const thumbBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-gallery-thumb]'));

  let galleryImages: Array<{ zoomUrl: string; alt: string }> = [];
  if (dialog?.dataset.images) {
    try {
      galleryImages = JSON.parse(dialog.dataset.images);
    } catch {
      galleryImages = [];
    }
  }

  let activeIndex = 0;
  let lastTrigger: HTMLElement | null = null;

  function renderLightboxSlide(idx: number): void {
    if (!dialogImg || galleryImages.length === 0) return;
    const normalized = ((idx % galleryImages.length) + galleryImages.length) % galleryImages.length;
    activeIndex = normalized;
    const slide = galleryImages[normalized];
    dialogImg.src = slide.zoomUrl;
    dialogImg.alt = slide.alt;
    if (dialogCaption) dialogCaption.textContent = slide.alt;
  }

  function openLightbox(triggerEl?: HTMLElement | null): void {
    if (!dialog || stageEl?.classList.contains('is-fallback')) return;
    lastTrigger = triggerEl || zoomBtn || null;
    const currentIdx = Number(mainImg?.getAttribute('data-active-index')) || 0;
    renderLightboxSlide(currentIdx);
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', 'true');
    }
    dialogClose?.focus();
  }

  function closeLightbox(): void {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      lastTrigger.focus();
    }
  }

  thumbBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index) || 0;
      const stageSrc = btn.dataset.stageSrc;
      const zoomSrc = btn.dataset.zoomSrc;
      const alt = btn.dataset.alt || '';
      if (mainImg && stageSrc) {
        mainImg.src = stageSrc;
        mainImg.alt = alt;
        mainImg.setAttribute('data-active-index', String(idx));
      }
      if (zoomBtn && zoomSrc) {
        zoomBtn.setAttribute('data-zoom-src', zoomSrc);
        zoomBtn.setAttribute('data-zoom-alt', alt);
      }
      thumbBtns.forEach((t) => {
        const isTarget = t === btn;
        t.classList.toggle('is-active', isTarget);
        t.setAttribute('aria-current', isTarget ? 'true' : 'false');
      });
    });
  });

  if (zoomBtn) {
    zoomBtn.addEventListener('click', () => openLightbox(zoomBtn));
  }
  if (mainImg) {
    mainImg.addEventListener('click', () => openLightbox(zoomBtn || mainImg));
  }
  if (dialogClose) {
    dialogClose.addEventListener('click', closeLightbox);
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', () => renderLightboxSlide(activeIndex - 1));
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => renderLightboxSlide(activeIndex + 1));
  }
  if (dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeLightbox();
      }
    });
    dialog.addEventListener('close', () => {
      if (lastTrigger && typeof lastTrigger.focus === 'function') {
        lastTrigger.focus();
      }
    });
    dialog.addEventListener('keydown', (event) => {
      if (galleryImages.length <= 1) return;
      if (event.key === 'ArrowLeft') renderLightboxSlide(activeIndex + 1);
      if (event.key === 'ArrowRight') renderLightboxSlide(activeIndex - 1);
    });
  }
}

function initShareControls(canonicalUrl: string, locale: 'ar' | 'en'): void {
  const isEn = locale === 'en';
  const shareToggle = document.getElementById('share-toggle') as HTMLButtonElement | null;
  const shareMenu = document.getElementById('share-popover-menu');
  const copyBtn = document.getElementById('copy-product-link') as HTMLButtonElement | null;

  if (shareToggle && shareMenu) {
    const closeShare = (): void => {
      shareMenu.hidden = true;
      shareToggle.setAttribute('aria-expanded', 'false');
    };

    shareToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = shareMenu.hidden;
      shareMenu.hidden = !willOpen;
      shareToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      const target = event.target as Node | null;
      if (!shareMenu.hidden && target && !shareMenu.contains(target) && target !== shareToggle) {
        closeShare();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !shareMenu.hidden) {
        closeShare();
        shareToggle.focus();
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const urlToCopy = copyBtn.dataset.copyUrl || canonicalUrl || window.location.href;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(urlToCopy);
        } else {
          const tempInput = document.createElement('input');
          tempInput.value = urlToCopy;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          tempInput.remove();
        }
        showToast('success', isEn ? 'Product link copied.' : 'تم نسخ رابط المستحضر بنجاح.');
      } catch {
        showToast('error', isEn ? 'Could not copy the link automatically.' : 'تعذر نسخ الرابط تلقائياً.');
      } finally {
        if (shareMenu && shareToggle) {
          shareMenu.hidden = true;
          shareToggle.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }
}

function initWishlistControls(productId: string, locale: 'ar' | 'en'): void {
  const isEn = locale === 'en';
  const detailBtn = document.getElementById('detailWishlistBtn') as HTMLButtonElement | null;
  const actionBtn = document.getElementById('actionWishlistBtn') as HTMLButtonElement | null;
  const actionText = document.getElementById('actionWishlistText');

  let isFav = false;
  let wishlistSet = new Set<string>();

  function updateWishlistUI(fav: boolean): void {
    isFav = fav;
    if (detailBtn) {
      detailBtn.classList.toggle('active', fav);
      detailBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
      detailBtn.setAttribute(
        'aria-label',
        isEn ? (fav ? 'Remove from wishlist' : 'Save to wishlist') : fav ? 'إزالة من المفضلة' : 'حفظ في المفضلة'
      );
    }
    if (actionBtn) {
      actionBtn.classList.toggle('active', fav);
      actionBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
      if (actionText) {
        actionText.textContent = isEn
          ? fav
            ? 'Saved in Wishlist'
            : 'Add to Wishlist'
          : fav
            ? 'في قائمة المفضلة'
            : 'إضافة إلى المفضلة';
      }
    }
  }

  async function handleToggle(): Promise<void> {
    const auth = window.auth;
    const db = window.db;
    const user = auth?.currentUser;

    if (!auth || !user || !db) {
      showToast(
        'info',
        isEn ? 'Sign in to save products to your wishlist.' : 'سجّلي دخولك لحفظ المستحضرات في قائمة المفضلة.',
        isEn ? 'Sign In' : 'تسجيل الدخول',
        isEn ? '/en/account-login' : '/account-login'
      );
      return;
    }

    try {
      const ref = db.ref(`wishlists/${user.uid}/${productId}`);
      if (isFav) {
        await ref.remove();
        wishlistSet.delete(productId);
        updateWishlistUI(false);
        showToast('info', isEn ? 'Removed from your wishlist.' : 'تمت إزالة المستحضر من المفضلة.');
      } else {
        await ref.set(true);
        wishlistSet.add(productId);
        updateWishlistUI(true);
        showToast('success', isEn ? 'Added to your wishlist.' : 'تمت إضافة المستحضر إلى قائمة المفضلة.');
      }
    } catch {
      showToast('error', isEn ? 'Unable to update wishlist right now.' : 'تعذر تحديث قائمة المفضلة حالياً.');
    }
  }

  if (detailBtn) detailBtn.addEventListener('click', handleToggle);
  if (actionBtn) actionBtn.addEventListener('click', handleToggle);

  const auth = window.auth;
  const db = window.db;
  if (auth && db && typeof auth.onAuthStateChanged === 'function') {
    auth.onAuthStateChanged(async (user: any) => {
      if (!user) {
        wishlistSet.clear();
        updateWishlistUI(false);
        return;
      }
      try {
        const snap = await db.ref(`wishlists/${user.uid}`).once('value');
        if (snap.exists()) {
          const val = snap.val() || {};
          wishlistSet = new Set(Object.keys(val).filter((k) => Boolean(val[k])));
          updateWishlistUI(wishlistSet.has(productId));
        } else {
          updateWishlistUI(false);
        }
      } catch {
        // Ignore silent wishlist sync errors
      }
    });
  }
}
