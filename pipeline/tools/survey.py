#!/usr/bin/env python3
"""盤點 BBC 6 Minute English 與 TED 有多少篇：標題、日期、分類。

輸出：
  data/catalog/{bbc,ted}.json  每篇一筆 {id, title, date, categories, url}
  data/survey.json                 各來源總數、每年篇數、分類篇數

只用標準函式庫。HTTP 回應快取在 .cache/（重跑不會再打網站）。
用法：python3 tools/survey.py [--refresh]
"""
from __future__ import annotations

import gzip
import hashlib
import html
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "http"
OUT = ROOT / "data"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36"
REFRESH = "--refresh" in sys.argv
# python.org 版 Python 不帶 CA 憑證（沒跑 Install Certificates.command）→ 退回 macOS 系統的
_SYS_CA = "/etc/ssl/cert.pem"
SSL_CTX = ssl.create_default_context(cafile=_SYS_CA) if Path(_SYS_CA).exists() else ssl.create_default_context()


def get(url: str) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if f.exists() and not REFRESH:
        return f.read_text(encoding="utf-8")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as r:
                raw = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:  # 分類頁翻過頭會回 404，當成空頁
                return ""
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    text = raw.decode("utf-8", errors="replace")
    f.write_text(text, encoding="utf-8")
    return text


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


# ---------- BBC 6 Minute English：系列首頁一次列完 ----------

BBC = "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english"
BBC_ITEM = re.compile(
    r'<h2>\s*<a\s+href="(/learningenglish/english/features/6-minute-english[_0-9]*/ep-(\d{6}))">([^<]*)</a>\s*</h2>'
    r'\s*<div class="details">\s*<h3>.*?/\s*([0-9]{1,2} \w{3} \d{4})\s*</h3>\s*(?:<p>([^<]*)</p>)?',
    re.S,
)


def survey_bbc() -> list[dict]:
    s = get(BBC)
    out: dict[str, dict] = {}
    for href, ep, title, date, desc in BBC_ITEM.findall(s):
        try:
            d = datetime.strptime(date, "%d %b %Y").date().isoformat()
        except ValueError:
            d = f"20{ep[:2]}-{ep[2:4]}-{ep[4:]}"
        out.setdefault(ep, {"id": f"bbc-6min-{ep}", "title": clean(title), "date": d,
                            "categories": ["6 Minute English"], "summary": clean(desc or ""),
                            "url": "https://www.bbc.co.uk" + href})
    # 首頁置頂那篇的版型不同，regex 抓不到時用網址補
    for href, ep in re.findall(r'href="(/learningenglish/english/features/6-minute-english[_0-9]*/ep-(\d{6}))"', s):
        out.setdefault(ep, {"id": f"bbc-6min-{ep}", "title": "", "date": f"20{ep[:2]}-{ep[2:4]}-{ep[4:]}",
                            "categories": ["6 Minute English"], "summary": "",
                            "url": "https://www.bbc.co.uk" + href})
    return sorted(out.values(), key=lambda e: e["date"], reverse=True)


# ---------- TED：videos sitemap（含標題、發布日、長度；分類要另外抓） ----------

NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "v": "http://www.google.com/schemas/sitemap-video/1.1"}


def survey_ted() -> list[dict]:
    root = ET.fromstring(get("https://www.ted.com/sitemaps/videos.xml.gz"))
    out = []
    for u in root.findall("s:url", NS):
        loc = u.findtext("s:loc", "", NS)
        v = u.find("v:video", NS)
        if v is None:
            continue
        tags = " ".join(t.text or "" for t in v.findall("v:tag", NS))
        out.append({
            "id": "ted-" + loc.rsplit("/", 1)[-1],
            "title": clean(v.findtext("v:title", "", NS)),
            "date": v.findtext("v:publication_date", "", NS)[:10],
            "categories": [],  # topics 不在 sitemap；之後要時從各頁 __NEXT_DATA__ 或 GraphQL 抓
            "duration": int(v.findtext("v:duration", "0", NS) or 0),
            "has_en": "language:en" in tags,
            "url": loc,
        })
    return sorted(out, key=lambda e: e["date"], reverse=True)


# ---------- 彙總 ----------

def summarize(items: list[dict], note: str) -> dict:
    years = Counter(e["date"][:4] for e in items)
    cats = Counter(c for e in items for c in e["categories"])
    s = {
        "total": len(items),
        "newest": items[0]["date"] if items else None,
        "oldest": items[-1]["date"] if items else None,
        "by_year": dict(sorted(years.items(), reverse=True)),
        "by_category": dict(cats.most_common()),
        "latest_5": [{k: e[k] for k in ("date", "title", "url")} for e in items[:5]],
        "note": note,
    }
    if not cats:
        del s["by_category"]
    return s


def main() -> None:
    OUT.joinpath("catalog").mkdir(parents=True, exist_ok=True)
    notes = {
        "bbc": "只算 6 Minute English 系列首頁列出的集數（2017 起）。",
        "ted": "videos sitemap，約落後官網一個月；分類（topics）不在 sitemap 裡，尚未抓。",
    }
    summary = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sources": {}}
    for name, fn in (("bbc", survey_bbc), ("ted", survey_ted)):
        items = fn()
        OUT.joinpath("catalog", f"{name}.json").write_text(
            json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
        summary["sources"][name] = summarize(items, notes[name])
        print(f"{name}: {len(items)}", file=sys.stderr)
    OUT.joinpath("survey.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUT / "survey.json")


if __name__ == "__main__":
    main()
