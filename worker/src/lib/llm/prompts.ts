import type { GenerationRequirements } from '../../types';

export function buildArticlePrompt(
  subtitles: string,
  requirements?: GenerationRequirements
): string {
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

export function buildFiveWOneHPrompt(
  fullArticle: string,
  chapterTitle: string,
  chapterContent: string
): string {
  return `基于以下视频文章内容，请为指定章节生成 5W1H 总结。

完整文章：
${fullArticle}

目标章节：${chapterTitle}

章节内容：
${chapterContent}

请以 JSON 格式返回，包含 who, what, when, where, why, how 六个字段：
{
  "who": "...",
  "what": "...",
  "when": "...",
  "where": "...",
  "why": "...",
  "how": "..."
}`;
}
