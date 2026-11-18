/**
 * DANDY COSMETICS — SERVER-SIDE HOMEPAGE STUDIO DATA SERVICE
 * Fetches Firebase RTDB `/homepage` and `/categories` live on SSR so Admin Studio
 * publishes take immediate effect (keeping in-memory state strictly as error fallback).
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

export function invalidateHomepageCache(): void {
  cachedStudioState = null;
}

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

function normalizeSectionsVisibility(safeHome: Record<string, any>): Record<string, boolean> | undefined {
  const result: Record<string, boolean> = {};
  if (safeHome.sections && typeof safeHome.sections === 'object') {
    Object.entries(safeHome.sections).forEach(([key, val]: [string, any]) => {
      if (val && typeof val === 'object' && typeof val.visible === 'boolean') {
        result[key] = val.visible;
      } else if (typeof val === 'boolean') {
        result[key] = val;
      }
    });
  }
  if (safeHome.sectionsVisibility && typeof safeHome.sectionsVisibility === 'object') {
    Object.entries(safeHome.sectionsVisibility).forEach(([key, val]) => {
      if (typeof val === 'boolean') {
        result[key] = val;
      }
    });
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
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
  _options: { forceFresh?: boolean } = {}
): Promise<HomepageStudioState> {
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

  // If RTDB failed completely and cached fallback exists, keep storefront resilient
  if (!homeData && !categoriesData && cachedStudioState) {
    return cachedStudioState;
  }

  const safeHome = homeData || {};
  const state: HomepageStudioState = {
    hero: normalizeArray<HeroSlide>(safeHome.dynamicHero),
    heroMeta:
      safeHome.heroMeta && typeof safeHome.heroMeta === 'object' ? safeHome.heroMeta : undefined,
    sections: normalizeArray<DynamicSection>(safeHome.dynamicSections),
    trust:
      safeHome.trust && typeof safeHome.trust === 'object'
        ? safeHome.trust
        : {},
    trustSection:
      safeHome.trustSection && typeof safeHome.trustSection === 'object'
        ? safeHome.trustSection
        : undefined,
    categoriesSection:
      safeHome.categoriesSection && typeof safeHome.categoriesSection === 'object'
        ? safeHome.categoriesSection
        : undefined,
    blogSection:
      safeHome.blogSection && typeof safeHome.blogSection === 'object'
        ? safeHome.blogSection
        : undefined,
    reviewsSection:
      safeHome.reviewsSection && typeof safeHome.reviewsSection === 'object'
        ? safeHome.reviewsSection
        : undefined,
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
    sectionsVisibility: normalizeSectionsVisibility(safeHome),
    enOverlay:
      safeHome.enOverlay && typeof safeHome.enOverlay === 'object' ? safeHome.enOverlay : undefined,
  };

  if (homeData || categoriesData) {
    cachedStudioState = state;
  }

  return state;
}
