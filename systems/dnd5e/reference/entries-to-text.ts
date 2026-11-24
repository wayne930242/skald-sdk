import { inlineHeadSeparator } from "./inline-head";
import { parseTags, tokensToText, type LabelResolver } from "./tags";

/**
 * A 5etools entries tree as plain text with line breaks: the row snapshot of a pack entry (§3.2,
 * at most 8,000 characters) and import notes. Same reading of tags and entry types as the renderer.
 */

type Node = Record<string, unknown>;

export const SNAPSHOT_MAX_CHARS = 8000;

export interface EntriesTextOptions {
  label?: LabelResolver;
  /** Localized `abilityDc` / `abilityAttackMod` sentences; English when absent. */
  abilityDc?: (name: string, abilities: string) => string;
  abilityAttackMod?: (name: string, abilities: string) => string;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inline(text: string, options: EntriesTextOptions): string {
  return tokensToText(parseTags(text), options.label);
}

/** The feature name of a `refClassFeature` / `refSubclassFeature` / `refOptionalfeature` target. */
function refName(raw: unknown): string {
  return String(raw ?? "").split("|")[0] ?? "";
}

function cellText(cell: unknown, options: EntriesTextOptions): string {
  if (typeof cell === "string") return inline(cell, options);
  if (typeof cell === "number") return String(cell);
  if (isNode(cell) && isNode(cell.roll)) {
    const roll = cell.roll;
    if (roll.exact !== undefined) return String(roll.exact);
    return `${String(roll.min ?? "")}–${String(roll.max ?? "")}`;
  }
  return lines(cell, options).join(" ");
}

function named(node: Node, body: string[], options: EntriesTextOptions): string[] {
  const name = typeof node.name === "string" ? inline(node.name, options) : "";
  if (!name) return body;
  if (body.length === 0) return [name];
  const [first, ...rest] = body;
  return [`${name}${inlineHeadSeparator(name)}${first}`, ...rest];
}

function children(node: Node, options: EntriesTextOptions): string[] {
  const nested = node.entries ?? node.entry ?? node.items;
  return lines(nested, options);
}

function lines(value: unknown, options: EntriesTextOptions): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [inline(value, options)];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => lines(item, options));
  if (!isNode(value)) return [];
  const type = typeof value.type === "string" ? value.type : "entries";
  switch (type) {
    case "image":
      return [];
    case "list":
      return (Array.isArray(value.items) ? value.items : []).map((item) => `• ${lines(item, options).join(" ")}`);
    case "item":
    case "itemSub":
      return [named(value, children(value, options), options).join(" ")];
    case "table": {
      const out: string[] = [];
      if (typeof value.caption === "string") out.push(inline(value.caption, options));
      if (Array.isArray(value.colLabels)) out.push(value.colLabels.map((label) => cellText(label, options)).join(" | "));
      for (const row of Array.isArray(value.rows) ? value.rows : []) {
        const cells = Array.isArray(row) ? row : isNode(row) && Array.isArray(row.row) ? row.row : [];
        out.push(cells.map((cell) => cellText(cell, options)).join(" | "));
      }
      for (const note of Array.isArray(value.footnotes) ? value.footnotes : []) out.push(cellText(note, options));
      return out;
    }
    case "refClassFeature":
      return [refName(value.classFeature)];
    case "refSubclassFeature":
      return [refName(value.subclassFeature)];
    case "refOptionalfeature":
      return [refName(value.optionalfeature)];
    case "abilityDc":
    case "abilityAttackMod": {
      const name = typeof value.name === "string" ? value.name : "";
      const abilities = (Array.isArray(value.attributes) ? value.attributes : []).join("/");
      const sentence = type === "abilityDc"
        ? options.abilityDc?.(name, abilities) ?? `${name} save DC = 8 + your Proficiency Bonus + your ${abilities} modifier`
        : options.abilityAttackMod?.(name, abilities) ?? `${name} attack modifier = your Proficiency Bonus + your ${abilities} modifier`;
      return [sentence];
    }
    case "inline":
    case "inlineBlock":
      return [children(value, options).join(" ")];
    case "statblock":
      return typeof value.name === "string" ? [value.name] : [];
    // Chapter nodes that embed other entries (plan T2b §2.5): the reader resolves them; they add no text here.
    case "include":
    case "refList":
      return [];
    case "quote": {
      const body = children(value, options);
      return typeof value.by === "string" ? [...body, `— ${value.by}`] : body;
    }
    default:
      // entries, section, inset, insetReadaloud, options and any other container with entries.
      return named(value, children(value, options), options);
  }
}

/** Plain text of an entries tree, one paragraph per line; cut at `maxChars` with an ellipsis. */
export function entriesToText(entries: unknown, options: EntriesTextOptions = {}, maxChars = SNAPSHOT_MAX_CHARS): string {
  const text = lines(entries, options).filter((line) => line.trim().length > 0).join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
