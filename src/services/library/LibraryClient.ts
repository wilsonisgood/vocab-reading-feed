// Reads the user's own book library (METHOD §5): library.json, book.json, chapter md. Only the URL the user typed in.
import type { HttpPort } from "../../core/ports";
import {
  bookUrl, chapterUrl, libraryUrl, parseBook, parseLibrary, LibraryFormatError,
  type BookChapter, type BookDetail, type LibraryBook,
} from "../../core/library/logic";

/** notFound = 404 (wrong library URL); network = no response (retry); http / format = anything else. */
export type LibraryErrorKind = "notFound" | "network" | "http" | "format";

export class LibraryError extends Error {
  constructor(readonly kind: LibraryErrorKind, message: string) {
    super(message);
  }
}

export class LibraryClient {
  constructor(private readonly http: HttpPort) {}

  private async get(url: string | null): Promise<string> {
    if (url === null) throw new LibraryError("format", "書庫裡有不安全的路徑");
    let res;
    try {
      res = await this.http.request({ url, method: "GET" });
    } catch (e) {
      throw new LibraryError("network", e instanceof Error ? e.message : String(e));
    }
    if (res.status === 404) throw new LibraryError("notFound", "書庫網址不對（404）");
    if (res.status !== 200) throw new LibraryError("http", `HTTP ${res.status}`);
    return res.text;
  }

  private async getJson(url: string | null): Promise<unknown> {
    const text = await this.get(url);
    try {
      return JSON.parse(text);
    } catch {
      throw new LibraryError("format", "不是 JSON");
    }
  }

  private static format<T>(f: () => T): T {
    try {
      return f();
    } catch (e) {
      if (e instanceof LibraryFormatError) throw new LibraryError("format", e.message);
      throw e;
    }
  }

  async books(base: string): Promise<LibraryBook[]> {
    const json = await this.getJson(libraryUrl(base));
    return LibraryClient.format(() => parseLibrary(json));
  }

  async book(base: string, slug: string): Promise<BookDetail> {
    const json = await this.getJson(bookUrl(base, slug));
    return LibraryClient.format(() => parseBook(json));
  }

  chapter(base: string, slug: string, ch: Pick<BookChapter, "file">): Promise<string> {
    return this.get(chapterUrl(base, slug, ch.file));
  }
}
