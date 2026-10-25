// Floating player inside a reading view (METHOD §3.1): a grey bubble (blue headphones while
// playing, white otherwise) that expands into a card naming the note that is playing — which
// may be a different note than the one on screen. Draggable; default corner desktop top-right,
// mobile (Platform.isMobile) bottom-right.
import { Menu, Platform, setIcon } from "obsidian";
import type { DockPos } from "../../core/types";
import type { PlayerService } from "../../services/player/PlayerService";
import { showResume } from "../../services/player/logic";
import { cardSide, clampDock } from "./logic";

export const SPEEDS = [0.75, 1, 1.25, 1.5];

/** Bubble radius in px; must match `.rf-dock-bubble` in reading.css. */
const R = 20;
/** Pointer travel (px) that turns a press into a drag. */
const DRAG_SLOP = 5;

/** What the card shows: the playing note when there is one, else this view's note. */
export interface DockInfo {
  title: string;
  /** Current paragraph text ("" when none). */
  snippet: string;
  /** "第 2 / 5 節" ("" when the note has no sections). */
  section: string;
  /** The playing note is not the one in this view. */
  elsewhere: boolean;
}

export interface BarActions {
  prevNote(): void;
  nextNote(): void;
  prevPara(): void;
  nextPara(): void;
  toggle(): void;
  /** Start this view's note (shown while another note is playing). */
  playHere(): void;
  /** Open the playing note. */
  jump(): void;
  resume(): void;
  stop(): void;
  /** Open the play history panel (METHOD §3.5). */
  history(): void;
  hasPrev(): boolean;
  hasNext(): boolean;
  /** Paragraph count of the target note (from cache when it is not the loaded one). */
  count(): number;
  info(): DockInfo;
  getPos(): DockPos | null;
  setPos(p: DockPos): void;
}

export interface Bar {
  el: HTMLElement;
  update(): void;
}

/** Card open/closed carries over when the dock is rebuilt for another note. */
let cardOpen = false;

export function createBar(player: PlayerService, path: string, a: BarActions): Bar {
  const el = createDiv({ cls: ["rf-dock", Platform.isMobile ? "rf-dock-mobile" : "rf-dock-desktop"] });
  const bubble = el.createEl("button", { cls: "rf-dock-bubble", attr: { "aria-label": "播放器" } });
  setIcon(bubble, "headphones");
  const card = el.createDiv("rf-dock-card");

  const btn = (parent: HTMLElement, cls: string, icon: string, label: string, fn: () => void) => {
    const b = parent.createEl("button", { cls: ["rf-dock-btn", cls], attr: { "aria-label": label } });
    setIcon(b, icon);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return b;
  };

  const title = card.createDiv({ cls: "rf-dock-title" });
  title.addEventListener("click", () => {
    if (a.info().elsewhere) a.jump();
  });
  const meta = card.createDiv({ cls: "rf-dock-meta" });
  const snippet = card.createDiv({ cls: "rf-dock-snippet" });

  const ctrl = card.createDiv("rf-dock-ctrl");
  const prevNote = btn(ctrl, "rf-bar-prev-note", "skip-back", "上一篇", () => a.prevNote());
  const prevPara = btn(ctrl, "rf-bar-prev", "chevron-left", "上一段", () => a.prevPara());
  const play = btn(ctrl, "rf-bar-play", "play", "播放／暫停", () => a.toggle());
  const nextPara = btn(ctrl, "rf-bar-next", "chevron-right", "下一段", () => a.nextPara());
  const nextNote = btn(ctrl, "rf-bar-next-note", "skip-forward", "下一篇", () => a.nextNote());
  const more = btn(ctrl, "rf-bar-more", "more-horizontal", "更多", () => undefined);

  // Only while another note is playing.
  const extra = card.createDiv("rf-dock-extra");
  const here = extra.createEl("button", { cls: "rf-dock-text", text: "播放這篇" });
  here.addEventListener("click", () => a.playHere());
  const jump = extra.createEl("button", { cls: "rf-dock-text rf-dock-jump", text: "跳到該篇 ›" });
  jump.addEventListener("click", () => a.jump());

  more.addEventListener("click", (e) => {
    const m = new Menu();
    m.addItem((i) => i.setTitle("播放歷史…").setIcon("history").onClick(() => a.history()));
    m.addSeparator();
    for (const s of SPEEDS) {
      m.addItem((i) => i.setTitle(`${s}x`).setChecked(player.speed === s).onClick(() => player.setSpeed(s)));
    }
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("跟隨捲動").setChecked(player.followState.enabled).onClick(() => player.setFollowEnabled(!player.followState.enabled)),
    );
    if (player.notePath === path && showResume(player.followState)) {
      m.addItem((i) => i.setTitle("回到朗讀位置").setIcon("locate").onClick(() => a.resume()));
    }
    m.addItem((i) => i.setTitle("停止").setIcon("square").onClick(() => a.stop()));
    m.showAtMouseEvent(e);
  });

  // ---- position ----
  const place = () => {
    const p = a.getPos();
    el.toggleClass("rf-dock-placed", p !== null);
    if (p) {
      el.style.left = `calc((100% - ${2 * R}px) * ${p.x})`;
      el.style.top = `calc((100% - ${2 * R}px) * ${p.y})`;
    } else {
      el.style.left = "";
      el.style.top = "";
    }
    const side = cardSide(p ?? (Platform.isMobile ? { x: 1, y: 1 } : { x: 1, y: 0 }));
    el.toggleClass("rf-dock-card-left", side.left);
    el.toggleClass("rf-dock-card-up", side.up);
  };

  // Press-drag-release moves the bubble; a press without travel is a click (toggles the card).
  let drag: { id: number; x0: number; y0: number; dx: number; dy: number; moving: boolean } | null = null;
  let swallowClick = false;
  bubble.addEventListener("pointerdown", (e) => {
    const r = bubble.getBoundingClientRect();
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - (r.left + R), dy: e.clientY - (r.top + R), moving: false };
    bubble.setPointerCapture(e.pointerId);
  });
  const centre = (e: PointerEvent) => {
    const host = el.parentElement?.getBoundingClientRect();
    if (!host || !drag) return null;
    return clampDock(e.clientX - drag.dx - host.left, e.clientY - drag.dy - host.top, host.width, host.height, R);
  };
  bubble.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moving && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_SLOP) return;
    drag.moving = true;
    el.addClass("rf-dock-dragging");
    const p = centre(e);
    if (!p) return;
    el.addClass("rf-dock-placed");
    el.style.left = `calc((100% - ${2 * R}px) * ${p.x})`;
    el.style.top = `calc((100% - ${2 * R}px) * ${p.y})`;
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.moving) {
      const p = centre(e);
      if (p) a.setPos(p);
      swallowClick = true;
    }
    drag = null;
    el.removeClass("rf-dock-dragging");
    place();
  };
  bubble.addEventListener("pointerup", endDrag);
  bubble.addEventListener("pointercancel", endDrag);
  bubble.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    setOpen(!cardOpen);
  });

  const setOpen = (open: boolean) => {
    cardOpen = open;
    el.toggleClass("is-open", open);
  };

  // ---- state ----
  let lastIcon = "";
  const update = () => {
    const target = player.notePath !== null;
    const icon = player.playing ? "pause" : "play";
    if (icon !== lastIcon) {
      setIcon(play, icon);
      lastIcon = icon;
    }
    bubble.toggleClass("is-playing", player.playing);
    el.toggleClass("is-open", cardOpen);
    const info = a.info();
    title.setText(info.title);
    title.toggleClass("is-link", info.elsewhere);
    const n = target ? player.paragraphs.length : a.count();
    const cur = target ? Math.max(player.currentIndex + 1, 0) : 0;
    meta.setText(`${info.section ? `${info.section} · ` : ""}段落 ${cur} / ${n} · ${player.speed}x`);
    snippet.setText(info.snippet);
    snippet.toggleClass("rf-hidden", info.snippet === "");
    prevNote.toggleClass("rf-disabled", !a.hasPrev());
    nextNote.toggleClass("rf-disabled", !a.hasNext());
    prevPara.toggleClass("rf-disabled", n === 0);
    nextPara.toggleClass("rf-disabled", n === 0);
    extra.toggleClass("rf-hidden", !info.elsewhere);
    if (!drag) place();
  };
  update();
  return { el, update };
}
