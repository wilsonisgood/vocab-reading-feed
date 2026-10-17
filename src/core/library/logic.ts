// "My books" (METHOD §5): the user's own library URL → chapter notes in the vault. Pure: no obsidian, no network.
import { RF_READ_KEY } from "../types";

/** One book of `library.json`. */
export interface LibraryBook {
  slug: string;
  title: string;
  author: string;
  folder: string;
  chapters: number;
  /** Chapters that already have audio + timestamps. */
  timed: number;
  updated: string;
}

/** One chapter of `<slug>/book.json`. */
export interface BookChapter {
  id: string;
  episode: number;
  title: string;
  /** File under `<base><slug>/`, e.g. `ch01.md`. */
  file: string;
  /** Vault file name, e.g. `01 ONE.md` (episode prefix keeps chapter order, METHOD §1.2). */
  name: string;
  /** First 12 hex of the remote md's sha1; changes when the chapter changes (e.g. gets timestamps). */
  sha: string;
  timed: boolean;
}

export interface BookDetail {
  slug: string;
  title: string;
  author: string;
  folder: string;
  updated: string;
  chapters: BookChapter[];
}

/** What was last downloaded for one chapter (keyed by rf-id). `fp` = fingerprint of the text we wrote. */
export interface ChapterRecord {
  sha: string;
  fp: string;
}

/** Per book: library `updated` at the last sync, and chapters left alone because the user edited them. */
export interface BookRecord {
  updated: string;
  conflicts: string[];
}

export interface LibrarySync {
  chapters: Record<string, ChapterRecord>;
  books: Record<string, BookRecord>;
}

export const EMPTY_SYNC: LibrarySync = { chapters: {}, books: {} };

/** Sub-folder of the plugin folder that holds downloaded books. */
export const BOOKS_SUBFOLDER = "Private Podcast";

/**
 * User-pasted library address → base URL ending in `/`, or null when it is not an http(s) URL.
 * Accepts `…/<secret>/`, `…/<secret>` and `…/<secret>/library.json`; query and fragment are dropped.
 */
export function normalizeLibraryUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  let path = u.pathname.replace(/\/library\.json$/i, "/");
  if (!path.endsWith("/")) path += "/";
  return `${u.protocol}//${u.host}${path}`;
}

/** A path segment from the network that is safe to put into a URL: no `/`, `\`, `..`, nothing empty. */
function safeUrlSegments(path: string): string[] | null {
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) return null;
  return parts.map(encodeURIComponent);
}

export function libraryUrl(base: string): string {
  return `${base}library.json`;
}

export function bookUrl(base: string, slug: string): string | null {
  const s = safeUrlSegments(slug);
  return s && s.length === 1 ? `${base}${s[0]}/book.json` : null;
}

export function chapterUrl(base: string, slug: string, file: string): string | null {
  const s = safeUrlSegments(slug);
  const f = safeUrlSegments(file);
  return s && s.length === 1 && f ? `${base}${s[0]}/${f.join("/")}` : null;
}

// eslint-disable-next-line no-control-regex -- control characters from the network are exactly what we strip
const BAD_NAME_CHARS = /[\\/:*?"<>|#^[\]\u0000-\u001f]/g;

/** One vault path segment from the network: Obsidian-unfriendly characters → space; no leading dots; null if nothing is left. */
export function safeSegment(name: string): string | null {
  const s = name.replace(BAD_NAME_CHARS, " ").replace(/\s+/g, " ").trim().replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  return s === "" ? null : s;
}

/** Vault folder of a book: `<folder>/Private Podcast/<book.folder>`; falls back to the slug. */
export function bookFolderPath(rootFolder: string, book: Pick<BookDetail, "folder" | "slug">): string {
  const root = rootFolder.replace(/^\/+|\/+$/g, "");
  const name = safeSegment(book.folder) ?? safeSegment(book.slug) ?? "book";
  return [root, BOOKS_SUBFOLDER, name].filter((p) => p !== "").join("/");
}

/** Vault file name of a chapter: `name` cleaned, always `.md`; falls back to `<episode> <title>.md`, then `<id>.md`. */
export function chapterFileName(ch: Pick<BookChapter, "name" | "episode" | "title" | "id">): string {
  const raw = ch.name.replace(/\.md$/i, "");
  const fallback = `${String(ch.episode).padStart(2, "0")} ${ch.title}`;
  const base = safeSegment(raw) ?? safeSegment(fallback) ?? safeSegment(ch.id) ?? "chapter";
  return `${base}.md`;
}

/** rf-id of a chapter note (METHOD §1.2): `<slug>-<chapter id>`. */
export function chapterRfId(slug: string, chapterId: string): string {
  return `${slug}-${chapterId}`;
}

// ---- parsing (the library is outside our control: skip what does not fit) ----

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export class LibraryFormatError extends Error {}

export function parseLibrary(json: unknown): LibraryBook[] {
  const o = json as { schema?: unknown; books?: unknown } | null;
  if (!o || o.schema !== 1 || !Array.isArray(o.books)) throw new LibraryFormatError("library.json 格式不對");
  const out: LibraryBook[] = [];
  for (const b of o.books as Record<string, unknown>[]) {
    const slug = str(b?.slug);
    if (!slug) continue;
    out.push({
      slug,
      title: str(b.title) ?? slug,
      author: str(b.author) ?? "",
      folder: str(b.folder) ?? slug,
      chapters: num(b.chapters),
      timed: num(b.timed),
      updated: str(b.updated) ?? "",
    });
  }
  return out;
}

export function parseBook(json: unknown): BookDetail {
  const o = json as Record<string, unknown> | null;
  const slug = str(o?.slug);
  if (!o || o.schema !== 1 || !slug || !Array.isArray(o.chapters)) throw new LibraryFormatError("book.json 格式不對");
  const chapters: BookChapter[] = [];
  for (const c of o.chapters as Record<string, unknown>[]) {
    const id = str(c?.id);
    const file = str(c?.file);
    if (!id || !file) continue;
    chapters.push({
      id,
      file,
      episode: num(c.episode),
      title: str(c.title) ?? id,
      name: str(c.name) ?? "",
      sha: str(c.sha) ?? "",
      timed: c.timed === true,
    });
  }
  return {
    slug,
    title: str(o.title) ?? slug,
    author: str(o.author) ?? "",
    folder: str(o.folder) ?? slug,
    updated: str(o.updated) ?? "",
    chapters,
  };
}

// ---- fingerprint & update rule ----

/** Frontmatter keys the plugin writes itself; edits to them do not count as the user's (METHOD §1). */
export const PLUGIN_FM_KEYS: readonly string[] = [RF_READ_KEY];

/** `---` frontmatter block (without the fences) and the rest of the note. */
export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const t = text.replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(t);
  return m ? { yaml: m[1], body: t.slice(m[0].length) } : { yaml: null, body: t };
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** cyrb53: small, fast, non-crypto; we only compare our own fingerprints. */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Content identity of a note, blind to what the plugin itself changes: frontmatter is compared as parsed
 * values (Obsidian reflows the YAML when it writes `rf-read`), minus PLUGIN_FM_KEYS; body by text,
 * line endings and trailing whitespace normalised. `parseYaml` is injected (Obsidian's in the app).
 */
export function noteFingerprint(text: string, parseYaml: (yaml: string) => unknown): string {
  const { yaml, body } = splitFrontmatter(text);
  let fm: unknown = null;
  if (yaml !== null) {
    try {
      fm = parseYaml(yaml);
    } catch {
      fm = { "\u0000raw": yaml };
    }
  }
  if (fm && typeof fm === "object" && !Array.isArray(fm)) {
    const copy = { ...(fm as Record<string, unknown>) };
    for (const k of PLUGIN_FM_KEYS) delete copy[k];
    fm = copy;
  }
  return hash(`${stable(fm)}\n${body.replace(/[ \t]+$/gm, "").trimEnd()}`);
}

/**
 * What to do with one chapter (METHOD §5.3):
 * - create: no local file.
 * - overwrite: local is exactly what we last wrote and the remote changed.
 * - skip: nothing new (or the user edited it but the remote did not change).
 * - conflict: the user edited it and the remote changed → leave it, offer a manual overwrite.
 * - unknown: a file is there but we never recorded downloading it → caller compares with the remote text.
 */
export type ChapterAction = "create" | "overwrite" | "skip" | "conflict" | "unknown";

export function decideChapter(localFp: string | null, record: ChapterRecord | undefined, remoteSha: string): ChapterAction {
  if (localFp === null) return "create";
  if (!record) return "unknown";
  const changed = remoteSha === "" || remoteSha !== record.sha;
  if (localFp === record.fp) return changed ? "overwrite" : "skip";
  return changed ? "conflict" : "skip";
}

export type BookState = "new" | "update" | "current";

/** List status without fetching book.json: never synced / library says it changed since / up to date. */
export function bookState(book: Pick<LibraryBook, "slug" | "updated">, sync: LibrarySync): BookState {
  const rec = sync.books[book.slug];
  if (!rec) return "new";
  return rec.updated !== book.updated || book.updated === "" ? "update" : "current";
}
