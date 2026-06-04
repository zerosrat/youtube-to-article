# 迁移到 Vercel AI SDK 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将手动 LLM 调用迁移到 Vercel AI SDK，统一流式/非流式接口，移除手动 SSE 解析代码。

**架构：** 使用 `ai` 包的 `streamText()` 和 `generateText()` 封装统一 LLM 层，保持前端 SSE 格式兼容。

**Tech Stack:** TypeScript, Hono, Vercel AI SDK (`ai`, `@ai-sdk/google`), Cloudflare Workers

---

## 文件结构变更

```
worker/src/
├── lib/
│   ├── llm/
│   │   ├── index.ts      # 新建：统一 LLM 接口
│   │   └── prompts.ts    # 新建：Prompt 构建逻辑
│   ├── gemini.ts         # 删除：功能合并到 llm/
│   └── summarizer.ts     # 删除：功能合并到 llm/
└── routes.ts             # 修改：适配 SDK 输出格式
```

---

## Task 1: 安装 Vercel AI SDK 依赖

**Files:**
- Modify: `worker/package.json`
- Directory: `worker/`

- [ ] **Step 1: 安装依赖包**

在 `worker/` 目录下执行：

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker
pnpm add ai@6.0.195 @ai-sdk/google@3.0.80
```

- [ ] **Step 2: 验证安装**

```bash
cat package.json | grep -A 5 '"dependencies"'
```

Expected: 看到 `"ai": "6.0.195"` 和 `"@ai-sdk/google": "3.0.80"`

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add ai@6.0.195 and @ai-sdk/google@3.0.80"
```

---

## Task 2: 创建 Prompt 构建模块

**Files:**
- Create: `worker/src/lib/llm/prompts.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker/src/lib/llm
```

- [ ] **Step 2: 创建 prompts.ts**

```typescript
import type { GenerationRequirements } from '../../types';

export function buildArticlePrompt(
  subtitles: string,
  requirements?: GenerationRequirements
): string {
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

export function buildFiveWOneHPrompt(
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
```

- [ ] **Step 3: 提交**

```bash
git add worker/src/lib/llm/prompts.ts
git commit -m "feat: add llm prompt builders"
```

---

## Task 3: 创建统一 LLM 接口模块

**Files:**
- Create: `worker/src/lib/llm/index.ts`

- [ ] **Step 1: 创建 index.ts**

```typescript
import { streamText, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import type { GenerationRequirements } from '../../types';
import { buildArticlePrompt, buildFiveWOneHPrompt } from './prompts';

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

/**
 * 非流式生成 5W1H 总结
 */
export async function generateFiveWOneH(
  options: GenerateFiveWOneHOptions
): Promise<FiveWOneH> {
  const { fullArticle, chapterTitle, chapterContent, apiKey } = options;
  const prompt = buildFiveWOneHPrompt(fullArticle, chapterTitle, chapterContent);

  const result = await generateText({
    model: google('gemini-2.5-flash', { apiKey }),
    prompt,
    temperature: 0.3,
  });

  return parseFiveWOneH(result.text);
}
```

- [ ] **Step 2: 提交**

```bash
git add worker/src/lib/llm/index.ts
git commit -m "feat: add unified LLM interface with ai SDK"
```

---

## Task 4: 重写 routes.ts 使用新接口

**Files:**
- Modify: `worker/src/routes.ts`

- [ ] **Step 1: 更新导入语句**

将文件开头的导入从：
```typescript
import { streamGenerateArticle } from './lib/gemini';
import { generateFiveWOneH } from './lib/summarizer';
```

改为：
```typescript
import { streamArticle, generateFiveWOneH } from './lib/llm';
```

- [ ] **Step 2: 重写 /api/generate-article 路由**

将原有流式路由（约44-122行）替换为：

```typescript
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
      const { textStream } = await streamArticle({
        subtitles: decodedSubtitles,
        requirements,
        apiKey
      });

      // SDK 返回的是 ReadableStream<string>
      for await (const chunk of textStream) {
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
```

- [ ] **Step 3: 重写 /api/summarize-chapter 路由**

将原有路由（约124-152行）替换为：

```typescript
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

- [ ] **Step 4: 验证类型检查通过**

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker
pnpm typecheck
```

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add worker/src/routes.ts
git commit -m "feat: rewrite routes to use ai SDK"
```

---

## Task 5: 删除旧文件

**Files:**
- Delete: `worker/src/lib/gemini.ts`
- Delete: `worker/src/lib/summarizer.ts`

- [ ] **Step 1: 删除 gemini.ts**

```bash
rm /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker/src/lib/gemini.ts
```

- [ ] **Step 2: 删除 summarizer.ts**

```bash
rm /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker/src/lib/summarizer.ts
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker
pnpm typecheck
```

Expected: 无错误（确认没有文件引用旧模块）

- [ ] **Step 4: 提交**

```bash
git add worker/src/lib/gemini.ts worker/src/lib/summarizer.ts
git commit -m "refactor: remove manual gemini and summarizer modules"
```

---

## Task 6: 启动服务并 curl 测试

**Files:**
- Directory: `worker/`, `frontend/`

- [ ] **Step 1: 确保 GEMINI_API_KEY 已配置**

```bash
cat /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker/.dev.vars
```

Expected: 包含 `GEMINI_API_KEY=...`

- [ ] **Step 2: 启动 Worker**

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker
pnpm dev
```

保持运行，新终端继续。

- [ ] **Step 3: 测试字幕提取接口**

```bash
curl -X POST http://localhost:8787/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"}'
```

Expected: 返回 JSON，包含 `success: true` 和 `subtitles`

- [ ] **Step 4: 测试流式文章生成**

```bash
curl -N 'http://localhost:8787/api/generate-article?subtitles=test%20content&sessionId=test123' \
  -H 'Accept: text/event-stream'
```

Expected: 看到 SSE 格式输出：
```
event: chunk
data: {"type":"content","text":"..."}

event: chapter
data: {"type":"chapter","id":"...","title":"..."}

event: done
data: {"type":"done","sessionId":"test123"}
```

- [ ] **Step 5: 先手动创建上下文测试 5W1H**

由于 5W1H 依赖缓存中的上下文，先调用一次完整生成：

```bash
# 提取字幕
SUBS=$(curl -s -X POST http://localhost:8787/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"}' | jq -r '.subtitles' | jq -sRr @uri)

# 流式生成（保存 sessionId）
curl -N "http://localhost:8787/api/generate-article?subtitles=${SUBS}&sessionId=test5w1h"
```

记录返回的 sessionId（示例中是 `test5w1h`）。

- [ ] **Step 6: 测试 5W1H 接口**

```bash
curl -X POST http://localhost:8787/api/summarize-chapter \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test5w1h",
    "chapterId": "<从生成结果中获取的章节ID>"
  }'
```

Expected: 返回 JSON 格式：
```json
{
  "success": true,
  "summary": {
    "who": "...",
    "what": "...",
    "when": "...",
    "where": "...",
    "why": "...",
    "how": "..."
  }
}
```

- [ ] **Step 7: 停止 Worker**

Ctrl+C 终止 worker dev server。

---

## Task 7: 验证前端兼容性

**Files:**
- Directory: `frontend/`

- [ ] **Step 1: 启动 Frontend**

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article/frontend
pnpm dev
```

- [ ] **Step 2: 浏览器测试**

打开 http://localhost:3000

测试步骤：
1. 粘贴 YouTube URL
2. 点击提取字幕
3. 点击生成文章
4. 等待生成完成，验证章节列表显示正常
5. 点击某个章节的"总结"按钮，验证 5W1H 弹窗显示正常

- [ ] **Step 3: 停止 Frontend**

Ctrl+C 终止。

- [ ] **Step 4: 提交（如测试通过）**

```bash
git commit --allow-empty -m "test: verify frontend compatibility with ai SDK"
```

---

## 完成检查清单

- [ ] `worker/src/lib/gemini.ts` 已删除
- [ ] `worker/src/lib/summarizer.ts` 已删除
- [ ] `worker/src/lib/llm/index.ts` 和 `prompts.ts` 已创建
- [ ] `worker/src/routes.ts` 已更新使用新接口
- [ ] `pnpm typecheck` 无错误
- [ ] curl 测试流式接口返回正确 SSE 格式
- [ ] curl 测试 5W1H 接口返回正确 JSON
- [ ] 前端页面功能正常
