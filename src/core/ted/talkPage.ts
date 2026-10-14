// Parse a talk page's __NEXT_DATA__ (METHOD §2.2). Pure, no network.
import { TED_LICENSE } from "../types";
import type { Paragraph, TalkMeta } from "../types";
import { summaryFromNode } from "./graphql";

/** The talk has no English transcript, so it cannot be loaded (METHOD §2.2). */
export class NoTranscriptError extends Error {
  constructor(public readonly slug: string) {
    super(`No English transcript for TED talk ${slug}`);
    this.name = "NoTranscriptError";
  }
}

interface CueRaw {
  text: string;
  time: number;
}

/** Drop `intro_master_id` so the stream has no TED intro (METHOD §2.3). */
export function stripIntro(hlsUrl: string): string {
  const u = new URL(hlsUrl);
  u.searchParams.delete("intro_master_id");
  return u.href;
}

interface PageProps {
  videoData?: Parameters<typeof summaryFromNode>[0] & { hlsUrl?: string };
  transcriptData?: { translation?: { paragraphs?: { cues?: CueRaw[] }[] } } | null;
}

function extractNextData(html: string): { props?: { pageProps?: Record<string, unknown> } } {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("talk page has no __NEXT_DATA__");
  return JSON.parse(m[1]);
}

/**
 * Cue times are measured on the intro-free stream (checked 2026-10-14, METHOD §2.4),
 * so `start` is simply the first cue's time in seconds, no offset.
 */
export function parseTalkPage(
  html: string,
  slug: string,
): { meta: TalkMeta; paragraphs: Paragraph[]; masterUrl: string } {
  const props = extractNextData(html)?.props?.pageProps as PageProps | undefined;
  const video = props?.videoData;
  if (!video) throw new Error(`talk page for ${slug} has no videoData`);

  const raw = props?.transcriptData?.translation?.paragraphs ?? [];
  const paragraphs: Paragraph[] = [];
  for (const p of raw) {
    const cues = p.cues ?? [];
    const text = cues.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
    if (!text || cues.length === 0) continue;
    paragraphs.push({ text, start: cues[0].time / 1000 });
  }
  if (paragraphs.length === 0) throw new NoTranscriptError(slug);
  if (!video.hlsUrl) throw new Error(`talk ${slug} has no hlsUrl`);

  const meta: TalkMeta = {
    ...summaryFromNode(video),
    slug,
    source: "ted",
    url: `https://www.ted.com/talks/${slug}`,
    license: TED_LICENSE,
  };
  return { meta, paragraphs, masterUrl: stripIntro(video.hlsUrl) };
}
