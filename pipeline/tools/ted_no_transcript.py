"""列出 TED 上沒有英文逐字稿的 talk（METHOD §2.5），產出插件內建的排除清單。

用法：python3 -I pipeline/tools/ted_no_transcript.py
- 列表走 GraphQL（同插件，METHOD §2.1）；逐篇抓 talk 頁看 transcriptData（METHOD §2.2）。
- talk 頁很大（數百 KB）→ 不進 survey.get() 的快取；改成把每篇判決寫進
  pipeline/data/ted_transcript.jsonl，中斷後重跑會跳過已判過的。
- 速率 ≤ 1 req/s。
- 輸出：src/core/ted/noTranscript.json（只有 slug 清單，不含原文；憲法 1）。
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from survey import SSL_CTX, UA  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
LOG = ROOT / "data" / "ted_transcript.jsonl"
OUT = REPO / "src" / "core" / "ted" / "noTranscript.json"
GQL = "https://www.ted.com/graphql"
NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def fetch(url: str, body: bytes | None = None) -> str:
    headers = {"User-Agent": UA}
    if body is not None:
        headers["content-type"] = "application/json"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ""
            if attempt == 3:
                raise
        except Exception:
            if attempt == 3:
                raise
        time.sleep(5 * (attempt + 1))
    return ""


def all_slugs() -> list[str]:
    slugs, after = [], None
    while True:
        arg = f'after: "{after}", ' if after else ""
        q = f'{{ videos(first: 100, {arg}language: "en") {{ pageInfo {{ endCursor hasNextPage }} nodes {{ slug }} }} }}'
        d = json.loads(fetch(GQL, json.dumps({"query": q}).encode()))["data"]["videos"]
        slugs += [n["slug"] for n in d["nodes"]]
        print(f"list {len(slugs)}", flush=True)
        if not d["pageInfo"]["hasNextPage"]:
            return slugs
        after = d["pageInfo"]["endCursor"]
        time.sleep(1)


def has_transcript(html: str) -> bool | None:
    """True/False；頁面抓不到或解析不了 → None（不列入排除，留給插件執行期判斷）。"""
    m = NEXT.search(html)
    if not m:
        return None
    try:
        props = json.loads(m.group(1))["props"]["pageProps"]
    except (ValueError, KeyError):
        return None
    td = props.get("transcriptData") or {}
    paras = ((td.get("translation") or {}).get("paragraphs")) or []
    return len(paras) > 0


def main() -> None:
    done: dict[str, bool | None] = {}
    if LOG.exists():
        for line in LOG.read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            done[r["slug"]] = r["ok"]
    slugs = all_slugs()
    todo = [s for s in slugs if s not in done]
    print(f"total {len(slugs)} · cached {len(slugs) - len(todo)} · todo {len(todo)}", flush=True)
    with LOG.open("a", encoding="utf-8") as log:
        for i, s in enumerate(todo, 1):
            t0 = time.time()
            ok = has_transcript(fetch(f"https://www.ted.com/talks/{s}"))
            done[s] = ok
            log.write(json.dumps({"slug": s, "ok": ok}) + "\n")
            log.flush()
            if i % 100 == 0:
                print(f"{i}/{len(todo)}", flush=True)
            time.sleep(max(0.0, 1.0 - (time.time() - t0)))
    bad = sorted(s for s in slugs if done.get(s) is False)
    unknown = sum(1 for s in slugs if done.get(s) is None)
    OUT.write_text(json.dumps(bad, indent=0) + "\n", encoding="utf-8")
    print(f"no-transcript {len(bad)} · unknown {unknown} · wrote {OUT.relative_to(REPO)}", flush=True)


if __name__ == "__main__":
    main()
