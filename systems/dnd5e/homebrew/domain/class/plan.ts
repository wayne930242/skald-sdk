/**
 * Reading a class back from its rows and planning a save (CLASS-IMPL §2.4). A class reads as a form
 * only when regenerating it (current or v4.152.0 wording: `read-back.ts`) gives the stored entries and
 * zh-TW layers back exactly, progression table included; else `lossless` is false and the editor opens
 * its rows read-only. Wizard items are derived from the entry on every save, so they do not decide `lossless`.
 */
import { readNames, readTexts } from "../forms/common";
import { planRows, type MultiRowPlan } from "../multi-row-plan";
import { legacyContext, readsBack } from "../read-back";
import type { FormRead } from "../forms/common";
import type { HomebrewItemRecord, HomebrewPayload } from "../types";
import { empty, emptyMulticlass, type ClassContext, type ClassMulticlassForm, type ClassEquipmentOption, type ClassForm } from "./form";
import { toRows } from "./generate";

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] => array(value).filter((v): v is string => typeof v === "string");

/** A class's feature rows: kind `classFeature`, key under `<class key>/`. */
export function rowsOf(key: string, rows: readonly HomebrewItemRecord[]): HomebrewItemRecord[] {
  return rows.filter((r) => r.kind === "classFeature" && r.key.startsWith(key + "/"));
}

function text(p: HomebrewPayload, trim: number) {
  const names = readNames(p);
  const cut = (a: readonly unknown[]) => (trim ? a.slice(0, -trim) : a);
  const t = readTexts(cut(p.entry!.entries ?? []), p.zhTW?.entries ? cut(p.zhTW.entries) : undefined, names.chineseOnly);
  return { nameEn: names.nameEn, nameZh: names.nameZh, textEn: t.en, textZh: t.zh };
}

function equipment(value: unknown): ClassEquipmentOption[] {
  return array(value).map((pkg) => ({
    gp: Number(object(pkg).gp) || 0,
    items: array(object(pkg).items).map((item) => {
      const raw = object(item);
      const categories = strings(raw.categories);
      return { ref: string(raw.ref), displayName: string(raw.displayName), qty: Number(raw.qty) || 1, ...(categories.length ? { categories } : {}) };
    }),
  }));
}

function multiclassOf(value: unknown): ClassMulticlassForm {
  if (!value || typeof value !== "object") return emptyMulticlass();
  const raw = object(value);
  const requires = object(raw.requires);
  const gains = object(raw.gains);
  const skills = gains.skills ? object(gains.skills) : null;
  const tools = gains.tools ? object(gains.tools) : null;
  const choice = tools?.choice ? object(tools.choice) : null;
  return {
    requires: { abilities: strings(requires.abilities) as ClassMulticlassForm["requires"]["abilities"], mode: requires.mode === "any" ? "any" : "all", score: 13 },
    gains: {
      armor: strings(gains.armor) as ClassMulticlassForm["gains"]["armor"],
      weapons: strings(gains.weapons) as ClassMulticlassForm["gains"]["weapons"],
      skills: skills ? { count: Number(skills.count) || 0, from: skills.from === "any" ? "any" : strings(skills.from) } : null,
      tools: tools
        ? {
            ...(tools.grant ? { grant: strings(tools.grant) } : {}),
            ...(choice ? { choice: { category: string(choice.category), count: Number(choice.count) || 1 } } : {}),
          }
        : null,
    },
  };
}

export function fromRows(payload: HomebrewPayload, features: readonly HomebrewItemRecord[], ctx: ClassContext): FormRead<ClassForm> {
  const form = empty();
  try {
    const e = payload.entry!;
    if (e.kind !== "class") throw new Error("not a class");
    const m = e.meta ?? {};
    const chassis = object(m.chassis);
    const sc = m.spellcasting ? object(m.spellcasting) : null;
    const skill = object(m.skillChoice);
    Object.assign(form, text(payload, 1), {
      id: e.id,
      hitDie: m.hitDie,
      primaryAbility: strings(m.primaryAbility),
      saves: strings(m.saves),
      armor: strings(m.armor),
      weapons: strings(m.weapons),
      skillChoice: { count: Number(skill.count) || 0, from: skill.from === "any" ? "any" : strings(skill.from) },
      toolGrants: strings(m.toolGrants),
      toolChoice: m.toolChoice ? { category: string(object(m.toolChoice).category), count: Number(object(m.toolChoice).count) || 1 } : null,
      unarmoredDefense: m.unarmoredDefense,
      startingEquipment: equipment(m.startingEquipment),
      casting: sc ? { progression: sc.progression, ability: sc.ability, countsLike: string(chassis.countsLike), list: string(sc.list) } : null,
      asi: chassis.asi,
      subclassLike: string(chassis.subclassLike),
      extraAttack: chassis.extraAttack === true,
      mastery: chassis.mastery,
      multiclass: multiclassOf(m.multiclass),
      columns: array(chassis.columns).map((col) => ({
        nameEn: string(object(col).nameEn), nameZh: string(object(col).nameZh), values: strings(object(col).values),
      })),
    });
    for (const r of features) {
      const meta = r.payload.entry?.meta ?? {};
      if (!meta.generated) form.features.push({ ...text(r.payload, 0), level: Number(meta.level), key: r.key.split("/").at(-1) });
    }
    return { form, lossless: readsBack([toRows(form, ctx), toRows(form, legacyContext(ctx))], payload, features) };
  } catch {
    return { form, lossless: false };
  }
}

/** The rows to write (class row, generated, authored; unchanged ones skipped) and the stored rows to delete. */
export function plan(form: ClassForm, ctx: ClassContext, stored: readonly HomebrewItemRecord[]): MultiRowPlan {
  const rows = toRows(form, ctx);
  const key = rows[0].key;
  return planRows(rows, [...stored.filter((r) => r.kind === "class" && r.key === key), ...rowsOf(key, stored)]);
}
