import { FALLBACK_VIDEO } from './fallback-data';
import { fetchTranscriptViaAPI } from './youtube-transcript-api';

export interface SubtitleResult {
  success: boolean;
  source: 'youtube' | 'fallback';
  message?: string;
  title: string;
  subtitles: string;
}

interface CaptionTrack {
  languageCode: string;
  baseUrl?: string;
}

interface PlayerResponse {
  videoDetails?: {
    title?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/watch\?.*v=([^&\s]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface ExtractSubtitlesOptions {
  url: string;
  apiToken?: string;
}

export async function extractSubtitles(options: ExtractSubtitlesOptions): Promise<SubtitleResult> {
  const { url, apiToken } = options;
  console.log('[extractSubtitles] Starting with URL:', url);

  const videoId = extractVideoId(url);
  console.log('[extractSubtitles] Extracted videoId:', videoId);

  if (!videoId) {
    console.log('[extractSubtitles] No videoId found, using fallback');
    return useFallback('无效的 YouTube 链接');
  }

  // Try API first if token is available
  if (apiToken) {
    console.log('[extractSubtitles] Trying transcript API...');
    try {
      const result = await fetchTranscriptViaAPI({ videoId, apiToken });
      console.log('[extractSubtitles] API returned:', result ? 'success' : 'null');

      if (result) {
        return {
          success: true,
          source: 'youtube',
          title: result.title,
          subtitles: result.subtitles
        };
      }
    } catch (error) {
      console.error('[extractSubtitles] API error:', error);
    }
  } else {
    console.log('[extractSubtitles] No API token, skipping API attempt');
  }

  // Fallback to direct YouTube extraction (likely to fail in Worker env)
  console.log('[extractSubtitles] Trying direct YouTube extraction...');
  try {
    const result = await fetchYouTubeSubtitles(videoId);
    console.log('[extractSubtitles] Direct extraction returned:', result ? 'success' : 'null');

    if (result) {
      return {
        success: true,
        source: 'youtube',
        title: result.title,
        subtitles: result.subtitles
      };
    }
  } catch (error) {
    console.error('[extractSubtitles] Direct extraction error:', error);
  }

  console.log('[extractSubtitles] All methods failed, using fallback');
  return useFallback('YouTube 提取失败，使用演示数据');
}

// 从 HTML 中提取 ytInitialPlayerResponse
// 使用括号平衡算法，确保提取完整的 JSON
function extractPlayerResponse(html: string): string | null {
  const startMarker = 'var ytInitialPlayerResponse = ';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let jsonStart = startIdx + startMarker.length;

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inString) {
      inString = true;
    } else if (char === '"' && inString) {
      inString = false;
    } else if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;

      if (braceCount === 0) {
        return html.substring(jsonStart, i + 1);
      }
    }
  }

  return null;
}

// 浏览器请求头，用于绕过 YouTube 检测
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

async function fetchYouTubeSubtitles(
  videoId: string
): Promise<{ title: string; subtitles: string } | null> {
  try {
    console.log(`[YouTube] Starting extraction for video: ${videoId}`);

    // 1. 请求 YouTube 页面
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube] Fetching page: ${pageUrl}`);
    const pageResponse = await fetch(pageUrl, { headers: BROWSER_HEADERS });
    console.log(`[YouTube] Page response status: ${pageResponse.status}`);
    if (!pageResponse.ok) {
      console.warn(`[YouTube] Page fetch failed: ${pageResponse.status}`);
      return null;
    }
    const html = await pageResponse.text();
    console.log(`[YouTube] Page HTML length: ${html.length}`);

    // 2. 从 HTML 中提取 ytInitialPlayerResponse
    const playerResponseJson = extractPlayerResponse(html);
    if (!playerResponseJson) {
      console.warn('[YouTube] Failed to extract ytInitialPlayerResponse from HTML');
      // 检查 HTML 内容，看是否包含验证页面或其他错误
      if (html.includes('https://www.google.com/sorry/index')) {
        console.warn('[YouTube] Hit Google verification/sorry page');
      } else if (html.includes('Sign in to confirm you')) {
        console.warn('[YouTube] Age verification required');
      } else if (html.includes('Video unavailable')) {
        console.warn('[YouTube] Video unavailable');
      }
      return null;
    }
    console.log(`[YouTube] Extracted player response length: ${playerResponseJson.length}`);

    let playerResponse: PlayerResponse;
    try {
      playerResponse = JSON.parse(playerResponseJson) as PlayerResponse;
    } catch (e) {
      console.warn('[YouTube] Failed to parse player response JSON:', e);
      return null;
    }

    // 获取视频标题
    const title = playerResponse.videoDetails?.title || 'Unknown Title';
    console.log(`[YouTube] Video title: ${title}`);

    // 3. 找到 captions.playerCaptionsTracklistRenderer.captionTracks
    const captionTracks =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    console.log(`[YouTube] Available caption tracks: ${captionTracks?.length || 0}`);
    if (captionTracks && captionTracks.length > 0) {
      console.log(`[YouTube] Languages: ${captionTracks.map(t => t.languageCode).join(', ')}`);
    }
    if (!captionTracks || captionTracks.length === 0) {
      console.warn('[YouTube] No caption tracks found');
      return null;
    }

    // 4. 按优先级选择语言轨道：en → zh → zh-CN → zh-TW → first
    const languagePriority = ['en', 'zh', 'zh-CN', 'zh-TW'];
    let selectedTrack = null;

    for (const lang of languagePriority) {
      selectedTrack = captionTracks.find(
        (track: { languageCode: string }) => track.languageCode === lang
      );
      if (selectedTrack) {
        console.log(`[YouTube] Selected language: ${lang}`);
        break;
      }
    }

    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
      console.log(`[YouTube] No priority language found, using first: ${selectedTrack.languageCode}`);
    }

    const baseUrl = selectedTrack.baseUrl;
    if (!baseUrl) {
      console.warn('[YouTube] Selected track has no baseUrl');
      return null;
    }

    // 5. 请求 baseUrl + &fmt=json3
    const captionUrl = baseUrl + '&fmt=json3';
    console.log(`[YouTube] Fetching captions from: ${captionUrl.substring(0, 100)}...`);
    const captionResponse = await fetch(captionUrl, { headers: BROWSER_HEADERS });
    console.log(`[YouTube] Caption response status: ${captionResponse.status}`);
    if (!captionResponse.ok) {
      console.warn(`[YouTube] Caption fetch failed: ${captionResponse.status}`);
      return null;
    }

    const captionData = (await captionResponse.json()) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };
    console.log(`[YouTube] Caption data events: ${captionData.events?.length || 0}`);

    // 6. 把 events[].segs[].utf8 合并成字幕文本
    let subtitles = '';
    const events = captionData.events || [];

    for (const event of events) {
      if (event.segs) {
        for (const seg of event.segs) {
          if (seg.utf8) {
            subtitles += seg.utf8;
          }
        }
      }
    }

    console.log(`[YouTube] Extracted subtitle length: ${subtitles.length}`);
    if (!subtitles.trim()) {
      console.warn('[YouTube] Empty subtitle text');
      return null;
    }

    console.log('[YouTube] Extraction successful');
    return { title, subtitles: subtitles.trim() };
  } catch (error) {
    console.error('[YouTube] Subtitle extraction failed:', error);
    return null;
  }
}

function useFallback(message: string): SubtitleResult {
  return {
    success: true,
    source: 'fallback',
    message,
    title: FALLBACK_VIDEO.title,
    subtitles: FALLBACK_VIDEO.subtitles
  };
}
