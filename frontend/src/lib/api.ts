import type { SubtitleRequest, SubtitleResponse, SummarizeRequest, SummarizeResponse, GenerateRequest } from '../../../worker/src/types';

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

  const controller = new AbortController();

  fetch(`${API_BASE}/generate-article`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtitles, requirements, sessionId } satisfies GenerateRequest),
    signal: controller.signal
  }).then(async (response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      onError(errorData.error || `HTTP ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 格式解析: data: {...}\n\nevent: xxx\n\n
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // 保留不完整的部分

        for (const message of messages) {
          const lines = message.split('\n');
          let event = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              event = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.slice(5).trim();
            }
          }

          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            switch (event) {
              case 'chunk':
                onChunk(parsed.text);
                break;
              case 'chapter':
                onChapter(parsed.id, parsed.title);
                break;
              case 'done':
                onDone(parsed.sessionId);
                break;
              case 'error':
                onError(parsed.message || 'Stream error');
                break;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError((error as Error).message || 'Stream error');
      }
    }
  }).catch((error) => {
    if (error.name !== 'AbortError') {
      onError(error.message || 'Connection error');
    }
  });

  return () => controller.abort();
}

export async function summarizeChapter(sessionId: string, chapterId: string): Promise<SummarizeResponse> {
  const response = await fetch(`${API_BASE}/summarize-chapter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, chapterId } satisfies SummarizeRequest)
  });

  return response.json();
}
