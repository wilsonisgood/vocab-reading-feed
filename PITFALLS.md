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
- 2026-10-14 **hls.js 自帶的型別需要 TS ≥ 5.7**（Uint8Array 泛型），本 repo 釘 TS 5.3.3 → 用 `src/services/player/hls-light.d.ts` 自寫最小型別；升級 TS 後可刪。
