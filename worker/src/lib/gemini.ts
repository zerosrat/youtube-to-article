import type { GenerationRequirements } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent';

export interface GeminiStreamOptions {
  subtitles: string;
  requirements?: GenerationRequirements;
  apiKey: string;
}

export async function* streamGenerateArticle(
  options: GeminiStreamOptions
): AsyncGenerator<string, void, unknown> {
  const { subtitles, requirements, apiKey } = options;

  const prompt = buildPrompt(subtitles, requirements);

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const chunk = parseGeminiChunk(line);
        if (chunk) yield chunk;
      }
    }

    // 处理剩余 buffer
    if (buffer) {
      const chunk = parseGeminiChunk(buffer);
      if (chunk) yield chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

function buildPrompt(subtitles: string, requirements?: GenerationRequirements): string {
  const parts = [
    '你是一位专业的内容编辑，请将以下 YouTube 视频字幕转换为高质量的中文对话文章。',
    '',
    '要求：',
    '- 使用对话体呈现，保持原视频的叙述逻辑',
    '- 按主题分章节，章节标题使用 ## 格式',
    '- 语言流畅自然，适合中文阅读',
    ''
  ];

  if (requirements) {
    parts.push('生成要求：');
    if (requirements.taskType) parts.push(`- 任务类型：${requirements.taskType}`);
    if (requirements.style) parts.push(`- 输出风格：${requirements.style}`);
    if (requirements.audience) parts.push(`- 目标受众：${requirements.audience}`);
    if (requirements.constraints) parts.push(`- 约束条件：${requirements.constraints}`);
    parts.push('');
  }

  parts.push('字幕内容：');
  parts.push(subtitles);
  parts.push('');
  parts.push('请开始生成：');

  return parts.join('\n');
}

function parseGeminiChunk(line: string): string | null {
  let trimmed = line.trim();
  if (!trimmed || trimmed === '[{') return null;

  // 处理 JSON 数组格式
  if (trimmed.startsWith(',')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith(']')) {
    trimmed = trimmed.slice(0, -1);
  }

  try {
    const data = JSON.parse(trimmed);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch {
    return null;
  }
}
