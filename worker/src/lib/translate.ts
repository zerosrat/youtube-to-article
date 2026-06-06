import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_MODEL } from './llm/model';

export async function translateTitle(title: string, apiKey: string): Promise<string> {
  // 检测是否包含中文字符
  const hasChinese = /[一-龥]/.test(title);
  if (hasChinese) {
    return title;
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey });

    const prompt = `将以下视频标题翻译成简洁的中文标题，只返回翻译后的标题，不要解释：

${title}`;

    const result = await generateText({
      model: google(GEMINI_MODEL),
      prompt,
      temperature: 0.3,
    });

    return result.text.trim() || title;
  } catch (error) {
    console.error('[translateTitle] Error:', error);
    return title;
  }
}
