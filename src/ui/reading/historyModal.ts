// Play history panel (METHOD §3.5): folders → notes → their last plays. A modal, styled as a bottom
// sheet on mobile. Opens with the folder of `focusPath` expanded and that note scrolled into view.
import { Modal, setIcon, type App } from "obsidian";
import type { PlayRecord } from "../../core/types";
import { isThisWeek, rangeLabel, spanLabel, whenLabel, type HistoryFolder } from "../../core/history/logic";

export interface HistoryModalDeps {
  folders: HistoryFolder[];
  now: number;
  /** Note to reveal: the one in the player, else the most recently played. */
  focusPath: string | null;
  title(path: string): string;
  /** Runs inside the tap (iOS needs play() there, METHOD §3.2). */
  pick(path: string, rec: PlayRecord): void;
}

export class HistoryModal extends Modal {
  constructor(app: App, private deps: HistoryModalDeps) {
    super(app);
  }

  onOpen(): void {
    const { folders, now, focusPath } = this.deps;
    this.modalEl.addClass("rf-history-modal");
    this.titleEl.setText("播放歷史");
    const root = this.contentEl.createDiv("rf-history");
    if (folders.length === 0) {
      root.createDiv({ cls: "rf-history-empty", text: "還沒有播放紀錄" });
      return;
    }
    let focusEl: HTMLElement | null = null;
    for (const f of folders) {
      const open = focusPath !== null && f.notes.some((n) => n.path === focusPath);
      const box = root.createDiv({ cls: ["rf-history-folder", open ? "is-open" : ""] });
      const head = box.createEl("button", { cls: "rf-history-folder-head" });
      const chev = head.createSpan("rf-history-chev");
      setIcon(chev, "chevron-right");
      head.createSpan({ cls: "rf-history-folder-name", text: f.label });
      head.createSpan({ cls: ["rf-history-when", isThisWeek(f.last, now) ? "is-week" : ""], text: whenLabel(f.last, now) });
      head.addEventListener("click", () => box.toggleClass("is-open", !box.hasClass("is-open")));

      const body = box.createDiv("rf-history-folder-body");
      for (const n of f.notes) {
        const note = body.createDiv("rf-history-note");
        const nh = note.createDiv("rf-history-note-head");
        if (isThisWeek(n.last, now)) nh.createSpan({ cls: "rf-history-dot", attr: { "aria-label": "本週讀過" } });
        nh.createSpan({ cls: "rf-history-note-title", text: this.deps.title(n.path) });
        if (n.path === focusPath) {
          note.addClass("is-focus");
          focusEl = note;
        }
        for (const r of n.records) {
          const row = note.createEl("button", { cls: "rf-history-rec" });
          const range = rangeLabel(r);
          row.createDiv({ cls: "rf-history-rec-meta", text: range ? `${spanLabel(r, now)} · ${range}` : spanLabel(r, now) });
          if (r.snippet) row.createDiv({ cls: "rf-history-rec-snippet", text: r.snippet });
          row.addEventListener("click", () => {
            this.deps.pick(n.path, r);
            this.close();
          });
        }
      }
    }
    const target = focusEl as HTMLElement | null;
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ block: "nearest" }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
