/**
 * Markdown to the rule nodes of a system pack, offline: the site never parses Markdown.
 *
 * Rules files (`rules/NN-<slug>.md`): `#` starts a top section and `##` a child of it; `###` and
 * `####` stay headings inside a section. A heading's id is its `{#id}` suffix, else its title in
 * ASCII kebab case. Links are `[text](#section-id)`, `[text](entry:<collection>/<id>)` or an
 * `https:` URL. HTML, images, footnotes and reference-style links are refused.
 *
 * Entry files (`entries/<collection>.md`): `#` is the collection title, each `##` an entry. Lines
 * `Tags: a, b` and `Summary: …` right under an entry's heading set its tags and summary.
 */
import type { Heading, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { RuleNode, SystemPackCollection, SystemPackEntry, SystemPackSection } from "@skald/sheet-sdk/modules/systems";

/** A problem in an authoring file, with where it is. */
export class SystemPackBuildError extends Error {}

const markdown = unified().use(remarkParse).use(remarkGfm);

function fail(where: string, node: { position?: { start: { line: number } } } | undefined, message: string): never {
  const line = node?.position?.start.line;
  throw new SystemPackBuildError(`${where}${line ? `:${line}` : ""}: ${message}`);
}

function parse(text: string): Root {
  return markdown.parse(text);
}

function convertLink(url: string, children: RuleNode[], where: string, node: RootContent): RuleNode {
  if (url.startsWith("#") && url.length > 1) return { type: "link", target: decodeURIComponent(url.slice(1)), children };
  if (url.startsWith("entry:")) return { type: "link", target: url, children };
  if (/^https:\/\//i.test(url)) {
    let href: string;
    try {
      href = new URL(url).href;
    } catch {
      fail(where, node, `invalid URL ${url}`);
    }
    return { type: "external", url: href, children };
  }
  fail(where, node, `link ${url} is neither #section, entry:<collection>/<id> nor an https: URL`);
}

/** One mdast node as rule nodes; headings 1 and 2 are the caller's. */
function convert(node: RootContent, where: string): RuleNode {
  const children = (nodes: RootContent[]) => nodes.map((child) => convert(child, where));
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value };
    case "inlineCode":
      return { type: "text", value: node.value };
    case "code":
      return { type: "paragraph", children: [{ type: "text", value: node.value }] };
    case "break":
    case "thematicBreak":
      return { type: node.type };
    case "paragraph":
    case "emphasis":
    case "strong":
    case "blockquote":
    case "listItem":
    case "table":
    case "tableRow":
      return { type: node.type, children: children(node.children) };
    case "tableCell":
      return { type: "tableCell", span: 1, children: children(node.children) };
    case "list":
      return { type: "list", ordered: node.ordered === true, start: node.start ?? 1, children: children(node.children) };
    case "heading":
      if (node.depth === 3 || node.depth === 4) return { type: "heading", depth: node.depth, children: children(node.children) };
      return fail(where, node, `heading level ${node.depth} is not allowed here (use # and ## for sections, ### and #### inside them)`);
    case "link":
      return convertLink(node.url, children(node.children), where, node);
    case "html":
      return fail(where, node, "HTML is not allowed");
    case "image":
    case "imageReference":
      return fail(where, node, "images are not allowed");
    default:
      return fail(where, node, `${node.type} is not supported`);
  }
}

/** Markdown text as a block list. */
export function markdownBlocks(text: string, where: string): RuleNode[] {
  return parse(text).children.map((node) => convert(node, where));
}

function plainText(nodes: readonly RootContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode") return node.value;
      if ("children" in node) return plainText(node.children as RootContent[]);
      return "";
    })
    .join("");
}

const ID_SUFFIX = /\s*\{#([^}\s]+)\}\s*$/;

/** A heading's title and id: the `{#id}` suffix, else the title in ASCII kebab case. */
function headingIdentity(heading: Heading, where: string): { id: string; title: string } {
  const raw = plainText(heading.children);
  const suffix = ID_SUFFIX.exec(raw);
  const title = (suffix ? raw.slice(0, suffix.index) : raw).trim();
  if (!title) fail(where, heading, "a heading needs a title");
  const id = suffix
    ? suffix[1]
    : title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
  if (!id) fail(where, heading, `heading "${title}" needs an id: write it as "${title} {#some-id}"`);
  return { id, title };
}

/** The sections of one rules file, in order. */
export function rulesSections(text: string, where: string): SystemPackSection[] {
  const sections: SystemPackSection[] = [];
  let top: string | null = null;
  for (const node of parse(text).children) {
    if (node.type === "heading" && (node.depth === 1 || node.depth === 2)) {
      const { id, title } = headingIdentity(node, where);
      if (node.depth === 2 && top === null) fail(where, node, "a ## section needs a # section above it in the same file");
      if (node.depth === 1) top = id;
      sections.push({ id, parentId: node.depth === 1 ? null : top, title, blocks: [] });
      continue;
    }
    const current = sections.at(-1);
    if (!current) fail(where, node, "text before the first # heading");
    current.blocks.push(convert(node, where));
  }
  return sections;
}

const META_LINE = /^(tags|summary):\s*(.*)$/i;

/** The metadata lines under an entry heading, or null when the paragraph is ordinary text. */
function entryMeta(node: RootContent): { tags?: string[]; summary?: string } | null {
  if (node.type !== "paragraph") return null;
  const lines = plainText(node.children).split("\n");
  if (!lines.every((line) => META_LINE.test(line.trim()))) return null;
  const meta: { tags?: string[]; summary?: string } = {};
  for (const line of lines) {
    const [, key, value] = META_LINE.exec(line.trim())!;
    if (key.toLowerCase() === "tags") {
      meta.tags = value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else meta.summary = value.trim();
  }
  return meta;
}

/** A Markdown entry file as one collection. */
export function markdownCollection(id: string, text: string, where: string): SystemPackCollection {
  let title: string | null = null;
  const entries: SystemPackEntry[] = [];
  let metaAllowed = false;
  for (const node of parse(text).children) {
    if (node.type === "heading" && node.depth === 1) {
      if (title !== null) fail(where, node, "an entry file has one # heading: the collection title");
      title = plainText(node.children).trim();
      if (!title) fail(where, node, "the collection title is empty");
      continue;
    }
    if (node.type === "heading" && node.depth === 2) {
      if (title === null) fail(where, node, "the # collection title comes first");
      const identity = headingIdentity(node, where);
      entries.push({ id: identity.id, name: identity.title, blocks: [] });
      metaAllowed = true;
      continue;
    }
    const entry = entries.at(-1);
    if (!entry) fail(where, node, "text before the first ## entry");
    const meta = metaAllowed ? entryMeta(node) : null;
    metaAllowed = false;
    if (meta) Object.assign(entry, meta);
    else entry.blocks.push(convert(node, where));
  }
  if (title === null) fail(where, undefined, "the file needs a # collection title");
  return { id, title, entries };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ENTRY_KEYS = new Set(["id", "name", "tags", "summary", "text"]);

/**
 * A JSON entry file as one collection: `{ "title", "entries": [{ "id", "name", "tags"?,
 * "summary"?, "text" }] }`, `text` being Markdown.
 */
export function jsonCollection(id: string, value: unknown, where: string): SystemPackCollection {
  if (!isRecord(value) || typeof value.title !== "string" || !Array.isArray(value.entries)) {
    fail(where, undefined, 'expected { "title": string, "entries": [...] }');
  }
  for (const key of Object.keys(value)) {
    if (key !== "title" && key !== "entries") fail(where, undefined, `unknown key "${key}"`);
  }
  const entries = value.entries.map((raw, index): SystemPackEntry => {
    const at = `${where} entries[${index}]`;
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") fail(at, undefined, 'expected "id" and "name" strings');
    for (const key of Object.keys(raw)) if (!ENTRY_KEYS.has(key)) fail(at, undefined, `unknown key "${key}"`);
    if (raw.tags !== undefined && (!Array.isArray(raw.tags) || !raw.tags.every((tag) => typeof tag === "string"))) {
      fail(at, undefined, '"tags" must be a list of strings');
    }
    if (raw.summary !== undefined && typeof raw.summary !== "string") fail(at, undefined, '"summary" must be a string');
    if (raw.text !== undefined && typeof raw.text !== "string") fail(at, undefined, '"text" must be Markdown text');
    return {
      id: raw.id,
      name: raw.name,
      ...(raw.tags === undefined ? {} : { tags: raw.tags as string[] }),
      ...(raw.summary === undefined ? {} : { summary: raw.summary as string }),
      blocks: typeof raw.text === "string" ? markdownBlocks(raw.text, at) : [],
    };
  });
  return { id, title: value.title, entries };
}
