import { requestUrl } from "obsidian";
import type { HttpPort, HttpRequest } from "../core/ports";

export class ObsidianHttp implements HttpPort {
  async request(req: HttpRequest) {
    const res = await requestUrl({
      url: req.url,
      method: req.method ?? "GET",
      headers: req.headers,
      body: req.body,
      contentType: req.headers?.["content-type"],
      throw: false,
    });
    return { status: res.status, text: res.text };
  }
}
