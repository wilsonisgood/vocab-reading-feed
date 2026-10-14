# METHOD — 合約與規則

<!-- 只放可移植的規則。實測數字進 LEDGER。改 §1 的 md 格式屬於必停點 2：已經載入的筆記會讀不懂。 -->

## 1. 載入後的 md 格式（合約）

```markdown
---
rf-source: ted
rf-id: paul_bloom_ai_and_the_end_of_loneliness
rf-audio: https://hls.ted.com/project_masters/12009/index-f5-a1.m3u8
rf-schema: 1
title: AI and the end of loneliness
speaker: Paul Bloom
published: 2026-09-30
duration: 734
topics: [AI, technology, relationships]
url: https://www.ted.com/talks/paul_bloom_ai_and_the_end_of_loneliness
cover: https://pi.tedcdn.com/r/talkstar-assets.s3.amazonaws.com/production/talks/talk_…/…-embed.jpg
thumbnail: https://pi.tedcdn.com/r/talkstar-assets.s3.amazonaws.com/production/talks/talk_…/…-embed.jpg?w=320
license: "CC BY-NC-ND 4.0 — TED Conferences, LLC"
tags: [reading-feed, ted]
---

I have a couple of questions for you -- but they're personal. So I'm not going to ask for a show of hands. %%rf:0.70%%

My favorite description of loneliness comes from Zoë Heller's book "Notes on a Scandal." … %%rf:16.21%%

---
Source: [TED](<url>) · CC BY-NC-ND 4.0
```

- **時間戳**：每段**結尾**加 `%%rf:<秒，兩位小數>%%`。Obsidian 的註解在閱讀模式看不到；
  插件在 post-processor 裡用 `ctx.getSectionInfo(el)` 讀原始行，抓出這個註解。
  ⛔ 不用 block ID（`^xxx`）：Vocab Tracker 的段落討論用 block ID 當錨點，兩邊會打架。
- 解析用的 regex：`/%%rf:(\d+(?:\.\d+)?)%%\s*$/`。沒有時間戳的段落 = 不能點播，但不影響其他段。
- 使用者改了文字也沒關係，只要註解還在，該段就能播。
- 重複載入：用 frontmatter `rf-source` + `rf-id` 判斷，已存在就跳過（列表上標示「已載入」）。
- `cover`／`thumbnail`：圖片**網址**（不下載圖檔），給筆記列表（例：Bases 卡片檢視的圖片屬性）用；
  TED 沒有圖時整行省略。2026-10-14 使用者要求加入。
- 檔名：預設 `<資料夾>/TED/<published> <title>.md`；title 裡 `\/:*?"<>|#^[]` 換成空白。

## 2. TED：怎麼抓

### 2.1 列表（GraphQL，用 Obsidian 的 `requestUrl`，不受 CORS 限制）
```
POST https://www.ted.com/graphql   content-type: application/json
{ videos(first: 30, after: <cursor>, language: "en") {
    totalCount pageInfo { endCursor hasNextPage }
    nodes { slug title presenterDisplayName publishedAt duration topics { nodes { name } }
            primaryImageSet { url aspectRatioName } } } }
```
- 圖片：`primaryImageSet[]` 有 `16x9`（`…-embed.jpg`）、`4x3`（stageshot）、`2x1` 幾種。
  `cover` = `aspectRatioName == "16x9"` 的 `url`（沒有就取第一張；空陣列 → null）；
  `thumbnail` = cover 網址加 `?w=320`（`pi.tedcdn.com/r/` 是縮圖服務：290 KB → 9 KB，回 `access-control-allow-origin: *`）。
- 依新到舊排序。分類篩選、關鍵字搜尋能不能交給 GraphQL（filter／search 參數）由 V1-1 實測；
  不能就在插件端對已載入的頁面篩選。
- 請求間隔 ≥ 300 ms；結果在記憶體快取，面板開著時不重抓。

### 2.2 單篇（talk 頁的 `__NEXT_DATA__`）
- `GET https://www.ted.com/talks/<slug>` → 取 `<script id="__NEXT_DATA__">` 的 JSON。
- 段落：`props.pageProps.transcriptData.translation.paragraphs[]`；一個 paragraph = 一段，
  文字 = 各 cue 的 `text` 以空白串接（cue 內的換行也換成空白、連續空白壓成一個）。
- 段落開始時間 = 第一個 cue 的 `time`（毫秒 → 秒），再依 §2.4 處理片頭偏移。
- 中繼資料：`props.pageProps.videoData` 的 `title`、`presenterDisplayName`、`publishedAt`、`duration`、`topics.nodes[].name`。
- 沒有英文 transcript 的 talk：列表上標示，不能載入。

### 2.3 音源
- `videoData.hlsUrl`（master playlist）**去掉 `intro_master_id` 參數**（不要片頭）。
- 解析 master，取 `#EXT-X-MEDIA:TYPE=AUDIO` 裡 `NAME="low"`（單聲道，約 64 kbps）的 URI，
  轉成絕對網址寫進 `rf-audio`；沒有 low 就用 medium。
- 片段是 MPEG-TS（AAC），回應帶 `access-control-allow-origin: *`。

### 2.4 片頭偏移（⚠️ V1-1 驗證後寫回本節）
- 已知：帶 `intro_master_id` 的版本前面多一段片頭（例：12009 帶片頭 734.2 s、不帶 730.7 s）。
- 待驗：cue `time` 是以哪一版為準。如果是帶片頭版，載入時 `start` 要扣掉片頭長度
  （= 兩個 media playlist 的 EXTINF 總和差）。

## 3. 播放與同步

### 3.1 播放器
- 整個插件只有**一個** `HTMLAudioElement`，一次只播一篇。
- 能不能原生播 HLS：`audio.canPlayType("application/vnd.apple.mpegurl")` 非空（iPhone／iPad）→ 直接設 `src`；
  否則（桌面、Android）用 **hls.js**（`hls.light` 版）掛 MSE。hls.js 載入失敗時，改用以 `requestUrl`
  實作的自訂 loader 重試一次。
- 播放列：播放／暫停、目前段落 n / N、速度（0.75 / 1 / 1.25 / 1.5）、跟隨開關、停止。
  放在閱讀視圖頂端（只在 `rf-source` 筆記出現）。

### 3.2 每段 ▶
- markdown post-processor：筆記有 `rf-source` 才處理；段落有 `%%rf:t%%` 才加 ▶（class `rf-play`）。
- 點 ▶：`currentTime = t` 並播放，播完整篇（預設）；設定可改成「只播這段」（播到下一段的 t 就暫停）。
- iOS 只允許在使用者點擊的當下開始發聲 → `play()` 必須在 click handler 裡同步呼叫，不能先 await 別的事。

### 3.3 跟隨捲動
- `timeupdate` → 以二分搜尋找出 `start ≤ currentTime` 的最後一段 → 該段加 `rf-active` 高亮，捲到畫面中央。
- 使用者手動捲動（wheel／touchmove）後暫停跟隨，播放列顯示「回到朗讀位置」；按下或切到下一段時恢復。
- ⚠️ 閱讀模式會**虛擬化**長筆記，畫面外的段落沒有 DOM。要捲到還沒渲染的段落，用段落的**行號**
  （載入時就知道每段在第幾行）呼叫閱讀視圖的捲動 API（`previewMode.applyScroll(line)`）；
  DOM 出現後再加高亮。

## 4. （之後）BBC 時間戳管線

v1 不做。設計保留在 git 歷史 `ed3a6c8` 的 METHOD.md（段落切法、指紋 fp、時間戳 JSON、whisper 對齊、驗收門檻），
做 BBC 時再搬回來。
