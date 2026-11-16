export const prerender = false;

// src/pages/api/public-articles.js
// Public read-only API returning strictly published editorial article cards for the storefront homepage.
import { getAllArticles, toPublicArticleCard } from '../../utils/articles.ts';

export const DEFAULT_PUBLIC_ARTICLES_LIMIT = 10;
export const MAX_PUBLIC_ARTICLES_LIMIT = 20;

const PUBLIC_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
  'X-Content-Type-Options': 'nosniff'
};

const ERROR_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff'
};

export function resolvePublicArticlesLimit(rawLimit) {
  if (rawLimit === null || rawLimit === undefined || String(rawLimit).trim() === '') {
    return DEFAULT_PUBLIC_ARTICLES_LIMIT;
  }
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PUBLIC_ARTICLES_LIMIT;
  }
  const intVal = Math.floor(parsed);
  return Math.min(Math.max(1, intVal), MAX_PUBLIC_ARTICLES_LIMIT);
}

export async function GET({ request, url, _deps = undefined }) {
  try {
    let rawLimit = null;
    if (url?.searchParams) {
      rawLimit = url.searchParams.get('limit');
    } else if (request?.url) {
      try {
        rawLimit = new URL(request.url, 'http://localhost').searchParams.get('limit');
      } catch {
        rawLimit = null;
      }
    }

    const limit = resolvePublicArticlesLimit(rawLimit);
    const articles = await getAllArticles(false, _deps, { throwOnError: true });

    const publicArticles = [];
    for (const article of articles) {
      if (!article || article.status !== 'published') continue;
      const card = toPublicArticleCard(article);
      if (card) {
        publicArticles.push(card);
      }
      if (publicArticles.length >= limit) {
        break;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        articles: publicArticles
      }),
      {
        status: 200,
        headers: PUBLIC_HEADERS
      }
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'ARTICLES_UNAVAILABLE',
        message: 'تعذر تحميل المقالات حالياً.',
        articles: []
      }),
      {
        status: 503,
        headers: ERROR_HEADERS
      }
    );
  }
}

export async function ALL() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'الطريقة غير مسموح بها'
    }),
    {
      status: 405,
      headers: {
        ...ERROR_HEADERS,
        Allow: 'GET'
      }
    }
  );
}
