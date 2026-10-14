// TED client: list pages (GraphQL) + single talk (page + HLS master) (METHOD §2).
import type { HttpPort, HttpResponse } from "../../core/ports";
import type { Talk } from "../../core/types";
import { buildVideosQuery, parseVideosResponse } from "../../core/ted/graphql";
import type { VideosPage } from "../../core/ted/graphql";
import { pickAudioUri } from "../../core/ted/m3u8";
import { parseTalkPage } from "../../core/ted/talkPage";

const GRAPHQL_URL = "https://www.ted.com/graphql";

export interface TedClientOptions {
  /** Minimum gap between any two requests (METHOD §2.1). */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class TedClient {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastAt = Number.NEGATIVE_INFINITY;
  /** Serializes requests so the spacing holds under concurrent calls. */
  private chain: Promise<unknown> = Promise.resolve();
  private readonly pages = new Map<string, Promise<VideosPage>>();

  constructor(
    private readonly http: HttpPort,
    opts: TedClientOptions = {},
  ) {
    this.minIntervalMs = opts.minIntervalMs ?? 300;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private throttled(req: Parameters<HttpPort["request"]>[0]): Promise<HttpResponse> {
    const run = async (): Promise<HttpResponse> => {
      const wait = this.lastAt + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt = this.now();
      return this.http.request(req);
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async getText(url: string): Promise<string> {
    const res = await this.throttled({ url, method: "GET" });
    if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text;
  }

  /** One page of the list, newest first. Cached in memory per cursor; failures are not cached. */
  listPage(after: string | null): Promise<VideosPage> {
    const key = after ?? "";
    const hit = this.pages.get(key);
    if (hit) return hit;
    const p = (async () => {
      const res = await this.throttled({
        url: GRAPHQL_URL,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: buildVideosQuery(after),
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status} for TED GraphQL`);
      return parseVideosResponse(JSON.parse(res.text));
    })();
    this.pages.set(key, p);
    p.catch(() => this.pages.delete(key));
    return p;
  }

  /**
   * Talk page -> master playlist -> low audio playlist URL. Cue times need no intro offset
   * because they match the intro-free stream we point at (METHOD §2.4).
   */
  async fetchTalk(slug: string): Promise<Talk> {
    const html = await this.getText(`https://www.ted.com/talks/${slug}`);
    const { meta, paragraphs, masterUrl } = parseTalkPage(html, slug);
    const master = await this.getText(masterUrl);
    return { meta, paragraphs, audioUrl: pickAudioUri(master, masterUrl) };
  }
}
