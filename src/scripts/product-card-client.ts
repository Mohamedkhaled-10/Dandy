/**
 * DANDY COSMETICS — CLIENT CART INTERACTION HANDLER FOR UNIFIED PRODUCT CARD
 * Single idempotent document-level click delegation so direct Add-to-Cart never double-fires.
 */
import { resolveClientLocalizedProductName } from '../i18n/content/en/products';
import { addDirectProductToCartArray, type CartAddPayload } from './product-card';

declare global {
  interface Window {
    __dandyProductCardDelegated?: boolean;
    updateSharedCartCount?: () => void;
    updateCartCount?: () => void;
    DandyMeta?: {
      trackAddToCart?: (item: Record<string, any>) => void;
    };
    fbq?: (...args: any[]) => void;
  }
}

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

function showCartToast(type: 'success' | 'error', message: string, locale: 'ar' | 'en'): void {
  const isEn = locale === 'en';
  if (typeof window !== 'undefined' && window.DandyToast && typeof window.DandyToast.show === 'function') {
    window.DandyToast.show({
      type,
      message,
      actionLabel: type === 'success' ? (isEn ? 'View Bag' : 'عرض السلة') : undefined,
      actionUrl: type === 'success' ? (isEn ? '/en/cart' : '/cart') : undefined,
      duration: type === 'success' ? 4200 : 5000,
    });
  }
}

export function handleDirectAddButton(button: HTMLElement): boolean {
  const locale = getRuntimeLocale();
  const isEn = locale === 'en';

  if (button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  const rawPayload = button.getAttribute('data-cart-payload');
  if (!rawPayload) {
    showCartToast(
      'error',
      isEn
        ? 'Unable to read product details. Please open the product page.'
        : 'تعذر قراءة بيانات المنتج، يرجى فتح صفحة المنتج.',
      locale
    );
    return false;
  }

  let payload: CartAddPayload;
  try {
    payload = JSON.parse(rawPayload) as CartAddPayload;
  } catch {
    showCartToast(
      'error',
      isEn ? 'Could not parse product details.' : 'حدث خطأ أثناء قراءة بيانات المنتج.',
      locale
    );
    return false;
  }

  if (!payload || !payload.id || !payload.name) {
    showCartToast(
      'error',
      isEn ? 'Product information is incomplete.' : 'بيانات المنتج غير مكتملة.',
      locale
    );
    return false;
  }

  try {
    const rawCart = window.localStorage.getItem('cart');
    const existingCart = rawCart ? JSON.parse(rawCart) : [];
    const nextCart = addDirectProductToCartArray(Array.isArray(existingCart) ? existingCart : [], payload);
    window.localStorage.setItem('cart', JSON.stringify(nextCart));

    // Meta Pixel tracking (preserved DandyMeta contract)
    if (window.DandyMeta && typeof window.DandyMeta.trackAddToCart === 'function') {
      window.DandyMeta.trackAddToCart(payload);
    } else if (typeof window.fbq === 'function') {
      window.fbq('track', 'AddToCart', {
        content_name: payload.name,
        content_ids: [payload.id],
        content_type: 'product',
        value: Number(payload.price) || 0,
        currency: 'EGP',
      });
    }

    // Update header + bottom nav cart counts
    if (typeof window.updateSharedCartCount === 'function') {
      window.updateSharedCartCount();
    }
    if (typeof window.updateCartCount === 'function') {
      window.updateCartCount();
    }
    window.dispatchEvent(new CustomEvent('cart-updated', { detail: { productId: payload.id } }));

    // Visual brief settled state on button
    const labelEl = button.querySelector('[data-btn-label]');
    const originalText = labelEl?.textContent || (isEn ? 'Add to Bag' : 'أضيفي للسلة');
    button.classList.add('is-added');
    if (labelEl) {
      labelEl.textContent = isEn ? 'Added' : 'تمت الإضافة';
    }
    window.setTimeout(() => {
      button.classList.remove('is-added');
      if (labelEl) {
        labelEl.textContent = originalText;
      }
    }, 1200);

    const displayName = resolveClientLocalizedProductName(
      payload.productId || payload.id,
      payload.name,
      locale
    );
    showCartToast(
      'success',
      isEn ? `Added “${displayName}” to your shopping bag.` : `تمت إضافة «${displayName}» إلى سلة التسوق.`,
      locale
    );
    return true;
  } catch {
    showCartToast(
      'error',
      isEn
        ? 'Could not save the product to your bag. Please check your browser settings.'
        : 'تعذر حفظ المنتج في السلة، تأكدي من إعدادات المتصفح.',
      locale
    );
    return false;
  }
}

export function initProductCardActions(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__dandyProductCardDelegated) return;
  window.__dandyProductCardDelegated = true;

  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const button = target.closest<HTMLElement>('[data-dandy-add-to-cart]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    handleDirectAddButton(button);
  });
}
