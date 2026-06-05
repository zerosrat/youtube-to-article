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

### 如何获取和处理 YouTube 字幕

项目使用 **youtube-transcript.io API** 获取 YouTube 视频字幕：

1. **API 调用**: 后端向 `https://www.youtube-transcript.io/api/transcripts` 发送 POST 请求，携带视频 ID
2. **认证方式**: 使用 Basic Auth，`Authorization: Basic <your-api-token>`
3. **限流保护**: 客户端限流控制（2.1 秒/请求），避免触发 API 的 5 请求/10 秒限制
4. **语言选择**: 优先返回英文或中文字幕（优先级：en → zh → zh-CN → zh-TW），无匹配时返回首个可用语言
5. **Fallback 机制**: API 失败或视频无字幕时，自动降级到硬编码的演示字幕，保证用户体验

**技术选型过程**

| 方案 | 尝试 | 问题 | 结论 |
|------|------|------|------|
| 直接请求 YouTube | 通过 `fetch()` 请求 `youtube.com/watch?v=xxx` 并解析 `ytInitialPlayerResponse` | Cloudflare Worker 环境 `Network connection lost`，本地开发也无法连接 | 不可行 |
| HTTP 代理 | 使用 webshare.io 代理绕过网络限制 | 代理可连接，但 YouTube 检测到数据中心 IP 后要求登录验证，无法获取字幕数据 | 不可行 |
| 代理 + 登录 | 通过 SOCKS5 + TCP Socket 连接，模拟浏览器登录 | 需要处理 reCAPTCHA、设备指纹、Cookie 管理，复杂度过高且账号易被封禁 | 成本过高 |
| **第三方 API** | 使用 youtube-transcript.io 专业字幕服务 | 需要处理限流和付费，但稳定可靠 | **最终选择** |

**取舍**: 牺牲完全免费和零依赖，换取开发效率和稳定性。第三方 API 的限流（5 请求/10 秒）对单用户使用足够，且 Fallback 机制保证体验不中断。

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
