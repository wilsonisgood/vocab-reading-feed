import { describe, expect, it } from "vitest";
import { noteFileName, notePath, renderNote } from "../../src/core/note/render";
import { parseLineTimestamp, parseTimestamps, readRfKey, timestampTexts } from "../../src/core/note/parse";
import { yamlList, yamlString } from "../../src/core/note/yaml";
import type { Talk } from "../../src/core/types";

function talk(over: Partial<Talk["meta"]> = {}, paragraphs: Talk["paragraphs"] = []): Talk {
  return {
    meta: {
      source: "ted",
      slug: "jane_doe_a_test",
      title: "A test",
      speaker: "Jane Doe",
      published: "2026-09-30",
      duration: 734,
      topics: ["AI", "tech"],
      cover: "https://img.example/c.jpg",
      thumbnail: "https://img.example/c.jpg?w=320",
      url: "https://www.ted.com/talks/jane_doe_a_test",
      license: "CC BY-NC-ND 4.0 — TED Conferences, LLC",
      ...over,
    },
    paragraphs,
    audioUrl: "https://hls.example/a.m3u8",
  };
}

describe("round trip", () => {
  it("every paragraph's start and line match", () => {
    const ps = [
      { text: "First short sentence.", start: 0.7 },
      { text: "Second one,\nwith a newline.", start: 16.214 },
      { text: "Third.", start: 120 },
    ];
    const md = renderNote(talk({}, ps));
    const times = parseTimestamps(md);
    expect(times.map((t) => t.start)).toEqual([0.7, 16.21, 120]);
    const lines = md.split("\n");
    times.forEach((t, i) => {
      expect(lines[t.line]).toContain(ps[i].text.replace("\n", " "));
    });
    expect(md).toContain("Source: [TED](<https://www.ted.com/talks/jane_doe_a_test>)");
  });

  it("empty paragraphs gives a note with no timestamps", () => {
    const md = renderNote(talk());
    expect(parseTimestamps(md)).toEqual([]);
    expect(md.startsWith("---\n")).toBe(true);
  });

  it("omits cover and thumbnail when null", () => {
    const md = renderNote(talk({ cover: null, thumbnail: null }));
    expect(md).not.toMatch(/^cover:/m);
    expect(md).not.toMatch(/^thumbnail:/m);
    expect(renderNote(talk())).toMatch(/^cover:/m);
  });
});

describe("paragraph escaping", () => {
  it("keeps %% out of comments, one paragraph per line, escapes block syntax", () => {
    const ps = [
      { text: "50%% of it %%%", start: 1 },
      { text: "# not a heading", start: 2 },
      { text: "> not a quote", start: 3 },
      { text: "- not a list", start: 4 },
      { text: "1. not numbered", start: 5 },
    ];
    const md = renderNote(talk({}, ps));
    const times = parseTimestamps(md);
    expect(times).toHaveLength(5);
    const lines = md.split("\n");
    expect(lines[times[0].line]).toBe("50%\\% of it %\\%\\% %%rf:1.00%%");
    expect(lines[times[1].line].startsWith("\\# ")).toBe(true);
    expect(lines[times[2].line].startsWith("\\> ")).toBe(true);
    expect(lines[times[3].line].startsWith("\\- ")).toBe(true);
    expect(lines[times[4].line].startsWith("1\\. ")).toBe(true);
    // each timestamp line has exactly one %%…%% pair
    for (const t of times) expect(lines[t.line].match(/%%/g)).toHaveLength(2);
  });
});

describe("title with special characters", () => {
  const title = 'AI: "the" end? #1 [x]';
  it("quotes YAML and cleans the file name", () => {
    const md = renderNote(talk({ title }));
    expect(md).toContain('title: "AI: \\"the\\" end? #1 [x]"');
    expect(noteFileName({ published: "2026-09-30", title })).toBe('2026-09-30 AI the end 1 x.md');
  });
  it("notePath trims folder slashes", () => {
    const meta = talk().meta;
    expect(notePath("/Reading Feed/", meta)).toBe("Reading Feed/TED/2026-09-30 A test.md");
    expect(notePath("", meta)).toBe("TED/2026-09-30 A test.md");
  });
});

describe("yaml quoting", () => {
  it("quotes ambiguous scalars only", () => {
    expect(yamlString("plain words")).toBe("plain words");
    for (const s of ["", " pad", "true", "null", "123", "1.5", "- x", "[a]", "%x", "a: b", "a#b", "*x"]) {
      expect(yamlString(s).startsWith('"')).toBe(true);
    }
    expect(yamlList(["a", "b, c", "x]"])).toBe('[a, "b, c", "x]"]');
  });
});

describe("parseTimestamps skipping", () => {
  it("ignores frontmatter and fenced code", () => {
    const md = ["---", "x: a %%rf:9%%", "---", "real %%rf:1.5%%", "```", "code %%rf:2%%", "```", "after %%rf:3%%"].join("\n");
    expect(parseTimestamps(md)).toEqual([
      { line: 3, start: 1.5 },
      { line: 7, start: 3 },
    ]);
  });
});

describe("parseLineTimestamp / readRfKey", () => {
  it("handles trailing whitespace and missing stamps", () => {
    expect(parseLineTimestamp("hello %%rf:12.30%%  ")).toBe(12.3);
    expect(parseLineTimestamp("hello %%rf:7%%")).toBe(7);
    expect(parseLineTimestamp("hello")).toBeNull();
    expect(parseLineTimestamp("%%rf:1.00%% trailing text")).toBeNull();
  });
  it("reads the key only when both are non-empty strings", () => {
    expect(readRfKey({ "rf-source": "ted", "rf-id": "x" })).toEqual({ source: "ted", id: "x" });
    expect(readRfKey({ "rf-source": "ted", "rf-id": "" })).toBeNull();
    expect(readRfKey({ "rf-source": "ted", "rf-id": 3 })).toBeNull();
    expect(readRfKey(undefined)).toBeNull();
  });
});

describe("timestamp ordinal survives frontmatter reflow", () => {
  const body = "Hello there. %%rf:1.5%%\n\nSecond one. %%rf:9%%\n";
  const before = "---\nrf-source: ted\ntopics: [a, b]\n---\n\n" + body;
  const after = "---\nrf-source: ted\ntopics:\n  - a\n  - b\nrf-read: 2026-10-14\n---\n\n" + body;
  it("lines shift but ordinals do not", () => {
    const l0 = parseTimestamps(before)[1].line;
    const l1 = parseTimestamps(after)[1].line;
    expect(l1).not.toBe(l0);
    expect(parseTimestamps(before).findIndex((t) => t.line === l0)).toBe(1);
    expect(parseTimestamps(after).findIndex((t) => t.line === l1)).toBe(1);
  });
  it("texts strip the marker", () => {
    expect(timestampTexts(after, parseTimestamps(after))).toEqual(["Hello there.", "Second one."]);
  });
});
