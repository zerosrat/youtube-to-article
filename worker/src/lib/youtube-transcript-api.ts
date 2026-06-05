// worker/src/lib/youtube-transcript-api.ts

export interface TranscriptResult {
  title: string;
  subtitles: string;
}

interface TranscriptItem {
  id: string;
  title: string;
  transcripts: Array<{
    language: string;
    text: string;
  }>;
}

interface TranscriptResponse {
  pageInfo: {
    totalResults: number;
  };
  items: TranscriptItem[];
}

const LANGUAGE_PRIORITY = ['en', 'zh', 'zh-CN', 'zh-TW'];
const MIN_INTERVAL_MS = 2100; // 5 requests per 10 seconds = 2s per request

let lastRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function selectTranscript(transcripts: TranscriptItem['transcripts']): string {
  for (const lang of LANGUAGE_PRIORITY) {
    const match = transcripts.find(t => t.language === lang);
    if (match) return match.text;
  }
  return transcripts[0]?.text || '';
}

export interface FetchTranscriptOptions {
  videoId: string;
  apiToken: string;
}

export async function fetchTranscriptViaAPI(
  options: FetchTranscriptOptions
): Promise<TranscriptResult | null> {
  const { videoId, apiToken } = options;

  console.log(`[TranscriptAPI] Starting fetch for video: ${videoId}`);

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - elapsed;
    console.log(`[TranscriptAPI] Rate limiting: waiting ${waitTime}ms`);
    await sleep(waitTime);
  }
  lastRequestTime = Date.now();

  try {
    // Build Auth header (API expects raw token, not base64)
    const authHeader = 'Basic ' + apiToken;
    console.log(`[TranscriptAPI] Sending request to API`);

    const response = await fetch('https://www.youtube-transcript.io/api/transcripts', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: [videoId] })
    });

    console.log(`[TranscriptAPI] Response status: ${response.status}`);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '10';
      console.warn(`[TranscriptAPI] Rate limited, retry after: ${retryAfter}s`);
      return null;
    }

    if (response.status === 401) {
      console.warn('[TranscriptAPI] Unauthorized - invalid token');
      return null;
    }

    if (!response.ok) {
      console.warn(`[TranscriptAPI] API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as TranscriptResponse;
    console.log(`[TranscriptAPI] Got response with ${data.items?.length || 0} items`);

    if (!data.items || data.items.length === 0) {
      console.warn('[TranscriptAPI] No items in response');
      return null;
    }

    const item = data.items[0];

    if (!item.transcripts || item.transcripts.length === 0) {
      console.warn('[TranscriptAPI] No transcripts available for this video');
      return null;
    }

    console.log(`[TranscriptAPI] Available languages: ${item.transcripts.map(t => t.language).join(', ')}`);

    const subtitles = selectTranscript(item.transcripts);
    console.log(`[TranscriptAPI] Selected subtitle length: ${subtitles.length}`);

    return {
      title: item.title,
      subtitles
    };

  } catch (error) {
    console.error('[TranscriptAPI] Fetch failed:', error);
    return null;
  }
}
