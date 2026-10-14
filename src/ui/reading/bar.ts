// Floating playback bar inside a reading view (METHOD §3.1). Desktop: near the top;
// mobile (Platform.isMobile): near the bottom, above the safe area.
import { Menu, Platform, setIcon } from "obsidian";
import type { PlayerService } from "../../services/player/PlayerService";
import { showResume } from "../../services/player/logic";

export const SPEEDS = [0.75, 1, 1.25, 1.5];

export interface BarActions {
  prevNote(): void;
  nextNote(): void;
  prevPara(): void;
  nextPara(): void;
  toggle(): void;
  resume(): void;
  stop(): void;
  toggleFavorite(): void;
  isFavorite(): boolean;
  hasPrev(): boolean;
  hasNext(): boolean;
  /** Paragraph count of this view's note (from cache when it is not the loaded one). */
  count(): number;
}

export interface Bar {
  el: HTMLElement;
  update(): void;
}

export function createBar(player: PlayerService, path: string, a: BarActions): Bar {
  const el = createDiv({ cls: ["rf-bar", Platform.isMobile ? "rf-bar-bottom" : "rf-bar-top"] });
  const btn = (cls: string, icon: string, label: string, fn: () => void) => {
    const b = el.createEl("button", { cls: ["rf-bar-btn", cls], attr: { "aria-label": label } });
    setIcon(b, icon);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return b;
  };
  const prevNote = btn("rf-bar-prev-note", "skip-back", "上一篇", () => a.prevNote());
  const prevPara = btn("rf-bar-prev", "chevron-left", "上一段", () => a.prevPara());
  const play = btn("rf-bar-play", "play", "播放／暫停", () => a.toggle());
  const nextPara = btn("rf-bar-next", "chevron-right", "下一段", () => a.nextPara());
  const nextNote = btn("rf-bar-next-note", "skip-forward", "下一篇", () => a.nextNote());
  const pos = el.createSpan({ cls: "rf-bar-pos" });
  const fav = btn("rf-bar-fav", "bookmark", "收藏", () => a.toggleFavorite());
  const more = btn("rf-bar-more", "more-horizontal", "更多", () => undefined);
  const back = el.createEl("button", { cls: ["rf-bar-resume", "rf-hidden"], text: "回到朗讀位置" });
  back.addEventListener("click", () => a.resume());

  more.addEventListener("click", (e) => {
    const m = new Menu();
    for (const s of SPEEDS) {
      m.addItem((i) => i.setTitle(`${s}x`).setChecked(player.speed === s).onClick(() => player.setSpeed(s)));
    }
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("跟隨捲動").setChecked(player.followState.enabled).onClick(() => player.setFollowEnabled(!player.followState.enabled)),
    );
    m.addItem((i) => i.setTitle("停止").setIcon("square").onClick(() => a.stop()));
    m.showAtMouseEvent(e);
  });

  let lastIcon = "";
  const update = () => {
    const mine = player.notePath === path;
    const playing = mine && player.playing;
    const icon = playing ? "pause" : "play";
    if (icon !== lastIcon) {
      setIcon(play, icon);
      lastIcon = icon;
    }
    const n = mine ? player.paragraphs.length : a.count();
    pos.setText(`${mine ? Math.max(player.currentIndex + 1, 0) : 0} / ${n}`);
    fav.toggleClass("is-active", a.isFavorite());
    prevNote.toggleClass("rf-disabled", !a.hasPrev());
    nextNote.toggleClass("rf-disabled", !a.hasNext());
    prevPara.toggleClass("rf-disabled", n === 0);
    nextPara.toggleClass("rf-disabled", n === 0);
    back.toggleClass("rf-hidden", !(mine && showResume(player.followState)));
  };
  update();
  return { el, update };
}
