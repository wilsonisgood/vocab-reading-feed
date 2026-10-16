# PITFALLS — 踩過的坑

<!-- 工具靜默錯、口徑陷阱、會前視的對齊。每條附日期。 -->

- 2026-10-14 **BBC 的 podcast RSS 音檔會插動態廣告**：RSS enclosure 經 tritondigital 轉址（`im=dai`），
  實際檔案 3.9 MB ≠ RSS 寫的 3.27 MB，每次下載長度可能不同 → 預先算的時間戳會整段偏掉。
  ⇒ 一律用節目頁上的 `downloads.bbc.co.uk/learningenglish/features/6min/*_download.mp3`（兩次下載同大小）。
- 2026-10-14 **TED 的 HLS 網址帶 `intro_master_id` 會在前面接片頭**（例：12009 加片頭 734.2 s、不加 730.7 s）。
  transcript 的 cue 時間是以哪一版為準還沒驗；處理與插件端要用同一版（建議不帶片頭）。
- 2026-10-14 **python.org 版 Python 沒有 CA 憑證**，urllib 連 https 會 CERTIFICATE_VERIFY_FAILED
  → `tools/survey.py` 用 `/etc/ssl/cert.pem`。
- 2026-10-14 **BBC 節目列表的 `<a` 跟 `href` 之間是兩個空白**，regex 要寫 `<a\s+href`，不然標題全空。
- 2026-10-14 **TED 的 videos sitemap 會落後**（最新 2026-09-16；09-30 的 Paul Bloom 那場不在裡面）→ 最近一個月要另外補。
- 2026-10-14 **`processFrontMatter` 會重排整個 frontmatter**（flow 序列 `[a, b]` 展開成多行）→ 筆記行號整體位移，
  畫面上已渲染的區塊不會重畫。任何存在 DOM 上的行號都會過期 ⇒ 段落用序號對應（METHOD §3.2）。
- 2026-10-14 **post-processor 裡 `ctx.getSectionInfo(el).text` 可能是空字串**（稍後才補上），`lineStart` 正確 → 別從 `text` 解析。
- 2026-10-14 **CSS 隱藏屬性區被 Obsidian 蓋掉**：`.markdown-preview-view.show-properties .metadata-container`
  權重較高且讀 `--metadata-display-reading` → 改設變數（METHOD §3.1）。
- 2026-10-14 **實機除錯**：`env -u ELECTRON_RUN_AS_NODE /Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9333`，
  再用 CDP（`/json/list` → WebSocket `Runtime.evaluate`、`Input.dispatchMouseEvent`、`Page.captureScreenshot`）操作與截圖。
- 2026-10-14 **閱讀模式點收合箭頭展開後，段落 DOM 是稍後才畫出來的** → 展開後要延遲再加高亮／捲動（現在 150 ms）。
- 2026-10-14 **用程式 `leaf.openFile()` 開 rf 筆記不會觸發自動閱讀模式**（只有使用者自己開才會）；CDP 測試要自己 `setViewState` 切到 preview。
- 2026-10-14 **hls.js 自帶的型別需要 TS ≥ 5.7**（Uint8Array 泛型），本 repo 釘 TS 5.3.3 → 用 `src/services/player/hls-light.d.ts` 自寫最小型別；升級 TS 後可刪。
- 2026-10-17 **iOS 鎖定畫面只出現 ±10 秒、沒有 ⏮⏭**：已設 nexttrack／previoustrack 仍被系統預設的 skip 鈕蓋掉
  → 明確 `setActionHandler("seekforward"/"seekbackward"/"seekto", null)`，並在每次開播重新註冊（iPhone 實機確認有效）。
