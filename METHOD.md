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
rf-read: 2026-10-14          # 第一次播放任一段時由插件寫入（載入時沒有）
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
- `rf-read`：第一次播放這篇的任何一段時，插件用 `fileManager.processFrontMatter` 寫入當天日期（YYYY-MM-DD）；
  已存在就不動。瀏覽面板的「已讀」篩選看這個欄位（§3.4）。2026-10-14 使用者訂定（docs/feature/1014-report.md Q2）。
- 重複載入：用 frontmatter `rf-source` + `rf-id` 判斷，已存在就跳過（列表上標示「已載入」）。
- `cover`／`thumbnail`：圖片**網址**（不下載圖檔），給筆記列表（例：Bases 卡片檢視的圖片屬性）用；
  TED 沒有圖時整行省略。2026-10-14 使用者要求加入。
- 檔名：預設 `<資料夾>/TED/<published> <title>.md`；title 裡 `\/:*?"<>|#^[]` 換成空白（再壓連續空白、去頭尾）。
- 段落文字跳脫（確保一段 = 一個段落區塊、只有結尾一對註解）：換行與連續空白壓成一個空白；
  行首 `# > - + * [ < ` ~ _ = |` 前加 `\`，行首 `1.`／`1)` → `1\.`／`1\)`；
  後面緊接 `%` 的 `%` 換成 `%\`（`%%` → `%\%`，閱讀模式仍顯示 `%%`）。文字為空的段落不輸出。
- YAML 純量含 `:`、`#`、引號等特殊字元就加雙引號（所以網址欄位會是 `"https://…"`，合法 YAML）。

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
- 依新到舊排序；cursor 是像 offset 的字串。
- **GraphQL 不能篩選**（V1-1 實測）：`videos` 只接受 `first／after／before／last／language／id`，introspection 關閉；
  分類、關鍵字、長度一律在插件端對已載入的頁面篩選（topics、title、speaker、duration）。
- 列表沒有「有沒有英文 transcript」欄位 → 用 §2.5 的內建排除清單，加上載入時發現的（`NoTranscriptError`）。
- 請求間隔 ≥ 300 ms；結果在記憶體快取，面板開著時不重抓。

### 2.2 單篇（talk 頁的 `__NEXT_DATA__`）
- `GET https://www.ted.com/talks/<slug>` → 取 `<script id="__NEXT_DATA__">` 的 JSON。
- 段落：`props.pageProps.transcriptData.translation.paragraphs[]`；一個 paragraph = 一段，
  文字 = 各 cue 的 `text` 以空白串接（cue 內的換行也換成空白、連續空白壓成一個）。
- 段落開始時間 = 第一個 cue 的 `time`（毫秒 → 秒），再依 §2.4 處理片頭偏移。
- 中繼資料：`props.pageProps.videoData` 的 `title`、`presenterDisplayName`、`publishedAt`、`duration`、`topics.nodes[].name`。
- 沒有英文 transcript（`transcriptData` 為 null 或 paragraphs 為空）→ `NoTranscriptError`；列表無法預先標示（見 §2.1）。

### 2.3 音源
- `videoData.hlsUrl`（master playlist）**去掉 `intro_master_id` 參數**（不要片頭）。
- 解析 master，取 `#EXT-X-MEDIA:TYPE=AUDIO` 裡 `NAME="low"`（單聲道，約 64 kbps）的 URI，
  轉成絕對網址寫進 `rf-audio`；沒有 low 就用 medium。
- 片段是 MPEG-TS（AAC），回應帶 `access-control-allow-origin: *`。

### 2.4 片頭偏移（V1-1 驗證，2026-10-14）
- **cue `time` 以不帶片頭版為準 → 不用扣**：`start` = 第一個 cue 的毫秒 ÷ 1000，搭配去掉 `intro_master_id` 的音源，時間軸一致。
- 只要去掉 `hlsUrl` 的 `intro_master_id`：帶參數時 master 裡每個 audio URI 都會帶同一參數，去掉後就乾淨。
- 舊 talk（約 2010）的 cue 只精確到整秒；跟隨與 ▶ 仍可用，但段首可能早／晚 ≤ 1 s。
- 驗證工具：`pipeline/tools/ted_intro_check.py`（ffmpeg 取前 90 s ＋ mlx-whisper 逐詞時間，用連續 3 詞比對，只用 1 詞會被 "I" 誤配）。數字見 LEDGER。

### 2.5 沒有英文逐字稿的 talk（2026-10-14 使用者訂定）
- 例：「Beyond the Talk」系列。GraphQL 列表照樣會列出，但 talk 頁 `transcriptData` 沒有段落。
- **內建清單**：`pipeline/tools/ted_no_transcript.py` 對全部 talk 逐篇檢查，產出 `src/core/ted/noTranscript.json`
  （只有 slug）。清單裡的 talk **不列在面板上**。要更新就重跑腳本、重新 build 發版。
- **執行期發現的**（清單之後才上架的新 talk）：載入失敗是 `NoTranscriptError` → slug 記進設定 `noTranscript`，
  那一列**反灰、不能勾**，標示「沒有英文逐字稿」。其他錯誤不記（下次可重試）。

## 3. 播放與同步

### 3.1 播放器
- 整個插件只有**一個** `HTMLAudioElement`，一次只播一篇。
- 能不能原生播 HLS：`audio.canPlayType("application/vnd.apple.mpegurl")` 非空（iPhone／iPad）→ 直接設 `src`；
  否則（桌面、Android）用 **hls.js**（`hls.light` 版）掛 MSE。hls.js 載入失敗時，改用以 `requestUrl`
  實作的自訂 loader 重試一次。
- **懸浮播放列**（2026-10-14 使用者訂定，取代原本只在播放後才出現的頂端播放列）：
  - rf 筆記在閱讀模式**一打開就有**，捲動時一直浮在畫面上；桌面靠上、手機／平板靠下（依 `Platform.isMobile`，不看寬度）。
  - 主按鈕：上一篇、上一段、播放／暫停、下一段、下一篇；另有 ☆ 收藏、「⋯」收速度、跟隨、停止、目前段落 n / N。
  - 播放／暫停在沒播過的筆記上 = 從第一段開始播這篇。
  - 上／下一段：播放中就接著播；暫停中只移動位置（高亮跟著走）。
  - 上／下一篇：同資料夾的 rf 筆記，依 `published` 新到舊排序（下一篇 = 較舊）；開啟該筆記並從頭播。
    iOS 要在點擊當下同步呼叫 `play()`（§3.2）：音源網址從 metadataCache 的 frontmatter 同步取得，時間戳表之後再補。
- **自動閱讀模式**：開啟 rf 筆記時若不在閱讀模式就切過去（設定 `autoReadingMode`，預設開）。
- **屬性區**：rf 筆記整塊隱藏（只靠插件加的 class + CSS，不改 md）。

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

### 3.4 已讀與收藏（瀏覽面板的狀態篩選）
- 篩選下拉：全部／未載入／已載入未讀／已讀／收藏（`StatusFilter`）。
- 已讀 = 筆記 frontmatter 有 `rf-read`（§1），從 metadataCache 讀。
- 收藏 = 書籤圖示（Lucide `bookmark`），列表每列都有、懸浮播放列也有；存在設定 `favorites`（`<rf-source>:<rf-id>`），
  沒載入的 talk 也能收藏。

## 4. （之後）BBC 時間戳管線

v1 不做。設計保留在 git 歷史 `ed3a6c8` 的 METHOD.md（段落切法、指紋 fp、時間戳 JSON、whisper 對齊、驗收門檻），
做 BBC 時再搬回來。
