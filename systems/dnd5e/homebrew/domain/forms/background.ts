/**
 * The background form: three ability scores, an origin feat, two skills, tools and the two starting
 * equipment options (A: items and gold, B: gold only). Its wizard items name the feat, tools and
 * items it points to, so `toPayload` takes the context that knows them (built-in and homebrew).
 */
import type { HomebrewPayload } from "../types";
import { wizardItemsOf, SKILL_FIELDS, type HomebrewRefContext } from "../wizard-items";
import {
  assertNoIssues, entryOf, entryOfKind, hasZh, losslessRead, namedIssues, readNames, readTexts, textEntries,
  type FormIssue, type HomebrewFormCodec, type TextForm,
} from "./common";
import { ABILITIES, type Ability } from "./spell";

export interface EquipmentLine {
  /** A built-in or homebrew item ref; "" with a `displayName` for an item that has none. */
  ref: string;
  /** The line's own wording (`Book (Prayers)`); "" to use the item's name. */
  displayName: string;
  qty: number;
}

export interface BackgroundForm extends TextForm {
  abilityOptions: [Ability, Ability, Ability];
  /** `feat:<id>`. */
  originFeat: string;
  /** The spell list of an origin feat that asks for one (Magic Initiate: `cleric`); "". */
  originFeatSpellList: string;
  skills: [string, string];
  /** Tool refs the background grants. */
  toolGrants: string[];
  /** null: no tool choice. */
  toolChoice: { category: string; count: number } | null;
  equipmentA: { gp: number; items: EquipmentLine[] };
  /** Option B is gold only. */
  equipmentBGp: number;
}

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const objects = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(object) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function issues(form: BackgroundForm): FormIssue[] {
  const out = namedIssues(form);
  if (form.abilityOptions.length !== 3 || new Set(form.abilityOptions).size !== 3 || form.abilityOptions.some((ab) => !ABILITIES.includes(ab))) {
    out.push("abilityOptions");
  }
  if (!/^feat:[a-z0-9][a-z0-9/-]*$/.test(form.originFeat)) out.push("originFeat");
  if (form.skills.length !== 2 || form.skills[0] === form.skills[1] || form.skills.some((id) => !(id in SKILL_FIELDS))) out.push("skills");
  if (form.toolChoice && !(Number.isInteger(form.toolChoice.count) && form.toolChoice.count > 0 && form.toolChoice.category)) out.push("toolChoice");
  if (!(form.equipmentA.gp >= 0) || !(form.equipmentBGp >= 0)) out.push("equipment");
  if (form.equipmentA.items.some((line) => (!line.ref && !line.displayName.trim()) || !(Number.isInteger(line.qty) && line.qty > 0))) {
    out.push("equipment");
  }
  return [...new Set(out)];
}

function line(item: EquipmentLine): Raw {
  return { ...(item.displayName.trim() ? { displayName: item.displayName.trim() } : {}), qty: item.qty, ...(item.ref ? { ref: item.ref } : {}) };
}

function toPayload(form: BackgroundForm, context?: HomebrewRefContext): HomebrewPayload {
  assertNoIssues("background", issues(form));
  const { entry, zhTW } = entryOf("background", form, {
    ...textEntries(form.textEn, form.textZh),
    meta: {
      abilityOptions: [...form.abilityOptions],
      originFeat: { ref: form.originFeat, ...(form.originFeatSpellList ? { spellList: form.originFeatSpellList } : {}) },
      skills: [...form.skills],
      toolGrants: [...form.toolGrants],
      ...(form.toolChoice ? { toolChoice: { category: form.toolChoice.category, count: form.toolChoice.count } } : {}),
      startingEquipment: [
        { option: "A", gp: form.equipmentA.gp, items: form.equipmentA.items.map(line) },
        { option: "B", gp: form.equipmentBGp, items: [] },
      ],
    },
    withZh: hasZh(form.nameZh, form.textZh),
  });
  return { entry, ...(zhTW ? { zhTW } : {}), wizard: wizardItemsOf(entry, zhTW, context) };
}

function fromPayload(payload: HomebrewPayload) {
  const entry = entryOfKind(payload, "background");
  const m = entry.meta;
  const names = readNames(payload);
  const read = readTexts(entry.entries, payload.zhTW?.entries, names.chineseOnly);
  const abilities = texts(m.abilityOptions);
  const skills = texts(m.skills);
  const feat = object(m.originFeat);
  const packages = objects(m.startingEquipment);
  const a = packages.find((pkg) => pkg.option === "A") ?? {};
  const b = packages.find((pkg) => pkg.option === "B") ?? {};
  const choice = m.toolChoice ? object(m.toolChoice) : null;
  const ability = (index: number): Ability => ABILITIES.find((value) => value === abilities[index]) ?? ABILITIES[index];
  const form: BackgroundForm = {
    id: names.id, nameEn: names.nameEn, nameZh: names.nameZh, textEn: read.en, textZh: read.zh,
    abilityOptions: [ability(0), ability(1), ability(2)],
    originFeat: text(feat.ref),
    originFeatSpellList: text(feat.spellList),
    skills: [skills[0] ?? "", skills[1] ?? ""],
    toolGrants: texts(m.toolGrants),
    toolChoice: choice ? { category: text(choice.category), count: typeof choice.count === "number" ? choice.count : 1 } : null,
    equipmentA: {
      gp: typeof a.gp === "number" ? a.gp : 0,
      items: objects(a.items).map((item) => ({ ref: text(item.ref), displayName: text(item.displayName), qty: typeof item.qty === "number" ? item.qty : 1 })),
    },
    equipmentBGp: typeof b.gp === "number" ? b.gp : 50,
  };
  return { form, lossless: losslessRead(read.lossless, () => toPayload(form), payload) };
}

export const backgroundForm: HomebrewFormCodec<BackgroundForm> = {
  kind: "background",
  empty: () => ({
    id: "", nameEn: "", nameZh: "", textEn: "", textZh: "",
    abilityOptions: ["str", "dex", "con"], originFeat: "", originFeatSpellList: "", skills: ["", ""],
    toolGrants: [], toolChoice: null, equipmentA: { gp: 0, items: [] }, equipmentBGp: 50,
  }),
  issues,
  toPayload,
  fromPayload,
};
