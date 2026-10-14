// Pure player logic (METHOD §3.2, §3.3): no DOM, no obsidian.
import type { ParagraphTime } from "../../core/types";

/**
 * Index of the last paragraph with start <= t; -1 before the first one
 * (or for an empty table). Binary search (METHOD §3.3).
 */
export function findIndex(times: readonly ParagraphTime[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Where "only this paragraph" mode pauses: next paragraph's start; null for the last (METHOD §3.2). */
export function stopTimeFor(times: readonly ParagraphTime[], index: number): number | null {
  if (index < 0 || index + 1 >= times.length) return null;
  return times[index + 1].start;
}

/**
 * Follow-scroll state (METHOD §3.3). `enabled` is the user's switch;
 * `suspended` is set by manual scrolling and cleared by "back to reading
 * position" or by moving on to the next paragraph.
 */
export interface FollowState {
  enabled: boolean;
  suspended: boolean;
}

export type FollowEvent = "userScroll" | "resume" | "indexChanged" | "enable" | "disable";

export function followReducer(s: FollowState, e: FollowEvent): FollowState {
  switch (e) {
    case "userScroll":
      return s.suspended ? s : { ...s, suspended: true };
    case "resume":
    case "indexChanged":
      return s.suspended ? { ...s, suspended: false } : s;
    case "enable":
      return { enabled: true, suspended: false };
    case "disable":
      return { enabled: false, suspended: false };
  }
}

/** Should the view scroll to the active paragraph now? */
export function shouldFollow(s: FollowState): boolean {
  return s.enabled && !s.suspended;
}

/** Show the "back to reading position" button? */
export function showResume(s: FollowState): boolean {
  return s.enabled && s.suspended;
}

/** Paragraph to move to for prev (-1) / next (+1); clamped; -1 when the table is empty (METHOD §3.1). */
export function stepIndex(cur: number, count: number, dir: -1 | 1): number {
  if (count <= 0) return -1;
  if (cur < 0) return 0;
  return Math.min(count - 1, Math.max(0, cur + dir));
}
