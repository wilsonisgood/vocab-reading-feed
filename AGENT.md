# AGENT.md — subagent 調度規則

給這個專案的主 session 讀；subagent 不用讀，照派工 prompt 做。
來源：`obsidian-vocab-tracker` 的 AGENT.md（2026-10-06 訂，正本在該 repo 的 `tmp/docs` 分支），
本檔是改寫成 Python 資料專案的版本。原則相同，專案規則（§5b）不同。

> **為什麼要有這份規則**：2026-10-06 那個 5 小時額度，88% 花在 Sonnet subagent 上，而且幾乎全是
> **重讀快取**：每個 subagent 跑 130–170 輪，每一輪都把約 20 萬 token 的上下文再讀一次。
> ⇒ 成本 ≈ **輪數 × 上下文大小**。省額度靠的是**少跑幾輪、上下文保持小**，換更便宜的 model 是其次。
>
> 本專案另有一個特點：**最花時間的是 whisper 轉寫和下載，但它們不花 token。**
> 長時間的批次一律用 Bash 的 `run_in_background` 跑，⛔ 不要派 subagent 去等它、也不要輪詢。

---

## 1. 什麼時候派、什麼時候自己做

| 情況 | 做法 |
|---|---|
| 預估 5 次工具呼叫以內：改 METHOD 一節、看一個 JSON、裝套件 | **主 session 自己做**。開一個 subagent 光讀規則和檔案就要先花 3–5 萬 token |
| 寫一支新工具（`tools/*.py`）並附測試 | 派 subagent |
| 跑批次（P1 的 494 集） | **主 session 用 `run_in_background` 跑腳本**，完成時會自動通知；不派 subagent |
| 查「某個東西在哪」，一句話答得完 | 主 session 用 grep |
| 剛回報的 subagent 有小地方要修 | 用 `SendMessage` 叫原本那個接著修；它的上下文已經很大（超過 100 輪）就改開新的，prompt 只寫要修的點 |
| 驗證 subagent 的成果 | **相信測試和驗收腳本的輸出**。只抽查它自己點名的風險，不要整份 diff 重讀 |

## 2. 選 model

| model | 用在 | 例子 |
|---|---|---|
| `haiku` | 純機械性工作，**不需要判斷哪些內容還有效** | 批次改名、照固定格式搬清單、清 `.cache` |
| `sonnet`（**預設**） | 一般實作、寫測試、寫爬蟲／解析器 | `tools/bbc_timings.py`、TED 片頭驗證 |
| `opus` | sonnet 已經失敗一次，或是演算法本身難 | 對齊演算法的 matched_ratio 一直過不了門檻 |

主 session 本身是 Opus，「需要判斷」的事（改 METHOD 合約、決定驗收門檻、看結果要不要停下來問使用者）
留在主 session 做。

> 2026-10-06 的教訓：要對照規格取捨的文件工作交給 haiku，它混進了舊行為、漏了一半項目。
> **要對照規格取捨的事，交給 sonnet 或主 session 自己做。**

## 3. 怎麼拆任務

- **大小**：一個任務預估 **40–80 輪**。超過 120 輪要拆；太小（< 15 輪）就併進別的任務，或是主 session 自己做。
- **地基先做**：好幾個任務都會用到的東西（例：`tools/fp.py` 指紋函式、HTTP 快取的 `get()`）先做，
  通常主 session 自己做就好，其他任務直接 import。
- **檔案不重疊**：每個任務列出「擁有」的檔案；共用檔案（§5b-2）走整合事項。
- **平行**：互相不依賴的任務同時在背景跑。平行不會多花錢，花錢的是總輪數。

### P0 的建議分法（參考）
| 任務 | 誰做 | 擁有 |
|---|---|---|
| P0-1 裝 mlx-whisper、量一集耗時 | 主 session | — |
| P0-4 `tools/fp.py` + 測試 + `tests/fixtures/fp_cases.json` | 主 session（地基，先做） | `tools/fp.py`、`tests/test_fp.py`、`tests/fixtures/` |
| P0-2 `tools/bbc_timings.py` 一集走完全程 | sonnet，背景 | `tools/bbc_timings.py`、`tests/test_bbc_*.py`、`data/timings/bbc/` |
| P0-3 TED 片頭偏移驗證 | sonnet，背景，跟 P0-2 平行 | `tools/ted_intro_check.py`、`data/reports/ted-intro.md` |

METHOD.md / LEDGER.md 的寫回由主 session 根據兩邊的回報來做。

## 4. 主 session 寫 prompt 的規則

**目標是讓 subagent 不用自己去探索。** 探索就是輪數，輪數就是上下文。

1. **規格只給相關的條號，原文直接貼進 prompt**（例：METHOD §1 BBC、§2、§4）。不要叫它讀整份 METHOD 或 TODO。
2. **給精確的位置**：要沿用哪個既有函式（例：`tools/survey.py` 的 `get()`、`SSL_CTX`），網址格式、JSON 欄位路徑。
3. **介面約定寫死**：函式簽名、輸出檔路徑和格式。
4. **完成條件要明確**：哪些測試要過、驗收腳本要印出什麼。
5. 結尾附上 §5 的規則（或叫它先讀 `/Users/will/obsidian-plugin/vocab-reading-feed/AGENT.md` §5–§6）。

### prompt 骨架

```
你是 <階段> 任務 X（<一句話主題>）。用繁體中文回報。
工作目錄：/Users/will/obsidian-plugin/vocab-reading-feed（分支 <branch>）
開工先讀：/Users/will/obsidian-plugin/vocab-reading-feed/AGENT.md 的 §5、§6

## 規格（原文）
<只貼這個任務相關的 METHOD 條號＋原文>

## 擁有（只能改這些）
<檔案清單>

## 已知的位置
- 沿用 tools/survey.py 的 get()（含 .cache 快取、/etc/ssl/cert.pem），不要另寫 HTTP
- <網址格式、JSON 欄位路徑、已知的坑>

## 介面約定
<函式簽名、輸出路徑與格式>

## 完成條件
- <要有的測試>
- python3 -m unittest discover -s tests 全過
- <驗收腳本要印出的東西>
```

## 5. subagent 必守規則（每個 prompt 都要帶）

### 5a. 省 token

1. **能一起發的工具呼叫就一次發**：一次讀好幾個檔案、一次跑好幾個 grep。
2. **大檔案不要整份讀**：先 `grep -n` 找位置再讀那一段。⛔ 不要 cat 整份網頁 HTML、`data/catalog/*.json`、
   whisper 的完整輸出；用 python 抽出需要的欄位，或是 `head -c`。同一個檔案讀過就不要再讀，改完也不用重讀確認。
3. **開發過程只跑相關的測試**：`python3 -m unittest tests.test_xxx`。全部測試只在**最後跑一次**。
4. **把長輸出截短**：`2>&1 | tail -40`；`git diff --stat`，不要整份 diff。
5. **不要去探索 prompt 沒提到的地方**。不清楚就照最合理的理解做，寫進回報的「不確定」。
6. **同一個錯誤修了兩次還沒好，就停下來**，把現象和猜測寫進回報，交回主 session。
7. **跑超過 100 輪就交回**：把做到哪、還剩什麼寫進回報。
8. **超過 2 分鐘的指令（轉寫、批次下載）用 `run_in_background`**，不要前景等、不要用 sleep 輪詢。
9. **驗證要精簡**：只抽查必要的樣本、跑一次就好，不做全排列、不重複跑。

### 5b. 專案規則

1. **憲法**：⛔ 不發布音檔、不發布原文全文。`data/timings/` 和 `data/catalog/` 只能有時間戳、指紋、標題、日期、網址。
   音檔與原文只能放在 `.cache/`（不進 git）。
2. **只改自己「擁有」的檔案。** 共用檔案不要自己改，寫進整合事項並附上可以直接貼上的片段。共用檔案：
   - `CLAUDE.md`、`METHOD.md`、`LEDGER.md`、`TODO.md`、`PITFALLS.md`、`RUNBOOK.md`
   - `tools/survey.py`、`tools/fp.py`（地基，只能 import）
3. Python：只用 `python3`（加 `-I`）、裝套件用 `pip3 install`（⛔ 這台沒有 `python`／`pip`）。
   沒有必要就只用標準函式庫；需要第三方套件時寫進 `requirements.txt`。
4. 對官網要客氣：逐頁抓的速率 ≤ 1 req/s，HTTP 一律經過 `get()` 的快取。BBC 音檔只用節目頁上的
   `downloads.bbc.co.uk/...download.mp3`（podcast RSS 的音檔會插廣告，見 PITFALLS）。
5. 新邏輯要有測試（`unittest`），解析器用 `tests/fixtures/` 裡存下來的小片段 HTML 測，不要在測試裡連網。
6. commit 一律逐檔 `git add <檔案>`，不要 `git add -A`／`git add .`（避免把 `.cache/`、音檔帶進去）。
   message 結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
7. **不要** push、不要建 GitHub repo、不要 `git switch`。
8. 程式風格照周圍的程式碼；註解裡引用 METHOD 條號，例如 `(METHOD §4.5)`。

## 6. 回報格式（最後一則訊息，**60 行以內**）

回報會一直留在主 session 的上下文裡，主 session 之後每一輪都會再讀一次，所以要短。

```
## 結果
commit <hash> · 測試 <通過>/<略過> · 驗收 過／沒過（原因）

## 做了什麼
- <一行一項>

## 實測數字（主 session 會寫進 LEDGER）
- <耗時、matched_ratio、low_confidence 段數…>

## 要寫回 METHOD 的發現
- §<條號>：<發現>

## 整合事項
- <共用檔案>：<要怎麼改>

## 不確定／沒做
- …
```

不要貼大段程式碼、不要重述規格、不要逐一列測試名稱、不要貼整份對照表（寫成檔案，這裡給路徑）。

## 7. 整合

- 這個專案的任務通常只產生新檔案，整合主要是**主 session 把回報裡的發現寫回 METHOD／LEDGER／PITFALLS**，自己做，不派出去。
- 一行就改完的事項由主 session 自己做，一起 commit。
- **每做完一步就 commit**，message 寫明是哪一項（例：`P0-2: BBC 一集時間戳`），被額度切斷時看 `git log` 就知道做到哪。

## 8. 額度與中斷保護

- **派出費時的任務之前**，先在 TODO.md 狀態表把該項改成 🔵，並寫下派了誰、輸出在哪、怎麼判斷做到哪。
- **預估**（一個 5 小時額度 ≈ 依 API 牌價換算 50–55 美元）：sonnet 任務 60–80 輪約 5–8%；130–170 輪 15–28%。
  主 session 調度一整個階段約 10%。開工前先確認剩下的額度夠不夠，不夠就分兩批。
- 主 session 給使用者的進度更新要短，不要把 subagent 的回報整份轉述。
- subagent 和背景指令在跑的時候不要輪詢，完成後會自動通知。

## 9. 分支與 worktree

- 這個 repo 目前只有本機 `main`，沒有 remote；兩個平行任務擁有的檔案不重疊時，可以直接在 `main` 上各自逐檔 commit。
- 需要隔離時，主 session 手動開 `git worktree add .claude/worktrees/<wt> -b <branch>`（放在專案內，
  `.claude/` 要加進 .gitignore），subagent 不用 isolation，直接在指定路徑工作。用完立刻 `git worktree remove`。
