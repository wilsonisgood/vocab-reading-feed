// Playback bar at the top of a reading view (METHOD §3.1).
import type { PlayerService } from "../../services/player/PlayerService";
import { showResume } from "../../services/player/logic";

export const SPEEDS = [0.75, 1, 1.25, 1.5];

export interface Bar {
  el: HTMLElement;
  update(): void;
}

export function createBar(player: PlayerService, onResume: () => void): Bar {
  const el = createDiv({ cls: "rf-bar" });
  const play = el.createEl("button", { cls: "rf-bar-play" });
  const pos = el.createSpan({ cls: "rf-bar-pos" });
  const speed = el.createEl("button", { cls: "rf-bar-speed", attr: { "aria-label": "播放速度" } });
  const follow = el.createEl("button", { cls: "rf-bar-follow", text: "跟隨", attr: { "aria-label": "跟隨捲動" } });
  const stop = el.createEl("button", { cls: "rf-bar-stop", text: "■", attr: { "aria-label": "停止" } });
  const back = el.createEl("button", { cls: "rf-bar-resume", text: "回到朗讀位置" });

  play.addEventListener("click", () => player.toggle());
  speed.addEventListener("click", () => {
    const i = SPEEDS.indexOf(player.speed);
    player.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  });
  follow.addEventListener("click", () => player.setFollowEnabled(!player.followState.enabled));
  stop.addEventListener("click", () => player.stop());
  back.addEventListener("click", onResume);

  const update = () => {
    play.setText(player.playing ? "⏸" : "▶");
    const n = player.paragraphs.length;
    pos.setText(`${Math.max(player.currentIndex + 1, 0)} / ${n}`);
    speed.setText(`${player.speed}x`);
    follow.toggleClass("is-active", player.followState.enabled);
    back.toggleClass("rf-hidden", !showResume(player.followState));
  };
  update();
  return { el, update };
}
