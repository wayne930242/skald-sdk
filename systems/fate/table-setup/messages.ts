import { loadFatePresetLabels, type FatePresetAxis, type FatePresetLabels } from "../domain/presets";

const LABEL_GROUPS = {
  skills: "skillLists",
  allocation: "allocations",
  stress: "stress",
  injuries: "injuryModels",
  extreme: "extreme",
  ratings: "ratings",
  scale: "scale",
} as const satisfies Record<FatePresetAxis, keyof FatePresetLabels>;

/**
 * Fate's table setup catalog (`fateTableSetup.*`): its own strings, the option names of the preset
 * labels under `fateTableSetup.options.<axis>.<id>`, and the recipe names under `recipes`.
 */
export async function loadFateTableSetupMessages(locale: string): Promise<Record<string, unknown>> {
  const zh = locale === "zh-TW";
  const [own, labels] = await Promise.all([
    zh
      ? import("@skald/system-fate/data/fate-condensed/messages/v2-table-setup/zh-TW.json").then((module) => module.default)
      : import("@skald/system-fate/data/fate-condensed/messages/v2-table-setup/en.json").then((module) => module.default),
    loadFatePresetLabels(zh ? "zh-TW" : "en"),
  ]);
  const options = Object.fromEntries(Object.entries(LABEL_GROUPS).map(([axis, group]) => [axis, labels[group]]));
  return { fateTableSetup: { ...own.fateTableSetup, options, recipes: labels.recipes } };
}
