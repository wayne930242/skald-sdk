// modules/character/domain/sheets/resource.ts
//
// `resource` 欄位的純運算：數值來源解析、步進、比例與警戒帶。
// 不依賴 React；renderer 與跟隨規則共用。
import type { ResourceField, ResourceValueSource } from "@skald/types/schema";

/** 警戒帶：ok 充足、low 偏低、crit 危急 */
export type ResourceBand = "ok" | "low" | "crit";

/** 比例 ≤ 此值為 crit */
export const RESOURCE_CRIT_RATIO = 0.25;
/** 比例 ≤ 此值為 low */
export const RESOURCE_LOW_RATIO = 0.5;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 解析上限／起始值來源。固定數字直接用；`{from}` 從衍生值取。
 * 取不到有限數字時回傳 undefined（資源當作沒有這個值）。
 */
export function resolveResourceSource(
  source: ResourceValueSource | undefined,
  readDerived: (fieldId: string) => unknown,
): number | undefined {
  if (source === undefined || source === null) return undefined;
  if (typeof source === "number") return isFiniteNumber(source) ? source : undefined;
  const value = readDerived(source.from);
  return isFiniteNumber(value) ? value : undefined;
}

/** 目前值的資料路徑；預設 `<id>.current` */
export function resourceCurrentPath(
  field: Pick<ResourceField, "id" | "current">,
): string {
  return field.current || `${field.id}.current`;
}

/** 把值限制在 [0, max]；沒有上限時只擋下限 */
export function clampResource(value: number, max?: number): number {
  const floored = Math.max(0, value);
  return max === undefined ? floored : Math.min(floored, Math.max(0, max));
}

/** 步進後的目前值（已限制範圍）；step 為正數，delta 為 ±1 的方向 */
export function stepResource(
  current: number,
  direction: 1 | -1,
  step: number,
  max?: number,
): number {
  const size = isFiniteNumber(step) && step > 0 ? step : 1;
  return clampResource(current + direction * size, max);
}

/** 目前值／上限，限制在 0–1；沒有有效上限時為 undefined */
export function resourceRatio(
  current: number,
  max: number | undefined,
): number | undefined {
  if (max === undefined || !isFiniteNumber(max) || max <= 0) return undefined;
  return Math.min(1, Math.max(0, current / max));
}

export function resourceBand(ratio: number | undefined): ResourceBand | undefined {
  if (ratio === undefined) return undefined;
  if (ratio <= RESOURCE_CRIT_RATIO) return "crit";
  if (ratio <= RESOURCE_LOW_RATIO) return "low";
  return "ok";
}
