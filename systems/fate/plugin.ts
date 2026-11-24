import type { Schema, Template } from "@skald/types/schema";
import type { DSLConfig, SystemConfig, SystemGameData } from "@skald/types/system";
import type { BuiltinLocalSystemData, SystemPlugin } from "@skald/sheet-sdk/modules/systems";
import config from "@skald/system-fate/data/fate-condensed/system.json";
export function loadFateMessages(locale: string) {
  return locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/zh-TW.json").then(m => m.default)
    : import("@skald/system-fate/data/fate-condensed/messages/en.json").then(m => m.default);
}

async function loadFateCondensedData(): Promise<BuiltinLocalSystemData> {
  const [schema, template, defaultData, dslRollRules, dslAliases, skills] = await Promise.all([
    import("@skald/system-fate/data/fate-condensed/schema.json").then((m) => m.default as Schema),
    import("@skald/system-fate/data/fate-condensed/template.json").then((m) => m.default as Template),
    import("@skald/system-fate/data/fate-condensed/default-data.json").then(
      (m) => m.default as Record<string, unknown>,
    ),
    import("@skald/system-fate/data/fate-condensed/dsl-roll-rules.json").then(
      (m) => m.default as unknown,
    ),
    import("@skald/system-fate/data/fate-condensed/dsl-aliases.json").then(
      (m) => m.default as unknown,
    ),
    import("@skald/system-fate/data/fate-condensed/skills-master.json").then(
      (m) => m.default as unknown,
    ),
  ]);

  return {
    schema,
    template,
    defaultData,
    gameData: {
      skills,
    } as SystemGameData,
    dsl: {
      rollRules: dslRollRules as DSLConfig["rollRules"],
      aliases: dslAliases as DSLConfig["aliases"],
    },
  };
}

export const fatePlugin: SystemPlugin = {
  systems: {
    "fate-condensed": {
      config: config as SystemConfig,
      presentation: { icon: "dices", hue: 165, coverUrl: "/assets/system-covers/fate-condensed.webp" },
      loadBuiltinData: loadFateCondensedData,
      loadMessages: loadFateMessages,
    },
  },
};
