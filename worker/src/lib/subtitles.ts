import { FALLBACK_VIDEO } from './fallback-data';

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

export async function extractSubtitles(url: string): Promise<SubtitleResult> {
  const videoId = extractVideoId(url);

  if (!videoId) {
    return useFallback('无效的 YouTube 链接');
  }

  try {
    // 尝试获取 YouTube 字幕
    const result = await fetchYouTubeSubtitles(videoId);
    if (result) {
      return {
        success: true,
        source: 'youtube',
        title: result.title,
        subtitles: result.subtitles
      };
    }
  } catch (error) {
    console.error('YouTube extraction failed:', error);
  }

  // Fallback 到硬编码数据
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
    // 1. 请求 YouTube 页面
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(pageUrl, { headers: BROWSER_HEADERS });
    if (!pageResponse.ok) {
      console.warn(`YouTube page fetch failed: ${pageResponse.status}`);
      return null;
    }
    const html = await pageResponse.text();

    // 2. 从 HTML 中提取 ytInitialPlayerResponse
    const playerResponseJson = extractPlayerResponse(html);
    if (!playerResponseJson) {
      return null;
    }

    let playerResponse: PlayerResponse;
    try {
      playerResponse = JSON.parse(playerResponseJson) as PlayerResponse;
    } catch {
      return null;
    }

    // 获取视频标题
    const title =
      playerResponse.videoDetails?.title ||
      'Unknown Title';

    // 3. 找到 captions.playerCaptionsTracklistRenderer.captionTracks
    const captionTracks =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      return null;
    }

    // 4. 按优先级选择语言轨道：en → zh → zh-CN → zh-TW → first
    const languagePriority = ['en', 'zh', 'zh-CN', 'zh-TW'];
    let selectedTrack = null;

    for (const lang of languagePriority) {
      selectedTrack = captionTracks.find(
        (track: { languageCode: string }) => track.languageCode === lang
      );
      if (selectedTrack) break;
    }

    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }

    const baseUrl = selectedTrack.baseUrl;
    if (!baseUrl) {
      return null;
    }

    // 5. 请求 baseUrl + &fmt=json3
    const captionUrl = baseUrl + '&fmt=json3';
    const captionResponse = await fetch(captionUrl, { headers: BROWSER_HEADERS });
    if (!captionResponse.ok) {
      console.warn(`Caption fetch failed: ${captionResponse.status}`);
      return null;
    }

    const captionData = (await captionResponse.json()) as {
      events?: Array<{ segs?: Array<{ utf8?: string }> }>;
    };

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

    if (!subtitles.trim()) {
      return null;
    }

    return { title, subtitles: subtitles.trim() };
  } catch (error) {
    console.error('YouTube subtitle extraction failed:', error);
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
