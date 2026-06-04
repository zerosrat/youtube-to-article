# YouTube 字幕提取实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `fetchYouTubeSubtitles` 函数，用 6 步方法从 YouTube 视频提取字幕

**架构：** 内联实现，直接在 `subtitles.ts` 中按步骤完成提取逻辑，失败时返回 null 触发 fallback

**Tech Stack：** TypeScript, Cloudflare Worker fetch API

---

## File Structure

| 文件 | 操作 | 说明 |
|------|------|------|
| `worker/src/lib/subtitles.ts` | 修改 | 实现 `fetchYouTubeSubtitles` 函数（当前第 50-54 行为空实现） |

---

### Task 1: 实现 fetchYouTubeSubtitles 函数

**Files:**
- Modify: `worker/src/lib/subtitles.ts:50-54`

- [ ] **Step 1: 实现完整的字幕提取函数**

```typescript
async function fetchYouTubeSubtitles(
  videoId: string
): Promise<{ title: string; subtitles: string } | null> {
  try {
    // 1. 请求 YouTube 页面
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(pageUrl);
    if (!pageResponse.ok) {
      return null;
    }
    const html = await pageResponse.text();

    // 2. 从 HTML 中提取 ytInitialPlayerResponse
    const playerResponseMatch = html.match(
      /var ytInitialPlayerResponse = ({.+?});<\/script>/
    );
    if (!playerResponseMatch) {
      return null;
    }

    let playerResponse;
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]);
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
      return null;
    }

    const captionData = await captionResponse.json();

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
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 验证 TypeScript 类型检查通过**

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article/worker && npx tsc --noEmit
```

预期输出：无错误

- [ ] **Step 3: 本地开发环境测试字幕提取**

确保 worker 和 frontend 已启动：
```bash
# Terminal 1: Worker (端口 8787)
pnpm dev:worker

# Terminal 2: Frontend (端口 3000)
pnpm dev
```

用 curl 测试：
```bash
curl -X POST http://localhost:8787/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=xRh2sVcNXQ8"}'
```

预期结果：返回 `{"success": true, "source": "youtube", "title": "...", "subtitles": "..."}`

- [ ] **Step 4: 测试 fallback 场景**

测试无效视频 ID：
```bash
curl -X POST http://localhost:8787/api/extract-subtitles \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=invalid123"}'
```

预期结果：返回 `{"success": true, "source": "fallback", "message": "...", ...}`

- [ ] **Step 5: Commit**

```bash
cd /Users/yujiayu02/Dev/Repo/github/youtube-to-article
git add worker/src/lib/subtitles.ts
git commit -m "feat: implement YouTube subtitle extraction

- Add fetchYouTubeSubtitles function using 6-step method
- Extract ytInitialPlayerResponse from HTML
- Support language priority: en → zh → zh-CN → zh-TW
- Parse caption JSON and merge segments
- Keep fallback behavior on any error"
```

---

## Self-Review Checklist

| 需求 | 对应任务 |
|------|----------|
| 请求 YouTube 页面 | Task 1, Step 1 (fetch pageUrl) |
| 提取 ytInitialPlayerResponse | Task 1, Step 1 (regex match) |
| 找到 captionTracks | Task 1, Step 1 (playerResponse.captions...) |
| 按优先级选择语言 | Task 1, Step 1 (languagePriority loop) |
| 请求 &fmt=json3 | Task 1, Step 1 (captionUrl) |
| 合并字幕文本 | Task 1, Step 1 (events[].segs[].utf8) |
| 错误时 fallback | Task 1, Step 1 (try-catch return null) |
| TypeScript 类型正确 | Task 1, Step 2 |
| 本地测试 | Task 1, Step 3-4 |

**无占位符检查：**
- [x] 无 "TBD", "TODO", "implement later"
- [x] 所有代码完整提供
- [x] 所有命令包含预期输出
- [x] 类型名称一致

---

## 验收标准

- [ ] `fetchYouTubeSubtitles` 函数完整实现 6 步提取逻辑
- [ ] TypeScript 编译无错误
- [ ] 真实 YouTube URL 能提取字幕（source: youtube）
- [ ] 提取失败时静默回退到 fallback 数据（source: fallback）
- [ ] 语言优先级正确：en → zh → zh-CN → zh-TW → first
