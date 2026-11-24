import type {
  TableSetupApplyResult,
  TableSetupBlock,
  TableSetupChange,
  TableSetupCharacterData,
  TableSetupCharacterRules,
} from "@skald/sheet-sdk/modules/systems";
import { fateRecord } from "../domain/normalize";
import {
  FATE_PRESET_AXES,
  fateAxisOptions,
  loadFatePresetCatalog,
  type FatePresetAxis,
  type FatePresetCatalog,
  type FatePresetSelection,
} from "../domain/presets";
import { applyFatePresetDraft, previewFatePresetDraft } from "../sheet/presets/preset-actions";
import { projectFateSheet } from "../sheet/presets/sheet-state";
import {
  FATE_POINT_OVERRIDES,
  fateTableSetupItemKey,
  fateTableSetupItemScope,
  fateTableSetupOptionKey,
  type FateTableSetupConfig,
} from "./config";

/**
 * Fate's character rules of a table setup: seed a blank card's `fateV2.preset` and apply a changed
 * setup to an existing card. Both go through the recipe dialog's own preview, so the harm-occupancy
 * guard holds: an axis that would strand marked stress or injuries is reported, never forced.
 */
export function fateTableSetupRules(catalog: FatePresetCatalog): TableSetupCharacterRules<FateTableSetupConfig> {
  const hasOption = (axis: FatePresetAxis, id: string) => fateAxisOptions(catalog, axis).some((option) => option.id === id);
  return {
    seedBlank(config, defaultData) {
      const preset = catalog.presets.find((entry) => entry.id === config.presetId)
        ?? catalog.presets.find((entry) => entry.id === catalog.defaultPreset)
        ?? catalog.presets[0];
      const selection: FatePresetSelection = { ...preset.axes };
      for (const axis of FATE_PRESET_AXES) {
        const item = config.selection[axis];
        if (item && hasOption(axis, item.value)) selection[axis] = item.value;
      }
      const overrides: Record<string, number> = {};
      for (const key of FATE_POINT_OVERRIDES) {
        const item = config.overrides[key];
        if (item) overrides[key] = item.value;
      }
      return {
        ...defaultData,
        fateV2: { ...fateRecord(defaultData.fateV2), preset: { id: preset.id, version: preset.version, selection, overrides } },
      };
    },

    apply(config, data, itemIds): TableSetupApplyResult {
      const current = projectFateSheet(data, catalog).rules.selection;
      const asked = itemIds ? new Set(itemIds) : null;
      const blocked: TableSetupBlock[] = [];
      const ready: { axis: FatePresetAxis; value: string }[] = [];
      for (const axis of FATE_PRESET_AXES) {
        const item = config.selection[axis];
        if (!item || fateTableSetupItemScope(axis) !== "ongoing" || (asked && !asked.has(axis))) continue;
        if (!hasOption(axis, item.value) || current[axis] === item.value) continue;
        const preview = previewFatePresetDraft(data, catalog, { selection: { ...current, [axis]: item.value }, overrides: {} });
        if (preview.allowed) {
          ready.push({ axis, value: item.value });
          continue;
        }
        const reason = preview.occupiedStress ? "stress" : preview.occupiedInjuries ? "injuries" : !preview.guard.ok ? "harm" : "preset";
        blocked.push({ itemId: axis, labelKey: fateTableSetupItemKey(axis), reasonKey: `fateTableSetup.blocked.${reason}` });
      }
      if (ready.length === 0) return { data, changes: [], blocked };
      const draft = { selection: { ...current, ...Object.fromEntries(ready.map(({ axis, value }) => [axis, value])) }, overrides: {} };
      const next = applyFatePresetDraft(data, catalog, current, draft, true);
      if (next === data) {
        // Each item alone passes but together they would strand harm: apply none, say so.
        return {
          data,
          changes: [],
          blocked: [...blocked, ...ready.map(({ axis }) => ({ itemId: axis, labelKey: fateTableSetupItemKey(axis), reasonKey: "fateTableSetup.blocked.harm" }))],
        };
      }
      const changes: TableSetupChange[] = ready.map(({ axis, value }) => ({
        itemId: axis,
        labelKey: fateTableSetupItemKey(axis),
        fromLabelKey: fateTableSetupOptionKey(axis, current[axis]),
        toLabelKey: fateTableSetupOptionKey(axis, value),
        policy: config.selection[axis]!.policy,
      }));
      return { data: next as TableSetupCharacterData, changes, blocked };
    },
  };
}

export async function loadFateTableSetupRules(): Promise<TableSetupCharacterRules<FateTableSetupConfig>> {
  return fateTableSetupRules(await loadFatePresetCatalog());
}
