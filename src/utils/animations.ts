/**
 * ============================================================================
 * DANDY COSMETICS — UNIFIED ANIMATION CONTROLLER (PHASE 7)
 * Consolidates the legacy DandyAnimationController contract with the
 * lightweight Phase 7 PageEntranceManager (CSS Compositor + IntersectionObserver).
 * Preserves window.DandyAnimationController without duplicate GSAP/ScrollTrigger
 * instances or obsolete pre-Phase-3 selectors.
 * ============================================================================
 */
import {
  PageEntranceManager,
  destroyPageEntrance,
  initPageEntrance,
  refreshPageEntrance,
} from '../scripts/page-entrance';

export class DandyAnimationController {
  private static instance: DandyAnimationController | null = null;

  private constructor() {}

  public static getInstance(): DandyAnimationController {
    if (!DandyAnimationController.instance) {
      DandyAnimationController.instance = new DandyAnimationController();
    }
    return DandyAnimationController.instance;
  }

  /**
   * Initializes unified storefront page entrance and progressive reveals
   */
  public init(): void {
    initPageEntrance();
  }

  /**
   * Re-scans newly rendered or filtered DOM nodes without replaying completed animations
   */
  public refresh(): void {
    refreshPageEntrance();
  }

  /**
   * Immediately reveals all pending elements (e.g. history restore or fallback)
   */
  public revealAll(): void {
    PageEntranceManager.getInstance().revealEverythingInstantly();
  }

  /**
   * Cleans up observers and internal state
   */
  public destroy(): void {
    destroyPageEntrance();
  }
}

if (typeof window !== 'undefined') {
  (window as any).DandyAnimationController = DandyAnimationController;
}
