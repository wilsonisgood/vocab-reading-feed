import { describe, expect, it } from "vitest";
import { isHlsUrl } from "../../src/core/audio";

describe("isHlsUrl", () => {
  it("TED playlists are HLS", () => {
    expect(isHlsUrl("https://hls.ted.com/project_masters/12009/index-f5-a1.m3u8")).toBe(true);
    expect(isHlsUrl("https://hls.ted.com/x/master.M3U8?foo=1#t")).toBe(true);
  });
  it("plain files are not, whatever the query says", () => {
    expect(isHlsUrl("https://audio.example.test/s/androids/ch17.m4a")).toBe(false);
    expect(isHlsUrl("https://audio.example.test/a.mp3")).toBe(false);
    expect(isHlsUrl("https://audio.example.test/a.mp4?x=index.m3u8")).toBe(false);
    expect(isHlsUrl("https://audio.example.test/m3u8/ch1")).toBe(false);
  });
  it("relative or malformed URLs fall back to the raw path", () => {
    expect(isHlsUrl("a.m3u8?x")).toBe(true);
    expect(isHlsUrl("u")).toBe(false);
  });
});
