import { streamText, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import type { GenerationRequirements } from '../../types';
import { buildArticlePrompt, buildFiveWOneHPrompt } from './prompts';

export interface StreamArticleOptions {
  subtitles: string;
  requirements?: GenerationRequirements;
  apiKey: string;
}

export interface ArticleStreamResult {
  textStream: ReadableStream<string>;
}

/**
 * 流式生成文章
 */
export async function streamArticle(
  options: StreamArticleOptions
): Promise<ArticleStreamResult> {
  const { subtitles, requirements, apiKey } = options;
  const prompt = buildArticlePrompt(subtitles, requirements);

  const result = streamText({
    model: google('gemini-2.5-flash', { apiKey }),
    prompt,
    temperature: 0.7,
    maxTokens: 8192,
  });

  return { textStream: result.textStream };
}

export interface GenerateFiveWOneHOptions {
  fullArticle: string;
  chapterTitle: string;
  chapterContent: string;
  apiKey: string;
}

export interface FiveWOneH {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how: string;
}

function parseFiveWOneH(text: string): FiveWOneH {
  try {
    const parsed = JSON.parse(text);
    return validateFiveWOneH(parsed);
  } catch {
    return extractFromText(text);
  }
}

function validateFiveWOneH(data: unknown): FiveWOneH {
  const required = ['who', 'what', 'when', 'where', 'why', 'how'];
  const result: Partial<FiveWOneH> = {};

  for (const key of required) {
    const value = (data as Record<string, unknown>)?.[key];
    result[key as keyof FiveWOneH] = typeof value === 'string' ? value : '暂无信息';
  }

  return result as FiveWOneH;
}

function extractFromText(text: string): FiveWOneH {
  const extract = (label: string): string => {
    const regex = new RegExp(`${label}[：:]\\s*(.+?)(?=\\n|$)`, 'i');
    const match = text.match(regex);
    return match?.[1]?.trim() || '暂无信息';
  };

  return {
    who: extract('Who'),
    what: extract('What'),
    when: extract('When'),
    where: extract('Where'),
    why: extract('Why'),
    how: extract('How')
  };
}

/**
 * 非流式生成 5W1H 总结
 */
export async function generateFiveWOneH(
  options: GenerateFiveWOneHOptions
): Promise<FiveWOneH> {
  const { fullArticle, chapterTitle, chapterContent, apiKey } = options;
  const prompt = buildFiveWOneHPrompt(fullArticle, chapterTitle, chapterContent);

  const result = await generateText({
    model: google('gemini-2.5-flash', { apiKey }),
    prompt,
    temperature: 0.3,
  });

  return parseFiveWOneH(result.text);
}
