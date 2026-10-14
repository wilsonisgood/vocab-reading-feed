// Ports keep services/** free of "obsidian" (AGENT.md §5b-2). Implementations
// live in src/platform; tests pass fakes.

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly text: string;
}

/**
 * CORS-free HTTP (Obsidian's requestUrl). Never rejects on 4xx/5xx — only on
 * network failure — so callers decide what a bad status means.
 */
export interface HttpPort {
  request(req: HttpRequest): Promise<HttpResponse>;
}
