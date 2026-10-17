import { describe, expect, it } from "vitest";
import {
  bookFolderPath, bookState, bookUrl, chapterFileName, chapterUrl, decideChapter, normalizeLibraryUrl,
  noteFingerprint, parseBook, parseLibrary, safeSegment, splitFrontmatter, EMPTY_SYNC,
} from "../../src/core/library/logic";

const SECRET = "0".repeat(32);
const BASE = `https://audio.example.test/${SECRET}/`;

describe("normalizeLibraryUrl", () => {
  it("accepts the base with or without slash, or library.json", () => {
    expect(normalizeLibraryUrl(BASE)).toBe(BASE);
    expect(normalizeLibraryUrl(` https://audio.example.test/${SECRET} `)).toBe(BASE);
    expect(normalizeLibraryUrl(`${BASE}library.json?x=1#y`)).toBe(BASE);
  });
  it("rejects non-URLs and other schemes", () => {
    expect(normalizeLibraryUrl("")).toBeNull();
    expect(normalizeLibraryUrl("audio.example.test/x")).toBeNull();
    expect(normalizeLibraryUrl("file:///etc/")).toBeNull();
  });
});

describe("urls", () => {
  it("encodes segments and refuses traversal", () => {
    expect(bookUrl(BASE, "androids")).toBe(`${BASE}androids/book.json`);
    expect(chapterUrl(BASE, "androids", "ch01.md")).toBe(`${BASE}androids/ch01.md`);
    expect(chapterUrl(BASE, "a b", "c#1.md")).toBe(`${BASE}a%20b/c%231.md`);
    expect(bookUrl(BASE, "../x")).toBeNull();
    expect(bookUrl(BASE, "a/b")).toBeNull();
    expect(chapterUrl(BASE, "androids", "../library.json")).toBeNull();
    expect(chapterUrl(BASE, "androids", "/abs.md")).toBeNull();
  });
});

describe("vault paths", () => {
  it("Reading Feed/Private Podcast/<folder>/<name>", () => {
    const folder = bookFolderPath("Reading Feed/", { folder: "Do Androids Dream of Electric Sheep?", slug: "androids" });
    expect(folder).toBe("Reading Feed/Private Podcast/Do Androids Dream of Electric Sheep");
    expect(chapterFileName({ name: "01 ONE.md", episode: 1, title: "ONE", id: "ch01" })).toBe("01 ONE.md");
  });
  it("cleans names from the network", () => {
    expect(safeSegment("..")).toBeNull();
    expect(safeSegment("../../etc")).toBe("etc");
    expect(safeSegment("a/b:c")).toBe("a b c");
    expect(bookFolderPath("", { folder: "..", slug: "androids" })).toBe("Private Podcast/androids");
    expect(chapterFileName({ name: "../x/02 TWO", episode: 2, title: "TWO", id: "ch02" })).toBe("x 02 TWO.md");
    expect(chapterFileName({ name: "", episode: 3, title: "THREE", id: "ch03" })).toBe("03 THREE.md");
  });
});

describe("parse", () => {
  it("library.json", () => {
    const books = parseLibrary({
      schema: 1,
      books: [
        { slug: "androids", title: "Do Androids…", author: "Philip K. Dick", folder: "Do Androids", chapters: 22, timed: 3, updated: "2026-10-17T00:00:00Z" },
        { title: "no slug" },
      ],
    });
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ slug: "androids", chapters: 22, timed: 3 });
    expect(() => parseLibrary({ schema: 2, books: [] })).toThrow();
  });
  it("book.json", () => {
    const b = parseBook({
      schema: 1, slug: "androids", title: "T", author: "A", folder: "F", updated: "u",
      chapters: [{ id: "ch01", episode: 1, title: "ONE", file: "ch01.md", name: "01 ONE.md", sha: "abc", timed: false }, { id: "x" }],
    });
    expect(b.chapters).toEqual([{ id: "ch01", episode: 1, title: "ONE", file: "ch01.md", name: "01 ONE.md", sha: "abc", timed: false }]);
  });
});

/** Tiny YAML for tests: `k: v`, `k: [a, b]`, and block lists. */
function miniYaml(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let list: unknown[] | null = null;
  for (const line of src.split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list) {
      list.push(item[1]);
      continue;
    }
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2];
    if (v === "") out[m[1]] = list = [];
    else if (v.startsWith("[")) out[m[1]] = v.slice(1, -1).split(",").map((s) => s.trim());
    else out[m[1]] = v.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

describe("noteFingerprint", () => {
  const remote = "---\nrf-source: book\nrf-id: androids-ch01\ntags: [reading-feed, book]\n---\n\nHello. %%rf:0.50%%\n";
  it("ignores rf-read and Obsidian's reflow of the frontmatter", () => {
    const local = "---\nrf-source: book\nrf-id: androids-ch01\ntags:\n  - reading-feed\n  - book\nrf-read: 2026-10-17\n---\n\nHello. %%rf:0.50%%  \r\n";
    expect(noteFingerprint(local, miniYaml)).toBe(noteFingerprint(remote, miniYaml));
  });
  it("sees the user's edits, in body or frontmatter", () => {
    expect(noteFingerprint(remote.replace("Hello.", "Hello!"), miniYaml)).not.toBe(noteFingerprint(remote, miniYaml));
    expect(noteFingerprint(remote.replace("book]", "book, mine]"), miniYaml)).not.toBe(noteFingerprint(remote, miniYaml));
  });
  it("splitFrontmatter", () => {
    expect(splitFrontmatter("no fm").yaml).toBeNull();
    expect(splitFrontmatter("---\na: 1\n---\nbody").body).toBe("body");
  });
});

describe("decideChapter", () => {
  const rec = { sha: "s1", fp: "f1" };
  it("follows the update rule", () => {
    expect(decideChapter(null, rec, "s1")).toBe("create");
    expect(decideChapter("f1", undefined, "s1")).toBe("unknown");
    expect(decideChapter("f1", rec, "s1")).toBe("skip");
    expect(decideChapter("f1", rec, "s2")).toBe("overwrite");
    expect(decideChapter("edited", rec, "s1")).toBe("skip");
    expect(decideChapter("edited", rec, "s2")).toBe("conflict");
  });
});

describe("bookState", () => {
  it("new / update / current", () => {
    const b = { slug: "androids", updated: "2026-10-17T00:00:00Z" };
    expect(bookState(b, EMPTY_SYNC)).toBe("new");
    const sync = { chapters: {}, books: { androids: { updated: "2026-10-16T00:00:00Z", conflicts: [] } } };
    expect(bookState(b, sync)).toBe("update");
    sync.books.androids.updated = b.updated;
    expect(bookState(b, sync)).toBe("current");
  });
});
