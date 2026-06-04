export interface SubtitleRequest {
  url: string;
}

export interface SubtitleResponse {
  success: boolean;
  source: 'youtube' | 'fallback';
  message?: string;
  title: string;
  subtitles: string;
}

export interface GenerateRequest {
  subtitles: string;
  requirements?: GenerationRequirements;
  sessionId: string;
}

export interface GenerationRequirements {
  taskType?: string;
  style?: string;
  audience?: string;
  constraints?: string;
}

export interface ArticleContext {
  sessionId: string;
  fullArticle: string;
  chapters: Chapter[];
  createdAt: number;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface FiveWOneH {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how: string;
}

export interface SummarizeRequest {
  sessionId: string;
  chapterId: string;
}

export interface SummarizeResponse {
  success: boolean;
  summary?: FiveWOneH;
  error?: string;
}

export type SSEEvent =
  | { type: 'content'; text: string }
  | { type: 'chapter'; id: string; title: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string };
