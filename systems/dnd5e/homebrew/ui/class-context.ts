import { createTranslator } from "next-intl";
import { loadEnglishCorpus } from "../../reference/load-corpus";
import { builtinChassis, type BuiltinClassChassis, type ClassContext, type ClassLabels, type Localized } from "../domain/class";
import type { HomebrewItemRecord } from "../domain/types";
import { refContext, SKILL_FIELDS } from "../domain/wizard-items";
import { backgroundRefs } from "./background-refs";
import { namesOf } from "./subclass-context";

/** What the class editor needs: the generator context plus localized names for its pickers. */
export interface ClassCatalog {
  context: ClassContext;
  /** Built-in class ids in game data order. */
  ids: string[];
  abilityNames: Record<string, Localized>;
  skillNames: Record<string, Localized>;
}

async function labelsOf(locale: "en" | "zh-TW") {
  const messages = (
    await (locale === "en"
      ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json")
      : import("@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/zh-TW.json"))
  ).default;
  // Raw: the domain generator fills the `{class}`-style placeholders itself.
  const raw = createTranslator({ locale, messages, namespace: "homebrew" }).raw as (key: string) => unknown;
  return { labels: raw("class.generated") as ClassLabels, options: raw("option") as Record<string, string> };
}

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

/** Load the built-in classes (corpus tables and feature ids), labels and refs, only when a class editor opens. */
export async function loadClassCatalog(rows: readonly HomebrewItemRecord[]): Promise<ClassCatalog> {
  const [{ default: classes }, corpus, en, zh, enLabels, zhLabels, refs] = await Promise.all([
    import("@skald/system-dnd5e/data/dnd5e-2024/game/classes.json"),
    loadEnglishCorpus("class"),
    namesOf("en"),
    namesOf("zh-TW"),
    labelsOf("en"),
    labelsOf("zh-TW"),
    backgroundRefs([...rows]),
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
  const abilityNames = Object.fromEntries(ABILITIES.map((a) => [a, { en: enLabels.options[a], zh: zhLabels.options[a] }]));
  const skillNames = Object.fromEntries(
    Object.keys(SKILL_FIELDS).map((id) => [id, { en: enLabels.options[id] ?? id, zh: zhLabels.options[id] ?? id }]),
  );
  return {
    ids,
    abilityNames,
    skillNames,
    context: {
      labels: { en: enLabels.labels, zh: zhLabels.labels },
      builtin,
      refs: refContext(refs.values()),
      abilityNames,
      classNames: Object.fromEntries(ids.map((id) => [id, name("class", id)])),
    },
  };
}
