// Play history (METHOD §3.5): pure helpers — no DOM, no obsidian. Records are mutated in place,
// like the rest of the settings object.
import { HISTORY_PER_NOTE, type PlayRecord } from "../types";

/** A pause shorter than this continues the same session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

const SNIPPET_MAX = 60;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** True when `rec` (the note's newest record) may be extended by a play at `now`. */
export function canContinue(rec: PlayRecord | undefined, now: number): rec is PlayRecord {
  return rec !== undefined && now >= rec.end && now - rec.end <= SESSION_GAP_MS;
}

/** Push a fresh record for `path` (newest first), dropping the oldest beyond `HISTORY_PER_NOTE`. */
export function startRecord(hist: Record<string, PlayRecord[]>, path: string, now: number, idx: number, snippet: string): PlayRecord {
  const rec: PlayRecord = { start: now, end: now, lo: idx, hi: idx, last: idx, snippet };
  const list = (hist[path] ??= []);
  list.unshift(rec);
  list.length = Math.min(list.length, HISTORY_PER_NOTE);
  return rec;
}

/** The session is still playing at `now`, at paragraph `idx` (-1 = before the first timestamp). */
export function touchRecord(rec: PlayRecord, now: number, idx: number, snippet: string): void {
  rec.end = Math.max(rec.end, now);
  if (idx < 0) return;
  rec.lo = rec.lo < 0 ? idx : Math.min(rec.lo, idx);
  rec.hi = Math.max(rec.hi, idx);
  rec.last = idx;
  rec.snippet = snippet;
}

/** Follow a renamed note or folder (every note under `oldPath/`). True if anything moved. */
export function renamePath(hist: Record<string, PlayRecord[]>, oldPath: string, newPath: string): boolean {
  let moved = false;
  for (const key of Object.keys(hist)) {
    let next: string | null = null;
    if (key === oldPath) next = newPath;
    else if (key.startsWith(`${oldPath}/`)) next = newPath + key.slice(oldPath.length);
    if (next === null || next === key) continue;
    hist[next] = hist[key];
    delete hist[key];
    moved = true;
  }
  return moved;
}

/** Forget a deleted note or folder. True if anything was removed. */
export function removePath(hist: Record<string, PlayRecord[]>, path: string): boolean {
  let removed = false;
  for (const key of Object.keys(hist)) {
    if (key === path || key.startsWith(`${path}/`)) {
      delete hist[key];
      removed = true;
    }
  }
  return removed;
}

/** Opening words of a paragraph, cut at a word boundary. */
export function snippetOf(text: string, max = SNIPPET_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

export interface HistoryNote {
  path: string;
  /** Newest activity in this note (ms). */
  last: number;
  records: PlayRecord[];
}

export interface HistoryFolder {
  /** Vault folder path; "" = vault root. */
  folder: string;
  /** Folder name; the full path when two folders share a name. */
  label: string;
  /** Newest activity in the folder (ms). */
  last: number;
  notes: HistoryNote[];
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function nameOf(folder: string): string {
  return folder === "" ? "（根目錄）" : folder.slice(folder.lastIndexOf("/") + 1);
}

/** Folders newest first; notes inside newest first; records already newest first. */
export function groupHistory(hist: Record<string, PlayRecord[]>): HistoryFolder[] {
  const byFolder = new Map<string, HistoryNote[]>();
  for (const [path, records] of Object.entries(hist)) {
    if (records.length === 0) continue;
    const note = { path, last: Math.max(...records.map((r) => r.end)), records };
    const folder = parentOf(path);
    const list = byFolder.get(folder) ?? [];
    list.push(note);
    byFolder.set(folder, list);
  }
  const folders = [...byFolder].map(([folder, notes]) => {
    notes.sort((a, b) => b.last - a.last);
    return { folder, label: nameOf(folder), last: notes[0].last, notes };
  });
  const dup = new Map<string, number>();
  for (const f of folders) dup.set(f.label, (dup.get(f.label) ?? 0) + 1);
  for (const f of folders) if ((dup.get(f.label) ?? 0) > 1 && f.folder !== "") f.label = f.folder;
  return folders.sort((a, b) => b.last - a.last);
}

function midnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Monday 00:00 of the week holding `now` (local time). */
function weekStart(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

/** Same calendar week (Monday-based, local time) as `now`. */
export function isThisWeek(ms: number, now: number): boolean {
  return ms >= weekStart(now) && ms <= now + 60_000;
}

function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 今天 21:13 · 昨天 21:13 · 週三 21:13 (this week) · 10/12 21:13 · 2025/10/12 (another year). */
export function whenLabel(ms: number, now: number): string {
  const d = new Date(ms);
  const n = new Date(now);
  const day = midnight(d);
  if (day === midnight(n)) return `今天 ${hm(d)}`;
  if (day === new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1).getTime()) return `昨天 ${hm(d)}`;
  if (isThisWeek(ms, now)) return `週${WEEKDAYS[d.getDay()]} ${hm(d)}`;
  if (d.getFullYear() === new Date(now).getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${hm(d)}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** When a record ran: its start, plus the end time when it lasted a minute or more on the same day. */
export function spanLabel(r: PlayRecord, now: number): string {
  const head = whenLabel(r.start, now);
  const s = new Date(r.start);
  const e = new Date(r.end);
  const sameDay = midnight(s) === midnight(e);
  return sameDay && r.end - r.start >= 60_000 && head.includes(":") ? `${head}–${hm(e)}` : head;
}

/** "第 3 段" / "第 3–12 段" (1-based); "" when no paragraph was reached. */
export function rangeLabel(r: PlayRecord): string {
  if (r.lo < 0) return "";
  return r.lo === r.hi ? `第 ${r.lo + 1} 段` : `第 ${r.lo + 1}–${r.hi + 1} 段`;
}
