// HLS playlist helpers (METHOD §2.3, §2.4). Pure string parsing.

/** Absolute URL of the audio media playlist: NAME="low" (mono ~64 kbps), else "medium". */
export function pickAudioUri(master: string, masterUrl: string): string {
  const found: Record<string, string> = {};
  for (const line of master.split(/\r?\n/)) {
    if (!line.startsWith("#EXT-X-MEDIA:") || !/TYPE=AUDIO/.test(line)) continue;
    const name = /NAME="([^"]*)"/.exec(line)?.[1];
    const uri = /URI="([^"]*)"/.exec(line)?.[1];
    if (name && uri) found[name] = uri;
  }
  const uri = found["low"] ?? found["medium"];
  if (!uri) throw new Error("HLS master has no low/medium audio rendition");
  return new URL(uri, masterUrl).href;
}

/** Total duration in seconds of a media playlist (sum of #EXTINF). */
export function sumExtinf(media: string): number {
  let total = 0;
  for (const m of media.matchAll(/^#EXTINF:([\d.]+)/gm)) total += parseFloat(m[1]);
  return total;
}
