// hls.js fallback loader over HttpPort (requestUrl, no CORS) — METHOD §3.1.
import type { Loader, LoaderCallbacks, LoaderContext, LoaderStats } from "hls.js/dist/hls.light.mjs";
import type { HttpPort } from "../../core/ports";

function emptyStats(): LoaderStats {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  };
}

export class HttpLoader implements Loader<LoaderContext> {
  context: LoaderContext | null = null;
  stats: LoaderStats = emptyStats();

  constructor(private http: HttpPort) {}

  load(context: LoaderContext, _config: unknown, callbacks: LoaderCallbacks<LoaderContext>): void {
    this.context = context;
    const stats = this.stats;
    stats.loading.start = performance.now();
    const fail = (code: number, text: string) => {
      if (!stats.aborted) callbacks.onError({ code, text }, context, null, stats);
    };
    const done = (data: string | ArrayBuffer, size: number) => {
      if (stats.aborted) return;
      stats.loading.first = stats.loading.end = performance.now();
      stats.loaded = stats.total = size;
      callbacks.onSuccess({ url: context.url, data }, stats, context, null);
    };
    if (context.responseType === "arraybuffer") {
      this.http.requestBinary(context.url).then(
        (res) => {
          if (res.status < 200 || res.status >= 300) return fail(res.status, "HTTP " + res.status);
          let data = res.data;
          // Byte-range segments: the port has no Range header, so slice the full body.
          if (context.rangeEnd !== undefined && context.rangeStart !== undefined) {
            data = data.slice(context.rangeStart, context.rangeEnd);
          }
          done(data, data.byteLength);
        },
        (e: unknown) => fail(0, String(e)),
      );
    } else {
      this.http.request({ url: context.url }).then(
        (res) => {
          if (res.status < 200 || res.status >= 300) return fail(res.status, "HTTP " + res.status);
          done(res.text, res.text.length);
        },
        (e: unknown) => fail(0, String(e)),
      );
    }
  }

  abort(): void {
    this.stats.aborted = true;
  }

  destroy(): void {
    this.stats.aborted = true;
    this.context = null;
  }
}
