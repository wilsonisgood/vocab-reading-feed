// Pure logic for the browser panel: filters, dedupe key, path collision, mm:ss (V1-3).
import type { StatusFilter, TalkSummary } from "../types";

export type LengthFilter = "all" | "lt10" | "10to20" | "gt20";

export interface BrowserFilter {
  /** "" = all topics. */
  topic: string;
  /** Matched against title and speaker, case-insensitive. */
  keyword: string;
  length: LengthFilter;
  /** Load/read/favorite status (METHOD §3.4). */
  status: StatusFilter;
}

export const EMPTY_FILTER: BrowserFilter = { topic: "", keyword: "", length: "all", status: "all" };

/** Key sets the status filter needs; all keys are `loadedKey(source, id)`. */
export interface StatusContext {
  loaded: ReadonlySet<string>;
  read: ReadonlySet<string>;
  favorites: ReadonlySet<string>;
}

export const EMPTY_CONTEXT: StatusContext = { loaded: new Set(), read: new Set(), favorites: new Set() };

export function matchesStatus(slug: string, status: StatusFilter, ctx: StatusContext): boolean {
  const key = tedKey(slug);
  switch (status) {
    case "all":
      return true;
    case "unloaded":
      return !ctx.loaded.has(key);
    case "unread":
      return ctx.loaded.has(key) && !ctx.read.has(key);
    case "read":
      return ctx.read.has(key);
    case "favorite":
      return ctx.favorites.has(key);
  }
}

/** No-transcript talks (bundled list + found at load time) are not listed at all (METHOD §2.5). */
export function isHidden(slug: string, builtin: ReadonlySet<string>): boolean {
  return builtin.has(slug);
}

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

export function matchesFilter(t: TalkSummary, f: BrowserFilter, ctx: StatusContext = EMPTY_CONTEXT): boolean {
  if (!matchesStatus(t.slug, f.status, ctx)) return false;
  if (f.topic !== "" && !t.topics.includes(f.topic)) return false;
  const kw = f.keyword.trim().toLowerCase();
  if (kw !== "" && !t.title.toLowerCase().includes(kw) && !t.speaker.toLowerCase().includes(kw)) return false;
  return matchesLength(t.duration, f.length);
}

export function filterTalks(
  items: TalkSummary[],
  f: BrowserFilter,
  ctx: StatusContext = EMPTY_CONTEXT,
  hidden: ReadonlySet<string> = new Set(),
): TalkSummary[] {
  return items.filter((t) => !isHidden(t.slug, hidden) && matchesFilter(t, f, ctx));
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
