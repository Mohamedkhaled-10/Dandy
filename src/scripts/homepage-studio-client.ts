/**
 * DANDY COSMETICS — HOMEPAGE CLIENT INTERACTIVITY & ADMIN STUDIO LIVE BRIDGE
 * Handles Hero carousel controls, FAQ accordion toggling, and full Admin Studio
 * postMessage synchronization (`STUDIO_PREVIEW_READY`, `STUDIO_SECTION_CLICKED`,
 * `STUDIO_UPDATE_STATE`, `STUDIO_SELECT_SECTION`, `STUDIO_SET_MODE`, `STUDIO_RELOAD`).
 */

import { EN_HOMEPAGE_STUDIO_OVERLAY } from '../i18n/content/en/homepage-studio';
import { resolveLocalizedHomepageStudioState } from '../i18n/content/adapters';
import type { Product } from '../utils/products';
import type { CampaignPricingResult } from '../utils/pink-friday-server';
import { getIconSvg } from './icons';
import {
  FALLBACK_PRODUCT_IMAGE,
  formatEgpPrice,
  resolveProductCardViewModel,
} from './product-card';
import {
  DEFAULT_HERO_SLIDE,
  DEFAULT_HERO_SLIDE_EN,
  DEFAULT_PROMO_BANNER,
  localizeInternalStoreHref,
  mergeStudioPreviewState,
  resolveCategoriesForShowcase,
  resolveDynamicProductSection,
  resolveHeroSlides,
  resolveOrderedHomepageEntries,
  resolvePromoBanner,
  resolveTrustItems,
  resolveVideoMedia,
  sanitizeMediaUrl,
  sanitizeNavHref,
  selectProductsForStudioSection,
  type CustomSection,
  type HomepageStudioState,
} from './homepage-studio';

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

interface StudioBootstrapPayload {
  state: HomepageStudioState;
  products: Product[];
  pinkFridayPricingMap?: Record<string, CampaignPricingResult | null>;
  showPinkFriday?: boolean;
}

const SECTION_LABELS_AR: Record<string, string> = {
  hero: 'بانر الهيرو الرئيسي',
  trust: 'شريط المزايا والثقة',
  offers: 'العروض الخاصة',
  categories: 'التصنيفات والمجموعات',
  promo: 'البانر الترويجي التحريري',
  newArrivals: 'أحدث المنتجات',
  blog: 'مدونة العناية والجمال',
  reviews: 'آراء وتجارب العميلات',
  'pink-friday': 'حملة Pink Friday',
};

const SECTION_LABELS_EN: Record<string, string> = {
  hero: 'Hero Banner',
  trust: 'Trust Highlights',
  offers: 'Special Offers',
  categories: 'Shop by Category',
  promo: 'Editorial Promo Banner',
  newArrivals: 'New Arrivals',
  blog: 'Beauty & Care Journal',
  reviews: 'Customer Reviews',
  'pink-friday': 'Pink Friday Campaign',
};

let heroTimer: number | null = null;
let currentHeroIndex = 0;
let currentMode: 'edit' | 'preview' = 'edit';
let activeSelectedSectionId = 'hero';
let studioBootstrap: StudioBootstrapPayload | null = null;
let currentState: HomepageStudioState | null = null;
let initialized = false;

function escapeHtml(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clearHeroTimer(): void {
  if (heroTimer !== null) {
    window.clearTimeout(heroTimer);
    heroTimer = null;
  }
}

function applyHeroSlideActive(carousel: HTMLElement, nextIndex: number): void {
  const slides = Array.from(carousel.querySelectorAll<HTMLElement>('[data-hero-slide]'));
  const dots = Array.from(carousel.querySelectorAll<HTMLElement>('[data-hero-dot]'));
  if (slides.length === 0) return;

  const safeIndex = ((nextIndex % slides.length) + slides.length) % slides.length;
  currentHeroIndex = safeIndex;
  carousel.setAttribute('data-active-index', String(safeIndex));

  slides.forEach((slideEl, idx) => {
    const isActive = idx === safeIndex;
    slideEl.classList.toggle('is-active', isActive);
    slideEl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  dots.forEach((dotEl, idx) => {
    const isActive = idx === safeIndex;
    dotEl.classList.toggle('is-active', isActive);
    dotEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Sync hero copy & primary CTA if slide declares copy
  const activeSlideEl = slides[safeIndex];
  const heroSection = carousel.closest('[data-studio-section="hero"]');
  if (heroSection && activeSlideEl) {
    const nextTitle = activeSlideEl.getAttribute('data-title');
    const nextSub = activeSlideEl.getAttribute('data-subtitle');
    const nextBtn = activeSlideEl.getAttribute('data-button-text');
    const nextLink = activeSlideEl.getAttribute('data-link');

    const titleEl = heroSection.querySelector<HTMLElement>('[data-hero-title]');
    const subEl = heroSection.querySelector<HTMLElement>('[data-hero-subtitle]');
    const ctaEl = heroSection.querySelector<HTMLAnchorElement>('[data-hero-cta]');
    const ctaLabelEl = heroSection.querySelector<HTMLElement>('[data-hero-cta-label]');

    if (titleEl && nextTitle) titleEl.textContent = nextTitle;
    if (subEl && nextSub) subEl.textContent = nextSub;
    if (ctaLabelEl && nextBtn) ctaLabelEl.textContent = nextBtn;
    if (ctaEl && nextLink) ctaEl.setAttribute('href', nextLink);
  }
}

function scheduleHeroRotation(): void {
  clearHeroTimer();
  const carousel = document.querySelector<HTMLElement>('[data-hero-carousel]');
  if (!carousel) return;
  const slides = carousel.querySelectorAll<HTMLElement>('[data-hero-slide]');
  if (slides.length <= 1) return;

  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  const activeSlide = slides[currentHeroIndex] || slides[0];
  const durationSec = Math.max(2, Math.min(60, Number(activeSlide?.getAttribute('data-duration')) || 5));

  heroTimer = window.setTimeout(() => {
    applyHeroSlideActive(carousel, currentHeroIndex + 1);
    scheduleHeroRotation();
  }, durationSec * 1000);
}

function syncHeroResponsiveAssets(): void {
  if (typeof window === 'undefined' || window.innerWidth >= 768) return;
  const imgs = document.querySelectorAll<HTMLImageElement>('.dandy-hero-img[data-mobile-src]');
  imgs.forEach((img) => {
    const mobileSrc = img.getAttribute('data-mobile-src') || '';
    const desktopSrc = img.getAttribute('data-desktop-src') || '';
    if (!mobileSrc || mobileSrc === desktopSrc) return;
    if (img.dataset.mobileProbed === '1') return;
    img.dataset.mobileProbed = '1';

    const probe = new Image();
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      // Adopt genuine landscape/wide mobile assets seamlessly; keep desktopImage when mobileImage is tall vertical flyer
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0 && probe.naturalWidth / probe.naturalHeight >= 1.1) {
        if (window.innerWidth < 768) {
          img.src = mobileSrc;
        }
      }
    };
    probe.src = mobileSrc;
  });
}

function initHeroControls(): void {
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const carousel = target.closest<HTMLElement>('[data-hero-carousel]');
    if (!carousel) return;

    if (target.closest('[data-hero-prev]')) {
      event.preventDefault();
      applyHeroSlideActive(carousel, currentHeroIndex - 1);
      scheduleHeroRotation();
    } else if (target.closest('[data-hero-next]')) {
      event.preventDefault();
      applyHeroSlideActive(carousel, currentHeroIndex + 1);
      scheduleHeroRotation();
    } else {
      const dot = target.closest<HTMLElement>('[data-hero-dot]');
      if (dot) {
        event.preventDefault();
        const idx = Number(dot.getAttribute('data-hero-dot'));
        if (Number.isFinite(idx)) {
          applyHeroSlideActive(carousel, idx);
          scheduleHeroRotation();
        }
      }
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchTracking = false;

  document.addEventListener(
    'touchstart',
    (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchTracking = false;
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-hero-slides]')) {
        touchTracking = false;
        return;
      }
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchTracking = true;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    (event: TouchEvent) => {
      if (!touchTracking || event.changedTouches.length === 0) return;
      touchTracking = false;
      const target = event.target as HTMLElement | null;
      const carousel = target?.closest<HTMLElement>('[data-hero-carousel]');
      if (!carousel) return;
      const slideCount = Number(carousel.getAttribute('data-slide-count') || '1');
      if (slideCount <= 1) return;

      const dx = event.changedTouches[0].clientX - touchStartX;
      const dy = event.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      const step = isRtl ? (dx > 0 ? 1 : -1) : (dx < 0 ? 1 : -1);
      applyHeroSlideActive(carousel, currentHeroIndex + step);
      scheduleHeroRotation();
    },
    { passive: true }
  );

  syncHeroResponsiveAssets();
  window.addEventListener('resize', () => syncHeroResponsiveAssets(), { passive: true });
  scheduleHeroRotation();
}

function initFaqDelegation(): void {
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const trigger = target?.closest<HTMLButtonElement>('[data-faq-trigger]');
    if (!trigger) return;

    const item = trigger.closest('.dandy-faq-item');
    const panel = item?.querySelector<HTMLElement>('[data-faq-panel]');
    if (!panel) return;

    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    if (expanded) {
      panel.setAttribute('hidden', '');
    } else {
      panel.removeAttribute('hidden');
    }
  });
}

function renderProductCardHtml(
  product: Product,
  pinkFridayPricing?: CampaignPricingResult | null
): string {
  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const vm = resolveProductCardViewModel(product, pinkFridayPricing, locale);
  const tagHtml = vm.badge
    ? `<span class="dandy-pcard-tag is-${vm.badge.tone}">${escapeHtml(vm.badge.text)}</span>`
    : '';
  const ratingHtml =
    vm.shouldShowRating && vm.ratingValue
      ? `<span class="dandy-pcard-rating" aria-label="${escapeHtml(
          isEn
            ? `Rated ${vm.ratingValue} out of 5 based on ${vm.reviewCount} reviews`
            : `تقييم ${vm.ratingValue} من 5 بناءً على ${vm.reviewCount} تقييم`
        )}">
           <span aria-hidden="true" class="dandy-pcard-sep">·</span>
           ${getIconSvg('star', { size: 12, strokeWidth: 2, className: 'dandy-pcard-star' })}
           <span class="dandy-tabular">${escapeHtml(vm.ratingValue)}</span>
           <span class="dandy-pcard-reviews dandy-tabular">(${vm.reviewCount})</span>
         </span>`
      : '';

  const oldPriceHtml =
    vm.oldPrice !== null
      ? `<del class="dandy-pcard-old-price dandy-tabular">${escapeHtml(formatEgpPrice(vm.oldPrice, locale))}</del>`
      : '';

  let actionHtml = '';
  if (vm.isSoldOut) {
    actionHtml = `<button type="button" class="dandy-pcard-btn is-soldout" disabled aria-disabled="true"><span>${escapeHtml(vm.ctaLabel)}</span></button>`;
  } else if (vm.requiresVariantSelection) {
    actionHtml = `<a href="${escapeHtml(vm.href)}" class="dandy-pcard-btn is-variant">${getIconSvg('sliders', { size: 15, strokeWidth: 1.8 })}<span>${escapeHtml(vm.ctaLabel)}</span></a>`;
  } else {
    actionHtml = `<button type="button" class="dandy-pcard-btn is-add" data-dandy-add-to-cart data-cart-payload="${escapeHtml(JSON.stringify(vm.cartPayload))}">${getIconSvg('shopping-bag', { size: 15, strokeWidth: 1.8 })}<span data-btn-label>${escapeHtml(vm.ctaLabel)}</span></button>`;
  }

  const catHref = localizeInternalStoreHref(`/category/${vm.categorySlug}`, locale);

  return `
    <article
      class="dandy-pcard${vm.isSoldOut ? ' is-sold-out' : ''}${vm.isPinkFriday ? ' is-pink-friday' : ''}"
      data-product-id="${escapeHtml(vm.id)}"
      data-category="${escapeHtml(vm.categorySlug)}"
      data-price="${vm.currentPrice}"
      data-sold-out="${vm.isSoldOut ? 'true' : 'false'}"
    >
      <div class="dandy-pcard-stage${vm.isFallbackImage ? ' is-fallback' : ''}">
        ${tagHtml}
        <img
          src="${escapeHtml(vm.imageUrl)}"
          alt="${escapeHtml(vm.name)}"
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          class="dandy-pcard-img"
          onerror="this.onerror=null;this.src='${FALLBACK_PRODUCT_IMAGE}';this.closest('.dandy-pcard-stage')?.classList.add('is-fallback');"
        />
      </div>
      <div class="dandy-pcard-body">
        <div class="dandy-pcard-meta">
          <a href="${escapeHtml(catHref)}" class="dandy-pcard-category">${escapeHtml(vm.categoryLabelAr)}</a>
          ${ratingHtml}
        </div>
        <h3 class="dandy-pcard-title"><a href="${escapeHtml(vm.href)}" class="dandy-pcard-link">${escapeHtml(vm.name)}</a></h3>
        <div class="dandy-pcard-price-row">
          <span class="dandy-pcard-price dandy-tabular">${escapeHtml(formatEgpPrice(vm.currentPrice, locale))}</span>
          ${oldPriceHtml}
        </div>
        <div class="dandy-pcard-actions">${actionHtml}</div>
      </div>
    </article>
  `;
}

function updateHeroDom(state: HomepageStudioState): void {
  const heroSec = document.querySelector<HTMLElement>('[data-studio-section="hero"]');
  if (!heroSec) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const slides = resolveHeroSlides(state.hero, locale);
  const first = slides[0];
  const fallbackSlideImg = (isEn ? DEFAULT_HERO_SLIDE_EN : DEFAULT_HERO_SLIDE).desktopImage;
  const carousel = heroSec.querySelector<HTMLElement>('[data-hero-carousel]');
  const slidesContainer = heroSec.querySelector<HTMLElement>('[data-hero-slides]');
  const dotsContainer = heroSec.querySelector<HTMLElement>('[data-hero-dots]');
  const controlsContainer = heroSec.querySelector<HTMLElement>('[data-hero-controls]');

  if (slidesContainer) {
    slidesContainer.innerHTML = slides
      .map(
        (slide, idx) => `
          <figure
            class="dandy-hero-frame${idx === 0 ? ' is-active' : ''}"
            data-hero-slide="${idx}"
            data-duration="${slide.durationSeconds}"
            data-title="${escapeHtml(slide.title)}"
            data-subtitle="${escapeHtml(slide.subtitle)}"
            data-button-text="${escapeHtml(slide.buttonText)}"
            data-link="${escapeHtml(slide.link)}"
            aria-hidden="${idx === 0 ? 'false' : 'true'}"
          >
            <img
              src="${escapeHtml(slide.desktopImage)}"
              data-desktop-src="${escapeHtml(slide.desktopImage)}"
              data-mobile-src="${escapeHtml(slide.mobileImage || '')}"
              alt="${escapeHtml(slide.title)}"
              width="1376"
              height="768"
              loading="${idx === 0 ? 'eager' : 'lazy'}"
              decoding="async"
              referrerpolicy="no-referrer"
              class="dandy-hero-img"
              onerror="this.onerror=null;this.src='${fallbackSlideImg}';"
            />
          </figure>
        `
      )
      .join('');
    syncHeroResponsiveAssets();
  }

  if (dotsContainer) {
    dotsContainer.innerHTML = slides
      .map(
        (_, idx) =>
          `<button type="button" role="tab" class="dandy-hero-dot${idx === 0 ? ' is-active' : ''}" data-hero-dot="${idx}" aria-selected="${idx === 0 ? 'true' : 'false'}" aria-label="${escapeHtml(isEn ? `Slide ${idx + 1}` : `الشريحة رقم ${idx + 1}`)}"></button>`
      )
      .join('');
  }

  if (controlsContainer) {
    if (slides.length > 1) {
      controlsContainer.removeAttribute('hidden');
    } else {
      controlsContainer.setAttribute('hidden', '');
    }
  }

  if (carousel) {
    carousel.setAttribute('data-slide-count', String(slides.length));
    applyHeroSlideActive(carousel, 0);
  } else {
    const titleEl = heroSec.querySelector<HTMLElement>('[data-hero-title]');
    const subEl = heroSec.querySelector<HTMLElement>('[data-hero-subtitle]');
    const ctaEl = heroSec.querySelector<HTMLAnchorElement>('[data-hero-cta]');
    const ctaLabelEl = heroSec.querySelector<HTMLElement>('[data-hero-cta-label]');
    if (titleEl) titleEl.textContent = first.title;
    if (subEl) subEl.textContent = first.subtitle;
    if (ctaLabelEl) ctaLabelEl.textContent = first.buttonText;
    if (ctaEl) ctaEl.setAttribute('href', first.link);
  }

  scheduleHeroRotation();
}

function updateTrustDom(state: HomepageStudioState): void {
  const sec = document.querySelector<HTMLElement>('[data-studio-section="trust"]');
  if (!sec) return;
  const grid = sec.querySelector<HTMLElement>('[data-trust-grid]');
  if (!grid) return;

  const locale = getRuntimeLocale();
  const items = resolveTrustItems(state.trust, undefined, locale);
  const cols = items.length === 2 ? 2 : items.length >= 4 ? 4 : 3;
  grid.className = `dandy-trust-grid dandy-trust-cols-${cols}`;
  grid.innerHTML = items
    .map(
      (item) => `
        <article class="dandy-trust-item">
          <div class="dandy-trust-icon-box" aria-hidden="true">
            ${getIconSvg(item.iconName, { size: 20, strokeWidth: 1.75 })}
          </div>
          <div class="dandy-trust-copy">
            <h3 class="dandy-trust-title" dir="auto">${escapeHtml(item.title)}</h3>
            ${item.desc ? `<p class="dandy-trust-desc" dir="auto">${escapeHtml(item.desc)}</p>` : ''}
          </div>
        </article>
      `
    )
    .join('');
}

function updateCategoriesDom(state: HomepageStudioState): void {
  const sec = document.querySelector<HTMLElement>('[data-studio-section="categories"]');
  if (!sec) return;
  const grid = sec.querySelector<HTMLElement>('[data-categories-grid]');
  if (!grid) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const categories = resolveCategoriesForShowcase(state.categories, locale);
  const fallbackCatImg = '/assets/images/index-products/product-2.jpg';

  grid.innerHTML = categories
    .map((cat) => {
      const metaParts = [cat.tagline, cat.count].filter(Boolean);
      return `
        <a href="${escapeHtml(cat.href)}" class="dandy-cat-card dandy-cat-variant-${cat.layoutVariant}">
          <div class="dandy-cat-media">
            <picture>
              ${cat.mobileImage ? `<source media="(max-width: 767px)" srcset="${escapeHtml(cat.mobileImage)}" />` : ''}
              <img
                src="${escapeHtml(cat.desktopImage || fallbackCatImg)}"
                alt="${escapeHtml(cat.name)} — Dandy Cosmetics"
                width="600"
                height="450"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                class="dandy-cat-img"
                onerror="this.onerror=null;this.src='${fallbackCatImg}';"
              />
            </picture>
          </div>
          <div class="dandy-cat-body">
            <div class="dandy-cat-title-row">
              <h3 class="dandy-cat-title" dir="auto">${escapeHtml(cat.name)}</h3>
              ${cat.englishName && cat.englishName !== cat.name ? `<span class="dandy-cat-en" dir="ltr">${escapeHtml(cat.englishName)}</span>` : ''}
            </div>
            ${metaParts.length > 0 ? `<p class="dandy-cat-meta-line" dir="auto">${metaParts.map((p) => `<span dir="auto">${escapeHtml(p)}</span>`).join(' · ')}</p>` : ''}
            <p class="dandy-cat-desc">${escapeHtml(cat.description)}</p>
            <span class="dandy-cat-link">
              <span>${isEn ? 'Explore Category' : 'تصفحي القسم'}</span>
              ${getIconSvg(isEn ? 'chevron-right' : 'chevron-left', { size: 14, strokeWidth: 2 })}
            </span>
          </div>
        </a>
      `;
    })
    .join('');
}

function updateDynamicProductSectionDom(
  state: HomepageStudioState,
  secKey: 'offers' | 'newArrivals',
  bootstrap: StudioBootstrapPayload | null
): void {
  const sec = document.querySelector<HTMLElement>(`[data-studio-section="${secKey}"]`);
  if (!sec) return;

  const locale = getRuntimeLocale();
  const cfg = resolveDynamicProductSection(state, secKey, locale);
  const titleEl = sec.querySelector<HTMLElement>('[data-sec-title]');
  const subEl = sec.querySelector<HTMLElement>('[data-sec-subtitle]');
  const moreLinkEl = sec.querySelector<HTMLAnchorElement>('[data-sec-more-link]');
  const moreLabelEl = sec.querySelector<HTMLElement>('[data-sec-more-label]');
  const gridEl = sec.querySelector<HTMLElement>('[data-products-grid]');
  const emptyEl = sec.querySelector<HTMLElement>('[data-products-empty]');

  if (titleEl) titleEl.textContent = cfg.title;
  if (subEl) subEl.textContent = cfg.subtitle;
  if (moreLinkEl) moreLinkEl.setAttribute('href', cfg.viewAllHref);
  if (moreLabelEl) moreLabelEl.textContent = cfg.viewAllLabel;

  if (bootstrap && Array.isArray(bootstrap.products) && gridEl) {
    const prods = selectProductsForStudioSection(bootstrap.products, {
      source: cfg.type,
      manualProducts: cfg.manualProducts,
      limit: cfg.limit,
    });
    const pfMap = bootstrap.pinkFridayPricingMap || {};
    gridEl.innerHTML = prods.map((p) => renderProductCardHtml(p, pfMap[p.id] || null)).join('');
    if (prods.length > 0) {
      gridEl.removeAttribute('hidden');
      emptyEl?.setAttribute('hidden', '');
    } else {
      gridEl.setAttribute('hidden', '');
      emptyEl?.removeAttribute('hidden');
    }
  }
}

function updatePromoBannerDom(state: HomepageStudioState): void {
  const sec = document.querySelector<HTMLElement>('[data-studio-section="promo"]');
  if (!sec) return;

  const locale = getRuntimeLocale();
  const promo = resolvePromoBanner(state.promoBanner, locale);
  const eyebrowEl = sec.querySelector<HTMLElement>('[data-promo-eyebrow]');
  const titleEl = sec.querySelector<HTMLElement>('[data-promo-title]');
  const descEl = sec.querySelector<HTMLElement>('[data-promo-desc]');
  const ctaEl = sec.querySelector<HTMLAnchorElement>('[data-promo-cta]');
  const ctaTextEl = sec.querySelector<HTMLElement>('[data-promo-cta-text]');
  const imgEl = sec.querySelector<HTMLImageElement>('[data-promo-image]');
  const extraQuote = sec.querySelector<HTMLElement>('[data-promo-default-extra]');
  const extraPillars = sec.querySelector<HTMLElement>('[data-promo-default-pillars]');

  if (eyebrowEl) eyebrowEl.textContent = promo.eyebrow;
  if (titleEl) titleEl.textContent = promo.title;
  if (descEl) descEl.textContent = promo.desc;
  if (ctaTextEl) ctaTextEl.textContent = promo.ctaText;
  if (ctaEl) ctaEl.setAttribute('href', promo.ctaLink);
  if (imgEl) {
    imgEl.setAttribute('src', promo.image);
    imgEl.setAttribute('alt', promo.title);
  }
  if (extraQuote) extraQuote.hidden = promo.isCustomized;
  if (extraPillars) extraPillars.hidden = promo.isCustomized;
}

function updateReviewsDom(state: HomepageStudioState): void {
  const sec = document.querySelector<HTMLElement>('[data-studio-section="reviews"]');
  if (!sec) return;
  const grid = sec.querySelector<HTMLElement>('[data-reviews-grid]');
  const empty = sec.querySelector<HTMLElement>('[data-reviews-empty]');
  if (!grid) return;

  const isEn = getRuntimeLocale() === 'en';
  const fallbackImg = '/assets/images/logo.png';
  const list = (state.reviews || [])
    .filter((r) => r && (r.image || r.text))
    .map((r) => ({
      author: r.author && r.author.trim() !== '-' ? r.author.trim() : '',
      text: (r.text || '').trim(),
      image: sanitizeMediaUrl(r.image, fallbackImg),
    }));

  grid.innerHTML = list
    .map(
      (review, idx) => `
        <figure class="dandy-review-card">
          <div class="dandy-review-media">
            <img
              src="${escapeHtml(review.image)}"
              alt="${escapeHtml(
                isEn
                  ? review.author
                    ? `Review by ${review.author}`
                    : `DANDY Customer Review #${idx + 1}`
                  : review.author
                    ? `تجربة ${review.author}`
                    : `تجربة عميلة داندي #${idx + 1}`
              )}"
              width="480"
              height="600"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              class="dandy-review-img"
              onerror="this.onerror=null;this.src='${fallbackImg}';"
            />
          </div>
          ${
            review.author || review.text
              ? `<figcaption class="dandy-review-caption">
                   ${review.text ? `<p class="dandy-review-text" dir="auto">${escapeHtml(review.text)}</p>` : ''}
                   ${review.author ? `<span class="dandy-review-author" dir="auto">${escapeHtml(review.author)}</span>` : ''}
                 </figcaption>`
              : ''
          }
        </figure>
      `
    )
    .join('');

  if (list.length > 0) {
    grid.removeAttribute('hidden');
    empty?.setAttribute('hidden', '');
  } else {
    grid.setAttribute('hidden', '');
    empty?.removeAttribute('hidden');
  }
}

function buildCustomSectionHtml(sec: CustomSection, bootstrap: StudioBootstrapPayload | null): string {
  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const arrowIcon = isEn ? 'arrow-right' : 'arrow-left';
  const fallbackImg = DEFAULT_PROMO_BANNER.image;
  if (sec.type === 'trust') {
    const items = resolveTrustItems(undefined, sec.items, locale);
    const cols = items.length === 2 ? 2 : items.length >= 4 ? 4 : 3;
    const hasHeader = Boolean(sec.title?.trim() || sec.subtitle?.trim());
    return `
      <section class="dandy-trust-section${hasHeader ? ' has-header' : ''}" data-studio-section="${escapeHtml(sec.id)}" data-custom-type="trust">
        <div class="dandy-container">
          ${
            hasHeader
              ? `<header class="dandy-section-header dandy-trust-header">
                   <div class="dandy-section-titles">
                     ${sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.subtitle)}</p>` : ''}
                     ${sec.title ? `<h2 class="dandy-section-heading" dir="auto">${escapeHtml(sec.title)}</h2>` : ''}
                   </div>
                 </header>`
              : ''
          }
          <div class="dandy-trust-grid dandy-trust-cols-${cols}">
            ${items
              .map(
                (item) => `
                  <article class="dandy-trust-item">
                    <div class="dandy-trust-icon-box" aria-hidden="true">${getIconSvg(item.iconName, { size: 20, strokeWidth: 1.75 })}</div>
                    <div class="dandy-trust-copy">
                      <h3 class="dandy-trust-title" dir="auto">${escapeHtml(item.title)}</h3>
                      ${item.desc ? `<p class="dandy-trust-desc" dir="auto">${escapeHtml(item.desc)}</p>` : ''}
                    </div>
                  </article>
                `
              )
              .join('')}
          </div>
        </div>
      </section>
    `;
  }

  let innerHtml = '';
  if (sec.type === 'products') {
    const products = bootstrap?.products
      ? selectProductsForStudioSection(bootstrap.products, {
          source: sec.productSource || 'all',
          manualProducts: sec.manualProducts,
          limit: sec.limit || 4,
        })
      : [];
    const pfMap = bootstrap?.pinkFridayPricingMap || {};
    const targetLink = localizeInternalStoreHref(sanitizeNavHref(sec.linkUrl, '/all-products'), locale);
    innerHtml = `
      <header class="dandy-section-header">
        <div class="dandy-section-titles">
          ${sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.subtitle)}</p>` : ''}
          <h2 class="dandy-section-heading" dir="auto">${escapeHtml(sec.title || (isEn ? 'Selected Products' : 'منتجات مختارة'))}</h2>
        </div>
        <a href="${escapeHtml(targetLink)}" class="dandy-section-more">
          <span dir="auto">${escapeHtml(sec.linkText || (isEn ? 'View All' : 'عرض الكل'))}</span>
          ${getIconSvg(arrowIcon, { size: 15, strokeWidth: 1.8 })}
        </a>
      </header>
      ${
        products.length > 0
          ? `<div class="dandy-featured-grid">${products.map((p) => renderProductCardHtml(p, pfMap[p.id] || null)).join('')}</div>`
          : `<div class="dandy-featured-empty"><p>${isEn ? 'No products have been selected for this section yet.' : 'لم يتم تحديد منتجات متاحة في هذا القسم بعد.'}</p></div>`
      }
    `;
  } else if (sec.type === 'banner') {
    const targetCtaLink = localizeInternalStoreHref(sanitizeNavHref(sec.ctaLink, '/all-products'), locale);
    innerHtml = `
      <div class="dandy-custom-banner">
        <div class="dandy-custom-banner-copy">
          ${sec.eyebrow || sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.eyebrow || sec.subtitle)}</p>` : ''}
          <h2 class="dandy-story-title" dir="auto">${escapeHtml(sec.title || (isEn ? 'Special Offer from DANDY' : 'عرض خاص من داندي'))}</h2>
          ${sec.desc ? `<p class="dandy-story-text" dir="auto">${escapeHtml(sec.desc)}</p>` : ''}
          <div class="dandy-story-actions">
            <a href="${escapeHtml(targetCtaLink)}" class="dandy-btn dandy-btn--editorial">
              <span dir="auto">${escapeHtml(sec.ctaText || (isEn ? 'Explore Collection' : 'اكتشفي المجموعة'))}</span>
              ${getIconSvg(arrowIcon, { size: 16, strokeWidth: 1.8 })}
            </a>
          </div>
        </div>
        <div class="dandy-custom-banner-media">
          <img src="${escapeHtml(sanitizeMediaUrl(sec.image, fallbackImg))}" alt="${escapeHtml(sec.title || (isEn ? 'DANDY Offer' : 'عرض داندي'))}" width="800" height="600" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="dandy-story-img" onerror="this.onerror=null;this.src='${fallbackImg}';" />
        </div>
      </div>
    `;
  } else if (sec.type === 'story') {
    innerHtml = `
      <div class="dandy-custom-story-card">
        ${sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.subtitle)}</p>` : ''}
        <h2 class="dandy-custom-story-title" dir="auto">${escapeHtml(sec.title || (isEn ? 'Our Botanical Philosophy' : 'فلسفتنا الطبيعية'))}</h2>
        ${sec.content ? `<blockquote class="dandy-custom-story-quote" dir="auto">${escapeHtml(sec.content)}</blockquote>` : ''}
        ${sec.author ? `<p class="dandy-custom-story-author" dir="auto">— ${escapeHtml(sec.author)}</p>` : ''}
      </div>
    `;
  } else if (sec.type === 'faq') {
    const items = sec.items || [];
    innerHtml = `
      <div class="dandy-custom-faq-wrap">
        <header class="dandy-section-header">
          <div class="dandy-section-titles">
            ${sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.subtitle)}</p>` : ''}
            <h2 class="dandy-section-heading" dir="auto">${escapeHtml(sec.title || (isEn ? 'Frequently Asked Questions' : 'الأسئلة الشائعة'))}</h2>
          </div>
        </header>
        <div class="dandy-faq-list" data-faq-accordion>
          ${items
            .map(
              (item, idx) => `
                <div class="dandy-faq-item">
                  <button type="button" class="dandy-faq-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}" data-faq-trigger>
                    <span dir="auto">${escapeHtml(item.q || (isEn ? 'Question' : 'سؤال'))}</span>
                    ${getIconSvg('chevron-down', { size: 18, strokeWidth: 1.85, className: 'dandy-faq-chevron' })}
                  </button>
                  <div class="dandy-faq-panel"${idx !== 0 ? ' hidden' : ''} data-faq-panel>
                    <p dir="auto">${escapeHtml(item.a || '')}</p>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `;
  } else if (sec.type === 'video') {
    const media = resolveVideoMedia(sec.videoUrl, sec.poster);
    let mediaHtml = `<div class="dandy-featured-empty"><p>${isEn ? 'Video is currently unavailable.' : 'رابط الفيديو غير متاح حالياً.'}</p></div>`;
    if (media.kind === 'youtube' || media.kind === 'vimeo') {
      mediaHtml = `<div class="dandy-video-frame"><iframe src="${escapeHtml(media.embedUrl)}" title="${escapeHtml(sec.title || (isEn ? 'Video' : 'فيديو'))}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    } else if (media.kind === 'video') {
      mediaHtml = `<div class="dandy-video-frame is-native"><video src="${escapeHtml(media.src)}" poster="${escapeHtml(media.poster)}" controls playsinline preload="metadata" class="dandy-native-video"></video></div>`;
    }
    innerHtml = `
      <div class="dandy-custom-video-wrap">
        <header class="dandy-section-header">
          <div class="dandy-section-titles">
            ${sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.subtitle)}</p>` : ''}
            <h2 class="dandy-section-heading" dir="auto">${escapeHtml(sec.title || (isEn ? 'Watch DANDY Results' : 'شاهدي نتائج داندي'))}</h2>
          </div>
        </header>
        ${mediaHtml}
      </div>
    `;
  } else if (sec.type === 'gallery') {
    const items = sec.items || [];
    innerHtml = `
      <header class="dandy-section-header">
        <div class="dandy-section-titles">
          ${sec.subtitle ? `<p class="dandy-section-kicker" dir="auto">${escapeHtml(sec.subtitle)}</p>` : ''}
          <h2 class="dandy-section-heading" dir="auto">${escapeHtml(sec.title || (isEn ? 'DANDY Gallery' : 'معرض داندي'))}</h2>
        </div>
      </header>
      <div class="dandy-gallery-grid">
        ${items
          .map((item, idx) => {
            const safeImg = sanitizeMediaUrl(item.image, fallbackImg);
            const safeLink = item.link?.trim() ? localizeInternalStoreHref(sanitizeNavHref(item.link), locale) : '';
            const imgTag = `<img src="${escapeHtml(safeImg)}" alt="${escapeHtml(item.title || (isEn ? `Image ${idx + 1}` : `صورة ${idx + 1}`))}" width="640" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="dandy-gallery-img" onerror="this.onerror=null;this.src='${fallbackImg}';" />`;
            return `
              <figure class="dandy-gallery-card">
                ${safeLink ? `<a href="${escapeHtml(safeLink)}" class="dandy-gallery-link">${imgTag}</a>` : `<div class="dandy-gallery-link">${imgTag}</div>`}
                ${item.title ? `<figcaption class="dandy-gallery-caption" dir="auto">${escapeHtml(item.title)}</figcaption>` : ''}
              </figure>
            `;
          })
          .join('')}
      </div>
    `;
  }

  return `
    <section
      class="dandy-home-section dandy-custom-section dandy-custom-type-${escapeHtml(sec.type)}"
      data-studio-section="${escapeHtml(sec.id)}"
      data-custom-type="${escapeHtml(sec.type)}"
    >
      <div class="dandy-container">${innerHtml}</div>
    </section>
  `;
}

function syncCustomSectionsDom(
  mainEl: HTMLElement,
  state: HomepageStudioState,
  bootstrap: StudioBootstrapPayload | null
): void {
  const activeCustomIds = new Set<string>();
  (state.customSections || []).forEach((sec) => {
    if (!sec || !sec.id) return;
    activeCustomIds.add(sec.id);

    const html = buildCustomSectionHtml(sec, bootstrap);
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const newEl = tpl.content.firstElementChild as HTMLElement | null;
    if (!newEl) return;

    const existing = mainEl.querySelector<HTMLElement>(`[data-studio-section="${CSS.escape(sec.id)}"]`);
    if (existing) {
      existing.replaceWith(newEl);
    } else {
      mainEl.appendChild(newEl);
    }
  });

  // Remove deleted custom sections cleanly
  mainEl.querySelectorAll<HTMLElement>('[data-custom-type]').forEach((el) => {
    const id = el.getAttribute('data-studio-section');
    if (id && !activeCustomIds.has(id)) {
      el.remove();
    }
  });
}

function syncOrderAndVisibilityDom(
  mainEl: HTMLElement,
  state: HomepageStudioState,
  includePinkFriday: boolean
): void {
  const ordered = resolveOrderedHomepageEntries(state, includePinkFriday);
  ordered.forEach((entry) => {
    const el = mainEl.querySelector<HTMLElement>(`[data-studio-section="${CSS.escape(entry.id)}"]`);
    if (!el) return;
    if (entry.visible) {
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
    mainEl.appendChild(el);
  });
}

function decorateStudioSectionBadges(state: HomepageStudioState | null): void {
  const isEn = getRuntimeLocale() === 'en';
  const labelsMap = isEn ? SECTION_LABELS_EN : SECTION_LABELS_AR;
  const sections = document.querySelectorAll<HTMLElement>('[data-studio-section]');
  sections.forEach((sec) => {
    const id = sec.getAttribute('data-studio-section') || '';
    const customLabel = state?.customSections?.find((c) => c.id === id)?.title;
    const label = customLabel || labelsMap[id] || id;
    sec.setAttribute('data-studio-label', label);
    sec.classList.toggle('is-studio-selected', id === activeSelectedSectionId);
  });
}

function applyStudioPreviewHighlight(secId: string, scrollIntoView = true): void {
  activeSelectedSectionId = secId;
  document.querySelectorAll<HTMLElement>('[data-studio-section]').forEach((sec) => {
    const isMatch = sec.getAttribute('data-studio-section') === secId;
    sec.classList.toggle('is-studio-selected', isMatch);
    if (isMatch && scrollIntoView && !sec.hasAttribute('hidden')) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function setStudioEditMode(mode: 'edit' | 'preview'): void {
  currentMode = mode;
  document.documentElement.classList.toggle('dandy-studio-edit-mode', mode === 'edit');
  document.documentElement.classList.toggle('dandy-studio-preview-mode', mode === 'preview');
}

function readBootstrapPayload(): StudioBootstrapPayload | null {
  const scriptEl = document.getElementById('dandy-home-studio-bootstrap');
  if (!scriptEl || !scriptEl.textContent) return null;
  try {
    return JSON.parse(scriptEl.textContent) as StudioBootstrapPayload;
  } catch {
    return null;
  }
}

function initStudioPreviewBridge(): void {
  const params = new URLSearchParams(window.location.search);
  const isStudioPreview = params.get('studio_preview') === '1';
  if (!isStudioPreview) return;

  document.documentElement.classList.add('dandy-studio-preview');
  studioBootstrap = readBootstrapPayload();
  currentState = studioBootstrap?.state || null;
  setStudioEditMode('edit');
  decorateStudioSectionBadges(currentState);

  // Intercept clicks in Edit Mode inside iframe so admin clicks select sections instead of navigating
  document.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (currentMode !== 'edit') return;
      const target = event.target as HTMLElement | null;
      const sec = target?.closest<HTMLElement>('[data-studio-section]');
      if (!sec) return;
      const secId = sec.getAttribute('data-studio-section');
      if (!secId) return;

      // Allow hero dot/prev/next controls to inspect slide navigation even in edit mode
      if (target?.closest('[data-hero-controls]')) {
        window.parent?.postMessage({ type: 'STUDIO_SECTION_CLICKED', sectionId: secId }, '*');
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      applyStudioPreviewHighlight(secId, false);
      window.parent?.postMessage({ type: 'STUDIO_SECTION_CLICKED', sectionId: secId }, '*');
    },
    true
  );

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'STUDIO_SET_MODE') {
      setStudioEditMode(data.mode === 'preview' ? 'preview' : 'edit');
    } else if (data.type === 'STUDIO_SELECT_SECTION') {
      if (typeof data.sectionId === 'string' && data.sectionId) {
        applyStudioPreviewHighlight(data.sectionId, true);
      }
    } else if (data.type === 'STUDIO_RELOAD') {
      window.location.reload();
    } else if (data.type === 'STUDIO_UPDATE_STATE') {
      const mainEl = document.getElementById('main-content');
      if (!mainEl || !currentState) return;

      const locale = getRuntimeLocale();
      const merged = mergeStudioPreviewState(currentState, data.state);
      currentState =
        locale === 'en'
          ? resolveLocalizedHomepageStudioState(merged, 'en', EN_HOMEPAGE_STUDIO_OVERLAY)
          : merged;
      updateHeroDom(currentState);
      updateTrustDom(currentState);
      updateCategoriesDom(currentState);
      updateDynamicProductSectionDom(currentState, 'offers', studioBootstrap);
      updateDynamicProductSectionDom(currentState, 'newArrivals', studioBootstrap);
      updatePromoBannerDom(currentState);
      updateReviewsDom(currentState);
      syncCustomSectionsDom(mainEl, currentState, studioBootstrap);
      syncOrderAndVisibilityDom(mainEl, currentState, Boolean(studioBootstrap?.showPinkFriday));
      decorateStudioSectionBadges(currentState);
    }
  });

  // Notify parent Studio dashboard that preview frame is ready for state sync
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'STUDIO_PREVIEW_READY' }, '*');
  }
}

export function initHomepageStudio(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (initialized) return;
  initialized = true;

  initHeroControls();
  initFaqDelegation();
  initStudioPreviewBridge();
}
