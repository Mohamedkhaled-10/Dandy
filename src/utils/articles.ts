// src/utils/articles.ts
// Centralized Server-Side Article Data Service for Dandy Cosmetics
// Uses public Firestore REST API for zero-dependency, serverless-safe data fetching.

export interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: 'published' | 'draft';
  image: string;
  excerpt: string;
  content: string;
  date?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

const FIRESTORE_PROJECT_ID = 'dandy-562fc';
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;

// In-memory module cache for server-side Astro rendering (60 seconds TTL)
let cachedArticles: Article[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000;

interface FirestoreTypedValue {
  stringValue?: string;
  timestampValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  [key: string]: unknown;
}

interface FirestoreDocumentRaw {
  name?: string;
  fields?: Record<string, FirestoreTypedValue>;
  createTime?: string;
  updateTime?: string;
}

/**
 * Safely parse a raw Firestore REST document into an application Article object.
 * Returns null if required data (ID, title, slug) is missing or malformed.
 */
export function parseFirestoreArticle(doc: unknown): Article | null {
  if (!doc || typeof doc !== 'object') {
    return null;
  }

  const raw = doc as FirestoreDocumentRaw;
  if (!raw.name || typeof raw.name !== 'string') {
    return null;
  }

  // Extract Firestore document ID from resource path:
  // "projects/{project}/databases/{database}/documents/articles/{id}"
  const id = raw.name.split('/').pop();
  if (!id || typeof id !== 'string') {
    return null;
  }

  const fields = raw.fields;
  if (!fields || typeof fields !== 'object') {
    return null;
  }

  const title = fields.title?.stringValue?.trim();
  const slug = fields.slug?.stringValue?.trim();

  // title and slug are strictly required
  if (!title || !slug) {
    return null;
  }

  const category = fields.category?.stringValue?.trim() || 'روتين الجمال';
  const status: 'published' | 'draft' = fields.status?.stringValue === 'draft' ? 'draft' : 'published';
  const image = fields.image?.stringValue?.trim() || '';
  const excerpt = fields.excerpt?.stringValue?.trim() || '';
  const content = fields.content?.stringValue || '';
  const date = fields.date?.stringValue?.trim() || undefined;
  const createdAt = fields.createdAt?.timestampValue || raw.createTime || undefined;
  const updatedAt = fields.updatedAt?.timestampValue || raw.updateTime || undefined;

  return {
    id,
    title,
    slug,
    category,
    status,
    image,
    excerpt,
    content,
    date,
    createdAt,
    updatedAt
  };
}

/**
 * Fetch all published articles via the public Firestore REST API.
 * Uses a 60-second in-memory cache to optimize server-side rendering performance.
 *
 * Publication Policy:
 * Only articles with status === 'published' are returned.
 * Drafts are excluded to prevent accidental public exposure to crawlers and users.
 */
export async function getAllArticles(forceFresh = false): Promise<Article[]> {
  const now = Date.now();
  if (!forceFresh && cachedArticles !== null && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedArticles;
  }

  try {
    const rawDocs: FirestoreDocumentRaw[] = [];
    let pageToken: string | undefined = undefined;

    // Fetch pages (up to 100 items per page)
    do {
      const url = pageToken
        ? `${FIRESTORE_REST_BASE}/articles?pageSize=100&pageToken=${encodeURIComponent(pageToken)}`
        : `${FIRESTORE_REST_BASE}/articles?pageSize=100`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Dandy-Astro-SSR/1.0',
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`Firestore REST API responded with HTTP ${res.status}`);
      }

      const data = await res.json() as { documents?: FirestoreDocumentRaw[]; nextPageToken?: string };
      if (Array.isArray(data.documents)) {
        rawDocs.push(...data.documents);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    const parsedArticles: Article[] = [];
    for (const rawDoc of rawDocs) {
      const article = parseFirestoreArticle(rawDoc);
      // Enforce publication policy: published articles only
      if (article && article.status === 'published') {
        parsedArticles.push(article);
      }
    }

    cachedArticles = parsedArticles;
    lastFetchTime = now;
    return parsedArticles;
  } catch (err) {
    console.error('Failed to fetch articles from Firestore REST API:', err);
    // Return stale cache if available, otherwise empty array (no fake fallback)
    if (cachedArticles !== null) {
      return cachedArticles;
    }
    return [];
  }
}

/**
 * Resolve a published article by its stored permanent Latin slug.
 * Returns null if the article does not exist or is not published.
 */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    return null;
  }

  const articles = await getAllArticles();
  const matched = articles.find(a => a.slug === trimmedSlug && a.status === 'published');
  return matched || null;
}

/**
 * Resolve a published article by its permanent Firestore document ID.
 * Primarily used for 301 legacy redirects (/post?id=<docId> -> /blog/<slug>).
 * Returns null if the article does not exist or is not published.
 */
export async function getArticleById(id: string): Promise<Article | null> {
  if (!id || typeof id !== 'string') {
    return null;
  }

  const trimmedId = id.trim();
  if (!trimmedId) {
    return null;
  }

  // Check in-memory cached articles first
  const articles = await getAllArticles();
  const matched = articles.find(a => a.id === trimmedId && a.status === 'published');
  if (matched) {
    return matched;
  }

  // If not found in cache, attempt single document fetch from Firestore REST
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/articles/${encodeURIComponent(trimmedId)}`, {
      headers: {
        'User-Agent': 'Dandy-Astro-SSR/1.0',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      return null;
    }

    const rawDoc = await res.json() as FirestoreDocumentRaw;
    const article = parseFirestoreArticle(rawDoc);
    if (article && article.status === 'published') {
      return article;
    }
  } catch (err) {
    console.error(`Failed to fetch article by ID (${trimmedId}):`, err);
  }

  return null;
}
