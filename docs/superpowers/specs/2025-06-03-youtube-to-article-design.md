# YouTube to Article 设计文档

## 1. 项目概述

将 YouTube 视频字幕转换为中文对话文章的 Web 应用。基于 Cloudflare 基础设施，使用 Gemini AI Studio API 进行内容生成。

### 1.1 核心功能

- 输入 YouTube 视频链接，提取字幕
- 基于字幕生成中文对话文章（流式输出）
- 支持自定义生成要求（任务类型、输出风格、目标受众、约束条件）
- 章节级 5W1H 总结（Who/What/When/Where/Why/How）
- 硬编码字幕作为 YouTube 提取失败的 fallback

### 1.2 技术约束

- 部署平台：Cloudflare Worker + Cloudflare Pages
- 语言：TypeScript
- API：Gemini AI Studio 免费版
- 时间：本周完成

## 2. 架构设计

采用分离式架构（方案 B）：

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Pages (Frontend)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  输入页面    │  │  文章展示页  │  │  5W1H 折叠面板       │  │
│  │  - YouTube   │  │  - 流式渲染  │  │  - 章节级总结        │  │
│  │    链接输入  │  │  - Markdown  │  │                      │  │
│  │  - 生成要求  │  │    样式      │  │                      │  │
│  │    可选配置  │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                    EventSource (SSE)                             │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker (API)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  /api/extract-subtitles                                   │  │
│  │  - 接收 YouTube URL                                       │  │
│  │  - 提取字幕 (含硬编码 fallback)                           │  │
│  │  - 返回字幕文本                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  /api/generate-article (SSE Stream)                       │  │
│  │  - 接收字幕 + 生成要求                                    │  │
│  │  - 流式调用 Gemini API                                    │  │
│  │  - 解析章节结构，实时推送 chunk                            │  │
│  │  - 服务端保存生成上下文 (Cache API)                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  /api/summarize-chapter                                   │  │
│  │  - 接收章节 ID + 会话 ID                                  │  │
│  │  - 基于保存的上下文生成 5W1H                              │  │
│  │  - 返回结构化 JSON                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 架构决策

- **分离式（Pages + Worker）vs Monolithic**：职责分离，前端可独立迭代
- **SSE vs WebSocket**：SSE 更适合单向文本流，浏览器原生支持
- **Cache API vs D1**：Cache API 无冷启动延迟，适合临时上下文存储

## 3. 组件设计

### 3.1 Frontend (Cloudflare Pages)

| 组件 | 文件 | 职责 |
|------|------|------|
| `App` | `src/app.ts` | 路由管理（输入页 → 结果页） |
| `InputForm` | `src/components/input-form.ts` | YouTube URL 输入、生成要求配置 |
| `ArticleViewer` | `src/components/article-viewer.ts` | 流式内容渲染、章节识别 |
| `Chapter` | `src/components/chapter.ts` | 章节容器、5W1H 折叠面板触发 |
| `FiveWOneHPanel` | `src/components/five-w-one-h.ts` | 5W1H 内容展示 |
| `StreamRenderer` | `src/lib/stream-renderer.ts` | SSE 连接管理、分块渲染逻辑 |

### 3.2 Backend (Cloudflare Worker)

| 模块 | 文件 | 职责 |
|------|------|------|
| `routes` | `src/routes.ts` | 路由分发 |
| `subtitles` | `src/lib/subtitles.ts` | YouTube 字幕提取、硬编码 fallback |
| `gemini` | `src/lib/gemini.ts` | Gemini API 调用、流式响应处理 |
| `context-cache` | `src/lib/context-cache.ts` | 生成上下文存储/读取 |
| `summarizer` | `src/lib/summarizer.ts` | 5W1H 生成逻辑 |

## 4. 数据流

```
用户输入 URL + 生成要求
        │
        ▼
[POST] /api/extract-subtitles
        │
        ├─► 尝试 YouTube 提取 ──► 成功 ──┐
        └─► 失败 ──► 硬编码字幕 fallback ─┘
        │
        ▼
前端显示 "提取成功"，发送生成请求
        │
        ▼
[GET] /api/generate-article (SSE)
        │
        ├─► Worker 调用 Gemini 流式 API
        ├─► 解析章节边界（如 "## 章节标题"）
        ├─► 推送 chunk 到前端
        └─► 缓存完整文章 + 章节索引到 Cache
        │
        ▼
前端实时渲染文章，识别章节标题
        │
用户点击章节旁的 [5W1H] 按钮
        │
        ▼
[POST] /api/summarize-chapter
        │
        ├─► 从 Cache 获取文章上下文
        ├─► 提取指定章节内容
        ├─► 调用 Gemini 生成 5W1H JSON
        └─► 返回结构化数据
        │
        ▼
前端展开章节下的 5W1H 面板，渲染表格
```

## 5. API 设计

### 5.1 POST /api/extract-subtitles

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"
}
```

**Response:**
```json
{
  "success": true,
  "source": "youtube",
  "title": "视频标题",
  "subtitles": "字幕文本内容..."
}
```

**Fallback Response:**
```json
{
  "success": true,
  "source": "fallback",
  "message": "使用演示数据",
  "title": "示例视频标题",
  "subtitles": "硬编码字幕内容..."
}
```

### 5.2 GET /api/generate-article (SSE)

**Query Parameters:**
```
?subtitles=<encoded_subtitles>&requirements=<encoded_json>&sessionId=<uuid>
```

**SSE Events:**
```
event: chunk
data: {"type": "content", "text": "生成的文本片段"}

event: chapter
data: {"type": "chapter", "id": "ch-1", "title": "章节标题"}

event: done
data: {"type": "done", "sessionId": "xxx"}

event: error
data: {"type": "error", "message": "错误信息"}
```

### 5.3 POST /api/summarize-chapter

**Request:**
```json
{
  "sessionId": "xxx",
  "chapterId": "ch-1"
}
```

**Response:**
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

## 6. 提示词设计

### 6.1 主文章生成提示词

```
你是一位专业的内容编辑，请将以下 YouTube 视频字幕转换为高质量的中文对话文章。

要求：
- 使用对话体呈现，保持原视频的叙述逻辑
- 按主题分章节，章节标题使用 ## 格式
- 语言流畅自然，适合中文阅读

生成要求：
- 任务类型：{taskType}
- 输出风格：{style}
- 目标受众：{audience}
- 约束条件：{constraints}

字幕内容：
{subtitles}

请开始生成：
```

### 6.2 5W1H 生成提示词

```
基于以下视频文章内容，请为指定章节生成 5W1H 总结。

完整文章：
{fullArticle}

目标章节：
{chapterTitle}

章节内容：
{chapterContent}

请以 JSON 格式返回：
{
  "who": "...",
  "what": "...",
  "when": "...",
  "where": "...",
  "why": "...",
  "how": "..."
}
```

## 7. 错误处理

| 场景 | 处理策略 |
|------|----------|
| YouTube 提取失败（验证码/网络） | 自动降级到硬编码字幕，UI 提示"使用演示数据" |
| Gemini API 限流/失败 | SSE 推送错误事件，前端显示重试按钮 |
| 生成内容解析失败 | 优雅降级，原始文本直接渲染，不阻断阅读 |
| 5W1H 上下文过期（>1小时） | 返回 410 Gone，前端提示"请重新生成文章" |
| 浏览器兼容（无 EventSource） | 优雅降级为轮询模式 |

## 8. 章节识别策略

Gemini 生成时使用 `## 章节标题` Markdown 格式。前端通过正则识别章节边界：

```typescript
const chapterRegex = /^##\s+(.+)$/gm;
```

识别到章节标题时，在 DOM 中插入章节容器，包含：
- 章节标题（带锚点 ID）
- 章节内容区域
- [5W1H] 按钮

## 9. 缓存策略

使用 Cloudflare Cache API 存储生成上下文：

```typescript
interface ArticleContext {
  sessionId: string;
  fullArticle: string;
  chapters: Array<{
    id: string;
    title: string;
    content: string;
  }>;
  createdAt: number;
}
```

- TTL：1 小时
- Key：`article:${sessionId}`

## 10. 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vite + TypeScript + Tailwind CSS |
| 后端 | Cloudflare Worker + Hono |
| API | Gemini AI Studio REST API |
| 包管理 | pnpm |
| 部署 | Wrangler CLI |

## 11. 测试策略

| 测试类型 | 覆盖点 |
|----------|--------|
| 单元测试 | `subtitles.ts` 提取逻辑、`context-cache.ts` 存取 |
| 集成测试 | 端到端流式生成流程（使用 mock Gemini 响应） |
| 手动验证 | YouTube 提取、硬编码 fallback、5W1H 交互、移动端响应式 |

## 12. 文件结构

```
youtube-to-article/
├── frontend/                      # Vite + Cloudflare Pages
│   ├── src/
│   │   ├── main.ts                # Vite entry
│   │   ├── app.ts
│   │   ├── components/
│   │   │   ├── input-form.ts
│   │   │   ├── article-viewer.ts
│   │   │   ├── chapter.ts
│   │   │   └── five-w-one-h.ts
│   │   ├── lib/
│   │   │   └── stream-renderer.ts
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── worker/                        # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes.ts
│   │   └── lib/
│   │       ├── subtitles.ts
│   │       ├── gemini.ts
│   │       ├── context-cache.ts
│   │       └── summarizer.ts
│   └── wrangler.toml
├── docs/
│   └── PRD.md
└── README.md
```

## 13. 硬编码字幕数据

预置《对话安德森：AI革命的万亿美金之问》视频字幕，用于演示。

---

**设计确认日期**: 2025-06-03
**架构方案**: B（分离式: Pages + Worker）
**UI风格**: 现代文档型（Notion/Lark风格）
**5W1H交互**: 内嵌折叠面板
