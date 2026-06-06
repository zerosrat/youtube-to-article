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

### 如何调用 Gemini 并实现流式输出

**技术选型**: 使用 Vercel AI SDK (`ai` + `@ai-sdk/google`)，提供统一的流式接口。

**实现流程**:
1. 后端调用 `streamText()` 获取 Gemini 的 ReadableStream，通过 Hono 的 `streamSSE()` 直接透传给前端
2. 前端使用 `fetch()` + `ReadableStream` 消费 SSE 事件，实时渲染到页面

**关键设计**: 不等待完整响应，而是将 Gemini 的流直接透传，实现真正的实时生成体验。

### 如何根据用户生成要求影响输出结果

用户在表单中填写的生成要求（任务类型、输出风格、目标受众、约束条件）通过 `GenerationRequirements` 类型传递到后端。

**Prompt 构建策略**: 动态拼接生成要求到 Prompt 中，采用非侵入式设计：
- 用户不填写时，Prompt 完全不受影响
- 使用 Markdown 列表格式，LLM 更容易理解
- 要求作为"软约束"，不强制全部覆盖，但输出不会超出范围

### 如何实现章节级 5W1H 总结

**上下文存储**: 文章生成完成后，使用 Cloudflare Cache API 保存完整上下文（TTL 1小时），避免前端重新提交整篇文章。

**章节解析**: 通过正则表达式实时解析生成的内容，提取 `##` 格式的章节标题和对应内容范围。

**5W1H 生成**: 用户点击章节旁的 [5W1H] 按钮时：
1. 从缓存读取完整文章和章节信息
2. 将整篇文章作为背景 + 目标章节内容传给 Gemini
3. 要求以 JSON 格式返回 who/what/when/where/why/how 六个字段
4. 结果解析采用双重容错：优先 JSON 解析，失败时降级为正则提取

### 主要工程取舍和亮点

#### 架构取舍

| 决策 | 选择 | 理由 |
|------|------|------|
| 部署平台 | Cloudflare Worker + Pages | 边缘部署、低延迟、免费额度充足 |
| 流式方案 | SSE (Server-Sent Events) | 比 WebSocket 简单，比轮询实时 |
| 状态存储 | Cache API (非 KV) | 临时上下文无需持久化，免费且简单 |
| LLM SDK | Vercel AI SDK | 统一的流式接口，支持多模型切换 |

#### 技术亮点

1. **真正的流式体验**
   - 不是"生成完再分段发送"，而是直接透传 Gemini 的流
   - 前端实时渲染，无需等待整篇文章

2. **优雅的降级策略**
   - 字幕获取：API → 直接解析 → Fallback 数据
   - 5W1H 解析：JSON 解析 → 正则提取 → 默认值

3. **上下文感知总结**
   - 5W1H 不仅基于章节内容，还结合整篇文章背景
   - 避免孤立理解，总结更准确

4. **类型安全**
   - 前后端共享 TypeScript 类型定义
   - 严格的接口契约，减少运行时错误

5. **零成本运维**
   - 完全使用 Cloudflare 免费额度
   - 无数据库、无服务器维护负担

## 项目结构

```
youtube-to-article/
├── frontend/          # Vite + Cloudflare Pages
├── worker/            # Cloudflare Worker + Hono
└── docs/              # 设计文档
```
