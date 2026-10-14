// Minimal YAML scalar / flow-sequence writer for the note frontmatter (METHOD §1).
// No YAML package: we only ever write strings, numbers and flat string lists.

const RESERVED = /^(true|false|yes|no|on|off|y|n|null|~)$/i;
const NUMBER_LIKE = /^[-+]?(\d[\d_,]*\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const SPECIAL_NUMBER = /^[-+]?(0x[0-9a-f]+|0o[0-7]+|\.inf|\.nan)$/i;
const DATE_LIKE = /^\d{4}-\d{1,2}-\d{1,2}/;
const LEADING_INDICATOR = /^[[{\-*&!|>'%@`?,\]}]/;

function needsQuote(s: string, inFlow: boolean): boolean {
  if (s === "" || s !== s.trim()) return true;
  if (/[:#"\n\r\t\\]/.test(s)) return true;
  if (LEADING_INDICATOR.test(s)) return true;
  if (RESERVED.test(s) || NUMBER_LIKE.test(s) || SPECIAL_NUMBER.test(s) || DATE_LIKE.test(s)) return true;
  if (inFlow && /[,[\]{}]/.test(s)) return true;
  return false;
}

function quote(s: string): string {
  const body = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${body}"`;
}

/** One YAML string scalar, double-quoted when plain style would be ambiguous. */
export function yamlString(s: string, inFlow = false): string {
  return needsQuote(s, inFlow) ? quote(s) : s;
}

/** `[a, b]` flow sequence of strings. */
export function yamlList(items: string[]): string {
  return `[${items.map((i) => yamlString(i, true)).join(", ")}]`;
}
