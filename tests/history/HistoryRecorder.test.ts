import { describe, expect, it, vi } from "vitest";
import { HistoryRecorder, type HistoryPlayer } from "../../src/services/history/HistoryRecorder";
import { SESSION_GAP_MS } from "../../src/core/history/logic";
import type { PlayRecord } from "../../src/core/types";

type Ev = "started" | "index" | "state";

class FakePlayer implements HistoryPlayer {
  notePath: string | null = null;
  currentIndex = -1;
  playing = false;
  private h: Record<Ev, Set<() => void>> = { started: new Set(), index: new Set(), state: new Set() };
  on(e: Ev, cb: () => void) {
    this.h[e].add(cb);
    return () => this.h[e].delete(cb);
  }
  emit(e: Ev) {
    this.h[e].forEach((cb) => cb());
  }
  /** Like PlayerService.playFrom: "started" first, then the index moves, then "state". */
  playFrom(path: string, idx: number) {
    if (path !== this.notePath) {
      this.notePath = path;
      this.currentIndex = -1;
      this.emit("index");
    }
    this.playing = true;
    this.emit("started");
    this.currentIndex = idx;
    this.emit("index");
    this.emit("state");
  }
  moveTo(idx: number) {
    this.currentIndex = idx;
    this.emit("index");
  }
  pause() {
    this.playing = false;
    this.emit("state");
  }
  resume() {
    this.playing = true;
    this.emit("started");
    this.emit("state");
  }
  stop() {
    this.playing = false;
    this.notePath = null;
    this.currentIndex = -1;
    this.emit("index");
    this.emit("state");
  }
}

function make() {
  const player = new FakePlayer();
  const hist: Record<string, PlayRecord[]> = {};
  let t = 1_000_000;
  const queued: (() => void)[] = [];
  const save = vi.fn();
  new HistoryRecorder({
    player,
    history: () => hist,
    snippet: (p, i) => `${p}#${i}`,
    save,
    now: () => t,
    defer: (fn) => queued.push(fn),
  });
  const flush = () => queued.splice(0).forEach((fn) => fn());
  return { player, hist, save, flush, advance: (ms: number) => (t += ms), time: () => t };
}

describe("HistoryRecorder", () => {
  it("records the range and where it stopped", () => {
    const { player, hist, flush, advance } = make();
    player.playFrom("a.md", 2);
    flush();
    advance(5000);
    player.moveTo(3);
    advance(5000);
    player.moveTo(4);
    player.pause();
    expect(hist["a.md"]).toHaveLength(1);
    expect(hist["a.md"][0]).toMatchObject({ lo: 2, hi: 4, last: 4, snippet: "a.md#4" });
    expect(hist["a.md"][0].end - hist["a.md"][0].start).toBe(10_000);
  });

  it("a short pause continues the session, a long one starts a new record", () => {
    const { player, hist, flush, advance } = make();
    player.playFrom("a.md", 0);
    flush();
    player.pause();
    advance(SESSION_GAP_MS - 1);
    player.resume();
    flush();
    expect(hist["a.md"]).toHaveLength(1);
    player.pause();
    advance(SESSION_GAP_MS + 1);
    player.playFrom("a.md", 7);
    flush();
    expect(hist["a.md"]).toHaveLength(2);
    expect(hist["a.md"][0]).toMatchObject({ lo: 7, hi: 7, last: 7 });
    expect(hist["a.md"][1]).toMatchObject({ lo: 0, hi: 0 });
  });

  it("stop or another note closes the session", () => {
    const { player, hist, flush } = make();
    player.playFrom("a.md", 0);
    flush();
    player.playFrom("b.md", 1);
    flush();
    player.stop();
    player.playFrom("b.md", 2);
    flush();
    expect(hist["a.md"]).toHaveLength(1);
    expect(hist["b.md"].map((r) => r.lo)).toEqual([2, 1]);
  });

  it("saves on start, pause and stop, and throttles index saves", () => {
    const { player, save, flush, advance } = make();
    player.playFrom("a.md", 0);
    flush();
    expect(save).toHaveBeenCalledTimes(1);
    advance(1000);
    player.moveTo(1);
    expect(save).toHaveBeenCalledTimes(1);
    advance(15_000);
    player.moveTo(2);
    expect(save).toHaveBeenCalledTimes(2);
    player.pause();
    expect(save).toHaveBeenCalledTimes(3);
    player.stop();
    expect(save).toHaveBeenCalledTimes(4);
  });

  it("paused paragraph steps are not listening", () => {
    const { player, hist, flush } = make();
    player.playFrom("a.md", 0);
    flush();
    player.pause();
    player.moveTo(9);
    expect(hist["a.md"][0].hi).toBe(0);
  });
});
