// src/pages/sitemap.xml.ts
// Dynamic Server-Generated XML Sitemap Endpoint for Dandy Cosmetics
// Scope: Canonical, indexable URLs (Arabic default + published English /en/ counterparts)
// with reciprocal xhtml:link hreflang alternates when English is publicly published.
export const prerender = false;

import type { APIRoute } from 'astro';
import { SITE_URL, getAllProducts } from '../utils/products';
import { CATEGORY_TAXONOMY } from '../utils/categories';
import { getAllArticles } from '../utils/articles';
import { getPublishedPinkFridayCampaign, shouldDisplayCampaignToCustomers } from '../utils/pink-friday-server';
import { isLocalePublished } from '../i18n/config';
import { buildHreflangAlternates } from '../i18n/metadata';
import { EN_ARTICLE_CONTENT } from '../i18n/content/en/articles';
import { EN_CATEGORY_CONTENT } from '../i18n/content/en/categories';
import { EN_PRODUCT_CONTENT } from '../i18n/content/en/products';

// XML special character escaping to ensure valid markup
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface SitemapEntry {
  loc: string;
  alternates: Array<{ hreflang: string; href: string }>;
}

export const GET: APIRoute = async () => {
  const enPublished = isLocalePublished('en');
  const entries: SitemapEntry[] = [];

  const addPair = (arabicPath: string, hasEnglishCounterpart: boolean) => {
    const cleanArPath = arabicPath === '/' ? '/' : arabicPath.replace(/\/+$/, '');
    const arLoc = `${SITE_URL}${cleanArPath}`;
    const canPublishEn = enPublished && hasEnglishCounterpart;
    const alternates = canPublishEn
      ? buildHreflangAlternates(cleanArPath, { targetEntityExists: true })
      : [];

    entries.push({ loc: arLoc, alternates });

    if (canPublishEn) {
      const enPath = cleanArPath === '/' ? '/en/' : `/en${cleanArPath}`;
      entries.push({ loc: `${SITE_URL}${enPath}`, alternates });
    }
  };

  // 1. Homepage (Root)
  addPair('/', true);

  // 2. Main Storefront Catalog
  addPair('/all-products', true);

  // 3. Approved Canonical Categories (4)
  const categorySlugs = Object.keys(CATEGORY_TAXONOMY);
  for (const catSlug of categorySlugs) {
    const enCat = EN_CATEGORY_CONTENT[catSlug];
    const hasEn = Boolean(enCat?.name?.trim() && enCat?.h1Title?.trim() && enCat?.introText?.trim());
    addPair(`/category/${catSlug}`, hasEn);
  }

  // 4. Active Canonical Products (Dynamically resolved via product inventory service)
  try {
    const products = await getAllProducts();
    const activeProducts = products.filter((p) => !p.isHidden && Boolean(p.resolvedSlug));

    for (const prod of activeProducts) {
      const enProd = EN_PRODUCT_CONTENT[prod.id];
      const hasEn = Boolean(enProd?.name?.trim() && enProd?.description?.trim());
      addPair(`/product/${encodeURIComponent(prod.resolvedSlug)}`, hasEn);
    }
  } catch (error) {
    console.error('[sitemap.xml] Error fetching active products:', error);
  }

  // 5. Special Offers & Editorial Hub
  addPair('/special-offers', true);
  addPair('/blog', true);

  // Conditionally include Pink Friday campaign URL when published and eligible for customers
  try {
    const publishedCampaign = await getPublishedPinkFridayCampaign();
    if (shouldDisplayCampaignToCustomers(publishedCampaign)) {
      addPair('/pink-friday', true);
    }
  } catch (err) {
    console.error('[sitemap.xml] Error checking Pink Friday campaign:', err);
  }

  // 6. Published Canonical Editorial Articles (Dynamically resolved via centralized article service)
  try {
    const articles = await getAllArticles();
    for (const article of articles) {
      if (article && article.status === 'published' && article.slug && typeof article.slug === 'string') {
        const cleanSlug = article.slug.trim();
        if (cleanSlug) {
          const enArticle = EN_ARTICLE_CONTENT[article.id] || EN_ARTICLE_CONTENT[cleanSlug];
          const hasEn = Boolean(
            enArticle?.publishedInLocale &&
              enArticle?.title?.trim() &&
              enArticle?.excerpt?.trim() &&
              enArticle?.contentHtml?.trim()
          );
          addPair(`/blog/${encodeURIComponent(cleanSlug)}`, hasEn);
        }
      }
    }
  } catch (error) {
    console.error('[sitemap.xml] Error fetching published articles:', error);
  }

  // 7. Approved Static, Trust, and Legal Pages
  addPair('/about-us', true);
  addPair('/contact-us', true);
  addPair('/privacy-policy', true);
  addPair('/terms', true);

  // 8. Approved Optional Informational / Social Proof Pages
  addPair('/help', true);
  addPair('/client-reviews', true);

  // Deduplicate by loc and strip any accidental query strings or fragments
  const uniqueEntries: SitemapEntry[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.loc) continue;
    const cleanUrl = entry.loc.split('?')[0].split('#')[0];
    if (!seen.has(cleanUrl)) {
      seen.add(cleanUrl);
      uniqueEntries.push({
        loc: cleanUrl,
        alternates: entry.alternates,
      });
    }
  }

  // Build XML sitemap (with xhtml:link alternates when English is published)
  const xmlEntries = uniqueEntries
    .map((entry) => {
      const altXml = entry.alternates
        .map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />`
        )
        .join('\n');
      return altXml
        ? `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${altXml}\n  </url>`
        : `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n  </url>`;
    })
    .join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${xmlEntries}
</urlset>`.trim();

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
