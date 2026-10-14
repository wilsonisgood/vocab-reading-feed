import { describe, expect, it } from "vitest";
import {
  collectTopics, EMPTY_FILTER, isHidden, isUnavailable, matchesStatus, filterTalks, formatDuration, loadedKey, matchesLength, tedKey, uniquePath,
} from "../../src/core/browser/logic";
import type { TalkSummary } from "../../src/core/types";

const t = (slug: string, o: Partial<TalkSummary> = {}): TalkSummary => ({
  slug, title: slug, speaker: "Someone", published: "2024-01-01", duration: 700,
  topics: [], cover: null, thumbnail: null, ...o,
});

describe("filters", () => {
  const items = [
    t("a", { title: "Climate Hope", speaker: "Ann Lee", topics: ["climate", "science"], duration: 599 }),
    t("b", { title: "Sleep", speaker: "Bob", topics: ["health"], duration: 600 }),
    t("c", { title: "Cities", speaker: "Cara CLIMATE", topics: ["design"], duration: 1200 }),
    t("d", { title: "Long", topics: ["science"], duration: 1201 }),
  ];
  it("topic", () => {
    expect(filterTalks(items, { ...EMPTY_FILTER, topic: "science" }).map((x) => x.slug)).toEqual(["a", "d"]);
  });
  it("keyword matches title or speaker, case-insensitive", () => {
    expect(filterTalks(items, { ...EMPTY_FILTER, keyword: " climate " }).map((x) => x.slug)).toEqual(["a", "c"]);
  });
  it("length boundaries", () => {
    expect(matchesLength(599, "lt10")).toBe(true);
    expect(matchesLength(600, "lt10")).toBe(false);
    expect(matchesLength(600, "10to20")).toBe(true);
    expect(matchesLength(1200, "10to20")).toBe(true);
    expect(matchesLength(1200, "gt20")).toBe(false);
    expect(matchesLength(1201, "gt20")).toBe(true);
    expect(filterTalks(items, { ...EMPTY_FILTER, length: "10to20" }).map((x) => x.slug)).toEqual(["b", "c"]);
  });
  it("combined and empty", () => {
    expect(filterTalks(items, EMPTY_FILTER)).toHaveLength(4);
    expect(filterTalks(items, { ...EMPTY_FILTER, topic: "science", keyword: "long", length: "gt20" }).map((x) => x.slug)).toEqual(["d"]);
  });
  it("collectTopics distinct sorted", () => {
    expect(collectTopics(items)).toEqual(["climate", "design", "health", "science"]);
  });
});

describe("keys, paths, time", () => {
  it("dedupe key", () => {
    expect(loadedKey("ted", "x_y")).toBe("ted:x_y");
    expect(tedKey("x_y")).toBe("ted:x_y");
  });
  it("uniquePath", () => {
    const taken = new Set(["F/TED/a.md", "F/TED/a (2).md"]);
    expect(uniquePath("F/TED/b.md", (p) => taken.has(p))).toBe("F/TED/b.md");
    expect(uniquePath("F/TED/a.md", (p) => taken.has(p))).toBe("F/TED/a (3).md");
    taken.delete("F/TED/a (2).md");
    expect(uniquePath("F/TED/a.md", (p) => taken.has(p))).toBe("F/TED/a (2).md");
  });
  it("formatDuration", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(1200)).toBe("20:00");
    expect(formatDuration(4503)).toBe("75:03");
  });
});

describe("status filter, hidden, unavailable", () => {
  const items = [t("a"), t("b"), t("c"), t("d")];
  const ctx = {
    loaded: new Set([tedKey("b"), tedKey("c")]),
    read: new Set([tedKey("c")]),
    favorites: new Set([tedKey("a"), tedKey("c")]),
  };
  const slugs = (status: "all" | "unloaded" | "unread" | "read" | "favorite", hidden = new Set<string>()) =>
    filterTalks(items, { ...EMPTY_FILTER, status }, ctx, hidden).map((x) => x.slug);
  it("each status", () => {
    expect(slugs("all")).toEqual(["a", "b", "c", "d"]);
    expect(slugs("unloaded")).toEqual(["a", "d"]);
    expect(slugs("unread")).toEqual(["b"]);
    expect(slugs("read")).toEqual(["c"]);
    expect(slugs("favorite")).toEqual(["a", "c"]);
  });
  it("favorite works for unloaded talks", () => {
    expect(matchesStatus("a", "favorite", ctx)).toBe(true);
    expect(matchesStatus("a", "unread", ctx)).toBe(false);
  });
  it("builtin hidden list removes talks", () => {
    expect(slugs("all", new Set(["b"]))).toEqual(["a", "c", "d"]);
    expect(isHidden("b", new Set(["b"]))).toBe(true);
    expect(isHidden("a", new Set(["b"]))).toBe(false);
  });
  it("discovered no-transcript are unavailable but still listed", () => {
    expect(isUnavailable("a", ["a"])).toBe(true);
    expect(isUnavailable("b", ["a"])).toBe(false);
    expect(slugs("all")).toContain("a");
  });
});
