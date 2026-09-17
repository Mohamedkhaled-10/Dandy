// src/pages/sitemap.xml.ts
// Dynamic Server-Generated XML Sitemap Endpoint for Dandy Cosmetics
// Scope: Canonical, indexable URLs generated from centralized taxonomy, live product inventory, and published editorial articles
export const prerender = false;

import type { APIRoute } from 'astro';
import { SITE_URL, getAllProducts } from '../utils/products';
import { CATEGORY_TAXONOMY } from '../utils/categories';
import { getAllArticles } from '../utils/articles';

// XML special character escaping to ensure valid markup
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
  const urls: string[] = [];

  // 1. Homepage (Root)
  urls.push(`${SITE_URL}/`);

  // 2. Main Storefront Catalog
  urls.push(`${SITE_URL}/all-products`);

  // 3. Approved Canonical Categories (4)
  const categorySlugs = Object.keys(CATEGORY_TAXONOMY);
  for (const catSlug of categorySlugs) {
    urls.push(`${SITE_URL}/category/${catSlug}`);
  }

  // 4. Active Canonical Products (Dynamically resolved via product inventory service)
  try {
    const products = await getAllProducts();
    const activeProducts = products.filter(p => !p.isHidden && Boolean(p.resolvedSlug));
    
    for (const prod of activeProducts) {
      urls.push(`${SITE_URL}/product/${encodeURIComponent(prod.resolvedSlug)}`);
    }
  } catch (error) {
    console.error('[sitemap.xml] Error fetching active products:', error);
  }

  // 5. Special Offers & Editorial Hub
  urls.push(`${SITE_URL}/special-offers`);
  urls.push(`${SITE_URL}/blog`);

  // 6. Published Canonical Editorial Articles (Dynamically resolved via centralized article service)
  try {
    const articles = await getAllArticles();
    for (const article of articles) {
      if (article && article.status === 'published' && article.slug && typeof article.slug === 'string') {
        const cleanSlug = article.slug.trim();
        if (cleanSlug) {
          urls.push(`${SITE_URL}/blog/${encodeURIComponent(cleanSlug)}`);
        }
      }
    }
  } catch (error) {
    console.error('[sitemap.xml] Error fetching published articles:', error);
  }

  // 7. Approved Static, Trust, and Legal Pages
  urls.push(`${SITE_URL}/about-us`);
  urls.push(`${SITE_URL}/contact-us`);
  urls.push(`${SITE_URL}/privacy-policy`);
  urls.push(`${SITE_URL}/terms`);

  // 8. Approved Optional Informational / Social Proof Pages
  urls.push(`${SITE_URL}/help`);
  urls.push(`${SITE_URL}/client-reviews`);

  // Deduplicate and filter out any invalid entries or query strings
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();

  for (const rawUrl of urls) {
    if (!rawUrl) continue;
    // Strip query strings or hash fragments if any accidentally exist
    const cleanUrl = rawUrl.split('?')[0].split('#')[0];
    if (!seen.has(cleanUrl)) {
      seen.add(cleanUrl);
      uniqueUrls.push(cleanUrl);
    }
  }

  // Build standard XML sitemap
  const xmlEntries = uniqueUrls
    .map(url => `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`)
    .join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`.trim();

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
