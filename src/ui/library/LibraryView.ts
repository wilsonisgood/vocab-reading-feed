// "My books" side panel (METHOD §5): the user's own library → chapter notes under <folder>/Private Podcast/.
import { ItemView, normalizePath, parseYaml, TFile, type WorkspaceLeaf } from "obsidian";
import {
  bookFolderPath, bookState, chapterFileName, chapterRfId, decideChapter, noteFingerprint,
  type BookState, type LibraryBook,
} from "../../core/library/logic";
import { RF_READ_KEY, type ReadingFeedSettings } from "../../core/types";
import { LibraryError, type LibraryClient } from "../../services/library/LibraryClient";

export const LIBRARY_VIEW_TYPE = "reading-feed-library";

export interface LibraryDeps {
  client: LibraryClient;
  getSettings: () => ReadingFeedSettings;
  saveSettings: () => Promise<void>;
}

const STATE_LABEL: Record<BookState, string> = { new: "未下載", update: "有更新", current: "已是最新" };

const fingerprint = (text: string) => noteFingerprint(text, parseYaml);

function errorText(e: unknown): string {
  if (e instanceof LibraryError) {
    if (e.kind === "notFound") return "書庫網址不對（找不到）。請到設定確認書庫網址。";
    if (e.kind === "network") return `連不上書庫（網路錯誤：${e.message}）。`;
    return `書庫回應有問題：${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export class LibraryView extends ItemView {
  private books: LibraryBook[] = [];
  private error = "";
  private loading = false;
  /** Slug being synced; one book at a time. */
  private busy: string | null = null;
  private progress = "";
  private results = new Map<string, string>();
  /** Slug whose "overwrite local edits" was clicked once (second click confirms). */
  private confirmForce: string | null = null;
  private body!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private readonly deps: LibraryDeps) {
    super(leaf);
  }

  getViewType(): string {
    return LIBRARY_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "我的書";
  }
  getIcon(): string {
    return "book-open";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("rf-browser", "rf-library");
    const head = root.createDiv("rf-library-head");
    head.createDiv({
      cls: "rf-library-note",
      text: "只連你在設定裡填的書庫網址；Reading Feed 本身不提供任何書庫或音檔。",
    });
    const refresh = head.createEl("button", { text: "重新整理" });
    refresh.onclick = () => void this.reload();
    this.body = root.createDiv("rf-browser-list");
    await this.reload();
  }

  private base(): string {
    return this.deps.getSettings().libraryUrl;
  }

  private async reload(): Promise<void> {
    if (this.loading) return;
    this.error = "";
    if (this.base() === "") {
      this.books = [];
      this.render();
      return;
    }
    this.loading = true;
    this.render();
    try {
      this.books = await this.deps.client.books(this.base());
    } catch (e) {
      this.books = [];
      this.error = errorText(e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(): void {
    const el = this.body;
    el.empty();
    if (this.base() === "") {
      el.createDiv({ cls: "rf-browser-status", text: "還沒有書庫網址：到「設定 → Reading Feed → 書庫網址」貼上你的私人網址。" });
      return;
    }
    if (this.loading) {
      el.createDiv({ cls: "rf-browser-status", text: "讀取書庫中…" });
      return;
    }
    if (this.error) {
      el.createDiv({ cls: "rf-browser-status rf-error", text: this.error });
      const retry = el.createEl("button", { text: "重試" });
      retry.onclick = () => void this.reload();
      return;
    }
    if (this.books.length === 0) {
      el.createDiv({ cls: "rf-browser-status", text: "書庫裡沒有書。" });
      return;
    }
    const sync = this.deps.getSettings().librarySync;
    for (const b of this.books) {
      const row = el.createDiv("rf-row");
      const body = row.createDiv("rf-row-body");
      body.createDiv({ cls: "rf-row-title", text: b.title });
      const date = b.updated.slice(0, 10);
      body.createDiv({
        cls: "rf-row-meta",
        text: [b.author, `已念 ${b.timed} / ${b.chapters} 章`, date && `更新 ${date}`].filter(Boolean).join(" · "),
      });
      const state = bookState(b, sync);
      const tags = body.createDiv("rf-row-tags");
      tags.createSpan({ cls: state === "update" ? "rf-tag rf-tag-loaded" : "rf-tag", text: STATE_LABEL[state] });
      const conflicts = sync.books[b.slug]?.conflicts ?? [];
      if (conflicts.length > 0) {
        body.createDiv({
          cls: "rf-row-meta rf-error",
          text: `本機有修改，未更新：${conflicts.join("、")}`,
        });
      }
      const result = this.busy === b.slug ? this.progress : this.results.get(b.slug);
      if (result) body.createDiv({ cls: "rf-browser-result", text: result });

      const actions = row.createDiv("rf-library-actions");
      const btn = actions.createEl("button", {
        cls: state === "current" ? "" : "mod-cta",
        text: state === "new" ? "下載" : state === "update" ? "更新" : "檢查更新",
      });
      btn.disabled = this.busy !== null;
      btn.onclick = () => void this.syncBook(b, false);
      if (conflicts.length > 0) {
        const force = actions.createEl("button", {
          cls: this.confirmForce === b.slug ? "mod-warning" : "",
          text: this.confirmForce === b.slug ? "確定覆蓋？" : "覆蓋本機修改",
        });
        force.disabled = this.busy !== null;
        force.onclick = () => {
          if (this.confirmForce !== b.slug) {
            this.confirmForce = b.slug;
            this.render();
            return;
          }
          this.confirmForce = null;
          void this.syncBook(b, true);
        };
      }
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const { vault } = this.app;
    let cur = "";
    for (const part of normalizePath(path).split("/").filter(Boolean)) {
      cur = cur === "" ? part : `${cur}/${part}`;
      if (!vault.getAbstractFileByPath(cur)) await vault.createFolder(cur);
    }
  }

  /** Download / update one book (METHOD §5.3). `force` also overwrites chapters the user edited. */
  private async syncBook(lib: LibraryBook, force: boolean): Promise<void> {
    if (this.busy !== null) return;
    const base = this.base();
    const settings = this.deps.getSettings();
    const sync = settings.librarySync;
    const { vault } = this.app;
    this.busy = lib.slug;
    this.progress = "讀取章節清單…";
    this.render();
    let created = 0;
    let updated = 0;
    const conflicts: string[] = [];
    const failed: string[] = [];
    try {
      const book = await this.deps.client.book(base, lib.slug);
      const folder = normalizePath(bookFolderPath(settings.folder, book));
      await this.ensureFolder(folder);
      for (const [i, ch] of book.chapters.entries()) {
        const name = chapterFileName(ch);
        this.progress = `${i + 1} / ${book.chapters.length}：${name}`;
        this.render();
        const rfId = chapterRfId(book.slug, ch.id);
        const path = normalizePath(`${folder}/${name}`);
        try {
          const existing = vault.getAbstractFileByPath(path);
          if (existing && !(existing instanceof TFile)) throw new Error("同名資料夾已存在");
          const localText = existing instanceof TFile ? await vault.read(existing) : null;
          const localFp = localText === null ? null : fingerprint(localText);
          let action = decideChapter(localFp, sync.chapters[rfId], ch.sha);
          let text: string | null = null;
          if (action === "unknown") {
            // A file we never recorded: same content as the remote → just remember it.
            text = await this.deps.client.chapter(base, book.slug, ch);
            if (fingerprint(text) === localFp) {
              sync.chapters[rfId] = { sha: ch.sha, fp: localFp };
              continue;
            }
            action = "conflict";
          }
          if (action === "conflict" && force) action = "overwrite";
          if (action === "skip") continue;
          if (action === "conflict") {
            conflicts.push(name);
            continue;
          }
          text ??= await this.deps.client.chapter(base, book.slug, ch);
          if (existing instanceof TFile) {
            const read = this.app.metadataCache.getFileCache(existing)?.frontmatter?.[RF_READ_KEY] as unknown;
            await vault.modify(existing, text);
            // Keep the plugin's own read mark across the update.
            if (read !== undefined && read !== null && read !== "") {
              await this.app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => {
                fm[RF_READ_KEY] ??= read;
              });
            }
            updated++;
          } else {
            await vault.create(path, text);
            created++;
          }
          sync.chapters[rfId] = { sha: ch.sha, fp: fingerprint(text) };
        } catch (e) {
          // Network trouble on one chapter: keep going; the book stays "有更新" so a retry picks it up.
          failed.push(`${name}（${errorText(e)}）`);
        }
      }
      sync.books[book.slug] = { updated: failed.length > 0 ? "" : lib.updated, conflicts };
      const parts = [
        created > 0 && `新增 ${created} 章`,
        updated > 0 && `更新 ${updated} 章`,
        conflicts.length > 0 && `${conflicts.length} 章本機有修改，未更新`,
        failed.length > 0 && `失敗：${failed.join("、")}（可再按一次重試）`,
      ].filter(Boolean);
      this.results.set(lib.slug, parts.length > 0 ? parts.join("；") : "已是最新");
    } catch (e) {
      this.results.set(lib.slug, `${errorText(e)}（可再按一次重試）`);
    } finally {
      await this.deps.saveSettings();
      this.busy = null;
      this.progress = "";
      this.render();
    }
  }
}
