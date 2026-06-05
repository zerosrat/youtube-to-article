// worker/src/lib/youtube-transcript-api.ts

export interface TranscriptResult {
  title: string;
  subtitles: string;
}

// API returns an array directly, not an object with items
interface APITranscriptItem {
  id: string;
  title: string;
  text: string;
  // API may return other fields like microformat, etc.
}

const MIN_INTERVAL_MS = 2100; // 5 requests per 10 seconds = 2s per request

let lastRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    // API returns an array directly, not {items: [...]}
    const data = await response.json() as APITranscriptItem[];
    console.log(`[TranscriptAPI] Got response with ${data?.length || 0} items`);

    if (!data || data.length === 0) {
      console.warn('[TranscriptAPI] No items in response');
      return null;
    }

    const item = data[0];

    if (!item.text) {
      console.warn('[TranscriptAPI] No transcript text available for this video');
      return null;
    }

    console.log(`[TranscriptAPI] Transcript length: ${item.text.length}`);

    return {
      title: item.title || 'Unknown Title',
      subtitles: item.text
    };

  } catch (error) {
    console.error('[TranscriptAPI] Fetch failed:', error);
    return null;
  }
}
