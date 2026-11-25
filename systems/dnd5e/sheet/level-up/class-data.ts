import { progressionOf, type ClassBlocksSource, type ClassProgression } from "../../reference/class-progression";
import { casterKindOf, multiclassRulesOf, subclassCasting, type CasterKind, type MulticlassRules } from "../../reference/multiclass";
import { ABILITIES, type Ability } from "../play/play-model";
import { choiceOf, taglineOf, type RawChoice } from "./options";
import { LEVEL_UP_RULES } from "./rules";

/**
 * A class as the level-up helper reads it (phase 2b §4.2), from loaded entries of any source
 * (corpus parts, a Drive pack's entries, homebrew rows): its features with their choices, its
 * subclasses (a caster one marked), progression and multiclass rules. Pure.
 */

const leafOf = (ref: string) => ref.slice(ref.lastIndexOf("/") + 1);

/** A class or subclass feature entry (`classFeature:<c>/<slug>-l<N>`, `subclassFeature:<c>/<sub>/<slug>-l<N>`). */
export interface LevelUpFeature {
  ref: string;
  /** Localized name, the row's name. */
  name: string;
  level: number;
  /** The feature is a choice among options (UAT M4): offered as a radio group with 稍後再選. */
  choice?: FeatureChoice;
  /** An option of another feature's choice (Protector of Divine Order): added only when picked there. */
  optionOf?: string;
}

/** Options named in a feature's text. */
export interface NamedOptions {
  /** Localized names. */
  options: string[];
  /** Their English names: stable, the row's `option` (`option-row.ts`). */
  ids: string[];
  /** The blocks index that holds them (to localize). */
  block: number;
}

/** A feature's options (`options.ts`): other features, a Fighting Style feat, or options named in its text. */
export type FeatureChoice =
  | { kind: "feature"; options: LevelUpFeature[] }
  /** `alternatives`: options the feature names instead of a feat (Ranger's Druidic Warrior). */
  | { kind: "feat"; category: "fightingStyle"; alternatives?: NamedOptions }
  | ({ kind: "named" } & NamedOptions);

export interface LevelUpSubclass {
  /** `subclass:<c>/<sub>` */
  ref: string;
  /** `<c>/<sub>` */
  id: string;
  /** Localized name, written to the sheet's `subclass`. */
  name: string;
  /** Every name the sheet's `subclass` text may hold (English and localized). */
  names: string[];
  features: LevelUpFeature[];
  /** A homebrew subclass that makes a third caster (`meta.spellcasting.progression: "third"`). */
  casting?: "third";
  /** One line on what the subclass is (its first feature's tagline), localized by the loader. */
  summary?: string;
  /** The feature the summary comes from (to localize it). */
  summaryRef?: string;
}

export type ClassOrigin = "srd" | "pack" | "custom";

/** A class as the helper reads it: its progression and the entries of its features and subclasses. */
export interface ClassInfo {
  id: string;
  progression: ClassProgression | null;
  /** Every class feature of the class, any level. */
  features: LevelUpFeature[];
  subclasses: LevelUpSubclass[];
  /** The class id whose spell list it uses (a borrowed list), default its own. */
  spellList?: string;
  /** Localized class name (a new `multiclass` row's `name`); default the id. */
  name: string;
  origin: ClassOrigin;
  /** Hit Point Die faces (`meta.hitDie`), default 8. */
  hitDie: number;
  primaryAbility: Ability[];
  /** Caster kind for combined slots: `meta.spellcasting.progression`, else read from the table (pact / slots → full). */
  casting: CasterKind | null;
  /** `meta.spellcasting.ability`, else `"none"`. */
  spellAbility: string;
  /** Prerequisite and gained proficiencies as a multiclass (`multiclassRulesOf`). */
  multiclass: MulticlassRules;
  /** The class's Unarmored Defense (`meta.unarmoredDefense`), when it has one. */
  unarmoredDefense: "barbarian" | "monk" | null;
}

/** An entry the builder reads: corpus, pack or homebrew, any kind (the others are ignored). */
export interface ClassInfoEntry {
  ref: string;
  name: string;
  meta?: Record<string, unknown>;
  /** English blocks: a feature's options and a subclass's tagline are read from them. */
  entries?: readonly unknown[];
}

export interface ClassInfoInput {
  id: string;
  /** The class entry (English blocks), or null when only its features are known. */
  blocks: ClassBlocksSource | null;
  /** Class features, subclasses and subclass features, built-in first: the first entry of a ref wins. */
  entries: Iterable<ClassInfoEntry>;
  /** The localized name of an entry; default its English name. */
  localize?: (ref: string, english: string) => string;
  spellList?: string;
  /** The class entry's `meta` (hit die, spellcasting, multiclass, primary ability). */
  meta?: Record<string, unknown>;
  /** The class's localized name; default its id. */
  name?: string;
  origin?: ClassOrigin;
}

/** The level of a feature id (`-l<N>`), else its `meta.level`. */
export function featureLevel(entry: ClassInfoEntry): number | null {
  const match = /-l(\d+)$/.exec(entry.ref);
  const level = match ? Number(match[1]) : entry.meta?.level;
  return typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= LEVEL_UP_RULES.maxLevel ? level : null;
}

/** A class's helper data from loaded entries (corpus parts, a pack's entries, homebrew rows). */
export function classInfoOf(input: ClassInfoInput): ClassInfo {
  const { id } = input;
  const localize = input.localize ?? ((_: string, english: string) => english);
  const seen = new Set<string>();
  const features: LevelUpFeature[] = [];
  const subclasses = new Map<string, LevelUpSubclass>();
  const subclassFeatures: Array<{ subclass: string; feature: LevelUpFeature }> = [];
  const subclassMeta = new Map<string, unknown>();
  // Options are named by English name and level within their class or subclass (`<scope>|<name>|<level>`).
  const byName = new Map<string, LevelUpFeature>();
  const raw: Array<{ feature: LevelUpFeature; scope: string; choice: RawChoice }> = [];
  const taglines = new Map<string, { ref: string; text: string; eponymous: boolean; level: number }>();
  for (const entry of input.entries) {
    if (seen.has(entry.ref)) continue;
    seen.add(entry.ref);
    const colon = entry.ref.indexOf(":");
    const kind = entry.ref.slice(0, colon);
    const path = colon > 0 ? entry.ref.slice(colon + 1) : "";
    const parts = path.split("/");
    if (parts[0] !== id) continue;
    const name = localize(entry.ref, entry.name);
    const remember = (feature: LevelUpFeature, scope: string) => {
      byName.set(`${scope}|${entry.name}|${feature.level}`, feature);
      const choice = choiceOf(entry.entries);
      if (choice) raw.push({ feature, scope, choice });
    };
    if (kind === "classFeature" && parts.length === 2) {
      const level = featureLevel(entry);
      if (level === null) continue;
      const feature = { ref: entry.ref, name, level };
      features.push(feature);
      remember(feature, id);
    } else if (kind === "subclass" && parts.length === 2) {
      subclasses.set(path, { ref: entry.ref, id: path, name, names: [...new Set([entry.name, name])], features: [] });
      subclassMeta.set(path, entry.meta);
      const text = taglineOf(entry.entries);
      if (text) taglines.set(path, { ref: entry.ref, text, eponymous: true, level: 0 });
    } else if (kind === "subclassFeature" && parts.length === 3) {
      const level = featureLevel(entry);
      if (level === null) continue;
      const subclass = `${parts[0]}/${parts[1]}`;
      const feature = { ref: entry.ref, name, level };
      subclassFeatures.push({ subclass, feature });
      remember(feature, subclass);
      const text = taglineOf(entry.entries);
      const eponymous = leafOf(entry.ref).replace(/-l\d+$/, "") === parts[1];
      const known = taglines.get(subclass);
      if (text && (!known || (eponymous && !known.eponymous) || (eponymous === known.eponymous && level < known.level))) taglines.set(subclass, { ref: entry.ref, text, eponymous, level });
    }
  }
  for (const { feature, scope, choice } of raw) {
    if (choice.kind !== "feature") {
      const named = (raw: { options: string[]; block: number }): NamedOptions => ({ options: [...raw.options], ids: [...raw.options], block: raw.block });
      if (choice.kind === "named") feature.choice = { kind: "named", ...named(choice) };
      else feature.choice = { kind: "feat", category: choice.category, ...(choice.alternatives ? { alternatives: named(choice.alternatives) } : {}) };
      continue;
    }
    const options = choice.options.map((option) => byName.get(`${scope}|${option.name}|${option.level}`)).filter((option): option is LevelUpFeature => option !== undefined && option !== feature);
    if (options.length < 2) continue;
    feature.choice = { kind: "feature", options };
    for (const option of options) option.optionOf = feature.ref;
  }
  for (const { subclass, feature } of subclassFeatures) subclasses.get(subclass)?.features.push(feature);
  for (const [path, tagline] of taglines) {
    const subclass = subclasses.get(path);
    if (subclass) Object.assign(subclass, { summary: tagline.text, summaryRef: tagline.ref });
  }
  const byLevel = (a: LevelUpFeature, b: LevelUpFeature) => a.level - b.level;
  features.sort(byLevel);
  for (const subclass of subclasses.values()) subclass.features.sort(byLevel);
  const progression = input.blocks ? progressionOf(input.blocks) : null;
  const meta = input.meta;
  const casting = isRecord(meta?.spellcasting) ? meta.spellcasting : null;
  const tableKind: CasterKind | null = progression?.levels.some((row) => row.pact)
    ? "pact"
    : progression?.levels.some((row) => row.slots?.some((count) => count > 0))
      ? "full"
      : null;
  const classCasting = casterKindOf(meta) ?? tableKind;
  // A subclass that brings Spellcasting to a class without it is a third caster (one rule with the sheet's).
  if (classCasting === null) {
    for (const subclass of subclasses.values()) {
      if (subclassCasting(subclass.id, subclassMeta.get(subclass.id), subclass.features.map((feature) => feature.ref))) subclass.casting = "third";
    }
  }
  const primary = Array.isArray(meta?.primaryAbility) ? meta.primaryAbility : [];
  const unarmored = meta?.unarmoredDefense;
  return {
    id,
    progression,
    features,
    subclasses: [...subclasses.values()],
    ...(input.spellList ? { spellList: input.spellList } : {}),
    name: input.name ?? id,
    origin: input.origin ?? "srd",
    hitDie: typeof meta?.hitDie === "number" && meta.hitDie > 0 ? meta.hitDie : 8,
    primaryAbility: ABILITIES.filter((ability) => primary.includes(ability)),
    casting: classCasting,
    spellAbility: typeof casting?.ability === "string" && casting.ability ? casting.ability : "none",
    multiclass: multiclassRulesOf(id, meta),
    unarmoredDefense: unarmored === "barbarian" || unarmored === "monk" ? unarmored : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
