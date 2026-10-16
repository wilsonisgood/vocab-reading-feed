import { describe, expect, it, vi } from "vitest";
import { PlayerService, type AudioLike, type HlsAttacher } from "../../src/services/player/PlayerService";
import { DEFAULT_SETTINGS, type PlayMode } from "../../src/core/types";
import type { HttpPort } from "../../src/core/ports";

class FakeAudio implements AudioLike {
  src = "";
  currentTime = 0;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  paused = true;
  native = true;
  plays = 0;
  private h = new Map<string, Set<() => void>>();
  play() {
    this.paused = false;
    this.plays++;
  }
  pause() {
    this.paused = true;
  }
  canPlayType() {
    return this.native ? "maybe" : "";
  }
  addEventListener(t: string, cb: () => void) {
    if (!this.h.has(t)) this.h.set(t, new Set());
    this.h.get(t)!.add(cb);
  }
  removeEventListener(t: string, cb: () => void) {
    this.h.get(t)?.delete(cb);
  }
  end() {
    this.paused = true;
    this.h.get("ended")?.forEach((cb) => cb());
  }
  tick(t: number) {
    this.currentTime = t;
    this.h.get("timeupdate")?.forEach((cb) => cb());
  }
}

const times = [
  { line: 0, start: 1 },
  { line: 2, start: 10 },
  { line: 4, start: 20 },
];
const http = {} as HttpPort;

function make(playMode: PlayMode, native = true) {
  const audio = new FakeAudio();
  audio.native = native;
  const destroy = vi.fn();
  const attachHls: HlsAttacher = vi.fn(() => ({ destroy }));
  const p = new PlayerService({
    createAudio: () => audio,
    attachHls,
    http,
    getSettings: () => ({ ...DEFAULT_SETTINGS, playMode }),
  });
  return { audio, p, attachHls, destroy };
}

describe("PlayerService", () => {
  it("native HLS sets src; otherwise uses hls.js", () => {
    const a = make("toEnd", true);
    a.p.load("a.md", "https://x/a.m3u8", times);
    expect(a.audio.src).toBe("https://x/a.m3u8");
    expect(a.attachHls).not.toHaveBeenCalled();
    const b = make("toEnd", false);
    b.p.load("a.md", "https://x/a.m3u8", times);
    expect(b.attachHls).toHaveBeenCalledTimes(1);
  });

  it("playFrom seeks and calls play() synchronously", () => {
    const { audio, p } = make("toEnd");
    p.load("a.md", "u", times);
    p.playFrom(1);
    expect(audio.plays).toBe(1);
    expect(audio.currentTime).toBe(10);
    expect(p.currentIndex).toBe(1);
  });

  it("toEnd keeps playing past the next paragraph and tracks index", () => {
    const { audio, p } = make("toEnd");
    p.load("a.md", "u", times);
    p.playFrom(0);
    audio.tick(10.2);
    expect(audio.paused).toBe(false);
    expect(p.currentIndex).toBe(1);
  });

  it("paragraph mode pauses at the next start without advancing the index", () => {
    const { audio, p } = make("paragraph");
    p.load("a.md", "u", times);
    p.playFrom(0);
    audio.tick(9);
    expect(audio.paused).toBe(false);
    audio.tick(10.1);
    expect(audio.paused).toBe(true);
    expect(p.currentIndex).toBe(0);
  });

  it("paragraph mode on the last paragraph plays on", () => {
    const { audio, p } = make("paragraph");
    p.load("a.md", "u", times);
    p.playFrom(2);
    audio.tick(500);
    expect(audio.paused).toBe(false);
  });

  it("manual scroll suspends follow; index change resumes", () => {
    const { audio, p } = make("toEnd");
    p.load("a.md", "u", times);
    p.playFrom(0);
    p.userScrolled();
    expect(p.followActive).toBe(false);
    audio.tick(10.5);
    expect(p.followActive).toBe(true);
  });

  it("switching notes swaps source; stop clears", () => {
    const { audio, p, destroy } = make("toEnd", false);
    p.load("a.md", "u1", times);
    p.load("b.md", "u2", times);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(p.notePath).toBe("b.md");
    p.stop();
    expect(p.notePath).toBeNull();
    expect(audio.paused).toBe(true);
  });

  it("emits index events", () => {
    const { audio, p } = make("toEnd");
    const cb = vi.fn();
    p.on("index", cb);
    p.load("a.md", "u", times);
    cb.mockClear();
    p.playFrom(0);
    audio.tick(10.5);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("load with empty times then same source updates times without touching audio", () => {
    const { audio, p } = make("toEnd");
    p.load("a.md", "https://x/a.m3u8", []);
    p.playStart();
    expect(audio.plays).toBe(1);
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 12;
    p.load("a.md", "https://x/a.m3u8", times);
    expect(audio.plays).toBe(1);
    expect(audio.currentTime).toBe(12);
    expect(p.paragraphs).toBe(times);
    expect(p.currentIndex).toBe(1);
  });

  it("step while paused only moves; while playing keeps playing", () => {
    const { audio, p } = make("toEnd");
    p.load("a.md", "https://x/a.m3u8", times);
    p.step(1);
    expect(p.currentIndex).toBe(0);
    expect(audio.plays).toBe(0);
    p.step(1);
    expect(audio.currentTime).toBe(10);
    expect(audio.paused).toBe(true);
    p.playFrom(1);
    p.step(1);
    expect(p.currentIndex).toBe(2);
    expect(audio.plays).toBe(2);
  });

  it("emits started on play requests", () => {
    const { p } = make("toEnd");
    const cb = vi.fn();
    p.on("started", cb);
    p.load("a.md", "https://x/a.m3u8", times);
    p.playFrom(0);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("emits ended when the track finishes, not after stop", () => {
    const { audio, p } = make("toEnd");
    const cb = vi.fn();
    p.on("ended", cb);
    p.load("a.md", "https://x/a.m3u8", times);
    p.playFrom(0);
    audio.end();
    expect(cb).toHaveBeenCalledTimes(1);
    p.stop();
    audio.end();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
