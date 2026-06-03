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
          <div class="streaming-text text-gray-700 leading-relaxed whitespace-pre-wrap"></div>
        </div>
      </article>
    `;

    // 绑定返回按钮
    const backBtn = viewer.querySelector('.back-btn');
    backBtn?.addEventListener('click', () => {
      this.cancelStream?.();
      this.options.onBack();
    });

    return viewer;
  }

  private startGeneration(): void {
    const statusEl = this.element.querySelector('.generation-status');
    const indicatorEl = this.element.querySelector('.bg-green-500');

    this.cancelStream = streamGenerateArticle({
      subtitles: this.options.subtitles,
      requirements: this.options.requirements.taskType ? this.options.requirements : undefined,
      sessionId: `sess_${Date.now()}`,

      onChunk: (text) => {
        this.content += text;
        this.renderContent();
      },

      onChapter: (id, title) => {
        this.currentChapterId = id;
        this.createChapterSection(id, title);
      },

      onDone: (sessionId) => {
        this.sessionId = sessionId;
        if (statusEl) statusEl.textContent = '生成完成';
        indicatorEl?.classList.remove('animate-pulse');
        indicatorEl?.classList.replace('bg-green-500', 'bg-gray-300');
      },

      onError: (message) => {
        if (statusEl) statusEl.textContent = `生成失败: ${message}`;
        indicatorEl?.classList.replace('bg-green-500', 'bg-red-500');
        indicatorEl?.classList.remove('animate-pulse');
      }
    });
  }

  private renderContent(): void {
    const streamingText = this.articleContainer.querySelector('.streaming-text');
    if (!streamingText) return;

    // 解析 Markdown 章节
    const parts = this.content.split(/^(##\s+.+)$/m);
    let html = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.startsWith('## ')) {
        // 章节标题已在 onChapter 中处理
        continue;
      }

      if (i === 0) {
        // 第一部分（引言）
        html += this.markdownToHtml(part);
      } else if (part.trim()) {
        // 章节内容
        html += this.markdownToHtml(part);
      }
    }

    // 更新当前章节内容
    if (this.currentChapterId && this.chapters.has(this.currentChapterId)) {
      const chapter = this.chapters.get(this.currentChapterId)!;
      chapter.contentElement.innerHTML = this.markdownToHtml(
        this.extractChapterContent(this.content, chapter.title)
      );
    } else {
      streamingText.innerHTML = html;
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
      <div class="five-w-one-h-container"></div>
    `;

    this.articleContainer.appendChild(chapterEl);

    const contentEl = chapterEl.querySelector('.chapter-content') as HTMLElement;
    const fiveWOneHContainer = chapterEl.querySelector('.five-w-one-h-container') as HTMLElement;

    this.chapters.set(id, {
      id,
      title,
      element: chapterEl,
      contentElement: contentEl
    });

    // 绑定 5W1H 按钮
    const btn = chapterEl.querySelector('.five-w-one-h-btn');
    let panel: FiveWOneHPanel | null = null;

    btn?.addEventListener('click', () => {
      if (!panel && this.sessionId) {
        panel = new FiveWOneHPanel(fiveWOneHContainer, this.sessionId, id);
      }
    });
  }

  private extractChapterContent(fullContent: string, chapterTitle: string): string {
    const regex = new RegExp(`##\\s+${this.escapeRegExp(chapterTitle)}\\s*\\n([\\s\\S]*?)(?=##|$)`);
    const match = fullContent.match(regex);
    return match?.[1]?.trim() || '';
  }

  private markdownToHtml(text: string): string {
    return text
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

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  destroy(): void {
    this.cancelStream?.();
    this.element.remove();
  }
}
