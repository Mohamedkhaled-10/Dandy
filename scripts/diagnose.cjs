const RTDB_URL = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';

async function run() {
  const [pfSettingsRes, pubActiveRes, prodsRes] = await Promise.all([
    fetch(RTDB_URL + '/settings/pinkFriday.json'),
    fetch(RTDB_URL + '/settings/pinkFriday/publishedActiveCampaign.json'),
    fetch(RTDB_URL + '/products.json')
  ]);

  const pfSettings = await pfSettingsRes.json();
  const pubActive = await pubActiveRes.json();
  const prods = await prodsRes.json();

  console.log('=== 1. PF SETTINGS ===');
  console.log('currentYear:', pfSettings?.currentYear);
  if (pfSettings?.campaigns) {
    for (const [k, c] of Object.entries(pfSettings.campaigns)) {
      console.log(`Campaign Key: [${k}]`);
      if (c?.draft) {
        const dOffers = Array.isArray(c.draft.offers) ? c.draft.offers.length : Object.keys(c.draft.offers || {}).length;
        const dCols = Array.isArray(c.draft.collections) ? c.draft.collections.length : Object.keys(c.draft.collections || {}).length;
        console.log(`  Draft: id=${c.draft.id}, enabled=${c.draft.enabled}, startAt=${c.draft.startAt}, endAt=${c.draft.endAt}, offers=${dOffers}, cols=${dCols}`);
      }
      if (c?.published) {
        const pOffers = Array.isArray(c.published.offers) ? c.published.offers.length : Object.keys(c.published.offers || {}).length;
        const pCols = Array.isArray(c.published.collections) ? c.published.collections.length : Object.keys(c.published.collections || {}).length;
        console.log(`  Published: id=${c.published.id}, enabled=${c.published.enabled}, startAt=${c.published.startAt}, endAt=${c.published.endAt}, offers=${pOffers}, cols=${pCols}`);
      }
    }
  }

  console.log('\n=== 2. PUBLISHED ACTIVE CAMPAIGN ===');
  console.log('ID:', pubActive?.id);
  console.log('Year:', pubActive?.year);
  console.log('Enabled:', pubActive?.enabled);
  console.log('StartAt:', pubActive?.startAt || pubActive?.startDate);
  console.log('EndAt:', pubActive?.endAt || pubActive?.endDate);
  console.log('PublishedAt:', pubActive?.publishedAt);
  console.log('Offers count:', Array.isArray(pubActive?.offers) ? pubActive.offers.length : Object.keys(pubActive?.offers || {}).length);
  const cols = Array.isArray(pubActive?.collections) ? pubActive.collections : Object.values(pubActive?.collections || {});
  console.log('Collections count:', cols.length);
  cols.forEach((col, idx) => {
    console.log(`  Collection #${idx + 1}: ID=${col.id}, Name="${col.name}", Active=${col.active}, PricingType=${col.pricingType}, PkgPrice=${col.packagePrice}, DiscPct=${col.discountPercentage}`);
    const items = Array.isArray(col.items) ? col.items : Object.values(col.items || {});
    console.log(`    Items (${items.length}):`);
    items.forEach(it => {
      console.log(`      item: collectionItemId=${it.collectionItemId}, productId=${it.productId}, defaultVariantId=${it.defaultVariantId}`);
    });
  });

  console.log('\n=== 3. PRODUCT CATALOG MATCHING ===');
  const prodsEntries = Object.entries(prods || {});
  console.log(`Total products in RTDB: ${prodsEntries.length}`);
  const prodsMap = new Map();
  prodsEntries.forEach(([id, p]) => {
    if (p) {
      prodsMap.set(id, { ...p, id });
    }
  });

  console.log('\n=== 4. STATUS & VALIDATION TESTING ===');
  const now = new Date();
  console.log('Current Server Date ISO:', now.toISOString());
  console.log('Current Server Date Locale String:', now.toString());
  
  // Cairo time
  const cairoTimeStr = now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
  console.log('Africa/Cairo Time:', cairoTimeStr);

  const startAt = pubActive?.startAt || pubActive?.startDate;
  const endAt = pubActive?.endAt || pubActive?.endDate;
  console.log('Campaign startAt string:', startAt);
  console.log('Campaign endAt string:', endAt);

  const currentTs = now.getTime();
  const startTs = startAt ? Date.parse(startAt) : NaN;
  const endTs = endAt ? Date.parse(endAt) : NaN;

  console.log('currentTs:', currentTs);
  console.log('startTs:', startTs, 'diff (startTs - currentTs ms):', startTs - currentTs);
  console.log('endTs:', endTs);

  let status = 'active';
  if (!pubActive || pubActive.enabled === false) {
    status = 'disabled';
  } else if (!isNaN(startTs) && currentTs < startTs) {
    status = 'upcoming';
  } else if (!isNaN(endTs) && currentTs > endTs) {
    status = 'ended';
  }
  console.log('--> Computed getCampaignStatus(pubActive):', status);

  console.log('\n--- Collection Pricing & Validation Detail ---');
  cols.forEach(col => {
    console.log(`Collection "${col.name}" (${col.id}):`);
    console.log(`  active: ${col.active}`);
    console.log(`  pricingType: ${col.pricingType}`);
    console.log(`  packagePrice: ${col.packagePrice} (type: ${typeof col.packagePrice})`);
    console.log(`  discountPercentage: ${col.discountPercentage} (type: ${typeof col.discountPercentage})`);
    
    const items = Array.isArray(col.items) ? col.items : Object.values(col.items || {});
    let totalReg = 0;
    let missingProd = false;
    for (const it of items) {
      const p = prodsMap.get(String(it.productId));
      if (!p) {
        missingProd = true;
        console.log(`  Missing product: ${it.productId}`);
      } else {
        totalReg += (Number(p.price) || 0);
      }
    }
    console.log(`  Total Regular Price: ${totalReg}`);

    if (col.pricingType === 'package') {
      if (typeof col.packagePrice !== 'number' || col.packagePrice <= 0 || isNaN(col.packagePrice)) {
        console.log(`  -> Fails package validation: INVALID_PACKAGE_PRICE!`);
      } else if (col.packagePrice >= totalReg) {
        console.log(`  -> Fails package validation: PACKAGE_PRICE_NOT_LOWER!`);
      } else {
        console.log(`  -> Package OK. Price = ${col.packagePrice}`);
      }
    } else if (col.pricingType === 'percentage') {
      const pct = col.discountPercentage;
      if (typeof pct !== 'number' || pct <= 0 || pct >= 100 || isNaN(pct)) {
        console.log(`  -> Fails percentage validation: INVALID_DISCOUNT_PERCENTAGE!`);
      } else {
        console.log(`  -> Percentage OK. Price = ${Math.round(totalReg * (1 - pct / 100))}`);
      }
    }
  });
}

run().catch(console.error);
