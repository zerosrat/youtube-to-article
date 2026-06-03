import type { FiveWOneH, ArticleContext } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function generateFiveWOneH(
  context: ArticleContext,
  chapterId: string,
  apiKey: string
): Promise<FiveWOneH> {
  const chapter = context.chapters.find(c => c.id === chapterId);
  if (!chapter) {
    throw new Error('Chapter not found');
  }

  const prompt = buildFiveWOneHPrompt(context.fullArticle, chapter.title, chapter.content);

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Empty response from Gemini');
  }

  try {
    const parsed = JSON.parse(text);
    return validateFiveWOneH(parsed);
  } catch {
    // 尝试从非 JSON 响应中提取
    return extractFromText(text);
  }
}

function buildFiveWOneHPrompt(fullArticle: string, chapterTitle: string, chapterContent: string): string {
  return `基于以下视频文章内容，请为指定章节生成 5W1H 总结。

完整文章：
${fullArticle}

目标章节：${chapterTitle}

章节内容：
${chapterContent}

请以 JSON 格式返回，包含 who, what, when, where, why, how 六个字段：
{
  "who": "...",
  "what": "...",
  "when": "...",
  "where": "...",
  "why": "...",
  "how": "..."
}`;
}

function validateFiveWOneH(data: unknown): FiveWOneH {
  const required = ['who', 'what', 'when', 'where', 'why', 'how'];
  const result: Partial<FiveWOneH> = {};

  for (const key of required) {
    const value = (data as Record<string, unknown>)?.[key];
    if (typeof value !== 'string') {
      result[key as keyof FiveWOneH] = '暂无信息';
    } else {
      result[key as keyof FiveWOneH] = value;
    }
  }

  return result as FiveWOneH;
}

function extractFromText(text: string): FiveWOneH {
  // 简单的正则提取作为 fallback
  const extract = (label: string): string => {
    const regex = new RegExp(`${label}[：:]\\s*(.+?)(?=\\n|$)`, 'i');
    const match = text.match(regex);
    return match?.[1]?.trim() || '暂无信息';
  };

  return {
    who: extract('Who'),
    what: extract('What'),
    when: extract('When'),
    where: extract('Where'),
    why: extract('Why'),
    how: extract('How')
  };
}
