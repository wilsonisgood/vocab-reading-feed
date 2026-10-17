// Which way an `rf-audio` URL is played (METHOD §1.2, §3.1): pure, no DOM.

/**
 * True when the URL path ends in `.m3u8` (an HLS playlist, TED; METHOD §2.3).
 * Anything else (book `.m4a`, `.mp3`, `.mp4` …) is a plain file and goes straight to `audio.src`
 * on every platform. Query string and fragment are ignored.
 */
export function isHlsUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  return /\.m3u8$/i.test(path);
}
