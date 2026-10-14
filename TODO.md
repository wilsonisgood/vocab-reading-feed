# TODO — 現在要做什麼

v1 目標：**TED、只串流**。面板列出 TED 演講（標題、講者、日期、長度、分類）→ 勾選多篇 → 「載入」
→ 每篇一個 md（METHOD §1）→ 閱讀模式有播放列、每段 ▶、跟著段落高亮捲動。不需要任何伺服器。

## 狀態表

| 項 | 狀態 | 缺什麼 |
|---|---|---|
| 盤點 BBC + TED（`pipeline/tools/survey.py`） | ✅ | — |
| V1-0 插件骨架 | ✅ | — |
| V1-1 TED client（純邏輯）＋片頭偏移驗證 | ⬜ | V1-0 |
| V1-2 md 產生器（純邏輯） | ⬜ | V1-0；可跟 V1-1 平行 |
| V1-3 文章瀏覽面板 | ⬜ | V1-1、V1-2 |
| V1-4 播放器與同步 | ⬜ | V1-2（可先用手寫的範例 md 開發） |
| V1-5 實機驗證（桌面＋iPhone） | ⬜ | V1-3、V1-4 |

## V1-0 插件骨架（主 session 自己做）
- [x] 照 `../obsidian-vocab-tracker` 的工具鏈：`package.json` scripts（typecheck → lint → test → build = `npm run check`）、
      `tsconfig.json`、`esbuild.config.mjs`、`eslint.config.mjs`、`vitest.config.ts`、`version-bump.mjs`。
      依賴版本照抄 tracker（obsidian 1.13.0、typescript 5.3.3…），另加 `hls.js`。
- [x] `manifest.json`：id `reading-feed`、name `Reading Feed`、`isDesktopOnly: false`。
      ⚠️ id 上架後不能改，第一次發版前跟使用者確認。
- [x] 分層照 tracker：`src/core`（純邏輯，不 import obsidian）、`src/services`、`src/ui`、`src/platform`；ESLint 擋。
- [x] `.gitignore` 加 `node_modules/`；`main.ts` 空插件能載入；`npm run check` 全過。

## V1-1 TED client（`src/core/ted/*`、`src/services/ted/*`）
- [ ] GraphQL 列表（METHOD §2.1）：分頁、回傳型別化的 `TalkSummary[]`（含 `cover`／`thumbnail`）。實測 GraphQL 支不支援分類／關鍵字篩選，結論寫回 METHOD §2.1。
- [ ] talk 頁解析（§2.2）→ `Talk { meta, paragraphs: {text, start}[], audioUrl }`；master playlist 解析（§2.3）。
- [ ] 測試：把真實回應存成 `tests/fixtures/ted/*.json|html|m3u8`（只留需要的欄位，檔案要小），測試不連網。
- [ ] **片頭偏移驗證**（§2.4）：Paul Bloom 那場 + 另外 2 場不同年份的 talk。方法：用 ffmpeg 接起不帶片頭的 low 音軌
      前 90 秒，`pip3 install mlx-whisper` 轉寫，比對前 3 段 cue 時間和實際開口時間。結論寫回 METHOD §2.4、數字寫進 LEDGER。
      驗證用的腳本放 `pipeline/tools/ted_intro_check.py`。

## V1-2 md 產生器（`src/core/note/*`）
- [ ] `Talk` → md 字串（METHOD §1），含 frontmatter、每段 `%%rf:t%%`、結尾出處。檔名規則與非法字元處理。
- [ ] 反向：從筆記原始文字解析出 `{line, start}[]`（給 V1-4 用）。
- [ ] 測試：產生 → 解析來回一致；標題含特殊字元；段落內含 `%%` 等邊界情況。

## V1-3 文章瀏覽面板（`src/ui/browser/*`）
- [ ] 右側欄 ItemView + 指令「開啟 Reading Feed」+ ribbon 圖示。
- [ ] 列表：縮圖（`thumbnail`）、勾選框、標題、講者、日期、長度、分類標籤；捲到底載入下一頁；已載入的標示「已載入」且不能勾。
- [ ] 篩選：分類（下拉）、關鍵字、長度（< 10 分／10–20／> 20）。
- [ ] 「載入 (n)」按鈕：逐篇抓取 → 寫檔，顯示進度；單篇失敗不影響其他篇，最後列出失敗清單。
- [ ] 設定頁：存放資料夾、預設速度、▶ 預設「播到結束／只播這段」、跟隨捲動預設開關。
- [ ] 手機版版面（窄螢幕不能橫向捲動）。

## V1-4 播放器與同步（`src/services/player/*`、`src/ui/reading/*`）
- [ ] 單一播放器服務；原生 HLS 或 hls.js（METHOD §3.1）。
- [ ] 播放列、每段 ▶、跟隨捲動、手動捲動後暫停跟隨、虛擬化處理（METHOD §3.2–3.3）。
- [ ] 切換筆記／關閉分頁時的行為：繼續播但播放列出現在原筆記；開別篇 rf 筆記按 ▶ 就切過去。
- [ ] 純邏輯（找目前段落、只播這段的停止點、跟隨狀態機）抽成可測的函式。

## V1-5 實機驗證（精簡：只測邏輯不同的環境、跑一次、失敗才截圖）
- [ ] 桌面（hls.js 路徑）：載入 3 篇 → 播放、點 ▶、跟隨、速度、長筆記捲到未渲染段落。
- [ ] iPhone（原生 HLS 路徑）：同上，加「▶ 第一次點就有聲音」。
- [ ] 同時裝 Vocab Tracker：▶ 和 tracker 的 ✦ 不互相干擾。

## 之後（v1 不做）
- BBC 6 Minute English：要先在 `pipeline/` 用 whisper 算時間戳並發布（設計見 METHOD §4）。
- 下載到 vault／裝置端壓縮（串流／原檔／壓縮三選一；iOS 要先實測 WebCodecs 與 Opus；⛔ 不用 LAME）。
- 編輯模式（Live Preview）也顯示 ▶。
