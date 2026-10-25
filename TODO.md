# TODO — 現在要做什麼

v1 目標：**TED、只串流**。面板列出 TED 演講（標題、講者、日期、長度、分類）→ 勾選多篇 → 「載入」
→ 每篇一個 md（METHOD §1）→ 閱讀模式有播放列、每段 ▶、跟著段落高亮捲動。不需要任何伺服器。

## 狀態表

| 項 | 狀態 | 缺什麼 |
|---|---|---|
| 盤點 BBC + TED（`pipeline/tools/survey.py`） | ✅ | — |
| V1-0 插件骨架 | ✅ | — |
| V1-1 TED client（純邏輯）＋片頭偏移驗證 | ✅ | — |
| V1-2 md 產生器（純邏輯） | ✅ | — |
| V1-3 文章瀏覽面板 | ✅ | UI 只過型別／lint／build，實機留給 V1-5 |
| V1-4 播放器與同步 | ✅ | 實機項目留給 V1-5 |
| V1-5 實機驗證（桌面＋iPhone） | 🔵 | 第一輪回報見 docs/feature/1014-report.md → 轉成 V1-6 |
| V1-6a 面板修正＋狀態篩選＋收藏 | ✅ | 已整合（e885770）；續載、書籤待實機 |
| V1-6b 懸浮播放列＋自動閱讀模式＋已讀 | ✅ | 已整合（e885770）；懸浮列位置（手機底部 +56px）、上／下一篇待實機 |
| V1-6c 沒有逐字稿的排除清單 | ✅ | 204 篇，見 LEDGER |
| V1-7 第二輪回報（屬性區、▶ 跳段、執行期排除、懸浮圓鈕） | ✅ | 桌面已用 CDP 實機驗；手機待使用者測 |
| V1-8 第三輪回報（卡片精簡、上／下一段跳過舞台提示） | ✅ | 已部署，桌面實機確認；手機待使用者測 |
| V1-9 大段／小段（rf-schema 2） | ✅ | 已部署；桌面實機確認（收合、大綱、自動展開）；手機待使用者測 |
| 鎖定畫面 ⏮⏭ 切篇（iPhone） | ✅ | 實機確認；「沒反應」是在最後一篇按 ⏭ → 改成頭尾繞回 |
| V1-10 書的章節筆記（`rf-source: book`，METHOD §1.2） | ✅ | 程式＋測試完成；桌面＋iPhone 播 m4a、拖曳（Range）待實機 |
| V1-11 我的書（從使用者自己的書庫下載章節，METHOD §5） | ✅ | 程式＋測試完成；對真的書庫實機下載／更新待驗 |
| V1-12 播放歷史（METHOD §3.5，分支 `feat/play-history`） | ✅ | 程式＋測試完成；面板外觀（尤其是手機底部 sheet）、點一筆接著播待實機 |
## V1-0 插件骨架（主 session 自己做）
- [x] 照 `../obsidian-vocab-tracker` 的工具鏈：`package.json` scripts（typecheck → lint → test → build = `npm run check`）、
      `tsconfig.json`、`esbuild.config.mjs`、`eslint.config.mjs`、`vitest.config.ts`、`version-bump.mjs`。
      依賴版本照抄 tracker（obsidian 1.13.0、typescript 5.3.3…），另加 `hls.js`。
- [x] `manifest.json`：id `reading-feed`、name `Reading Feed`、`isDesktopOnly: false`。
      ⚠️ id 上架後不能改，第一次發版前跟使用者確認。
- [x] 分層照 tracker：`src/core`（純邏輯，不 import obsidian）、`src/services`、`src/ui`、`src/platform`；ESLint 擋。
- [x] `.gitignore` 加 `node_modules/`；`main.ts` 空插件能載入；`npm run check` 全過。

## V1-1 TED client（`src/core/ted/*`、`src/services/ted/*`）
- [x] GraphQL 列表（METHOD §2.1）：分頁、回傳型別化的 `TalkSummary[]`（含 `cover`／`thumbnail`）。實測 GraphQL 支不支援分類／關鍵字篩選，結論寫回 METHOD §2.1。
- [x] talk 頁解析（§2.2）→ `Talk { meta, paragraphs: {text, start}[], audioUrl }`；master playlist 解析（§2.3）。
- [x] 測試：把真實回應存成 `tests/fixtures/ted/*.json|html|m3u8`（只留需要的欄位，檔案要小），測試不連網。
- [x] **片頭偏移驗證**（§2.4）：Paul Bloom 那場 + 另外 2 場不同年份的 talk。方法：用 ffmpeg 接起不帶片頭的 low 音軌
      前 90 秒，`pip3 install mlx-whisper` 轉寫，比對前 3 段 cue 時間和實際開口時間。結論寫回 METHOD §2.4、數字寫進 LEDGER。
      驗證用的腳本放 `pipeline/tools/ted_intro_check.py`。

## V1-2 md 產生器（`src/core/note/*`）
- [x] `Talk` → md 字串（METHOD §1），含 frontmatter、每段 `%%rf:t%%`、結尾出處。檔名規則與非法字元處理。
- [x] 反向：從筆記原始文字解析出 `{line, start}[]`（給 V1-4 用）。
- [x] 測試：產生 → 解析來回一致；標題含特殊字元；段落內含 `%%` 等邊界情況。

## V1-3 文章瀏覽面板（`src/ui/browser/*`）
- [x] 右側欄 ItemView + 指令「開啟 Reading Feed」+ ribbon 圖示。
- [x] 列表：縮圖（`thumbnail`）、勾選框、標題、講者、日期、長度、分類標籤；捲到底載入下一頁；已載入的標示「已載入」且不能勾。
- [x] 篩選：分類（下拉）、關鍵字、長度（< 10 分／10–20／> 20）——GraphQL 不支援，插件端篩已載入頁面。
- [x] 「載入 (n)」按鈕：逐篇抓取 → 寫檔，顯示進度；單篇失敗不影響其他篇，最後列出失敗清單。
- [x] 設定頁：存放資料夾、預設速度、▶ 預設「播到結束／只播這段」、跟隨捲動預設開關。
- [x] 手機版版面（窄螢幕不能橫向捲動）。

## V1-4 播放器與同步（`src/services/player/*`、`src/ui/reading/*`）
- [x] 單一播放器服務；原生 HLS 或 hls.js（METHOD §3.1）。
- [x] 播放列、每段 ▶、跟隨捲動、手動捲動後暫停跟隨、虛擬化處理（METHOD §3.2–3.3）。
- [x] 切換筆記／關閉分頁時的行為：繼續播但播放列出現在原筆記；開別篇 rf 筆記按 ▶ 就切過去。
- [x] 純邏輯（找目前段落、只播這段的停止點、跟隨狀態機）抽成可測的函式。

## V1-5 實機驗證（精簡：只測邏輯不同的環境、跑一次、失敗才截圖）
- [ ] 桌面（hls.js 路徑）：載入 3 篇 → 播放、點 ▶、跟隨、速度、長筆記捲到未渲染段落（驗 `previewMode.applyScroll(line)` 單位是行號、高亮補上）；播放列版面。
- [ ] iPhone（原生 HLS 路徑）：同上，加「▶ 第一次點就有聲音」。
- [ ] 同時裝 Vocab Tracker：▶ 和 tracker 的 ✦ 不互相干擾。

## V1-6 第一輪實機回報（docs/feature/1014-report.md；規格 METHOD §1 rf-read、§2.5、§3.1、§3.4）
- [x] 6a 載入失敗後勾選框全部卡住（跑完沒以 busy=false 重畫列表；失敗的沒從已選移除）。
- [x] 6a 捲到底不續載（實機只看到約 10 篇）。
- [x] 6a 內建清單裡的 talk 不列；執行期 `NoTranscriptError` → 記進設定、該列反灰。
- [x] 6a 狀態篩選：全部／未載入／已載入未讀／已讀／收藏；每列書籤圖示；設定頁加「自動閱讀模式」。
- [x] 6b 懸浮播放列（上一篇、上一段、播放／暫停、下一段、下一篇、收藏、⋯）；桌面上、行動裝置下；rf 筆記一打開就有。
- [x] 6b 開 rf 筆記自動切閱讀模式；rf 筆記隱藏整塊屬性區；第一次播放寫 `rf-read`。
- [x] 6c 全量掃 TED，產出排除清單。
- [ ] 整合後部署，請使用者再實機測（含 V1-5 原有項目）。

## V1-7 第二輪實機回報（docs/feature/1014-report.md round 2）
- [x] 屬性區沒隱藏：Obsidian 規則權重較高 → 設 `--metadata-display-*` 變數（實機確認 `display: none`）。
- [x] 播放中點前面段落 ▶ 不跳：`rf-read` 重排 frontmatter 讓行號失效 → ▶／高亮改用段落序號。
- [x] 執行期發現沒逐字稿的 talk 也不列（原本反灰）。
- [x] 懸浮播放器改混合版：灰底圓鈕（播放中藍耳機／否則白）、可拖動、展開卡片顯示正在播哪篇＋跳到該篇；側欄標示播放中那篇。
- [ ] 使用者實機測：桌面＋iPhone／iPad（圓鈕右下、拖動、卡片不超出螢幕）。

## V1-8 第三輪實機回報（docs/feature/1014-report.md Round 3）
- [x] 卡片拿掉狀態文字、×、收藏、「回到朗讀位置」大按鈕（後者移進「⋯」）；「⋯」移到下一篇右邊。
- [x] 上／下一段跳過只有舞台提示的段落（METHOD §3.1；判決見 LEDGER）。
- [x] 部署＋實機截圖（下一段：1 → 3 → 5，跳過 (Voice breaking)、(Applause)；上一段 5 → 3）。

## V1-9 大段／小段（METHOD §1.1）
- [x] talk 頁保留每個字幕行的時間（`Paragraph.cues`）。
- [x] `src/core/note/segment.ts`：斷句、短句合併、時間內插、切大段、標題文字；`rf-schema: 2`。
- [x] 閱讀模式：大段標題後 ▶、播到收起的大段自動展開、卡片顯示「第 n / N 節」。
- [x] whisper 驗證小段時間（`pipeline/tools/ted_chunk_check.py`；結果見 LEDGER）。
- [ ] 使用者在手機上確認收合與大綱。

## V1-10 書的章節筆記（METHOD §1.2；2026-10-17 使用者同意擴充 §1）
- [x] `rf-audio` 不是 `.m3u8` → 所有平台直接 `audio.src`（`isHlsUrl` 純函式＋測試）。
- [x] 閱讀模式、▶、跟隨、已讀、播完接下一章／鎖定畫面 ⏮⏭ 對 book 筆記都適用（本來就只看 `rf-source`＋`rf-id`）；
      下一章 = 同資料夾依檔名排序（數字照數值比）；鎖定畫面顯示作者／書名。
- [x] fixture `tests/fixtures/book/17 SEVENTEEN.md` 解析測試（假網址）。
- [ ] 實機：桌面＋iPhone 播 Worker 上的 m4a、▶ 跳段、進度條拖曳（Range／206）、播完接下一章、鎖定畫面 ⏮⏭。

## V1-11 我的書（METHOD §5；2026-10-17 使用者同意）
- [x] 設定「書庫網址」（密碼框、正規化、沒有預設值）。
- [x] 「我的書」面板＋指令「開啟我的書」：書名、作者、已念／總章數、更新日、狀態（未下載／有更新／已是最新）、下載／更新。
- [x] 下載到 `<資料夾>/Private Podcast/<folder>/<name>`；網路來的名字再清理；更新規則（sha＋指紋，本機有修改不覆蓋、可手動覆蓋）。
- [x] 404／網路錯誤／格式錯誤的訊息與重試；純邏輯在 `src/core/library/logic.ts` 並有測試。
- [x] 還沒念的章（沒有 `rf-audio`）不顯示播放器、不算下一章。
- [ ] 實機：對真的書庫下載一本 → 開章節播放 → podcast 那邊多念一章後按「更新」只覆蓋那章 → 改一章內文後再更新顯示「本機有修改」→ 手動覆蓋。
- [ ] 實機：手機（iPhone）上設定貼網址、面板版面、下載。

## 之後（v1 不做）
- BBC 6 Minute English：要先在 `pipeline/` 用 whisper 算時間戳並發布（設計見 METHOD §4）。
- 下載到 vault／裝置端壓縮（串流／原檔／壓縮三選一；iOS 要先實測 WebCodecs 與 Opus；⛔ 不用 LAME）。
- 編輯模式（Live Preview）也顯示 ▶。
