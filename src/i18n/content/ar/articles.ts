/**
 * ============================================================================
 * DANDY COSMETICS — ARABIC ARTICLE CONTENT ADAPTER (PHASE 10)
 * Maps Firestore `Article` documents into `ArticleLocalizedContent` safely.
 * ============================================================================
 */

import type { Article } from '../../../utils/articles';
import type { ArticleLocalizedContent } from '../../types';

export function extractArabicArticleContent(article: Article): ArticleLocalizedContent {
  return {
    articleId: article.id,
    slug: article.slug,
    title: article.title,
    category: article.category || 'روتين الجمال',
    excerpt: article.excerpt || '',
    contentHtml: article.content || '',
    publishedInLocale: article.status === 'published',
  };
}
