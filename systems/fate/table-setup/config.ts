import type {
  TableSetupIssue,
  TableSetupItem,
  TableSetupPolicy,
  TableSetupScope,
  TableSetupValue,
} from "@skald/sheet-sdk/modules/systems";
import { FATE_PRESET_AXES, type FatePresetAxis } from "../domain/presets";

/**
 * Fate's part of a table setup (ADR 0016 S2): the recipe of `fateV2.preset` a table asks for. Each
 * of the 7 axes and the two point-buy numbers is an item with its own policy (D1); an absent item
 * is the player's own choice. Pure and catalog-free: it rides the light registry. Option IDs are
 * checked against the catalog where the catalog is loaded (the editor and the character rules).
 */

/** The key of Fate's part in `TableSetupConfig.system`. */
export const FATE_TABLE_SETUP_ID = "fate-condensed";

/** D1: an item the GM sets for the first time starts locked. */
export const FATE_NEW_ITEM_POLICY: TableSetupPolicy = "locked";

export const FATE_POINT_OVERRIDES = ["pointBudget", "pointCap"] as const;
export type FatePointOverride = (typeof FATE_POINT_OVERRIDES)[number];
export type FateTableSetupItemId = FatePresetAxis | FatePointOverride;

export interface FateTableSetupConfig {
  /** The catalog preset the recipe starts from; the catalog's default when absent. */
  readonly presetId?: string;
  readonly selection: Readonly<Partial<Record<FatePresetAxis, TableSetupValue<string>>>>;
  readonly overrides: Readonly<Partial<Record<FatePointOverride, TableSetupValue<number>>>>;
}

/**
 * The starting skill shape and its points only shape a new card (its creation hints); every other
 * axis is a rule the card keeps playing by, so changing it offers existing cards to apply it (D5).
 */
const CREATION_ITEMS: ReadonlySet<FateTableSetupItemId> = new Set(["allocation", "pointBudget", "pointCap"]);

export function fateTableSetupItemScope(id: FateTableSetupItemId): TableSetupScope {
  return CREATION_ITEMS.has(id) ? "creation" : "ongoing";
}

/** The catalog-message key of an item's name. */
export function fateTableSetupItemKey(id: FateTableSetupItemId): string {
  return `fateTableSetup.items.${id}`;
}

/** The catalog-message key of an axis option's name. */
export function fateTableSetupOptionKey(axis: FatePresetAxis, option: string): string {
  return `fateTableSetup.options.${axis}.${option}`;
}

export function emptyFateTableSetup(): FateTableSetupConfig {
  return { selection: {}, overrides: {} };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isPolicy = (value: unknown): value is TableSetupPolicy => value === "locked" || value === "default";
const isAxis = (key: string): key is FatePresetAxis => (FATE_PRESET_AXES as readonly string[]).includes(key);
const isOverride = (key: string): key is FatePointOverride => (FATE_POINT_OVERRIDES as readonly string[]).includes(key);
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Read Fate's stored part. Anything it cannot read is an issue and left out; nothing is rewritten. */
export function parseFateTableSetup(raw: unknown): { config: FateTableSetupConfig; issues: TableSetupIssue[] } {
  const issues: TableSetupIssue[] = [];
  if (raw === undefined || raw === null) return { config: emptyFateTableSetup(), issues };
  if (!isRecord(raw)) return { config: emptyFateTableSetup(), issues: [{ path: "", messageKey: "fateTableSetup.issues.invalid" }] };
  const selection: Partial<Record<FatePresetAxis, TableSetupValue<string>>> = {};
  const overrides: Partial<Record<FatePointOverride, TableSetupValue<number>>> = {};
  const presetId = typeof raw.presetId === "string" && raw.presetId !== "" ? raw.presetId : undefined;
  if (raw.presetId !== undefined && presetId === undefined) issues.push({ path: "presetId", messageKey: "fateTableSetup.issues.invalid" });
  for (const [key, item] of Object.entries(isRecord(raw.selection) ? raw.selection : {})) {
    if (!isAxis(key)) {
      issues.push({ path: `selection.${key}`, messageKey: "fateTableSetup.issues.unknownItem" });
    } else if (!isRecord(item) || typeof item.value !== "string" || item.value === "" || !isPolicy(item.policy)) {
      issues.push({ path: `selection.${key}`, messageKey: "fateTableSetup.issues.invalid" });
    } else {
      selection[key] = { value: item.value, policy: item.policy };
    }
  }
  for (const [key, item] of Object.entries(isRecord(raw.overrides) ? raw.overrides : {})) {
    if (!isOverride(key)) {
      issues.push({ path: `overrides.${key}`, messageKey: "fateTableSetup.issues.unknownItem" });
    } else if (!isRecord(item) || !positiveInteger(item.value) || !isPolicy(item.policy)) {
      issues.push({ path: `overrides.${key}`, messageKey: "fateTableSetup.issues.invalid" });
    } else {
      overrides[key] = { value: item.value, policy: item.policy };
    }
  }
  return { config: { ...(presetId ? { presetId } : {}), selection, overrides }, issues };
}

/** The setup's items for the invite page and the GM: axes in catalog order, then the points. */
export function summarizeFateTableSetup(config: FateTableSetupConfig): TableSetupItem[] {
  const items: TableSetupItem[] = [];
  for (const axis of FATE_PRESET_AXES) {
    const item = config.selection[axis];
    if (!item) continue;
    items.push({
      id: axis,
      labelKey: fateTableSetupItemKey(axis),
      valueLabelKey: fateTableSetupOptionKey(axis, item.value),
      policy: item.policy,
      scope: fateTableSetupItemScope(axis),
    });
  }
  for (const key of FATE_POINT_OVERRIDES) {
    const item = config.overrides[key];
    if (!item) continue;
    items.push({
      id: key,
      labelKey: fateTableSetupItemKey(key),
      valueLabelKey: "fateTableSetup.points",
      values: { value: item.value },
      policy: item.policy,
      scope: fateTableSetupItemScope(key),
    });
  }
  return items;
}

export interface FateTableSetupLocks {
  readonly axes: Readonly<Partial<Record<FatePresetAxis, string>>>;
  readonly overrides: Readonly<Partial<Record<FatePointOverride, number>>>;
}

/** The locked items and their values (D1, D2): what a table copy's recipe dialog cannot change. */
export function fateTableSetupLocks(config: FateTableSetupConfig): FateTableSetupLocks {
  const axes: Partial<Record<FatePresetAxis, string>> = {};
  const overrides: Partial<Record<FatePointOverride, number>> = {};
  for (const axis of FATE_PRESET_AXES) {
    const item = config.selection[axis];
    if (item?.policy === "locked") axes[axis] = item.value;
  }
  for (const key of FATE_POINT_OVERRIDES) {
    const item = config.overrides[key];
    if (item?.policy === "locked") overrides[key] = item.value;
  }
  return { axes, overrides };
}
