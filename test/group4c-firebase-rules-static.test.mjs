import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RTDB_RULES_PATH = path.join(ROOT, 'firebase/database.rules.json');
const FIRESTORE_RULES_PATH = path.join(ROOT, 'firebase/firestore.rules');

const EXPECTED_ADMIN_EXPR = "auth != null && auth.token.email == 'admin@dandy.com' && auth.token.email_verified == true";

function loadRtdbRules() {
  const raw = fs.readFileSync(RTDB_RULES_PATH, 'utf8');
  return JSON.parse(raw);
}

function loadFirestoreRules() {
  return fs.readFileSync(FIRESTORE_RULES_PATH, 'utf8');
}

function collectRuleStrings(node, currentPath = '') {
  const results = [];
  if (!node || typeof node !== 'object') return results;
  for (const [key, value] of Object.entries(node)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (key === '.read' || key === '.write' || key === '.validate') {
      results.push({ path: nextPath, ruleKey: key, value });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      results.push(...collectRuleStrings(value, nextPath));
    }
  }
  return results;
}

test('RTDB rules file parses as valid JSON with top-level rules object', () => {
  const parsed = loadRtdbRules();
  assert.equal(typeof parsed, 'object');
  assert.ok(parsed.rules && typeof parsed.rules === 'object' && !Array.isArray(parsed.rules));
});

test('RTDB rules require email_verified == true for every admin@dandy.com check', () => {
  const { rules } = loadRtdbRules();
  const allRules = collectRuleStrings(rules);
  const adminMatches = allRules.filter(
    (entry) => typeof entry.value === 'string' && entry.value.includes("admin@dandy.com")
  );
  assert.ok(adminMatches.length > 0, 'Expected admin@dandy.com rules to exist');
  for (const entry of adminMatches) {
    assert.ok(
      entry.value.includes("auth.token.email_verified == true"),
      `Rule at ${entry.path} checks admin@dandy.com without requiring auth.token.email_verified == true: ${entry.value}`
    );
  }
});

test('RTDB rules preserve public catalog reads and block all non-admin writes', () => {
  const { rules } = loadRtdbRules();

  assert.equal(rules.homepage['.read'], true);
  assert.equal(rules.homepage['.write'], EXPECTED_ADMIN_EXPR);

  assert.equal(rules.categories['.read'], true);
  assert.equal(rules.categories['.write'], EXPECTED_ADMIN_EXPR);

  assert.equal(rules.testimonials['.read'], true);
  assert.equal(rules.testimonials['.write'], EXPECTED_ADMIN_EXPR);

  assert.equal(rules.products['.read'], true);
  assert.deepEqual(rules.products['.indexOn'], ['slug']);
  assert.equal(rules.products['.write'], EXPECTED_ADMIN_EXPR);

  // Ensure legacy client write exceptions on products/$productId children were removed
  assert.equal(rules.products['$productId'], undefined);
});

test('RTDB orders rules block public reads, invoiceCode queries, $orderId reads, and all client writes', () => {
  const { rules } = loadRtdbRules();
  const orders = rules.orders;
  assert.ok(orders, 'orders rules must exist');

  assert.equal(orders['.write'], false);
  assert.deepEqual(orders['.indexOn'], ['phone', 'customerId', 'invoiceCode']);
  assert.equal(orders['$orderId'], undefined, 'Must not expose $orderId public read or write overrides');

  assert.equal(typeof orders['.read'], 'string');
  assert.ok(!orders['.read'].includes('invoiceCode'), 'Public invoiceCode query must be removed from orders/.read');
  assert.ok(!orders['.read'].includes('phone'), 'Phone must never be used for public/customer orders/.read');
  assert.ok(orders['.read'].includes("auth.token.email == 'admin@dandy.com' && auth.token.email_verified == true"));
  assert.ok(orders['.read'].includes("query.orderByChild == 'customerId' && query.equalTo == auth.uid"));
});

test('RTDB customers rules protect customer privacy, keep phone immutable to non-admin, avoid email_verified on customers, and block self-deletion of customers/$uid', () => {
  const { rules } = loadRtdbRules();
  const custUid = rules.customers?.['$uid'];
  assert.ok(custUid, 'customers/$uid rules must exist');

  assert.ok(!custUid['.read'].includes('auth.uid == $uid && auth.token.email_verified'), 'Must not require email_verified for customer own reads');
  assert.ok(!custUid['.write'].includes('auth.uid == $uid && auth.token.email_verified'), 'Must not require email_verified for customer own writes');

  assert.ok(custUid['.read'].includes('auth.uid == $uid'));
  assert.ok(custUid['.read'].includes("auth.token.email == 'admin@dandy.com' && auth.token.email_verified == true"));

  assert.ok(custUid['.write'].includes('auth.uid == $uid && newData.exists()'), 'Customer must not be allowed to delete entire customers/$uid node');
  assert.ok(custUid['.write'].includes("auth.token.email == 'admin@dandy.com' && auth.token.email_verified == true"));

  assert.ok(custUid.phone?.['.validate']?.includes("auth.token.email_verified == true"));
  assert.ok(custUid.phone?.['.validate']?.includes('newData.val() == data.val()'));
});

test('RTDB wishlists rules restrict access strictly to owner or verified admin', () => {
  const { rules } = loadRtdbRules();
  const wishUid = rules.wishlists?.['$uid'];
  assert.ok(wishUid, 'wishlists/$uid rules must exist');
  assert.equal(
    wishUid['.read'],
    "auth != null && (auth.uid == $uid || (auth.token.email == 'admin@dandy.com' && auth.token.email_verified == true))"
  );
  assert.equal(
    wishUid['.write'],
    "auth != null && (auth.uid == $uid || (auth.token.email == 'admin@dandy.com' && auth.token.email_verified == true))"
  );
});

test('RTDB reviews rules allow public reads per product and block all direct client writes', () => {
  const { rules } = loadRtdbRules();
  assert.equal(rules.reviews['.write'], false);
  assert.equal(rules.reviews['$productId']['.read'], true);
  assert.equal(rules.reviews['$productId']['$customerId']['.write'], false);
});

test('RTDB settings, internal private paths, notifications_outbox, _archive, and default deny are locked down', () => {
  const { rules } = loadRtdbRules();

  // Root default deny + wildcard default deny
  assert.equal(rules['.read'], false);
  assert.equal(rules['.write'], false);
  assert.deepEqual(rules['$other'], { '.read': false, '.write': false });

  // Settings (including Pink Friday draft/meta/updatedBy/publishedBy) closed to clients
  assert.deepEqual(rules.settings, { '.read': false, '.write': false });

  // Private server-only nodes
  for (const privKey of [
    'privateOrderAccess',
    'privateInvoiceAccess',
    'privateOrderIdempotency',
    'privateRateLimits',
    'privateDeletedOrders'
  ]) {
    assert.deepEqual(rules[privKey], { '.read': false, '.write': false }, `${privKey} must be completely closed`);
  }

  // Notifications outbox closed to clients with indexes preserved
  assert.equal(rules.notifications_outbox['.read'], false);
  assert.equal(rules.notifications_outbox['.write'], false);
  assert.deepEqual(rules.notifications_outbox['.indexOn'], ['orderId', 'timestamp']);

  // _archive restricted to verified admin
  assert.deepEqual(rules._archive, {
    '.read': EXPECTED_ADMIN_EXPR,
    '.write': EXPECTED_ADMIN_EXPR
  });
});

test('Firestore rules enforce verified admin, published-only article reads, protected change_logs, and default deny', () => {
  const fsRules = loadFirestoreRules();

  assert.match(fsRules, /rules_version\s*=\s*'2'\s*;/);
  assert.match(fsRules, /service\s+cloud\.firestore\s*\{/);
  assert.match(fsRules, /function\s+isAdmin\(\)\s*\{[\s\S]*?request\.auth\s*!=\s*null[\s\S]*?request\.auth\.token\.email\s*==\s*'admin@dandy\.com'[\s\S]*?request\.auth\.token\.email_verified\s*==\s*true/);

  // Articles: must not have blanket `allow read: if true;`
  assert.ok(!/match\s+\/articles\/\{articleId\}[\s\S]*?allow\s+read:\s*if\s+true\s*;/.test(fsRules));
  assert.match(
    fsRules,
    /match\s+\/articles\/\{articleId\}\s*\{[\s\S]*?allow\s+read:\s*if\s+isAdmin\(\)\s*\|\|\s*resource\.data\.status\s*==\s*'published'\s*;[\s\S]*?allow\s+write:\s*if\s+isAdmin\(\)\s*;/
  );

  // Change logs: verified admin only
  assert.match(
    fsRules,
    /match\s+\/change_logs\/\{logId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+isAdmin\(\)\s*;/
  );

  // Default deny on catch-all (must NOT allow admin wildcard)
  assert.match(
    fsRules,
    /match\s+\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false\s*;/
  );
});

test('Phase 1 codebase audit: browser pages do not directly write orders, reviews, products stock/ratings, or read settings', () => {
  const browserFiles = [
    'src/pages/cart.astro',
    'src/pages/account.astro',
    'src/pages/account-signup.astro',
    'src/pages/track-order.astro',
    'src/pages/invoice.astro',
    'src/pages/index.astro',
    'src/pages/all-products.astro',
    'src/pages/product/[...slug].astro'
  ];

  for (const rel of browserFiles) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/\.ref\(\s*['"`]orders/.test(content) || rel === 'src/pages/account.astro', `Unexpected orders ref in ${rel}`);
    if (rel === 'src/pages/account.astro') {
      // Only customerId read query allowed on orders
      assert.ok(!/\.ref\(\s*['"`]orders['"`]\s*\)\s*\.\s*(push|set|update|remove)/.test(content));
      assert.ok(!/\.ref\(\s*['"`]orders\//.test(content));
    }
    assert.ok(!/\.ref\(\s*['"`]reviews[^'"`]*['"`]\s*\)\s*\.\s*(push|set|update|remove)/.test(content), `Direct client review write found in ${rel}`);
    assert.ok(!/\.ref\(\s*['"`]products[^'"`]*['"`]\s*\)\s*\.\s*(push|set|update|remove|transaction)/.test(content), `Direct client product write found in ${rel}`);
    assert.ok(!/\.ref\(\s*['"`]settings/.test(content), `Direct client settings ref found in ${rel}`);
  }
});
