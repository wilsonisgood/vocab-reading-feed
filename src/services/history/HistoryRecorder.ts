// Records listening sessions into the play history (METHOD §3.5). A session runs from ▶ until the
// player stops or moves to another note; a pause of up to SESSION_GAP_MS keeps the same session.
import type { PlayRecord } from "../../core/types";
import { canContinue, startRecord, touchRecord } from "../../core/history/logic";

/** The slice of PlayerService the recorder listens to. */
export interface HistoryPlayer {
  readonly notePath: string | null;
  readonly currentIndex: number;
  readonly playing: boolean;
  on(event: "started" | "index" | "state", cb: () => void): () => void;
}

export interface RecorderDeps {
  player: HistoryPlayer;
  history: () => Record<string, PlayRecord[]>;
  /** Opening words of paragraph `idx` of `path` ("" when unknown). */
  snippet: (path: string, idx: number) => string;
  save: () => void;
  now?: () => number;
  /** Runs after the play request settles its paragraph (playFrom emits "started" before moving). */
  defer?: (fn: () => void) => void;
}

/** While playing, index changes save at most this often; pauses and stops always save. */
const SAVE_EVERY_MS = 15_000;

export class HistoryRecorder {
  private session: { path: string; rec: PlayRecord } | null = null;
  private wasPlaying = false;
  private lastSave = 0;
  private offs: (() => void)[];
  private now: () => number;
  private defer: (fn: () => void) => void;

  constructor(private deps: RecorderDeps) {
    this.now = deps.now ?? Date.now;
    this.defer = deps.defer ?? ((fn) => queueMicrotask(fn));
    const p = deps.player;
    this.offs = [
      p.on("started", () => this.defer(() => this.begin())),
      p.on("index", () => this.onIndex()),
      p.on("state", () => this.onState()),
    ];
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
  }

  private begin(): void {
    const { player } = this.deps;
    const path = player.notePath;
    if (path === null) return;
    const now = this.now();
    const idx = player.currentIndex;
    const snippet = this.snippetAt(path, idx);
    if (this.session?.path === path && canContinue(this.session.rec, now)) {
      touchRecord(this.session.rec, now, idx, snippet);
    } else {
      this.session = { path, rec: startRecord(this.deps.history(), path, now, idx, snippet) };
    }
    this.wasPlaying = player.playing;
    this.flush(now);
  }

  private onIndex(): void {
    if (this.closeIfMoved()) return;
    const { player } = this.deps;
    if (!this.session || !player.playing) return;
    const now = this.now();
    // After a long pause the pending "started" opens a new record; don't stretch the old one first.
    if (!canContinue(this.session.rec, now)) return;
    touchRecord(this.session.rec, now, player.currentIndex, this.snippetAt(this.session.path, player.currentIndex));
    if (now - this.lastSave >= SAVE_EVERY_MS) this.flush(now);
  }

  private onState(): void {
    if (this.closeIfMoved()) return;
    const { player } = this.deps;
    const playing = player.playing;
    if (this.session && this.wasPlaying && !playing) {
      const now = this.now();
      touchRecord(this.session.rec, now, player.currentIndex, this.snippetAt(this.session.path, player.currentIndex));
      this.flush(now);
    }
    this.wasPlaying = playing;
  }

  /** Stop or another note loaded: the session is over. */
  private closeIfMoved(): boolean {
    if (!this.session || this.deps.player.notePath === this.session.path) return false;
    if (this.wasPlaying) this.session.rec.end = Math.max(this.session.rec.end, this.now());
    this.session = null;
    this.wasPlaying = false;
    this.flush(this.now());
    return true;
  }

  private snippetAt(path: string, idx: number): string {
    return idx < 0 ? "" : this.deps.snippet(path, idx);
  }

  private flush(now: number): void {
    this.lastSave = now;
    this.deps.save();
  }
}
