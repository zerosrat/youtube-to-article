# YouTube 字幕提取实现设计

## 背景

当前项目有一个空的 `fetchYouTubeSubtitles` 函数，始终返回 null，导致所有请求都回退到 fallback 数据。需要实现真正的 YouTube 字幕提取功能。

## 目标

实现 YouTube 字幕提取功能，按以下 6 步方法：
1. 请求 `https://www.youtube.com/watch?v=VIDEO_ID`
2. 从 HTML 里提取 `ytInitialPlayerResponse`
3. 找到 `captions.playerCaptionsTracklistRenderer.captionTracks`
4. 按优先级选择语言轨道的 `baseUrl`
5. 请求 `baseUrl + &fmt=json3`
6. 把 `events[].segs[].utf8` 合并成字幕文本

## 架构

### 数据流

```
extractSubtitles(url)
  └── extractVideoId(url)
  └── fetchYouTubeSubtitles(videoId)
        └── fetch YouTube page
        └── parse ytInitialPlayerResponse
        └── select caption track (en → zh → zh-CN → zh-TW → first)
        └── fetch caption JSON
        └── merge events[].segs[].utf8
  └── fallback (if any step fails)
```

### 语言选择优先级

1. `en` (英文)
2. `zh` (中文)
3. `zh-CN` (简体中文)
4. `zh-TW` (繁体中文)
5. 第一个可用字幕轨道

### 错误处理

任何步骤失败都静默返回 `null`，触发 fallback 机制，对用户无感知。

## 实现细节

### 解析 ytInitialPlayerResponse

从 HTML 中查找 `var ytInitialPlayerResponse = ` 开头，到 `;</script>` 结尾的 JSON 字符串，用 `JSON.parse` 解析。

### 解析字幕 JSON

响应格式示例：
```json
{
  "events": [
    {
      "segs": [
        {"utf8": "Hello "},
        {"utf8": "world"}
      ]
    }
  ]
}
```

遍历 `events`，对每个 event 的 `segs` 数组，拼接所有 `utf8` 字段，最后合并成完整字幕文本。

## 接口

```typescript
async function fetchYouTubeSubtitles(
  videoId: string
): Promise<{ title: string; subtitles: string } | null>
```

## 修改范围

仅修改 `worker/src/lib/subtitles.ts`：
- 实现 `fetchYouTubeSubtitles` 函数（约 50-70 行）
- 保留现有接口和 fallback 机制

## 测试策略

- 本地开发环境用真实 YouTube URL 测试
- 验证成功提取和 fallback 场景
