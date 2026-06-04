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

async function fetchYouTubeSubtitles(
  videoId: string
): Promise<{ title: string; subtitles: string } | null> {
  try {
    // 1. 请求 YouTube 页面
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(pageUrl);
    if (!pageResponse.ok) {
      console.warn(`YouTube page fetch failed: ${pageResponse.status}`);
      return null;
    }
    const html = await pageResponse.text();

    // 2. 从 HTML 中提取 ytInitialPlayerResponse
    const playerResponseMatch = html.match(
      /var ytInitialPlayerResponse = ({[\s\S]+?});\s*<\/script>/
    );
    if (!playerResponseMatch) {
      return null;
    }

    let playerResponse: PlayerResponse;
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]) as PlayerResponse;
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
    const captionResponse = await fetch(captionUrl);
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
