# UI/UX 优化设计文档

日期: 2026-06-06

## 背景

针对 YouTube to Article 项目的4个体验问题进行优化，提升用户感知和交互效率。

---

## 1. 标题中文翻译

### 问题
PRD 要求生成的内容都是中文，但 `/extract-subtitles` 接口返回的是英文标题。

### 方案
在 `worker/src/routes.ts` 的 `/extract-subtitles` 接口中，检测到英文标题后调用 Gemini 模型翻译成中文。

### 实现细节
- 添加 `translateTitle()` 函数，使用轻量级 prompt 要求翻译成中文
- 仅当标题包含非中文字符时才调用翻译（避免重复翻译已中文的标题）
- 翻译失败时返回原标题，不影响主流程
- 使用现有的 `GEMINI_API_KEY` 环境变量

### 关键代码结构
```typescript
// worker/src/lib/translate.ts
export async function translateTitle(title: string, apiKey: string): Promise<string> {
  // 检测是否包含中文，有则直接返回
  // 调用 Gemini API 翻译
  // 失败时返回原标题
}
```

---

## 2. Loading 交互优化

### 问题
当前 loading 状态显示在页面右上角（小圆点 + "生成中..." 文字），不够显眼，用户容易忽略。

### 方案
改为内容区占位 Loading，在文章展示区域中央显示大号 loading 动画。

### 实现细节
**字幕提取阶段（InputForm）：**
- 按钮显示旋转动画 + "提取字幕中..."
- 禁用按钮防止重复提交

**文章生成阶段（ArticleViewer）：**
- 在 `.article-content` 区域中央显示 loading
- 中央显示大号旋转动画（w-12 h-12）
- 文案："正在生成中文文章..."
- 开始接收流式内容后自动隐藏 loading

### UI 设计
```html
<div class="loading-container flex flex-col items-center justify-center py-20">
  <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
  <p class="mt-4 text-gray-600">正在生成中文文章...</p>
</div>
```

---

## 3. 章节内容初始换行问题

### 问题
`class=chapter-content` 的元素下面刚开始有两个 `<br>` 标签，导致一上来就连续换行。

### 原因
`markdownToHtml` 函数将开头的 `\n` 转换为 `<br>`。

### 方案
在 `article-viewer.ts` 的 `markdownToHtml` 方法中，对输入文本使用 `.trimStart()` 去除开头空白字符。

### 关键代码
```typescript
private markdownToHtml(text: string): string {
  return text
    .trimStart() // 去除开头换行
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
```

---

## 4. 5W1H 交互优化

### 问题
- 点击后内容出现在章节内容最下方，如果章节内容太多第一时间看不见
- 点击后没有立即请求数据，而是展开面板时才请求

### 方案
右侧抽屉（Drawer）交互，点击按钮立即请求数据。

### 实现细节

#### 4.1 交互流程变更
- **原流程：** 点击按钮 → 展开折叠面板 → 显示"5W1H 总结" → 再点击展开才请求数据
- **新流程：** 点击按钮 → 立即请求数据 → 右侧滑出抽屉 → 显示 loading → 加载完成显示内容

#### 4.2 抽屉设计
- 宽度：400px（桌面端），移动端全屏
- 位置：固定定位，右侧滑出
- 背景：白色，带左侧阴影
- 遮罩：半透明黑色背景，点击可关闭

#### 4.3 内容布局
```
┌─────────────────────────────────────┐
│  5W1H 分析                    [X]   │  ← 头部：标题 + 关闭按钮
├─────────────────────────────────────┤
│                                     │
│  Who    主体                        │  ← 内容区
│  What   事件                        │     6个字段垂直排列
│  When   时间                        │
│  Where  地点                        │
│  Why    原因                        │
│  How    方式                        │
│                                     │
└─────────────────────────────────────┘
```

#### 4.4 缓存策略
- 加载成功后缓存结果到 `cachedSummary`
- 重复打开抽屉直接显示缓存内容，不重复请求

#### 4.5 API 调用时机
- 在 `FiveWOneHPanel` 构造函数中立即调用 `loadSummary()`
- 移除原来的 toggle 展开才加载的逻辑

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `worker/src/lib/translate.ts` | 新增 | 标题翻译函数 |
| `worker/src/routes.ts` | 修改 | 集成标题翻译 |
| `frontend/src/components/input-form.ts` | 修改 | 优化 loading 状态 |
| `frontend/src/components/article-viewer.ts` | 修改 | 内容区 loading + markdown trim |
| `frontend/src/components/five-w-one-h.ts` | 修改 | 改为抽屉交互 + 立即加载 |
| `frontend/src/styles.css` | 修改 | 添加抽屉样式（如需要） |

---

## 验收标准

1. **标题翻译：** 输入英文视频，返回中文标题
2. **Loading：** 生成阶段内容区中央有明显 loading 动画
3. **换行问题：** 章节内容开头没有多余的空行
4. **5W1H：** 点击按钮右侧滑出抽屉，立即显示 loading，加载完成后显示内容
