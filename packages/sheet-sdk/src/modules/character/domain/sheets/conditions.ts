// modules/character/domain/sheets/conditions.ts
//
// `conditions` 欄位的建議公式共用的命名規則。發布流程（formula-source）、公式驗證
// （formula-artifact-validator）與 renderer 必須算出同一個名字，所以集中在這裡。
import type { ConditionItem, ConditionsField } from "@skald/types/schema";

/** 建議公式的 formula id 前綴；發布流程據此清掉過期的產物 */
export const CONDITION_FORMULA_ID_PREFIX = "derived:condition:";

/** 建議公式的隱藏 derived 目標：`<fieldId>__<itemId>__suggest` */
export function conditionSuggestTargetId(fieldId: string, itemId: string): string {
  return `${fieldId}__${itemId}__suggest`;
}

export function conditionSuggestFormulaId(fieldId: string, itemId: string): string {
  return `${CONDITION_FORMULA_ID_PREFIX}${fieldId}:${itemId}`;
}

/** 有填寫建議公式的項目；空白字串視為沒有 */
export function suggestingItems(
  field: Pick<ConditionsField, "items">,
): Array<ConditionItem & { suggest: string }> {
  const items: unknown = field.items;
  if (!Array.isArray(items)) return [];
  return (items as ConditionItem[]).flatMap((item) => {
    // 來源可能是未驗證的 JSON：不是物件或沒有字串 id 的項目直接略過
    if (typeof item !== "object" || item === null || typeof item.id !== "string") {
      return [];
    }
    const suggest = typeof item.suggest === "string" ? item.suggest.trim() : "";
    return suggest.length > 0 ? [{ ...item, suggest }] : [];
  });
}

/** 項目是否已勾選：只認 `true`，其他（含未設定）都是未勾 */
export function isConditionChecked(value: unknown): boolean {
  return value === true;
}

/** 顯示「建議勾選」：建議成立且尚未勾選。永遠不自動勾選。 */
export function shouldSuggestCondition(suggested: unknown, checked: unknown): boolean {
  return suggested === true && !isConditionChecked(checked);
}

/** 項目 id 的字元限制：與公式參照 `[id]` 能用的字元一致 */
const CONDITION_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type ConditionItemIdProblem =
  | "empty"
  | "invalid_chars"
  | "reserved_separator"
  | "duplicate"
  | "field_collision";

export interface ConditionItemIdIssue {
  fieldId: string;
  index: number;
  itemId: string;
  problem: ConditionItemIdProblem;
}

/**
 * 檢查所有 conditions 欄位的項目 id。勾選寫入 `data[item.id]`，所以 id 必須：
 * 非空、只含 `[A-Za-z0-9_-]`、不含 `__`（建議公式目標的分隔）、在所有 conditions
 * 欄位間唯一，且不能與任何欄位 id 相同（否則會覆寫那個欄位的資料）。
 */
export function conditionItemIdIssues(
  fields: Array<{ id: string; type: string; items?: unknown }>,
): ConditionItemIdIssue[] {
  const fieldIds = new Set(fields.map((field) => field.id));
  const conditionFields = fields.filter(
    (field) => field.type === "conditions" && Array.isArray(field.items),
  );
  const counts = new Map<string, number>();
  for (const field of conditionFields) {
    for (const item of field.items as Array<{ id?: unknown }>) {
      if (typeof item?.id === "string") {
        counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
      }
    }
  }
  const issues: ConditionItemIdIssue[] = [];
  for (const field of conditionFields) {
    (field.items as Array<{ id?: unknown }>).forEach((item, index) => {
      const itemId = typeof item?.id === "string" ? item.id : "";
      const report = (problem: ConditionItemIdProblem) =>
        issues.push({ fieldId: field.id, index, itemId, problem });
      if (itemId.trim().length === 0) return report("empty");
      if (!CONDITION_ITEM_ID_PATTERN.test(itemId)) return report("invalid_chars");
      if (itemId.includes("__")) return report("reserved_separator");
      if (fieldIds.has(itemId)) return report("field_collision");
      if ((counts.get(itemId) ?? 0) > 1) return report("duplicate");
    });
  }
  return issues;
}

/**
 * 建議公式定義是否由 schema 產生：id、目標、種類都要對上目前某個項目的 `suggest`
 * （或是舊版 schema 留下的同形狀產物）。保留前綴下其他定義是手寫的，應被拒絕。
 */
export function isGeneratedConditionDefinition(definition: {
  id: string;
  kind: string;
  targetFieldId: string;
}): boolean {
  if (!definition.id.startsWith(CONDITION_FORMULA_ID_PREFIX)) return false;
  if (definition.kind !== "derived") return false;
  const rest = definition.id.slice(CONDITION_FORMULA_ID_PREFIX.length);
  const target = definition.targetFieldId;
  if (!target.endsWith("__suggest")) return false;
  const body = target.slice(0, -"__suggest".length);
  const split = body.lastIndexOf("__");
  if (split <= 0) return false;
  return rest === `${body.slice(0, split)}:${body.slice(split + 2)}`;
}
