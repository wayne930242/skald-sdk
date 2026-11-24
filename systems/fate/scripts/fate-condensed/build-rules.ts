import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { RootContent } from "mdast";
import type {
  RuleNode,
  RulesCorpus,
  RulesLocale,
  RuleSection,
} from "./corpus-types";
import headings from "./section-map.json";
import notices from "./sources/notices.json";
import { printReferences } from "./print-references";

const sources = {
  en: {
    url: "https://fate-srd.com/fate-condensed",
    sha256: "f8700ffad782561c2313cdbee140fff21614a1f9b396f6d3011a4fa76ad4614f",
  },
  "zh-TW": {
    url: "https://wayne.tw/blog/trpg/systems/fate-condensed",
    revision: "0af3d2099c66b11314625477f264ade743cb3477",
    sha256: "c98607fba1dcba5d369892d29d709cb2cdc80cb150b9aa0df0e792ac5d180a73",
  },
};
export function pinned(locale: RulesLocale, text: string) {
  if (createHash("sha256").update(text).digest("hex") !== sources[locale].sha256)
    throw Error(`Source hash mismatch: ${locale}`);
}
const markdown = unified().use(remarkParse).use(remarkGfm);
export function convert(text: string, targets: Map<string, string>): RuleNode[] {
  const node = (n: RootContent): RuleNode => {
    switch (n.type) {
      case "text":
        return { type: "text", value: n.value };
      case "inlineCode":
        return { type: "code", value: n.value };
      case "break":
      case "thematicBreak":
        return { type: n.type };
      case "strong":
      case "emphasis":
      case "paragraph":
      case "blockquote":
      case "listItem":
      case "table":
      case "tableRow":
        return { type: n.type, children: n.children.map(node) };
      case "list":
        return {
          type: n.type,
          ordered: !!n.ordered,
          start: n.start ?? 1,
          children: n.children.map(node),
        };
      case "tableCell":
        return { type: n.type, span: 1, children: n.children.map(node) };
      case "link": {
        if (/^dice:[+0-]+$/.test(n.url)) return { type: "dice", value: n.url.slice(5) };
        const children = n.children.map(node);
        if (/^https?:\/\//.test(n.url)) return { type: "external", url: n.url, children };
        const target = targets.get(decodeURIComponent(n.url));
        if (!target) throw Error(`Orphan or unsafe link: ${n.url}`);
        return { type: "link", target, children };
      }
      default:
        throw Error(`Unknown markup: ${n.type}`);
    }
  };
  const blocks = (s: string) => markdown.parse(s).children.map(node);
  const normalized = text
    .replace(/<(FateFont|dice)>([+0\-[\]]+)<\/\1>/g, (_, tag: string, raw: string) => {
      if (!(tag === "dice" ? /^(?:\[[+0-]\])+$/ : /^[+0-]+$/).test(raw))
        throw Error("Unknown dice markup");
      return `[die](dice:${raw.replace(/[\[\]]/g, "")})`;
    })
    .replace(
      '<a href="">_https://fate-srd.com/fate-core/invoking-compelling-aspects#types-of-compels_</a>',
      "https://fate-srd.com/fate-core/invoking-compelling-aspects#types-of-compels",
    );
  const result: RuleNode[] = [];
  let offset = 0;
  for (const match of normalized.matchAll(
    /<table(?: id="table\d+")?>\s*<tbody>([\s\S]*?)<\/tbody>\s*<\/table>/g,
  )) {
    result.push(...blocks(normalized.slice(offset, match.index)));
    // Consume the entire table grammar. Never drop an unfamiliar attribute, cell or row.
    const rows: RuleNode[] = [];
    const left = match[1].replace(/<tr>([\s\S]*?)<\/tr>/g, (_, body: string) => {
      const cells: RuleNode[] = [];
      const rest = body.replace(
        /<td(?: colspan="(2)")?>([\s\S]*?)<\/td>/g,
        (_, span: string, cell: string) => {
          cells.push({ type: "tableCell", span: Number(span || 1), children: blocks(cell.trim()) });
          return "";
        },
      );
      if (rest.trim() || !cells.length) throw Error("Unknown table cell markup");
      rows.push({ type: "tableRow", children: cells });
      return "";
    });
    if (left.trim() || !rows.length) throw Error("Unknown table row markup");
    result.push({ type: "table", children: rows });
    offset = match.index + match[0].length;
  }
  return [...result, ...blocks(normalized.slice(offset))];
}
export function buildCorpus(locale: RulesLocale, text: string, verifyHash = true): RulesCorpus {
  if (verifyHash) pinned(locale, text);
  const lines = text.trimEnd().split("\n");
  const entries: [string, Partial<Record<RulesLocale, string>>][] = Object.entries(headings);
  const expected = new Map(
    entries.flatMap(([id, paths]) => (paths[locale] ? [[paths[locale]!, id] as const] : [])),
  );
  const sections: RuleSection[] = [];
  const path: string[] = [];
  const parents: string[] = [];
  const seen = new Set<string>();
  const fragments = new Map<string, string>();
  const anchors: Record<string, string> = {};
  const unresolved: RulesCorpus["unresolved"] = [];
  for (const [i, line] of lines.entries()) {
    if (locale === "zh-TW" && i < 38) continue; // frontmatter, widgets and blog navigation
    const heading = /^(#+) (.+)$/.exec(line);
    const clean = (s: string) => s.replace(/<a id="(_idTextAnchor\d+)"><\/a>/g, "");
    if (heading) {
      const title = clean(heading[2]).trim();
      const depth = heading[1].length;
      path.splice(depth - 1, Infinity, title);
      const id = expected.get(path.join(" / "));
      if (!id || seen.has(id)) throw Error(`Unexpected or duplicate heading: ${path.join(" / ")}`);
      seen.add(id);
      const previous = sections.at(-1);
      if (previous) previous.sourceLines[1] = i;
      sections.push({
        id,
        parentId: depth === 1 ? null : parents[depth - 2],
        title,
        sourceLines: [i + 1, lines.length],
        blocks: [],
      });
      parents.splice(depth - 1, Infinity, id);
      fragments.set("#" + title, fragments.has("#" + title) ? "" : id);
      fragments.set("#" + id, id);
    }
    for (const m of line.matchAll(/<a id="(_idTextAnchor\d+)"><\/a>/g)) {
      anchors[m[1]] = sections.at(-1)!.id;
      fragments.set("#" + m[1], anchors[m[1]]);
    }
  }
  for (const id of expected.values()) if (!seen.has(id)) throw Error(`Missing heading: ${id}`);
  const titles = new Map(sections.map(({ id, title }) => [id, title]));
  for (const section of sections) {
    const [from, to] = section.sourceLines;
    const body = lines
      .slice(from, to)
      .map((line, index) => {
        const n = from + index + 1;
        if (locale === "zh-TW") return n === 51 ? "" : line; // inline aside for the excluded widget
        let occurrence = 0;
        const out = line
          .replace(/<a id="_idTextAnchor\d+"><\/a>/g, "")
          .replace(/page\s+(?:XX|72)/g, (ref) => {
            const target = printReferences[n]?.[occurrence++];
            if (target === undefined) throw Error(`Unmapped print reference at ${n}`);
            if (target === null) {
              unresolved.push({ line: n, text: ref });
              return ref;
            }
            const title = titles.get(target);
            if (!title) throw Error(`Orphan print link at ${n}: ${target}`);
            return `[${title}](#${target})`;
          });
        if (occurrence !== (printReferences[n]?.length ?? 0))
          throw Error(`Missing print reference at ${n}`);
        return out;
      })
      .join("\n");
    section.blocks = convert(body, fragments);
  }
  return { version: 1, locale, source: sources[locale], notices, anchors, unresolved, sections };
}
export const encode = (corpus: RulesCorpus) => JSON.stringify(corpus) + "\n";
/**
 * The pinned English source and each locale's generated corpus. Resolved here, beside the source:
 * this folder keeps its depth under the data folder in the public tree (systems/fate/), so these
 * paths hold in both trees, unlike a relative path from the plugin's code.
 */
export const englishSource = new URL("./sources/Fate-Condensed-SRD-CC-BY.md", import.meta.url);
export const rulesArtifact = (locale: RulesLocale) =>
  new URL(`../../data/fate-condensed/rules/${locale}.json`, import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { zh: { type: "string" }, en: { type: "string" }, check: { type: "boolean" } },
  });
  if (!values.zh) throw Error("Supply --zh <pinned MDX blob>");
  for (const locale of ["en", "zh-TW"] as const) {
    const file = locale === "en" ? (values.en ?? englishSource) : values.zh;
    const output = rulesArtifact(locale);
    const bytes = encode(buildCorpus(locale, readFileSync(file, "utf8")));
    if (values.check) {
      if (readFileSync(output, "utf8") !== bytes) throw Error(`Stale corpus: ${locale}`);
    } else writeFileSync(output, bytes);
  }
}
