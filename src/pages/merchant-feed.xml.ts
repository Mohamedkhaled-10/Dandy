// src/pages/merchant-feed.xml.ts
// Dynamic Server-Generated Google Merchant Center Product Feed Endpoint for Dandy Cosmetics
export const prerender = false;

import type { APIRoute } from 'astro';
import { getAllProducts, SITE_URL } from '../utils/products';
import { buildMerchantFeedXml } from '../utils/merchant-feed';

export const GET: APIRoute = async () => {
  try {
    const products = await getAllProducts();
    const feedXml = buildMerchantFeedXml(products, SITE_URL);

    return new Response(feedXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[merchant-feed.xml] Error generating product feed:', error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Error</title><description>Unable to generate feed</description></channel></rss>`,
      {
        status: 500,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
        },
      }
    );
  }
};
