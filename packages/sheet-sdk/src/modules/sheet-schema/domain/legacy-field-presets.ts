//
// 舊有系統語意 field 型別至 UI 語意型別的轉換表。
//
// 背景：早期 field type 以遊戲系統命名（coc-assets-list、conditions-reference…），
// 導致每新增一個系統就必須新增一批型別與 renderer。此表將這些型別在 schema
// 載入時展開為以呈現形態命名的通用型別。
//
// 遷移終點：逐系統將展開結果 inline 回各自的 schema.json，全部完成後即可
// 移除本檔與 normalizeSchema()。
//
// 硬性約束：所有轉換函式的輸出必須為純資料，不得包含 function、closure 或
// class instance——normalizeSchema() 的結果需可序列化後傳遞給 renderer 以外
// 的消費端。

import type {
  Field,
  FieldBase,
  ToggleableReferenceField,
} from "@skald/types/schema";
import {
  type LegacyStructuredListColumn,
  type LegacyStructuredListField,
  structuredListToListField,
} from "./structured-list-adapter";

/**
 * 舊型別中可能出現、但不屬於 FieldBase 的欄位。
 * 以此型別讀取來源屬性，避免使用 any。
 */
interface LegacyFieldSource extends FieldBase {
  type: string;
  maxItems?: number;
  showType?: "positive" | "negative" | "both";
}

/** 取出 FieldBase 的共通屬性，捨棄舊型別的專屬屬性 */
function pickFieldBase(field: LegacyFieldSource): FieldBase {
  const base: FieldBase = { id: field.id };

  if (field.label !== undefined) base.label = field.label;
  if (field.labelPosition !== undefined) base.labelPosition = field.labelPosition;
  if (field.description !== undefined) base.description = field.description;
  if (field.layout !== undefined) base.layout = field.layout;
  if (field.gridPosition !== undefined) base.gridPosition = field.gridPosition;
  if (field.required !== undefined) base.required = field.required;
  if (field.readonly !== undefined) base.readonly = field.readonly;
  if (field.defaultValue !== undefined) base.defaultValue = field.defaultValue;
  if (field.visibleWhen !== undefined) base.visibleWhen = field.visibleWhen;
  if (field.roll !== undefined) base.roll = field.roll;

  return base;
}

// ============================================================================
// structured-list 的欄位結構
//
// 下列 columns 原本硬編碼於 components/sheet/ 的各個 input 元件內部，
// schema 層無法得知。此處將其外部化。
// ============================================================================

/** 對應原 AssetsListInput 的 AssetItemData（id、name、value） */
const ASSETS_COLUMNS: LegacyStructuredListColumn[] = [
  { id: "name", type: "text", placeholder: "sheetUi.assetItemPlaceholder" },
  {
    id: "value",
    type: "text",
    placeholder: "sheetUi.assetValuePlaceholder",
    width: "96px",
    printWidth: "60px",
    align: "right",
  },
];

/** 對應原 BackstoryListInput 的 BackstoryItemData（id、text、isKeyConnection） */
const BACKSTORY_COLUMNS: LegacyStructuredListColumn[] = [
  {
    id: "isKeyConnection",
    type: "toggle",
    width: "auto",
    icon: "Star",
    toggleOnLabel: "sheetUi.unmarkKeyConnection",
    toggleOffLabel: "sheetUi.markKeyConnection",
  },
  {
    id: "text",
    type: "textarea",
    placeholder: "sheetUi.backstoryPlaceholder",
  },
];

/** 對應原 FellowInvestigatorsInput 的 FellowInvestigatorData（id、name、player、notes） */
const FELLOW_INVESTIGATORS_COLUMNS: LegacyStructuredListColumn[] = [
  {
    id: "name",
    type: "text",
    placeholder: "sheetUi.fellowInvestigatorPlaceholder",
    width: "1fr",
  },
  {
    id: "player",
    type: "text",
    placeholder: "sheetUi.fellowPlayerPlaceholder",
    width: "1fr",
  },
  {
    id: "notes",
    type: "text",
    placeholder: "sheetUi.fellowNotesPlaceholder",
    width: "2fr",
  },
];

// ============================================================================
// 轉換函式
// ============================================================================

function toStructuredList(
  field: LegacyFieldSource,
  columns: LegacyStructuredListColumn[],
  idPrefix: string,
  defaults: { maxItems: number; minRows: number; emptyMessage: string },
): Field {
  const structured: LegacyStructuredListField = {
    ...pickFieldBase(field),
    type: "structured-list",
    columns,
    maxItems: field.maxItems ?? defaults.maxItems,
    minRows: defaults.minRows,
    idPrefix,
    emptyMessage: defaults.emptyMessage,
  };
  return structuredListToListField(structured);
}

function toggleableFromShowType(
  showType: LegacyFieldSource["showType"],
): string | undefined {
  // showType 的 "both" 等同於不篩選
  return showType === undefined || showType === "both" ? undefined : showType;
}

/**
 * 轉換表。
 * key 為舊 field type，value 為產生新 field 的純函式。
 */
export const LEGACY_FIELD_TRANSFORMS: Record<
  string,
  (field: LegacyFieldSource) => Field
> = {
  // --- structured-list ---

  "coc-assets-list": (field) =>
    toStructuredList(field, ASSETS_COLUMNS, "asset", {
      maxItems: 10,
      minRows: 4,
      emptyMessage: "sheetUi.noItems",
    }),

  "backstory-list": (field) =>
    toStructuredList(field, BACKSTORY_COLUMNS, "backstory", {
      maxItems: 10,
      minRows: 4,
      emptyMessage: "sheetUi.noItems",
    }),

  "coc-fellow-investigators": (field) =>
    toStructuredList(field, FELLOW_INVESTIGATORS_COLUMNS, "fellow", {
      maxItems: 6,
      minRows: 6,
      emptyMessage: "sheetUi.noFellowInvestigators",
    }),

  // --- toggleable-reference ---

  "conditions-reference": (field): ToggleableReferenceField => ({
    ...pickFieldBase(field),
    type: "toggleable-reference",
    // 路徑相對於 LoadedSystem.gameData，其中 gameData 鍵對應 game-data.json
    source: "gameData.conditions",
    valuePath: "conditions",
    storage: "map",
    sourceShape: "flat",
    // conditions 於清單右側常駐顯示各項減值
    displayStyle: "full",
    labelPath: "name",
    tooltipPath: "clearMethod",
    tooltipPrefix: "sheetUi.clearPrefix",
    detailPath: "penalty",
  }),

  "status-effects-reference": (field): ToggleableReferenceField => {
    const result: ToggleableReferenceField = {
      ...pickFieldBase(field),
      type: "toggleable-reference",
      source: "gameData.statusEffects",
      valuePath: "statusEffects",
      storage: "array",
      sourceShape: "grouped",
      displayStyle: "compact",
      labelPath: "name",
      tooltipPath: "description",
      groupLabels: {
        positive: "sheetUi.positive",
        negative: "sheetUi.negative",
      },
    };

    const filter = toggleableFromShowType(field.showType);
    if (filter !== undefined) result.filter = filter;

    return result;
  },
};

/** 是否為已登錄的舊型別 */
export function isLegacyFieldType(fieldType: string): boolean {
  return Object.hasOwn(LEGACY_FIELD_TRANSFORMS, fieldType);
}

/** 已登錄的舊型別清單（供測試列舉） */
export function getLegacyFieldTypes(): string[] {
  return Object.keys(LEGACY_FIELD_TRANSFORMS);
}
