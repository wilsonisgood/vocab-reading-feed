# LEDGER — 已經知道什麼

## 1. 判決

| 日期 | 對象 | 判定 | 死因／可轉移結論 |
|---|---|---|---|
| 2026-10-14 | TED cue time 是否含片頭（V1-1） | ✅ 不含，免扣 | 帶／不帶片頭 low playlist EXTINF 差三場皆 3.527 s（Paul Bloom 2026：730.705 vs 734.232；nilay_kulkarni 2018：452.644 vs 456.171；anil_gupta 2010：1354.883 vs 1358.410）。實際開口 − cue（不帶片頭音軌，whisper-large-v3-turbo）：Paul −0.33／−0.29，2018 −0.35，2010 −0.68（各場第 1 段 whisper 夾在 0.00 不計）→ 遠離 −3.5，誤差屬 whisper 詞首偏早 |
| 2026-10-14 | 懸浮播放器 A（放側欄）vs B（筆記內圓鈕）（round 2） | ✅ 混合：B ＋ 側欄標示播放中 | 使用者選定。側欄在手機是抽屜、收起就看不到 → 主體放筆記內可拖動圓鈕；側欄只做 🔊 標示 |
| 2026-10-14 | 點前面段落 ▶ 不跳（round 2） | ✅ 已修：改用段落序號 | 不是跟隨捲動的問題：第一次播放寫 `rf-read` → frontmatter 重排位移 11 行 → DOM 上的行號全對不上，▶ 直接 return、高亮也消失。實機（CDP）重現並驗證修正 |
| 2026-10-14 | (Applause)／(Laughter) 怎麼濾（round 3） | ✅ 只在上／下一段跳過，⛔ 不在載入時刪 | 載入時刪：要改 md 合約（必停點）、已載入的筆記不會變、被刪段的音訊會併進前一段（只播這段時會多播掌聲）。只跳過：時間戳與音源不動，同步不受影響 |
| 2026-10-14 | 大段／小段（rf-schema 2） | ✅ 採用：大段依時間 2.5–3 min、小段按句（≤ 8 字接下一句） | 使用者選定（A 依時間；C 用 AI 下標題要送全文給第三方，和憲法 1 衝突）。舊筆記不轉換，使用者自己刪掉重載 |
| 2026-10-14 | 小段時間戳用字幕行內插準不準 | ✅ 跟 TED 自己的段首 cue 一樣準 | `ted_chunk_check.py`（whisper-large-v3-turbo 整篇）。Paul Bloom：內插 n=85 \|差\| 中位數 0.25 s、p90 0.61、最大 1.38；段首 cue n=16 中位數 0.32、p90 0.50。Blake Mycoskie：內插 n=63 中位數 0.46、p90 0.73、最大 1.02；段首 cue n=17 中位數 0.68、p90 0.91。whisper 詞首本來就偏早約 0.3 s（見 V1-1 列），不另加提前量 |
| 2026-10-17 | iPhone 鎖定畫面 ⏮⏭ 切篇 | ✅ 可用 | 只出現 ±10 秒 → 把 seek 動作明確設 null 後換成 ⏮⏭。「按了沒反應」不是 iOS 問題，是在清單最後一篇按 ⏭（除錯紀錄確認）→ 鎖定畫面改成頭尾繞回；App 內的上／下一篇不變 |
| 2026-10-17 | 書的章節筆記（V1-10） | ✅ 擴充 §1（§1.2 `rf-source: book`），沿用 rf-schema 2 | 使用者同意。播放只看網址：路徑不是 `.m3u8` 就直接 `audio.src`（原本桌面一律掛 hls.js，m4a 會壞）。「下一篇」排序本來就是「沒 `published` → 依檔名」，對章節成立，只把檔名比較改成數值序（`100` 在 `99` 後）。收藏只在 TED 瀏覽面板，書不適用 || 2026-10-14 | TED GraphQL 篩選（V1-1） | ❌ 不支援 | `videos` 只有 first/after/before/last/language/id；試過約 35 個參數名皆 Unknown argument；introspection 關閉 → 篩選在插件端 |

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
- 2026-10-14 TED 沒有英文逐字稿的 talk：全量掃 5278 篇（GraphQL 列表 + 逐篇 talk 頁，1 req/s，約 90 分鐘），
  **204 篇**沒有（3.9%；Beyond the Talk 14 篇，其餘多是對談、表演、多人座談），無法判斷 0 篇。
  清單 → `src/core/ted/noTranscript.json`（METHOD §2.5）；逐篇判決留在 `pipeline/data/ted_transcript.jsonl`（不進 git）。
