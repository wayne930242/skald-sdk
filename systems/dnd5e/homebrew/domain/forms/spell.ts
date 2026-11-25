/**
 * The spell form: the built-in spell `meta` (level, school, classes, components, casting time, range,
 * duration, higher-level text) plus the roll facts the play view rolls (`damageDice`, `healDice`,
 * their per-slot steps, `spellAttack`) and two the form records for the reader (`damageType`,
 * `saveAbility`). Roll facts are entered, not parsed from the text.
 */
import type { HomebrewPayload } from "../types";
import { wizardItemsOf, type HomebrewRefContext } from "../wizard-items";
import {
  assertNoIssues, entryOf, entryOfKind, hasZh, losslessRead, namedIssues, pair, readNames, readPair, readTexts, textEntries,
  type FormIssue, type HomebrewFormCodec, type TextForm,
} from "./common";
import { parseMarkup } from "../markup";

export const SPELL_SCHOOLS = ["A", "C", "D", "E", "V", "I", "N", "T"] as const;
export const CASTING_UNITS = ["action", "bonus", "reaction", "minute", "hour"] as const;
export const RANGE_SHAPES = ["point", "emanation", "cone", "sphere", "line", "cube"] as const;
export const DISTANCE_UNITS = ["feet", "miles", "self", "touch", "sight", "unlimited"] as const;
export const DURATION_TYPES = ["instant", "timed", "permanent"] as const;
export const DURATION_UNITS = ["round", "minute", "hour", "day"] as const;
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

export type SpellSchool = (typeof SPELL_SCHOOLS)[number];
export type CastingUnit = (typeof CASTING_UNITS)[number];
export type RangeShape = (typeof RANGE_SHAPES)[number];
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export type DurationType = (typeof DURATION_TYPES)[number];
export type DurationUnit = (typeof DURATION_UNITS)[number];
export type Ability = (typeof ABILITIES)[number];

export interface SpellForm extends TextForm {
  /** 0 (cantrip) to 9. */
  level: number;
  school: SpellSchool;
  /** Built-in class ids whose spell list has the spell. */
  classes: string[];
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialEn: string;
  materialZh: string;
  concentration: boolean;
  ritual: boolean;
  castingNumber: number;
  castingUnit: CastingUnit;
  rangeShape: RangeShape;
  rangeUnit: DistanceUnit;
  /** Feet or miles; null for self, touch, sight and unlimited. */
  rangeAmount: number | null;
  durationType: DurationType;
  /** For a timed duration. */
  durationAmount: number | null;
  durationUnit: DurationUnit;
  /** Markup of the higher-level text (`meta.entriesHigherLevel`). */
  higherEn: string;
  higherZh: string;
  /** Dice such as `2d6`, or "". */
  damageDice: string;
  damageType: string;
  damageDiceHigher: string;
  healDice: string;
  healDiceHigher: string;
  healAddsSpellMod: boolean;
  spellAttack: boolean;
  saveAbility: Ability | "";
}

const DICE = /^\d+d\d+$/;
const MEASURED: ReadonlySet<string> = new Set(["feet", "miles"]);

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const first = (value: unknown): Raw => object(Array.isArray(value) ? value[0] : undefined);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const amount = (value: unknown): number | null => (typeof value === "number" && value > 0 ? value : null);
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => values.find((item) => item === value) ?? fallback;

function issues(form: SpellForm): FormIssue[] {
  const out = namedIssues(form);
  if (!Number.isInteger(form.level) || form.level < 0 || form.level > 9) out.push("level");
  if (!SPELL_SCHOOLS.includes(form.school)) out.push("school");
  if (!CASTING_UNITS.includes(form.castingUnit) || !(form.castingNumber > 0)) out.push("castingTime");
  if (!RANGE_SHAPES.includes(form.rangeShape) || !DISTANCE_UNITS.includes(form.rangeUnit)) out.push("range");
  if (MEASURED.has(form.rangeUnit) && !(form.rangeAmount && form.rangeAmount > 0)) out.push("range");
  if (!DURATION_TYPES.includes(form.durationType)) out.push("duration");
  if (form.durationType === "timed" && (!DURATION_UNITS.includes(form.durationUnit) || !(form.durationAmount && form.durationAmount > 0))) out.push("duration");
  for (const key of ["damageDice", "damageDiceHigher", "healDice", "healDiceHigher"] as const) {
    if (form[key] !== "" && !DICE.test(form[key])) out.push(key);
  }
  if (form.saveAbility !== "" && !ABILITIES.includes(form.saveAbility)) out.push("saveAbility");
  return [...new Set(out)];
}

function meta(form: SpellForm): Raw {
  const material = pair(form.materialEn, form.materialZh);
  const higher = parseMarkup(form.higherEn.trim() ? form.higherEn : form.higherZh);
  const rolls: Raw = {
    ...(form.damageDice ? { damageDice: form.damageDice } : {}),
    ...(form.damageType.trim() ? { damageType: form.damageType.trim() } : {}),
    ...(form.damageDiceHigher ? { damageDiceHigher: form.damageDiceHigher } : {}),
    ...(form.healDice ? { healDice: form.healDice } : {}),
    ...(form.healDiceHigher ? { healDiceHigher: form.healDiceHigher } : {}),
    ...(form.healDice && form.healAddsSpellMod ? { healAddsSpellMod: true } : {}),
    ...(form.spellAttack ? { spellAttack: true } : {}),
    ...(form.saveAbility ? { saveAbility: form.saveAbility } : {}),
  };
  return {
    level: form.level,
    school: form.school,
    classes: [...form.classes],
    components: { v: form.verbal, s: form.somatic, m: form.material, ...(form.material && material.en ? { mText: material.en } : {}) },
    concentration: form.concentration,
    ritual: form.ritual,
    time: [{ number: form.castingNumber, unit: form.castingUnit }],
    range: {
      type: form.rangeShape,
      distance: { type: form.rangeUnit, ...(MEASURED.has(form.rangeUnit) && form.rangeAmount ? { amount: form.rangeAmount } : {}) },
    },
    duration: [
      form.durationType === "timed"
        ? { type: "timed", duration: { type: form.durationUnit, amount: form.durationAmount }, ...(form.concentration ? { concentration: true } : {}) }
        : { type: form.durationType },
    ],
    ...(higher.length ? { entriesHigherLevel: higher } : {}),
    ...rolls,
  };
}

function toPayload(form: SpellForm, context?: HomebrewRefContext): HomebrewPayload {
  assertNoIssues("spell", issues(form));
  const material = pair(form.materialEn, form.materialZh);
  const higherZh = parseMarkup(form.higherZh.trim() ? form.higherZh : form.higherEn);
  const { entry, zhTW } = entryOf("spell", form, {
    ...textEntries(form.textEn, form.textZh),
    meta: meta(form),
    withZh: hasZh(form.nameZh, form.textZh, form.higherZh, form.materialZh),
    zhExtra: {
      ...(higherZh.length ? { entriesHigherLevel: higherZh } : {}),
      ...(form.material && material.zh ? { material: material.zh } : {}),
    },
  });
  return { entry, ...(zhTW ? { zhTW } : {}), wizard: wizardItemsOf(entry, zhTW, context) };
}

function fromPayload(payload: HomebrewPayload) {
  const entry = entryOfKind(payload, "spell");
  const m = entry.meta;
  const names = readNames(payload);
  const texts = readTexts(entry.entries, payload.zhTW?.entries, names.chineseOnly);
  const higherEn = Array.isArray(m.entriesHigherLevel) ? m.entriesHigherLevel : [];
  const higher = readTexts(higherEn, payload.zhTW?.entriesHigherLevel, names.chineseOnly);
  const components = object(m.components);
  const material = readPair(text(components.mText), payload.zhTW?.material);
  const time = first(m.time);
  const range = object(m.range);
  const distance = object(range.distance);
  const duration = first(m.duration);
  const timed = object(duration.duration);
  const form: SpellForm = {
    id: names.id, nameEn: names.nameEn, nameZh: names.nameZh, textEn: texts.en, textZh: texts.zh,
    level: typeof m.level === "number" ? m.level : 0,
    school: oneOf(SPELL_SCHOOLS, m.school, "V"),
    classes: Array.isArray(m.classes) ? m.classes.filter((value): value is string => typeof value === "string") : [],
    verbal: components.v === true,
    somatic: components.s === true,
    material: Boolean(components.m),
    materialEn: material.en,
    materialZh: material.zh,
    concentration: m.concentration === true,
    ritual: m.ritual === true,
    castingNumber: typeof time.number === "number" ? time.number : 1,
    castingUnit: oneOf(CASTING_UNITS, time.unit, "action"),
    rangeShape: oneOf(RANGE_SHAPES, range.type, "point"),
    rangeUnit: oneOf(DISTANCE_UNITS, distance.type, "feet"),
    rangeAmount: amount(distance.amount),
    durationType: oneOf(DURATION_TYPES, duration.type, "instant"),
    durationAmount: amount(timed.amount),
    durationUnit: oneOf(DURATION_UNITS, timed.type, "minute"),
    higherEn: higher.en,
    higherZh: higher.zh,
    damageDice: text(m.damageDice),
    damageType: text(m.damageType),
    damageDiceHigher: text(m.damageDiceHigher),
    healDice: text(m.healDice),
    healDiceHigher: text(m.healDiceHigher),
    healAddsSpellMod: m.healAddsSpellMod === true,
    spellAttack: m.spellAttack === true,
    saveAbility: oneOf<Ability | "">(ABILITIES, m.saveAbility, ""),
  };
  return { form, lossless: losslessRead(texts.lossless && higher.lossless, () => toPayload(form), payload) };
}

export const spellForm: HomebrewFormCodec<SpellForm> = {
  kind: "spell",
  empty: () => ({
    id: "", nameEn: "", nameZh: "", textEn: "", textZh: "",
    level: 1, school: "V", classes: [], verbal: true, somatic: true, material: false, materialEn: "", materialZh: "",
    concentration: false, ritual: false, castingNumber: 1, castingUnit: "action",
    rangeShape: "point", rangeUnit: "feet", rangeAmount: 60,
    durationType: "instant", durationAmount: null, durationUnit: "minute",
    higherEn: "", higherZh: "",
    damageDice: "", damageType: "", damageDiceHigher: "", healDice: "", healDiceHigher: "", healAddsSpellMod: false,
    spellAttack: false, saveAbility: "",
  }),
  issues,
  toPayload,
  fromPayload,
};
