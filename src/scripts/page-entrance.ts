/**
 * ============================================================================
 * DANDY COSMETICS — PHASE 7 PAGE ENTRANCE & PROGRESSIVE REVEAL ENGINE
 * Pure, testable motion decision helpers + single shared IntersectionObserver
 * controller with progressive enhancement, LCP protection, bfcache handling,
 * keyboard-focus safety, and calm/editorial/expressive profiles.
 * ============================================================================
 */

export type MotionProfileName = 'expressive' | 'editorial' | 'calm';

export interface MotionProfileConfig {
  name: MotionProfileName;
  durationMs: number;
  staggerMs: number;
  maxStaggerItems: number;
  maxDelayMs: number;
  distancePx: number;
}

export interface MotionEnvironment {
  pathname: string;
  search?: string;
  reducedMotion: boolean;
  hasIntersectionObserver: boolean;
  isPersistedHistory?: boolean;
}

export interface ViewportRectLike {
  top: number;
  bottom: number;
  height: number;
}

const EXCLUDED_ROUTE_PREFIXES = ['/dashboard', '/statues', '/login', '/api'];

const MOTION_PROFILES: Record<MotionProfileName, MotionProfileConfig> = {
  expressive: {
    name: 'expressive',
    durationMs: 450,
    staggerMs: 55,
    maxStaggerItems: 6,
    maxDelayMs: 260,
    distancePx: 10,
  },
  editorial: {
    name: 'editorial',
    durationMs: 400,
    staggerMs: 45,
    maxStaggerItems: 6,
    maxDelayMs: 220,
    distancePx: 10,
  },
  calm: {
    name: 'calm',
    durationMs: 280,
    staggerMs: 30,
    maxStaggerItems: 4,
    maxDelayMs: 120,
    distancePx: 6,
  },
};

export function isExcludedMotionRoute(pathname: string, search = ''): boolean {
  const normalizedPath = (pathname || '/').trim().toLowerCase();
  if (
    EXCLUDED_ROUTE_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`) || normalizedPath.startsWith(`${prefix}-`)
    )
  ) {
    return true;
  }

  const normalizedSearch = (search || '').trim();
  if (normalizedSearch.includes('studio_preview=1')) {
    return true;
  }

  return false;
}

export function shouldEnableMotion(env: MotionEnvironment): boolean {
  if (!env || env.reducedMotion || !env.hasIntersectionObserver || env.isPersistedHistory) {
    return false;
  }
  return !isExcludedMotionRoute(env.pathname, env.search);
}

export function getMotionProfile(profile?: string | null): MotionProfileConfig {
  if (profile === 'expressive') return MOTION_PROFILES.expressive;
  if (profile === 'calm') return MOTION_PROFILES.calm;
  return MOTION_PROFILES.editorial;
}

/**
 * Computes batched stagger delay so large grids (e.g. 32 products) never
 * accumulate multi-second cumulative delays.
 */
export function computeStaggerDelayMs(
  index: number,
  profile: MotionProfileConfig,
  batchSize = 4
): number {
  const safeIndex = Math.max(0, Math.floor(index));
  const safeBatch = Math.max(1, Math.floor(batchSize));
  const positionInBatch = safeIndex % safeBatch;
  const rawDelay = positionInBatch * profile.staggerMs;
  return Math.min(rawDelay, profile.maxDelayMs);
}

export function computeEntranceDelayMs(orderIndex: number, profile: MotionProfileConfig): number {
  const safeOrder = Math.max(0, Math.floor(orderIndex));
  const clampedIndex = Math.min(safeOrder, profile.maxStaggerItems);
  return Math.min(clampedIndex * profile.staggerMs, profile.maxDelayMs);
}

export function isRectInInitialViewport(rect: ViewportRectLike, viewportHeight: number): boolean {
  if (!rect || viewportHeight <= 0) return false;
  if (rect.height <= 0) return false;
  return rect.top < viewportHeight * 0.96 && rect.bottom > 0;
}

// ============================================================================
// Browser Runtime Controller (Singleton)
// ============================================================================

const MANAGED_SELECTOR =
  '[data-dandy-entrance], [data-dandy-reveal], [data-dandy-reveal-child], [data-dandy-media-settle]';

class PageEntranceManager {
  private static instance: PageEntranceManager | null = null;
  private observer: IntersectionObserver | null = null;
  private observedTargets = new Set<HTMLElement>();
  private isBooted = false;
  private reducedMode = false;
  private settleTimers = new WeakMap<HTMLElement, number>();
  private profile: MotionProfileConfig = MOTION_PROFILES.editorial;
  private gridBatchCursor = 0;
  private gridBatchRafScheduled = false;
  private scrollSweepRafId = 0;
  private scrollListenerBound = false;

  private constructor() {}

  public static getInstance(): PageEntranceManager {
    if (!PageEntranceManager.instance) {
      PageEntranceManager.instance = new PageEntranceManager();
    }
    return PageEntranceManager.instance;
  }

  public init(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    (window as any).__dandyMotionBooted = true;

    if (this.isBooted) {
      this.refresh();
      return;
    }
    this.isBooted = true;

    const root = document.documentElement;
    const reducedQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    const enabled = shouldEnableMotion({
      pathname: window.location.pathname,
      search: window.location.search,
      reducedMotion: Boolean(reducedQuery?.matches),
      hasIntersectionObserver: typeof IntersectionObserver !== 'undefined',
      isPersistedHistory: false,
    });

    if (!enabled) {
      this.disableAndSettleAll(Boolean(reducedQuery?.matches));
      return;
    }

    this.profile = this.detectPageProfile();
    root.classList.add('dandy-motion-ready');

    // Watch dynamic changes to prefers-reduced-motion
    if (reducedQuery && typeof reducedQuery.addEventListener === 'function') {
      reducedQuery.addEventListener('change', (e) => {
        if (e.matches) {
          this.disableAndSettleAll(true);
        }
      });
    }

    // Handle bfcache back/forward restoration cleanly without replaying animations
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        this.revealEverythingInstantly();
      }
    });

    // Keyboard focus safeguard: never leave a focused element or its section hidden
    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const hiddenAncestor = target.closest<HTMLElement>('[data-dandy-motion-state="pending"]');
        if (hiddenAncestor) {
          this.revealElement(hiddenAncestor, 0, true);
        }
        if (target.getAttribute('data-dandy-motion-state') === 'pending') {
          this.revealElement(target, 0, true);
        }
      },
      { passive: true }
    );

    // Sync with catalog filter/sort/search DOM updates
    document.addEventListener('dandy:catalog-updated', (event: Event) => {
      const detail = (event as CustomEvent<{ grid?: HTMLElement }>).detail;
      const grid = detail?.grid;
      if (!grid) return;
      const visibleChildren = Array.from(
        grid.querySelectorAll<HTMLElement>('[data-dandy-reveal-child]')
      ).filter((el) => !el.closest('[hidden]') && !el.hidden);

      let pendingIdx = 0;
      visibleChildren.forEach((child) => {
        const state = child.getAttribute('data-dandy-motion-state');
        if (state === 'pending' || !state) {
          const delay = computeStaggerDelayMs(pendingIdx++, this.profile, 4);
          this.revealElement(child, delay);
          this.unobserveTarget(child);
        }
      });
    });

    this.setupObserver();
    this.scanAndBindElements(true);
  }

  private detectPageProfile(): MotionProfileConfig {
    const calmRoot = document.querySelector<HTMLElement>('[data-dandy-motion="calm"]');
    if (calmRoot) return getMotionProfile('calm');
    const expressiveRoot = document.querySelector<HTMLElement>('[data-dandy-motion="expressive"]');
    if (expressiveRoot) return getMotionProfile('expressive');
    return getMotionProfile('editorial');
  }

  private observeTarget(el: HTMLElement): void {
    this.observedTargets.add(el);
    this.observer?.observe(el);
    this.bindScrollCatchup();
  }

  private unobserveTarget(el: HTMLElement): void {
    this.observedTargets.delete(el);
    this.observer?.unobserve(el);
    if (this.observedTargets.size === 0) {
      this.unbindScrollCatchup();
    }
  }

  private handleScrollOrHash = (): void => {
    if (this.scrollSweepRafId || this.observedTargets.size === 0) return;
    this.scrollSweepRafId = window.requestAnimationFrame(() => {
      this.scrollSweepRafId = 0;
      this.sweepVisibleOrPassedTargets();
    });
  };

  private bindScrollCatchup(): void {
    if (this.scrollListenerBound || typeof window === 'undefined') return;
    this.scrollListenerBound = true;
    window.addEventListener('scroll', this.handleScrollOrHash, { passive: true });
    window.addEventListener('hashchange', this.handleScrollOrHash, { passive: true });
  }

  private unbindScrollCatchup(): void {
    if (!this.scrollListenerBound || typeof window === 'undefined') return;
    this.scrollListenerBound = false;
    window.removeEventListener('scroll', this.handleScrollOrHash);
    window.removeEventListener('hashchange', this.handleScrollOrHash);
    if (this.scrollSweepRafId) {
      window.cancelAnimationFrame(this.scrollSweepRafId);
      this.scrollSweepRafId = 0;
    }
  }

  private sweepVisibleOrPassedTargets(): void {
    if (this.reducedMode || this.observedTargets.size === 0) return;
    const vh = window.innerHeight || 900;
    let batchIdx = 0;

    Array.from(this.observedTargets).forEach((el) => {
      if (!el.isConnected || el.hidden || el.closest('[hidden]')) {
        this.unobserveTarget(el);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.height > 0 && rect.top <= vh + 48) {
        this.unobserveTarget(el);
        if (el.hasAttribute('data-dandy-reveal-child')) {
          const delay = computeStaggerDelayMs(batchIdx++, this.profile, 4);
          this.revealElement(el, delay);
        } else {
          this.revealContainerAndGroupChildren(el);
        }
      }
    });
  }

  private setupObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.observedTargets.clear();

    try {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            this.unobserveTarget(el);

            if (el.hasAttribute('data-dandy-reveal-child')) {
              const batchIndex = this.gridBatchCursor++;
              if (!this.gridBatchRafScheduled) {
                this.gridBatchRafScheduled = true;
                window.requestAnimationFrame(() => {
                  this.gridBatchCursor = 0;
                  this.gridBatchRafScheduled = false;
                });
              }
              const delay = computeStaggerDelayMs(batchIndex, this.profile, 4);
              this.revealElement(el, delay);
            } else {
              this.revealContainerAndGroupChildren(el);
            }
          });
        },
        {
          root: null,
          rootMargin: '0px 0px 48px 0px',
          threshold: 0.01,
        }
      );
    } catch {
      this.disableAndSettleAll(false);
    }
  }

  private scanAndBindElements(isInitialBoot: boolean): void {
    if (this.reducedMode) return;

    const vh = window.innerHeight || 900;

    // 1. Initial-viewport entrance elements ([data-dandy-entrance])
    const entranceEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-dandy-entrance]:not([data-dandy-motion-bound])')
    );

    entranceEls.forEach((el, domIdx) => {
      el.setAttribute('data-dandy-motion-bound', 'true');
      const state = el.getAttribute('data-dandy-motion-state');
      if (state === 'revealed' || state === 'settled') return;

      el.setAttribute('data-dandy-motion-state', 'pending');
      const rawOrder = el.getAttribute('data-dandy-entrance');
      const parsedOrder = rawOrder && /^\d+$/.test(rawOrder) ? Number(rawOrder) : domIdx;
      const delay = computeEntranceDelayMs(parsedOrder, this.profile);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          this.revealElement(el, delay);
        });
      });
    });

    // 2. Gentle media settle elements (LCP-safe: always opacity 1, scale only)
    const mediaEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-dandy-media-settle]:not([data-dandy-motion-bound])')
    );

    mediaEls.forEach((el) => {
      el.setAttribute('data-dandy-motion-bound', 'true');
      el.setAttribute('data-dandy-motion-state', 'pending');
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          this.revealElement(el, 0);
        });
      });
    });

    // 3. Section & container reveals ([data-dandy-reveal])
    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-dandy-reveal]:not([data-dandy-motion-bound])')
    );

    revealEls.forEach((el) => {
      el.setAttribute('data-dandy-motion-bound', 'true');
      if (el.hidden || el.closest('[hidden]')) {
        el.setAttribute('data-dandy-motion-state', 'settled');
        return;
      }

      // Mark group stagger children as pending before revealing/observing
      const staggerMode = el.getAttribute('data-dandy-stagger');
      if (staggerMode !== 'grid') {
        const groupChildren = el.querySelectorAll<HTMLElement>('[data-dandy-reveal-child]:not([data-dandy-motion-bound])');
        groupChildren.forEach((child) => {
          child.setAttribute('data-dandy-motion-bound', 'true');
          child.setAttribute('data-dandy-motion-state', 'pending');
        });
      }

      const rect = el.getBoundingClientRect();
      if (isRectInInitialViewport(rect, vh)) {
        el.setAttribute('data-dandy-motion-state', 'pending');
        const initialDelay = isInitialBoot ? Math.min(110, this.profile.maxDelayMs) : 0;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            this.revealContainerAndGroupChildren(el, initialDelay);
          });
        });
      } else {
        el.setAttribute('data-dandy-motion-state', 'pending');
        this.observeTarget(el);
      }
    });

    // 4. Grid-level individual stagger children ([data-dandy-stagger="grid"] [data-dandy-reveal-child])
    const gridContainers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-dandy-stagger="grid"]')
    );

    gridContainers.forEach((grid) => {
      const children = Array.from(
        grid.querySelectorAll<HTMLElement>('[data-dandy-reveal-child]:not([data-dandy-motion-bound])')
      );

      let initialBatchIdx = 0;
      children.forEach((child) => {
        child.setAttribute('data-dandy-motion-bound', 'true');
        if (child.hidden || child.closest('[hidden]')) {
          child.setAttribute('data-dandy-motion-state', 'settled');
          return;
        }

        const rect = child.getBoundingClientRect();
        if (isRectInInitialViewport(rect, vh)) {
          child.setAttribute('data-dandy-motion-state', 'pending');
          const delay = computeStaggerDelayMs(initialBatchIdx++, this.profile, 4);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              this.revealElement(child, delay);
            });
          });
        } else {
          child.setAttribute('data-dandy-motion-state', 'pending');
          this.observeTarget(child);
        }
      });
    });
  }

  private revealContainerAndGroupChildren(container: HTMLElement, baseDelayMs = 0): void {
    this.revealElement(container, baseDelayMs);

    if (container.getAttribute('data-dandy-stagger') === 'grid') {
      return;
    }

    const children = Array.from(
      container.querySelectorAll<HTMLElement>('[data-dandy-reveal-child]')
    );

    children.forEach((child, idx) => {
      const state = child.getAttribute('data-dandy-motion-state');
      if (state === 'revealed' || state === 'settled') return;
      const childDelay = baseDelayMs + computeStaggerDelayMs(idx, this.profile, 4);
      this.revealElement(child, childDelay);
    });
  }

  private revealElement(el: HTMLElement, delayMs = 0, instant = false): void {
    const currentState = el.getAttribute('data-dandy-motion-state');
    if (currentState === 'settled') return;
    if (currentState === 'revealed' && !instant) return;

    const existingTimer = this.settleTimers.get(el);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      this.settleTimers.delete(el);
    }

    if (instant || this.reducedMode) {
      el.style.removeProperty('--dandy-stagger-delay');
      el.setAttribute('data-dandy-motion-state', 'settled');
      return;
    }

    el.style.setProperty('--dandy-stagger-delay', `${Math.max(0, Math.round(delayMs))}ms`);
    el.setAttribute('data-dandy-motion-state', 'revealed');

    const settleAfterMs = this.profile.durationMs + delayMs + 80;
    const timerId = window.setTimeout(() => {
      el.style.removeProperty('--dandy-stagger-delay');
      el.setAttribute('data-dandy-motion-state', 'settled');
      this.settleTimers.delete(el);
    }, settleAfterMs);
    this.settleTimers.set(el, timerId);
  }

  public revealEverythingInstantly(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.add('dandy-motion-instant');
    this.observer?.disconnect();
    this.observedTargets.clear();
    this.unbindScrollCatchup();

    const managed = document.querySelectorAll<HTMLElement>(MANAGED_SELECTOR);
    managed.forEach((el) => {
      const existingTimer = this.settleTimers.get(el);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        this.settleTimers.delete(el);
      }
      el.style.removeProperty('--dandy-stagger-delay');
      el.setAttribute('data-dandy-motion-state', 'settled');
    });
  }

  private disableAndSettleAll(isReducedPreference: boolean): void {
    this.reducedMode = true;
    const root = document.documentElement;
    root.classList.remove('dandy-motion-ready');
    if (isReducedPreference) {
      root.classList.add('dandy-motion-reduced');
    }
    this.revealEverythingInstantly();
  }

  public refresh(): void {
    if (typeof window === 'undefined' || this.reducedMode) return;
    this.scanAndBindElements(false);
  }

  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedTargets.clear();
    this.unbindScrollCatchup();
    this.isBooted = false;
  }
}

export function initPageEntrance(): void {
  PageEntranceManager.getInstance().init();
}

export function refreshPageEntrance(): void {
  PageEntranceManager.getInstance().refresh();
}

export function destroyPageEntrance(): void {
  PageEntranceManager.getInstance().destroy();
}

export { PageEntranceManager };
