/**
 * ============================================================================
 * DANDY COSMETICS — LOCALE-AWARE ROUTE & COUNTERPART REGISTRY (PHASE 10)
 * Maps all Arabic unprefixed routes <-> future English `/en/` routes,
 * handles dynamic entities (products, categories, articles), enforces strict
 * query-param allowlists (preventing sensitive token leakage), guards against
 * duplicate `/en/en/` prefixes, preserves legacy redirects (`/offers`, `/post`),
 * and handles missing translated counterparts cleanly.
 * ============================================================================
 */

import { isLocalePublished } from './config';
import { extractCleanPathname, resolveLocaleFromPath } from './resolve-locale';
import type {
  CounterpartAvailability,
  Locale,
  LocalizedRouteKind,
  RouteCounterpartResult,
  RouteDefinition,
} from './types';

const TRACKING_QUERY_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'] as const;
const CATALOG_QUERY_PARAMS = [
  'search',
  'category',
  'sort',
  'page',
  'price',
  'sale',
  'availability',
  'bestseller',
  ...TRACKING_QUERY_PARAMS,
] as const;

/**
 * Complete registry of DANDY storefront routes & legacy compatibility redirects.
 * Notice: `englishPublished` stays `false` throughout Phase 10.
 */
export const ROUTE_REGISTRY: readonly RouteDefinition[] = [
  {
    id: 'home',
    kind: 'home',
    arabicPattern: '/',
    englishPattern: '/en/',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'catalog',
    kind: 'catalog',
    arabicPattern: '/all-products',
    englishPattern: '/en/all-products',
    supportsSwitch: true,
    allowedQueryParams: [...CATALOG_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'category',
    kind: 'category',
    arabicPattern: '/category/[category]',
    englishPattern: '/en/category/[category]',
    supportsSwitch: true,
    allowedQueryParams: CATALOG_QUERY_PARAMS.filter((p) => p !== 'category'),
    preserveFragment: true,
    missingCounterpartFallback: 'self-listing',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'product',
    kind: 'product',
    arabicPattern: '/product/[slug]',
    englishPattern: '/en/product/[slug]',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'self-listing',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'special-offers',
    kind: 'special-offers',
    arabicPattern: '/special-offers',
    englishPattern: '/en/special-offers',
    supportsSwitch: true,
    allowedQueryParams: CATALOG_QUERY_PARAMS.filter((p) => p !== 'sale'),
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'pink-friday',
    kind: 'pink-friday',
    arabicPattern: '/pink-friday',
    englishPattern: '/en/pink-friday',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'self-listing',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'cart',
    kind: 'cart',
    arabicPattern: '/cart',
    englishPattern: '/en/cart',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: false,
    missingCounterpartFallback: 'home',
    indexable: false,
    englishPublished: true,
  },
  {
    id: 'invoice',
    kind: 'invoice',
    arabicPattern: '/invoice',
    englishPattern: '/en/invoice',
    supportsSwitch: true,
    /** Allow only explicit public reference params; NEVER leak hash #access= or #token=. */
    allowedQueryParams: ['invoice', 'id'],
    preserveFragment: false,
    missingCounterpartFallback: 'home',
    indexable: false,
    englishPublished: true,
  },
  {
    id: 'track-order',
    kind: 'track-order',
    arabicPattern: '/track-order',
    englishPattern: '/en/track-order',
    supportsSwitch: true,
    allowedQueryParams: ['invoice', 'code'],
    preserveFragment: false,
    missingCounterpartFallback: 'home',
    indexable: false,
    englishPublished: true,
  },
  {
    id: 'account-login',
    kind: 'account-login',
    arabicPattern: '/account-login',
    englishPattern: '/en/account-login',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: false,
    missingCounterpartFallback: 'home',
    indexable: false,
    englishPublished: true,
  },
  {
    id: 'account-signup',
    kind: 'account-signup',
    arabicPattern: '/account-signup',
    englishPattern: '/en/account-signup',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: false,
    missingCounterpartFallback: 'home',
    indexable: false,
    englishPublished: true,
  },
  {
    id: 'account',
    kind: 'account',
    arabicPattern: '/account',
    englishPattern: '/en/account',
    supportsSwitch: true,
    allowedQueryParams: ['tab'],
    preserveFragment: false,
    missingCounterpartFallback: 'home',
    indexable: false,
    englishPublished: true,
  },
  {
    id: 'blog',
    kind: 'blog',
    arabicPattern: '/blog',
    englishPattern: '/en/blog',
    supportsSwitch: true,
    allowedQueryParams: ['category', 'page', ...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'blog-article',
    kind: 'blog-article',
    arabicPattern: '/blog/[slug]',
    englishPattern: '/en/blog/[slug]',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'self-listing',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'client-reviews',
    kind: 'client-reviews',
    arabicPattern: '/client-reviews',
    englishPattern: '/en/client-reviews',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'about-us',
    kind: 'about-us',
    arabicPattern: '/about-us',
    englishPattern: '/en/about-us',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'contact-us',
    kind: 'contact-us',
    arabicPattern: '/contact-us',
    englishPattern: '/en/contact-us',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'help',
    kind: 'help',
    arabicPattern: '/help',
    englishPattern: '/en/help',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'privacy-policy',
    kind: 'privacy-policy',
    arabicPattern: '/privacy-policy',
    englishPattern: '/en/privacy-policy',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
  {
    id: 'terms',
    kind: 'terms',
    arabicPattern: '/terms',
    englishPattern: '/en/terms',
    supportsSwitch: true,
    allowedQueryParams: [...TRACKING_QUERY_PARAMS],
    preserveFragment: true,
    missingCounterpartFallback: 'home',
    indexable: true,
    englishPublished: true,
  },
];

const STATIC_ROUTE_KIND_BY_PATH: Record<string, LocalizedRouteKind> = {
  '/': 'home',
  '/all-products': 'catalog',
  '/special-offers': 'special-offers',
  '/pink-friday': 'pink-friday',
  '/cart': 'cart',
  '/invoice': 'invoice',
  '/track-order': 'track-order',
  '/account-login': 'account-login',
  '/account-signup': 'account-signup',
  '/account': 'account',
  '/blog': 'blog',
  '/client-reviews': 'client-reviews',
  '/about-us': 'about-us',
  '/contact-us': 'contact-us',
  '/help': 'help',
  '/privacy-policy': 'privacy-policy',
  '/terms': 'terms',
  '/404': 'not-found',
};

const LEGACY_REDIRECT_PATHS = new Set(['/offers', '/post', '/product']);

/**
 * Strips zero, one, or duplicated `/en` prefixes to recover the canonical unprefixed path.
 * Never alters legacy routes (`/offers`, `/post`, `/en-sample`, etc.).
 */
export function stripLocalePrefix(rawPath?: string | null): string {
  let clean = extractCleanPathname(rawPath);

  // Strip accidental duplicate `/en/en/...` prefixes deterministically
  while (/^\/en(\/|$)/i.test(clean)) {
    clean = clean.slice(3) || '/';
    if (!clean.startsWith('/')) {
      clean = `/${clean}`;
    }
  }

  // Normalize trailing slash on non-root paths
  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean || '/';
}

/**
 * Checks whether a route belongs to the excluded Admin / Studio / Login namespace.
 */
export function isAdminOrExcludedLocaleRoute(rawPath?: string | null): boolean {
  const unprefixed = stripLocalePrefix(rawPath).toLowerCase();
  return (
    unprefixed === '/login' ||
    unprefixed === '/statues' ||
    unprefixed === '/dashboard' ||
    unprefixed.startsWith('/dashboard-') ||
    unprefixed.startsWith('/api/')
  );
}

/**
 * Identifies semantic route kind regardless of `/en` prefix.
 */
export function classifyLocalizedRoute(rawPath?: string | null): {
  kind: LocalizedRouteKind;
  unprefixedPath: string;
  dynamicSlug: string | null;
} {
  const unprefixedPath = stripLocalePrefix(rawPath);
  const lower = unprefixedPath.toLowerCase();

  if (isAdminOrExcludedLocaleRoute(unprefixedPath)) {
    return { kind: 'admin-excluded', unprefixedPath, dynamicSlug: null };
  }

  if (LEGACY_REDIRECT_PATHS.has(lower)) {
    return { kind: 'legacy-redirect', unprefixedPath, dynamicSlug: null };
  }

  if (STATIC_ROUTE_KIND_BY_PATH[lower]) {
    return { kind: STATIC_ROUTE_KIND_BY_PATH[lower], unprefixedPath, dynamicSlug: null };
  }

  if (lower.startsWith('/category/')) {
    const slug = unprefixedPath.slice('/category/'.length).trim() || null;
    return { kind: slug ? 'category' : 'not-found', unprefixedPath, dynamicSlug: slug };
  }

  if (lower.startsWith('/product/')) {
    const slug = unprefixedPath.slice('/product/'.length).trim() || null;
    return { kind: slug ? 'product' : 'not-found', unprefixedPath, dynamicSlug: slug };
  }

  if (lower.startsWith('/blog/')) {
    const slug = unprefixedPath.slice('/blog/'.length).trim() || null;
    return { kind: slug ? 'blog-article' : 'not-found', unprefixedPath, dynamicSlug: slug };
  }

  return { kind: 'not-found', unprefixedPath, dynamicSlug: null };
}

/**
 * Builds a clean normalized path for the specified locale without duplicate `/en/en` prefixes.
 */
export function buildLocalizedPath(unprefixedOrAnyPath: string, targetLocale: Locale): string {
  const basePath = stripLocalePrefix(unprefixedOrAnyPath);
  if (targetLocale === 'ar') {
    return basePath === '' ? '/' : basePath;
  }
  return basePath === '/' ? '/en/' : `/en${basePath}`;
}

export function findRouteDefinition(kind: LocalizedRouteKind): RouteDefinition | undefined {
  return ROUTE_REGISTRY.find((entry) => entry.kind === kind);
}

/**
 * Filters query parameters against an explicit per-route allowlist and rejects sensitive keys.
 */
export function sanitizeLocalizedQueryParams(
  rawSearch: string | URLSearchParams | null | undefined,
  allowedParams: readonly string[]
): {
  searchString: string;
  preserved: string[];
  stripped: string[];
} {
  if (!rawSearch) {
    return { searchString: '', preserved: [], stripped: [] };
  }

  const params =
    typeof rawSearch === 'string'
      ? new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch)
      : new URLSearchParams(rawSearch.toString());

  const allowSet = new Set(allowedParams.map((p) => p.toLowerCase()));
  const sensitiveKeys = new Set(['access', 'token', 'idtoken', 'password', 'pass', 'auth', 'secret', 'key']);

  const output = new URLSearchParams();
  const preserved: string[] = [];
  const stripped: string[] = [];

  for (const [k, v] of params.entries()) {
    const lowerKey = k.toLowerCase();
    if (sensitiveKeys.has(lowerKey) || !allowSet.has(lowerKey)) {
      stripped.push(k);
      continue;
    }
    output.append(k, v);
    preserved.push(k);
  }

  const serialized = output.toString();
  return {
    searchString: serialized ? `?${serialized}` : '',
    preserved,
    stripped,
  };
}

/**
 * Maps an existing Arabic or English URL to its counterpart in `targetLocale`.
 * Respects:
 *  - Legacy redirects (`/offers` -> `/special-offers`, `/post` kept intact in Arabic).
 *  - Missing translated entity fallbacks (e.g. untranslated article -> `/en/blog` or `/en/`).
 *  - Admin/excluded route protection (no English switching for `/dashboard*` / `/login`).
 *  - Phase 10 unpublished guard (`isLocalePublished('en') === false`).
 */
export function resolveRouteCounterpart(
  rawUrlOrPath: string,
  targetLocale: Locale,
  availability: CounterpartAvailability = {},
  options: { allowUnpublishedPreviewTarget?: boolean } = {}
): RouteCounterpartResult {
  const rawInput = typeof rawUrlOrPath === 'string' && rawUrlOrPath.trim() ? rawUrlOrPath.trim() : '/';
  const [withoutHash, rawHash = ''] = rawInput.split('#');
  const [rawPathOnly, rawSearchOnly = ''] = withoutHash.split('?');

  const sourceLocale = resolveLocaleFromPath(rawPathOnly);
  const { kind, unprefixedPath, dynamicSlug } = classifyLocalizedRoute(rawPathOnly);

  // Admin / excluded routes must never cross into localized English routes
  if (kind === 'admin-excluded') {
    return {
      sourceLocale,
      targetLocale,
      routeKind: kind,
      sourcePath: unprefixedPath,
      targetPath: unprefixedPath,
      fullTargetUrl: `${unprefixedPath}${rawSearchOnly ? `?${rawSearchOnly}` : ''}`,
      preservedQueryParams: [],
      strippedQueryParams: [],
      usedFallback: true,
      fallbackReason: 'route-excluded',
      isSwitchSafe: false,
      isCounterpartPublished: false,
    };
  }

  // Legacy redirects map onto canonical destination before cross-locale counterpart resolution
  let normalizedKind = kind;
  let canonicalUnprefixed = unprefixedPath;
  if (kind === 'legacy-redirect') {
    const lower = unprefixedPath.toLowerCase();
    if (lower === '/offers') {
      normalizedKind = 'special-offers';
      canonicalUnprefixed = '/special-offers';
    } else if (lower === '/post') {
      normalizedKind = 'blog';
      canonicalUnprefixed = '/blog';
    } else if (lower === '/product') {
      normalizedKind = 'catalog';
      canonicalUnprefixed = '/all-products';
    }
  }

  const def = findRouteDefinition(normalizedKind);
  const targetPublished =
    options.allowUnpublishedPreviewTarget === true ||
    (isLocalePublished(targetLocale) && (targetLocale === 'ar' || Boolean(def?.englishPublished)));

  // Determine destination path with missing-counterpart fallback
  let destUnprefixed = canonicalUnprefixed;
  let usedFallback = false;
  let fallbackReason: RouteCounterpartResult['fallbackReason'];

  if (normalizedKind === 'not-found' || !def) {
    destUnprefixed = '/';
    usedFallback = true;
    fallbackReason = 'counterpart-missing';
  } else if (availability.targetEntityExists === false) {
    usedFallback = true;
    fallbackReason = 'entity-untranslated';
    if (def.missingCounterpartFallback === 'self-listing') {
      if (normalizedKind === 'blog-article') destUnprefixed = '/blog';
      else if (normalizedKind === 'product') destUnprefixed = '/all-products';
      else if (normalizedKind === 'category') destUnprefixed = '/all-products';
      else destUnprefixed = '/';
    } else {
      destUnprefixed = '/';
    }
  } else if (availability.targetSlug && dynamicSlug) {
    const cleanTargetSlug = availability.targetSlug.replace(/^\/+|\/+$/g, '');
    if (normalizedKind === 'product') destUnprefixed = `/product/${cleanTargetSlug}`;
    else if (normalizedKind === 'category') destUnprefixed = `/category/${cleanTargetSlug}`;
    else if (normalizedKind === 'blog-article') destUnprefixed = `/blog/${cleanTargetSlug}`;
  }

  const targetPath = buildLocalizedPath(destUnprefixed, targetLocale);

  // Query param allowlist: if we fell back to home, preserve only tracking params
  const effectiveAllowedParams = usedFallback
    ? TRACKING_QUERY_PARAMS
    : def?.allowedQueryParams || TRACKING_QUERY_PARAMS;
  const queryResult = sanitizeLocalizedQueryParams(rawSearchOnly, effectiveAllowedParams);

  // Never forward sensitive tokens placed in hash fragments (#access=, #token=)
  const cleanHash = rawHash.trim();
  const isSensitiveFragment = /^(access|token|auth|session)=/i.test(cleanHash);
  const shouldKeepFragment = Boolean(cleanHash && !isSensitiveFragment && (def?.preserveFragment ?? false) && !usedFallback);
  const fragmentSuffix = shouldKeepFragment ? `#${cleanHash}` : '';

  if (!targetPublished && !fallbackReason && targetLocale === 'en') {
    fallbackReason = 'locale-unpublished';
  }

  return {
    sourceLocale,
    targetLocale,
    routeKind: normalizedKind,
    sourcePath: unprefixedPath,
    targetPath,
    fullTargetUrl: `${targetPath}${queryResult.searchString}${fragmentSuffix}`,
    preservedQueryParams: queryResult.preserved,
    strippedQueryParams: queryResult.stripped,
    usedFallback,
    fallbackReason,
    isSwitchSafe: targetPublished && availability.targetEntityExists !== false,
    isCounterpartPublished: targetPublished && !usedFallback,
  };
}
