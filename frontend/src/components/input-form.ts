import { extractSubtitles } from '../lib/api';

export interface InputFormData {
  url: string;
  requirements: {
    taskType: string;
    style: string;
    audience: string;
    constraints: string;
  };
}

export interface InputFormCallbacks {
  onSubmit: (data: InputFormData & { title: string; subtitles: string }) => void;
  onError: (message: string) => void;
}

export class InputForm {
  private element: HTMLFormElement;
  private callbacks: InputFormCallbacks;

  constructor(container: HTMLElement, callbacks: InputFormCallbacks) {
    this.callbacks = callbacks;
    this.element = this.createForm();
    container.appendChild(this.element);

    this.bindEvents();
  }

  private createForm(): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'max-w-2xl mx-auto space-y-6';
    form.innerHTML = `
      <div class="card p-6">
        <h1 class="text-2xl font-bold text-gray-900 mb-2">YouTube 转文章</h1>
        <p class="text-gray-600 mb-6">输入 YouTube 视频链接，AI 将生成中文对话文章</p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">YouTube 链接</label>
            <input
              type="url"
              name="url"
              placeholder="https://www.youtube.com/watch?v=..."
              class="input-field"
              required
            >
          </div>

          <div class="border-t pt-4">
            <button type="button" class="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1" id="toggle-options">
              <span>高级选项</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            <div id="options-panel" class="hidden mt-4 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">任务类型</label>
                <input type="text" name="taskType" placeholder="如：对话整理、摘要提炼..." class="input-field">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">输出风格</label>
                <input type="text" name="style" placeholder="如：正式、轻松、学术..." class="input-field">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">目标受众</label>
                <input type="text" name="audience" placeholder="如：技术人员、普通读者..." class="input-field">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">约束条件</label>
                <input type="text" name="constraints" placeholder="如：字数限制、重点强调..." class="input-field">
              </div>
            </div>
          </div>

          <button type="submit" class="btn-primary w-full flex items-center justify-center gap-2" id="submit-btn">
            <span>开始生成</span>
            <svg class="w-4 h-4 hidden animate-spin" id="loading-icon" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    return form;
  }

  private bindEvents(): void {
    // 切换高级选项
    const toggleBtn = this.element.querySelector('#toggle-options');
    const optionsPanel = this.element.querySelector('#options-panel');

    toggleBtn?.addEventListener('click', () => {
      optionsPanel?.classList.toggle('hidden');
      const svg = toggleBtn.querySelector('svg');
      svg?.classList.toggle('rotate-180');
    });

    // 表单提交
    this.element.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
  }

  private async handleSubmit(): Promise<void> {
    const formData = new FormData(this.element);
    const url = formData.get('url') as string;

    this.setLoading(true);

    try {
      const result = await extractSubtitles(url);

      if (!result.success) {
        throw new Error('Failed to extract subtitles');
      }

      this.callbacks.onSubmit({
        url,
        title: result.title,
        subtitles: result.subtitles,
        requirements: {
          taskType: (formData.get('taskType') as string) || '',
          style: (formData.get('style') as string) || '',
          audience: (formData.get('audience') as string) || '',
          constraints: (formData.get('constraints') as string) || ''
        }
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : '提取字幕失败';
      this.callbacks.onError(message);
    } finally {
      this.setLoading(false);
    }
  }

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
}
