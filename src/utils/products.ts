// src/utils/products.ts
// Server-side Product Data Service & Deterministic Slug Resolution

export interface VariantItem {
  id: string;
  name: string;
  isAvailable?: boolean;
  price?: number | null;
}

export interface Product {
  id: string;
  name: string;
  slug?: string;
  resolvedSlug: string;
  description?: string;
  price: number;
  originalPrice?: number | string;
  discount?: number | string;
  category?: string;
  image?: string;
  rating?: number;
  avgRating?: number;
  reviewCount?: number;
  bestSeller?: boolean;
  onSale?: boolean;
  isSoldOut?: boolean;
  inStock?: boolean;
  isHidden?: boolean;
  stockQuantity?: number | null;
  hasVariants?: boolean;
  variantType?: string;
  variants?: VariantItem[] | Record<string, VariantItem>;
}

const RTDB_URL = 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app';
export const SITE_URL = 'https://dandy-ebon.vercel.app';

// Canonical deterministic slugs for all 31 existing products in Dandy catalog
export const EXISTING_PRODUCT_SLUG_MAP: Record<string, string> = {
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
  '-OxC877LX3vzD-3Pi_th': 'dandy-musk-6ml',
};

// Known Arabic to Latin phrase mappings for clean semantic slugs
const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  'مجموعة مسك 3 تولات 3 مل': 'musk-collection-3-tola-3ml',
  'مسك داندى ٦ مل - متوفر ثلاثة روائح': 'dandy-musk-6ml',
  'بادي سبلاش': 'body-splash',
  'بادى اسبلاش': 'body-splash',
  'بادى باتر': 'body-butter',
  'كريم مرطب': 'moisturizing-cream',
  'سيروم الوجه': 'face-serum',
  'غسول الوجه': 'facial-cleanser',
  'مزيل عرق': 'deodorant',
  'مخمرية': 'solid-perfume',
  'حمام كريم': 'hair-mask',
  'شامبو': 'shampoo',
};

// Unit cleaner: converts '250 ml' or '250 مل' into '250ml', '60 جم' into '60gm'
export function cleanUnits(str: string): string {
  return str
    .replace(/(\d+)\s*(ml|مل)/gi, '$1ml')
    .replace(/(\d+)\s*(gm|g|جم|جرام)/gi, '$1gm')
    .replace(/(\d+)\s*(tola|تولات|تولة)/gi, '$1tola');
}

// Convert any string to lowercase, hyphen-separated, URL-safe slug
export function slugify(text: string): string {
  if (!text) return '';
  return cleanUnits(text.toString())
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

// Deterministically compute the slug for any product
export function getDeterministicSlug(product: { id?: string; name?: string; slug?: string }): string {
  // 1. If explicit valid slug is stored in product record, use it
  if (product.slug && typeof product.slug === 'string' && product.slug.trim()) {
    const sanitized = slugify(product.slug);
    if (sanitized) return sanitized;
  }

  // 2. If ID matches the known 31 catalog products, return verified canonical slug
  if (product.id && EXISTING_PRODUCT_SLUG_MAP[product.id]) {
    return EXISTING_PRODUCT_SLUG_MAP[product.id];
  }

  const name = (product.name || '').trim();

  // 3. Check known direct phrase mappings
  if (ARABIC_TO_LATIN_MAP[name]) {
    return ARABIC_TO_LATIN_MAP[name];
  }

  // 4. Extract English portion if title is bilingual (separated by '|' or '-')
  if (name.includes('|')) {
    const parts = name.split('|');
    const enPart = parts[1] || parts[0];
    const candidate = slugify(enPart);
    if (candidate && candidate.length > 2) return candidate;
  }

  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    for (const part of parts) {
      if (/[a-zA-Z]/.test(part)) {
        const candidate = slugify(part);
        if (candidate && candidate.length > 2) return candidate;
      }
    }
  }

  // 5. Look for English sequences in title
  const englishMatches = name.match(/[a-zA-Z0-9xX\s-]{3,}/g);
  if (englishMatches) {
    const candidate = slugify(englishMatches.join('-'));
    if (candidate && candidate.length > 2) return candidate;
  }

  // 6. Fallback: clean the name or use product ID
  const cleaned = slugify(name);
  if (cleaned && cleaned.length > 2) return cleaned;

  return product.id ? `product-${product.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}` : 'dandy-product';
}

// In-memory cache for fast SSR responses
let cachedProducts: Product[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

// Fetch all active products from Firebase Realtime Database
export async function getAllProducts(forceFresh = false): Promise<Product[]> {
  const now = Date.now();
  if (!forceFresh && cachedProducts && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedProducts;
  }

  try {
    const res = await fetch(`${RTDB_URL}/products.json`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      console.error(`Failed to fetch products from RTDB: HTTP ${res.status}`);
      return cachedProducts || [];
    }

    const rawData = await res.json();
    if (!rawData || typeof rawData !== 'object') {
      return [];
    }

    const seenSlugs = new Set<string>();
    const products: Product[] = [];

    for (const [id, data] of Object.entries(rawData)) {
      if (!data || typeof data !== 'object') continue;
      const rawProd = data as Record<string, any>;

      let baseSlug = getDeterministicSlug({ id, ...rawProd });
      let uniqueSlug = baseSlug;
      let counter = 2;

      while (seenSlugs.has(uniqueSlug)) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      seenSlugs.add(uniqueSlug);

      products.push({
        id,
        name: rawProd.name || 'منتج داندي',
        slug: rawProd.slug || undefined,
        resolvedSlug: uniqueSlug,
        description: rawProd.description || '',
        price: parseFloat(rawProd.price) || 0,
        originalPrice: rawProd.originalPrice || undefined,
        discount: rawProd.discount || undefined,
        category: rawProd.category || 'Skin care',
        image: rawProd.image || 'https://images.unsplash.com/photo-1608248597481-496100c80836?auto=format&fit=crop&w=800&q=80',
        rating: rawProd.rating || 5,
        avgRating: rawProd.avgRating !== undefined ? Number(rawProd.avgRating) : undefined,
        reviewCount: rawProd.reviewCount !== undefined ? Number(rawProd.reviewCount) : undefined,
        bestSeller: Boolean(rawProd.bestSeller),
        onSale: Boolean(rawProd.onSale),
        isSoldOut: Boolean(rawProd.isSoldOut),
        inStock: rawProd.inStock !== false && !rawProd.isSoldOut,
        isHidden: Boolean(rawProd.isHidden),
        stockQuantity: rawProd.stockQuantity !== undefined ? rawProd.stockQuantity : null,
        hasVariants: Boolean(rawProd.hasVariants),
        variantType: rawProd.variantType || undefined,
        variants: rawProd.variants || undefined,
      });
    }

    cachedProducts = products;
    lastFetchTime = now;
    return products;
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    return cachedProducts || [];
  }
}

// Find a product by its slug
export async function getProductBySlug(rawSlug: string): Promise<Product | null> {
  if (!rawSlug) return null;
  const normalized = decodeURIComponent(rawSlug).trim().toLowerCase();

  const products = await getAllProducts();

  // 1. Direct match on resolvedSlug
  const matched = products.find(p => p.resolvedSlug.toLowerCase() === normalized);
  if (matched && !matched.isHidden) return matched;

  // 2. Direct match on DB slug if stored
  const dbMatch = products.find(p => p.slug && p.slug.toLowerCase() === normalized);
  if (dbMatch && !dbMatch.isHidden) return dbMatch;

  // 3. If rawSlug matches a Firebase product ID directly
  const idMatch = products.find(p => p.id === rawSlug || p.id === normalized);
  if (idMatch && !idMatch.isHidden) return idMatch;

  return null;
}

// Find a product by its Firebase ID
export async function getProductById(id: string): Promise<Product | null> {
  if (!id) return null;
  const products = await getAllProducts();
  const matched = products.find(p => p.id === id);
  if (matched && !matched.isHidden) return matched;

  // Try direct single fetch as fallback if not in cache
  try {
    const res = await fetch(`${RTDB_URL}/products/${encodeURIComponent(id)}.json`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && !data.isHidden) {
        const resolvedSlug = getDeterministicSlug({ id, ...data });
        return {
          id,
          name: data.name || 'منتج داندي',
          slug: data.slug || undefined,
          resolvedSlug,
          description: data.description || '',
          price: parseFloat(data.price) || 0,
          originalPrice: data.originalPrice || undefined,
          discount: data.discount || undefined,
          category: data.category || 'Skin care',
          image: data.image || '',
          rating: data.rating || 5,
          avgRating: data.avgRating !== undefined ? Number(data.avgRating) : undefined,
          reviewCount: data.reviewCount !== undefined ? Number(data.reviewCount) : undefined,
          bestSeller: Boolean(data.bestSeller),
          onSale: Boolean(data.onSale),
          isSoldOut: Boolean(data.isSoldOut),
          inStock: data.inStock !== false && !data.isSoldOut,
          isHidden: Boolean(data.isHidden),
          stockQuantity: data.stockQuantity !== undefined ? data.stockQuantity : null,
          hasVariants: Boolean(data.hasVariants),
          variantType: data.variantType || undefined,
          variants: data.variants || undefined,
        };
      }
    }
  } catch (e) {
    console.error(`Error fetching single product ${id}:`, e);
  }

  return null;
}

// Category normalization helper
export function normalizeCategory(cat?: string): string {
  if (!cat) return 'Skin care';
  const c = cat.toLowerCase().trim();
  if (c === 'hair care' || c === 'منتجات الشعر' || c === 'عناية بالشعر') return 'Hair care';
  if (c === 'body care' || c === 'منتجات الجسم') return 'Body care';
  if (c === 'skin care' || c === 'عناية بالبشرة' || c === 'الزيوت العضوية' || c === 'مستحضرات النقاء') return 'Skin care';
  if (c === 'perfume' || c === 'منتجات العطور') return 'Perfume';
  return cat;
}

// Server-side structured HTML parser for product description
export function parseDescriptionToHtml(textStr?: string): string {
  if (!textStr || !textStr.trim()) {
    return '<p class="product-intro-p">مستحضر طبيعي مميز للعناية بالجمال من داندي كوزمتكس، مصنوع بمكونات مختارة بعناية لتحقيق أفضل النتائج.</p>';
  }

  let containerHtml = `<div class="product-desc-wrapper">`;
  const segments = textStr.split(/\n\s*\n/);

  segments.forEach((segment, idx) => {
    const chunk = segment.trim();
    if (!chunk) return;

    if (chunk.includes('مميزات') || chunk.startsWith('مميزات:')) {
      const lines = chunk.split('\n');
      containerHtml += `<div class="desc-card-section">
        <h4 class="desc-section-title"><i class="fas fa-magic" style="color:var(--color-blush, #db2777);"></i> ${escapeHtml(lines[0])}</h4>
        <ul class="desc-list-points">`;
      lines.slice(1).forEach(l => {
        const cleanLine = l.replace(/^[-*•\s\d)]+/, '').trim();
        if (cleanLine) {
          containerHtml += `<li><i class="fas fa-check-circle"></i> <span>${escapeHtml(cleanLine)}</span></li>`;
        }
      });
      containerHtml += `</ul></div>`;
    } else if (chunk.includes('طريقة الاستخدام') || chunk.startsWith('طريقة الاستخدام:')) {
      const lines = chunk.split('\n');
      containerHtml += `<div class="desc-card-section">
        <h4 class="desc-section-title"><i class="fas fa-spa" style="color:#eab308;"></i> ${escapeHtml(lines[0])}</h4>
        <ul class="desc-list-points step-list-points">`;
      lines.slice(1).forEach(l => {
        const cleanLine = l.replace(/^[-*•\s\d)]+/, '').trim();
        if (cleanLine) {
          containerHtml += `<li><i class="fas fa-circle-notch"></i> <span>${escapeHtml(cleanLine)}</span></li>`;
        }
      });
      containerHtml += `</ul></div>`;
    } else if (chunk.includes('النتائج') || chunk.startsWith('النتائج:')) {
      const lines = chunk.split('\n');
      const bodyLines = lines.slice(1).map(l => escapeHtml(l)).join('<br>');
      containerHtml += `<div class="desc-card-section results-highlight-box">
        <h4 class="desc-section-title"><i class="fas fa-seedling"></i> ${escapeHtml(lines[0])}</h4>
        <p class="desc-text-content">${bodyLines || escapeHtml(lines[0])}</p>
      </div>`;
    } else if (chunk.includes('المكونات') || chunk.includes('الفوائد')) {
      const lines = chunk.split('\n');
      const bodyLines = lines.slice(1).map(l => escapeHtml(l)).join('<br>');
      containerHtml += `<div class="desc-card-section">
        <h4 class="desc-section-title"><i class="fas fa-flask" style="color:var(--color-blush, #db2777);"></i> ${escapeHtml(lines[0])}</h4>
        <p class="desc-text-content">${bodyLines || escapeHtml(lines[0])}</p>
      </div>`;
    } else {
      if (idx === 0) {
        const lines = chunk.split('\n');
        containerHtml += `<h3 class="product-intro-header">${escapeHtml(lines[0])}</h3>`;
        if (lines.length > 1) {
          const bodyLines = lines.slice(1).map(l => escapeHtml(l)).join('<br>');
          containerHtml += `<p class="product-intro-p">${bodyLines}</p>`;
        }
      } else {
        containerHtml += `<p class="product-intro-p">${chunk.split('\n').map(l => escapeHtml(l)).join('<br>')}</p>`;
      }
    }
  });

  containerHtml += `</div>`;
  return containerHtml;
}

export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Generate valid Schema.org Product JSON-LD structured data
export function generateProductJsonLd(product: Product, canonicalUrl: string): Record<string, any> {
  const cleanDescription = (product.description || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim() || `${product.name} - مستحضر طبيعي فاخر للعناية بالبشرة والجسم من داندي كوزمتكس مصر.`;

  const isAvailable = product.isSoldOut !== true && product.inStock !== false;

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': product.name,
    'description': cleanDescription,
    'image': product.image ? [product.image] : [`${SITE_URL}/assets/images/fav-icons/android-chrome-512x512.png`],
    'sku': product.id,
    'category': normalizeCategory(product.category),
    'brand': {
      '@type': 'Brand',
      'name': 'Dandy Cosmetics'
    },
    'offers': {
      '@type': 'Offer',
      'url': canonicalUrl,
      'priceCurrency': 'EGP',
      'price': product.price,
      'priceValidUntil': '2027-12-31',
      'itemCondition': 'https://schema.org/NewCondition',
      'availability': isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      'seller': {
        '@type': 'Organization',
        'name': 'Dandy Cosmetics',
        'url': SITE_URL
      }
    }
  };

  if (product.reviewCount && product.reviewCount > 0 && product.avgRating && product.avgRating > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': product.avgRating.toFixed(1),
      'reviewCount': product.reviewCount,
      'bestRating': '5',
      'worstRating': '1'
    };
  }

  return schema;
}
