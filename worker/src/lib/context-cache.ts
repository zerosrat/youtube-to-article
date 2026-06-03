import type { ArticleContext, Chapter } from '../types';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

export class ContextCache {
  private cache: Cache;

  constructor(cache: Cache) {
    this.cache = cache;
  }

  private getKey(sessionId: string): string {
    return `article:${sessionId}`;
  }

  async saveContext(context: ArticleContext): Promise<void> {
    const key = this.getKey(context.sessionId);
    const data = JSON.stringify(context);

    await this.cache.put(key, new Response(data, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${CACHE_TTL / 1000}`
      }
    }));
  }

  async getContext(sessionId: string): Promise<ArticleContext | null> {
    const key = this.getKey(sessionId);
    const response = await this.cache.match(key);

    if (!response) return null;

    const data = await response.json();

    // 检查是否过期
    if (Date.now() - data.createdAt > CACHE_TTL) {
      await this.cache.delete(key);
      return null;
    }

    return data as ArticleContext;
  }

  async deleteContext(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await this.cache.delete(key);
  }
}

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseChapterFromContent(content: string): Chapter[] {
  const chapters: Chapter[] = [];
  const chapterRegex = /^##\s+(.+)$/gm;

  let match;
  let lastIndex = 0;
  let lastTitle = '';
  let chapterIndex = 0;

  while ((match = chapterRegex.exec(content)) !== null) {
    if (lastTitle) {
      const chapterContent = content.slice(lastIndex, match.index).trim();
      chapters.push({
        id: `ch-${chapterIndex}`,
        title: lastTitle,
        content: chapterContent
      });
      chapterIndex++;
    }

    lastTitle = match[1].trim();
    lastIndex = match.index + match[0].length;
  }

  // 添加最后一个章节
  if (lastTitle) {
    const chapterContent = content.slice(lastIndex).trim();
    chapters.push({
      id: `ch-${chapterIndex}`,
      title: lastTitle,
      content: chapterContent
    });
  }

  return chapters;
}
