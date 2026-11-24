// @skald/dice roll-expression/types.ts

import type { SuccessLevel as CoC7eSuccessLevel } from "../types";
import type { SuccessLevel as DslSuccessLevel } from "../dsl-roll-evaluator";
import type { DeclaredDifficulty } from "../difficulty";

/** 查表範圍定義 */
export interface TableRange {
  min: number;
  max: number;
  value: string | number;
  label?: string;
}

/** 查表定義 */
export interface TableDefinition {
  title?: string;
  ranges: TableRange[];
}

/** 比較運算符 */
export type Comparator = "<=" | ">=" | "<" | ">" | "=";

/** 檢定系統 */
export type RollSystem = "coc7" | "fate";

/** 擲骰目標 */
export type RollTarget = "local" | "session";

/** Dialog 輸入設定 */
export interface DialogInputConfig {
  /** 變數名稱，用於表達式中，預設 "input" */
  id?: string;
  /** 顯示標籤 */
  label?: string;
  /** 佔位符 */
  placeholder?: string;
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
}

/** Dialog 選項設定 */
export interface DialogOptionsConfig {
  /** 變數名稱，用於表達式中 */
  id: string;
  /** 顯示標籤 */
  label?: string;
  /** 是否多選，預設 true */
  multiple?: boolean;
  /** 選項列表 */
  options: Array<{
    label: string;
    value: string | number;
  }>;
}

/** Dialog 設定 */
export interface DialogConfig {
  /** 參考資料路徑（markdown 或表格） */
  ref?: string;
  /** 手動輸入設定，true 表示使用預設 { id: "input" } */
  input?: DialogInputConfig | boolean;
  /** 選項設定 */
  options?: DialogOptionsConfig;
}

/** Bonus/Penalty dice 設定 (CoC7e) */
export interface BonusDiceConfig {
  /** 啟用 bonus/penalty 選擇 UI */
  enabled: boolean;
  /** 最小骰數（負數表示 penalty），預設 -2 */
  min?: number;
  /** 最大骰數（正數表示 bonus），預設 2 */
  max?: number;
  /** 巨集參數名稱：玩家選擇的值在執行時覆寫這個參數（見 dice-macro-functions design.md D12） */
  param?: string;
}

/** Roll 設定 */
export interface RollConfig {
  /** 必填：骰子表達式 */
  expression: string;
  /** 檢定系統，例如 "coc7" 會計算成功等級 */
  system?: RollSystem;
  /** 結果去向，預設 "local" */
  target?: RollTarget;
  /** Dialog 設定 */
  dialog?: DialogConfig;
  /** 查表 ID */
  table?: string;
  /** CoC7e bonus/penalty dice 支援 */
  bonusDice?: BonusDiceConfig;
}

/** 解析後的表達式 */
export interface ParsedRollExpression {
  /** 系統前綴 */
  system?: RollSystem;
  /** 骰子表達式（含 {{formula}} 部分） */
  diceExpr: string;
  /** 比較運算符 */
  comparator?: Comparator;
  /** 目標值公式 */
  targetFormula?: string;
}

/** 擲骰結果 */
export interface RollExpressionResult {
  /** 原始表達式 */
  expression: string;
  /**
   * 系統前綴 + 骰子表達式，{{ }} 已代換為實際數值（例如 "coc7:1d100+2"）。
   * 給需要純骰子 notation 的呼叫端使用（例如 3D 骰子動畫），
   * 不含比較運算子/目標值部分。巨集參照（{{#name[...]}}）解析後
   * 也會落在這裡，因為 `expression` 欄位對巨集呼叫來說不是可用的 notation。
   */
  resolvedDiceExpr?: string;
  /** 骰子結果 */
  rolled: number;
  /** 骰子明細 */
  rolls: number[];
  /** 目標值（如有比較） */
  targetValue?: number;
  /** 比較運算符 */
  comparator?: Comparator;
  /** 是否通過（通用比較） */
  passed?: boolean;
  /** 成功等級（CoC7e 字串或 DSL 物件） */
  successLevel?: CoC7eSuccessLevel | DslSuccessLevel;
  /**
   * CoC7e: the difficulty the player declared, when it was Hard or Extreme and the rule judged
   * it. `targetValue` stays the full value; the declared target is `difficultyTarget(targetValue, difficulty)`.
   */
  difficulty?: Exclude<DeclaredDifficulty, "regular">;
  /** CoC7e: bonus/penalty count */
  bonusDice?: number;
  /** CoC7e: all tens dice */
  tensDice?: number[];
  /** CoC7e: units die */
  unitsDice?: number[];
  /** CoC7e: selected tens die */
  selectedTens?: number;
  /** CoC7e: selected units die */
  selectedUnits?: number;
  /** 查表結果 */
  tableResult?: {
    tableId: string;
    value: string | number;
    label?: string;
  };
}
