import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTimestamps, readRfKey, timestampTexts } from "../../src/core/note/parse";
import { isHlsUrl } from "../../src/core/audio";

// Hand-written book chapter note (METHOD §1.2); the audio URL is fake.
const text = readFileSync(new URL("../fixtures/book/17 SEVENTEEN.md", import.meta.url), "utf8");

/** Just enough YAML for this fixture's flat frontmatter. */
function frontmatter(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = src.split("\n");
  for (let i = 1; lines[i] !== "---"; i++) {
    const m = /^([\w-]+):\s*(.*)$/.exec(lines[i]);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

describe("book chapter note (METHOD §1.2)", () => {
  const fm = frontmatter(text);
  it("is a loaded rf note keyed book:<id>", () => {
    expect(readRfKey(fm)).toEqual({ source: "book", id: "androids-ch17" });
  });
  it("audio is a plain m4a, not HLS", () => {
    expect(fm["rf-audio"]).toBe("https://audio.example.test/fake-secret/androids/ch17.m4a");
    expect(isHlsUrl(fm["rf-audio"] as string)).toBe(false);
  });
  it("small paragraphs carry timestamps; headings and the Source line do not", () => {
    const times = parseTimestamps(text);
    expect(times.map((t) => t.start)).toEqual([0.8, 5.4, 12.1, 161.25, 166.9]);
    expect(times[2].cue).toBe(true);
    const lines = text.split("\n");
    expect(times.every((t) => !lines[t.line].startsWith("#"))).toBe(true);
    expect(timestampTexts(text, times)[3]).toBe("The phone rang and he answered it, still holding the cup.");
  });
});
