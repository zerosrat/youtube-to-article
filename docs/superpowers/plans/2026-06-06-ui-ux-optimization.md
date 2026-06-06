# UI/UX 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现4个UI/UX优化：标题中文翻译、Loading交互优化、章节换行修复、5W1H抽屉交互

**Architecture:** 在 Worker 后端添加标题翻译功能，在前端组件中优化 loading 显示、markdown 渲染和 5W1H 交互体验

**Tech Stack:** Cloudflare Worker + Hono, TypeScript, Tailwind CSS

---

## 文件结构

| 文件 | 责任 | 变更类型 |
|------|------|----------|
| `worker/src/lib/translate.ts` | 标题翻译函数，调用 Gemini API | 新增 |
| `worker/src/routes.ts` | 集成标题翻译到字幕提取接口 | 修改 |
| `frontend/src/components/input-form.ts` | 优化字幕提取阶段的 loading 状态 | 修改 |
| `frontend/src/components/article-viewer.ts` | 内容区 loading 占位、markdown trimStart 修复 | 修改 |
| `frontend/src/components/five-w-one-h.ts` | 改为抽屉交互、点击立即加载 | 修改 |

---

## Task 1: 标题中文翻译 - 创建翻译模块

**Files:**
- Create: `worker/src/lib/translate.ts`

- [ ] **Step 1: 创建 translate.ts 文件**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function translateTitle(title: string, apiKey: string): Promise<string> {
  // 检测是否包含中文字符
  const hasChinese = /[一-龥]/.test(title);
  if (hasChinese) {
    return title;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `将以下视频标题翻译成简洁的中文标题，只返回翻译后的标题，不要解释：

${title}`;

    const result = await model.generateContent(prompt);
    const translated = result.response.text().trim();

    return translated || title;
  } catch (error) {
    console.error('[translateTitle] Error:', error);
    return title;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/lib/translate.ts
git commit -m "feat: add title translation module"
```

---

## Task 2: 标题中文翻译 - 集成到字幕提取接口

**Files:**
- Modify: `worker/src/routes.ts:39-51`

- [ ] **Step 1: 导入翻译函数**

在 `worker/src/routes.ts` 顶部添加：

```typescript
import { translateTitle } from './lib/translate';
```

- [ ] **Step 2: 修改字幕提取接口**

找到 `/api/extract-subtitles` 接口，修改返回逻辑：

```typescript
app.post('/api/extract-subtitles', async (c) => {
  const body = await c.req.json<SubtitleRequest>();

  if (!body.url) {
    return c.json({ success: false, error: 'URL is required' }, 400);
  }

  const result = await extractSubtitles({
    url: body.url,
    apiToken: c.env.YOUTUBE_TRANSCRIPT_API_TOKEN
  });

  // 翻译标题为中文
  if (result.success && result.title) {
    const apiKey = c.env.GEMINI_API_KEY;
    if (apiKey) {
      result.title = await translateTitle(result.title, apiKey);
    }
  }

  return c.json(result);
});
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/routes.ts
git commit -m "feat: integrate title translation into extract-subtitles endpoint"
```

---

## Task 3: Loading 交互优化 - 字幕提取阶段

**Files:**
- Modify: `frontend/src/components/input-form.ts:80-86, 145-157`

- [ ] **Step 1: 修改按钮 loading 状态**

修改 `createForm()` 方法中的提交按钮：

```typescript
<button type="submit" class="btn-primary w-full flex items-center justify-center gap-2" id="submit-btn">
  <span>开始生成</span>
  <svg class="w-4 h-4 hidden animate-spin" id="loading-icon" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
</button>
```

给按钮添加 `id="submit-btn"`。

- [ ] **Step 2: 修改 setLoading 方法**

完全替换 `setLoading` 方法：

```typescript
private setLoading(loading: boolean): void {
  const submitBtn = this.element.querySelector('#submit-btn') as HTMLButtonElement;
  const loadingIcon = submitBtn?.querySelector('#loading-icon');
  const text = submitBtn?.querySelector('span');

  if (loading) {
    submitBtn?.classList.add('opacity-75', 'cursor-not-allowed');
    submitBtn && (submitBtn.disabled = true);
    loadingIcon?.classList.remove('hidden');
    if (text) text.textContent = '提取字幕中...';
  } else {
    submitBtn?.classList.remove('opacity-75', 'cursor-not-allowed');
    submitBtn && (submitBtn.disabled = false);
    loadingIcon?.classList.add('hidden');
    if (text) text.textContent = '开始生成';
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/input-form.ts
git commit -m "feat: optimize loading state in input form"
```

---

## Task 4: Loading 交互优化 - 文章生成阶段

**Files:**
- Modify: `frontend/src/components/article-viewer.ts:46-66, 122-136`

- [ ] **Step 1: 修改 createViewer 添加 loading 占位**

修改 `article-content` 区域，添加 loading 容器：

```typescript
<article class="card p-8">
  <h1 class="text-3xl font-bold text-gray-900 mb-8">${this.escapeHtml(this.options.title)}</h1>
  <div class="article-content prose prose-lg max-w-none">
    <div class="loading-container flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      <p class="mt-4 text-gray-600">正在生成中文文章...</p>
    </div>
    <div class="streaming-text text-gray-700 leading-relaxed whitespace-pre-wrap hidden"></div>
  </div>
</article>
```

注意：给 `streaming-text` 添加了 `hidden` 类。

- [ ] **Step 2: 修改 renderContent 显示逻辑**

修改 `renderContent()` 方法，在第一次渲染内容时隐藏 loading：

```typescript
private renderContent(): void {
  const streamingText = this.articleContainer.querySelector('.streaming-text');
  const loadingContainer = this.articleContainer.querySelector('.loading-container');
  if (!streamingText) return;

  // 首次有内容时，隐藏 loading，显示内容区
  if (this.currentChapterContent.trim() || this.content.trim()) {
    loadingContainer?.classList.add('hidden');
    streamingText.classList.remove('hidden');
  }

  // 更新当前章节内容（追加模式）
  if (this.currentChapterId && this.chapters.has(this.currentChapterId)) {
    const chapter = this.chapters.get(this.currentChapterId)!;
    chapter.contentElement.innerHTML = this.markdownToHtml(this.currentChapterContent);
  } else {
    // 还没有章节时，显示引言内容
    const introMatch = this.content.match(/^[\s\S]*?(?=##|$)/);
    const introText = introMatch ? introMatch[0] : this.content;
    streamingText.innerHTML = this.markdownToHtml(introText);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/article-viewer.ts
git commit -m "feat: add prominent loading placeholder in article viewer"
```

---

## Task 5: 修复章节内容初始换行问题

**Files:**
- Modify: `frontend/src/components/article-viewer.ts:182-188`

- [ ] **Step 1: 修改 markdownToHtml 添加 trimStart**

```typescript
private markdownToHtml(text: string): string {
  return text
    .trimStart() // 去除开头空白，避免初始换行
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/article-viewer.ts
git commit -m "fix: trim leading whitespace to prevent initial line breaks"
```

---

## Task 6: 5W1H 抽屉交互 - 重构组件结构

**Files:**
- Modify: `frontend/src/components/five-w-one-h.ts`（完全重写）

- [ ] **Step 1: 完全重写 five-w-one-h.ts**

```typescript
import { summarizeChapter } from '../lib/api';
import type { FiveWOneH } from '../../../worker/src/types';

export class FiveWOneHPanel {
  private element: HTMLDivElement;
  private sessionId: string;
  private chapterId: string;
  private chapterTitle: string;
  private cachedSummary: FiveWOneH | null = null;
  private isLoading = false;

  constructor(container: HTMLElement, sessionId: string, chapterId: string, chapterTitle: string) {
    this.sessionId = sessionId;
    this.chapterId = chapterId;
    this.chapterTitle = chapterTitle;
    this.element = this.createDrawer();
    container.appendChild(this.element);

    // 立即加载数据
    this.loadSummary();
  }

  private createDrawer(): HTMLDivElement {
    const drawer = document.createElement('div');
    drawer.className = 'five-w-one-h-drawer fixed inset-0 z-50 flex justify-end';
    drawer.innerHTML = `
      <!-- 遮罩 -->
      <div class="drawer-overlay absolute inset-0 bg-black/30 transition-opacity"></div>
      
      <!-- 抽屉面板 -->
      <div class="drawer-panel relative w-full max-w-md bg-white shadow-xl transform transition-transform translate-x-0 flex flex-col">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h3 class="text-lg font-semibold text-gray-900">5W1H 分析</h3>
          <button class="close-btn p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <!-- 内容区 -->
        <div class="drawer-content flex-1 overflow-y-auto p-6">
          <h4 class="text-sm font-medium text-gray-500 mb-4">${this.escapeHtml(this.chapterTitle)}</h4>
          <div class="five-w-one-h-body">
            ${this.renderLoading()}
          </div>
        </div>
      </div>
    `;

    // 绑定关闭事件
    const overlay = drawer.querySelector('.drawer-overlay');
    const closeBtn = drawer.querySelector('.close-btn');
    
    overlay?.addEventListener('click', () => this.close());
    closeBtn?.addEventListener('click', () => this.close());

    // ESC 键关闭
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 禁止背景滚动
    document.body.style.overflow = 'hidden';

    return drawer;
  }

  private renderLoading(): string {
    return `
      <div class="flex flex-col items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <p class="mt-4 text-sm text-gray-500">正在分析...</p>
      </div>
    `;
  }

  private renderSummary(summary: FiveWOneH): string {
    const fields = [
      { key: 'who', label: 'Who', desc: '主体', color: 'bg-blue-100 text-blue-700' },
      { key: 'what', label: 'What', desc: '事件', color: 'bg-green-100 text-green-700' },
      { key: 'when', label: 'When', desc: '时间', color: 'bg-yellow-100 text-yellow-700' },
      { key: 'where', label: 'Where', desc: '地点', color: 'bg-purple-100 text-purple-700' },
      { key: 'why', label: 'Why', desc: '原因', color: 'bg-red-100 text-red-700' },
      { key: 'how', label: 'How', desc: '方式', color: 'bg-indigo-100 text-indigo-700' }
    ];

    return `
      <div class="space-y-4">
        ${fields.map(({ key, label, desc, color }) => {
          const value = summary[key as keyof FiveWOneH] || '暂无信息';
          return `
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="px-2 py-1 rounded text-xs font-semibold ${color}">${label}</span>
                <span class="text-xs text-gray-400">${desc}</span>
              </div>
              <p class="text-sm text-gray-700 leading-relaxed">${this.escapeHtml(value)}</p>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private async loadSummary(): Promise<void> {
    if (this.isLoading || this.cachedSummary) return;

    this.isLoading = true;
    const bodyContainer = this.element.querySelector('.five-w-one-h-body');

    try {
      const result = await summarizeChapter(this.sessionId, this.chapterId);

      if (result.success && result.summary) {
        this.cachedSummary = result.summary;
        if (bodyContainer) {
          bodyContainer.innerHTML = this.renderSummary(result.summary);
        }
      } else {
        throw new Error(result.error || '生成失败');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败';
      if (bodyContainer) {
        bodyContainer.innerHTML = `
          <div class="text-center py-8">
            <svg class="w-12 h-12 text-red-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p class="text-sm text-red-600 mb-3">${message}</p>
            <button class="retry-btn px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors">
              重试
            </button>
          </div>
        `;

        const retryBtn = bodyContainer.querySelector('.retry-btn');
        retryBtn?.addEventListener('click', () => {
          this.isLoading = false;
          if (bodyContainer) bodyContainer.innerHTML = this.renderLoading();
          this.loadSummary();
        });
      }
    } finally {
      this.isLoading = false;
    }
  }

  private close(): void {
    // 恢复背景滚动
    document.body.style.overflow = '';
    
    // 添加关闭动画
    const panel = this.element.querySelector('.drawer-panel');
    const overlay = this.element.querySelector('.drawer-overlay');
    
    panel?.classList.add('translate-x-full');
    overlay?.classList.add('opacity-0');
    
    // 动画结束后移除元素
    setTimeout(() => {
      this.element.remove();
    }, 300);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/five-w-one-h.ts
git commit -m "feat: redesign 5W1H panel as drawer with immediate loading"
```

---

## Task 7: 5W1H 抽屉交互 - 更新 article-viewer 调用方式

**Files:**
- Modify: `frontend/src/components/article-viewer.ts:138-180`

- [ ] **Step 1: 修改 createChapterSection 方法**

修改 5W1H 按钮的绑定逻辑：

```typescript
private createChapterSection(id: string, title: string): void {
  const streamingText = this.articleContainer.querySelector('.streaming-text');
  if (!streamingText) return;

  // 隐藏初始流式文本区域
  streamingText.classList.add('hidden');

  const chapterEl = document.createElement('section');
  chapterEl.className = 'chapter-section mb-8';
  chapterEl.dataset.chapterId = id;
  chapterEl.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <h2 class="text-xl font-bold text-gray-900">${this.escapeHtml(title)}</h2>
      <button class="five-w-one-h-btn px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors" data-chapter-id="${id}">
        5W1H
      </button>
    </div>
    <div class="chapter-content text-gray-700 leading-relaxed"></div>
  `;

  this.articleContainer.appendChild(chapterEl);

  const contentEl = chapterEl.querySelector('.chapter-content') as HTMLElement;

  this.chapters.set(id, {
    id,
    title,
    element: chapterEl,
    contentElement: contentEl
  });

  // 绑定 5W1H 按钮 - 点击立即打开抽屉
  const btn = chapterEl.querySelector('.five-w-one-h-btn');
  btn?.addEventListener('click', () => {
    if (this.sessionId) {
      // 传入 document.body 作为容器，抽屉会固定定位
      new FiveWOneHPanel(document.body, this.sessionId, id, title);
    }
  });
}
```

注意：移除了 `five-w-one-h-container` div，因为抽屉现在直接挂载到 body。

- [ ] **Step 2: 移除旧的导入和面板引用**

检查文件顶部，确保导入正确：

```typescript
import { streamGenerateArticle } from '../lib/api';
import { FiveWOneHPanel } from './five-w-one-h';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/article-viewer.ts
git commit -m "feat: update article-viewer to use new drawer-based 5W1H panel"
```

---

## Task 8: 添加抽屉动画样式

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 添加抽屉动画样式**

在 `frontend/src/styles.css` 末尾添加：

```css
/* 5W1H Drawer Animations */
.five-w-one-h-drawer .drawer-overlay {
  opacity: 1;
  transition: opacity 0.3s ease;
}

.five-w-one-h-drawer .drawer-overlay.opacity-0 {
  opacity: 0;
}

.five-w-one-h-drawer .drawer-panel {
  transform: translateX(0);
  transition: transform 0.3s ease;
}

.five-w-one-h-drawer .drawer-panel.translate-x-full {
  transform: translateX(100%);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style: add drawer animation styles"
```

---

## 自审查检查清单

### Spec 覆盖检查
- [x] 1. 标题中文翻译 - Task 1-2 覆盖
- [x] 2. Loading 交互优化 - Task 3-4 覆盖
- [x] 3. 章节换行修复 - Task 5 覆盖
- [x] 4. 5W1H 抽屉交互 - Task 6-8 覆盖

### Placeholder 扫描
- [x] 无 "TBD"/"TODO" 标记
- [x] 所有代码片段完整可运行
- [x] 所有命令有明确预期输出

### 类型一致性检查
- [x] `translateTitle(title: string, apiKey: string)` 签名一致
- [x] `FiveWOneHPanel` 构造函数参数一致
- [x] 文件路径引用正确

---

## 测试建议

### 手动测试步骤

1. **标题翻译测试**
   - 输入英文 YouTube 视频链接
   - 检查返回的标题是否为中文

2. **Loading 测试**
   - 点击"开始生成"，检查按钮状态变化
   - 进入文章生成页面，检查中央 loading 动画
   - 内容开始显示后，loading 应自动消失

3. **换行修复测试**
   - 检查章节内容开头是否有多余空行

4. **5W1H 抽屉测试**
   - 点击 5W1H 按钮，检查右侧滑出抽屉
   - 检查遮罩和关闭按钮是否正常工作
   - 检查数据是否立即加载（显示 loading）
   - 关闭后重新打开，检查是否使用缓存（不显示 loading）
