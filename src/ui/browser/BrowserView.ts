// Right-sidebar article browser (V1-3): list, filters, batch load into notes.
import { ItemView, normalizePath, setIcon, type WorkspaceLeaf } from "obsidian";
import { readRfKey } from "../../core/note/parse";
import { notePath, renderNote } from "../../core/note/render";
import { NoTranscriptError } from "../../core/ted/talkPage";
import { NO_TRANSCRIPT } from "../../core/ted/noTranscript";
import { RF_READ_KEY, type ReadingFeedSettings, type StatusFilter, type TalkSummary } from "../../core/types";
import {
  collectTopics, EMPTY_FILTER, filterTalks, formatDuration, isUnavailable, loadedKey, tedKey, uniquePath,
  type BrowserFilter, type LengthFilter, type StatusContext,
} from "../../core/browser/logic";
import type { TedClient } from "../../services/ted/TedClient";

export const BROWSER_VIEW_TYPE = "reading-feed-browser";

/** Keep fetching while fewer than this many items are visible. */
const MIN_VISIBLE = 8;
/** Stop auto-fetching after this many consecutive pages with no new visible item. */
const MAX_STALE_PAGES = 5;

export interface BrowserDeps {
  client: TedClient;
  getSettings: () => ReadingFeedSettings;
  /** Persist the (mutated) settings object. */
  saveSettings?: () => Promise<void>;
}

export const FAVORITES_CHANGED = "reading-feed:favorites-changed";
/** Distance (px) from the bottom at which the next page is fetched. */
const NEAR_BOTTOM = 300;

type FillMode = "manual" | "scroll" | "auto";

const STATUS_LABELS: [StatusFilter, string][] = [
  ["all", "狀態：全部"],
  ["unloaded", "未載入"],
  ["unread", "已載入未讀"],
  ["read", "已讀"],
  ["favorite", "收藏"],
];

const LENGTH_LABELS: [LengthFilter, string][] = [
  ["all", "長度：全部"],
  ["lt10", "< 10 分"],
  ["10to20", "10–20 分"],
  ["gt20", "> 20 分"],
];

export class BrowserView extends ItemView {
  private items: TalkSummary[] = [];
  private endCursor: string | null = null;
  private hasNext = true;
  private started = false;
  private fetching = false;
  private stalled = false;
  private busy = false; // note-loading in progress
  private listError = "";
  private filter: BrowserFilter = { ...EMPTY_FILTER };
  private selected = new Set<string>();
  private loaded = new Set<string>();
  private read = new Set<string>();
  private scanTimer: number | null = null;
  private failures: { title: string; reason: string }[] = [];
  private progress = "";

  private topicSel!: HTMLSelectElement;
  private listEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private moreBtn!: HTMLButtonElement;
  private loadBtn!: HTMLButtonElement;
  private resultEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private readonly deps: BrowserDeps) {
    super(leaf);
  }

  getViewType(): string {
    return BROWSER_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Reading Feed";
  }
  getIcon(): string {
    return "newspaper";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("rf-browser");
    this.scanVault();

    const bar = root.createDiv("rf-browser-filters");
    this.topicSel = bar.createEl("select", { cls: "dropdown rf-filter-topic" });
    this.topicSel.onchange = () => {
      this.filter.topic = this.topicSel.value;
      this.onFilterChanged();
    };
    const kw = bar.createEl("input", { type: "text", cls: "rf-filter-keyword", placeholder: "標題／講者" });
    kw.oninput = () => {
      this.filter.keyword = kw.value;
      this.onFilterChanged();
    };
    const statusSel = bar.createEl("select", { cls: "dropdown rf-filter-status" });
    for (const [v, label] of STATUS_LABELS) statusSel.createEl("option", { value: v, text: label });
    statusSel.onchange = () => {
      this.filter.status = statusSel.value as StatusFilter;
      this.onFilterChanged();
    };
    const lenSel = bar.createEl("select", { cls: "dropdown rf-filter-length" });
    for (const [v, label] of LENGTH_LABELS) lenSel.createEl("option", { value: v, text: label });
    lenSel.onchange = () => {
      this.filter.length = lenSel.value as LengthFilter;
      this.onFilterChanged();
    };

    this.listEl = root.createDiv("rf-browser-list");
    this.listEl.addEventListener("scroll", this.onScroll, { passive: true });
    root.addEventListener("scroll", this.onScroll, { passive: true });
    this.statusEl = root.createDiv("rf-browser-status");
    this.moreBtn = root.createEl("button", { cls: "rf-browser-more", text: "再載入更多" });
    this.moreBtn.onclick = () => {
      this.stalled = false;
      void this.fill("manual");
    };

    const foot = root.createDiv("rf-browser-foot");
    this.loadBtn = foot.createEl("button", { cls: "mod-cta rf-browser-load" });
    this.loadBtn.onclick = () => void this.loadSelected();
    this.resultEl = foot.createDiv("rf-browser-result");

    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
        this.scanTimer = window.setTimeout(() => {
          this.scanTimer = null;
          this.scanVault();
          this.renderList();
        }, 300);
      }),
    );
    this.registerEvent(this.app.workspace.on(FAVORITES_CHANGED as "quit", () => this.renderList()));

    this.renderAll();
    if (!this.started) {
      this.started = true;
      await this.fill("manual");
    }
    this.checkBottom();
  }

  async onClose(): Promise<void> {
    this.listEl?.removeEventListener("scroll", this.onScroll);
    this.contentEl.removeEventListener("scroll", this.onScroll);
    if (this.scanTimer !== null) window.clearTimeout(this.scanTimer);
  }

  // ---- data ----

  /** Build the loaded-set from rf-source + rf-id frontmatter of every note (METHOD §1). */
  private scanVault(): void {
    const { vault, metadataCache } = this.app;
    this.loaded.clear();
    this.read.clear();
    for (const f of vault.getMarkdownFiles()) {
      const fm = metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined;
      const key = readRfKey(fm);
      if (!key) continue;
      const k = loadedKey(key.source, key.id);
      this.loaded.add(k);
      const r = fm?.[RF_READ_KEY];
      if (r !== undefined && r !== null && r !== "" && r !== false) this.read.add(k);
    }
  }

  private statusContext(): StatusContext {
    return { loaded: this.loaded, read: this.read, favorites: new Set(this.deps.getSettings().favorites) };
  }

  private visible(): TalkSummary[] {
    return filterTalks(this.items, this.filter, this.statusContext(), NO_TRANSCRIPT);
  }

  private readonly onScroll = (): void => this.checkBottom();

  /** Fetch the next page when either scroll container is near its bottom (or not scrollable). */
  private checkBottom(): void {
    if (!this.listEl || this.fetching || !this.hasNext) return;
    const near = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (near(this.listEl) && near(this.contentEl)) void this.fill("scroll");
  }

  private onFilterChanged(): void {
    this.stalled = false;
    this.renderList();
    void this.fill("auto");
  }

  /**
   * Fetch pages until enough items are visible. `manual` (button / first load) and `scroll`
   * (reached the bottom) fetch at least one page regardless of the visible count; `manual`
   * also overrides a stalled state.
   */
  private async fill(mode: FillMode): Promise<void> {
    if (this.fetching || !this.hasNext || (this.stalled && mode !== "manual")) return;
    const forceFirst = mode !== "auto";
    const visibleBefore = this.visible().length;
    this.fetching = true;
    this.listError = "";
    this.renderStatus();
    try {
      let stale = 0;
      let first = true;
      while (this.hasNext && stale < MAX_STALE_PAGES && ((first && forceFirst) || this.visible().length < MIN_VISIBLE)) {
        first = false;
        const before = this.visible().length;
        const page = await this.deps.client.listPage(this.endCursor);
        const seen = new Set(this.items.map((i) => i.slug));
        this.items.push(...page.items.filter((i) => !seen.has(i.slug)));
        this.endCursor = page.endCursor;
        this.hasNext = page.hasNextPage;
        this.refreshTopics();
        this.renderList();
        stale = this.visible().length > before ? 0 : stale + 1;
        if (mode !== "manual" && this.visible().length >= MIN_VISIBLE) break;
      }
      this.stalled = this.hasNext && stale >= MAX_STALE_PAGES;
    } catch (e) {
      this.listError = `載入列表失敗：${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.fetching = false;
      this.renderStatus();
    }
    // Still near the bottom (list too short to scroll)? Fetch again, but only while progress is made.
    if (!this.listError && this.visible().length > visibleBefore) this.checkBottom();
  }

  private async ensureFolder(path: string): Promise<void> {
    const { vault } = this.app;
    let cur = "";
    for (const part of normalizePath(path).split("/").filter(Boolean)) {
      cur = cur === "" ? part : `${cur}/${part}`;
      if (!vault.getAbstractFileByPath(cur)) await vault.createFolder(cur);
    }
  }

  private async loadSelected(): Promise<void> {
    if (this.busy) return;
    const todo = this.items.filter((i) => this.selected.has(i.slug) && !this.loaded.has(tedKey(i.slug)));
    if (todo.length === 0) return;
    this.busy = true;
    this.failures = [];
    const { vault } = this.app;
    const folder = this.deps.getSettings().folder;
    let done = 0;
    let ok = 0;
    for (const item of todo) {
      this.progress = `${done} / ${todo.length}`;
      this.renderFooter();
      try {
        const talk = await this.deps.client.fetchTalk(item.slug);
        const wanted = normalizePath(notePath(folder, talk.meta));
        await this.ensureFolder(wanted.slice(0, wanted.lastIndexOf("/")));
        const path = uniquePath(wanted, (p) => vault.getAbstractFileByPath(p) !== null);
        await vault.create(path, renderNote(talk));
        this.loaded.add(tedKey(item.slug));
        this.selected.delete(item.slug);
        ok++;
        this.renderList();
      } catch (e) {
        this.selected.delete(item.slug);
        if (e instanceof NoTranscriptError) await this.markNoTranscript(item.slug);
        const reason = e instanceof NoTranscriptError ? "沒有英文逐字稿" : e instanceof Error ? e.message : String(e);
        this.failures.push({ title: item.title, reason });
      }
      done++;
    }
    this.progress = `完成：成功 ${ok}／失敗 ${this.failures.length}`;
    this.busy = false;
    this.renderList();
  }

  private async markNoTranscript(slug: string): Promise<void> {
    const s = this.deps.getSettings();
    if (s.noTranscript.includes(slug)) return;
    s.noTranscript.push(slug);
    await this.deps.saveSettings?.();
  }

  private async toggleFavorite(slug: string): Promise<void> {
    const s = this.deps.getSettings();
    const key = tedKey(slug);
    const i = s.favorites.indexOf(key);
    if (i >= 0) s.favorites.splice(i, 1);
    else s.favorites.push(key);
    await this.deps.saveSettings?.();
    this.app.workspace.trigger(FAVORITES_CHANGED);
    this.renderList();
  }

  // ---- rendering ----

  private renderAll(): void {
    this.refreshTopics();
    this.renderList();
    this.renderStatus();
  }

  private refreshTopics(): void {
    if (!this.topicSel) return;
    const topics = collectTopics(this.items);
    this.topicSel.empty();
    this.topicSel.createEl("option", { value: "", text: "分類：全部" });
    for (const t of topics) this.topicSel.createEl("option", { value: t, text: t });
    this.topicSel.value = topics.includes(this.filter.topic) ? this.filter.topic : "";
  }

  private renderList(): void {
    const prevTop = this.listEl.scrollTop;
    this.listEl.empty();
    for (const item of this.visible()) this.renderRow(item);
    this.listEl.scrollTop = prevTop;
    this.renderFooter();
  }

  private renderRow(item: TalkSummary): void {
    const isLoaded = this.loaded.has(tedKey(item.slug));
    const unavailable = !isLoaded && isUnavailable(item.slug, this.deps.getSettings().noTranscript);
    const row = this.listEl.createDiv({
      cls: "rf-row" + (isLoaded ? " rf-row-loaded" : "") + (unavailable ? " rf-row-unavailable" : ""),
    });
    const cb = row.createEl("input", { type: "checkbox", cls: "rf-row-check" });
    cb.checked = isLoaded || this.selected.has(item.slug);
    cb.disabled = isLoaded || unavailable || this.busy;
    cb.onchange = () => {
      if (cb.checked) this.selected.add(item.slug);
      else this.selected.delete(item.slug);
      this.renderFooter();
    };
    if (item.thumbnail) {
      row.createEl("img", { cls: "rf-row-thumb", attr: { src: item.thumbnail, loading: "lazy", alt: "" } });
    } else {
      row.createDiv("rf-row-thumb rf-row-thumb-empty");
    }
    const body = row.createDiv("rf-row-body");
    body.createDiv({ cls: "rf-row-title", text: item.title });
    body.createDiv({ cls: "rf-row-meta", text: `${item.speaker} · ${item.published} · ${formatDuration(item.duration)}` });
    const tags = body.createDiv("rf-row-tags");
    if (isLoaded) tags.createSpan({ cls: "rf-tag rf-tag-loaded", text: "已載入" });
    if (unavailable) tags.createSpan({ cls: "rf-tag rf-tag-warn", text: "沒有英文逐字稿" });
    for (const t of item.topics) tags.createSpan({ cls: "rf-tag", text: t });

    const fav = this.deps.getSettings().favorites.includes(tedKey(item.slug));
    const bm = row.createDiv({
      cls: "rf-bookmark" + (fav ? " is-active" : ""),
      attr: { "aria-label": fav ? "取消收藏" : "收藏", role: "button" },
    });
    setIcon(bm, "bookmark");
    bm.onclick = () => void this.toggleFavorite(item.slug);
  }

  private renderStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.setText(
      this.listError ||
        (this.fetching ? "載入中…" : !this.hasNext ? `已到底（共 ${this.items.length} 篇）` : this.visible().length === 0 && this.items.length > 0 ? "沒有符合的項目" : ""),
    );
    this.statusEl.toggleClass("rf-error", this.listError !== "");
    const showMore = this.hasNext && !this.fetching && (this.stalled || this.listError !== "");
    this.moreBtn.toggleClass("rf-hidden", !showMore);
  }

  private renderFooter(): void {
    if (!this.loadBtn) return;
    const n = this.items.filter((i) => this.selected.has(i.slug) && !this.loaded.has(tedKey(i.slug))).length;
    this.loadBtn.setText(`載入 (${n})`);
    this.loadBtn.disabled = this.busy || n === 0;
    this.resultEl.empty();
    if (this.progress) this.resultEl.createDiv({ text: this.progress });
    if (this.failures.length > 0 && !this.busy) {
      this.resultEl.createDiv({ cls: "rf-error", text: "失敗清單：" });
      const ul = this.resultEl.createEl("ul", { cls: "rf-fail-list" });
      for (const f of this.failures) ul.createEl("li", { text: `${f.title} — ${f.reason}` });
    }
  }
}

