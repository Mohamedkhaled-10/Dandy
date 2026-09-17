#!/usr/bin/env node
/**
 * scripts/generate-product-slugs.js
 * 
 * Phase 1 — Deterministic Product Slug Migration & Verification Script
 * Supports --dry-run (default) and --apply modes.
 * 
 * Usage:
 *   node scripts/generate-product-slugs.js           # Dry-run preview
 *   node scripts/generate-product-slugs.js --dry-run # Dry-run preview
 *   node scripts/generate-product-slugs.js --apply   # Persist proposed slugs to Firebase RTDB
 */

const DB_BASE = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';
const SITE_URL = 'https://dandy-ebon.vercel.app';

// Canonical fallback mapping for current 31 products
const CANONICAL_SLUG_MAP = {
  '-OW9U9Af024A9LrbOU4f': 'laser-replacement-cream-60gm',
  '-OW9WB1GTP1GaDoqcd2R': 'treatment-mascara',
  '-OW9YLJvzoW2u9P4ISmA': 'foot-peeling-cream-60gm',
  '-OWF2juQihSL1HV8PwTT': 'nail-serum',
  '-OWF4DCXsfQGlA7OOy11': 'deodorant',
  '-OWF5L62TkM4Y0odMy-l': 'hair-wax-80gm',
  '-OWF6uqnhnu3TCvoqLSD': 'body-and-hair-mist',
  '-OWF8NVhw0HgIaJRVOYL': 'solid-perfume-30gm',
  '-OWF9Deint3XcB6iNdCE': 'tint',
  '-OWFAaqOFptMA4YEPL7p': 'hand-cream-60gm',
  '-O_4D5IO_nPZf1fKcVlJ': 'free-sulfate-shampoo-500ml',
  '-ObKDCc_il_Dz2_Mih-a': 'hair-wax-50gm',
  '-OvPo-cuVeLHWSU8KQ22': 'facial-serum-3x1-30ml',
  '-OvPpP6udx6LlLOL9O34': 'facial-cleanser-150ml',
  '-OvPpguWTAtcaWirD9Um': 'lip-balm',
  '-OvPq4qdTQ-LqYbxr6Yv': 'body-splash-250ml',
  '-OvPqarOBOnNgQ_-kpTl': 'body-butter-150gm',
  '-OvPqzneo_vqpucc-ef8': 'body-splash-25ml',
  '-OvPrFcWZtH_7tuSs7HJ': 'body-splash-100ml',
  '-Ow3pLIN18dRNJ4SdJsq': 'hair-booster-oils-mix',
  '-Ow3pm4awZPtvEZgewr7': 'anti-hair-loss-spray',
  '-Ow3qRPqc7hbleYuJOkI': 'anti-dandruff-shampoo-250ml',
  '-Ox6gMQgCgsSR-DrXTWk': 'anti-hair-loss-shampoo-250ml',
  '-Ox6gklPQABGE7xPcq9a': 'anti-dandruff-spray-60ml',
  '-Ox6hMmd9Ku_sU4d8le-': 'hair-mask-repair-250ml',
  '-Ox6kxYMSw7H675QwVz0': 'anti-dandruff-collection',
  '-Ox6lYUp_xif6WXAHMGO': 'anti-hair-loss-collection',
  '-Ox6sNW3Ki0Am9E6R9n_': 'hair-repair-collection',
  '-Ox6w5wfqsuhTgYlMDBs': 'skin-care-collection',
  '-Ox74e3NwfE2TabGBnUT': 'musk-collection-3-tola-3ml',
  '-OxC877LX3vzD-3Pi_th': 'dandy-musk-6ml'
};

function generateDeterministicSlug(name) {
  if (!name || typeof name !== 'string') return 'product';
  let str = name.trim();

  // 1. Extract unit/volume/weight suffix
  let unitSuffix = '';
  const mlMatch = str.match(/(\d+)\s*(?:مل|ml|ملم)/i);
  const gmMatch = str.match(/(\d+)\s*(?:جرام|جم|g|gm|gram)/i);
  const tolaMatch = str.match(/(\d+)\s*(?:تولة|توله)/i);

  if (mlMatch) unitSuffix = `${mlMatch[1]}ml`;
  else if (gmMatch) unitSuffix = `${gmMatch[1]}gm`;
  else if (tolaMatch) unitSuffix = `${tolaMatch[1]}-tola`;

  // 2. High-priority transliteration map
  const replacements = [
    [/بادي\s*سبلاش/gi, 'body-splash'],
    [/بادي\s*ميست|ميست\s*للشعر\s*والجسم/gi, 'body-and-hair-mist'],
    [/بديل\s*الليزر/gi, 'laser-replacement'],
    [/ماسكارا\s*علاجية/gi, 'treatment-mascara'],
    [/سيروم\s*الأظافر/gi, 'nail-serum'],
    [/مجموعة\s*العناية\s*بالبشرة/gi, 'skin-care-collection'],
    [/مجموعة\s*علاج\s*القشرة/gi, 'anti-dandruff-collection'],
    [/مجموعة\s*علاج\s*التساقط/gi, 'anti-hair-loss-collection'],
    [/مجموعة\s*الترميم/gi, 'hair-repair-collection'],
    [/مجموعة\s*المسك/gi, 'musk-collection'],
    [/مسك\s*داندي/gi, 'dandy-musk'],
    [/سيروم\s*الوجه/gi, 'facial-serum'],
    [/غسول\s*الوجه/gi, 'facial-cleanser'],
    [/مرطب\s*شفاه/gi, 'lip-balm'],
    [/زبدة\s*شيا|زبدة\s*الجسم/gi, 'body-butter'],
    [/مكس\s*الزيوت|ميكس\s*الزيوت/gi, 'hair-booster-oils-mix'],
    [/سبراي\s*التساقط|اسبراي\s*التساقط/gi, 'anti-hair-loss-spray'],
    [/سبراي\s*القشرة|اسبراي\s*القشرة/gi, 'anti-dandruff-spray'],
    [/شامبو\s*التساقط/gi, 'anti-hair-loss-shampoo'],
    [/شامبو\s*القشرة/gi, 'anti-dandruff-shampoo'],
    [/شامبو\s*خالي\s*من\s*السلفات/gi, 'free-sulfate-shampoo'],
    [/حمام\s*كريم|ماسك\s*الترميم/gi, 'hair-mask-repair'],
    [/واكس\s*حواجب|واكس\s*تثبيت/gi, 'hair-wax'],
    [/كريم\s*تقشير/gi, 'foot-peeling-cream'],
    [/كريم\s*يدين|كريم\s*اليدين/gi, 'hand-cream'],
    [/مزيل\s*عرق/gi, 'deodorant'],
    [/مخمرية/gi, 'solid-perfume'],
    [/تنت/gi, 'tint'],
    [/شامبو/gi, 'shampoo'],
    [/سيروم/gi, 'serum'],
    [/كريم/gi, 'cream'],
    [/ماسك/gi, 'mask'],
    [/داندي/gi, 'dandy'],
    [/كوزمتكس/gi, 'cosmetics']
  ];

  let converted = str;
  for (const [regex, rep] of replacements) {
    converted = converted.replace(regex, rep);
  }

  let baseSlug = converted
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!baseSlug) baseSlug = 'product';
  if (unitSuffix && !baseSlug.includes(unitSuffix)) {
    baseSlug = `${baseSlug}-${unitSuffix}`;
  }
  return baseSlug;
}

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log('='.repeat(70));
  console.log(`DANDY COSMETICS — PRODUCT SLUG MIGRATION AUDIT (${isApply ? 'APPLY MODE' : 'DRY RUN'})`);
  console.log('='.repeat(70));

  console.log('\n1. Fetching products from Firebase Realtime Database...');
  const res = await fetch(`${DB_BASE}/products.json`);
  if (!res.ok) {
    console.error('Failed to fetch products:', res.status, res.statusText);
    process.exit(1);
  }

  const productsObj = await res.json();
  const productIds = Object.keys(productsObj || {});
  console.log(`Found ${productIds.length} products in database.\n`);

  const results = [];
  const slugCounts = new Map();

  for (const id of productIds) {
    const p = productsObj[id];
    const name = p.name || 'Unknown Product';
    const currentSlug = p.slug || null;

    // Use deterministic canonical mapping first, then deterministic generator
    let proposedSlug = CANONICAL_SLUG_MAP[id] || (currentSlug ? currentSlug : generateDeterministicSlug(name));

    // Check collisions
    const count = (slugCounts.get(proposedSlug) || 0) + 1;
    slugCounts.set(proposedSlug, count);
    if (count > 1) {
      proposedSlug = `${proposedSlug}-${count}`;
    }

    const hasConflict = currentSlug && currentSlug !== proposedSlug;
    const isNew = !currentSlug;

    results.push({
      id,
      name,
      currentSlug,
      proposedSlug,
      isNew,
      hasConflict,
      oldUrl: `/product?id=${id}`,
      newUrl: `/product/${proposedSlug}`
    });
  }

  // Print Summary Table
  console.log('Product Slug Migration Preview:');
  console.log('-'.repeat(105));
  console.log(
    'ID'.padEnd(23) + ' | ' +
    'Status'.padEnd(10) + ' | ' +
    'Proposed Slug'.padEnd(35) + ' | ' +
    'Product Name'
  );
  console.log('-'.repeat(105));

  for (const r of results) {
    const statusStr = r.isNew ? '[NEW SLUG]' : (r.hasConflict ? '[CONFLICT]' : '[UNCHANGED]');
    console.log(
      r.id.padEnd(23) + ' | ' +
      statusStr.padEnd(10) + ' | ' +
      r.proposedSlug.padEnd(35) + ' | ' +
      r.name
    );
  }
  console.log('-'.repeat(105));

  const newCount = results.filter(r => r.isNew).length;
  const unchangedCount = results.filter(r => !r.isNew && !r.hasConflict).length;
  const conflictCount = results.filter(r => r.hasConflict).length;

  console.log(`\nMigration Summary:`);
  console.log(`- Total Products: ${results.length}`);
  console.log(`- Needing New Slugs: ${newCount}`);
  console.log(`- Already Have Canonical Slug: ${unchangedCount}`);
  console.log(`- Slug Conflicts: ${conflictCount}`);

  console.log(`\nSample 301 Redirect Mappings:`);
  results.slice(0, 5).forEach(r => {
    console.log(`  ${r.oldUrl}  --->  ${r.newUrl} (301 Permanent Redirect)`);
  });

  if (isApply) {
    console.log('\nApplying updates to Firebase Realtime Database...');
    let successCount = 0;
    for (const r of results) {
      if (r.isNew || r.hasConflict) {
        const patchRes = await fetch(`${DB_BASE}/products/${r.id}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: r.proposedSlug })
        });
        if (patchRes.ok) {
          successCount++;
          console.log(`  [UPDATED] ${r.id} -> ${r.proposedSlug}`);
        } else {
          console.error(`  [FAILED] ${r.id}: ${patchRes.status}`);
        }
      }
    }
    console.log(`\nApplied updates to ${successCount} products successfully.`);
  } else {
    console.log('\nDRY RUN COMPLETE. No changes were written to Firebase.');
    console.log('To apply these slugs to live records, run with `--apply`:');
    console.log('  node scripts/generate-product-slugs.js --apply\n');
  }
}

run().catch(err => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
