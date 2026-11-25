import { parseTags, tokensToText } from "../../reference/tags";

/**
 * Features that are a choice among options (UAT M4), read from a feature's English blocks:
 * - `feature`: an `options` block of other class or subclass features (Divine Order: Protector or
 *   Thaumaturge); only the picked option's row is added.
 * - `feat`: a Fighting Style feat of the player's choice (`{@filter …|feats|category=FS}`), or an
 *   option the feature names instead (Ranger's Druidic Warrior), joined to the row's name as below.
 * - `named`: options written inside the feature itself (Hunter's Prey: Colossus Slayer or Horde
 *   Breaker); the picked option's name joins the feature row's name.
 * Pure; `classInfoOf` reads it.
 */

/** Options named inside a feature's blocks: their English names and the blocks index that holds them. */
export interface RawNamed {
  options: string[];
  block: number;
}

/** A choice as the blocks state it: option features by English name and level, before they are matched to refs. */
export type RawChoice =
  | { kind: "feature"; options: Array<{ name: string; level: number }> }
  /** `alternatives`: options the feature names instead of a feat (Ranger's Druidic Warrior, UAT F006). */
  | { kind: "feat"; category: "fightingStyle"; alternatives?: RawNamed }
  | ({ kind: "named" } & RawNamed);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `Name|Class|Source|Level|…` (refClassFeature) or `Name|Class|Source|Subclass|Source|Level|…` (refSubclassFeature). */
function optionRef(node: Record<string, unknown>): { name: string; level: number } | null {
  const [tag, at] = node.type === "refClassFeature" ? ["classFeature", 3] as const : node.type === "refSubclassFeature" ? ["subclassFeature", 5] as const : [null, 0] as const;
  const value = tag ? node[tag] : undefined;
  if (typeof value !== "string") return null;
  const parts = value.split("|");
  const level = Number(parts[at]);
  return parts[0] && Number.isInteger(level) ? { name: parts[0], level } : null;
}

function findOptions(node: unknown): Array<{ name: string; level: number }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findOptions(child);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (node.type === "options" && (node.count === undefined || node.count === 1) && Array.isArray(node.entries)) {
    const options = node.entries.filter(isRecord).map(optionRef);
    if (options.length >= 2 && options.every((option) => option !== null)) return options as Array<{ name: string; level: number }>;
  }
  return Array.isArray(node.entries) ? findOptions(node.entries) : null;
}

const FIGHTING_STYLE = /\{@filter [^}]*\|feats\|[^}]*category=FS\b/;
const NAMED_OPTIONS_LEAD = /\bone of the following (?:feature )?options of your choice\b/i;
/** "Instead of choosing one of those feats, you can choose the option below." (Ranger, Paladin). */
const ALTERNATIVE_LEAD = /\bthe options? below\b/i;

/** The names of an unnamed `entries` block's named children (`min` or more), else null. */
function childNames(block: unknown, min: number): string[] | null {
  if (!isRecord(block) || block.type !== "entries" || block.name) return null;
  const children = Array.isArray(block.entries) ? block.entries : [];
  const names = children.map((child) => (isRecord(child) && typeof child.name === "string" ? child.name : ""));
  return names.length >= min && names.every(Boolean) ? names : null;
}

/** The choice a feature's blocks offer, or null for a feature that is not a choice. */
export function choiceOf(entries: readonly unknown[] | undefined): RawChoice | null {
  if (!entries) return null;
  const options = findOptions(entries);
  if (options) return { kind: "feature", options };
  const style = entries.findIndex((block) => typeof block === "string" && FIGHTING_STYLE.test(block));
  if (style >= 0) {
    // A feat of the category, or one of the options the feature names instead (SRD 5.2.1 Ranger and Paladin).
    const lead = entries[style] as string;
    const names = ALTERNATIVE_LEAD.test(lead) ? childNames(entries[style + 1], 1) : null;
    return names ? { kind: "feat", category: "fightingStyle", alternatives: { options: names, block: style + 1 } } : { kind: "feat", category: "fightingStyle" };
  }
  for (let index = 1; index < entries.length; index += 1) {
    const lead = entries[index - 1];
    if (typeof lead !== "string" || !NAMED_OPTIONS_LEAD.test(lead)) continue;
    const names = childNames(entries[index], 2);
    if (names) return { kind: "named", options: names, block: index };
  }
  return null;
}

/** The option names of a `named` choice (or a feat's alternatives) in a localized copy of the blocks (same shape), else null. */
export function namedOptionsIn(blocks: readonly unknown[], choice: { block: number; options: readonly string[] }): string[] | null {
  const names = childNames(blocks[choice.block], 1);
  return names && names.length === choice.options.length ? names : null;
}

/** A subclass's one-line summary: the italic tagline that opens its first feature (`{@i …}`), as plain text. */
export function taglineOf(entries: readonly unknown[] | undefined): string | undefined {
  const first = entries?.find((block) => typeof block === "string");
  if (typeof first !== "string") return undefined;
  const match = /^\{@i ([^{}]+)\}$/.exec(first.trim());
  const text = match ? tokensToText(parseTags(match[1])).trim() : "";
  return text || undefined;
}
