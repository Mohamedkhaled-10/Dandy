import test from 'node:test';
import assert from 'node:assert/strict';
import { getIconSvg, isSupportedIcon } from './icons';
import {
  normalizeToastOptions,
  sanitizeActionUrl,
  DEFAULT_TOAST_DURATION,
  DEFAULT_ERROR_DURATION,
} from './toast';

test('icons registry returns uniform Lucide SVG markup for valid icon names', () => {
  assert.equal(isSupportedIcon('shopping-bag'), true);
  const svg = getIconSvg('shopping-bag', { size: 20, className: 'test-cls' });
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="20" height="20"/);
  assert.match(svg, /stroke="currentColor"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /class="dandy-icon test-cls"/);
});

test('icons registry safely escapes attributes and falls back on unknown icon names', () => {
  assert.equal(isSupportedIcon('<script>alert(1)</script>'), false);
  const svg = getIconSvg('<script>' as never, { ariaLabel: 'بحث "سريع"' });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /role="img" aria-label="بحث &quot;سريع&quot;"/);
});

test('sanitizeActionUrl allows relative and http(s) URLs while rejecting unsafe schemes', () => {
  assert.equal(sanitizeActionUrl('/cart'), '/cart');
  assert.equal(sanitizeActionUrl('https://dandy-ebon.vercel.app/cart'), 'https://dandy-ebon.vercel.app/cart');
  assert.equal(sanitizeActionUrl('javascript:alert(1)'), undefined);
  assert.equal(sanitizeActionUrl('data:text/html,hi'), undefined);
  assert.equal(sanitizeActionUrl('   '), undefined);
});

test('normalizeToastOptions validates types, durations, and safe action links', () => {
  assert.equal(normalizeToastOptions('   '), null);

  const success = normalizeToastOptions({
    message: 'تمت إضافة المنتج إلى حقيبتك',
    type: 'success',
    actionLabel: 'عرض السلة',
    actionUrl: '/cart',
  });
  assert.deepEqual(success, {
    message: 'تمت إضافة المنتج إلى حقيبتك',
    type: 'success',
    duration: DEFAULT_TOAST_DURATION,
    actionLabel: 'عرض السلة',
    actionUrl: '/cart',
    dismissible: true,
  });

  const error = normalizeToastOptions({
    message: 'حدث خطأ',
    type: 'error',
    actionLabel: 'رابط ضار',
    actionUrl: 'javascript:void(0)',
    dismissible: false,
  });
  assert.deepEqual(error, {
    message: 'حدث خطأ',
    type: 'error',
    duration: DEFAULT_ERROR_DURATION,
    actionLabel: undefined,
    actionUrl: undefined,
    dismissible: false,
  });
});
