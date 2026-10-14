import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildVideosQuery, parseVideosResponse, pickImages } from "../../src/core/ted/graphql";
import { pickAudioUri, sumExtinf } from "../../src/core/ted/m3u8";
import { NoTranscriptError, parseTalkPage } from "../../src/core/ted/talkPage";
import type { HttpPort, HttpRequest } from "../../src/core/ports";
import { TedClient } from "../../src/services/ted/TedClient";

const fx = (n: string) => readFileSync(new URL(`../fixtures/ted/${n}`, import.meta.url), "utf8");
const SLUG = "paul_bloom_ai_and_the_end_of_loneliness";

describe("graphql", () => {
  it("builds a query with and without a cursor", () => {
    const first = JSON.parse(buildVideosQuery(null)).query as string;
    expect(first).toContain("videos(first: 30, language:");
    expect(first).not.toContain("after");
    const next = JSON.parse(buildVideosQuery('a"b', 10)).query as string;
    expect(next).toContain('first: 10, after: "a\\"b"');
  });

  it("parses a real page", () => {
    const page = parseVideosResponse(JSON.parse(fx("videos.json")));
    expect(page.totalCount).toBeGreaterThan(1000);
    expect(page.hasNextPage).toBe(true);
    expect(page.endCursor).toBe("5");
    expect(page.items).toHaveLength(2);
    const t = page.items[0];
    expect(t.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.topics.length).toBeGreaterThan(0);
    expect(t.cover).toMatch(/embed\.jpg$/);
    expect(t.thumbnail).toBe(`${t.cover}?w=320`);
  });

  it("throws on GraphQL errors", () => {
    expect(() => parseVideosResponse({ errors: [{ message: "boom" }] })).toThrow("boom");
  });

  it("picks images", () => {
    expect(pickImages([])).toEqual({ cover: null, thumbnail: null });
    expect(pickImages(null)).toEqual({ cover: null, thumbnail: null });
    expect(pickImages([{ url: "a.jpg", aspectRatioName: "4x3" }, { url: "b.jpg", aspectRatioName: "16x9" }]).cover).toBe("b.jpg");
    expect(pickImages([{ url: "a.jpg", aspectRatioName: "4x3" }])).toEqual({ cover: "a.jpg", thumbnail: "a.jpg?w=320" });
  });
});

describe("m3u8", () => {
  const master = fx("master.m3u8");
  it("picks low audio as an absolute URL", () => {
    expect(pickAudioUri(master, "https://hls.ted.com/project_masters/12009/manifest.m3u8")).toBe(
      "https://hls.ted.com/project_masters/12009/index-f5-a1.m3u8",
    );
  });
  it("falls back to medium, then throws", () => {
    const m = master.split("\n").filter((l) => !l.includes('NAME="low"')).join("\n");
    expect(pickAudioUri(m, "https://x.test/a/m.m3u8")).toBe("https://x.test/a/index-f8-a1.m3u8");
    expect(() => pickAudioUri("#EXTM3U\n", "https://x.test/m.m3u8")).toThrow();
  });
  it("sums EXTINF", () => {
    expect(sumExtinf(fx("media-short.m3u8"))).toBeCloseTo(6.014 + 5.991 + 6.014 + 5.991, 6);
  });
});

describe("talkPage", () => {
  it("parses meta, paragraphs and strips the intro", () => {
    const r = parseTalkPage(fx("talk-page.html"), SLUG);
    expect(r.masterUrl).toBe("https://hls.ted.com/project_masters/12009/manifest.m3u8");
    expect(r.meta).toMatchObject({
      slug: SLUG,
      speaker: "Paul Bloom",
      published: "2026-09-30",
      duration: 737,
      source: "ted",
      url: `https://www.ted.com/talks/${SLUG}`,
    });
    expect(r.meta.topics).toContain("AI");
    expect(r.meta.thumbnail).toBe(`${r.meta.cover}?w=320`);
    expect(r.paragraphs).toHaveLength(3);
    expect(r.paragraphs[0].start).toBeCloseTo(0.697, 6);
    expect(r.paragraphs[0].text).toBe(
      "I have a couple of questions for you -- but they’re personal. So I’m not going to ask for a show of hands. First, right now, at this stage of your life, are you lonely?",
    );
    expect(r.paragraphs[1].start).toBeCloseTo(16.213, 6);
    expect(r.paragraphs.every((p) => !/\s{2}|\n/.test(p.text))).toBe(true);
  });

  it("throws NoTranscriptError", () => {
    expect(() => parseTalkPage(fx("talk-page-no-transcript.html"), SLUG)).toThrow(NoTranscriptError);
  });
});

describe("TedClient", () => {
  function setup(routes: (r: HttpRequest) => { status: number; text: string }) {
    const calls: { req: HttpRequest; at: number }[] = [];
    let t = 1000;
    const http: HttpPort = {
      request: (req) => {
        calls.push({ req, at: t });
        return Promise.resolve(routes(req));
      },
      requestBinary: () => Promise.reject(new Error("unused")),
    };
    const client = new TedClient(http, { now: () => t, sleep: (ms) => ((t += ms), Promise.resolve()) });
    return { client, calls };
  }
  const routes = (r: HttpRequest) => {
    if (r.url === "https://www.ted.com/graphql") return { status: 200, text: fx("videos.json") };
    if (r.url.startsWith("https://www.ted.com/talks/")) return { status: 200, text: fx("talk-page.html") };
    if (r.url === "https://hls.ted.com/project_masters/12009/manifest.m3u8") return { status: 200, text: fx("master.m3u8") };
    return { status: 404, text: "" };
  };

  it("caches list pages per cursor and spaces requests >= 300 ms", async () => {
    const { client, calls } = setup(routes);
    const a = await client.listPage(null);
    expect(await client.listPage(null)).toBe(a);
    await client.listPage("5");
    expect(calls).toHaveLength(2);
    expect(calls[0].req.method).toBe("POST");
    expect(JSON.parse(calls[1].req.body!).query).toContain('after: "5"');
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(300);
  });

  it("fetchTalk assembles a Talk without the intro", async () => {
    const { client, calls } = setup(routes);
    const talk = await client.fetchTalk(SLUG);
    expect(talk.audioUrl).toBe("https://hls.ted.com/project_masters/12009/index-f5-a1.m3u8");
    expect(talk.paragraphs[0].start).toBeCloseTo(0.697, 6);
    expect(calls.map((c) => c.req.url)).toEqual([
      `https://www.ted.com/talks/${SLUG}`,
      "https://hls.ted.com/project_masters/12009/manifest.m3u8",
    ]);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(300);
  });

  it("surfaces HTTP errors and does not cache a failed page", async () => {
    let fail = true;
    const { client } = setup((r) => (fail ? { status: 500, text: "" } : routes(r)));
    await expect(client.listPage(null)).rejects.toThrow("500");
    fail = false;
    await expect(client.listPage(null)).resolves.toBeTruthy();
    await expect(setup(() => ({ status: 404, text: "" })).client.fetchTalk(SLUG)).rejects.toThrow("404");
  });
});
