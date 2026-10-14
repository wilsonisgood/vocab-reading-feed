import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatClock, sectionHeading, segmentTalk, sentenceStarts, splitParagraph } from "../../src/core/note/segment";
import { renderNote } from "../../src/core/note/render";
import { parseTimestamps } from "../../src/core/note/parse";
import { parseTalkPage } from "../../src/core/ted/talkPage";
import type { Paragraph } from "../../src/core/types";

const page = parseTalkPage(readFileSync("tests/fixtures/ted/talk-page.html", "utf8"), "paul_bloom_ai_and_the_end_of_loneliness");

describe("sentenceStarts", () => {
  const cut = (t: string) => {
    const s = sentenceStarts(t);
    return s.map((x, i) => t.slice(x, s[i + 1] ?? t.length).trim());
  };
  it("splits on . ? ! with closing quotes", () => {
    expect(cut('He said "Stop." Then left. Why? Because!')).toEqual(['He said "Stop."', "Then left.", "Why?", "Because!"]);
  });
  it("keeps abbreviations, initials and numbers together", () => {
    expect(cut("Mr. Smith met Dr. Jones in the U.S. last year. It cost 3.5 million.")).toEqual([
      "Mr. Smith met Dr. Jones in the U.S. last year.",
      "It cost 3.5 million.",
    ]);
  });
  it("does not split before a lowercase word", () => {
    expect(cut("I said wait... and then nothing.")).toEqual(["I said wait... and then nothing."]);
  });
});

describe("splitParagraph", () => {
  it("joins sentences of 8 words or fewer to the next; short tail joins the previous", () => {
    const p = { text: "", start: 10, cues: [
      { text: "That was it. And those were some of the happiest years", start: 10 },
      { text: "of my life. I woke up to the ocean rocking me every day. Wow.", start: 14 },
    ] };
    p.text = p.cues.map((c) => c.text).join(" ");
    const out = splitParagraph(p, 20);
    expect(out.map((c) => c.text)).toEqual([
      "That was it. And those were some of the happiest years of my life.",
      "I woke up to the ocean rocking me every day. Wow.",
    ]);
    expect(out[0].start).toBe(10);
    // "I woke" sits about 1/5 into the second cue (14 s → 20 s).
    expect(out[1].start).toBeGreaterThan(14);
    expect(out[1].start).toBeLessThan(16);
  });
  it("without cues: one chunk per sentence group, all at the paragraph start", () => {
    const out = splitParagraph({ text: "A short one. Then a much longer sentence follows right after it here.", start: 5 }, null);
    expect(out).toEqual([{ text: "A short one. Then a much longer sentence follows right after it here.", start: 5 }]);
  });
});

describe("segmentTalk on a real talk", () => {
  const sections = segmentTalk(page.paragraphs);
  const chunks = sections.flatMap((s) => s.chunks);
  it("keeps every word, in order", () => {
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(norm(chunks.map((c) => c.text).join(" "))).toBe(norm(page.paragraphs.map((p) => p.text).join(" ")));
  });
  it("times never go backwards and stay inside their TED paragraph", () => {
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].start);
  });
  it("more small paragraphs than TED paragraphs", () => {
    expect(chunks.length).toBeGreaterThan(page.paragraphs.length);
  });
});

/** Synthetic 12-minute talk: a paragraph every 25 s, 4 cues each; every 7th is "(Applause)". */
function fakeTalk(): Paragraph[] {
  const out: Paragraph[] = [];
  for (let i = 0; i < 29; i++) {
    const t0 = i * 25;
    const cues = i % 7 === 6
      ? [{ text: "(Applause)", start: t0 }]
      : [0, 1, 2, 3].map((k) => ({ text: `Sentence ${i}-${k} has quite a few words in it right here.`, start: t0 + k * 6 }));
    out.push({ text: cues.map((c) => c.text).join(" "), start: t0, cues });
  }
  return out;
}

describe("sections on a 12-minute talk", () => {
  const sections = segmentTalk(fakeTalk());
  it("cuts every 2.5–3 min at a TED paragraph boundary, never on applause", () => {
    expect(sections.map((s) => s.start)).toEqual([0, 175, 350, 525]); // 150, 325 and 500 are applause: cut right after it
    for (const s of sections) expect(s.chunks[0].text).not.toBe("(Applause)");
  });
  it("no stub section in the last 45 s", () => {
    const last = sections[sections.length - 1];
    expect(fakeTalk()[28].start - last.start).toBeGreaterThanOrEqual(45);
  });
  it("one small paragraph per long sentence", () => {
    expect(sections[0].chunks.slice(0, 4).map((c) => c.start)).toEqual([0, 6, 12, 18]);
  });
});

describe("headings and render", () => {
  it("clock format", () => {
    expect(formatClock(0.7)).toBe("00:00");
    expect(formatClock(193.4)).toBe("03:13");
    expect(formatClock(3725)).toBe("1:02:05");
  });
  it("heading = clock + first words of the first non-cue paragraph", () => {
    expect(sectionHeading({ start: 193, chunks: [{ text: "(Applause)", start: 193 }, { text: "The truth is, I had never felt this way before.", start: 195 }] }))
      .toBe("03:13 The truth is, I had never felt…");
    expect(sectionHeading({ start: 0, chunks: [{ text: "Thank you.", start: 0 }] })).toBe("00:00 Thank you.");
  });
  it("note has ## headings without timestamps; every small paragraph has one", () => {
    const md = renderNote({ meta: { ...page.meta }, paragraphs: page.paragraphs, audioUrl: "https://x/a.m3u8" });
    const heads = md.split("\n").filter((l) => l.startsWith("## "));
    expect(heads.length).toBe(segmentTalk(page.paragraphs).length);
    expect(heads.every((h) => !h.includes("%%rf:"))).toBe(true);
    expect(parseTimestamps(md).length).toBe(segmentTalk(page.paragraphs).flatMap((s) => s.chunks).length);
    expect(md).toContain("rf-schema: 2");
  });
});
