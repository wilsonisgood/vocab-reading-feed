import { describe, expect, it } from "vitest";
import { findIndex, followReducer, shouldFollow, showResume, stopTimeFor, type FollowState } from "../../src/services/player/logic";

const times = [
  { line: 0, start: 0.7 },
  { line: 2, start: 16.2 },
  { line: 4, start: 30 },
];

describe("findIndex", () => {
  it("empty table -> -1", () => expect(findIndex([], 5)).toBe(-1));
  it("before first -> -1", () => expect(findIndex(times, 0.5)).toBe(-1));
  it("t == start picks that paragraph", () => {
    expect(findIndex(times, 0.7)).toBe(0);
    expect(findIndex(times, 16.2)).toBe(1);
  });
  it("between picks the earlier", () => expect(findIndex(times, 29.99)).toBe(1));
  it("past the last stays on last", () => expect(findIndex(times, 9999)).toBe(2));
});

describe("stopTimeFor", () => {
  it("next start", () => expect(stopTimeFor(times, 0)).toBe(16.2));
  it("last -> null", () => expect(stopTimeFor(times, 2)).toBeNull());
  it("out of range -> null", () => {
    expect(stopTimeFor(times, -1)).toBeNull();
    expect(stopTimeFor(times, 7)).toBeNull();
  });
});

describe("follow state machine", () => {
  const on: FollowState = { enabled: true, suspended: false };
  it("manual scroll suspends", () => {
    const s = followReducer(on, "userScroll");
    expect(shouldFollow(s)).toBe(false);
    expect(showResume(s)).toBe(true);
  });
  it("resume restores", () => {
    expect(shouldFollow(followReducer(followReducer(on, "userScroll"), "resume"))).toBe(true);
  });
  it("next paragraph restores", () => {
    expect(shouldFollow(followReducer(followReducer(on, "userScroll"), "indexChanged"))).toBe(true);
  });
  it("disabled never follows nor shows resume", () => {
    const off = followReducer(on, "disable");
    expect(shouldFollow(off)).toBe(false);
    expect(showResume(followReducer(off, "userScroll"))).toBe(false);
  });
  it("returns same object when nothing changes", () => {
    expect(followReducer(on, "resume")).toBe(on);
  });
});
