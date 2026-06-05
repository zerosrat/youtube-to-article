# YouTube Transcript API 集成设计文档

**日期**: 2026-06-05  
**目标**: 集成 youtube-transcript.io API 解决 YouTube 字幕提取问题

---

## 背景

当前字幕提取实现使用直接 HTTP 请求 YouTube 页面，在 Cloudflare Worker 环境和本地开发环境中均失败：

1. **本地开发**: `Network connection lost` - Miniflare 无法连接 YouTube
2. **代理方案**: webshare.io HTTP 代理可连接但 YouTube 要求登录验证，不返回字幕数据
3. **登录方案**: 复杂度极高，需要处理 reCAPTCHA、设备指纹、Cookie 管理，维护成本过高

**解决方案**: 使用 youtube-transcript.io 专业字幕提取服务

---

## 需求

### 功能需求

1. 通过 API 获取 YouTube 视频字幕
2. 支持多语言字幕选择（优先 en → zh → zh-CN → zh-TW）
3. 限流保护（5 请求/10 秒），避免触发 429
4. API Token 安全配置（环境变量）
5. 失败时回退到硬编码演示数据

### 非功能需求

1. 保留现有调试日志
2. 保持现有接口不变（`extractSubtitles` 函数签名）
3. 最小化改动，单文件实现

---

## 架构设计

### 新增组件

```
worker/src/lib/
├── youtube-transcript-api.ts    # 新增：API 客户端
└── subtitles.ts                 # 修改：集成 API 调用
```

### 数据流

```
Frontend → POST /api/extract-subtitles
                ↓
         extractSubtitles(url)
                ↓
         fetchTranscriptViaAPI(videoId)
                ↓
         POST https://www.youtube-transcript.io/api/transcripts
                ↓
         Return {title, subtitles} | null
                ↓
         Success → Return subtitles
         Failure → useFallback(message)
```

---

## API 规范

### 请求

```http
POST https://www.youtube-transcript.io/api/transcripts
Authorization: Basic <base64(token:)>
Content-Type: application/json

{
  "ids": ["xRh2sVcNXQ8"]
}
```

**注意**: Token 需要 Base64 编码（`Buffer.from(token + ':').toString('base64')`）

### 响应

```json
{
  "pageInfo": {
    "totalResults": 1
  },
  "items": [
    {
      "id": "xRh2sVcNXQ8",
      "title": "Marc Andreessen: AI...",
      "transcripts": [
        {
          "language": "en",
          "text": "full transcript text..."
        },
        {
          "language": "zh-CN",
          "text": "中文翻译..."
        }
      ]
    }
  ]
}
```

### 错误响应

- `429 Too Many Requests`: 限流触发，需等待 `Retry-After` 秒
- `401 Unauthorized`: Token 无效
- `404 Not Found`: 视频无字幕

---

## 实现细节

### 限流策略

采用**客户端限流**而非重试：

```typescript
// 简单的请求间隔控制
const MIN_INTERVAL_MS = 2100; // 10秒/5请求 = 2秒/请求

let lastRequestTime = 0;

async function fetchWithRateLimit(videoId: string): Promise<...> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }

  lastRequestTime = Date.now();
  return fetch(...);
}
```

**原因**:
- Worker 是无状态环境，无法维护全局限流状态
- 单个用户连续操作间隔通常 > 2 秒，自然满足限流
- 简化实现，不引入复杂重试逻辑

### 语言选择逻辑

```typescript
const LANGUAGE_PRIORITY = ['en', 'zh', 'zh-CN', 'zh-TW'];

function selectTranscript(transcripts: Transcript[]): string {
  for (const lang of LANGUAGE_PRIORITY) {
    const match = transcripts.find(t => t.language === lang);
    if (match) return match.text;
  }
  return transcripts[0]?.text || '';
}
```

---

## 环境变量

```bash
# worker/.dev.vars
GEMINI_API_KEY=xxx
YOUTUBE_TRANSCRIPT_API_TOKEN=xxx  # 新增
```

---

## 测试计划

1. **正常流程**: 提取 xRh2sVcNXQ8 字幕，验证返回结构和内容
2. **限流测试**: 快速连续请求 3 次，验证无 429 错误
3. **无字幕视频**: 测试无字幕视频的失败处理
4. **多语言**: 验证优先返回英文/中文字幕

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| API 服务下线 | 中 | 高 | 保留 fallback 机制 |
| Token 泄露 | 低 | 高 | 使用 wrangler secret |
| 限流导致用户体验差 | 低 | 中 | 客户端间隔控制 |
| 视频无字幕 | 中 | 中 | fallback 提示 |

---

## 后续优化（可选）

1. **缓存层**: 使用 Cloudflare Cache API 缓存字幕结果（TTL: 1小时）
2. **批量提取**: 支持一次请求多个视频（API 支持）
3. **自动翻译**: 使用 Gemini 翻译英文字幕为中文
