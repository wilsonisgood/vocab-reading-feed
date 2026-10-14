# LEDGER — 已經知道什麼

## 1. 判決

| 日期 | 對象 | 判定 | 死因／可轉移結論 |
|---|---|---|---|
| 2026-10-14 | TED cue time 是否含片頭（V1-1） | ✅ 不含，免扣 | 帶／不帶片頭 low playlist EXTINF 差三場皆 3.527 s（Paul Bloom 2026：730.705 vs 734.232；nilay_kulkarni 2018：452.644 vs 456.171；anil_gupta 2010：1354.883 vs 1358.410）。實際開口 − cue（不帶片頭音軌，whisper-large-v3-turbo）：Paul −0.33／−0.29，2018 −0.35，2010 −0.68（各場第 1 段 whisper 夾在 0.00 不計）→ 遠離 −3.5，誤差屬 whisper 詞首偏早 |
| 2026-10-14 | TED GraphQL 篩選（V1-1） | ❌ 不支援 | `videos` 只有 first/after/before/last/language/id；試過約 35 個參數名皆 Unknown argument；introspection 關閉 → 篩選在插件端 |

## 2. 已關閉方向

- 2026-10-14 **不再當 Vocab Tracker 的資料後端**：改成獨立插件 Reading Feed（使用者決定）。v1 只有 TED、只串流。

- 2026-10-14 **VOA Learning English 不做**（使用者決定：BBC + TED 已足夠）。盤點時的參考數字：
  15 個分類去重後 10040 篇；2025 年起發文量大減（sitemap 2024 年 3389 筆 → 2025 年 562 → 2026 年 202）。

## 3. 歷史裁決

- 2026-10-14 盤點（`pipeline/data/survey.json`）：BBC 6 Minute English 494 集（2017-05 起，每年約 52）；
  TED 7642 場（sitemap 有 `language:en` 標記 6652，平均 12.5 分鐘）。
- 2026-10-14 TED 頁面 `__NEXT_DATA__.props.pageProps.transcriptData` 自帶逐句 cue 時間（毫秒）→ TED 不必轉寫。
- 2026-10-14 TED GraphQL（`POST https://www.ted.com/graphql`）的 `videos(first, after, language:"en")` 可用：
  totalCount 5278，依新到舊，含 topics／publishedAt／duration，且比 sitemap 新（有 10/13 那場）→ v1 列表用它，不需要伺服器。
- 2026-10-14 TED HLS 的 m3u8 與 .ts 片段都回 `access-control-allow-origin: *` → hls.js 可直接串流。
  音軌 low = 單聲道約 64 kbps（6 秒片段約 48 KB），medium = 立體聲約 140 kbps。
