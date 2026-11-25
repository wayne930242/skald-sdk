/**
 * Built-in classes as the class builder reads them (CLASS-IMPL §1, §2.3): the progression and counts
 * columns of each class table, its subclass, ASI and extra attack levels from its classFeature ids,
 * and `copyFrom`, a form pre-filled from a built-in class. Also the ladder the generator emits.
 */
import { subclassLevelsOf } from "../subclass/parents";
import { MULTICLASS_SLOTS } from "../subclass/slots";
import { MULTICLASS_RULES } from "../../../reference/multiclass";
import type {
  AsiLadder, BuiltinClassChassis, ClassContext, ClassEquipmentLine, ClassForm, MasteryKind, Progression, TableCell,
} from "./form";
import { empty, emptyMulticlass, type ClassMulticlassForm } from "./form";

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] => array(value).filter((v): v is string => typeof v === "string");
const string = (value: unknown): string => (typeof value === "string" ? value : "");
const number = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

export const NONE = "—";
const FEATURE_TABLE = ["Level", "Proficiency Bonus", "Class Features"];

/** The class's progression table: the `table` block whose first labels are Level, Proficiency Bonus, Class Features. */
export function featureTable(entries: readonly unknown[]): { colLabels: string[]; rows: TableCell[][] } | undefined {
  for (const block of entries) {
    const b = object(block);
    const labels = strings(b.colLabels);
    if (b.type === "table" && FEATURE_TABLE.every((label, i) => labels[i] === label)) {
      return { colLabels: labels, rows: array(b.rows).map((row) => array(row) as TableCell[]) };
    }
  }
  return undefined;
}

const ASI = { standard: [4, 8, 12, 16], fighter: [4, 6, 8, 12, 14, 16], rogue: [4, 8, 10, 12, 16] } as const;

export function asiLevels(ladder: AsiLadder): readonly number[] {
  return ASI[ladder];
}

function progressionOf(value: unknown): Progression | null {
  return value === "full" || value === "artificer" || value === "pact" ? value : null;
}

/** One built-in class from its corpus entry and its classFeature ids. */
export function builtinChassis(
  entry: { id: string; meta?: Record<string, unknown>; entries: readonly unknown[] },
  featureIds: Iterable<string>,
): BuiltinClassChassis {
  const meta = entry.meta ?? {};
  const table = featureTable(entry.entries);
  const column = (label: string) => {
    const index = table?.colLabels.indexOf(label) ?? -1;
    return table && index >= 0 ? table.rows.map((row) => row[index]) : null;
  };
  const ids = [...featureIds].map((id) => id.replace(/^classFeature:/, ""));
  const has = (leaf: string) => ids.includes(`${entry.id}/${leaf}`);
  const asi: AsiLadder = has("ability-score-improvement-l6") ? "fighter" : has("ability-score-improvement-l10") ? "rogue" : "standard";
  const masteryCount = number(meta.masteryCountL1) ?? 0;
  const mastery: MasteryKind = entry.id === "barbarian" || entry.id === "fighter" ? entry.id : masteryCount ? "two" : "none";
  const slots = column("Spell Slots");
  const level = column("Slot Level");
  return {
    id: entry.id,
    meta,
    progression: progressionOf(object(meta.spellcasting).progression),
    cantrips: column("Cantrips"),
    prepared: column("Prepared Spells"),
    pact: slots && level ? { slots, level } : null,
    weaponMastery: column("Weapon Mastery"),
    subclassLevels: subclassLevelsOf(entry.id, ids),
    asi,
    extraAttack: has("extra-attack-l5"),
    mastery,
  };
}

/** Spell slots at class `level` (1–20): full = multiclass row L, artificer = row ⌈L/2⌉ (5 levels), pact = none here. */
export function slotsAt(progression: Progression, level: number): number[] {
  if (progression === "full") return [...MULTICLASS_SLOTS[level - 1]];
  if (progression === "artificer") return MULTICLASS_SLOTS[Math.ceil(level / 2) - 1].slice(0, 5);
  return [];
}

export const proficiencyAt = (level: number) => `+${2 + Math.floor((level - 1) / 4)}`;

/** A generated feature: the leaf slug (without `-l<N>`), its level and what it is. */
export interface GeneratedFeature {
  slug: string;
  level: number;
  generated: "spellcasting" | "pactMagic" | "weaponMastery" | "subclass" | "subclassFeature" | "asi" | "extraAttack" | "epicBoon";
}

/** The generated features of a form, by level (same slugs as the built-in classes). */
export function generatedFeatures(f: ClassForm, ctx: Pick<ClassContext, "builtin">): GeneratedFeature[] {
  const out: GeneratedFeature[] = [];
  if (f.casting) {
    out.push(f.casting.progression === "pact"
      ? { slug: "pact-magic", level: 1, generated: "pactMagic" }
      : { slug: "spellcasting", level: 1, generated: "spellcasting" });
  }
  if (f.mastery !== "none") out.push({ slug: "weapon-mastery", level: 1, generated: "weaponMastery" });
  const [first, ...rest] = ctx.builtin[f.subclassLike]?.subclassLevels ?? [];
  if (first) out.push({ slug: `${f.id}-subclass`, level: first, generated: "subclass" });
  for (const level of rest) out.push({ slug: "subclass-feature", level, generated: "subclassFeature" });
  for (const level of asiLevels(f.asi)) out.push({ slug: "ability-score-improvement", level, generated: "asi" });
  if (f.extraAttack) out.push({ slug: "extra-attack", level: 5, generated: "extraAttack" });
  out.push({ slug: "epic-boon", level: 19, generated: "epicBoon" });
  return out.sort((a, b) => a.level - b.level);
}

/** Slugs an authored feature never takes, so the level-up helper's id patterns read only generated rows. */
export function reservedSlugs(classId: string): Set<string> {
  return new Set(["spellcasting", "pact-magic", "weapon-mastery", `${classId}-subclass`, "subclass-feature", "ability-score-improvement", "extra-attack", "epic-boon"]);
}

function line(item: unknown): ClassEquipmentLine {
  const raw = object(item);
  const categories = strings(raw.categories);
  return {
    ref: string(raw.ref), displayName: string(raw.displayName), qty: number(raw.qty) ?? 1,
    ...(categories.length ? { categories } : {}),
  };
}

/** A form pre-filled from built-in class `id`: chassis, casting (counts and list of itself), ladder, equipment; no text. */
export function copyFrom(id: string, builtin: Readonly<Record<string, BuiltinClassChassis>>): ClassForm {
  const b = builtin[id];
  if (!b) throw new Error(`unknown built-in class ${id}`);
  const m = b.meta;
  const skill = object(m.skillChoice);
  const choice = m.toolChoice ? object(m.toolChoice) : null;
  const casting = object(m.spellcasting);
  const ability = string(casting.ability);
  const form = empty();
  return {
    ...form,
    hitDie: ([6, 8, 10, 12] as const).find((d) => d === m.hitDie) ?? 8,
    primaryAbility: strings(m.primaryAbility) as ClassForm["primaryAbility"],
    saves: strings(m.saves) as ClassForm["saves"],
    armor: strings(m.armor).filter((a): a is ClassForm["armor"][number] => ["light", "medium", "heavy", "shield"].includes(a)),
    weapons: strings(m.weapons).filter((w): w is ClassForm["weapons"][number] => w === "simple" || w === "martial"),
    skillChoice: { count: number(skill.count) ?? 2, from: skill.from === "any" ? "any" : strings(skill.from) },
    toolGrants: strings(m.toolGrants),
    toolChoice: choice
      ? { category: choice.categories ? strings(choice.categories).join("-") : string(choice.category), count: number(choice.count) ?? 1 }
      : null,
    unarmoredDefense: m.unarmoredDefense === "barbarian" || m.unarmoredDefense === "monk" ? m.unarmoredDefense : "none",
    startingEquipment: array(m.startingEquipment).map((pkg) => ({ gp: number(object(pkg).gp) ?? 0, items: array(object(pkg).items).map(line) })),
    casting: b.progression && (ability === "int" || ability === "wis" || ability === "cha")
      ? { progression: b.progression, ability, countsLike: id, list: id }
      : null,
    asi: b.asi,
    subclassLike: id,
    extraAttack: b.extraAttack,
    mastery: b.mastery,
    multiclass: Object.hasOwn(MULTICLASS_RULES, id)
      ? (structuredClone(MULTICLASS_RULES[id as keyof typeof MULTICLASS_RULES]) as unknown as ClassMulticlassForm)
      : emptyMulticlass(),
  };
}
