#!/usr/bin/env python3
"""驗證小段時間戳（METHOD §1.1）：句子從字幕行中間開始時，時間是用字元位置內插估的，實際準不準。

每場 talk：
  1. 抓 talk 頁（survey.get 快取）→ 用插件自己的 TS（pipeline/tools/ted_chunks.mjs）切出小段與時間。
  2. 不帶片頭的 low 音軌整篇 → ffmpeg 16 kHz wav → mlx-whisper word_timestamps。
  3. 每個小段取前三個詞，在 whisper 詞序列裡找連續相符、離估計時間最近的位置。
  4. 印出「實際 − 估計」：分「段首（TED 原段落開頭，直接用 cue time）」與「內插」兩組統計。
     負值 = 估計偏晚（會吃掉開頭幾個字，較糟）；正值 = 偏早（先聽到前一句尾巴）。

用法（整篇轉寫數分鐘，用 run_in_background）：
  python3 -I pipeline/tools/ted_chunk_check.py [slug ...]
需要 pip3 install mlx-whisper；ffmpeg 在 /opt/homebrew/bin/ffmpeg；node + 本 repo 的 node_modules（esbuild）。
"""
from __future__ import annotations

import json
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from survey import get  # noqa: E402
from ted_intro_check import FFMPEG, MODEL, low_uri, next_data, norm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SLUGS = ["paul_bloom_ai_and_the_end_of_loneliness"]


def chunks_for(slug: str) -> list[dict]:
    html = get(f"https://www.ted.com/talks/{slug}")
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html)
    out = subprocess.run(["node", str(ROOT / "pipeline/tools/ted_chunks.mjs"), f.name, slug],
                         check=True, capture_output=True, text=True, cwd=ROOT).stdout
    Path(f.name).unlink()
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def stats(name: str, diffs: list[float]) -> None:
    if not diffs:
        print(f"  {name}: 無")
        return
    a = sorted(abs(d) for d in diffs)
    late = sum(1 for d in diffs if d < -0.5)
    print(f"  {name}: n={len(diffs)}  |差| 中位數 {statistics.median(a):.2f}s  p90 {a[int(0.9 * (len(a) - 1))]:.2f}s"
          f"  最大 {a[-1]:.2f}s  偏晚>0.5s {late} 個")


def main() -> None:
    import mlx_whisper

    for slug in sys.argv[1:] or DEFAULT_SLUGS:
        chunks = chunks_for(slug)
        hls = next_data(slug)["videoData"]["hlsUrl"].split("?")[0]
        audio = low_uri(get(hls), hls)
        time.sleep(1)
        with tempfile.TemporaryDirectory() as d:
            wav = str(Path(d) / "a.wav")
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", audio, "-ac", "1", "-ar", "16000", wav], check=True)
            res = mlx_whisper.transcribe(wav, path_or_hf_repo=MODEL, word_timestamps=True, language="en")
        words = [(norm(w["word"]), w["start"]) for seg in res["segments"] for w in seg.get("words", [])]
        print(f"\n== {slug}: {len(chunks)} 小段、{1 + max(c['section'] for c in chunks)} 大段、whisper {len(words)} 詞")
        head, interp, missing = [], [], 0
        for c in chunks:
            first = [norm(w) for w in c["text"].split()[:3]]
            if c["text"].startswith("(") or len(first) < 3:
                continue
            cand = [words[j][1] for j in range(len(words) - 2) if [words[j + k][0] for k in range(3)] == first]
            near = [x for x in cand if abs(x - c["start"]) < 15]
            if not near:
                missing += 1
                continue
            d = min(near, key=lambda x: abs(x - c["start"])) - c["start"]
            (head if c["paraStart"] else interp).append(d)
        stats("段首（cue time）", head)
        stats("內插", interp)
        print(f"  比對不到 {missing} 個")


if __name__ == "__main__":
    main()
