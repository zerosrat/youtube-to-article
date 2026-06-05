# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube to Article - A web application that converts YouTube video subtitles into Chinese dialogue articles using Gemini AI. Built with Cloudflare Worker (backend) + Cloudflare Pages (frontend) architecture.

## Architecture

**Split Architecture:**
- **Frontend** (`frontend/`): Vite + TypeScript + Tailwind CSS, deployed to Cloudflare Pages
- **Backend** (`worker/`): Cloudflare Worker + Hono framework, provides REST API with SSE streaming

**Key Design Patterns:**
- Server-Sent Events (SSE) for real-time article generation streaming
- Cloudflare Cache API for temporary context storage (1-hour TTL)
- Hardcoded fallback subtitles when YouTube extraction fails

## Development Commands

**Install dependencies:**
```bash
pnpm install
```

**Start development (requires two terminals):**
```bash
# Terminal 1: Worker (port 8787)
pnpm dev:worker

# Terminal 2: Frontend (port 3000)
pnpm dev
```

**Build:**
```bash
pnpm build
```

**Deploy:**
```bash
# Deploy Worker (with secret)
cd worker
wrangler secret put GEMINI_API_KEY
wrangler deploy

# Deploy Pages
cd frontend
wrangler pages deploy dist
```

## Environment Configuration

**Local Development:**
Create `worker/.dev.vars` with:
```
GEMINI_API_KEY=your_api_key_here
```

This file is gitignored. Never commit API keys.

## API Endpoints

All API endpoints are in `worker/src/routes.ts`:

- `POST /api/extract-subtitles` - Extract YouTube subtitles (with fallback)
- `POST /api/generate-article` - SSE stream for article generation (body: `{subtitles, requirements?, sessionId}`)
- `POST /api/summarize-chapter` - Generate 5W1H summary for a chapter

## Key Implementation Details

**SSE Streaming (`worker/src/lib/gemini.ts`):**
- Uses async generator to stream Gemini API response
- Parses Gemini's NDJSON format and yields text chunks
- Handles chunked transfer encoding from Gemini

**Context Cache (`worker/src/lib/context-cache.ts`):**
- Uses `caches.default` (not KV) for temporary storage
- Stores full article + parsed chapters for 5W1H generation
- TTL: 1 hour

**Frontend API Client (`frontend/src/lib/api.ts`):**
- Uses fetch + ReadableStream for SSE (POST body instead of URL params)
- Returns cleanup function to abort connection

**Known Limitations:**
- YouTube subtitle extraction currently returns null (uses hardcoded fallback)
- No actual YouTube caption fetching implemented (blocked by CAPTCHA/proxy issues)

## Type Safety

- Shared types in `worker/src/types.ts`
- Frontend imports types from worker using relative path (`../../../worker/src/types`)
- Both frontend and worker use strict TypeScript

## Testing Endpoints

```bash
# Test subtitle extraction
curl -X POST http://localhost:8787/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"}'

# Test article generation (SSE)
curl -N -X POST http://localhost:8787/api/generate-article \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"subtitles": "test content", "sessionId": "test"}'
```
