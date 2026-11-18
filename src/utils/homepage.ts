/**
 * DANDY COSMETICS — SERVER-SIDE HOMEPAGE STUDIO DATA SERVICE
 * Fetches existing Firebase RTDB `/homepage` and `/categories` nodes cleanly on SSR
 * with a short 30-second cache (bypassed immediately when `forceFresh` / `?studio_preview=1` is set).
 */

import type {
  HomepageStudioState,
  ReviewItem,
  HeroSlide,
  DynamicSection,
  CustomSection,
  StudioCategoryItem,
} from '../scripts/homepage-studio';

const RTDB_URL = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';

let cachedStudioState: HomepageStudioState | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000;

function normalizeArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is T => Boolean(item && typeof item === 'object'));
  }
  if (raw && typeof raw === 'object') {
    return Object.values(raw).filter((item): item is T => Boolean(item && typeof item === 'object'));
  }
  return [];
}

function normalizeReviews(homeData: Record<string, any>): ReviewItem[] {
  const dynamicReviews = normalizeArray<ReviewItem>(homeData.dynamicReviews);
  if (dynamicReviews.length > 0) return dynamicReviews;
  return normalizeArray<ReviewItem>(homeData.reviews);
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Dandy-Astro-SSR/1.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHomepageStudioData(
  options: { forceFresh?: boolean } = {}
): Promise<HomepageStudioState> {
  const now = Date.now();
  if (!options.forceFresh && cachedStudioState && now - lastFetchTimestamp < CACHE_TTL_MS) {
    return cachedStudioState;
  }

  const [homeRes, categoriesRes] = await Promise.allSettled([
    fetchJsonWithTimeout<Record<string, any>>(`${RTDB_URL}/homepage.json`),
    fetchJsonWithTimeout<Record<string, StudioCategoryItem>>(`${RTDB_URL}/categories.json`),
  ]);

  const homeData =
    homeRes.status === 'fulfilled' && homeRes.value && typeof homeRes.value === 'object'
      ? homeRes.value
      : null;

  const categoriesData =
    categoriesRes.status === 'fulfilled' && categoriesRes.value && typeof categoriesRes.value === 'object'
      ? categoriesRes.value
      : null;

  // If RTDB failed completely and stale cache exists, keep storefront resilient
  if (!homeData && !categoriesData && cachedStudioState) {
    return cachedStudioState;
  }

  const safeHome = homeData || {};
  const state: HomepageStudioState = {
    hero: normalizeArray<HeroSlide>(safeHome.dynamicHero),
    sections: normalizeArray<DynamicSection>(safeHome.dynamicSections),
    trust:
      safeHome.trust && typeof safeHome.trust === 'object'
        ? safeHome.trust
        : {},
    reviews: normalizeReviews(safeHome),
    categories: categoriesData || {},
    promoBanner:
      safeHome.promoBanner && typeof safeHome.promoBanner === 'object'
        ? safeHome.promoBanner
        : undefined,
    customSections: normalizeArray<CustomSection>(safeHome.customSections),
    sectionOrder: Array.isArray(safeHome.sectionOrder)
      ? safeHome.sectionOrder.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : undefined,
    sectionsVisibility:
      safeHome.sectionsVisibility && typeof safeHome.sectionsVisibility === 'object'
        ? safeHome.sectionsVisibility
        : undefined,
  };

  if (homeData || categoriesData) {
    cachedStudioState = state;
    lastFetchTimestamp = now;
  }

  return state;
}
