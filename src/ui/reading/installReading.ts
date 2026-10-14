// Reading-mode glue (METHOD §3): ▶ per paragraph, playback bar, follow-scroll.
import { MarkdownView, TFile, type Plugin, type MarkdownPostProcessorContext } from "obsidian";
import type { HttpPort } from "../../core/ports";
import type { ParagraphTime, ReadingFeedSettings } from "../../core/types";
import { parseLineTimestamp, parseTimestamps, readRfKey } from "../../core/note/parse";
import { PlayerService } from "../../services/player/PlayerService";
import { attachHls } from "../../services/player/hlsAttach";
import { createBar, type Bar } from "./bar";

interface NoteInfo {
  mtime: number;
  audioUrl: string;
  times: ParagraphTime[];
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

export function installReading(plugin: Plugin, player: PlayerService, _getSettings: () => ReadingFeedSettings): void {
  const app = plugin.app;
  const cache = new Map<string, NoteInfo>();
  const bars = new Map<MarkdownView, Bar>();

  /** Timestamp table keyed by path + mtime; filled before any ▶ exists, so clicks stay synchronous. */
  async function getInfo(file: TFile, fm: Record<string, unknown> | undefined): Promise<NoteInfo | null> {
    if (!readRfKey(fm)) return null;
    const audioUrl = fm?.["rf-audio"];
    if (typeof audioUrl !== "string" || audioUrl === "") return null;
    const hit = cache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime && hit.audioUrl === audioUrl) return hit;
    const text = await app.vault.cachedRead(file);
    const info = { mtime: file.stat.mtime, audioUrl, times: parseTimestamps(text) };
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

  /** Highlight the active paragraph; scroll to it when following. */
  function syncView(scroll: boolean): void {
    const path = player.notePath;
    const active = player.paragraphs[player.currentIndex];
    for (const view of previewViews(path)) {
      if (view.getMode() !== "preview") continue;
      const root = view.containerEl;
      root.querySelectorAll(".rf-active").forEach((n) => n.removeClass("rf-active"));
      if (!active) continue;
      const target = root.querySelector<HTMLElement>(`[data-rf-line="${active.line}"]`);
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

  function refreshBars(): void {
    const path = player.notePath;
    const want = new Set(previewViews(path).filter((v) => v.getMode() === "preview"));
    for (const [view, bar] of bars) {
      if (!want.has(view) || !view.containerEl.isConnected) {
        bar.el.remove();
        bars.delete(view);
      }
    }
    for (const view of want) {
      let bar = bars.get(view);
      if (!bar) {
        bar = createBar(player, () => {
          player.resumeFollow();
          syncView(true);
        });
        bars.set(view, bar);
      }
      if (bar.el.parentElement !== view.contentEl) view.contentEl.prepend(bar.el);
      bar.update();
    }
  }

  function addPlayButton(target: HTMLElement, path: string, info: NoteInfo, line: number): void {
    target.dataset.rfLine = String(line);
    const cur = player.paragraphs[player.currentIndex];
    if (player.notePath === path && cur?.line === line) target.addClass("rf-active");
    if (target.querySelector(":scope > .rf-play")) return;
    const btn = createEl("button", { cls: "rf-play", text: "▶", attr: { "aria-label": "從這段開始播放" } });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Everything below is synchronous: iOS only starts audio inside the tap (METHOD §3.2).
      const fresh = cache.get(path) ?? info;
      const idx = fresh.times.findIndex((t) => t.line === line);
      if (idx < 0) return;
      player.load(path, fresh.audioUrl, fresh.times);
      player.playFrom(idx);
    });
    target.prepend(btn);
  }

  plugin.registerMarkdownPostProcessor(async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    if (!readRfKey(ctx.frontmatter)) return;
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    const info = await getInfo(file, ctx.frontmatter);
    const sec = ctx.getSectionInfo(el);
    if (!info || !sec) return;
    const lines = sec.text.split(/\r?\n/);
    const hits: number[] = [];
    for (let i = sec.lineStart; i <= sec.lineEnd && i < lines.length; i++) {
      if (parseLineTimestamp(lines[i]) !== null) hits.push(i);
    }
    if (hits.length === 0) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(":scope > p, :scope li"));
    if (hits.length > 1 && items.length === hits.length) {
      hits.forEach((line, i) => addPlayButton(items[i], file.path, info, line));
    } else {
      addPlayButton(items[0] ?? el, file.path, info, hits[0]);
    }
  });

  // Warm the table as soon as a loaded note is opened.
  const warm = () => {
    const file = app.workspace.getActiveFile();
    if (file) void getInfo(file, app.metadataCache.getFileCache(file)?.frontmatter);
  };
  plugin.registerEvent(app.workspace.on("file-open", () => { warm(); refreshBars(); }));
  plugin.registerEvent(app.workspace.on("active-leaf-change", () => { warm(); refreshBars(); }));
  plugin.registerEvent(app.workspace.on("layout-change", refreshBars));

  // Manual scroll pauses following (METHOD §3.3).
  const onUserScroll = (e: Event) => {
    const t = e.target;
    if (!(t instanceof Node) || player.notePath === null) return;
    for (const [view, bar] of bars) {
      if (view.contentEl.contains(t) && !bar.el.contains(t)) return player.userScrolled();
    }
  };
  plugin.registerDomEvent(document, "wheel", onUserScroll, { passive: true });
  plugin.registerDomEvent(document, "touchmove", onUserScroll, { passive: true });

  const offs = [
    player.on("index", () => syncView(true)),
    player.on("follow", () => {
      bars.forEach((b) => b.update());
    }),
    player.on("state", () => {
      refreshBars();
    }),
  ];
  plugin.register(() => {
    offs.forEach((off) => off());
    bars.forEach((b) => b.el.remove());
    bars.clear();
  });
  app.workspace.onLayoutReady(refreshBars);
}
