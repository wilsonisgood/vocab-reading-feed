import { RF_SCHEMA } from "../types";
import type { Paragraph, Talk, TalkMeta } from "../types";
import { yamlList, yamlString } from "./yaml";

/** Seconds with two decimals, as written inside `%%rf:…%%` (METHOD §1). */
export function formatTime(sec: number): string {
  return sec.toFixed(2);
}

const BAD_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

/** `<published> <title>.md`; characters Obsidian dislikes become spaces (METHOD §1). */
export function noteFileName(meta: Pick<TalkMeta, "published" | "title">): string {
  const title = meta.title.replace(BAD_FILENAME_CHARS, " ").replace(/\s+/g, " ").trim();
  return `${[meta.published, title].filter((p) => p !== "").join(" ")}.md`;
}

/** `<folder>/TED/<file>`; folder is stripped of leading/trailing slashes, empty = no prefix. */
export function notePath(folder: string, meta: TalkMeta): string {
  const f = folder.replace(/^\/+|\/+$/g, "");
  return `${f === "" ? "" : `${f}/`}TED/${noteFileName(meta)}`;
}

/**
 * Make one paragraph's text a single markdown paragraph block that cannot
 * contain a `%%` comment. Newlines -> space; `%%` -> `%\%` (renders as `%%`);
 * leading block syntax (#, >, -, 1., ...) gets a backslash.
 */
export function escapeParagraph(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  s = s.replace(/%(?=%)/g, "%\\");
  if (/^\d+[.)]/.test(s)) s = s.replace(/^(\d+)([.)])/, "$1\\$2");
  else if (/^[#>\-+*[<`~_=|]/.test(s)) s = `\\${s}`;
  return s;
}

export function renderParagraph(p: Paragraph): string {
  return `${escapeParagraph(p.text)} %%rf:${formatTime(p.start)}%%`;
}

/** Full note markdown for a loaded talk (METHOD §1). */
export function renderNote(talk: Talk): string {
  const { meta } = talk;
  const fm: string[] = [
    "---",
    `rf-source: ${yamlString(meta.source)}`,
    `rf-id: ${yamlString(meta.slug)}`,
    `rf-audio: ${yamlString(talk.audioUrl)}`,
    `rf-schema: ${RF_SCHEMA}`,
    `title: ${yamlString(meta.title)}`,
    `speaker: ${yamlString(meta.speaker)}`,
    `published: ${meta.published}`,
    `duration: ${meta.duration}`,
    `topics: ${yamlList(meta.topics)}`,
    `url: ${yamlString(meta.url)}`,
  ];
  if (meta.cover !== null) fm.push(`cover: ${yamlString(meta.cover)}`);
  if (meta.thumbnail !== null) fm.push(`thumbnail: ${yamlString(meta.thumbnail)}`);
  fm.push(
    `license: ${yamlString(meta.license)}`,
    `tags: ${yamlList(["reading-feed", meta.source])}`,
    "---",
  );

  const body = talk.paragraphs.filter((p) => p.text.trim() !== "").map(renderParagraph);
  const footer = `---\nSource: [TED](<${meta.url}>) · CC BY-NC-ND 4.0`;
  return `${fm.join("\n")}\n\n${body.length > 0 ? `${body.join("\n\n")}\n\n` : ""}${footer}\n`;
}
