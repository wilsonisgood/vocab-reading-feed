// Reading-mode glue (METHOD §3): ▶ per paragraph, playback bar, follow-scroll.
import { MarkdownView, Platform, TFile, type App, type HeadingCache, type Plugin, type MarkdownPostProcessorContext } from "obsidian";
import type { HttpPort } from "../../core/ports";
import { RF_READ_KEY, type ParagraphTime, type ReadingFeedSettings } from "../../core/types";
import { parseTimestamps, readRfKey, timestampTexts } from "../../core/note/parse";
import { PlayerService } from "../../services/player/PlayerService";
import { attachHls } from "../../services/player/hlsAttach";
import { loadedKey } from "../../core/browser/logic";
import { createBar, type Bar, type BarActions } from "./bar";
import { afterEndNote, neighborNote, todayString, type NoteRef } from "./logic";

interface NoteInfo {
  mtime: number;
  audioUrl: string;
  times: ParagraphTime[];
  /** Paragraph text per timestamp (card's "now reading" line). */
  texts: string[];
}

export function createPlayer(plugin: Plugin, http: HttpPort, getSettings: () => ReadingFeedSettings): PlayerService {
  const player = new PlayerService({
    createAudio: () => document.createElement("audio"),
    attachHls,
    http,
    getSettings,
  });
  plugin.register(() => player.destroy());
  return player;
}

/** loadedKey of the note in the player (for the browser list), or null. */
export function nowPlaying(app: App, player: PlayerService): { key: string; playing: boolean } | null {
  const f = player.notePath === null ? null : app.vault.getAbstractFileByPath(player.notePath);
  if (!(f instanceof TFile)) return null;
  const k = readRfKey(app.metadataCache.getFileCache(f)?.frontmatter as Record<string, unknown> | undefined);
  return k ? { key: loadedKey(k.source, k.id), playing: player.playing } : null;
}

export function installReading(
  plugin: Plugin,
  player: PlayerService,
  getSettings: () => ReadingFeedSettings,
  saveSettings?: () => Promise<void>,
): void {
  const app = plugin.app;
  const cache = new Map<string, NoteInfo>();
  const bars = new Map<MarkdownView, { path: string; bar: Bar }>();

  /** Timestamp table keyed by path + mtime; filled before any ▶ exists, so clicks stay synchronous. */
  async function getInfo(file: TFile, fm: Record<string, unknown> | undefined): Promise<NoteInfo | null> {
    if (!readRfKey(fm)) return null;
    const audioUrl = fm?.["rf-audio"];
    if (typeof audioUrl !== "string" || audioUrl === "") return null;
    const hit = cache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime && hit.audioUrl === audioUrl) return hit;
    const text = await app.vault.cachedRead(file);
    const times = parseTimestamps(text);
    const info = { mtime: file.stat.mtime, audioUrl, times, texts: timestampTexts(text, times) };
    cache.set(file.path, info);
    return info;
  }

  function previewViews(path: string | null): MarkdownView[] {
    if (path === null) return [];
    return app.workspace
      .getLeavesOfType("markdown")
      .map((l) => l.view)
      .filter((v): v is MarkdownView => v instanceof MarkdownView && v.file?.path === path);
  }

  /** Playback entered a folded section: unfold it so the highlight is visible (METHOD §1.1). True if it did. */
  function unfoldSectionOf(view: MarkdownView, line: number): boolean {
    const head = sectionHeads(view.file).filter((h) => h.position.start.line < line).pop();
    if (!head) return false;
    let done = false;
    for (const h of Array.from(view.containerEl.querySelectorAll<HTMLElement>("h2[data-heading]"))) {
      if (h.getAttribute("data-heading") !== head.heading) continue;
      const block = h.closest<HTMLElement>(".is-collapsed");
      const icon = block?.querySelector<HTMLElement>(".heading-collapse-indicator");
      if (icon) {
        icon.click();
        done = true;
      }
    }
    return done;
  }

  /** Highlight the active paragraph; scroll to it when following. */
  function syncView(scroll: boolean): void {
    const path = player.notePath;
    const active = player.paragraphs[player.currentIndex];
    for (const view of previewViews(path)) {
      if (view.getMode() !== "preview") continue;
      const root = view.containerEl;
      root.querySelectorAll(".rf-active").forEach((n) => n.removeClass("rf-active"));
      if (!active) continue;
      if (unfoldSectionOf(view, active.line)) {
        // The section's paragraphs are drawn after the click; highlight / scroll once they exist.
        window.setTimeout(() => syncView(scroll), 150);
        continue;
      }
      const target = root.querySelector<HTMLElement>(`[data-rf-idx="${player.currentIndex}"]`);
      target?.addClass("rf-active");
      if (!scroll || !player.followActive) continue;
      if (target?.isConnected) {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        // Virtualized: no DOM yet, scroll by source line (METHOD §3.3).
        (view.previewMode as unknown as { applyScroll(line: number): void }).applyScroll(active.line);
      }
    }
  }

  /** rf frontmatter of a view's note, or null when it is not a loaded note. */
  function rfFm(file: TFile | null): Record<string, unknown> | null {
    if (!file) return null;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    return readRfKey(fm) ? (fm as Record<string, unknown>) : null;
  }

  /** Point the player at a note synchronously (iOS: must stay inside the tap; METHOD §3.2). Times fill in async. */
  function loadSync(file: TFile): ParagraphTime[] | null {
    const fm = rfFm(file);
    const url = fm?.["rf-audio"];
    if (typeof url !== "string" || url === "") return null;
    const times = cache.get(file.path)?.times ?? [];
    player.load(file.path, url, times);
    if (times.length === 0) {
      void getInfo(file, fm as Record<string, unknown>).then((info) => {
        if (info && player.notePath === file.path) player.load(file.path, info.audioUrl, info.times);
      });
    }
    return times;
  }

  function startNote(file: TFile): void {
    const times = loadSync(file);
    if (times === null) return;
    if (times.length > 0) player.playFrom(0);
    else player.playStart();
  }

  function siblings(file: TFile): NoteRef[] {
    const out: NoteRef[] = [];
    for (const c of file.parent?.children ?? []) {
      if (!(c instanceof TFile) || c.extension !== "md") continue;
      const fm = rfFm(c);
      // Chapters not narrated yet (no rf-audio, METHOD §5) are not "next".
      if (fm && hasAudio(fm)) out.push({ path: c.path, name: c.name, published: fm["published"] });
    }
    return out;
  }

  function goNote(view: MarkdownView, dir: -1 | 1): void {
    const file = targetFile(view);
    if (!file) return;
    const n = neighborNote(siblings(file), file.path, dir);
    const target = n && app.vault.getAbstractFileByPath(n.path);
    if (!(target instanceof TFile)) return;
    startNote(target); // synchronous part first
    void view.leaf.openFile(target);
  }

  /** Start `target` and show it where `from` was showing, so follow-along keeps working. */
  function moveOn(from: TFile, target: TFile): void {
    const views = target === from ? [] : previewViews(from.path);
    startNote(target); // synchronous part first
    for (const v of views) void v.leaf.openFile(target);
  }

  /** Lock screen ⏮ / ⏭: previous / next note of the one in the player, wrapping at the ends. */
  function skipPlaying(dir: -1 | 1): void {
    const file = fileAt(player.notePath);
    const n = file && neighborNote(siblings(file), file.path, dir, true);
    const target = n ? fileAt(n.path) : null;
    if (file && target) moveOn(file, target);
  }

  /** Track finished: continue per `afterEnd` (METHOD §3.1). Runs in the ended event, so it also works while locked. */
  function onEnded(): void {
    const s = getSettings();
    if (s.playMode !== "toEnd") return; // "only this paragraph" never chains on
    const file = fileAt(player.notePath);
    const n = file && afterEndNote(siblings(file), file.path, s.afterEnd);
    const target = n ? fileAt(n.path) : null;
    if (file && target) moveOn(file, target);
  }

  // Lock screen / Control Center: title, cover, ⏯ ⏮ ⏭ (METHOD §3.1).
  const media = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  let mediaPath: string | null = null;
  function syncMediaSession(): void {
    if (!media) return;
    const file = fileAt(player.notePath);
    if (file?.path !== mediaPath) {
      mediaPath = file?.path ?? null;
      const fm = rfFm(file);
      const cover = fm?.["cover"] ?? fm?.["thumbnail"];
      try {
        media.metadata = file
          ? new MediaMetadata({
              title: noteTitle(file),
              artist: fmString(fm, "speaker") || fmString(fm, "author"),
              album: fmString(fm, "book") || "Reading Feed",
              artwork: typeof cover === "string" && cover !== "" ? [{ src: cover }] : [],
            })
          : null;
      } catch {
        // MediaMetadata missing on this platform: the controls still work without it.
      }
    }
    media.playbackState = file ? (player.playing ? "playing" : "paused") : "none";
  }
  const mediaActions: [MediaSessionAction, () => void][] = [
    ["play", () => { if (!player.playing) player.toggle(); }],
    ["pause", () => { if (player.playing) player.toggle(); }],
    ["previoustrack", () => skipPlaying(-1)],
    ["nexttrack", () => skipPlaying(1)],
  ];
  // iOS shows its own ±skip buttons over ⏮ ⏭ unless the seek actions are explicitly cleared.
  const clearedActions: MediaSessionAction[] = ["seekbackward", "seekforward", "seekto"];
  /** (Re)register on every play: iOS may drop the handlers when a new source loads. */
  function bindMediaActions(): void {
    for (const action of clearedActions) {
      try {
        media?.setActionHandler(action, null);
      } catch {
        // Unsupported action on this platform.
      }
    }
    for (const [action, cb] of mediaActions) {
      try {
        media?.setActionHandler(action, cb);
      } catch {
        // Unsupported action on this platform.
      }
    }
  }
  bindMediaActions();

  function hasAudio(fm: Record<string, unknown>): boolean {
    return fmString(fm, "rf-audio") !== "";
  }

  function fmString(fm: Record<string, unknown> | null, key: string): string {
    const v = fm?.[key];
    return typeof v === "string" ? v : "";
  }

  function fileAt(path: string | null): TFile | null {
    const f = path === null ? null : app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  /** The dock acts on the playing note when there is one, else on the view's own note. */
  function targetFile(view: MarkdownView): TFile | null {
    return fileAt(player.notePath) ?? view.file;
  }

  function noteTitle(file: TFile | null): string {
    const t = rfFm(file)?.["title"];
    return typeof t === "string" && t !== "" ? t : file?.basename ?? "";
  }

  /** Level-2 headings of a note (the ~3 min sections, METHOD §1.1). */
  function sectionHeads(file: TFile | null): HeadingCache[] {
    return (file ? (app.metadataCache.getFileCache(file)?.headings ?? []) : []).filter((h) => h.level === 2);
  }

  /** "第 2 / 5 節" for the section holding `line`; "" for notes without sections (rf-schema 1). */
  function sectionLabel(file: TFile | null, line: number | undefined): string {
    const heads = sectionHeads(file);
    if (heads.length === 0 || line === undefined) return "";
    const n = heads.filter((h) => h.position.start.line < line).length;
    return n > 0 ? `第 ${n} / ${heads.length} 節` : "";
  }

  /** Open the playing note (reuse a tab that already shows it), then scroll to the current paragraph. */
  function jumpToPlaying(view: MarkdownView): void {
    const file = fileAt(player.notePath);
    if (!file) return;
    const open = previewViews(file.path)[0];
    if (open) {
      app.workspace.setActiveLeaf(open.leaf, { focus: true });
      player.resumeFollow();
      syncView(true);
      return;
    }
    void view.leaf.openFile(file).then(() => {
      player.resumeFollow();
      window.setTimeout(() => syncView(true), 300);
    });
  }

  function makeActions(view: MarkdownView): BarActions {
    const neighbor = (dir: -1 | 1) => {
      const f = targetFile(view);
      return f ? neighborNote(siblings(f), f.path, dir) : null;
    };
    return {
      prevNote: () => goNote(view, -1),
      nextNote: () => goNote(view, 1),
      prevPara: () => paraStep(view, -1),
      nextPara: () => paraStep(view, 1),
      toggle: () => {
        if (player.notePath !== null) player.toggle();
        else if (view.file) startNote(view.file);
      },
      playHere: () => {
        if (view.file) startNote(view.file);
      },
      jump: () => jumpToPlaying(view),
      resume: () => {
        player.resumeFollow();
        syncView(true);
      },
      stop: () => player.stop(),
      hasPrev: () => neighbor(-1) !== null,
      hasNext: () => neighbor(1) !== null,
      count: () => cache.get(targetFile(view)?.path ?? "")?.times.length ?? 0,
      info: () => {
        const f = targetFile(view);
        const texts = f ? cache.get(f.path)?.texts : undefined;
        const snippet = player.notePath !== null ? (texts?.[player.currentIndex] ?? "") : "";
        return {
          title: noteTitle(f),
          snippet,
          section: player.notePath !== null ? sectionLabel(f, player.paragraphs[player.currentIndex]?.line) : "",
          elsewhere: player.notePath !== null && player.notePath !== view.file?.path,
        };
      },
      getPos: () => getSettings().dockPos[Platform.isMobile ? "mobile" : "desktop"],
      setPos: (p) => {
        getSettings().dockPos[Platform.isMobile ? "mobile" : "desktop"] = p;
        void saveSettings?.();
        bars.forEach((b) => b.bar.update());
      },
    };
  }

  function paraStep(view: MarkdownView, dir: -1 | 1): void {
    if (player.notePath === null && (!view.file || loadSync(view.file) === null)) return;
    player.step(dir);
  }

  /** Floating dock on every rf note in reading mode; `rf-note` class hides the properties block. */
  function refreshBars(): void {
    const seen = new Set<MarkdownView>();
    for (const leaf of app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const fm = rfFm(view.file);
      view.containerEl.toggleClass("rf-note", fm !== null);
      if (!fm || !hasAudio(fm) || view.getMode() !== "preview") continue;
      seen.add(view);
      let entry = bars.get(view);
      if (entry && entry.path !== view.file?.path) {
        entry.bar.el.remove();
        entry = undefined;
      }
      if (!entry) {
        entry = { path: view.file?.path ?? "", bar: createBar(player, view.file?.path ?? "", makeActions(view)) };
        bars.set(view, entry);
      }
      if (entry.bar.el.parentElement !== view.contentEl) view.contentEl.appendChild(entry.bar.el);
      entry.bar.update();
    }
    for (const [view, entry] of bars) {
      if (!seen.has(view) || !view.containerEl.isConnected) {
        entry.bar.el.remove();
        bars.delete(view);
      }
    }
  }

  // Auto reading mode: switch once when a loaded note is opened (METHOD §3.1).
  const autoDone = new WeakMap<object, string>();
  function tryAutoPreview(file: TFile | null): void {
    if (!file || !getSettings().autoReadingMode || !rfFm(file)) return;
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== file.path || autoDone.get(view.leaf) === file.path) return;
    autoDone.set(view.leaf, file.path);
    if (view.getMode() === "preview") return;
    const st = view.leaf.getViewState();
    void view.leaf.setViewState({ ...st, state: { ...st.state, mode: "preview" } });
  }

  // First play of a note stamps rf-read once (METHOD §1, §3.4).
  const readMarked = new Set<string>();
  function markRead(): void {
    const path = player.notePath;
    if (path === null || readMarked.has(path)) return;
    readMarked.add(path);
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      void app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm[RF_READ_KEY] ??= todayString();
      });
    }
  }

  function addPlayButton(target: HTMLElement, path: string, info: NoteInfo, idx: number): void {
    target.dataset.rfIdx = String(idx);
    if (player.notePath === path && player.currentIndex === idx) target.addClass("rf-active");
    if (target.querySelector(":scope > .rf-play")) return;
    const btn = createEl("button", { cls: "rf-play", text: "▶", attr: { "aria-label": "從這段開始播放" } });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Everything below is synchronous: iOS only starts audio inside the tap (METHOD §3.2).
      const fresh = cache.get(path) ?? info;
      if (idx >= fresh.times.length) return;
      player.load(path, fresh.audioUrl, fresh.times);
      player.playFrom(idx);
    });
    target.prepend(btn);
  }

  function addSectionButton(h: HTMLElement, path: string, info: NoteInfo, idx: number): void {
    if (h.querySelector(":scope > .rf-play")) return;
    const btn = createEl("button", { cls: ["rf-play", "rf-play-section"], text: "▶", attr: { "aria-label": "從這一節開始播放" } });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fresh = cache.get(path) ?? info;
      if (idx >= fresh.times.length) return;
      player.load(path, fresh.audioUrl, fresh.times);
      player.playFrom(idx);
    });
    h.append(btn); // after the text: the fold arrow sits where a leading ▶ would be
  }

  plugin.registerMarkdownPostProcessor(async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    if (!readRfKey(ctx.frontmatter)) return;
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    const info = await getInfo(file, ctx.frontmatter);
    const sec = ctx.getSectionInfo(el);
    if (!info || !sec) return;
    // Key by ordinal, not line: frontmatter writes (rf-read) shift the lines of rendered sections.
    // Lines come from our own table (fresh per mtime): `sec.text` can still be "" at this point.
    const hits: number[] = [];
    info.times.forEach((t, k) => {
      if (t.line >= sec.lineStart && t.line <= sec.lineEnd) hits.push(k);
    });
    if (hits.length === 0) {
      // Section heading (METHOD §1.1): ▶ plays from the section's first small paragraph.
      const h = el.querySelector<HTMLElement>(":scope > h2");
      const first = info.times.findIndex((t) => t.line > sec.lineEnd);
      if (h && first >= 0) addSectionButton(h, file.path, info, first);
      return;
    }
    const items = Array.from(el.querySelectorAll<HTMLElement>(":scope > p, :scope li"));
    if (hits.length > 1 && items.length === hits.length) {
      hits.forEach((idx, i) => addPlayButton(items[i], file.path, info, idx));
    } else {
      addPlayButton(items[0] ?? el, file.path, info, hits[0]);
    }
  });

  // Warm the table as soon as a loaded note is opened.
  const warm = () => {
    const file = app.workspace.getActiveFile();
    if (file) void getInfo(file, app.metadataCache.getFileCache(file)?.frontmatter);
  };
  plugin.registerEvent(
    app.workspace.on("file-open", (f) => {
      warm();
      tryAutoPreview(f);
      refreshBars();
    }),
  );
  plugin.registerEvent(
    app.metadataCache.on("changed", (f) => {
      // Frontmatter of a freshly created note arrives after file-open.
      if (f.path === app.workspace.getActiveFile()?.path) tryAutoPreview(f);
      // rf-read reflows the frontmatter: re-read the playing note's lines for applyScroll.
      if (f.path === player.notePath) {
        void getInfo(f, app.metadataCache.getFileCache(f)?.frontmatter).then((info) => {
          if (info && player.notePath === f.path) player.load(f.path, info.audioUrl, info.times);
        });
      }
      refreshBars();
    }),
  );
  plugin.registerEvent(app.workspace.on("active-leaf-change", () => { warm(); refreshBars(); }));
  plugin.registerEvent(app.workspace.on("layout-change", refreshBars));

  // Manual scroll pauses following (METHOD §3.3).
  const onUserScroll = (e: Event) => {
    const t = e.target;
    if (!(t instanceof Node) || player.notePath === null) return;
    for (const [view, { path, bar }] of bars) {
      if (path === player.notePath && view.contentEl.contains(t) && !bar.el.contains(t)) return player.userScrolled();
    }
  };
  plugin.registerDomEvent(document, "wheel", onUserScroll, { passive: true });
  plugin.registerDomEvent(document, "touchmove", onUserScroll, { passive: true });

  const offs = [
    player.on("index", () => {
      syncView(true);
      bars.forEach((b) => b.bar.update());
    }),
    player.on("follow", () => {
      bars.forEach((b) => b.bar.update());
    }),
    player.on("started", markRead),
    player.on("started", bindMediaActions),
    player.on("state", () => {
      refreshBars();
      syncMediaSession();
    }),
    player.on("ended", onEnded),
  ];
  plugin.register(() => {
    offs.forEach((off) => off());
    for (const [action] of mediaActions) {
      try {
        media?.setActionHandler(action, null);
      } catch {
        // Unsupported action on this platform.
      }
    }
    if (media) media.metadata = null;
    bars.forEach((b) => b.bar.el.remove());
    bars.clear();
    app.workspace.getLeavesOfType("markdown").forEach((l) => l.view.containerEl.removeClass("rf-note"));
  });
  app.workspace.onLayoutReady(refreshBars);
}
