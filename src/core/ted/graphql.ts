// TED GraphQL `videos` list: request body + response parsing (METHOD §2.1). Pure, no network.
import type { TalkSummary } from "../types";

export interface ImageSizeRaw {
  url: string;
  aspectRatioName: string;
}

export interface VideosPage {
  items: TalkSummary[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount: number;
}

/** POST body for one page, newest first. The cursor is TED's own (an offset-like string). */
export function buildVideosQuery(after: string | null, first = 30): string {
  const afterArg = after === null ? "" : `after: ${JSON.stringify(after)}, `;
  const query =
    `{ videos(first: ${Math.trunc(first)}, ${afterArg}language: "en") {` +
    " totalCount pageInfo { endCursor hasNextPage }" +
    " nodes { slug title presenterDisplayName publishedAt duration topics { nodes { name } }" +
    " primaryImageSet { url aspectRatioName } } } }";
  return JSON.stringify({ query });
}

/** cover = the 16x9 image (else the first); thumbnail = cover resized to 320 px (METHOD §2.1). */
export function pickImages(set: ImageSizeRaw[] | null | undefined): {
  cover: string | null;
  thumbnail: string | null;
} {
  if (!set || set.length === 0) return { cover: null, thumbnail: null };
  const cover = (set.find((s) => s.aspectRatioName === "16x9") ?? set[0]).url;
  const sep = cover.includes("?") ? "&" : "?";
  return { cover, thumbnail: `${cover}${sep}w=320` };
}

interface VideoNodeRaw {
  slug: string;
  title: string;
  presenterDisplayName?: string | null;
  publishedAt?: string | null;
  duration?: number | null;
  topics?: { nodes?: { name: string }[] | null } | null;
  primaryImageSet?: ImageSizeRaw[] | null;
}

/** Shared by the list and the talk page: both give the same node shape. */
export function summaryFromNode(n: VideoNodeRaw): TalkSummary {
  return {
    slug: n.slug,
    title: n.title,
    speaker: n.presenterDisplayName ?? "",
    published: (n.publishedAt ?? "").slice(0, 10),
    duration: n.duration ?? 0,
    topics: (n.topics?.nodes ?? []).map((t) => t.name),
    ...pickImages(n.primaryImageSet),
  };
}

export function parseVideosResponse(json: unknown): VideosPage {
  const root = json as {
    data?: { videos?: { totalCount?: number; pageInfo?: { endCursor?: string | null; hasNextPage?: boolean }; nodes?: VideoNodeRaw[] } };
    errors?: { message?: string }[];
  };
  const v = root?.data?.videos;
  if (!v) {
    throw new Error(`TED GraphQL: ${root?.errors?.[0]?.message ?? "no data.videos in response"}`);
  }
  return {
    items: (v.nodes ?? []).map(summaryFromNode),
    endCursor: v.pageInfo?.endCursor ?? null,
    hasNextPage: v.pageInfo?.hasNextPage ?? false,
    totalCount: v.totalCount ?? 0,
  };
}
