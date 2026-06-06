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
