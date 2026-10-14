# Reading Feed（Obsidian 插件）— 瀏覽英文文章、勾選後載入成 md，串流原音並跟著段落走

- **主 session**：開工前先讀 [AGENT.md](AGENT.md)（subagent 調度規則：何時派工、選 model、控制成本）。
- **subagent**：不用讀 AGENT.md，照派工 prompt 做就好。

**狀態**：active。v1 = **只有 TED、只用串流**。BBC 與裝置端下載／壓縮是之後的事（TODO「之後」）。

獨立插件，⛔ 不依附 Vocab Tracker（`../obsidian-vocab-tracker`）：它只負責「取得 md 與音源、播放」。
兩個插件同時裝時要互不干擾（CSS class、post-processor 都加 `rf-` 前綴）。

## 1. 開工先讀（≤ 3 份，每份 ≤ 200 行）

| 順序 | 檔 | 為什麼 |
|---|---|---|
| 1 | 本檔 | 規則在哪、寫回去哪 |
| 2 | [TODO.md](TODO.md) | 現在在哪、卡在哪 |
| 3 | [METHOD.md](METHOD.md) | md 格式合約、TED 怎麼抓、播放同步規則 |

## 2. 文件地圖（固定檔名；沒有的不列，⛔ 不另創名字）

| 檔 | 放什麼 | 何時讀 | 何時改 |
|---|---|---|---|
| [METHOD.md](METHOD.md) | 合約與規則（⛔ 不放實測） | 動到格式、抓取、同步前 | 規則改寫時 |
| [LEDGER.md](LEDGER.md) | 已經知道什麼：判決、實測數字、已關閉方向 | 開新軌前 | 每次結案 |
| [TODO.md](TODO.md) | 現在要做什麼（只放前瞻） | 每 session | 狀態一變就改 |
| [PITFALLS.md](PITFALLS.md) | 踩過的坑 | 用新工具前 | 踩到新坑時 |
| [AGENT.md](AGENT.md) | subagent 調度規則 | 主 session 開工時 | 調度規則變動時 |
| [RUNBOOK.md](RUNBOOK.md) | 開發、測試、部署的順序 | 不熟這個 repo 時 | 流程變動時 |
| `pipeline/` | Python 工具（盤點；之後 BBC 時間戳） | 做 BBC 或驗證時 | — |

## 3. 必停點（其餘自主執行到完成）

1. 要花錢／要對外（push、建 GitHub repo、發布、送社群插件審核）
2. 要改任何一條事前寫死的線（憲法、METHOD §1 的 md 格式合約）
3. 額度或時間盒用完   4. 前提被推翻（例：TED 改版、GraphQL 或 HLS 不能用了）

## 4. 憲法 vs 參數

判別法：**這條放寬誰受益？**「宣告成功變容易」= 憲法（只有人能改）；只是工作變快／慢／貴 = 參數（依證據可調）。

憲法（≤ 7 條，⛔ 自評不准增刪）：
1. **⛔ 不重新發布音檔、不發布原文全文**（版權；2026-10-14 使用者訂定）。插件在使用者端直接向官網抓；
   我們自己的伺服器（之後做 BBC 時）只能放時間戳與文章索引。
2. 載入的 md 一律附出處與授權（TED：CC BY-NC-ND 4.0）。
3. 時間戳要能驗證是對同一個音源算的；對不上就不套用（退回不同步，不能硬套）。

## 5. 收工寫回哪裡

| 時點 | 必做 | 寫到哪 |
|---|---|---|
| 開工 | 查 LEDGER 已關閉方向；TODO 該項改 🔵 | TODO |
| 過程 | 狀態一變就改；卡住寫明缺什麼 | TODO |
| 結案 | LEDGER 加判決列；TODO 改 ✅/❌ | LEDGER · TODO |

## 6. 這個 repo 的人是誰、相信什麼（≤ 15 行）

一律用繁體中文跟使用者溝通。使用者也是 Vocab Tracker 的作者，開發流程沿用那邊（見 RUNBOOK）：
`npm run check` 全過才算完成、commit 帶重新 build 的 `main.js`、Obsidian 關閉後才部署到 vault、
回報 commit hash 和分支名；⛔ merge、push、發版都由使用者自己做。
插件將來可能有收費功能 → 授權風險要保守（憲法 1）。
Python 只用 `python3`／`pip3`（這台沒有 `python`／`pip`）。

## 7. 沉澱區（只放「以後每次都這樣」；議題級結論進 LEDGER）

<!-- - YYYY-MM-DD 規範。憑什麼：<那次事故> -->
