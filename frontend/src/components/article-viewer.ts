import { streamGenerateArticle } from '../lib/api';
import { FiveWOneHPanel } from './five-w-one-h';

export interface ArticleViewerOptions {
  title: string;
  subtitles: string;
  requirements: {
    taskType: string;
    style: string;
    audience: string;
    constraints: string;
  };
  onBack: () => void;
}

interface Chapter {
  id: string;
  title: string;
  element: HTMLElement;
  contentElement: HTMLElement;
}

export class ArticleViewer {
  private element: HTMLDivElement;
  private options: ArticleViewerOptions;
  private content = '';
  private chapters: Map<string, Chapter> = new Map();
  private sessionId: string = '';
  private cancelStream: (() => void) | null = null;
  private currentChapterId: string | null = null;
  private articleContainer: HTMLDivElement;
  private currentChapterContent = '';
  private isDestroyed = false;

  constructor(container: HTMLElement, options: ArticleViewerOptions) {
    this.options = options;
    this.element = this.createViewer();
    container.appendChild(this.element);

    this.articleContainer = this.element.querySelector('.article-content') as HTMLDivElement;
    this.startGeneration();
  }

  private createViewer(): HTMLDivElement {
    const viewer = document.createElement('div');
    viewer.className = 'max-w-3xl mx-auto';
    viewer.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <button class="back-btn flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          <span>返回</span>
        </button>
        <div class="flex items-center gap-2">
          <span class="generation-status text-sm text-gray-500">生成中...</span>
          <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        </div>
      </div>

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
    `;

    // 绑定返回按钮
    const backBtn = viewer.querySelector('.back-btn');
    backBtn?.addEventListener('click', () => {
      this.destroy();
      this.options.onBack();
    });

    return viewer;
  }

  private startGeneration(): void {
    const statusEl = this.element.querySelector('.generation-status');
    const indicatorEl = this.element.querySelector('.bg-green-500');

    // 显式重置状态为"生成中"
    if (statusEl) statusEl.textContent = '生成中...';
    if (indicatorEl) {
      indicatorEl.classList.add('animate-pulse', 'bg-green-500');
      indicatorEl.classList.remove('bg-gray-300', 'bg-red-500');
    }

    this.cancelStream = streamGenerateArticle({
      subtitles: this.options.subtitles,
      requirements: this.options.requirements.taskType ? this.options.requirements : undefined,
      sessionId: `sess_${Date.now()}`,

      onChunk: (text) => {
        // 检测章节标题，从内容中移除（因为已在 onChapter 中单独处理）
        const chapterMatch = text.match(/^##\s+(.+)$/m);
        if (chapterMatch) {
          // 只保留标题后的内容
          const afterTitle = text.split(/^##\s+.+$/m)[1] || '';
          this.currentChapterContent += afterTitle;
        } else {
          this.currentChapterContent += text;
        }
        this.content += text;
        this.renderContent();
      },

      onChapter: (id, title) => {
        this.currentChapterId = id;
        this.currentChapterContent = '';
        this.createChapterSection(id, title);
      },

      onDone: (sessionId) => {
        if (this.isDestroyed) return;
        this.sessionId = sessionId;
        if (statusEl) statusEl.textContent = '生成完成';
        indicatorEl?.classList.remove('animate-pulse');
        indicatorEl?.classList.replace('bg-green-500', 'bg-gray-300');
      },

      onError: (message) => {
        if (this.isDestroyed) return;
        if (statusEl) statusEl.textContent = `生成失败: ${message}`;
        indicatorEl?.classList.replace('bg-green-500', 'bg-red-500');
        indicatorEl?.classList.remove('animate-pulse');
      }
    });
  }

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

  private markdownToHtml(text: string): string {
    return text
      .trimStart() // 去除开头空白，避免初始换行
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.cancelStream?.();
    this.cancelStream = null;
    this.element.remove();
  }
}
