# YouTube to Article

基于 Cloudflare Worker + Pages 的 YouTube 视频转中文对话文章工具。

## 功能特性

- 输入 YouTube 视频链接提取字幕
- 使用 Gemini AI 生成中文对话文章
- 流式输出，实时展示生成进度
- 支持自定义生成要求（任务类型、风格、受众、约束）
- 章节级 5W1H 总结（Who/What/When/Where/Why/How）
- 硬编码字幕作为演示 fallback

## 技术栈

- **Frontend**: Vite + TypeScript + Tailwind CSS
- **Backend**: Cloudflare Worker + Hono
- **AI**: Gemini AI Studio API
- **包管理**: pnpm

## 开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
# 编辑 worker/.dev.vars，添加你的 Gemini API Key
GEMINI_API_KEY=your_api_key_here
```

### 3. 启动开发服务器

```bash
# 终端 1: 启动 Worker
pnpm dev:worker

# 终端 2: 启动 Frontend
pnpm dev
```

### 4. 构建

```bash
pnpm build
```

## 部署

### 1. 部署 Worker

```bash
cd worker
wrangler secret put GEMINI_API_KEY
wrangler deploy
```

### 2. 部署 Pages

```bash
cd frontend
wrangler pages deploy dist
```

## 实现细节

### 字幕获取

项目尝试从 YouTube 提取字幕，如遇验证码/网络问题，自动降级到硬编码的演示字幕。

### 流式输出

使用 Server-Sent Events (SSE) 实现流式生成，用户可实时看到 AI 生成的内容。

### 5W1H 总结

- 服务端保存生成上下文到 Cloudflare Cache（TTL 1小时）
- 用户点击章节旁的 [5W1H] 按钮时，基于上下文生成该章节的结构化总结
- 无需重新提交整篇文章内容

## 项目结构

```
youtube-to-article/
├── frontend/          # Vite + Cloudflare Pages
├── worker/            # Cloudflare Worker + Hono
└── docs/              # 设计文档
```
