# 迁移到 Vercel AI SDK 设计文档

> 创建日期：2026-06-04

## 背景与目标

当前 YouTube to Article 项目的手动 LLM 调用实现存在以下维护痛点：

1. **手动 SSE 解析复杂**：`parseGeminiChunk` 需要处理多种边界情况（JSON 数组格式、data: 前缀、逗号分隔等）
2. **流式/非流式两套实现**：`gemini.ts` 和 `summarizer.ts` 风格不统一
3. **多模型扩展成本高**：后续接入 OpenAI/Claude 需要重复写 adapter

**目标**：通过 Vercel AI SDK 统一 LLM 调用层，彻底移除手动 SSE 解析代码。

## 架构设计

### 变更概览

```
当前架构                          新架构
──────────                       ───────
gemini.ts ──fetch──→ 手动解析 SSE  gemini.ts ──streamText()──→ SDK 处理流式
summarizer.ts ──fetch──→ JSON      summarizer.ts ──generateText()──→ SDK 处理非流式
```

### 文件结构

```
worker/src/
├── lib/
│   ├── llm/
│   │   ├── index.ts      # 统一 LLM 接口 (streamArticle, generateFiveWOneH)
│   │   └── prompts.ts    # Prompt 构建逻辑（从原文件提取）
│   ├── gemini.ts         # 删除（功能合并到 llm/）
│   └── summarizer.ts     # 重写，调用 llm/index.ts
└── routes.ts             # 轻微调整（适配 SDK 的 stream 格式）
```

## 组件设计

### 1. llm/index.ts

统一 LLM 接口层，封装 Vercel AI SDK。

```typescript
import { streamText, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import type { GenerationRequirements } from '../../types';

export interface StreamArticleOptions {
  subtitles: string;
  requirements?: GenerationRequirements;
  apiKey: string;
}

export interface ArticleStreamResult {
  textStream: ReadableStream<string>;
}

/**
 * 流式生成文章
 * 返回 ReadableStream，由调用方处理 SSE 格式转换
 */
export async function streamArticle(
  options: StreamArticleOptions
): Promise<ArticleStreamResult> {
  const { subtitles, requirements, apiKey } = options;
  const prompt = buildArticlePrompt(subtitles, requirements);

  const result = streamText({
    model: google('gemini-2.5-flash', { apiKey }),
    prompt,
    temperature: 0.7,
    maxTokens: 8192,
  });

  return { textStream: result.textStream };
}

export interface GenerateFiveWOneHOptions {
  fullArticle: string;
  chapterTitle: string;
  chapterContent: string;
  apiKey: string;
}

export interface FiveWOneH {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how: string;
}

/**
 * 非流式生成 5W1H 总结
 */
export async function generateFiveWOneH(
  options: GenerateFiveWOneHOptions
): Promise<FiveWOneH> {
  const { fullArticle, chapterTitle, chapterContent, apiKey } = options;
  const prompt = buildFiveWOneHPrompt(fullArticle, chapterTitle, chapterContent);

  const result = await generateText({
    model: google('gemini-1.5-flash', { apiKey }),
    prompt,
    temperature: 0.3,
  });

  return parseFiveWOneH(result.text);
}

// Prompt 构建函数
function buildArticlePrompt(subtitles: string, requirements?: GenerationRequirements): string {
  const parts = [
    '你是一位专业的内容编辑，请将以下 YouTube 视频字幕转换为高质量的中文对话文章。',
    '',
    '要求：',
    '- 使用对话体呈现，保持原视频的叙述逻辑',
    '- 按主题分章节，章节标题使用 ## 格式',
    '- 语言流畅自然，适合中文阅读',
    ''
  ];

  if (requirements) {
    parts.push('生成要求：');
    if (requirements.taskType) parts.push(`- 任务类型：${requirements.taskType}`);
    if (requirements.style) parts.push(`- 输出风格：${requirements.style}`);
    if (requirements.audience) parts.push(`- 目标受众：${requirements.audience}`);
    if (requirements.constraints) parts.push(`- 约束条件：${requirements.constraints}`);
    parts.push('');
  }

  parts.push('字幕内容：');
  parts.push(subtitles);
  parts.push('');
  parts.push('请开始生成：');

  return parts.join('\n');
}

function buildFiveWOneHPrompt(
  fullArticle: string,
  chapterTitle: string,
  chapterContent: string
): string {
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

function parseFiveWOneH(text: string): FiveWOneH {
  try {
    const parsed = JSON.parse(text);
    return validateFiveWOneH(parsed);
  } catch {
    return extractFromText(text);
  }
}

function validateFiveWOneH(data: unknown): FiveWOneH {
  const required = ['who', 'what', 'when', 'where', 'why', 'how'];
  const result: Partial<FiveWOneH> = {};

  for (const key of required) {
    const value = (data as Record<string, unknown>)?.[key];
    result[key as keyof FiveWOneH] = typeof value === 'string' ? value : '暂无信息';
  }

  return result as FiveWOneH;
}

function extractFromText(text: string): FiveWOneH {
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
```

### 2. routes.ts 调整

流式路由需要适配 SDK 的 ReadableStream 到 Hono 的 SSE 格式。

```typescript
import { streamText } from './lib/llm';

// /api/generate-article 路由
return streamSSE(c, async (stream) => {
  const cache = new ContextCache(getCache());
  let fullContent = '';
  let currentChapterId: string | null = null;

  try {
    const { textStream } = await streamArticle({
      subtitles: decodedSubtitles,
      requirements,
      apiKey
    });

    // SDK 返回的是 ReadableStream<string>
    for await (const chunk of textStream) {
      fullContent += chunk;

      // 章节检测逻辑保持不变
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

// /api/summarize-chapter 路由
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

  const chapter = context.chapters.find(c => c.id === chapterId);
  if (!chapter) {
    return c.json({ success: false, error: 'Chapter not found' }, 404);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, error: 'Gemini API key not configured' }, 500);
  }

  try {
    const summary = await generateFiveWOneH({
      fullArticle: context.fullArticle,
      chapterTitle: chapter.title,
      chapterContent: chapter.content,
      apiKey
    });
    return c.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});
```

## 依赖变更

**worker/package.json**:

```json
{
  "dependencies": {
    "ai": "6.0.195",
    "@ai-sdk/google": "3.0.80",
    "hono": "^4.0.0"
  }
}
```

**版本说明**：
- `ai` 4.x+ 引入全新 API（`streamText`/`generateText`），与 3.x 不兼容
- `ai` 6.x 是 4.x 系列的稳定版本，Cloudflare Workers 支持良好
- `@ai-sdk/google` 3.x 配合 `ai` 4.x+ 使用

## 数据流

### 流式生成流程

```
前端 EventSource ──┐
                  ▼
    ┌────────────────────────────┐
    │   Hono streamSSE           │
    │   ─────────────────        │
    │   SDK streamText()         │
    │   → 生成 ReadableStream    │
    │   → 逐 chunk 输出          │
    │   → 检测章节标题           │
    │   → 发送 chapter 事件      │
    │   → 完成后发送 done 事件   │
    └────────────────────────────┘
```

### 非流式生成流程

```
前端 POST ──┐
           ▼
  ┌─────────────────────┐
  │  generateText()     │
  │  → 一次性返回结果   │
  │  → 解析为 5W1H JSON │
  └─────────────────────┘
```

## 错误处理

| 错误场景 | 当前处理 | 新处理 |
|---------|---------|--------|
| API Key 缺失 | 返回 500 | 提前检查，返回 500 |
| 流式中断 | 手动 catch | SDK 自动处理，需捕获 error |
| 解析失败 | 手动 parseGeminiChunk | **SDK 已处理，该函数移除** |
| 超时 | 手动 AbortController | SDK 内置 timeout 选项 |
| API 错误 | 手动解析 response | SDK 抛出结构化错误 |

## 删除的代码

以下文件/函数将被删除：

1. `worker/src/lib/gemini.ts` - 整文件删除
   - `streamGenerateArticle` 函数
   - `buildPrompt` 函数（逻辑移到 llm/prompts.ts）
   - `parseGeminiChunk` 函数（**核心收益：移除复杂的手动解析**）

2. `worker/src/lib/summarizer.ts` - 重写
   - `generateFiveWOneH` 函数（改为调用 llm/index.ts）
   - `buildFiveWOneHPrompt` 函数（逻辑移到 llm/prompts.ts）

## 风险与注意事项

1. **Bundle 体积增加**：`ai` 包会增加约 100-200KB（gzipped），但对于个人项目可接受
2. **模型版本**：使用 `gemini-2.5-flash` 和 `gemini-1.5-flash`，后续可通过修改 provider 参数切换模型
3. **章节检测**：保留现有的正则匹配 `## 标题` 逻辑，SDK 不改变输出格式
4. **前端兼容性**：保持 SSE 事件格式不变，前端无需修改

## 成功标准

- [ ] `parseGeminiChunk` 函数被完全移除
- [ ] 流式生成和非流式生成使用统一的 SDK API
- [ ] 前端无需任何修改即可正常工作
- [ ] 后续切换模型只需改一行配置（`google('model-name')`）
