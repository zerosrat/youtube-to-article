import { InputForm } from './components/input-form';
import { ArticleViewer } from './components/article-viewer';

export class App {
  private container: HTMLElement;
  private currentView: InputForm | ArticleViewer | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.showInputForm();
  }

  private showInputForm(): void {
    this.clearView();

    const formContainer = document.createElement('div');
    formContainer.className = 'min-h-screen py-12 px-4';
    this.container.appendChild(formContainer);

    this.currentView = new InputForm(formContainer, {
      onSubmit: (data) => {
        this.showArticleViewer(data);
      },
      onError: (message) => {
        alert(message);
      }
    });
  }

  private showArticleViewer(data: {
    url: string;
    title: string;
    subtitles: string;
    requirements: {
      taskType: string;
      style: string;
      audience: string;
      constraints: string;
    };
  }): void {
    this.clearView();

    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'min-h-screen py-8 px-4';
    this.container.appendChild(viewerContainer);

    this.currentView = new ArticleViewer(viewerContainer, {
      title: data.title,
      subtitles: data.subtitles,
      requirements: data.requirements,
      onBack: () => {
        this.showInputForm();
      }
    });
  }

  private clearView(): void {
    if (this.currentView && 'destroy' in this.currentView) {
      (this.currentView as ArticleViewer).destroy();
    }
    this.container.innerHTML = '';
    this.currentView = null;
  }
}
