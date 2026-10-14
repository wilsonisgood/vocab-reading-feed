// Pure helpers for the floating bar (METHOD §3.1, §3.4): no DOM, no obsidian.
import type { DockPos } from "../../core/types";

export interface NoteRef {
  path: string;
  name: string;
  /** Raw frontmatter `published` (YYYY-MM-DD string, or anything else when malformed). */
  published: unknown;
}

function pubKey(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return typeof v === "string" ? v.slice(0, 10) : "";
}

/** Newest first by `published`; same day by file name; missing dates last. */
export function sortNotes(items: readonly NoteRef[]): NoteRef[] {
  return [...items].sort((a, b) => {
    const pa = pubKey(a.published);
    const pb = pubKey(b.published);
    if (pa !== pb) return pa === "" ? 1 : pb === "" ? -1 : pa < pb ? 1 : -1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** prev = newer (-1), next = older (+1) in the sorted list; null at the ends or if `path` is absent. */
export function neighborNote(items: readonly NoteRef[], path: string, dir: -1 | 1): NoteRef | null {
  const sorted = sortNotes(items);
  const i = sorted.findIndex((n) => n.path === path);
  if (i < 0) return null;
  return sorted[i + dir] ?? null;
}

/** Local-date YYYY-MM-DD for the `rf-read` mark (METHOD §1). */
export function todayString(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Bubble centre (px inside a w×h view) → stored fractions, keeping the whole bubble (radius r) inside. */
export function clampDock(px: number, py: number, w: number, h: number, r: number): DockPos {
  const fx = w > 2 * r ? (Math.min(w - r, Math.max(r, px)) - r) / (w - 2 * r) : 0.5;
  const fy = h > 2 * r ? (Math.min(h - r, Math.max(r, py)) - r) / (h - 2 * r) : 0.5;
  return { x: fx, y: fy };
}

/** Card opens toward the roomier side: leftward when the bubble is on the right half, upward on the lower half. */
export function cardSide(p: DockPos): { left: boolean; up: boolean } {
  return { left: p.x >= 0.5, up: p.y >= 0.5 };
}
