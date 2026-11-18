/**
 * ============================================================================
 * DANDY COSMETICS — TYPE-SAFE TRANSLATION ACCESSOR (PHASE 10)
 * Pure SSR-compatible lookup engine with interpolation, explicit missing-key
 * detection, and zero browser-only dependencies.
 * ============================================================================
 */

import { DEFAULT_LOCALE } from './config';
import { AR_MESSAGES } from './messages/ar';
import { EN_MESSAGES } from './messages/en';
import type {
  DeepPartial,
  Locale,
  TranslationCatalog,
  TranslationKey,
  TranslationLookupResult,
} from './types';

function readNestedKey(
  catalog: DeepPartial<TranslationCatalog> | TranslationCatalog,
  key: string
): string | undefined {
  const dotIdx = key.indexOf('.');
  if (dotIdx <= 0) return undefined;
  const ns = key.slice(0, dotIdx) as keyof TranslationCatalog;
  const field = key.slice(dotIdx + 1);
  if (!ns || !field || field.includes('.')) return undefined;

  const group = catalog[ns] as Record<string, unknown> | undefined;
  if (!group || typeof group !== 'object') return undefined;
  const val = group[field];
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

function interpolateParams(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => {
    if (Object.prototype.hasOwnProperty.call(params, token)) {
      return String(params[token]);
    }
    return match;
  });
}

export interface TranslateOptions {
  params?: Record<string, string | number>;
  /**
   * Controls missing-translation behavior:
   * - 'explicit-marker' (default for 'en' to avoid silent mixed Arabic/English leaks)
   * - 'arabic-fallback' (safe fallback when caller explicitly permits Arabic baseline)
   */
  missingStrategy?: 'explicit-marker' | 'arabic-fallback';
}

export function getMessagesForLocale(
  locale: Locale
): DeepPartial<TranslationCatalog> {
  return locale === 'en' ? EN_MESSAGES : AR_MESSAGES;
}

export function hasTranslation(locale: Locale, key: TranslationKey | string): boolean {
  const catalog = getMessagesForLocale(locale);
  return readNestedKey(catalog, key) !== undefined;
}

/**
 * Resolves a translation key with explicit diagnostic metadata (`isTranslated`,
 * `fallbackUsed`, `missingKey`), guaranteeing no raw `undefined` return values.
 */
export function resolveTranslation(
  locale: Locale,
  key: TranslationKey | string,
  options: TranslateOptions = {}
): TranslationLookupResult {
  const targetCatalog = getMessagesForLocale(locale);
  const directValue = readNestedKey(targetCatalog, key);

  if (directValue !== undefined) {
    return {
      key,
      locale,
      text: interpolateParams(directValue, options.params),
      isTranslated: true,
      fallbackUsed: false,
      missingKey: false,
    };
  }

  const arabicBaseline = readNestedKey(AR_MESSAGES, key);
  if (arabicBaseline === undefined) {
    // Unknown / invalid key not present even in Arabic source of truth
    return {
      key,
      locale,
      text: `[missing-key:${key}]`,
      isTranslated: false,
      fallbackUsed: false,
      missingKey: true,
    };
  }

  if (locale === DEFAULT_LOCALE || options.missingStrategy === 'arabic-fallback') {
    return {
      key,
      locale,
      text: interpolateParams(arabicBaseline, options.params),
      isTranslated: locale === DEFAULT_LOCALE,
      fallbackUsed: locale !== DEFAULT_LOCALE,
      missingKey: locale !== DEFAULT_LOCALE,
    };
  }

  // Explicit untranslated indicator for target locales prevents accidental mixed language leakage
  return {
    key,
    locale,
    text: `[untranslated:${locale}:${key}]`,
    isTranslated: false,
    fallbackUsed: false,
    missingKey: true,
  };
}

/**
 * Concise translation accessor `t(locale, key, params?)`.
 */
export function t(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
  options?: Omit<TranslateOptions, 'params'>
): string {
  return resolveTranslation(locale, key, { ...options, params }).text;
}
