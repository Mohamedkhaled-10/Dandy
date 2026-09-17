// public/assets/js/product-slugs.js
// Client-side Product Slug Resolver for Dandy Cosmetics Storefront

(function(window) {
  'use strict';

  var KNOWN_SLUGS = {
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

  var ARABIC_MAP = {
    'مجموعة مسك 3 تولات 3 مل': 'musk-collection-3-tola-3ml',
    'مسك داندى ٦ مل - متوفر ثلاثة روائح': 'dandy-musk-6ml'
  };

  function cleanUnits(str) {
    return String(str || '')
      .replace(/(\d+)\s*(ml|مل)/gi, '$1ml')
      .replace(/(\d+)\s*(gm|g|جم|جرام)/gi, '$1gm');
  }

  function slugify(text) {
    if (!text) return '';
    return cleanUnits(text)
      .toLowerCase()
      .trim()
      .replace(/[&]/g, '-and-')
      .replace(/×/g, 'x')
      .replace(/[\/\\]/g, '-')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/-ml\b/g, 'ml')
      .replace(/-gm\b/g, 'gm')
      .replace(/^-+|-+$/g, '');
  }

  function getProductSlug(item) {
    if (!item) return 'product';
    if (item.slug && typeof item.slug === 'string' && item.slug.trim()) {
      return slugify(item.slug);
    }
    var id = item.id || item.key;
    if (id && KNOWN_SLUGS[id]) {
      return KNOWN_SLUGS[id];
    }
    var name = (item.name || '').trim();
    if (ARABIC_MAP[name]) {
      return ARABIC_MAP[name];
    }
    if (name.indexOf('|') !== -1) {
      var parts = name.split('|');
      var en = slugify(parts[1] || parts[0]);
      if (en && en.length > 2) return en;
    }
    if (name.indexOf(' - ') !== -1) {
      var dashParts = name.split(' - ');
      for (var i = 0; i < dashParts.length; i++) {
        if (/[a-zA-Z]/.test(dashParts[i])) {
          var enPart = slugify(dashParts[i]);
          if (enPart && enPart.length > 2) return enPart;
        }
      }
    }
    var candidate = slugify(name);
    if (candidate && candidate.length > 2) return candidate;
    return id ? ('product-' + String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-8)) : 'dandy-product';
  }

  function getProductLink(item) {
    var slug = getProductSlug(item);
    return '/product/' + encodeURIComponent(slug);
  }

  window.getProductSlug = getProductSlug;
  window.getProductLink = getProductLink;
  window.DANDY_KNOWN_SLUGS = KNOWN_SLUGS;

})(typeof window !== 'undefined' ? window : this);
