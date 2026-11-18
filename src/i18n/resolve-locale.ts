/**
 * ============================================================================
 * DANDY COSMETICS — LOCALE RESOLUTION & PERSISTENCE SPECIFICATION (PHASE 10)
 * Authoritative URL-first locale resolver.
 * Invariants:
 *  - Unprefixed routes ALWAYS resolve to 'ar' (even if browser/storage says 'en').
 *  - Only exact '/en' or '/en/...' prefix resolves to 'en'.
 *  - Never misclassifies '/offers', '/post', '/en-something', or query params.
 *  - Zero automatic IP or Accept-Language redirects.
 * ============================================================================
 */

import { DEFAULT_LOCALE, getDocumentAttributes, isLocalePublished, isSupportedLocale } from './config';
import type { LanguageSwitcherContract, Locale } from './types';

export const LOCALE_PREFERENCE_STORAGE_KEY = 'dandy_preferred_locale';

export const LANGUAGE_SWITCHER_CONTRACT: LanguageSwitcherContract = {
  mountTargets: ['desktop-header-end', 'mobile-nav-drawer'],
  preferenceStorageKey: LOCALE_PREFERENCE_STORAGE_KEY,
  neverMutateOnSwitch: [
    'localStorage.cart',
    'localStorage.dandy_cart',
    'firebase.auth.currentUser',
    'product.price',
    'product.id',
    'order.records',
  ],
  autoRedirectByBrowserOrIp: false,
  urlPrecedesStoredPreference: true,
  requiresPublishedCounterpartBeforeHreflang: true,
};

/**
 * Strips protocol/host/query/hash cleanly and normalizes leading slash.
 */
export function extractCleanPathname(rawUrlOrPath?: string | null): string {
  if (!rawUrlOrPath || typeof rawUrlOrPath !== 'string') return '/';
  const trimmed = rawUrlOrPath.trim();
  if (!trimmed) return '/';

  let path = trimmed;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname || '/';
    } catch {
      path = '/';
    }
  } else {
    path = path.split('#')[0].split('?')[0] || '/';
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  // Collapse multiple slashes
  path = path.replace(/\/{2,}/g, '/');
  return path;
}

/**
 * Checks strictly whether a pathname carries the genuine English route prefix (`/en` or `/en/...`).
 * Explicitly prevents false matches on routes like `/en-sample`, `/offers`, `/post`, `/english`.
 */
export function hasEnglishRoutePrefix(rawUrlOrPath?: string | null): boolean {
  const path = extractCleanPathname(rawUrlOrPath).toLowerCase();
  return path === '/en' || path.startsWith('/en/');
}

/**
 * Explicitly rejects invalid `/ar` prefix attempts from resolving to a separate locale mode;
 * the URL-first rule keeps unprefixed URLs Arabic and `/en` URLs English.
 */
export function resolveLocaleFromPath(rawUrlOrPath?: string | null): Locale {
  if (hasEnglishRoutePrefix(rawUrlOrPath)) {
    return 'en';
  }
  return DEFAULT_LOCALE;
}

export function normalizeLocaleInput(input?: unknown): Locale {
  if (isSupportedLocale(input)) return input;
  if (typeof input === 'string') {
    const clean = input.trim().toLowerCase();
    if (clean === 'en' || clean.startsWith('en-') || clean.startsWith('en_')) {
      return 'en';
    }
    if (clean === 'ar' || clean.startsWith('ar-') || clean.startsWith('ar_')) {
      return 'ar';
    }
  }
  return DEFAULT_LOCALE;
}

export interface ResolveDocumentLocaleOptions {
  pathname?: string | null;
  storedPreference?: string | null;
  browserLanguages?: readonly string[] | null;
  enforcePublishedOnly?: boolean;
}

export interface DocumentLocaleResolution {
  locale: Locale;
  lang: Locale;
  dir: 'rtl' | 'ltr';
  source: 'url-prefix' | 'default-unprefixed' | 'unpublished-fallback';
  /** Hint captured purely for diagnostics / future switcher UI; never overrides URL. */
  nonAuthoritativeBrowserHint: Locale | null;
  storedPreferenceIgnoredDueToUrl: boolean;
}

export function resolveNonAuthoritativeBrowserHint(
  browserLanguages?: readonly string[] | null
): Locale | null {
  if (!Array.isArray(browserLanguages) || browserLanguages.length === 0) return null;
  for (const lang of browserLanguages) {
    if (typeof lang !== 'string') continue;
    const clean = lang.trim().toLowerCase();
    if (clean === 'ar' || clean.startsWith('ar-') || clean.startsWith('ar_')) return 'ar';
    if (clean === 'en' || clean.startsWith('en-') || clean.startsWith('en_')) return 'en';
  }
  return null;
}

/**
 * Authoritative resolver:
 * 1. URL always precedes any stored or browser preference.
 * 2. Unprefixed Arabic routes ALWAYS stay Arabic even if storedPreference === 'en'.
 * 3. When enforcePublishedOnly is true (default for public rendering), unpublished English
 *    falls back safely to Arabic without mutating storage or cart.
 */
export function resolveDocumentLocale(
  options: ResolveDocumentLocaleOptions = {}
): DocumentLocaleResolution {
  const urlLocale = resolveLocaleFromPath(options.pathname);
  const enforcePublished = options.enforcePublishedOnly !== false;
  const storedNorm =
    typeof options.storedPreference === 'string' && options.storedPreference.trim()
      ? normalizeLocaleInput(options.storedPreference)
      : null;

  const browserHint = resolveNonAuthoritativeBrowserHint(options.browserLanguages);

  if (urlLocale === 'en' && enforcePublished && !isLocalePublished('en')) {
    const fallbackAttrs = getDocumentAttributes(DEFAULT_LOCALE);
    return {
      locale: DEFAULT_LOCALE,
      lang: fallbackAttrs.lang,
      dir: fallbackAttrs.dir,
      source: 'unpublished-fallback',
      nonAuthoritativeBrowserHint: browserHint,
      storedPreferenceIgnoredDueToUrl: storedNorm !== null && storedNorm !== DEFAULT_LOCALE,
    };
  }

  const attrs = getDocumentAttributes(urlLocale);
  return {
    locale: urlLocale,
    lang: attrs.lang,
    dir: attrs.dir,
    source: urlLocale === 'en' ? 'url-prefix' : 'default-unprefixed',
    nonAuthoritativeBrowserHint: browserHint,
    storedPreferenceIgnoredDueToUrl: storedNorm !== null && storedNorm !== urlLocale,
  };
}

/**
 * Safe persistence helper for future Phase 11 switcher.
 * Pure & injection-friendly (never accesses browser globals if storage is omitted).
 */
export function persistLocalePreference(
  locale: Locale,
  storage?: Pick<Storage, 'setItem'> | null
): boolean {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

export function readStoredLocalePreference(
  storage?: Pick<Storage, 'getItem'> | null
): Locale | null {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
    if (!raw) return null;
    const clean = raw.trim().toLowerCase();
    return isSupportedLocale(clean) ? clean : null;
  } catch {
    return null;
  }
}
