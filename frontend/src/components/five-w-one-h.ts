import { summarizeChapter } from '../lib/api';

export class FiveWOneHPanel {
  private element: HTMLDivElement;
  private sessionId: string;
  private chapterId: string;
  private isOpen = false;
  private isLoading = false;
  private cachedSummary: Record<string, string> | null = null;

  constructor(container: HTMLElement, sessionId: string, chapterId: string) {
    this.sessionId = sessionId;
    this.chapterId = chapterId;
    this.element = this.createPanel();
    container.appendChild(this.element);

    this.bindEvents();
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'mt-4 border rounded-lg bg-gray-50 overflow-hidden';
    panel.innerHTML = `
      <button class="five-w-one-h-toggle w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
        <span>5W1H 总结</span>
        <svg class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div class="five-w-one-h-content hidden border-t">
        <div class="p-4 space-y-3">
          ${this.renderLoading()}
        </div>
      </div>
    `;

    return panel;
  }

  private renderLoading(): string {
    return `
      <div class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        <span class="ml-2 text-sm text-gray-600">生成中...</span>
      </div>
    `;
  }

  private renderSummary(summary: Record<string, string>): string {
    const fields = [
      { key: 'who', label: 'Who', desc: '主体' },
      { key: 'what', label: 'What', desc: '事件' },
      { key: 'when', label: 'When', desc: '时间' },
      { key: 'where', label: 'Where', desc: '地点' },
      { key: 'why', label: 'Why', desc: '原因' },
      { key: 'how', label: 'How', desc: '方式' }
    ];

    return fields.map(({ key, label, desc }) => `
      <div class="flex gap-3">
        <div class="w-16 flex-shrink-0">
          <div class="text-xs font-semibold text-primary-600">${label}</div>
          <div class="text-xs text-gray-400">${desc}</div>
        </div>
        <div class="flex-1 text-sm text-gray-700 leading-relaxed">${summary[key] || '暂无信息'}</div>
      </div>
    `).join('');
  }

  private bindEvents(): void {
    const toggle = this.element.querySelector('.five-w-one-h-toggle');

    toggle?.addEventListener('click', async () => {
      this.isOpen = !this.isOpen;
      this.updateVisibility();

      if (this.isOpen && !this.cachedSummary && !this.isLoading) {
        await this.loadSummary();
      }
    });
  }

  private updateVisibility(): void {
    const content = this.element.querySelector('.five-w-one-h-content');
    const arrow = this.element.querySelector('.five-w-one-h-toggle svg');

    if (this.isOpen) {
      content?.classList.remove('hidden');
      arrow?.classList.add('rotate-180');
    } else {
      content?.classList.add('hidden');
      arrow?.classList.remove('rotate-180');
    }
  }

  private async loadSummary(): Promise<void> {
    this.isLoading = true;
    const contentContainer = this.element.querySelector('.five-w-one-h-content > div');

    try {
      const result = await summarizeChapter(this.sessionId, this.chapterId);

      if (result.success) {
        this.cachedSummary = result.summary;
        if (contentContainer) {
          contentContainer.innerHTML = this.renderSummary(result.summary);
        }
      } else {
        throw new Error(result.error || 'Failed to generate summary');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      if (contentContainer) {
        contentContainer.innerHTML = `
          <div class="text-center py-4">
            <p class="text-sm text-red-600 mb-2">${message}</p>
            <button class="text-sm text-primary-600 hover:text-primary-700 retry-btn">重试</button>
          </div>
        `;

        const retryBtn = contentContainer.querySelector('.retry-btn');
        retryBtn?.addEventListener('click', () => this.loadSummary());
      }
    } finally {
      this.isLoading = false;
    }
  }
}
