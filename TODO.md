# TODO — 現在要做什麼

背景：Vocab Tracker 插件要做「文章瀏覽器 → 勾選後載入成 md → 原音播放時跟著段落走、每段有 ▶」。
音檔和原文由插件在使用者端向官網抓；本 repo 只負責**預先算好 BBC 的段落時間戳**，並提供
BBC + TED 的文章索引（憲法 1）。合約（段落切法、指紋、JSON 格式、對齊、驗收）全在 METHOD.md。

## 狀態表

| 項 | 狀態 | 缺什麼 |
|---|---|---|
| 盤點 BBC + TED 文章數（`tools/survey.py` → `data/survey.json`） | ✅ | — |
| P0 概念驗證（下方 P0-1～P0-4） | ⬜ | — |
| P1 BBC 494 集批次 | ⬜ | P0 通過 |
| P2 TED 索引補分類 | ⬜ | P0-3 結論 |
| P3 發布（GitHub + jsDelivr） | ⬜ | ⛔ 必停點：開 repo、push 要先問使用者 |

## P0 概念驗證（範例：BBC ep-261008、TED paul_bloom_ai_and_the_end_of_loneliness）

- [ ] **P0-1 環境**：`pip3 install mlx-whisper`（⛔ 不是 `pip`）。模型用 `mlx-community/whisper-large-v3-turbo`。
      記下一集 BBC 的轉寫耗時（寫進 LEDGER）。
- [ ] **P0-2 BBC 一集走完全程** → `tools/bbc_timings.py <ep-id>`：
  1. 抓節目頁，依 METHOD §1 切段（確認 transcript 容器 selector 並寫回 METHOD §1）。
  2. 下載頁面上的 `downloads.bbc.co.uk/...download.mp3`（⛔ 不用 podcast RSS 的音檔，見 PITFALLS），
     存到 `.cache/audio/`（已在 .gitignore 裡）。量實際的 bytes 和 duration（用 ffprobe）。
  3. 轉寫 → 對齊（METHOD §4）→ 輸出 `data/timings/bbc/bbc-6min-261008.json`。
  4. 跑 METHOD §4 的驗收；另外印出「段落索引、start、段首 6 個字」的對照表，讓人用耳朵抽聽。
- [ ] **P0-3 TED 片頭偏移**：抓 Paul Bloom 那場的 cues；分別下載不帶片頭和帶片頭的 low 音軌
      （`index-f5-a1.m3u8`，片段是 .ts，用 ffmpeg 接起來），各轉寫前 90 秒，看 cue 時間對齊哪一版。
      再拿另外 2 場不同年份的 talk 驗證同一結論。結論寫回 METHOD §5 和 LEDGER。
- [ ] **P0-4 指紋範例**：產出 `tests/fixtures/fp_cases.json`（METHOD §2），並寫 `tools/fp.py`
      和它的單元測試（`python3 -m unittest`）。

P0 交付：給使用者看 BBC 那集的驗收數字、對照表，以及 TED 的片頭結論；有問題就停下來問。

## P1 BBC 全部 494 集
- [ ] `tools/bbc_timings.py --all`：可中斷續跑（已有 JSON 且音檔 bytes 相同就跳過）；
      每集處理完就刪掉 `.cache/audio` 裡的那個音檔（或只保留最近 N 集）。
- [ ] 產出 `data/timings/index.json`；驗收不通過的集數列進 `data/timings/failed.json`，不發布。
- [ ] 背景跑，進度寫 log；結束後把通過率寫進 LEDGER。

## P2 TED 索引
- [ ] sitemap 沒有分類（topics），且會落後一個月。先試 `https://www.ted.com/graphql`
      能不能批次查 videos（含 topics、publishedAt）；不行再只對近 2 年的 talk 逐頁抓 `__NEXT_DATA__`
      （速率 ≤ 1 req/s）。
- [ ] 產出 `data/catalog/ted.json`（加上 categories），並補上 sitemap 之後才發布的新 talk。

## P3 發布（⛔ 先問使用者）
- [ ] 建 GitHub repo（或決定放在既有 repo 的子目錄），push `data/timings/` 和 `data/catalog/`。
- [ ] jsDelivr 網址格式：`https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/data/timings/index.json`。
- [ ] 每週排程（launchd）：抓新的一集 → 處理 → commit。push 之前先問。

## 插件端（另案，在 `../obsidian-vocab-tracker` 照它的開發流程做）
- 文章瀏覽器、匯入成 md、播放列、跟隨捲動、每段 ▶、裝置端壓縮（串流／原檔／壓縮三選一）。
- 裝置端壓縮在 iOS 上要先實測：WebCodecs 的 AudioEncoder 能不能用、Opus 能不能播；
  不行就退回 wasm 版 libopus（BSD 授權）。⛔ 不用 LAME（LGPL）。
