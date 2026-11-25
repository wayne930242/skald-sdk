/**
 * The species form: size, speed, senses, resistances, a skill choice, and its traits. The entry's
 * text is the traits as `{ type: "entries", name, entries }` blocks (a trait row's text is picked by
 * its block name), the same as `meta.traits`. Lineages and species spellcasting are out of the first
 * batch (imports keep them).
 */
import { canonicalJson } from "../../../content-pack/domain/canonical-json";
import type { HomebrewPayload } from "../types";
import { wizardItemsOf, SKILL_FIELDS, type HomebrewRefContext } from "../wizard-items";
import {
  assertNoIssues, entryOf, entryOfKind, hasZh, losslessRead, namedIssues, pair, readNames, readPair, readTexts, textEntries,
  type FormIssue, type HomebrewFormCodec, type NamedForm,
} from "./common";

export const SPECIES_SIZES = ["M", "S", "SM"] as const;
export type SpeciesSize = (typeof SPECIES_SIZES)[number];

export interface SpeciesTraitForm {
  nameEn: string;
  nameZh: string;
  textEn: string;
  textZh: string;
}

export interface SpeciesForm extends NamedForm {
  /** Medium, Small, or a choice of Small or Medium. */
  size: SpeciesSize;
  speed: number;
  /** Feet; 0: none. */
  darkvision: number;
  /** Damage types, lowercase (`poison`). */
  resist: string[];
  /** null: no skill choice. `from` lists skill ids, or `any`. */
  skillChoice: { count: number; from: string[] | "any" } | null;
  /** Extra hit points per level; 0: none. */
  hpPerLevel: number;
  /** The species grants an origin feat of the player's choice. */
  originFeatChoice: boolean;
  traits: SpeciesTraitForm[];
}

const SIZE_META: Record<SpeciesSize, string[]> = { M: ["M"], S: ["S"], SM: ["S", "M"] };

type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const isBlock = (value: unknown): value is { name: string; entries: unknown[] } =>
  typeof object(value).name === "string" && Array.isArray(object(value).entries);

function issues(form: SpeciesForm): FormIssue[] {
  const out = namedIssues(form);
  if (!SPECIES_SIZES.includes(form.size)) out.push("size");
  if (!(form.speed > 0)) out.push("speed");
  if (!(form.darkvision >= 0) || !(form.hpPerLevel >= 0)) out.push("senses");
  if (form.skillChoice) {
    const { count, from } = form.skillChoice;
    if (!(Number.isInteger(count) && count > 0) || (from !== "any" && (from.length === 0 || from.some((id) => !(id in SKILL_FIELDS))))) {
      out.push("skillChoice");
    }
  }
  if (form.traits.some((trait) => !trait.nameEn.trim() && !trait.nameZh.trim())) out.push("traitName");
  return out;
}

function toPayload(form: SpeciesForm, context?: HomebrewRefContext): HomebrewPayload {
  assertNoIssues("species", issues(form));
  const traits = form.traits.map((trait) => ({ names: pair(trait.nameEn, trait.nameZh), text: textEntries(trait.textEn, trait.textZh) }));
  const en = traits.map((trait) => ({ type: "entries", name: trait.names.en, entries: trait.text.en }));
  const zh = traits.map((trait) => ({ type: "entries", name: trait.names.zh, entries: trait.text.zh }));
  const { entry, zhTW } = entryOf("species", form, {
    en,
    zh,
    meta: {
      size: [...SIZE_META[form.size]],
      speed: form.speed,
      ...(form.darkvision > 0 ? { darkvision: form.darkvision } : {}),
      ...(form.resist.length ? { resist: [...form.resist] } : {}),
      traits: traits.map((trait) => ({ name: trait.names.en, entries: trait.text.en })),
      lineages: [],
      ...(form.skillChoice ? { skillChoice: { count: form.skillChoice.count, from: form.skillChoice.from === "any" ? "any" : [...form.skillChoice.from] } } : {}),
      ...(form.hpPerLevel > 0 ? { hpPerLevel: form.hpPerLevel } : {}),
      ...(form.originFeatChoice ? { originFeatChoice: true } : {}),
    },
    withZh: hasZh(form.nameZh, ...form.traits.flatMap((trait) => [trait.nameZh, trait.textZh])),
  });
  return { entry, ...(zhTW ? { zhTW } : {}), wizard: wizardItemsOf(entry, zhTW, context) };
}

function fromPayload(payload: HomebrewPayload) {
  const entry = entryOfKind(payload, "species");
  const m = entry.meta;
  const names = readNames(payload);
  const zhBlocks = payload.zhTW?.entries;
  let lossless = true;
  const traits: SpeciesTraitForm[] = entry.entries.map((block, index) => {
    if (!isBlock(block)) {
      lossless = false;
      return { nameEn: "", nameZh: "", textEn: "", textZh: "" };
    }
    const zh = zhBlocks ? zhBlocks[index] : undefined;
    const zhBlock = isBlock(zh) ? zh : undefined;
    if (zhBlocks && !zhBlock) lossless = false;
    const traitNames = readPair(block.name, zhBlock?.name, true);
    const texts = readTexts(block.entries, zhBlock?.entries, traitNames.en === "");
    lossless &&= texts.lossless;
    return { nameEn: traitNames.en, nameZh: traitNames.zh, textEn: texts.en, textZh: texts.zh };
  });
  const sizes = Array.isArray(m.size) ? m.size : [];
  const size = SPECIES_SIZES.find((key) => canonicalJson(SIZE_META[key]) === canonicalJson(sizes)) ?? "M";
  const skill = object(m.skillChoice);
  const from = skill.from === "any" ? "any" : Array.isArray(skill.from) ? skill.from.filter((id): id is string => typeof id === "string") : [];
  const form: SpeciesForm = {
    id: names.id, nameEn: names.nameEn, nameZh: names.nameZh,
    size,
    speed: typeof m.speed === "number" ? m.speed : 30,
    darkvision: typeof m.darkvision === "number" ? m.darkvision : 0,
    resist: Array.isArray(m.resist) ? m.resist.filter((value): value is string => typeof value === "string") : [],
    skillChoice: m.skillChoice ? { count: typeof skill.count === "number" ? skill.count : 1, from } : null,
    hpPerLevel: typeof m.hpPerLevel === "number" ? m.hpPerLevel : 0,
    originFeatChoice: m.originFeatChoice === true,
    traits,
  };
  return { form, lossless: losslessRead(lossless, () => toPayload(form), payload) };
}

export const speciesForm: HomebrewFormCodec<SpeciesForm> = {
  kind: "species",
  empty: () => ({
    id: "", nameEn: "", nameZh: "", size: "M", speed: 30, darkvision: 0, resist: [], skillChoice: null, hpPerLevel: 0,
    originFeatChoice: false, traits: [],
  }),
  issues,
  toPayload,
  fromPayload,
};
