import type { Schema, Template } from "@skald/types/schema";
import type { DSLConfig, SystemGameData } from "@skald/types/system";
import type { BuiltinLocalSystemData } from "@skald/sheet-sdk/modules/systems";

/**
 * Tier B: the sheet files, DSL and the compact wizard game data (`game/*.json`).
 * Keys mirror `system.json` `gameData`; corpus files are not listed there and are not loaded here.
 */
export async function loadDnd5e2024Data(): Promise<BuiltinLocalSystemData> {
  const [
    schema,
    template,
    defaultData,
    lookupTables,
    rollRules,
    aliases,
    rollMacros,
    classes,
    backgrounds,
    species,
    lineages,
    feats,
    classOptions,
    invocations,
    spells,
    weapons,
    tools,
    languages,
    equipmentPackages,
    skills,
    abilityArrays,
    wizard,
  ] = await Promise.all([
    import("@skald/system-dnd5e/data/dnd5e-2024/schema.json").then((m) => m.default as unknown as Schema),
    import("@skald/system-dnd5e/data/dnd5e-2024/template.json").then((m) => m.default as unknown as Template),
    import("@skald/system-dnd5e/data/dnd5e-2024/default-data.json").then((m) => m.default as Record<string, unknown>),
    import("@skald/system-dnd5e/data/dnd5e-2024/dsl-lookup-tables.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/dsl-roll-rules.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/dsl-aliases.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/roll-macros.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/classes.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/backgrounds.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/species.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/lineages.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/feats.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/class-options.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/invocations.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/spells.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/tools.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/languages.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/equipment-packages.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/skills.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/game/ability-arrays.json").then((m) => m.default as unknown),
    import("@skald/system-dnd5e/data/dnd5e-2024/wizard.json").then((m) => m.default as unknown),
  ]);

  return {
    schema,
    template,
    defaultData,
    gameData: {
      classes,
      backgrounds,
      species,
      lineages,
      feats,
      "class-options": classOptions,
      invocations,
      spells,
      weapons,
      tools,
      languages,
      "equipment-packages": equipmentPackages,
      skills,
      "ability-arrays": abilityArrays,
    } as SystemGameData,
    dsl: {
      lookupTables: lookupTables as DSLConfig["lookupTables"],
      rollRules: rollRules as DSLConfig["rollRules"],
      aliases: aliases as DSLConfig["aliases"],
      rollMacros: rollMacros as DSLConfig["rollMacros"],
    },
    wizard,
  };
}
