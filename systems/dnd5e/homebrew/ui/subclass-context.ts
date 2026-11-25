import { createTranslator } from "next-intl";
import { loadEnglishCorpus, loadReferenceNames } from "../../reference/load-corpus";
import {
  builtinParents,
  homebrewParents,
  type Localized,
  type SubclassContext,
  type SubclassLabels,
  type SubclassParent,
} from "../domain/subclass";
import type { HomebrewItemRecord } from "../domain/types";

export interface SubclassCatalog {
  parents: SubclassParent[];
  spells: Record<string, Localized>;
  labels: { en: SubclassLabels; zh: SubclassLabels };
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
  return {
    labels: raw("generated") as SubclassLabels,
    abilities: raw("abilityName") as Record<string, string>,
  };
}

type Names = Record<string, Record<string, string> | undefined>;
/** Built-in names: the static catalog's `ref` (spells, classes) under the lazy reference names. */
async function namesOf(locale: "en" | "zh-TW"): Promise<Names> {
  const [messages, lazy] = await Promise.all([
    locale === "en" ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/en.json") : import("@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json"),
    loadReferenceNames(locale),
  ]);
  const ref = ((messages.default ?? messages) as { ref?: Names }).ref ?? {};
  const out: Names = { ...lazy };
  for (const [kind, names] of Object.entries(ref)) out[kind] = { ...names, ...out[kind] };
  return out;
}

/** Load the game data a subclass editor needs, only when one opens. */
export async function loadSubclassCatalog(rows: readonly HomebrewItemRecord[]): Promise<SubclassCatalog> {
  const [{ default: classes }, en, zh, enLabels, zhLabels] = await Promise.all([
    import("@skald/system-dnd5e/data/dnd5e-2024/game/classes.json"),
    namesOf("en"),
    namesOf("zh-TW"),
    labelsOf("en"),
    labelsOf("zh-TW"),
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
  for (const { kind, payload } of rows) {
    const entry = payload.entry;
    const ref = entry && `spell:${entry.id}`;
    if (kind === "spell" && ref && !spells[ref])
      spells[ref] = { en: entry!.name, zh: payload.zhTW?.name ?? entry!.name };
  }
  const abilityNames = Object.fromEntries(
    Object.keys(enLabels.abilities).map((a) => [a, { en: enLabels.abilities[a], zh: zhLabels.abilities[a] }]),
  );
  return {
    parents: [...builtin, ...homebrewParents(rows)],
    spells,
    labels: { en: enLabels.labels, zh: zhLabels.labels },
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
    spellNames: catalog.spells,
    abilityNames: catalog.abilityNames,
    classNames: catalog.classNames,
    otherFeatureIds: new Set([...Object.keys(builtin ?? {}), ...own]),
  };
}
