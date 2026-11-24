import type { TableSetupValue } from "@skald/sheet-sdk/modules/systems";
import { FATE_PRESET_AXES, resolveFateRules, type FatePresetAxis, type FatePresetCatalog } from "../domain/presets";
import { readFateSheetPreset } from "../sheet/presets/sheet-state";
import { FATE_NEW_ITEM_POLICY, FATE_POINT_OVERRIDES, type FatePointOverride, type FateTableSetupConfig } from "./config";

/** Import the rules the card uses, including catalog defaults on older cards. */
export function importFateCharacterRecipe(
  config: FateTableSetupConfig,
  recipe: unknown,
  catalog: FatePresetCatalog,
): FateTableSetupConfig {
  const preset = readFateSheetPreset({ fateV2: { preset: recipe } });
  const { rules } = resolveFateRules(catalog, preset);
  const selection: Partial<Record<FatePresetAxis, TableSetupValue<string>>> = {};
  for (const axis of FATE_PRESET_AXES) {
    selection[axis] = { value: rules.selection[axis], policy: config.selection[axis]?.policy ?? FATE_NEW_ITEM_POLICY };
  }

  // Replace the overrides, rather than carrying across numbers the source card does not use.
  const overrides: Partial<Record<FatePointOverride, TableSetupValue<number>>> = {};
  if (rules.allocation.kind === "pointBuy") {
    for (const key of FATE_POINT_OVERRIDES) {
      const value = preset.overrides?.[key];
      if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
        overrides[key] = { value, policy: config.overrides[key]?.policy ?? FATE_NEW_ITEM_POLICY };
      }
    }
  }
  return { presetId: rules.presetId, selection, overrides };
}
