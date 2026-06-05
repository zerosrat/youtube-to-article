# YouTube Transcript API 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集成 youtube-transcript.io API，替代直接请求 YouTube 页面的方式获取视频字幕

**Architecture:** 新增 `youtube-transcript-api.ts` 客户端模块处理 API 认证、限流和语言选择；修改 `subtitles.ts` 集成新客户端并保留 fallback 机制

**Tech Stack:** TypeScript, Cloudflare Workers, youtube-transcript.io API

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `worker/src/lib/youtube-transcript-api.ts` | 创建 | API 客户端，处理认证、限流、语言选择 |
| `worker/src/lib/subtitles.ts` | 修改 | 集成 API 客户端，调整 Env 类型 |
| `worker/src/routes.ts` | 修改 | 更新 Env 类型包含新 token |
| `worker/.dev.vars` | 修改 | 添加 YOUTUBE_TRANSCRIPT_API_TOKEN |
| `worker/wrangler.toml` | 无改动 | 无需额外配置 |

---

## Task 1: 创建 API Token 环境变量

**Files:**
- Modify: `worker/.dev.vars`

- [ ] **Step 1: 添加 API Token 到环境变量**

在 `.dev.vars` 末尾添加：
```
YOUTUBE_TRANSCRIPT_API_TOKEN=your_api_token_here
```

**注意**: Token 从用户处获取，替换 `your_api_token_here` 为实际 token

- [ ] **Step 2: Commit 环境变量配置**

```bash
git add worker/.dev.vars
git commit -m "$(cat <<'EOF'
chore: add youtube-transcript API token placeholder

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 创建 youtube-transcript-api 客户端

**Files:**
- Create: `worker/src/lib/youtube-transcript-api.ts`

- [ ] **Step 1: 创建文件并写入完整实现**

```typescript
// worker/src/lib/youtube-transcript-api.ts

export interface TranscriptResult {
  title: string;
  subtitles: string;
}

interface TranscriptItem {
  id: string;
  title: string;
  transcripts: Array<{
    language: string;
    text: string;
  }>;
}

interface TranscriptResponse {
  pageInfo: {
    totalResults: number;
  };
  items: TranscriptItem[];
}

const LANGUAGE_PRIORITY = ['en', 'zh', 'zh-CN', 'zh-TW'];
const MIN_INTERVAL_MS = 2100; // 5 requests per 10 seconds = 2s per request

let lastRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function selectTranscript(transcripts: TranscriptItem['transcripts']): string {
  for (const lang of LANGUAGE_PRIORITY) {
    const match = transcripts.find(t => t.language === lang);
    if (match) return match.text;
  }
  return transcripts[0]?.text || '';
}

export interface FetchTranscriptOptions {
  videoId: string;
  apiToken: string;
}

export async function fetchTranscriptViaAPI(
  options: FetchTranscriptOptions
): Promise<TranscriptResult | null> {
  const { videoId, apiToken } = options;

  console.log(`[TranscriptAPI] Starting fetch for video: ${videoId}`);

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - elapsed;
    console.log(`[TranscriptAPI] Rate limiting: waiting ${waitTime}ms`);
    await sleep(waitTime);
  }
  lastRequestTime = Date.now();

  try {
    // Build Basic Auth header (token + empty password, base64 encoded)
    const authHeader = 'Basic ' + btoa(apiToken + ':');
    console.log(`[TranscriptAPI] Sending request to API`);

    const response = await fetch('https://www.youtube-transcript.io/api/transcripts', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: [videoId] })
    });

    console.log(`[TranscriptAPI] Response status: ${response.status}`);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '10';
      console.warn(`[TranscriptAPI] Rate limited, retry after: ${retryAfter}s`);
      return null;
    }

    if (response.status === 401) {
      console.warn('[TranscriptAPI] Unauthorized - invalid token');
      return null;
    }

    if (!response.ok) {
      console.warn(`[TranscriptAPI] API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as TranscriptResponse;
    console.log(`[TranscriptAPI] Got response with ${data.items?.length || 0} items`);

    if (!data.items || data.items.length === 0) {
      console.warn('[TranscriptAPI] No items in response');
      return null;
    }

    const item = data.items[0];

    if (!item.transcripts || item.transcripts.length === 0) {
      console.warn('[TranscriptAPI] No transcripts available for this video');
      return null;
    }

    console.log(`[TranscriptAPI] Available languages: ${item.transcripts.map(t => t.language).join(', ')}`);

    const subtitles = selectTranscript(item.transcripts);
    console.log(`[TranscriptAPI] Selected subtitle length: ${subtitles.length}`);

    return {
      title: item.title,
      subtitles
    };

  } catch (error) {
    console.error('[TranscriptAPI] Fetch failed:', error);
    return null;
  }
}
```

- [ ] **Step 2: Commit 新文件**

```bash
git add worker/src/lib/youtube-transcript-api.ts
git commit -m "$(cat <<'EOF'
feat: add youtube-transcript.io API client

- Implement fetchTranscriptViaAPI with rate limiting
- Support language priority: en → zh → zh-CN → zh-TW
- Handle 429, 401 and other error responses

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 更新 subtitles.ts 集成 API 客户端

**Files:**
- Modify: `worker/src/lib/subtitles.ts`

- [ ] **Step 1: 添加 import 并修改 Env 接口**

在文件顶部添加 import：
```typescript
import { FALLBACK_VIDEO } from './fallback-data';
import { fetchTranscriptViaAPI } from './youtube-transcript-api';  // ADD THIS LINE
```

- [ ] **Step 2: 修改 extractSubtitles 函数签名和实现**

找到 `extractSubtitles` 函数，修改参数和内部逻辑：

```typescript
export interface ExtractSubtitlesOptions {
  url: string;
  apiToken?: string;
}

export async function extractSubtitles(options: ExtractSubtitlesOptions): Promise<SubtitleResult> {
  const { url, apiToken } = options;
  console.log('[extractSubtitles] Starting with URL:', url);

  const videoId = extractVideoId(url);
  console.log('[extractSubtitles] Extracted videoId:', videoId);

  if (!videoId) {
    console.log('[extractSubtitles] No videoId found, using fallback');
    return useFallback('无效的 YouTube 链接');
  }

  // Try API first if token is available
  if (apiToken) {
    console.log('[extractSubtitles] Trying transcript API...');
    try {
      const result = await fetchTranscriptViaAPI({ videoId, apiToken });
      console.log('[extractSubtitles] API returned:', result ? 'success' : 'null');

      if (result) {
        return {
          success: true,
          source: 'youtube',
          title: result.title,
          subtitles: result.subtitles
        };
      }
    } catch (error) {
      console.error('[extractSubtitles] API error:', error);
    }
  } else {
    console.log('[extractSubtitles] No API token, skipping API attempt');
  }

  // Fallback to direct YouTube extraction (likely to fail in Worker env)
  console.log('[extractSubtitles] Trying direct YouTube extraction...');
  try {
    const result = await fetchYouTubeSubtitles(videoId);
    console.log('[extractSubtitles] Direct extraction returned:', result ? 'success' : 'null');

    if (result) {
      return {
        success: true,
        source: 'youtube',
        title: result.title,
        subtitles: result.subtitles
      };
    }
  } catch (error) {
    console.error('[extractSubtitles] Direct extraction error:', error);
  }

  console.log('[extractSubtitles] All methods failed, using fallback');
  return useFallback('YouTube 提取失败，使用演示数据');
}
```

**注意**: 原函数签名是 `extractSubtitles(url: string)`，改为 `extractSubtitles(options: ExtractSubtitlesOptions)`，需要在调用处更新

- [ ] **Step 3: Commit 修改**

```bash
git add worker/src/lib/subtitles.ts
git commit -m "$(cat <<'EOF'
feat: integrate transcript API into subtitle extraction

- Update extractSubtitles to use API token when available
- Fall back to direct extraction if API fails
- Keep fallback data as last resort

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 更新 routes.ts 传递 API Token

**Files:**
- Modify: `worker/src/routes.ts`

- [ ] **Step 1: 更新 Env 接口**

找到 `interface Env`，添加新字段：

```typescript
interface Env {
  GEMINI_API_KEY: string;
  YOUTUBE_TRANSCRIPT_API_TOKEN?: string;  // ADD THIS LINE
}
```

- [ ] **Step 2: 更新 extract-subtitles 路由**

找到 `app.post('/api/extract-subtitles', ...)`，修改调用：

```typescript
// 原代码:
// const result = await extractSubtitles(body.url);

// 改为:
const result = await extractSubtitles({
  url: body.url,
  apiToken: c.env.YOUTUBE_TRANSCRIPT_API_TOKEN
});
```

- [ ] **Step 3: Commit 修改**

```bash
git add worker/src/routes.ts
git commit -m "$(cat <<'EOF'
feat: wire up transcript API token to routes

- Add YOUTUBE_TRANSCRIPT_API_TOKEN to Env interface
- Pass token from environment to extractSubtitles

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 本地测试

**Files:**
- No file changes

- [ ] **Step 1: 确保 worker dev 服务器在运行**

```bash
# 检查是否已有进程
ps aux | grep wrangler

# 如果没有，启动它
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article && pnpm dev
```

- [ ] **Step 2: 测试字幕提取 API**

```bash
curl -s -X POST http://localhost:8787/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"}' | jq .
```

**预期成功输出**：
```json
{
  "success": true,
  "source": "youtube",
  "title": "Marc Andreessen: AI...",
  "subtitles": "full transcript text..."
}
```

**预期失败输出**（如果 token 无效或限流）：
```json
{
  "success": true,
  "source": "fallback",
  "message": "YouTube 提取失败，使用演示数据",
  "title": "对话安德森：AI革命的万亿美金之问",
  "subtitles": "[开场]\nMarc Andreessen: 我认为..."
}
```

- [ ] **Step 3: 查看 worker 日志**

检查日志中是否包含：
```
[extractSubtitles] Starting with URL: ...
[extractSubtitles] Trying transcript API...
[TranscriptAPI] Starting fetch for video: xRh2sVcNXQ8
[TranscriptAPI] Response status: 200
```

---

## Task 6: 部署准备（生产环境）

**Files:**
- No file changes

- [ ] **Step 1: 设置生产环境 secret**

```bash
cd worker
wrangler secret put YOUTUBE_TRANSCRIPT_API_TOKEN
# 输入实际的 API token
```

- [ ] **Step 2: 部署 worker**

```bash
wrangler deploy
```

- [ ] **Step 3: 验证部署**

```bash
# 替换为你的 worker URL
curl -s -X POST https://your-worker.your-subdomain.workers.dev/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"}' | jq .
```

---

## 验证清单

- [ ] `.dev.vars` 包含 `YOUTUBE_TRANSCRIPT_API_TOKEN`
- [ ] `worker/src/lib/youtube-transcript-api.ts` 文件创建并包含完整实现
- [ ] `worker/src/lib/subtitles.ts` 更新 import 和函数签名
- [ ] `worker/src/routes.ts` 更新 Env 接口和调用
- [ ] 本地测试成功返回字幕或 fallback
- [ ] Worker 日志显示正确的 API 调用流程
- [ ] 生产环境 secret 已设置
- [ ] 部署后测试成功

---

## 注意事项

1. **API Token 保密**: 不要将 token 提交到 git，始终使用环境变量
2. **Rate Limiting**: 客户端限流只在单个 Worker 实例内有效，多个实例可能仍会触发 429
3. **Fallback 机制**: API 失败时会自动回退到演示数据，不影响用户体验
4. **语言选择**: 优先返回英文或中文字幕，如无则返回第一个可用语言
