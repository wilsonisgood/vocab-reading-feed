import { describe, expect, it } from "vitest";
import { afterEndNote, cardSide, clampDock, neighborNote, sortNotes, todayString } from "../../src/ui/reading/logic";

const n = (name: string, published: unknown) => ({ path: `d/${name}`, name, published });

describe("sortNotes / neighborNote", () => {
  const items = [n("b.md", "2024-01-02"), n("a.md", "2024-01-02"), n("c.md", "2025-05-05"), n("z.md", undefined)];
  it("newest first, same day by name, undated last", () => {
    expect(sortNotes(items).map((x) => x.name)).toEqual(["c.md", "a.md", "b.md", "z.md"]);
  });
  it("prev = newer, next = older, null at ends", () => {
    expect(neighborNote(items, "d/a.md", 1)?.name).toBe("b.md");
    expect(neighborNote(items, "d/a.md", -1)?.name).toBe("c.md");
    expect(neighborNote(items, "d/c.md", -1)).toBeNull();
    expect(neighborNote(items, "d/z.md", 1)).toBeNull();
    expect(neighborNote(items, "d/nope.md", 1)).toBeNull();
  });
  it("accepts Date values", () => {
    const r = sortNotes([n("o.md", "2020-01-01"), n("d.md", new Date("2021-01-01T00:00:00Z"))]);
    expect(r[0].name).toBe("d.md");
  });
});

describe("afterEndNote", () => {
  const items = [n("b.md", "2024-01-02"), n("a.md", "2024-01-02"), n("c.md", "2025-05-05")];
  it("next plays the older note and stops at the end", () => {
    expect(afterEndNote(items, "d/c.md", "next")?.name).toBe("a.md");
    expect(afterEndNote(items, "d/b.md", "next")).toBeNull();
  });
  it("loopAll wraps from the last to the first", () => {
    expect(afterEndNote(items, "d/a.md", "loopAll")?.name).toBe("b.md");
    expect(afterEndNote(items, "d/b.md", "loopAll")?.name).toBe("c.md");
  });
  it("repeatOne replays, stop and unknown paths give null", () => {
    expect(afterEndNote(items, "d/a.md", "repeatOne")?.name).toBe("a.md");
    expect(afterEndNote(items, "d/a.md", "stop")).toBeNull();
    expect(afterEndNote(items, "d/nope.md", "loopAll")).toBeNull();
  });
});

describe("todayString", () => {
  it("pads local date", () => expect(todayString(new Date(2026, 0, 5))).toBe("2026-01-05"));
});

describe("dock position", () => {
  it("clamps the bubble fully inside", () => {
    expect(clampDock(-50, 9999, 420, 220, 20)).toEqual({ x: 0, y: 1 });
    expect(clampDock(210, 110, 420, 220, 20)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("tiny view centres", () => {
    expect(clampDock(5, 5, 30, 30, 20)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("card opens toward the roomier side", () => {
    expect(cardSide({ x: 0.9, y: 0.1 })).toEqual({ left: true, up: false });
    expect(cardSide({ x: 0.1, y: 0.9 })).toEqual({ left: false, up: true });
  });
});
