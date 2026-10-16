// Shared types for every v1 task (AGENT.md §3). Change only in the main
// session; parallel tasks import from here instead of declaring their own.

/** Where a note came from. v1 only has TED (METHOD §2). */
export type RfSource = "ted";

/** One row of the browser list, from the TED GraphQL `videos` query (METHOD §2.1). */
export interface TalkSummary {
  /** URL slug, also the note's `rf-id`. */
  slug: string;
  title: string;
  speaker: string;
  /** YYYY-MM-DD. */
  published: string;
  /** Seconds. */
  duration: number;
  topics: string[];
  /** 16x9 cover image, full size; null when TED has none (METHOD §2.1). */
  cover: string | null;
  /** Same image resized to 320 px wide for list rows (METHOD §2.1). */
  thumbnail: string | null;
}

/** Everything the note's frontmatter needs (METHOD §1). */
export interface TalkMeta extends TalkSummary {
  source: RfSource;
  /** Canonical talk page, e.g. https://www.ted.com/talks/<slug>. */
  url: string;
  license: string;
}

/** One subtitle line of a TED paragraph: text plus start time in seconds (METHOD §2.2). */
export interface Cue {
  text: string;
  start: number;
}

/** One paragraph as loaded from the source: text plus start time in seconds (METHOD §2.2, §2.4). */
export interface Paragraph {
  text: string;
  start: number;
  /** Subtitle lines with their own times; lets sentences get their own timestamps (METHOD §1.1). */
  cues?: Cue[];
}

/** A fully fetched talk, ready to become a note (METHOD §1). */
export interface Talk {
  meta: TalkMeta;
  paragraphs: Paragraph[];
  /** Absolute URL of the audio-only media playlist, no intro (METHOD §2.3). */
  audioUrl: string;
}

/** A timestamp read back from a note: 0-based source line + start seconds (METHOD §1). */
export interface ParagraphTime {
  line: number;
  start: number;
  /** Paragraph is only stage cues like "(Applause)"; prev / next paragraph skip it (METHOD §3.1). Set only when true. */
  cue?: boolean;
}

/** Bumped when the md contract in METHOD §1 changes incompatibly. */
export const RF_SCHEMA = 2;

export const TED_LICENSE = "CC BY-NC-ND 4.0 — TED Conferences, LLC";

export type PlayMode = "toEnd" | "paragraph";

/** What happens when a note's audio reaches its end (METHOD §3.1). */
export type AfterEnd = "stop" | "next" | "loopAll" | "repeatOne";

export interface ReadingFeedSettings {
  /** Vault folder for loaded notes; TED notes go to `<folder>/TED/` (METHOD §1). */
  folder: string;
  /** 0.75 | 1 | 1.25 | 1.5 (METHOD §3.1). */
  defaultSpeed: number;
  /** What ▶ does by default (METHOD §3.2). */
  playMode: PlayMode;
  /** When a note finishes: stop, play the next note, same but wrap around, or repeat this note (METHOD §3.1). */
  afterEnd: AfterEnd;
  /** Follow-scroll on by default (METHOD §3.3). */
  followScroll: boolean;
  /** Switch rf notes to reading mode when opened (METHOD §3.1). */
  autoReadingMode: boolean;
  /** Bookmarked talks, as loadedKey `<rf-source>:<rf-id>` (METHOD §3.4). */
  favorites: string[];
  /** Slugs found to have no English transcript at load time; not listed, like the bundled list (METHOD §2.5). */
  noTranscript: string[];
  /** Where the floating player bubble was dragged to, per device class; null = default corner (METHOD §3.1). */
  dockPos: { desktop: DockPos | null; mobile: DockPos | null };
}

/** Bubble centre as fractions (0–1) of the reading view's width / height. */
export interface DockPos {
  x: number;
  y: number;
}

export const DEFAULT_SETTINGS: ReadingFeedSettings = {
  folder: "Reading Feed",
  defaultSpeed: 1,
  playMode: "toEnd",
  afterEnd: "next",
  followScroll: true,
  autoReadingMode: true,
  favorites: [],
  noTranscript: [],
  dockPos: { desktop: null, mobile: null },
};

/** Frontmatter key set (YYYY-MM-DD) the first time any audio in the note plays (METHOD §1, §3.4). */
export const RF_READ_KEY = "rf-read";

/** Browser status filter (METHOD §3.4). */
export type StatusFilter = "all" | "unloaded" | "unread" | "read" | "favorite";
