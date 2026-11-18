import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEntranceDelayMs,
  computeStaggerDelayMs,
  getMotionProfile,
  isExcludedMotionRoute,
  isRectInInitialViewport,
  shouldEnableMotion,
} from './page-entrance';

test('isExcludedMotionRoute blocks admin, login, api, and studio preview routes', () => {
  assert.equal(isExcludedMotionRoute('/dashboard'), true);
  assert.equal(isExcludedMotionRoute('/dashboard-index'), true);
  assert.equal(isExcludedMotionRoute('/dashboard-order'), true);
  assert.equal(isExcludedMotionRoute('/statues'), true);
  assert.equal(isExcludedMotionRoute('/login'), true);
  assert.equal(isExcludedMotionRoute('/api/health'), true);
  assert.equal(isExcludedMotionRoute('/', '?studio_preview=1'), true);

  assert.equal(isExcludedMotionRoute('/'), false);
  assert.equal(isExcludedMotionRoute('/all-products'), false);
  assert.equal(isExcludedMotionRoute('/category/skin-care'), false);
  assert.equal(isExcludedMotionRoute('/product/facial-serum-3x1-30ml'), false);
  assert.equal(isExcludedMotionRoute('/cart'), false);
  assert.equal(isExcludedMotionRoute('/account-login'), false);
});

test('shouldEnableMotion respects reduced motion, IntersectionObserver, bfcache, and route exclusions', () => {
  assert.equal(
    shouldEnableMotion({
      pathname: '/',
      reducedMotion: false,
      hasIntersectionObserver: true,
      isPersistedHistory: false,
    }),
    true
  );

  assert.equal(
    shouldEnableMotion({
      pathname: '/',
      reducedMotion: true,
      hasIntersectionObserver: true,
      isPersistedHistory: false,
    }),
    false
  );

  assert.equal(
    shouldEnableMotion({
      pathname: '/',
      reducedMotion: false,
      hasIntersectionObserver: false,
      isPersistedHistory: false,
    }),
    false
  );

  assert.equal(
    shouldEnableMotion({
      pathname: '/all-products',
      reducedMotion: false,
      hasIntersectionObserver: true,
      isPersistedHistory: true,
    }),
    false
  );

  assert.equal(
    shouldEnableMotion({
      pathname: '/dashboard-product',
      reducedMotion: false,
      hasIntersectionObserver: true,
    }),
    false
  );
});

test('getMotionProfile returns calm, editorial, and expressive timings accurately', () => {
  const calm = getMotionProfile('calm');
  const editorial = getMotionProfile('editorial');
  const expressive = getMotionProfile('expressive');
  const fallback = getMotionProfile(undefined);

  assert.equal(calm.name, 'calm');
  assert.ok(calm.durationMs < editorial.durationMs);
  assert.ok(calm.distancePx < editorial.distancePx);
  assert.equal(expressive.name, 'expressive');
  assert.equal(fallback.name, 'editorial');
});

test('computeStaggerDelayMs batches large grids so 32+ cards never accumulate long delays', () => {
  const editorial = getMotionProfile('editorial');
  const delays = Array.from({ length: 32 }, (_, idx) => computeStaggerDelayMs(idx, editorial, 4));

  assert.deepEqual(delays.slice(0, 4), [0, 45, 90, 135]);
  assert.deepEqual(delays.slice(4, 8), [0, 45, 90, 135]);
  assert.ok(Math.max(...delays) <= editorial.maxDelayMs);
});

test('computeEntranceDelayMs clamps entrance stagger within maxDelayMs', () => {
  const expressive = getMotionProfile('expressive');
  assert.equal(computeEntranceDelayMs(0, expressive), 0);
  assert.equal(computeEntranceDelayMs(1, expressive), 55);
  assert.equal(computeEntranceDelayMs(20, expressive), expressive.maxDelayMs);
});

test('isRectInInitialViewport detects above-the-fold vs below-the-fold rectangles', () => {
  assert.equal(isRectInInitialViewport({ top: 80, bottom: 420, height: 340 }, 900), true);
  assert.equal(isRectInInitialViewport({ top: 920, bottom: 1320, height: 400 }, 900), false);
  assert.equal(isRectInInitialViewport({ top: -500, bottom: -10, height: 490 }, 900), false);
  assert.equal(isRectInInitialViewport({ top: 100, bottom: 100, height: 0 }, 900), false);
});
