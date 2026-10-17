// The one audio element of the plugin (METHOD §3.1). Platform pieces (audio
// element, hls.js) are injected so this runs in node tests with fakes.
import type { ParagraphTime, ReadingFeedSettings } from "../../core/types";
import type { HttpPort } from "../../core/ports";
import { isHlsUrl } from "../../core/audio";
import { findIndex, followReducer, shouldFollow, stepIndex, stopTimeFor, type FollowEvent, type FollowState } from "./logic";

/** Minimal slice of HTMLAudioElement used here. */
export interface AudioLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  defaultPlaybackRate: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
  removeAttribute?(name: string): void;
  canPlayType(type: string): string;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

export interface HlsHandle {
  destroy(): void;
}

/** Mount an HLS playlist on a media element via MSE; must attach synchronously (iOS-style gesture rules). */
export type HlsAttacher = (audio: AudioLike, url: string, http: HttpPort) => HlsHandle | null;

/**
 * "started" fires each time play() is requested (UI de-duplicates for the read mark, METHOD §3.4).
 * "ended" fires when the track plays through to its end (UI decides what plays next, METHOD §3.1).
 */
export type PlayerEvent = "index" | "state" | "follow" | "started" | "ended";

const HLS_MIME = "application/vnd.apple.mpegurl";

export interface PlayerDeps {
  createAudio: () => AudioLike;
  attachHls: HlsAttacher;
  http: HttpPort;
  getSettings: () => ReadingFeedSettings;
}

export class PlayerService {
  private audio: AudioLike;
  private times: ParagraphTime[] = [];
  private url: string | null = null;
  private hls: HlsHandle | null = null;
  private stopAt: number | null = null;
  private idx = -1;
  private path: string | null = null;
  private rate: number;
  private follow: FollowState;
  private listeners: Record<PlayerEvent, Set<() => void>> = {
    index: new Set(),
    state: new Set(),
    follow: new Set(),
    started: new Set(),
    ended: new Set(),
  };
  private readonly onTime = () => this.handleTime();
  private readonly onPlayState = () => this.emit("state");
  private readonly onEnded = () => {
    this.emit("state");
    if (this.path !== null) this.emit("ended");
  };

  constructor(private deps: PlayerDeps) {
    const s = deps.getSettings();
    this.rate = s.defaultSpeed;
    this.follow = { enabled: s.followScroll, suspended: false };
    this.audio = deps.createAudio();
    this.audio.addEventListener("timeupdate", this.onTime);
    this.audio.addEventListener("play", this.onPlayState);
    this.audio.addEventListener("pause", this.onPlayState);
    this.audio.addEventListener("ended", this.onEnded);
  }

  get notePath(): string | null {
    return this.path;
  }
  get currentIndex(): number {
    return this.idx;
  }
  get paragraphs(): readonly ParagraphTime[] {
    return this.times;
  }
  get playing(): boolean {
    return this.path !== null && !this.audio.paused;
  }
  get speed(): number {
    return this.rate;
  }
  get followState(): FollowState {
    return this.follow;
  }
  get followActive(): boolean {
    return shouldFollow(this.follow);
  }

  on(event: PlayerEvent, cb: () => void): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  /** Synchronous: points the audio at this note's track (METHOD §3.1). Same note + url keeps the source. */
  load(notePath: string, audioUrl: string, times: ParagraphTime[]): void {
    this.times = times;
    const sameSource = this.path === notePath && this.url === audioUrl;
    if (!sameSource) {
      this.detach();
      this.path = notePath;
      this.url = audioUrl;
      this.idx = -1;
      this.stopAt = null;
      const s = this.deps.getSettings();
      this.follow = { enabled: s.followScroll, suspended: false };
      // Plain files (book m4a, METHOD §1.2) and native HLS (iOS) both go straight to src.
      if (!isHlsUrl(audioUrl) || this.audio.canPlayType(HLS_MIME) !== "") {
        this.audio.src = audioUrl;
      } else {
        this.hls = this.deps.attachHls(this.audio, audioUrl, this.deps.http);
      }
      this.audio.defaultPlaybackRate = this.rate;
      this.audio.playbackRate = this.rate;
      this.emit("index");
      this.emit("follow");
    } else {
      // Same track: only the timestamp table is refreshed (e.g. filled in after a note switch).
      const idx = findIndex(times, this.audio.currentTime);
      if (idx !== this.idx) {
        this.idx = idx;
        this.emit("index");
      }
    }
    this.emit("state");
  }

  /** Must run inside the click handler: play() is called synchronously (METHOD §3.2). */
  playFrom(index: number): void {
    if (this.path === null || index < 0 || index >= this.times.length) return;
    this.audio.currentTime = this.times[index].start;
    this.stopAt = this.deps.getSettings().playMode === "paragraph" ? stopTimeFor(this.times, index) : null;
    this.audio.playbackRate = this.rate;
    this.safePlay();
    this.setIndex(index);
    this.dispatchFollow("resume");
    this.emit("state");
  }

  /** Play the loaded track from 0 without needing a timestamp table (sync, for note switches; METHOD §3.1). */
  playStart(): void {
    if (this.path === null) return;
    this.audio.currentTime = 0;
    this.stopAt = null;
    this.audio.playbackRate = this.rate;
    this.safePlay();
    this.dispatchFollow("resume");
    this.emit("state");
  }

  /** Move to paragraph `index` without starting playback; keeps playing if already playing. */
  seekTo(index: number): void {
    if (this.path === null || index < 0 || index >= this.times.length) return;
    if (!this.audio.paused) return this.playFrom(index);
    this.audio.currentTime = this.times[index].start;
    this.stopAt = null;
    this.setIndex(index);
    this.dispatchFollow("resume");
    this.emit("state");
  }

  /** Previous / next paragraph (-1 / +1): continues playing when playing, else only moves the position. */
  step(dir: -1 | 1): void {
    const next = stepIndex(this.idx, this.times, dir);
    if (next >= 0) this.seekTo(next);
  }

  toggle(): void {
    if (this.path === null) return;
    if (this.audio.paused) {
      // Resuming after a paragraph stop: pause again at the end of whatever is current.
      this.stopAt =
        this.deps.getSettings().playMode === "paragraph"
          ? stopTimeFor(this.times, findIndex(this.times, this.audio.currentTime))
          : null;
      this.safePlay();
    } else {
      this.audio.pause();
    }
  }

  stop(): void {
    this.detach();
    this.path = null;
    this.url = null;
    this.times = [];
    this.idx = -1;
    this.stopAt = null;
    this.emit("index");
    this.emit("state");
  }

  setSpeed(x: number): void {
    this.rate = x;
    this.audio.defaultPlaybackRate = x;
    this.audio.playbackRate = x;
    this.emit("state");
  }

  setFollowEnabled(on: boolean): void {
    this.dispatchFollow(on ? "enable" : "disable");
  }

  /** UI reports wheel/touchmove on the reading view. */
  userScrolled(): void {
    if (this.path !== null) this.dispatchFollow("userScroll");
  }

  resumeFollow(): void {
    this.dispatchFollow("resume");
  }

  destroy(): void {
    this.audio.removeEventListener("timeupdate", this.onTime);
    this.audio.removeEventListener("play", this.onPlayState);
    this.audio.removeEventListener("pause", this.onPlayState);
    this.audio.removeEventListener("ended", this.onEnded);
    this.detach();
    this.path = null;
    for (const set of Object.values(this.listeners)) set.clear();
  }

  private handleTime(): void {
    const t = this.audio.currentTime;
    if (this.stopAt !== null && t >= this.stopAt) {
      // "Only this paragraph" (METHOD §3.2): pause without moving the highlight on.
      this.stopAt = null;
      this.audio.pause();
      return;
    }
    this.setIndex(findIndex(this.times, t));
  }

  private setIndex(i: number): void {
    if (i === this.idx) return;
    this.idx = i;
    this.dispatchFollow("indexChanged");
    this.emit("index");
  }

  private dispatchFollow(e: FollowEvent): void {
    const next = followReducer(this.follow, e);
    if (next === this.follow) return;
    this.follow = next;
    this.emit("follow");
  }

  private safePlay(): void {
    try {
      this.emit("started");
      const p = this.audio.play();
      if (p && typeof p.catch === "function") p.catch(() => this.emit("state"));
    } catch {
      this.emit("state");
    }
  }

  private detach(): void {
    this.audio.pause();
    this.hls?.destroy();
    this.hls = null;
    if (this.url !== null) {
      this.audio.removeAttribute?.("src");
      this.audio.src = "";
      this.audio.load?.();
    }
  }

  private emit(e: PlayerEvent): void {
    for (const cb of [...this.listeners[e]]) cb();
  }
}
