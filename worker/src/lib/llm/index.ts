import { streamText, generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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

  const google = createGoogleGenerativeAI({ apiKey });

  const result = streamText({
    model: google('gemini-2.5-flash'),
    prompt,
    temperature: 0.7,
    maxOutputTokens: 65536,
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
  console.log('[DEBUG] Raw LLM response:', text);
  try {
    // Try to extract JSON from markdown code block if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;
    console.log('[DEBUG] Extracted JSON text:', jsonText);

    const parsed = JSON.parse(jsonText);
    console.log('[DEBUG] Parsed JSON:', parsed);
    return validateFiveWOneH(parsed);
  } catch (e) {
    console.log('[DEBUG] JSON parse failed, falling back to text extraction. Error:', e);
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
  console.log('[DEBUG] Extracting from text:', text);

  const extract = (label: string): string => {
    // 尝试多种格式: "Who: xxx", "Who：xxx", "who": "xxx", "Who":"xxx"
    const patterns = [
      new RegExp(`["']?${label}["']?\\s*[：:]\\s*["']?([^"'\\n]+)["']?(?=\\n|$)`, 'i'),
      new RegExp(`["']?${label.toLowerCase()}["']?\\s*[:：]\\s*["']?([^"'\\n]+)["']?(?=\\n|$)`, 'i'),
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match?.[1]?.trim()) {
        console.log(`[DEBUG] Extracted ${label}:`, match[1].trim());
        return match[1].trim();
      }
    }
    console.log(`[DEBUG] Failed to extract ${label}`);
    return '暂无信息';
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

  const google = createGoogleGenerativeAI({ apiKey });

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt,
    temperature: 0.3,
  });

  return parseFiveWOneH(result.text);
}
