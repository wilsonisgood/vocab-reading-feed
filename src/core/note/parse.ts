import type { ParagraphTime } from "../types";

const TIMESTAMP = /%%rf:(\d+(?:\.\d+)?)%%\s*$/;

/** Start seconds from a line ending in `%%rf:<sec>%%`, else null (METHOD §1). */
export function parseLineTimestamp(line: string): number | null {
  const m = TIMESTAMP.exec(line);
  return m ? Number(m[1]) : null;
}

/** Nothing but parenthesised stage cues — "(Applause)", "(Laughter) (Music)" — once the marker is gone. */
const CUE_ONLY = /^(?:\([^()]*\)\s*)+$/;

export function isCueLine(line: string): boolean {
  return CUE_ONLY.test(line.replace(TIMESTAMP, "").trim());
}

/**
 * Every timestamp in a note's raw text, with its 0-based line.
 * Skips the frontmatter and fenced code blocks (METHOD §1).
 */
export function parseTimestamps(text: string): ParagraphTime[] {
  const lines = text.split(/\r?\n/);
  const out: ParagraphTime[] = [];
  let i = 0;
  if (lines[0]?.trim() === "---") {
    let end = -1;
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === "---") {
        end = j;
        break;
      }
    }
    if (end >= 0) i = end + 1;
  }
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      const ch = f[1][0];
      if (fence === null) fence = ch;
      else if (fence === ch) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const start = parseLineTimestamp(line);
    if (start === null) continue;
    out.push(isCueLine(line) ? { line: i, start, cue: true } : { line: i, start });
  }
  return out;
}

/** `rf-source` + `rf-id` identify a loaded talk (METHOD §1); both must be non-empty strings. */
export function readRfKey(
  frontmatter: Record<string, unknown> | undefined,
): { source: string; id: string } | null {
  const source = frontmatter?.["rf-source"];
  const id = frontmatter?.["rf-id"];
  if (typeof source !== "string" || source === "" || typeof id !== "string" || id === "") return null;
  return { source, id };
}

/** Paragraph text of each timestamp, marker stripped (for the player's "now reading" line). */
export function timestampTexts(text: string, times: readonly ParagraphTime[]): string[] {
  const lines = text.split(/\r?\n/);
  return times.map((t) => (lines[t.line] ?? "").replace(TIMESTAMP, "").trim());
}
