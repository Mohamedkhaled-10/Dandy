/**
 * ============================================================================
 * DANDY COSMETICS — LOCALE-AWARE SEO, CANONICAL, HREFLANG & SITEMAP HELPERS
 *
 * Strict SEO Guardrails:
 *  - During Phase 10, `isLocalePublished('en') === false`, so:
 *     * `buildHreflangAlternates()` returns `[]` (no hreflang tags emitted yet).
 *     * `buildCanonicalUrl()` preserves current unprefixed Arabic URLs identically.
 *     * `filterPublishableSitemapUrls()` excludes any `/en/` routes.
 *  - When English routes become published in Phase 11:
 *     * `hreflang="ar"`, `hreflang="en"`, and `hreflang="x-default"` (canonical Arabic)
 *       are emitted ONLY when a real translated counterpart exists.
 * ============================================================================
 */

import { SITE_URL } from '../utils/products';
import { getDocumentAttributes, getLocaleConfig, isLocalePublished } from './config';
import { buildLocalizedPath, classifyLocalizedRoute, resolveRouteCounterpart, stripLocalePrefix } from './routes';
import type { CounterpartAvailability, HreflangAlternate, Locale, LocalizedSeoMetadata } from './types';

export interface CanonicalBuildOptions {
  siteUrl?: string;
  forceLocale?: Locale;
  allowUnpublishedEnCanonical?: boolean;
}

export function buildCanonicalUrl(
  rawPathname: string,
  options: CanonicalBuildOptions = {}
): string {
  const baseOrigin = (options.siteUrl || SITE_URL).replace(/\/+$/, '');
  const unprefixed = stripLocalePrefix(rawPathname);
  const { kind } = classifyLocalizedRoute(unprefixed);

  const requestedLocale: Locale =
    options.forceLocale || (/^\/en(\/|$)/i.test((rawPathname || '').trim()) ? 'en' : 'ar');

  const canUseEn =
    requestedLocale === 'en' &&
    (options.allowUnpublishedEnCanonical === true || isLocalePublished('en'));

  const targetLocale: Locale = canUseEn ? 'en' : 'ar';

  if (kind === 'home' && targetLocale === 'ar') {
    return `${baseOrigin}/`;
  }

  const localizedPath = buildLocalizedPath(unprefixed, targetLocale);
  return `${baseOrigin}${localizedPath === '/' ? '/' : localizedPath}`;
}

export interface HreflangBuildOptions {
  siteUrl?: string;
  targetEntityExists?: boolean;
  targetSlug?: string;
  /** Strictly for unit testing Phase 11 publication behavior in isolated fixtures. */
  enPublishedOverride?: boolean;
}

/**
 * Generates strict reciprocal `hreflang` alternates (`ar`, `en`, `x-default`).
 * Returns `[]` whenever English is unpublished (Phase 10) or the counterpart is missing.
 */
export function buildHreflangAlternates(
  rawPathname: string,
  options: HreflangBuildOptions = {}
): HreflangAlternate[] {
  const isEnPublished =
    typeof options.enPublishedOverride === 'boolean'
      ? options.enPublishedOverride
      : isLocalePublished('en');

  if (!isEnPublished) {
    return [];
  }

  const baseOrigin = (options.siteUrl || SITE_URL).replace(/\/+$/, '');
  const { kind } = classifyLocalizedRoute(rawPathname);
  if (kind === 'admin-excluded' || kind === 'not-found' || kind === 'legacy-redirect') {
    return [];
  }

  const availability: CounterpartAvailability = {
    targetEntityExists: options.targetEntityExists,
    targetSlug: options.targetSlug,
  };

  const arResult = resolveRouteCounterpart(rawPathname, 'ar', availability, {
    allowUnpublishedPreviewTarget: true,
  });
  const enResult = resolveRouteCounterpart(rawPathname, 'en', availability, {
    allowUnpublishedPreviewTarget: true,
  });

  if (arResult.usedFallback || enResult.usedFallback || !arResult.isSwitchSafe || !enResult.isSwitchSafe) {
    return [];
  }

  const arHref = `${baseOrigin}${arResult.targetPath}`;
  const enHref = `${baseOrigin}${enResult.targetPath}`;

  return [
    { hreflang: 'ar', href: arHref },
    { hreflang: 'en', href: enHref },
    { hreflang: 'x-default', href: arHref },
  ];
}

export interface BuildLocalizedSeoInput {
  pathname: string;
  locale: Locale;
  title: string;
  description: string;
  keywords?: string;
  robots?: string;
  siteUrl?: string;
  targetEntityExists?: boolean;
  targetSlug?: string;
  enPublishedOverride?: boolean;
}

export function buildLocalizedSeoMetadata(input: BuildLocalizedSeoInput): LocalizedSeoMetadata {
  const cfg = getLocaleConfig(input.locale);
  const attrs = getDocumentAttributes(input.locale);

  const canonical = buildCanonicalUrl(input.pathname, {
    siteUrl: input.siteUrl,
    forceLocale: input.locale,
    allowUnpublishedEnCanonical: input.enPublishedOverride === true,
  });

  const alternates = buildHreflangAlternates(input.pathname, {
    siteUrl: input.siteUrl,
    targetEntityExists: input.targetEntityExists,
    targetSlug: input.targetSlug,
    enPublishedOverride: input.enPublishedOverride,
  });

  const oppositeLocale: Locale = input.locale === 'ar' ? 'en' : 'ar';
  const oppositeOg = getLocaleConfig(oppositeLocale).ogLocale;

  return {
    locale: input.locale,
    dir: attrs.dir,
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    canonical,
    robots: input.robots || 'index, follow',
    ogLocale: cfg.ogLocale,
    ogLocaleAlternates: alternates.length > 0 ? [oppositeOg] : [],
    alternates,
  };
}

export function buildLocalizedWebPageJsonLd(input: {
  locale: Locale;
  canonicalUrl: string;
  name: string;
  description: string;
  siteUrl?: string;
}): Record<string, unknown> {
  const origin = (input.siteUrl || SITE_URL).replace(/\/+$/, '');
  const attrs = getDocumentAttributes(input.locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${input.canonicalUrl}#webpage`,
    url: input.canonicalUrl,
    name: input.name,
    description: input.description,
    inLanguage: attrs.lang,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: input.locale === 'en' ? 'Dandy Cosmetics' : 'Dandy Cosmetics | داندي كوزمتكس',
      url: `${origin}/`,
    },
  };
}

export function buildLocalizedBreadcrumbJsonLd(input: {
  locale: Locale;
  canonicalUrl: string;
  items: Array<{ name: string; pathOrUrl: string }>;
  siteUrl?: string;
}): Record<string, unknown> {
  const origin = (input.siteUrl || SITE_URL).replace(/\/+$/, '');
  const homeLabel = input.locale === 'en' ? 'Home' : 'الرئيسية';
  const homeUrl = input.locale === 'en' ? `${origin}/en/` : `${origin}/`;

  const resolvedItems = [
    { name: homeLabel, url: homeUrl },
    ...input.items.map((item) => ({
      name: item.name,
      url: /^https?:\/\//i.test(item.pathOrUrl)
        ? item.pathOrUrl
        : `${origin}${item.pathOrUrl.startsWith('/') ? item.pathOrUrl : `/${item.pathOrUrl}`}`,
    })),
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${input.canonicalUrl}#breadcrumb`,
    itemListElement: resolvedItems.map((entry, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: entry.name,
      item: entry.url,
    })),
  };
}

/**
 * Compatibility guard ensuring sitemap builders exclude `/en/` URLs while English is unpublished.
 */
export function filterPublishableSitemapUrls(
  urls: readonly string[],
  options: { enPublishedOverride?: boolean } = {}
): string[] {
  const isEnPublished =
    typeof options.enPublishedOverride === 'boolean'
      ? options.enPublishedOverride
      : isLocalePublished('en');

  if (isEnPublished) {
    return [...urls];
  }

  return urls.filter((rawUrl) => {
    try {
      const path = /^https?:\/\//i.test(rawUrl) ? new URL(rawUrl).pathname : rawUrl;
      return path !== '/en' && !path.startsWith('/en/');
    } catch {
      return true;
    }
  });
}
