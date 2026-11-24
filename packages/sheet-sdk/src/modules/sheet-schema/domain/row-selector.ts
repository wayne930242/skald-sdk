import type { Field, SkillsMaster } from "@skald/types/schema";

/** 統一的列。數字欄一律是已解析好的數字 */
export interface StatRow {
  id: string;
  /** 來源的原始名稱（CoC 是技能主檔 id、Fate 是自訂名或預設名） */
  name: string;
  /** 顯示名稱（已翻譯）；專門技能不含專門名 */
  label: string;
  /** 所屬分組 id，對應 StatGroup.id */
  group: string;
  /** 專門技能：父技能的顯示名稱（有值就表示這一列是專門技能） */
  parentLabel?: string;
  /** 專門技能：專門名稱，尚未命名時為空字串 */
  specName?: string;
  base?: number;
  value: number;
  half?: number;
  fifth?: number;
  /** Fate 等級；rowRoll 的 `@row.level` */
  level?: number;
  /** 這一列能不能勾「可成長」 */
  improvable?: boolean;
  /** 是否已勾「可成長」 */
  improved?: boolean;
  tags?: string[];
}

export interface StatGroup {
  id: string;
  label: string;
}

export interface RowSelection {
  rows: StatRow[];
  /** 顯示順序；沒有列的分組由檢視略過 */
  groups: StatGroup[];
}

/** 一次修改。只有來源支援的欄位會被寫回 */
export interface RowPatch {
  value?: number;
  improved?: boolean;
  /** 專門技能的專門名稱 */
  specName?: string;
}

export interface RowSelectorContext {
  data: Record<string, unknown>;
  /** 沒有 SystemProvider 時為 null；需要系統資料的來源（CoC）此時回傳空清單 */
  system: {
    getSkillsMaster: () => SkillsMaster | undefined;
    getEraMappingId: (era: string) => string;
    getCategoryMapping: (masterCategory: string) => string;
  } | null;
  /** 全域＋系統翻譯；找不到時回傳 key 本身 */
  t: (key: string) => string;
  /** 解析 `{{i18n:...}}` 標記 */
  resolveI18n: (text: string | undefined) => string;
}

export interface RowSelector<F extends Field = Field> {
  rows(source: F, ctx: RowSelectorContext): RowSelection;
  /** 回傳要寫入的頂層資料鍵；第一次寫入時會把即時預設清單落地 */
  setRow(
    source: F,
    ctx: RowSelectorContext,
    rowId: string,
    patch: RowPatch,
  ): Record<string, unknown>;
  /** Optional display name for a wizard List Entry using this selector. */
  entryLabel?(entry: Record<string, unknown>, t: RowEntryTranslator): string | undefined;
  /** stat-list 沒有設定 rowRoll 時的預設 */
  defaultRowRoll?: string;
  /** 系統沒有 `defaultRowRoll` 引用的巨集時改用這個（純骰式，不依賴系統巨集） */
  fallbackRowRoll?: string;
  /** 改現值會讓列換分組（Fate 的分組就是等級）：編輯時要等離開欄位才寫回，否則輸入框會跟著列跑掉 */
  regroupsOnValue?: boolean;
}

export type RowEntryTranslator = (key: string, values?: Record<string, string | number>) => string;
