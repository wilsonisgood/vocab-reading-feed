import { describe, expect, it } from "vitest";
import { LibraryClient, LibraryError } from "../../src/services/library/LibraryClient";
import type { HttpPort, HttpRequest } from "../../src/core/ports";

const BASE = `https://audio.example.test/${"0".repeat(32)}/`;

function fake(handler: (req: HttpRequest) => { status: number; text: string }): HttpPort {
  return {
    request: async (req) => handler(req),
    requestBinary: async () => ({ status: 500, data: new ArrayBuffer(0) }),
  };
}

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof LibraryError ? e.kind : "other";
  }
}

describe("LibraryClient", () => {
  it("reads library.json under the base", async () => {
    const seen: string[] = [];
    const c = new LibraryClient(fake((r) => {
      seen.push(r.url);
      return { status: 200, text: JSON.stringify({ schema: 1, books: [{ slug: "androids", chapters: 2 }] }) };
    }));
    expect((await c.books(BASE))[0].slug).toBe("androids");
    expect(seen).toEqual([`${BASE}library.json`]);
  });
  it("404 = wrong URL, rejection = network, bad JSON = format", async () => {
    expect(await kindOf(new LibraryClient(fake(() => ({ status: 404, text: "" }))).books(BASE))).toBe("notFound");
    const down: HttpPort = { request: () => Promise.reject(new Error("offline")), requestBinary: () => Promise.reject(new Error("x")) };
    expect(await kindOf(new LibraryClient(down).books(BASE))).toBe("network");
    expect(await kindOf(new LibraryClient(fake(() => ({ status: 200, text: "<html>" }))).books(BASE))).toBe("format");
    expect(await kindOf(new LibraryClient(fake(() => ({ status: 200, text: "{}" }))).books(BASE))).toBe("format");
    expect(await kindOf(new LibraryClient(fake(() => ({ status: 500, text: "" }))).books(BASE))).toBe("http");
  });
  it("never requests an unsafe chapter path", async () => {
    const c = new LibraryClient(fake(() => ({ status: 200, text: "x" })));
    expect(await kindOf(c.chapter(BASE, "androids", { file: "../library.json" }))).toBe("format");
  });
});
