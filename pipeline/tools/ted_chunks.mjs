// Dump the plugin's small paragraphs (METHOD §1.1) for one saved TED talk page, as JSON lines
// {start, text, paraStart, section}. Uses the plugin's own TS (bundled in memory by esbuild).
// usage: node pipeline/tools/ted_chunks.mjs <talk-page.html> <slug>
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = await build({
  stdin: {
    contents: `export { parseTalkPage } from "./src/core/ted/talkPage"; export { segmentTalk, splitParagraph } from "./src/core/note/segment";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", write: false, loader: { ".json": "json" },
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
const page = mod.parseTalkPage(readFileSync(process.argv[2], "utf8"), process.argv[3]);
const firsts = new Set(page.paragraphs.map((p) => p.start));
mod.segmentTalk(page.paragraphs).forEach((s, si) => {
  for (const c of s.chunks) console.log(JSON.stringify({ start: c.start, text: c.text, paraStart: firsts.has(c.start), section: si }));
});
