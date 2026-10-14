// Note layout (METHOD §1.1): sections of ~2.5–3 min (headings → fold + outline) made of
// small paragraphs of one or a few sentences, each with its own start time.
// Pure, no obsidian.
import type { Cue, Paragraph } from "../types";
import { isCueLine } from "./parse";

/** A small paragraph: one sentence, or short sentences joined to the next. */
export interface Chunk {
  text: string;
  start: number;
}

export interface Section {
  start: number;
  chunks: Chunk[];
}

/** A sentence of this many words or fewer is joined to the next one. */
export const SHORT_SENTENCE_WORDS = 8;
/** A section ends at the first TED paragraph boundary after this many seconds… */
export const SECTION_MIN_SEC = 150;
/** …or at any small paragraph after this many. */
export const SECTION_MAX_SEC = 180;
/** No new section when less than this is left (avoids a stub at the end). */
export const SECTION_TAIL_SEC = 45;
/** Words of the section's opening shown in its heading. */
export const HEADING_WORDS = 7;
/** Assumed length of a paragraph's last cue when nothing follows it. */
const LAST_CUE_SEC = 3;

const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "jr", "sr", "vs", "prof", "mt", "etc", "e.g", "i.e"]);

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => w !== "").length;
}

/**
 * Offsets where sentences start: after `.?!` (plus closing quotes/brackets) and whitespace,
 * when the next character opens a sentence. Skips "Mr.", "U.S.", "3.5" and the like.
 */
export function sentenceStarts(text: string): number[] {
  const out = [0];
  const re = /[.?!]+["”’'\])]*\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const next = m.index + m[0].length;
    if (next >= text.length) break;
    if (!/["“‘'([A-Z0-9]/.test(text[next])) continue;
    if (text[m.index] === ".") {
      const word = /([A-Za-z.]+)$/.exec(text.slice(0, m.index))?.[1] ?? "";
      if (ABBREVIATIONS.has(word.toLowerCase())) continue;
      if (/^[A-Z]$/.test(word) || /^(?:[A-Za-z]\.)+[A-Za-z]$/.test(word)) continue; // "J. Smith", "U.S."
    }
    out.push(next);
  }
  return out;
}

/** Time at character `offset` of the paragraph, interpolated inside the cue that holds it. */
function timeAt(cues: readonly Cue[], offsets: readonly number[], offset: number, end: number): number {
  let i = 0;
  while (i + 1 < cues.length && offsets[i + 1] <= offset) i++;
  const cueEnd = i + 1 < cues.length ? cues[i + 1].start : end;
  const len = cues[i].text.length;
  const frac = len > 0 ? Math.min(1, Math.max(0, (offset - offsets[i]) / len)) : 0;
  return cues[i].start + frac * Math.max(0, cueEnd - cues[i].start);
}

/**
 * Split one TED paragraph into small paragraphs. Sentences of ≤ SHORT_SENTENCE_WORDS words
 * join the next one (a short last one joins the previous). `nextStart` = next paragraph's
 * start, used as the end of the last cue.
 */
export function splitParagraph(p: Paragraph, nextStart: number | null): Chunk[] {
  const cues = p.cues && p.cues.length > 0 ? p.cues : [{ text: p.text, start: p.start }];
  const text = cues.map((c) => c.text).join(" ");
  const offsets: number[] = [];
  let at = 0;
  for (const c of cues) {
    offsets.push(at);
    at += c.text.length + 1;
  }
  const lastStart = cues[cues.length - 1].start;
  const end = nextStart !== null && nextStart > lastStart ? nextStart : lastStart + LAST_CUE_SEC;

  const starts = sentenceStarts(text);
  const sentences = starts.map((s, i) => ({ from: s, text: text.slice(s, starts[i + 1] ?? text.length).trim() }));
  const groups: { from: number; text: string }[] = [];
  let buf: { from: number; text: string } | null = null;
  for (const s of sentences) {
    buf = buf ? { from: buf.from, text: `${buf.text} ${s.text}` } : { ...s };
    if (wordCount(buf.text) > SHORT_SENTENCE_WORDS) {
      groups.push(buf);
      buf = null;
    }
  }
  if (buf) {
    const prev = groups[groups.length - 1];
    if (prev) prev.text = `${prev.text} ${buf.text}`;
    else groups.push(buf);
  }
  return groups.map((g, i) => ({
    text: g.text,
    start: i === 0 ? p.start : timeAt(cues, offsets, g.from, end),
  }));
}

/** All small paragraphs of a talk, grouped into sections (METHOD §1.1). */
export function segmentTalk(paragraphs: readonly Paragraph[]): Section[] {
  const ps = paragraphs.filter((p) => p.text.trim() !== "");
  const flat: (Chunk & { paraStart: boolean })[] = [];
  ps.forEach((p, i) => {
    splitParagraph(p, ps[i + 1]?.start ?? null).forEach((c, k) => flat.push({ ...c, paraStart: k === 0 }));
  });
  if (flat.length === 0) return [];
  const last = flat[flat.length - 1].start;
  const sections: Section[] = [{ start: flat[0].start, chunks: [] }];
  for (const [i, c] of flat.entries()) {
    const cur = sections[sections.length - 1];
    const elapsed = c.start - cur.start;
    const canCut = i > 0 && !isCueLine(c.text) && last - c.start >= SECTION_TAIL_SEC;
    if (canCut && ((elapsed >= SECTION_MIN_SEC && c.paraStart) || elapsed >= SECTION_MAX_SEC)) {
      sections.push({ start: c.start, chunks: [] });
    }
    sections[sections.length - 1].chunks.push({ text: c.text, start: c.start });
  }
  return sections;
}

/** `m:ss`-style clock, `h:mm:ss` past an hour; minutes always two digits. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Heading text: start time + the opening words of its first real (non-cue) paragraph. */
export function sectionHeading(s: Section): string {
  const first = s.chunks.find((c) => !isCueLine(c.text)) ?? s.chunks[0];
  const words = (first?.text ?? "").split(/\s+/).filter((w) => w !== "");
  const head = words.slice(0, HEADING_WORDS).join(" ");
  const more = words.length > HEADING_WORDS;
  return `${formatClock(s.start)} ${more ? `${head.replace(/[,;:.!?\-–—]+$/, "")}…` : head}`.trim();
}
