import { createTranslator } from "next-intl";
import { loadEnglishCorpus, loadReferenceNames } from "../../reference/load-corpus";
import {
  builtinParents,
  homebrewParents,
  type Localized,
  type SubclassContext,
  type SubclassLabels,
  type SpellInfo,
  type SubclassParent,
} from "../domain/subclass";
import type { LegacyWording } from "../domain/read-back";
import type { HomebrewItemRecord } from "../domain/types";

const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];

export interface SubclassCatalog {
  parents: SubclassParent[];
  spells: Record<string, Localized>;
  /** Level and class lists of each spell in `spells` (built-in game data, homebrew spell meta). */
  spellInfo: Record<string, SpellInfo>;
  labels: { en: SubclassLabels; zh: SubclassLabels };
  legacy: LegacyWording<SubclassLabels>;
  abilityNames: Record<string, Localized>;
  classNames: Record<string, Localized>;
}

async function labelsOf(locale: "en" | "zh-TW") {
  const messages = (
    await (locale === "en"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json")
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/zh-TW.json"))
  ).default;
  const t = createTranslator({ locale, messages, namespace: "homebrew.subclass" });
  // Raw: the domain generator fills the `{class}`-style placeholders itself.
  const raw = t.raw as (key: string) => unknown;
  return { labels: raw("generated") as SubclassLabels, legacy: raw("generatedLegacy") as RawLegacy };
}

/** A `…generatedLegacy` catalog object: label templates, and the ability names under `ability`. */
export type RawLegacy = Record<string, unknown> & { ability?: Record<string, string> };

/** The generated wording of v4.152.0 the read-back regenerates with, from both locales' `…generatedLegacy`. */
export function legacyWording<L>(en: RawLegacy, zh: RawLegacy): LegacyWording<L> {
  const labels = (raw: RawLegacy) => Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "ability")) as Partial<L>;
  const abilities = Object.keys(en.ability ?? {});
  return { labels: { en: labels(en), zh: labels(zh) }, abilityNames: localizedTerms(abilities, en.ability ?? {}, zh.ability ?? {}) };
}

export type Names = Record<string, Record<string, string> | undefined>;
type MainCatalog = { ref?: Names; ability?: Record<string, string>; skill?: Record<string, string> };
const mainCatalog = async (locale: "en" | "zh-TW") => {
  const messages = await (locale === "en" ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/en.json") : import("@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json"));
  return (messages.default ?? messages) as MainCatalog;
};

/** Ability and skill names as the sheet and the wizard show them: the main catalog's `ability` and `skill` (by sheet field id). */
export async function termsOf(locale: "en" | "zh-TW") {
  const messages = await mainCatalog(locale);
  return { ability: messages.ability ?? {}, skill: messages.skill ?? {} };
}

/** Both locales of a term list, falling back to the id. */
export function localizedTerms(ids: readonly string[], en: Record<string, string>, zh: Record<string, string>, field = (id: string) => id) {
  return Object.fromEntries(ids.map((id) => [id, { en: en[field(id)] ?? id, zh: zh[field(id)] ?? en[field(id)] ?? id }]));
}

/** Built-in names: the static catalog's `ref` (spells, classes) under the lazy reference names. */
export async function namesOf(locale: "en" | "zh-TW"): Promise<Names> {
  const [messages, lazy] = await Promise.all([mainCatalog(locale), loadReferenceNames(locale)]);
  const ref = messages.ref ?? {};
  const out: Names = { ...lazy };
  for (const [kind, names] of Object.entries(ref)) out[kind] = { ...names, ...out[kind] };
  return out;
}

/** Load the game data a subclass editor needs, only when one opens. */
export async function loadSubclassCatalog(rows: readonly HomebrewItemRecord[]): Promise<SubclassCatalog> {
  const [{ default: classes }, { default: gameSpells }, en, zh, enLabels, zhLabels, enTerms, zhTerms] = await Promise.all([
    import("@skald/system-dnd5e/data/dnd5e-2024/game/classes.json"),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/spells.json"),
    namesOf("en"),
    namesOf("zh-TW"),
    labelsOf("en"),
    labelsOf("zh-TW"),
    termsOf("en"),
    termsOf("zh-TW"),
  ]);
  const levels = new Map(
    await Promise.all(
      classes.map(async ({ id }) => {
        const part = await loadEnglishCorpus(`classFeature-${id}`);
        if (!part) throw new Error(`Missing classFeature-${id}`);
        return [id, Object.keys(part)] as const;
      }),
    ),
  );
  const className = (id: string) => ({ en: en.class?.[id] ?? id, zh: zh.class?.[id] ?? en.class?.[id] ?? id });
  const builtin = builtinParents(classes, (id) => levels.get(id) ?? []).map((p) => ({ ...p, name: className(p.id) }));
  const spells: Record<string, Localized> = {};
  for (const [id, name] of Object.entries(en.spell ?? {})) spells[`spell:${id}`] = { en: name, zh: zh.spell?.[id] ?? name };
  const spellInfo: Record<string, SpellInfo> = {};
  for (const spell of gameSpells as Array<{ ref: string; level: number; classes?: string[] }>)
    spellInfo[spell.ref] = { level: spell.level, classes: spell.classes ?? [] };
  for (const { kind, payload } of rows) {
    const entry = payload.entry;
    const ref = entry && `spell:${entry.id}`;
    if (kind === "spell" && ref && !spells[ref]) {
      spells[ref] = { en: entry!.name, zh: payload.zhTW?.name ?? entry!.name };
      const meta = entry!.meta ?? {};
      if (typeof meta.level === "number")
        spellInfo[ref] = { level: meta.level, classes: Array.isArray(meta.classes) ? meta.classes.map(String) : [] };
    }
  }
  const abilityNames = localizedTerms(ABILITY_IDS, enTerms.ability, zhTerms.ability);
  return {
    parents: [...builtin, ...homebrewParents(rows)],
    spells,
    spellInfo,
    labels: { en: enLabels.labels, zh: zhLabels.labels },
    legacy: legacyWording<SubclassLabels>(enLabels.legacy, zhLabels.legacy),
    abilityNames,
    classNames: Object.fromEntries(classes.map(({ id }) => [id, className(id)])),
  };
}

/** The generator context for one parent: its other subclasses' feature ids (built-in and every own pack). */
export async function loadSubclassContext(
  catalog: SubclassCatalog,
  parent: SubclassParent,
  rows: readonly HomebrewItemRecord[],
  ownKey?: string,
): Promise<SubclassContext> {
  const builtin = parent.builtin ? await loadEnglishCorpus(`subclassFeature-${parent.id}`) : null;
  const own = rows
    .filter((r) => r.kind === "subclassFeature" && r.key.startsWith(parent.id + "/"))
    .filter((r) => !ownKey || !r.key.startsWith(ownKey + "/"))
    .map((r) => `subclassFeature:${r.key}`);
  return {
    parent,
    labels: catalog.labels,
    legacy: catalog.legacy,
    spellNames: catalog.spells,
    abilityNames: catalog.abilityNames,
    classNames: catalog.classNames,
    otherFeatureIds: new Set([...Object.keys(builtin ?? {}), ...own]),
  };
}
