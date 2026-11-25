/**
 * The editor's simple text markup (IMPL §3.4), to and from 5etools entries:
 *
 * - a blank line starts a new paragraph (a string); the lines of one paragraph join with a space;
 * - `## Title` starts an `{ type: "entries", name, entries }` block that runs to the next `##`;
 * - lines starting `- ` form one `{ type: "list", items }`;
 * - inline tags such as `{@spell Name}` stay in the text; the reference renderer resolves them.
 *
 * Nothing else, and no HTML. `printMarkup` writes the canonical text and says whether the entries
 * were all expressible (`lossless`); an imported entry with tables or other blocks is not.
 */
import { entriesToText } from "../../reference/entries-to-text";

type Node = Record<string, unknown>;

const SECTION = /^##[ \t]+(\S.*)$/;
const LIST_ITEM = /^-[ \t]+(.*)$/;
const LIST_EMPTY = /^-$/;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim());
}

/** Paragraphs and lists of one container, from its lines. */
function blocks(source: string[]): unknown[] {
  const out: unknown[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length) out.push(paragraph.join(" "));
    if (list) out.push({ type: "list", items: list });
    paragraph = [];
    list = null;
  };
  for (const line of source) {
    const item = LIST_ITEM.exec(line)?.[1] ?? (LIST_EMPTY.test(line) ? "" : undefined);
    if (line === "") {
      flush();
    } else if (item !== undefined) {
      if (paragraph.length) flush();
      (list ??= []).push(item.trim());
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out;
}

/** The entries a markup text stands for. */
export function parseMarkup(text: string): unknown[] {
  const out: unknown[] = [];
  let section: { name: string; lines: string[] } | null = null;
  let top: string[] = [];
  for (const line of lines(text)) {
    const title = SECTION.exec(line)?.[1];
    if (title !== undefined) {
      if (section) out.push({ type: "entries", name: section.name, entries: blocks(section.lines) });
      else out.push(...blocks(top));
      section = { name: title.trim(), lines: [] };
      top = [];
    } else if (section) {
      section.lines.push(line);
    } else {
      top.push(line);
    }
  }
  if (section) out.push({ type: "entries", name: section.name, entries: blocks(section.lines) });
  else out.push(...blocks(top));
  return out;
}

/** A paragraph the markup writes back unchanged. */
function plainParagraph(value: unknown): value is string {
  if (typeof value !== "string" || value === "" || value !== value.trim() || /[\r\n]/.test(value)) return false;
  return !SECTION.test(value) && !LIST_ITEM.test(value) && !LIST_EMPTY.test(value);
}

function plainList(node: unknown): node is { type: "list"; items: string[] } {
  if (!isNode(node) || node.type !== "list" || !Array.isArray(node.items) || node.items.length === 0) return false;
  if (Object.keys(node).some((key) => key !== "type" && key !== "items")) return false;
  return node.items.every((item) => typeof item === "string" && item === item.trim() && !/[\r\n]/.test(item));
}

function plainSection(node: unknown): node is { type: "entries"; name: string; entries: unknown[] } {
  if (!isNode(node) || node.type !== "entries" || typeof node.name !== "string" || !Array.isArray(node.entries)) return false;
  if (Object.keys(node).some((key) => key !== "type" && key !== "name" && key !== "entries")) return false;
  return node.name !== "" && node.name === node.name.trim() && !/[\r\n]/.test(node.name);
}

/** One container's paragraphs and lists as markup blocks; `lossless` false when a node is anything else. */
function printBlocks(entries: readonly unknown[]): { parts: string[]; lossless: boolean } {
  const parts: string[] = [];
  let lossless = true;
  for (const node of entries) {
    if (plainParagraph(node)) parts.push(node);
    else if (plainList(node)) parts.push(node.items.map((item) => (item ? `- ${item}` : "-")).join("\n"));
    else {
      lossless = false;
      const text = typeof node === "string" ? node.trim() : entriesToText([node]).trim();
      if (text) parts.push(text);
    }
  }
  return { parts, lossless };
}

/** Canonical markup of `entries`, and whether `parseMarkup` of it gives `entries` back. */
export function printMarkup(entries: readonly unknown[]): { text: string; lossless: boolean } {
  const parts: string[] = [];
  let lossless = true;
  let inSections = false;
  for (const node of entries) {
    if (plainSection(node)) {
      inSections = true;
      const inner = printBlocks(node.entries);
      lossless &&= inner.lossless;
      parts.push([`## ${node.name}`, ...inner.parts].join("\n\n"));
      continue;
    }
    // After the first section every block belongs to a section: a loose one cannot be written.
    if (inSections) lossless = false;
    const outer = printBlocks([node]);
    lossless &&= outer.lossless;
    parts.push(...outer.parts);
  }
  return { text: parts.join("\n\n"), lossless };
}
