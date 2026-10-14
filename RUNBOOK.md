# RUNBOOK — 照什麼順序做

## 每次開工
1. 讀 CLAUDE.md → TODO.md（找第一個 ⬜／🔵）→ 會動到合約就讀 METHOD.md，用新工具前讀 PITFALLS.md。
2. Python 一律 `python3 -I`；裝套件用 `pip3 install`。HTTPS 憑證用 `/etc/ssl/cert.pem`（見 PITFALLS）。
3. 對官網要客氣：逐頁抓的速率 ≤ 1 req/s，所有 HTTP 回應都經過 `.cache/` 快取。

## 一輪從頭到尾
1. `python3 -I tools/survey.py`：更新文章清單（`--refresh` 會忽略快取）。
2. `python3 -I tools/bbc_timings.py --all`：補算還沒處理的集數（P0 之後才有這支）。
3. 看 `data/timings/failed.json`，不通過的人工看過再決定要不要重跑或放棄。
4. commit；push 之前先問使用者（必停點 1）。
