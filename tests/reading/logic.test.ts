import { describe, expect, it } from "vitest";
import { neighborNote, sortNotes, todayString, toggleFavorite } from "../../src/ui/reading/logic";

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

describe("todayString / toggleFavorite", () => {
  it("pads local date", () => expect(todayString(new Date(2026, 0, 5))).toBe("2026-01-05"));
  it("toggles", () => {
    expect(toggleFavorite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavorite(["a", "b"], "a")).toEqual(["b"]);
  });
});
