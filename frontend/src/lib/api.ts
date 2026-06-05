import type { SubtitleRequest, SubtitleResponse, SummarizeRequest, SummarizeResponse } from '../../../worker/src/types';

const API_BASE = '/api';

export async function extractSubtitles(url: string): Promise<SubtitleResponse> {
  const response = await fetch(`${API_BASE}/extract-subtitles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url } satisfies SubtitleRequest)
  });

  return response.json();
}

export interface GenerateOptions {
  subtitles: string;
  requirements?: {
    taskType?: string;
    style?: string;
    audience?: string;
    constraints?: string;
  };
  sessionId: string;
  onChunk: (text: string) => void;
  onChapter: (id: string, title: string) => void;
  onDone: (sessionId: string) => void;
  onError: (message: string) => void;
}

export function streamGenerateArticle(options: GenerateOptions): () => void {
  const { subtitles, requirements, sessionId, onChunk, onChapter, onDone, onError } = options;

  const params = new URLSearchParams({
    subtitles,  // URLSearchParams 会自动编码，不需要手动 encode
    sessionId
  });

  if (requirements) {
    params.set('requirements', encodeURIComponent(JSON.stringify(requirements)));
  }

  const eventSource = new EventSource(`${API_BASE}/generate-article?${params}`);

  eventSource.addEventListener('chunk', (e) => {
    const data = JSON.parse(e.data);
    onChunk(data.text);
  });

  eventSource.addEventListener('chapter', (e) => {
    const data = JSON.parse(e.data);
    onChapter(data.id, data.title);
  });

  eventSource.addEventListener('done', (e) => {
    const data = JSON.parse(e.data);
    onDone(data.sessionId);
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    const data = JSON.parse((e as MessageEvent).data || '{}');
    onError(data.message || 'Stream error');
    eventSource.close();
  });

  eventSource.onerror = () => {
    onError('Connection error');
    eventSource.close();
  };

  // 返回取消函数
  return () => eventSource.close();
}

export async function summarizeChapter(sessionId: string, chapterId: string): Promise<SummarizeResponse> {
  const response = await fetch(`${API_BASE}/summarize-chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, chapterId } satisfies SummarizeRequest)
  });

  return response.json();
}
