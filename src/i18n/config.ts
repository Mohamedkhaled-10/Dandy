/**
 * ============================================================================
 * DANDY COSMETICS — CENTRALIZED LOCALE CONFIGURATION (PHASE 10)
 * Defines supported locales ('ar' default RTL, 'en' prepared LTR), directionality,
 * formatting tags, URL prefix policy, and controlled Phase 10 publication flags.
 * ============================================================================
 */

import type { Direction, Locale, LocaleConfig } from './types';

export const DEFAULT_LOCALE: Locale = 'ar';
export const SUPPORTED_LOCALES: readonly Locale[] = ['ar', 'en'] as const;

export const LOCALE_CONFIGS: Readonly<Record<Locale, LocaleConfig>> = {
  ar: {
    code: 'ar',
    htmlLang: 'ar',
    dir: 'rtl',
    intlLocale: 'ar-EG',
    ogLocale: 'ar_EG',
    currencyCode: 'EGP',
    isDefault: true,
    routePrefix: '',
    isPubliclyPublished: true,
    labelNative: 'العربية',
    labelArabic: 'العربية',
    labelEnglish: 'Arabic',
  },
  en: {
    code: 'en',
    htmlLang: 'en',
    dir: 'ltr',
    intlLocale: 'en-EG',
    ogLocale: 'en_US',
    currencyCode: 'EGP',
    isDefault: false,
    routePrefix: '/en',
    /** Published in Phase 11: full English LTR storefront under /en/. */
    isPubliclyPublished: true,
    labelNative: 'English',
    labelArabic: 'الإنجليزية',
    labelEnglish: 'English',
  },
};

export function isSupportedLocale(value: unknown): value is Locale {
  return value === 'ar' || value === 'en';
}

export function getLocaleConfig(locale?: string | null): LocaleConfig {
  if (typeof locale === 'string') {
    const normalized = locale.trim().toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_')) {
      return LOCALE_CONFIGS.en;
    }
    if (normalized === 'ar' || normalized.startsWith('ar-') || normalized.startsWith('ar_')) {
      return LOCALE_CONFIGS.ar;
    }
  }
  return LOCALE_CONFIGS[DEFAULT_LOCALE];
}

export function getLocaleDirection(locale?: Locale | string | null): Direction {
  return getLocaleConfig(locale).dir;
}

export function getDocumentAttributes(locale?: Locale | string | null): {
  lang: Locale;
  dir: Direction;
} {
  const cfg = getLocaleConfig(locale);
  return {
    lang: cfg.htmlLang,
    dir: cfg.dir,
  };
}

export function isLocalePublished(locale: Locale): boolean {
  return LOCALE_CONFIGS[locale]?.isPubliclyPublished === true;
}

export function getOppositeLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}
