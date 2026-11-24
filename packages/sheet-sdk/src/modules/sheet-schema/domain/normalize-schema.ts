//
// 於 schema 載入時，將舊有的系統語意 field 型別展開為 UI 語意型別。
// 轉換規則見 ./legacy-field-presets.ts。
//
// 設計要點：
// - 採通用遞迴走訪而非針對特定結構。欄位可能出現在 Schema.fields、
//   Template 的 Page.children、Section.children 以及巢狀 Section 之中，
//   逐一列舉容易遺漏。
// - 每一層皆建立新物件，故輸入不會被修改。
// - 轉換結果的 type 不在轉換表內，因此重複執行不改變結果（冪等）。

import type { Schema, Template } from "@skald/types/schema";
import {
  LEGACY_FIELD_TRANSFORMS,
  isLegacyFieldType,
} from "./legacy-field-presets";

/**
 * 目前已啟用轉換的舊型別。
 *
 * 轉換表（legacy-field-presets.ts）中的型別若尚未具備對應的新 renderer，
 * 轉換後 registry 會查無 renderer，畫面將顯示「未知欄位類型」。
 * 因此轉換的啟用與 renderer 的實作必須同一個 commit 落地：
 * 每完成一個新 renderer，才將對應的舊型別加入此清單。
 *
 * 清單為空時，normalizeSchema() 的行為等同於深層複製，不改變任何欄位。
 */
const ENABLED_LEGACY_TYPES: ReadonlySet<string> = new Set<string>([
  // Phase 1（structured-list）
  "coc-assets-list",
  "backstory-list",
  "coc-fellow-investigators",
  // Phase 2（toggleable-reference）
  "conditions-reference",
  "status-effects-reference",
]);

/**
 * 遞迴走訪任意節點，將已啟用的舊型別欄位展開為 UI 語意型別。
 * 其餘節點會被深層複製後原樣回傳。
 */
function normalizeNode(node: unknown, enabled: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => normalizeNode(item, enabled));
  }

  if (node === null || typeof node !== "object") {
    return node;
  }

  const source = node as Record<string, unknown>;
  const fieldType = source.type;

  if (
    typeof fieldType === "string" &&
    isLegacyFieldType(fieldType) &&
    enabled.has(fieldType)
  ) {
    const transform = LEGACY_FIELD_TRANSFORMS[fieldType];
    // 轉換函式回傳全新的純資料物件，其 type 不在轉換表中，故無須再遞迴。
    return transform(source as never);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = normalizeNode(value, enabled);
  }
  return result;
}

/**
 * 展開 Schema 中已啟用的舊型別欄位。
 * 回傳新的 Schema，原輸入不受影響。
 *
 * @param enabledTypes 覆寫啟用清單，僅供測試驗證轉換邏輯使用。
 */
export function normalizeSchema(
  schema: Schema,
  enabledTypes: ReadonlySet<string> = ENABLED_LEGACY_TYPES,
): Schema {
  return normalizeNode(schema, enabledTypes) as Schema;
}

/**
 * 展開 Template 中 inline 定義的舊型別欄位。
 * Template 的 Page.children 與 Section.children 允許直接放置 Field，
 * 故同樣需要處理。回傳新的 Template，原輸入不受影響。
 *
 * @param enabledTypes 覆寫啟用清單，僅供測試驗證轉換邏輯使用。
 */
export function normalizeTemplate(
  template: Template,
  enabledTypes: ReadonlySet<string> = ENABLED_LEGACY_TYPES,
): Template {
  return normalizeNode(template, enabledTypes) as Template;
}

/** 目前已啟用的轉換型別（供測試與診斷用） */
export function getEnabledLegacyTypes(): string[] {
  return Array.from(ENABLED_LEGACY_TYPES);
}
