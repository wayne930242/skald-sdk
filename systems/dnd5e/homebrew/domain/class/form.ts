/**
 * The homebrew class form (CLASS-IMPL §2.2): a level-1 chassis, an optional spellcasting progression
 * copied from a built-in class of the same type, a ladder (ASI levels, subclass levels, extra attack,
 * weapon mastery, author columns) and features by level. Pure data; `generate.ts` turns it into rows.
 */
import { namedIssues, type FormIssue, type TextForm } from "../forms/common";
import type { EquipmentLine } from "../forms/background";
import { ABILITIES, type Ability } from "../forms/spell";
import type { LegacyAware } from "../read-back";
import type { HomebrewRefContext } from "../wizard-items";
import { SKILL_FIELDS } from "../wizard-items";
import type { MulticlassRules } from "../../../reference/multiclass";

export type Localized = { en: string; zh: string };
export type Progression = "full" | "artificer" | "pact";
export type AsiLadder = "standard" | "fighter" | "rogue";
export type MasteryKind = "none" | "two" | "barbarian" | "fighter";
/** A progression table cell as the corpus writes it: a number, a string, or `—` for none. */
export type TableCell = string | number;

export interface ClassFeatureForm {
  /** The stored leaf `<slug>-l<N>`; absent for a new feature. */
  key?: string;
  level: number;
  nameEn: string;
  nameZh: string;
  textEn: string;
  textZh: string;
}

export interface ClassColumnForm {
  nameEn: string;
  nameZh: string;
  /** 20 cells, level 1 first; "" = `—`. */
  values: string[];
}

/** A starting equipment line; `categories` is a choice of any item of those categories (Bard: an instrument). */
export interface ClassEquipmentLine extends EquipmentLine {
  categories?: string[];
}

/** One starting equipment option (A, B, C by position): items and gold, or gold only. */
export interface ClassEquipmentOption {
  gp: number;
  items: ClassEquipmentLine[];
}

export interface ClassCastingForm {
  progression: Progression;
  ability: "int" | "wis" | "cha";
  /** A built-in class with the same progression whose cantrip and prepared columns this class copies. */
  countsLike: string;
  /** "" = own list (spells naming this class); else a built-in caster whose list it borrows. */
  list: string;
}

/** What taking this class as a further class needs and gives (`meta.multiclass`, read by `multiclassRulesOf`). */
export type ClassMulticlassForm = Omit<MulticlassRules, "known">;

export interface ClassForm extends TextForm {
  hitDie: 6 | 8 | 10 | 12;
  primaryAbility: Ability[];
  saves: Ability[];
  armor: Array<"light" | "medium" | "heavy" | "shield">;
  weapons: Array<"simple" | "martial">;
  skillChoice: { count: number; from: string[] | "any" };
  /** Tool refs. */
  toolGrants: string[];
  toolChoice: null | { category: string; count: number };
  unarmoredDefense: "none" | "barbarian" | "monk";
  /** 0–3 options, lettered A, B, C. */
  startingEquipment: ClassEquipmentOption[];
  casting: null | ClassCastingForm;
  asi: AsiLadder;
  /** A built-in class whose subclass levels this class copies. */
  subclassLike: string;
  extraAttack: boolean;
  mastery: MasteryKind;
  columns: ClassColumnForm[];
  features: ClassFeatureForm[];
  /** `requires.abilities` empty = the primary abilities. */
  multiclass: ClassMulticlassForm;
}

/** What generation needs of each built-in class (`chassis.ts` `builtinChassis` reads it from the corpus). */
export interface BuiltinClassChassis {
  id: string;
  /** The corpus entry's level-1 fields (`copyFrom` reads them). */
  meta: Record<string, unknown>;
  progression: Progression | null;
  /** 20 cells each, from the class table; null when the table has no such column. */
  cantrips: TableCell[] | null;
  prepared: TableCell[] | null;
  pact: { slots: TableCell[]; level: TableCell[] } | null;
  weaponMastery: TableCell[] | null;
  subclassLevels: number[];
  asi: AsiLadder;
  extraAttack: boolean;
  mastery: MasteryKind;
}

/** Generated names, texts and table labels, one set per locale; `{class}`, `{ability}`, `{list}` are filled in. */
export type ClassLabels = Record<
  | "caption" | "level" | "proficiency" | "features" | "separator" | "cantrips" | "prepared" | "slotGroup" | "slots"
  | "slotLevel" | "weaponMastery" | "spellcastingName" | "spellcastingText" | "pactMagicName" | "pactMagicText"
  | "masteryText" | "masteryTwoText" | "subclassName" | "subclassText" | "subclassFeatureName" | "subclassFeatureText"
  | "asiName" | "asiText" | "extraAttackName" | "extraAttackText" | "epicBoonName" | "epicBoonText",
  string
>;

/** `legacy`, `legacyText`: the v4.152.0 regeneration of the read-back (`../read-back.ts`). */
export interface ClassContext extends LegacyAware<ClassLabels> {
  labels: { en: ClassLabels; zh: ClassLabels };
  /** Built-in classes by id. */
  builtin: Readonly<Record<string, BuiltinClassChassis>>;
  /** Wizard item labels (tools, items) of built-in and the user's homebrew refs. */
  refs: HomebrewRefContext;
  abilityNames: Readonly<Record<string, Localized>>;
  /** Built-in class names (a borrowed list). */
  classNames: Readonly<Record<string, Localized>>;
}

export const HIT_DICE = [6, 8, 10, 12] as const;
export const CLASS_LIMITS = { columns: 4, features: 60, cell: 40, text: 20000, equipmentOptions: 3 } as const;
const ARMOR = ["light", "medium", "heavy", "shield"];
const MULTICLASS_ARMOR = ["light", "medium", "shield"];
const WEAPONS = ["simple", "martial"];

export function empty(): ClassForm {
  return {
    id: "", nameEn: "", nameZh: "", textEn: "", textZh: "",
    hitDie: 8, primaryAbility: [], saves: [], armor: [], weapons: ["simple"],
    skillChoice: { count: 2, from: [] }, toolGrants: [], toolChoice: null, unarmoredDefense: "none",
    startingEquipment: [], casting: null, asi: "standard", subclassLike: "", extraAttack: false, mastery: "none",
    columns: [], features: [], multiclass: emptyMulticlass(),
  };
}

export function emptyMulticlass(): ClassMulticlassForm {
  return { requires: { abilities: [], mode: "all", score: 13 }, gains: { armor: [], weapons: [], skills: null, tools: null } };
}

const ability = (value: unknown) => ABILITIES.includes(value as Ability);
const int = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** What blocks a save; `ctx` supplies the built-in classes (id clash, `countsLike`, `list`, `subclassLike`). */
export function issues(f: ClassForm, ctx: Pick<ClassContext, "builtin">): FormIssue[] {
  const out = namedIssues(f);
  const builtin = ctx.builtin;
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(f.id) || Object.hasOwn(builtin, f.id)) out.push("id");
  if (!HIT_DICE.includes(f.hitDie)) out.push("hitDie");
  if (f.saves.length !== 2 || new Set(f.saves).size !== 2 || !f.saves.every(ability)) out.push("saves");
  if (f.primaryAbility.length < 1 || f.primaryAbility.length > 2 || new Set(f.primaryAbility).size !== f.primaryAbility.length || !f.primaryAbility.every(ability)) {
    out.push("primaryAbility");
  }
  if (!f.armor.every((a) => ARMOR.includes(a)) || !f.weapons.every((w) => WEAPONS.includes(w))) out.push("training");
  const from = f.skillChoice.from;
  if (!int(f.skillChoice.count, 0, 4) || (from !== "any" && !from.every((id) => id in SKILL_FIELDS))) out.push("skills");
  if (f.toolChoice && !(int(f.toolChoice.count, 1, 10) && f.toolChoice.category)) out.push("toolChoice");
  if (!["none", "barbarian", "monk"].includes(f.unarmoredDefense)) out.push("unarmoredDefense");
  if (
    f.startingEquipment.length > CLASS_LIMITS.equipmentOptions ||
    f.startingEquipment.some((o) => !(o.gp >= 0) || o.items.some((l) => (!l.ref && !l.displayName.trim() && !l.categories?.length) || !int(l.qty, 1, 999)))
  ) {
    out.push("equipment");
  }
  const c = f.casting;
  if (c) {
    const like = builtin[c.countsLike];
    if (!["full", "artificer", "pact"].includes(c.progression) || !["int", "wis", "cha"].includes(c.ability)) out.push("casting");
    if (!like || like.progression !== c.progression || !like.prepared || (c.progression === "pact" && !like.pact)) out.push("countsLike");
    if (c.list && !builtin[c.list]?.progression) out.push("list");
  }
  if (!["standard", "fighter", "rogue"].includes(f.asi)) out.push("asi");
  if (!builtin[f.subclassLike]?.subclassLevels.length) out.push("subclassLike");
  if (!["none", "two", "barbarian", "fighter"].includes(f.mastery) || (["barbarian", "fighter"].includes(f.mastery) && !builtin[f.mastery]?.weaponMastery)) {
    out.push("mastery");
  }
  if (
    f.columns.length > CLASS_LIMITS.columns ||
    f.columns.some((col) => !(col.nameEn.trim() || col.nameZh.trim()) || col.values.length !== 20 || col.values.some((v) => v.length > CLASS_LIMITS.cell))
  ) {
    out.push("columns");
  }
  if (multiclassProblem(f.multiclass)) out.push("multiclass");
  if (f.features.length > CLASS_LIMITS.features) out.push("features");
  for (const x of f.features) {
    if (!(x.nameEn.trim() || x.nameZh.trim()) || !int(x.level, 1, 20)) out.push("feature");
  }
  if ([f, ...f.features].some((x) => Math.max(x.textEn.length, x.textZh.length) > CLASS_LIMITS.text)) out.push("text");
  return [...new Set(out)];
}

function multiclassProblem(m: ClassMulticlassForm): boolean {
  const r = m.requires;
  const g = m.gains;
  if (!r || !g || r.score !== 13 || !["all", "any"].includes(r.mode)) return true;
  if (r.abilities.length > 6 || new Set(r.abilities).size !== r.abilities.length || !r.abilities.every(ability)) return true;
  if (!g.armor.every((a) => MULTICLASS_ARMOR.includes(a)) || new Set(g.armor).size !== g.armor.length) return true;
  if (!g.weapons.every((w) => w === "martial") || g.weapons.length > 1) return true;
  const from = g.skills?.from;
  if (g.skills && (!int(g.skills.count, 1, 4) || (from !== "any" && !from!.every((id) => id in SKILL_FIELDS)))) return true;
  const t = g.tools;
  if (t && !(t.grant?.length || t.choice)) return true;
  if (t?.grant && !t.grant.every((ref) => ref.trim())) return true;
  if (t?.choice && !(int(t.choice.count, 1, 10) && t.choice.category)) return true;
  return false;
}
