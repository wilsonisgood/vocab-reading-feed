import { describe, expect, it } from "vitest";
import {
  SESSION_GAP_MS,
  canContinue,
  groupHistory,
  isThisWeek,
  rangeLabel,
  removePath,
  renamePath,
  snippetOf,
  spanLabel,
  startRecord,
  touchRecord,
  whenLabel,
} from "../../src/core/history/logic";
import type { PlayRecord } from "../../src/core/types";

const rec = (start: number, end = start, lo = 0, hi = lo): PlayRecord => ({ start, end, lo, hi, last: hi, snippet: "" });
// Sunday 2026-10-25 21:30 local; the week starts Monday 10-19.
const NOW = new Date(2026, 9, 25, 21, 30).getTime();
const at = (m: number, d: number, h = 9, min = 0, y = 2026) => new Date(y, m - 1, d, h, min).getTime();

describe("records", () => {
  it("keeps the newest three per note", () => {
    const h: Record<string, PlayRecord[]> = {};
    for (let i = 0; i < 5; i++) startRecord(h, "a.md", i, i, "");
    expect(h["a.md"].map((r) => r.start)).toEqual([4, 3, 2]);
  });

  it("touch widens the range and moves the resume point", () => {
    const r = startRecord({}, "a.md", 0, -1, "");
    touchRecord(r, 10, 5, "five");
    touchRecord(r, 20, 3, "three");
    touchRecord(r, 30, -1, "ignored");
    expect(r).toMatchObject({ lo: 3, hi: 5, last: 3, end: 30, snippet: "three" });
  });

  it("continues only within the gap", () => {
    const r = rec(0, 1000);
    expect(canContinue(r, 1000 + SESSION_GAP_MS)).toBe(true);
    expect(canContinue(r, 1001 + SESSION_GAP_MS)).toBe(false);
    expect(canContinue(undefined, 0)).toBe(false);
  });
});

describe("paths", () => {
  it("renames a note and a folder's notes", () => {
    const h = { "A/x.md": [rec(1)], "A/B/y.md": [rec(2)], "AB/z.md": [rec(3)] };
    expect(renamePath(h, "A/x.md", "A/w.md")).toBe(true);
    expect(renamePath(h, "A", "C")).toBe(true);
    expect(Object.keys(h).sort()).toEqual(["AB/z.md", "C/B/y.md", "C/w.md"]);
  });

  it("removes a note or a folder", () => {
    const h = { "A/x.md": [rec(1)], "A/B/y.md": [rec(2)], "AB/z.md": [rec(3)] };
    expect(removePath(h, "A")).toBe(true);
    expect(Object.keys(h)).toEqual(["AB/z.md"]);
    expect(removePath(h, "nope.md")).toBe(false);
  });
});

describe("groupHistory", () => {
  it("sorts folders and notes by newest activity", () => {
    const g = groupHistory({
      "TED/a.md": [rec(5, 10)],
      "TED/b.md": [rec(1, 50)],
      "Books/c.md": [rec(30, 30)],
      "d.md": [rec(1, 2)],
    });
    expect(g.map((f) => [f.label, f.last])).toEqual([["TED", 50], ["Books", 30], ["（根目錄）", 2]]);
    expect(g[0].notes.map((n) => n.path)).toEqual(["TED/b.md", "TED/a.md"]);
  });

  it("shows full paths when folder names clash", () => {
    const g = groupHistory({ "X/TED/a.md": [rec(2)], "Y/TED/b.md": [rec(1)] });
    expect(g.map((f) => f.label)).toEqual(["X/TED", "Y/TED"]);
  });
});

describe("labels", () => {
  it("formats relative to now", () => {
    expect(whenLabel(at(10, 25, 8, 5), NOW)).toBe("今天 08:05");
    expect(whenLabel(at(10, 24, 21, 13), NOW)).toBe("昨天 21:13");
    expect(whenLabel(at(10, 21, 7, 0), NOW)).toBe("週三 07:00");
    expect(whenLabel(at(10, 18, 7, 0), NOW)).toBe("10/18 07:00");
    expect(whenLabel(at(12, 31, 7, 0, 2025), NOW)).toBe("2025/12/31");
  });

  it("this week starts Monday", () => {
    expect(isThisWeek(at(10, 19, 0, 0), NOW)).toBe(true);
    expect(isThisWeek(at(10, 18, 23, 59), NOW)).toBe(false);
  });

  it("span adds the end time for sessions of a minute or more", () => {
    expect(spanLabel(rec(at(10, 25, 21, 0), at(10, 25, 21, 20)), NOW)).toBe("今天 21:00–21:20");
    expect(spanLabel(rec(at(10, 25, 21, 0), at(10, 25, 21, 0)), NOW)).toBe("今天 21:00");
  });

  it("range is 1-based", () => {
    expect(rangeLabel(rec(0, 0, 2, 11))).toBe("第 3–12 段");
    expect(rangeLabel(rec(0, 0, 4))).toBe("第 5 段");
    expect(rangeLabel(rec(0, 0, -1))).toBe("");
  });

  it("snippet cuts at a word", () => {
    expect(snippetOf("  short  text ")).toBe("short text");
    expect(snippetOf("So when we think about the future of cities, we", 30)).toBe("So when we think about the…");
  });
});
