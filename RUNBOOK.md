# RUNBOOK — 照什麼順序做

## 每次開工
1. 讀 CLAUDE.md → TODO.md（找第一個 ⬜／🔵）→ 動到格式、抓取、同步前讀 METHOD.md；用新工具前讀 PITFALLS.md。
2. 主 session 讀 AGENT.md（派工規則）。

## 開發流程（沿用 Vocab Tracker 的規則）
1. **開分支**：目前只有本機 `main`。每項工作從 `main` 開 `feat/<主題>`；⛔ 不直接在 `main` 上 commit。
   要平行開發就用 worktree，放 `.claude/worktrees/`，`node_modules` 用 symlink 接主目錄的。
2. **開發＋測試**：開發中只跑相關測試（`npx vitest run <路徑>`）；完成時 `npm run check`
  （typecheck → lint → test → build）要全過。
3. **commit**：連同重新 build 的 `main.js`、`styles.css` 一起 commit；逐檔 `git add`。
4. **部署到本機 vault**：先 `pgrep -x Obsidian` 確認 Obsidian 已完全關閉，才把
   `main.js`、`manifest.json`、`styles.css` 複製到 `~/Documents/Obsidian Vault/.obsidian/plugins/reading-feed/`，
   再用 `diff -q` 確認一致。Obsidian 還開著時，在背景等它關閉再部署，不用問使用者。
5. **回報**：commit hash 和分支名。⛔ merge、push、發版都由使用者自己做。

## Python 工具（pipeline/）
- 一律 `python3 -I`；裝套件 `pip3 install`。HTTPS 憑證用 `/etc/ssl/cert.pem`（見 PITFALLS）。
- 對官網要客氣：逐頁抓的速率 ≤ 1 req/s，HTTP 一律經過 `pipeline/tools/survey.py` 的 `get()` 快取。

## 發版（⛔ 只由使用者執行）
- `./release.sh <X.Y.Z|patch|minor|major>`；先 `--dry-run` 看摘要。會 `npm run check` → 改版號 →
  commit → push 分支與 tag → GitHub Actions 發正式 release（附 main.js、manifest.json、styles.css，給 BRAT）。
- 發版前在 `CHANGELOG.md` 寫好 `## [X.Y.Z]` 那一節（release notes 從這裡抓）。
- 版號只用純數字 X.Y.Z、tag 不加 `v`；第一版直接 `./release.sh 0.1.0`。
