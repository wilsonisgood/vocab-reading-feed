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
| 實作一個模組並附測試 | 派 subagent |
| 跑批次（轉寫、下載、之後 BBC 的 494 集） | **主 session 用 `run_in_background` 跑腳本**，完成時會自動通知；不派 subagent |
| 查「某個東西在哪」，一句話答得完 | 主 session 用 grep |
| 剛回報的 subagent 有小地方要修 | 用 `SendMessage` 叫原本那個接著修；它的上下文已經很大（超過 100 輪）就改開新的，prompt 只寫要修的點 |
| 驗證 subagent 的成果 | **相信測試和驗收腳本的輸出**。只抽查它自己點名的風險，不要整份 diff 重讀 |

## 2. 選 model

| model | 用在 | 例子 |
|---|---|---|
| `haiku` | 純機械性工作，**不需要判斷哪些內容還有效** | 批次改名、照固定格式搬清單、清 worktree |
| `sonnet`（**預設**） | 一般實作、寫測試、寫解析器、UI | V1-1～V1-4 |
| `opus` | sonnet 已經失敗一次，或是跨模組的難題 | 閱讀模式虛擬化下的跟隨捲動、iOS 播放怪問題 |

主 session 本身是 Opus，「需要判斷」的事（改 METHOD 合約、決定驗收門檻、看結果要不要停下來問使用者）
留在主 session 做。

> 2026-10-06 的教訓：要對照規格取捨的文件工作交給 haiku，它混進了舊行為、漏了一半項目。
> **要對照規格取捨的事，交給 sonnet 或主 session 自己做。**

## 3. 怎麼拆任務

- **大小**：一個任務預估 **40–80 輪**。超過 120 輪要拆；太小（< 15 輪）就併進別的任務，或是主 session 自己做。
- **地基先做**：好幾個任務都會用到的東西（例：共用型別 `src/core/types.ts`、網路 port）先做，
  通常主 session 自己做就好，其他任務直接 import。
- **檔案不重疊**：每個任務列出「擁有」的檔案；共用檔案（§5b-2）走整合事項。
- **平行**：互相不依賴的任務同時在背景跑。平行不會多花錢，花錢的是總輪數。

### v1 的建議分法（參考）
| 任務 | 誰做 | 擁有 |
|---|---|---|
| V1-0 插件骨架（地基，先做） | 主 session | 設定檔、`main.ts`、`src/core/types.ts` |
| V1-1 TED client + 片頭驗證 | sonnet，背景 | `src/core/ted/`、`src/services/ted/`、`tests/ted/`、`tests/fixtures/ted/`、`pipeline/tools/ted_intro_check.py` |
| V1-2 md 產生器／解析器 | sonnet，背景，跟 V1-1 平行 | `src/core/note/`、`tests/note/` |
| V1-4 播放器與同步 | sonnet，V1-2 交回後 | `src/services/player/`、`src/ui/reading/`、`src/styles/reading.css`、`tests/player/` |
| V1-3 文章瀏覽面板 | sonnet，V1-1／V1-2 交回後 | `src/ui/browser/`、`src/ui/settings/`、`src/styles/browser.css` |
| V1-5 實機驗證 | 主 session（需要使用者配合 iPhone） | — |

`main.ts` 接線、METHOD／LEDGER 寫回，由主 session 根據回報來做。
V1-0 要先把 `Talk`、`TalkSummary`、`ParagraphTime` 等共用型別寫死在 `src/core/types.ts`，平行任務才不會各寫一套。

## 4. 主 session 寫 prompt 的規則

**目標是讓 subagent 不用自己去探索。** 探索就是輪數，輪數就是上下文。

1. **規格只給相關的條號，原文直接貼進 prompt**（例：METHOD §1 BBC、§2、§4）。不要叫它讀整份 METHOD 或 TODO。
2. **給精確的位置**：要沿用哪個既有函式或型別（例：`src/core/types.ts`）、網址格式、JSON 欄位路徑。
3. **介面約定寫死**：函式簽名、輸出檔路徑和格式。
4. **完成條件要明確**：哪些測試要過、驗收腳本要印出什麼。
5. 結尾附上 §5 的規則（或叫它先讀 `/Users/will/obsidian-plugin/vocab-reading-feed/AGENT.md` §5–§6）。

### prompt 骨架

```
你是 <階段> 任務 X（<一句話主題>）。用繁體中文回報。
工作目錄：/Users/will/obsidian-plugin/vocab-reading-feed/.claude/worktrees/<wt>（分支 <branch>，從 <commit> 開）
開工先讀：/Users/will/obsidian-plugin/vocab-reading-feed/AGENT.md 的 §5、§6

## 規格（原文）
<只貼這個任務相關的 METHOD 條號＋原文>

## 擁有（只能改這些）
<檔案清單>

## 已知的位置
- 沿用 src/core/types.ts 的型別，不要另寫一套
- <網址格式、JSON 欄位路徑、已知的坑>

## 介面約定
<函式簽名、輸出路徑與格式>

## 完成條件
- <要有的測試>
- npm run check 全過
```

## 5. subagent 必守規則（每個 prompt 都要帶）

### 5a. 省 token

1. **能一起發的工具呼叫就一次發**：一次讀好幾個檔案、一次跑好幾個 grep。
2. **大檔案不要整份讀**：先 `grep -n` 找位置再讀那一段。⛔ 不要 cat 整份網頁 HTML、`pipeline/data/catalog/*.json`、
   whisper 的完整輸出；用 python 抽出需要的欄位，或是 `head -c`。同一個檔案讀過就不要再讀，改完也不用重讀確認。
3. **開發過程只跑相關的測試**：`npx vitest run <路徑>`。`npm run check` 只在**最後跑一次**；沒過就修，修完再跑一次。
4. **把長輸出截短**：`npm run check 2>&1 | tail -40`；`git diff --stat`，不要整份 diff。
5. **不要去探索 prompt 沒提到的地方**。不清楚就照最合理的理解做，寫進回報的「不確定」。
6. **同一個錯誤修了兩次還沒好，就停下來**，把現象和猜測寫進回報，交回主 session。
7. **跑超過 100 輪就交回**：把做到哪、還剩什麼寫進回報。
8. **超過 2 分鐘的指令（轉寫、批次下載）用 `run_in_background`**，不要前景等、不要用 sleep 輪詢。
9. **驗證要精簡**：只抽查必要的樣本、跑一次就好，不做全排列、不重複跑。

### 5b. 專案規則

1. **憲法**：⛔ 不重新發布音檔、不把原文放進 repo。測試 fixture 只留需要的欄位、短片段（幾段 transcript 就夠）。
2. **分層**：`src/core` 不 import obsidian；`src/services` 只透過 ports 存取外部（網路走 `requestUrl` 的 port），
   不能 import `src/ui/**`。ESLint 會擋。
3. **只改自己「擁有」的檔案。** 共用檔案不要自己改，寫進整合事項並附上可以直接貼上的片段。共用檔案：
   - `CLAUDE.md`、`METHOD.md`、`LEDGER.md`、`TODO.md`、`PITFALLS.md`、`RUNBOOK.md`、`AGENT.md`
   - `main.ts`、`src/core/types.ts`、`src/styles/index.css`（要新 CSS 就自己開新檔）、`main.js`、`styles.css`
   - `package.json`（要加依賴寫進整合事項）
4. **名稱前綴**：CSS class、DOM data 屬性、frontmatter key、指令 id 一律 `rf-`／`reading-feed:`，避免跟 Vocab Tracker 撞名。
5. 新邏輯要有測試（vitest，node 環境沒有 DOM）；純邏輯抽成可單獨測的函式。解析器用 `tests/fixtures/` 測，⛔ 測試不連網。
6. worktree 裡的 `node_modules` 是 symlink，**絕不能 commit**。commit 一律逐檔 `git add <檔案>`；
   build 會改到 `main.js`、`styles.css`，commit 前先 `git checkout -- main.js styles.css`。
   message 格式照 `git log`（例：`feat: V1-1 — TED GraphQL 列表`），結尾空一行加
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
7. **不要** push、merge、動 `main`、`git switch`，也不要 cd 到別的 worktree 改東西。**不要部署到 vault。**
8. Python（`pipeline/`）：只用 `python3 -I`、裝套件用 `pip3 install`（⛔ 這台沒有 `python`／`pip`）；
   HTTP 經過 `pipeline/tools/survey.py` 的 `get()` 快取，速率 ≤ 1 req/s。
9. 程式風格照周圍的程式碼；英文註解裡引用 METHOD 條號，例如 `(METHOD §3.3)`。

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

- 整合 = 主 session merge 各任務分支、照整合事項改共用檔案（`main.ts` 接線等），並把回報裡的發現寫回 METHOD／LEDGER／PITFALLS。
  一次只整合一個分支或最多 5 條整合事項；條目多就派一個 sonnet 整合，做完一批再派下一批。
- 一行就改完的事項由主 session 自己做，一起 commit。
- **每做完一步就 commit**，message 寫明是哪一項（例：`P0-2: BBC 一集時間戳`），被額度切斷時看 `git log` 就知道做到哪。

## 8. 額度與中斷保護

- **派出費時的任務之前**，先在 TODO.md 狀態表把該項改成 🔵，並寫下派了誰、輸出在哪、怎麼判斷做到哪。
- **預估**（一個 5 小時額度 ≈ 依 API 牌價換算 50–55 美元）：sonnet 任務 60–80 輪約 5–8%；130–170 輪 15–28%。
  主 session 調度一整個階段約 10%。開工前先確認剩下的額度夠不夠，不夠就分兩批。
- 主 session 給使用者的進度更新要短，不要把 subagent 的回報整份轉述。
- subagent 和背景指令在跑的時候不要輪詢，完成後會自動通知。

## 9. 分支與 worktree

- 這個 repo 目前只有本機 `main`，沒有 remote。每個平行任務一個 worktree：主 session 手動開
  `git worktree add .claude/worktrees/<wt> -b feat/<主題> <base-commit>`，再
  `ln -s /Users/will/obsidian-plugin/vocab-reading-feed/node_modules .claude/worktrees/<wt>/node_modules`。
  ⛔ 不用 Agent 工具的 `isolation: "worktree"`；subagent 直接在指定路徑工作。
- 整合由主 session 在一個整合分支上 merge 各任務分支，跑 `npm run check`，再 commit 重新 build 的 `main.js`。
- 確認不再需要後立刻 `git worktree remove`（分支保留）。

## 10. 使用者回報 → 批次釐清（2026-10-14 訂）

使用者的實機回報放在 `docs/feature/<MMDD>-report.md`（口語、一次好幾項）。主 session 收到後：

1. **先對過程式碼再問**：查得出原因的（bug、現有行為）不問，列在「已查明，直接修」並附一句原因。
2. **要使用者決定的才列成問題**，寫在同一份報告的最後面（`## 釐清（日期）`），⛔ 不在對話裡一題一題問。
   每題的格式：
   - 標題寫成一句話的問題，編號 Q1、Q2…（使用者回覆時用編號對應）
   - 列出選項 (a)(b)(c)；做不到或會碰到必停點的，直接寫明原因
   - 「建議：」主 session 的預設
   - 「回覆：」留空給使用者填；**空著 = 照建議做**
3. 使用者填完回覆後一次讀回，把定案的需求寫進 TODO（新項目），規則改動寫進 METHOD；
   報告檔本身是討論紀錄，不當規格引用。
4. 「已查明」的 bug 不用等回覆，可以先修。
