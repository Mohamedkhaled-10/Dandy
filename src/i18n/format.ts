/**
 * ============================================================================
 * DANDY COSMETICS — LOCALE-AWARE NUMBER, CURRENCY, DATE & UNIT FORMATTING
 * Uses native Intl APIs ('ar-EG' / 'en-EG') with strict numeric-source inputs.
 * Never alters commercial calculations or re-parses formatted strings.
 * Preserves EGP as the sole store currency.
 * ============================================================================
 */

import { getLocaleConfig } from './config';
import type { Locale } from './types';

function toFiniteNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function formatNumber(
  value: number | string | null | undefined,
  locale: Locale = 'ar',
  options?: Intl.NumberFormatOptions
): string {
  const safeNum = toFiniteNumber(value, 0);
  const cfg = getLocaleConfig(locale);
  // Keep Latin digits consistently clean across Arabic & English commerce numbers
  const intlTag = locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG';
  try {
    return new Intl.NumberFormat(intlTag, options).format(safeNum);
  } catch {
    try {
      return new Intl.NumberFormat(cfg.intlLocale, options).format(safeNum);
    } catch {
      return String(safeNum);
    }
  }
}

/**
 * Formats Egyptian Pounds (`ج.م` in Arabic, `EGP` in English) strictly from a numeric price.
 */
export function formatCurrencyEgp(
  amount: number | string | null | undefined,
  locale: Locale = 'ar',
  options: { decimals?: number } = {}
): string {
  const safeNum = toFiniteNumber(amount, 0);
  const decimals = typeof options.decimals === 'number' ? Math.max(0, options.decimals) : 0;
  const rounded = decimals === 0 ? Math.round(safeNum) : Number(safeNum.toFixed(decimals));

  const formattedNum = formatNumber(rounded, locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return locale === 'en' ? `${formattedNum} EGP` : `${formattedNum} ج.م`;
}

export function formatPercent(
  percent: number | string | null | undefined,
  locale: Locale = 'ar'
): string {
  const safe = Math.max(0, Math.round(toFiniteNumber(percent, 0)));
  const numStr = formatNumber(safe, locale, { maximumFractionDigits: 0 });
  return `${numStr}%`;
}

export function formatQuantity(
  quantity: number | string | null | undefined,
  locale: Locale = 'ar'
): string {
  const safe = Math.max(0, Math.floor(toFiniteNumber(quantity, 0)));
  const numStr = formatNumber(safe, locale, { maximumFractionDigits: 0 });
  if (locale === 'en') {
    return safe === 1 ? `${numStr} item` : `${numStr} items`;
  }
  return safe === 1 ? `${numStr} قطعة` : `${numStr} قطع`;
}

export function formatDate(
  input: Date | number | string | null | undefined,
  locale: Locale = 'ar',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  if (input === null || input === undefined || input === '') return '—';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';

  const intlTag = locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(intlTag, options).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatDateTime(
  input: Date | number | string | null | undefined,
  locale: Locale = 'ar'
): string {
  return formatDate(input, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats mixed measurement labels safely using Unicode isolate characters (`\u2066...\u2069`)
 * so units like `30 ml` or `150 gm` never invert next to Arabic words inside RTL sentences.
 */
export function formatMixedMeasurement(
  value: number,
  unit: 'ml' | 'gm' | 'tola',
  locale: Locale = 'ar'
): string {
  const safe = toFiniteNumber(value, 0);
  if (locale === 'en') {
    const label = unit === 'tola' ? (safe === 1 ? 'tola' : 'tolas') : unit;
    return `${formatNumber(safe, 'en')} ${label}`;
  }
  const arUnit = unit === 'ml' ? 'مل' : unit === 'gm' ? 'جم' : safe === 1 ? 'تولة' : 'تولات';
  return `\u2066${formatNumber(safe, 'ar')} ${arUnit}\u2069`;
}
