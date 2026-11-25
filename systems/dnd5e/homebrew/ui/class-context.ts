import { createTranslator } from "next-intl";
import { loadEnglishCorpus } from "../../reference/load-corpus";
import { builtinChassis, type BuiltinClassChassis, type ClassContext, type ClassLabels, type Localized } from "../domain/class";
import type { HomebrewItemRecord } from "../domain/types";
import { refContext, SKILL_FIELDS } from "../domain/wizard-items";
import { backgroundRefs } from "./background-refs";
import { legacyWording, localizedTerms, namesOf, termsOf, type RawLegacy } from "./subclass-context";

/** What the class editor needs: the generator context plus localized names for its pickers. */
export interface ClassCatalog {
  context: ClassContext;
  /** Built-in class ids in game data order. */
  ids: string[];
  abilityNames: Record<string, Localized>;
  skillNames: Record<string, Localized>;
  /** Items and base items (built-in and the user's homebrew) the equipment and tool pickers offer; `tool`: a tool kind. */
  items: Array<{ ref: string; name: Localized; tool: boolean }>;
}

async function labelsOf(locale: "en" | "zh-TW") {
  const messages = (
    await (locale === "en"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json")
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/zh-TW.json"))
  ).default;
  // Raw: the domain generator fills the `{class}`-style placeholders itself.
  const raw = createTranslator({ locale, messages, namespace: "homebrew" }).raw as (key: string) => unknown;
  return { labels: raw("class.generated") as ClassLabels, legacy: raw("class.generatedLegacy") as RawLegacy };
}

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

/** Load the built-in classes (corpus tables and feature ids), labels and refs, only when a class editor opens. */
export async function loadClassCatalog(rows: readonly HomebrewItemRecord[]): Promise<ClassCatalog> {
  const [{ default: classes }, corpus, en, zh, enLabels, zhLabels, refs, enTerms, zhTerms] = await Promise.all([
    import("@skald/system-dnd5e/data/dnd5e-2024/game/classes.json"),
    loadEnglishCorpus("class"),
    namesOf("en"),
    namesOf("zh-TW"),
    labelsOf("en"),
    labelsOf("zh-TW"),
    backgroundRefs([...rows]),
    termsOf("en"),
    termsOf("zh-TW"),
  ]);
  if (!corpus) throw new Error("Missing class corpus");
  const ids = classes.map((c) => c.id);
  const builtin: Record<string, BuiltinClassChassis> = {};
  await Promise.all(
    ids.map(async (id) => {
      const part = await loadEnglishCorpus(`classFeature-${id}`);
      const entry = corpus[`class:${id}`];
      if (!part || !entry) throw new Error(`Missing class ${id}`);
      builtin[id] = builtinChassis(entry, Object.keys(part));
    }),
  );
  const name = (kind: string, id: string): Localized => ({
    en: en[kind]?.[id] ?? id,
    zh: zh[kind]?.[id] ?? en[kind]?.[id] ?? id,
  });
  // The sheet's and the wizard's terms, so the editor names Wisdom and Perception as they do.
  const abilityNames = localizedTerms(ABILITIES, enTerms.ability, zhTerms.ability);
  const skillNames = localizedTerms(Object.keys(SKILL_FIELDS), enTerms.skill, zhTerms.skill, (id) => SKILL_FIELDS[id]);
  const TOOL_TYPES = ["AT", "T", "GS", "INS"];
  const items = [...refs.values()].flatMap((info) => {
    const [kind, id] = info.ref.split(":");
    if (kind !== "item" && kind !== "baseItem") return [];
    const local = info.builtin ? zh[kind]?.[id] : undefined;
    return [{ ref: info.ref, name: { en: info.name, zh: local ?? info.name }, tool: TOOL_TYPES.includes(String(info.meta.type)) }];
  });
  return {
    ids,
    abilityNames,
    skillNames,
    items,
    context: {
      labels: { en: enLabels.labels, zh: zhLabels.labels },
      legacy: legacyWording<ClassLabels>(enLabels.legacy, zhLabels.legacy),
      builtin,
      refs: refContext(refs.values()),
      abilityNames,
      classNames: Object.fromEntries(ids.map((id) => [id, name("class", id)])),
    },
  };
}
