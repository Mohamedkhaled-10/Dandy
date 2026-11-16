// src/utils/articles.ts
// Centralized Server-Side Article Data Service for Dandy Cosmetics
// Uses Firebase Admin SDK (getFirestore(getAdminApp())) so public Firestore rules can
// strictly block unauthenticated draft reads while SSR & public API enforce publication filtering.

import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin.ts';

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

export interface PublicArticleCard {
  id: string;
  title: string;
  slug: string;
  category: string;
  image: string;
  excerpt: string;
  date?: string;
  createdAt?: string;
}

export interface ArticlesDeps {
  firestore?: {
    collection: (name: string) => {
      get: () => Promise<{ docs?: unknown[]; forEach?: (cb: (doc: unknown) => void) => void }>;
      doc: (id: string) => { get: () => Promise<unknown> };
    };
  };
  simulateError?: boolean;
  now?: () => number;
  useCache?: boolean;
}

// In-memory module cache for server-side Astro rendering (60 seconds fresh TTL, 5 minutes max stale bound)
let cachedArticles: Article[] | null = null;
let lastFetchTime = 0;
export const CACHE_TTL_MS = 60 * 1000;
export const MAX_STALE_CACHE_MS = 5 * 60 * 1000;

export function clearArticlesCache(): void {
  cachedArticles = null;
  lastFetchTime = 0;
}

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

interface FirestoreTimestampLike {
  toDate?: () => Date;
  seconds?: number;
  _seconds?: number;
}

function normalizeTimestampToIso(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  if (val instanceof Date) {
    return Number.isFinite(val.getTime()) ? val.toISOString() : undefined;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return new Date(val).toISOString();
  }
  if (typeof val === 'object') {
    const ts = val as FirestoreTimestampLike;
    if (typeof ts.toDate === 'function') {
      const d = ts.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) {
        return d.toISOString();
      }
    }
    const sec = typeof ts.seconds === 'number' ? ts.seconds : (typeof ts._seconds === 'number' ? ts._seconds : null);
    if (sec !== null && Number.isFinite(sec)) {
      return new Date(sec * 1000).toISOString();
    }
  }
  return undefined;
}

/**
 * Resolve canonical publication status:
 * 1. 'published' -> 'published'
 * 2. 'draft' -> 'draft' (never shown to public)
 * 3. missing (undefined / null) -> 'published' (legacy Dandy compatibility)
 * 4. anything else -> null (unknown status, denied by default)
 */
function resolveArticleStatus(rawStatus: unknown): 'published' | 'draft' | null {
  if (rawStatus === undefined || rawStatus === null) {
    return 'published';
  }
  if (typeof rawStatus !== 'string') {
    return null;
  }
  if (rawStatus === 'published') {
    return 'published';
  }
  if (rawStatus === 'draft') {
    return 'draft';
  }
  return null;
}

function optimizeArticleMedia(imageInput: string, contentInput: string): { image: string; content: string } {
  let image = imageInput;
  let content = contentInput;

  // Phase 8.2: Optimize Cloudinary blog featured image delivery (1280x720 16:9 banner with f_auto,q_auto)
  if (image && image.includes('res.cloudinary.com')) {
    if (!image.includes('/c_fill,')) {
      image = image.replace('/image/upload/', '/image/upload/c_fill,w_1280,h_720,g_center,q_auto:good,f_auto/');
    } else if (!image.includes(',f_auto')) {
      image = image.replace('/c_fill,', '/c_fill,f_auto,');
    }
  }

  // Phase 8.2: Add descriptive alt texts, explicit dimensions matching natural aspect ratio, and lazy loading to inline article images
  if (content.includes('https://i.postimg.cc/kM22LxBM/pexels-a-darmel-8989961.jpg')) {
    content = content.replace(
      /<img\s+src="https:\/\/i\.postimg\.cc\/kM22LxBM\/pexels-a-darmel-8989961\.jpg"[^>]*>/g,
      '<img src="https://i.postimg.cc/kM22LxBM/pexels-a-darmel-8989961.jpg" alt="تطبيق التونر المرطب للبشرة بعد تنظيف الوجه" width="533" height="800" loading="lazy" decoding="async">'
    );
  }
  if (content.includes('https://i.postimg.cc/zvDXyvLD/pexels-element5-973401.jpg')) {
    content = content.replace(
      /<img([^>]*src="https:\/\/i\.postimg\.cc\/zvDXyvLD\/pexels-element5-973401\.jpg"[^>]*)>/g,
      '<img$1 alt="خطوات روتين العناية بالشعر وتغذيته اليومية" width="800" height="534" loading="lazy" decoding="async">'
    );
  }
  if (content.includes('https://i.postimg.cc/qvWkjr1K/pexels-shiny-diamond-3373714jpg.webp')) {
    content = content.replace(
      /<img([^>]*src="https:\/\/i\.postimg\.cc\/qvWkjr1K\/pexels-shiny-diamond-3373714jpg\.webp"[^>]*)>/g,
      '<img$1 alt="العناية بالبشرة والحفاظ على نضارتها الطبيعية" width="800" height="534" loading="lazy" decoding="async">'
    );
  }
  if (content.includes('https://i.postimg.cc/7hdQLgkr/pexels-gabby-k-6621182.jpg')) {
    content = content.replace(
      /<img([^>]*src="https:\/\/i\.postimg\.cc\/7hdQLgkr\/pexels-gabby-k-6621182\.jpg"[^>]*)>/g,
      '<img$1 alt="ترطيب وتغذية بشرة الجسم بعد الاستحمام" width="533" height="800" loading="lazy" decoding="async">'
    );
  }
  if (content.includes('https://i.postimg.cc/YqPbMqCQ/pexels-shiny-diamond-3762875.jpg')) {
    content = content.replace(
      /<img([^>]*src="https:\/\/i\.postimg\.cc\/YqPbMqCQ\/pexels-shiny-diamond-3762875\.jpg"[^>]*)>/g,
      '<img$1 alt="روتين العناية باليدين والأظافر وترطيبهما" width="534" height="800" loading="lazy" decoding="async">'
    );
  }

  return { image, content };
}

/**
 * Safely parse either a Firebase Admin SDK DocumentSnapshot or a raw Firestore REST document
 * into a strictly allowlisted application Article object.
 * Returns null if required data (ID, title, slug) is missing, malformed, or has an unknown status.
 */
export function parseFirestoreArticle(doc: unknown): Article | null {
  if (!doc || typeof doc !== 'object') {
    return null;
  }

  const record = doc as Record<string, unknown>;

  // Path A: Firebase Admin SDK DocumentSnapshot (has .id and .data())
  if (typeof record.data === 'function') {
    if (record.exists === false || (typeof record.exists === 'function' && record.exists() === false)) {
      return null;
    }

    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id) return null;

    const rawData = (record.data as () => unknown)();
    if (!rawData || typeof rawData !== 'object') {
      return null;
    }

    const fields = rawData as Record<string, unknown>;
    const title = typeof fields.title === 'string' ? fields.title.trim() : '';
    const slug = typeof fields.slug === 'string' ? fields.slug.trim() : '';
    if (!title || !slug) {
      return null;
    }

    const status = resolveArticleStatus(fields.status);
    if (!status) {
      return null;
    }

    const category = typeof fields.category === 'string' && fields.category.trim()
      ? fields.category.trim()
      : 'روتين الجمال';
    const rawImage = typeof fields.image === 'string' ? fields.image.trim() : '';
    const excerpt = typeof fields.excerpt === 'string' ? fields.excerpt.trim() : '';
    const rawContent = typeof fields.content === 'string' ? fields.content : '';
    const date = typeof fields.date === 'string' && fields.date.trim() ? fields.date.trim() : undefined;

    const createdAt =
      normalizeTimestampToIso(fields.createdAt) ||
      normalizeTimestampToIso(record.createTime);
    const updatedAt =
      normalizeTimestampToIso(fields.updatedAt) ||
      normalizeTimestampToIso(record.updateTime);

    const { image, content } = optimizeArticleMedia(rawImage, rawContent);

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

  // Path B: Legacy Firestore REST Document shape (backwards-compatible parser)
  const raw = doc as FirestoreDocumentRaw;
  if (!raw.name || typeof raw.name !== 'string') {
    return null;
  }

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
  if (!title || !slug) {
    return null;
  }

  const rawStatusValue = fields.status !== undefined
    ? (fields.status?.stringValue !== undefined ? fields.status.stringValue : fields.status)
    : undefined;
  const status = resolveArticleStatus(rawStatusValue);
  if (!status) {
    return null;
  }

  const category = fields.category?.stringValue?.trim() || 'روتين الجمال';
  const rawImage = fields.image?.stringValue?.trim() || '';
  const excerpt = fields.excerpt?.stringValue?.trim() || '';
  const rawContent = fields.content?.stringValue || '';
  const date = fields.date?.stringValue?.trim() || undefined;
  const createdAt =
    normalizeTimestampToIso(fields.createdAt?.timestampValue) ||
    normalizeTimestampToIso(raw.createTime);
  const updatedAt =
    normalizeTimestampToIso(fields.updatedAt?.timestampValue) ||
    normalizeTimestampToIso(raw.updateTime);

  const { image, content } = optimizeArticleMedia(rawImage, rawContent);

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

function getSortableTimestampMs(article: Article): number {
  if (!article.createdAt) return 0;
  const ms = article.createdAt instanceof Date
    ? article.createdAt.getTime()
    : Date.parse(String(article.createdAt));
  return Number.isFinite(ms) ? ms : 0;
}

function resolveAdminFirestore(deps?: ArticlesDeps) {
  if (deps?.simulateError) {
    throw new Error('Simulated Firestore unavailability');
  }
  if (deps?.firestore) {
    return deps.firestore;
  }
  return getFirestore(getAdminApp());
}

/**
 * Build a sanitized public card projection containing ONLY non-sensitive public fields.
 */
export function toPublicArticleCard(article: Article): PublicArticleCard | null {
  if (!article || article.status !== 'published') {
    return null;
  }

  let safeExcerpt = typeof article.excerpt === 'string' ? article.excerpt.trim() : '';
  if (!safeExcerpt && typeof article.content === 'string' && article.content.trim()) {
    const plain = article.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    safeExcerpt = plain.length > 140 ? `${plain.slice(0, 140)}...` : plain;
  }

  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    category: article.category,
    image: article.image,
    excerpt: safeExcerpt,
    ...(article.date ? { date: article.date } : {}),
    ...(article.createdAt
      ? { createdAt: article.createdAt instanceof Date ? article.createdAt.toISOString() : article.createdAt }
      : {})
  };
}

/**
 * Fetch all published articles via Firebase Admin SDK.
 * Uses a 60-second fresh TTL cache and a bounded maximum stale cache window (MAX_STALE_CACHE_MS).
 *
 * Cache Freshness & Fail-Safe Policy:
 * - Within CACHE_TTL_MS (and !forceFresh): returns fresh cached articles without querying Firestore.
 * - forceFresh=true: always attempts a live Firestore read and NEVER falls back to stale cache on failure.
 * - throwOnError=true: throws safe 'ARTICLES_UNAVAILABLE' on live read failure rather than passing off stale cache as success.
 * - Beyond MAX_STALE_CACHE_MS: expired cache is cleared and never returned on failure.
 *
 * Publication Policy (enforced server-side before returning any data):
 * - status === 'published' -> allowed
 * - status === 'draft' -> excluded
 * - status missing (undefined / null) -> allowed (legacy published article compatibility)
 * - any other unknown status -> excluded
 */
export async function getAllArticles(
  forceFresh = false,
  _deps?: ArticlesDeps,
  options?: { throwOnError?: boolean }
): Promise<Article[]> {
  const useCache = _deps?.useCache !== false;
  const now = typeof _deps?.now === 'function' ? _deps.now() : Date.now();
  const cacheAge = cachedArticles !== null ? now - lastFetchTime : Infinity;

  if (useCache && !forceFresh && cachedArticles !== null && cacheAge >= 0 && cacheAge < CACHE_TTL_MS) {
    return cachedArticles;
  }

  try {
    const firestore = resolveAdminFirestore(_deps);
    const snapshot = await firestore.collection('articles').get();

    const docList: unknown[] = [];
    if (Array.isArray(snapshot?.docs)) {
      docList.push(...snapshot.docs);
    } else if (snapshot && typeof snapshot.forEach === 'function') {
      snapshot.forEach((doc: unknown) => {
        docList.push(doc);
      });
    }

    const publishedArticles: Article[] = [];
    for (const rawDoc of docList) {
      const article = parseFirestoreArticle(rawDoc);
      if (article && article.status === 'published') {
        publishedArticles.push(article);
      }
    }

    publishedArticles.sort((a, b) => getSortableTimestampMs(b) - getSortableTimestampMs(a));

    if (useCache) {
      cachedArticles = publishedArticles;
      lastFetchTime = now;
    }

    return publishedArticles;
  } catch (err) {
    const safeCode = (err as { code?: string })?.code || 'articles_fetch_failed';
    console.error('[ArticlesService] Failed to fetch articles via Admin SDK:', safeCode);

    if (forceFresh) {
      if (useCache) {
        cachedArticles = null;
        lastFetchTime = 0;
      }
      if (options?.throwOnError) {
        throw new Error('ARTICLES_UNAVAILABLE');
      }
      return [];
    }

    if (options?.throwOnError) {
      if (useCache && cacheAge > MAX_STALE_CACHE_MS) {
        cachedArticles = null;
        lastFetchTime = 0;
      }
      throw new Error('ARTICLES_UNAVAILABLE');
    }

    if (useCache && cachedArticles !== null && cacheAge >= 0 && cacheAge <= MAX_STALE_CACHE_MS) {
      return cachedArticles;
    }

    if (useCache) {
      cachedArticles = null;
      lastFetchTime = 0;
    }
    return [];
  }
}

/**
 * Resolve a published article by its stored permanent slug.
 * Returns null if the article does not exist or is not published.
 */
export async function getArticleBySlug(slug: string, _deps?: ArticlesDeps): Promise<Article | null> {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    return null;
  }

  const articles = await getAllArticles(false, _deps);
  const matched = articles.find(a => a.slug === trimmedSlug && a.status === 'published');
  return matched || null;
}

/**
 * Resolve a published article by its permanent Firestore document ID.
 * Primarily used for 301 legacy redirects (/post?id=<docId> -> /blog/<slug>).
 * Returns null if the article does not exist, is a draft, or has an unknown status.
 */
export async function getArticleById(id: string, _deps?: ArticlesDeps): Promise<Article | null> {
  if (!id || typeof id !== 'string') {
    return null;
  }

  const trimmedId = id.trim();
  if (!trimmedId || trimmedId.includes('/')) {
    return null;
  }

  // Check published articles list/cache first
  const articles = await getAllArticles(false, _deps);
  const matched = articles.find(a => a.id === trimmedId && a.status === 'published');
  if (matched) {
    return matched;
  }

  // Fallback to direct single-document fetch via Firebase Admin SDK
  try {
    const firestore = resolveAdminFirestore(_deps);
    const docSnap = await firestore.collection('articles').doc(trimmedId).get();
    const article = parseFirestoreArticle(docSnap);
    if (article && article.status === 'published') {
      return article;
    }
  } catch (err) {
    const safeCode = (err as { code?: string })?.code || 'article_get_failed';
    console.error(`[ArticlesService] Failed to fetch article by ID (${trimmedId}):`, safeCode);
  }

  return null;
}
