import { namedIssues, type TextForm } from "../forms/common";
import type { SubclassParent } from "./parents";
import { spellLevels } from "./spells";
import type { LegacyAware } from "../read-back";
export interface SubclassFeatureForm extends Omit<TextForm, "id"> {
  key?: string;
  level: number;
  /** Editor-only identity that survives edits (a move tracks the feature by it); never written to rows. */
  draftId?: string;
}
export interface Breakpoint {
  level: number;
  value: number;
}
export interface SubclassForm extends TextForm {
  parent: string;
  features: SubclassFeatureForm[];
  spells: { level: number; refs: string[] }[];
  spellcasting: null | {
    ability: "int" | "wis" | "cha";
    list: string;
    cantrips: Breakpoint[];
    prepared: Breakpoint[];
    textEn: string;
    textZh: string;
  };
}
export type Localized = { en: string; zh: string };
export type SubclassLabels = Record<
  | "features"
  | "spellsName"
  | "alwaysPrepared"
  | "classLevel"
  | "spells"
  | "castingName"
  | "castingRule"
  | "derived"
  | "cantrips"
  | "prepared",
  string
>;
/** `legacy`, `legacyText`: the v4.152.0 regeneration of the read-back (`../read-back.ts`). */
export interface SubclassContext extends LegacyAware<SubclassLabels> {
  parent: SubclassParent;
  labels: { en: SubclassLabels; zh: SubclassLabels };
  spellNames: Readonly<Record<string, Localized>>;
  abilityNames: Readonly<Record<string, Localized>>;
  classNames: Readonly<Record<string, Localized>>;
  otherFeatureIds: ReadonlySet<string>;
}
export function empty(parent = ""): SubclassForm {
  return {
    id: "",
    parent,
    nameEn: "",
    nameZh: "",
    textEn: "",
    textZh: "",
    features: [],
    spells: [],
    spellcasting: null,
  };
}
export function issues(f: SubclassForm, p?: SubclassParent) {
  const errors = namedIssues(f);
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(f.id)) errors.push("id");
  if (!p || p.id !== f.parent || !p.subclassLevels.length) errors.push("parent");
  if (f.features.length > 40) errors.push("features");
  for (const x of [f, ...f.features, ...(f.spellcasting ? [f.spellcasting] : [])])
    if (Math.max(x.textEn.length, x.textZh.length) > 20000) errors.push("text");
  for (const x of f.features)
    if (
      !(x.nameEn.trim() || x.nameZh.trim()) ||
      (!p?.subclassLevels.includes(x.level) && !x.key?.endsWith(`-l${x.level}`))
    )
      errors.push("feature");
  const sc = f.spellcasting;
  if (sc && (!p?.thirdCaster || !["int", "wis", "cha"].includes(sc.ability) || !sc.list)) errors.push("spellcasting");
  if (sc)
    for (const col of [sc.cantrips, sc.prepared])
      if (
        col.some(
          (b, i) =>
            !Number.isInteger(b.level) ||
            b.level < 3 ||
            b.level > 20 ||
            !Number.isInteger(b.value) ||
            b.value < 0 ||
            (i > 0 && col[i - 1].level >= b.level),
        )
      )
        errors.push("breakpoints");
  const levels = p ? spellLevels(p, f) : [];
  if (
    f.spells.some(
      (s, i) =>
        !levels.includes(s.level) ||
        s.refs.length > 10 ||
        !s.refs.length ||
        f.spells.slice(0, i).some((t) => t.level === s.level),
    )
  )
    errors.push("spells");
  return errors;
}
