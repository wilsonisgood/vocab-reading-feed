// Minimal typing for the slice of hls.js we use. The package's own .d.mts
// needs a newer TypeScript than this repo pins (Uint8Array generics).
declare module "hls.js/dist/hls.light.mjs" {
  export interface LoaderContext {
    url: string;
    responseType: string;
    rangeStart?: number;
    rangeEnd?: number;
  }
  export interface LoaderStats {
    aborted: boolean;
    loaded: number;
    retry: number;
    total: number;
    chunkCount: number;
    bwEstimate: number;
    loading: { start: number; first: number; end: number };
    parsing: { start: number; end: number };
    buffering: { start: number; first: number; end: number };
  }
  export interface LoaderCallbacks<T> {
    onSuccess(response: { url: string; data: string | ArrayBuffer }, stats: LoaderStats, context: T, networkDetails: unknown): void;
    onError(error: { code: number; text: string }, context: T, networkDetails: unknown, stats: LoaderStats): void;
  }
  export interface Loader<T> {
    context: T | null;
    stats: LoaderStats;
    load(context: T, config: unknown, callbacks: LoaderCallbacks<T>): void;
    abort(): void;
    destroy(): void;
  }
  export interface HlsErrorData {
    fatal: boolean;
  }
  export default class Hls {
    static isSupported(): boolean;
    static readonly Events: { ERROR: string; MANIFEST_PARSED: string };
    constructor(config?: { loader?: new (config: unknown) => Loader<LoaderContext> });
    on(event: string, cb: (event: string, data: HlsErrorData) => void): void;
    attachMedia(media: HTMLMediaElement): void;
    loadSource(url: string): void;
    destroy(): void;
  }
}
