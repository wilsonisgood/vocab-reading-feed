#!/usr/bin/env python3
"""驗證 TED 的 cue time 是以「帶片頭」還是「不帶片頭」的版本為準（METHOD §2.4）。

每場 talk：
  1. 抓 talk 頁，取前 4 段第一個 cue 的 time（毫秒）。
  2. 不帶 intro_master_id 的 low 音軌前 90 秒 → ffmpeg 轉 16 kHz wav。
  3. mlx-whisper（word_timestamps）轉寫；對每段第一個詞找實際開口時間。
  4. 印出 實際 - cue 的差值。
  5. 另外印出帶／不帶片頭兩版 low media playlist 的 EXTINF 總和差。

結論判讀：差值接近 0 → cue 以不帶片頭版為準（不用扣）；
差值接近 -（EXTINF 差）→ cue 以帶片頭版為準（要扣）。

用法（轉寫要幾分鐘，用 run_in_background）：
  python3 -I pipeline/tools/ted_intro_check.py [slug ...]
需要 pip3 install mlx-whisper；ffmpeg 在 /opt/homebrew/bin/ffmpeg。
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from survey import get  # noqa: E402  (GET、快取、只回 text)

FFMPEG = "/opt/homebrew/bin/ffmpeg"
MODEL = "mlx-community/whisper-large-v3-turbo"
DEFAULT_SLUGS = [
    "paul_bloom_ai_and_the_end_of_loneliness",  # 2026
    "nilay_kulkarni_a_life_saving_invention_that_prevents_human_stampedes",  # 2018
    "anil_gupta_india_s_hidden_hotbeds_of_invention",  # 2010
]


def next_data(slug: str) -> dict:
    html = get(f"https://www.ted.com/talks/{slug}")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise SystemExit(f"{slug}: no __NEXT_DATA__")
    return json.loads(m.group(1))["props"]["pageProps"]


def low_uri(master: str, master_url: str) -> str:
    for line in master.splitlines():
        if line.startswith("#EXT-X-MEDIA:TYPE=AUDIO") and 'NAME="low"' in line:
            return urljoin(master_url, re.search(r'URI="([^"]+)"', line).group(1))
    raise SystemExit("no low audio")


def extinf_sum(text: str) -> float:
    return sum(float(x) for x in re.findall(r"#EXTINF:([\d.]+)", text))


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9']", "", w.lower())


def main() -> None:
    import mlx_whisper  # 沒裝就會在這裡失敗

    slugs = sys.argv[1:] or DEFAULT_SLUGS
    for slug in slugs:
        pp = next_data(slug)
        vd = pp["videoData"]
        paras = pp["transcriptData"]["translation"]["paragraphs"][:4]
        cues = []  # (cue 秒數, 前三個詞)；跳過 (Laughter) 之類的非語音 cue
        for p in paras:
            c = next((c for c in p["cues"] if not c["text"].lstrip().startswith("(")), p["cues"][0])
            cues.append((c["time"] / 1000, [norm(w) for w in c["text"].split()[:3]]))
        hls = vd["hlsUrl"]
        parts = urlsplit(hls)
        plain = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
        master = get(plain)
        time.sleep(1)
        no_intro = low_uri(master, plain)
        with_intro = no_intro + "?intro_master_id=" + re.search(r"intro_master_id=(\d+)", hls).group(1) if "intro_master_id" in hls else None
        s_no = extinf_sum(get(no_intro))
        time.sleep(1)
        s_with = extinf_sum(get(with_intro)) if with_intro else float("nan")
        print(f"\n== {slug} (published {vd['publishedAt'][:10]})")
        print(f"EXTINF 總和  不帶片頭 {s_no:.3f}s · 帶片頭 {s_with:.3f}s · 差 {s_with - s_no:.3f}s")

        with tempfile.TemporaryDirectory() as d:
            wav = str(Path(d) / "a.wav")
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", no_intro, "-t", "90", "-ac", "1", "-ar", "16000", wav], check=True)
            res = mlx_whisper.transcribe(wav, path_or_hf_repo=MODEL, word_timestamps=True, language="en")
        words = [(norm(w["word"]), w["start"]) for seg in res["segments"] for w in seg.get("words", [])]
        for i, (t, first) in enumerate(cues):
            # 三個詞連續相符的候選裡，取離 cue 最近的（單一個詞如 "I" 太常見）
            cand = [words[j][1] for j in range(len(words) - 2) if [words[j + k][0] for k in range(3)] == first]
            if not cand:
                print(f"  para {i}: cue {t:.2f}s '{' '.join(first)}' 找不到")
                continue
            s_ = min(cand, key=lambda x: abs(x - t))
            print(f"  para {i}: cue {t:7.2f}s  實際 {s_:7.2f}s  差 {s_ - t:+.2f}s  ('{' '.join(first)}')")

if __name__ == "__main__":
    main()
