import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SubtitleRequest, SummarizeRequest } from './types';
import { extractSubtitles } from './lib/subtitles';
import { streamGenerateArticle } from './lib/gemini';
import { ContextCache, generateSessionId, parseChapterFromContent } from './lib/context-cache';
import { generateFiveWOneH } from './lib/summarizer';

interface Env {
  GEMINI_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// Get the default cache instance
const getCache = () => caches.default;

// CORS middleware
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');

  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }

  await next();
});

// 提取字幕
app.post('/api/extract-subtitles', async (c) => {
  const body = await c.req.json<SubtitleRequest>();

  if (!body.url) {
    return c.json({ success: false, error: 'URL is required' }, 400);
  }

  const result = await extractSubtitles(body.url);
  return c.json(result);
});

// 生成文章（SSE 流式）
app.get('/api/generate-article', async (c) => {
  const subtitles = c.req.query('subtitles');
  const requirementsStr = c.req.query('requirements');
  const sessionId = c.req.query('sessionId') || generateSessionId();

  if (!subtitles) {
    return c.json({ error: 'Subtitles are required' }, 400);
  }

  const requirements = requirementsStr ? JSON.parse(decodeURIComponent(requirementsStr)) : undefined;
  const decodedSubtitles = decodeURIComponent(subtitles);
  const apiKey = c.env.GEMINI_API_KEY;

  if (!apiKey) {
    return c.json({ error: 'Gemini API key not configured' }, 500);
  }

  return streamSSE(c, async (stream) => {
    const cache = new ContextCache(getCache());
    let fullContent = '';
    let currentChapterId: string | null = null;

    try {
      const generator = streamGenerateArticle({
        subtitles: decodedSubtitles,
        requirements,
        apiKey
      });

      for await (const chunk of generator) {
        fullContent += chunk;

        // 检测章节标题
        const chapterMatch = chunk.match(/^##\s+(.+)$/m);
        if (chapterMatch) {
          const chapters = parseChapterFromContent(fullContent);
          const latestChapter = chapters[chapters.length - 1];
          if (latestChapter && latestChapter.id !== currentChapterId) {
            currentChapterId = latestChapter.id;
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'chapter',
                id: latestChapter.id,
                title: latestChapter.title
              }),
              event: 'chapter'
            });
          }
        }

        await stream.writeSSE({
          data: JSON.stringify({ type: 'content', text: chunk }),
          event: 'chunk'
        });
      }

      // 保存上下文
      const chapters = parseChapterFromContent(fullContent);
      await cache.saveContext({
        sessionId,
        fullArticle: fullContent,
        chapters,
        createdAt: Date.now()
      });

      await stream.writeSSE({
        data: JSON.stringify({ type: 'done', sessionId }),
        event: 'done'
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message }),
        event: 'error'
      });
    }
  });
});

// 5W1H 总结
app.post('/api/summarize-chapter', async (c) => {
  const body = await c.req.json<SummarizeRequest>();
  const { sessionId, chapterId } = body;

  if (!sessionId || !chapterId) {
    return c.json({ success: false, error: 'sessionId and chapterId are required' }, 400);
  }

  const cache = new ContextCache(getCache());
  const context = await cache.getContext(sessionId);

  if (!context) {
    return c.json({ success: false, error: 'Context expired or not found' }, 410);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, error: 'Gemini API key not configured' }, 500);
  }

  try {
    const summary = await generateFiveWOneH(context, chapterId, apiKey);
    return c.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default app;
