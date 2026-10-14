// Pure logic for the browser panel: filters, dedupe key, path collision, mm:ss (V1-3).
import type { TalkSummary } from "../types";

export type LengthFilter = "all" | "lt10" | "10to20" | "gt20";

export interface BrowserFilter {
  /** "" = all topics. */
  topic: string;
  /** Matched against title and speaker, case-insensitive. */
  keyword: string;
  length: LengthFilter;
}

export const EMPTY_FILTER: BrowserFilter = { topic: "", keyword: "", length: "all" };

/** Dedupe key for a loaded talk: `<rf-source>:<rf-id>` (METHOD §1). */
export function loadedKey(source: string, id: string): string {
  return `${source}:${id}`;
}

export function tedKey(slug: string): string {
  return loadedKey("ted", slug);
}

/** mm:ss; talks over an hour still show total minutes (e.g. 75:03). */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Boundaries: 600 s belongs to 10-20, 1200 s belongs to 10-20, 1201 s is >20. */
export function matchesLength(duration: number, f: LengthFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "lt10":
      return duration < 600;
    case "10to20":
      return duration >= 600 && duration <= 1200;
    case "gt20":
      return duration > 1200;
  }
}

export function matchesFilter(t: TalkSummary, f: BrowserFilter): boolean {
  if (f.topic !== "" && !t.topics.includes(f.topic)) return false;
  const kw = f.keyword.trim().toLowerCase();
  if (kw !== "" && !t.title.toLowerCase().includes(kw) && !t.speaker.toLowerCase().includes(kw)) return false;
  return matchesLength(t.duration, f.length);
}

export function filterTalks(items: TalkSummary[], f: BrowserFilter): TalkSummary[] {
  return items.filter((t) => matchesFilter(t, f));
}

/** Sorted distinct topics across the loaded pages. */
export function collectTopics(items: TalkSummary[]): string[] {
  return [...new Set(items.flatMap((t) => t.topics))].sort((a, b) => a.localeCompare(b));
}

/** Insert ` (n)` before `.md` until `exists` says the path is free. */
export function uniquePath(path: string, exists: (p: string) => boolean): string {
  if (!exists(path)) return path;
  const base = path.endsWith(".md") ? path.slice(0, -3) : path;
  const ext = path.endsWith(".md") ? ".md" : "";
  for (let n = 2; ; n++) {
    const p = `${base} (${n})${ext}`;
    if (!exists(p)) return p;
  }
}
