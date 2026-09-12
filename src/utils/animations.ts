import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register plugins once
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Global GSAP + ScrollTrigger Architecture for Dandy Homepage
 */
export class DandyAnimationController {
  private static instance: DandyAnimationController | null = null;
  private triggers: ScrollTrigger[] = [];
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): DandyAnimationController {
    if (!DandyAnimationController.instance) {
      DandyAnimationController.instance = new DandyAnimationController();
    }
    return DandyAnimationController.instance;
  }

  /**
   * Initializes page-wide entrance and scroll triggers
   */
  public init(): void {
    if (typeof window === 'undefined') return;
    if (this.isInitialized) {
      this.refresh();
      return;
    }
    this.isInitialized = true;

    // Set default easing for pristine, premium editorial feel
    gsap.defaults({
      ease: 'power3.out',
      duration: 0.85
    });

    // 1. Cinematic Entry Curtain Fade
    this.initCinematicCurtain();

    // 2. Hero Section Entrance & Scroll Coordination
    this.initHeroSection();

    // 3. Trust Strip Stagger
    this.initTrustStrip();

    // 4. Special Offers Section
    this.initSpecialOffers();

    // 5. Promo Banner
    this.initPromoBanner();

    // 6. Secondary Products Section
    this.initSecondaryProducts();

    // 7. Editorial Blog Section
    this.initEditorialBlog();

    // 8. Authentic Customer Reviews
    this.initCustomerReviews();

    // 9. Generic Scroll Reveals
    this.initGenericReveals();
  }

  /**
   * 0. Cinematic Curtain (Smooth fade to reveal hero)
   */
  public initCinematicCurtain(): void {
    const curtain = document.getElementById('cinematicCurtain');
    if (!curtain) return;

    if (prefersReducedMotion()) {
      curtain.remove();
      return;
    }

    gsap.to(curtain, {
      opacity: 0,
      duration: 0.9,
      delay: 0.05,
      ease: 'power2.inOut',
      onComplete: () => {
        if (curtain.parentNode) {
          curtain.remove();
        }
      }
    });
  }

  /**
   * 1. Full-Screen Editorial Hero Motion
   */
  public initHeroSection(): void {
    const heroSection = document.getElementById('hero-editorial-section');
    if (!heroSection) return;

    if (prefersReducedMotion()) return;

    // Stagger in initial active slide content
    const activeSlide = heroSection.querySelector('.hero-slide-item.active');
    if (activeSlide) {
      const tagline = activeSlide.querySelector('.hero-tagline');
      const heading = activeSlide.querySelector('.hero-heading');
      const desc = activeSlide.querySelector('.hero-desc');
      const actions = activeSlide.querySelector('.hero-actions');

      const tl = gsap.timeline({ delay: 0.2 });
      if (tagline) tl.fromTo(tagline, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 0);
      if (heading) tl.fromTo(heading, { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8 }, 0.1);
      if (desc) tl.fromTo(desc, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75 }, 0.2);
      if (actions) tl.fromTo(actions, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 0.3);
    }
  }

  /**
   * 2. Trust Strip Stagger
   */
  public initTrustStrip(): void {
    const trustStrip = document.querySelector('.trust-strip');
    const items = document.querySelectorAll('.trust-strip-item');
    if (!trustStrip || !items.length) return;

    if (prefersReducedMotion()) {
      trustStrip.classList.add('is-revealed');
      return;
    }

    const trigger = ScrollTrigger.create({
      trigger: trustStrip,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        trustStrip.classList.add('is-revealed');
        gsap.fromTo(
          items,
          { y: 25, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out', clearProps: 'transform' }
        );
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 3. Special Offers (Primary Products Section)
   */
  public initSpecialOffers(): void {
    const section = document.getElementById('primary-products-section');
    if (!section) return;

    if (prefersReducedMotion()) {
      section.classList.add('is-revealed');
      return;
    }

    const header = section.querySelector('.section-header-row');
    const grid = section.querySelector('.modern-product-grid');

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        section.classList.add('is-revealed');
        const tl = gsap.timeline();
        if (header) {
          tl.fromTo(header, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', clearProps: 'transform' }, 0);
        }
        if (grid) {
          const cards = grid.querySelectorAll('.modern-product-card');
          if (cards.length > 0) {
            tl.fromTo(
              cards,
              { y: 35, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease: 'power3.out', clearProps: 'transform' },
              0.1
            );
          } else {
            tl.fromTo(grid, { y: 35, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'transform' }, 0.1);
          }
        }
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 4. Asymmetric Editorial Categories (Paired Left/Right entrance)
   */
  public animateCategories(): void {
    const secCategories = document.getElementById('sec-categories');
    if (!secCategories) return;

    const colRight = secCategories.querySelector('.cat-col-right');
    const colLeft = secCategories.querySelector('.cat-col-left');

    if (prefersReducedMotion()) {
      secCategories.classList.add('is-revealed');
      return;
    }

    if (!colRight && !colLeft) return;

    const trigger = ScrollTrigger.create({
      trigger: secCategories,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        secCategories.classList.add('is-revealed');
        const tl = gsap.timeline();
        if (colRight) {
          tl.fromTo(
            colRight,
            { x: 50, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.85, ease: 'power3.out', clearProps: 'transform' },
            0
          );
        }
        if (colLeft) {
          tl.fromTo(
            colLeft,
            { x: -50, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.85, ease: 'power3.out', clearProps: 'transform' },
            0.12
          );
        }
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 5. Promo Banner
   */
  public initPromoBanner(): void {
    const bannerSection = document.querySelector('.promo-banner-section');
    if (!bannerSection) return;

    if (prefersReducedMotion()) {
      bannerSection.classList.add('is-revealed');
      return;
    }

    const card = bannerSection.querySelector('.promo-banner-card');
    if (!card) return;

    const textSide = card.querySelector('.promo-text-side');
    const visualSide = card.querySelector('.promo-visual-side');

    const trigger = ScrollTrigger.create({
      trigger: bannerSection,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        bannerSection.classList.add('is-revealed');
        const tl = gsap.timeline();
        if (textSide) {
          tl.fromTo(textSide, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'transform' }, 0);
        }
        if (visualSide) {
          tl.fromTo(visualSide, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: 'power3.out', clearProps: 'transform' }, 0.1);
        }
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 6. Secondary Products Section
   */
  public initSecondaryProducts(): void {
    const section = document.getElementById('secondary-products-section');
    if (!section) return;

    if (prefersReducedMotion()) {
      section.classList.add('is-revealed');
      return;
    }

    const header = section.querySelector('.section-header-row');
    const grid = section.querySelector('.modern-product-grid');

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        section.classList.add('is-revealed');
        const tl = gsap.timeline();
        if (header) {
          tl.fromTo(header, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', clearProps: 'transform' }, 0);
        }
        if (grid) {
          const cards = grid.querySelectorAll('.modern-product-card');
          if (cards.length > 0) {
            tl.fromTo(
              cards,
              { y: 35, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease: 'power3.out', clearProps: 'transform' },
              0.1
            );
          } else {
            tl.fromTo(grid, { y: 35, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'transform' }, 0.1);
          }
        }
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 7. Editorial Blog Section
   */
  public initEditorialBlog(): void {
    const section = document.getElementById('editorial-blog-section');
    if (!section) return;

    if (prefersReducedMotion()) {
      section.classList.add('is-revealed');
      return;
    }

    const header = section.querySelector('.section-header-row');
    const grid = section.querySelector('.editorial-blog-grid');

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        section.classList.add('is-revealed');
        const tl = gsap.timeline();
        if (header) {
          tl.fromTo(header, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', clearProps: 'transform' }, 0);
        }
        if (grid) {
          const cards = grid.querySelectorAll('.editorial-blog-card');
          if (cards.length > 0) {
            tl.fromTo(
              cards,
              { y: 35, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, ease: 'power3.out', clearProps: 'transform' },
              0.1
            );
          } else {
            tl.fromTo(grid, { y: 35, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', clearProps: 'transform' }, 0.1);
          }
        }
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 8. Authentic Customer Reviews
   */
  public initCustomerReviews(): void {
    const section = document.getElementById('reviews-section');
    if (!section) return;

    if (prefersReducedMotion()) {
      section.classList.add('is-revealed');
      return;
    }

    const header = section.querySelector('.section-header-row');
    const grid = section.querySelector('.reviews-editorial-grid');

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        section.classList.add('is-revealed');
        const tl = gsap.timeline();
        if (header) {
          tl.fromTo(header, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', clearProps: 'transform' }, 0);
        }
        if (grid) {
          const cards = grid.querySelectorAll('.review-feedback-card');
          if (cards.length > 0) {
            tl.fromTo(
              cards,
              { y: 30, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.75, stagger: 0.08, ease: 'power3.out', clearProps: 'transform' },
              0.1
            );
          } else {
            tl.fromTo(grid, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', clearProps: 'transform' }, 0.1);
          }
        }
      }
    });
    this.triggers.push(trigger);
  }

  /**
   * 9. Generic Scroll Reveals for any additional marked elements
   */
  public initGenericReveals(): void {
    const elements = document.querySelectorAll('.scroll-reveal-up:not(.is-revealed):not([data-gsap-bound])');
    if (!elements.length) return;

    elements.forEach((el) => {
      el.setAttribute('data-gsap-bound', 'true');
      if (prefersReducedMotion()) {
        el.classList.add('is-revealed');
        return;
      }

      const trigger = ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          el.classList.add('is-revealed');
          gsap.fromTo(
            el,
            { y: 35, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out', clearProps: 'transform' }
          );
        }
      });
      this.triggers.push(trigger);
    });
  }

  /**
   * Recalculates all scroll triggers after dynamic async DOM updates (e.g. Firebase data loaded)
   */
  public refresh(): void {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      this.initGenericReveals();
      this.animateCategories();
      ScrollTrigger.refresh();
    }, 50);
  }

  /**
   * Clean up all triggers
   */
  public destroy(): void {
    this.triggers.forEach(t => t.kill());
    this.triggers = [];
    this.isInitialized = false;
  }
}

// Global accessor for inline scripts if needed
if (typeof window !== 'undefined') {
  (window as any).DandyAnimationController = DandyAnimationController;
}
