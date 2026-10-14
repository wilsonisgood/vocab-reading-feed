// hls.js (light build) on MSE; on a fatal error retry once with the
// requestUrl-based loader (METHOD §3.1).
import Hls from "hls.js/dist/hls.light.mjs";
import type { HlsAttacher, HlsHandle } from "./PlayerService";
import { HttpLoader } from "./httpLoader";

export const attachHls: HlsAttacher = (audio, url, http) => {
  if (!Hls.isSupported()) return null;
  const el = audio as unknown as HTMLMediaElement;
  let current: Hls | null = null;
  let retried = false;
  let destroyed = false;

  const start = (useHttpLoader: boolean, resumeAt: number, autoplay: boolean) => {
    const hls = new Hls(
      useHttpLoader
        ? {
            loader: class extends HttpLoader {
              constructor() {
                super(http);
              }
            },
          }
        : {},
    );
    current = hls;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal || destroyed || hls !== current) return;
      if (retried) return;
      retried = true;
      const t = el.currentTime;
      const wasPlaying = !el.paused;
      hls.destroy();
      start(true, t, wasPlaying);
    });
    if (resumeAt > 0) {
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        el.currentTime = resumeAt;
        if (autoplay) void el.play().catch(() => undefined);
      });
    }
    hls.attachMedia(el);
    hls.loadSource(url);
  };

  start(false, 0, false);
  const handle: HlsHandle = {
    destroy() {
      destroyed = true;
      current?.destroy();
      current = null;
    },
  };
  return handle;
};
