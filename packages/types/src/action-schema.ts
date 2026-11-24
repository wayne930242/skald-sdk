/**
 * Skald Action DSL Schema
 *
 * 宣告式行動系統，用於定義欄位行動（如按鈕點擊、數值變更等）。
 * 取代原本的 TypeScript handler 函式，改用 JSON 配置驅動。
 *
 * 設計原則：
 * - 可序列化（純 JSON，無函式）
 * - 可組合（Action 可巢狀、條件執行）
 * - 可擴展（支援 Modal、Lookup 等進階操作）
 */

// ============================================================================
// 基礎行動類型
// ============================================================================

/** 行動基礎介面 */
export interface ActionBase {
  /** 行動類型識別符 */
  type: string;
  /** 條件表達式 - 行動僅在條件為 true 時執行 */
  when?: string;
}

/** 設定欄位值 */
export interface SetAction extends ActionBase {
  type: "set";
  /** 目標欄位路徑 (例如 "str.value", "skills[0].improved") */
  target: string;
  /** 值表達式 (例如 "{{result.newValue}}", "{{@str + 10}}") */
  value: string | number | boolean;
}

/** 遞增/遞減數值 */
export interface ModifyAction extends ActionBase {
  type: "increment" | "decrement";
  /** 目標欄位路徑 */
  target: string;
  /** 變更量（數值或表達式） */
  amount: string | number;
}

/** 推入陣列欄位 */
export interface PushAction extends ActionBase {
  type: "push";
  /** 目標陣列欄位路徑 */
  target: string;
  /** 要推入的值（字串表達式或物件） */
  value: string | Record<string, unknown>;
}

/** 從陣列欄位移除 */
export interface RemoveAction extends ActionBase {
  type: "remove";
  /** 目標陣列欄位路徑 */
  target: string;
  /** 索引（數值）或篩選表達式（字串） */
  index: number | string;
}

/** 條件分支行動 */
export interface ConditionalAction extends ActionBase {
  type: "conditional";
  /** 條件表達式 */
  condition: string;
  /** 條件為 true 時執行的行動 */
  then: Action[];
  /** 條件為 false 時執行的行動（可選） */
  else?: Action[];
}

/** 查表行動 */
export interface LookupAction extends ActionBase {
  type: "lookup";
  /** 查表來源（表格 ID 或路徑） */
  table: string;
  /** 輸入值表達式 */
  input: string;
  /** 輸出目標欄位路徑 */
  outputTarget: string;
}

/** 觸發擲骰行動 */
export interface RollAction extends ActionBase {
  type: "roll";
  /** 擲骰表達式 (例如 "coc7:1d100<={{@skill}}") */
  expression: string;
  /** 擲骰結果處理行動（可選） */
  onResult?: Action[];
}

/** 重設欄位至預設值 */
export interface ResetAction extends ActionBase {
  type: "reset";
  /** 目標欄位路徑（支援萬用字元如 "skills.*.improved"） */
  target: string;
  /** 重設為的值（可選，未指定則使用 schema 預設值） */
  resetTo?: unknown;
}

/** 基礎行動類型聯合 */
export type Action =
  | SetAction
  | ModifyAction
  | PushAction
  | RemoveAction
  | ConditionalAction
  | LookupAction
  | RollAction
  | ResetAction;

// ============================================================================
// 欄位行動配置
// ============================================================================

/** Modal 行動配置 */
export interface ModalAction extends ActionBase {
  type: "modal";
  /** Modal 類型識別符（對應 Modal Registry） */
  modal: string;
  /** 傳入 Modal 的參數 */
  params?: Record<string, unknown>;
  /** Modal 確認時執行的行動 */
  onConfirm?: Action[];
  /** Modal 取消時執行的行動 */
  onCancel?: Action[];
}

/** 內聯行動配置（直接執行，無 Modal） */
export interface InlineAction extends ActionBase {
  type: "inline";
  /** 要執行的行動列表 */
  actions: Action[];
}

/** 欄位行動配置（用於按鈕點擊等互動） */
export type FieldActionConfig = ModalAction | InlineAction;

// ============================================================================
// 擴展行動類型（預留）
// ============================================================================

/** 批次行動（同時執行多個行動） */
export interface BatchAction extends ActionBase {
  type: "batch";
  /** 要批次執行的行動列表 */
  actions: Action[];
}

/** 延遲行動（動畫或等待用） */
export interface DelayAction extends ActionBase {
  type: "delay";
  /** 延遲毫秒數 */
  ms: number;
  /** 延遲後執行的行動 */
  then?: Action[];
}

/** 所有行動類型聯合（包含擴展類型） */
export type ExtendedAction = Action | BatchAction | DelayAction;

/** 所有欄位行動類型聯合 */
export type AnyFieldAction = FieldActionConfig | Action;

// ============================================================================
// 行動執行上下文（供 Executor 使用）
// ============================================================================

/** 行動執行結果 */
export interface ActionResult {
  /** 是否成功 */
  success: boolean;
  /** 錯誤訊息（如果失敗） */
  error?: string;
  /** 行動產生的資料變更 */
  changes?: Record<string, unknown>;
  /** 行動產生的額外結果（如擲骰結果） */
  result?: unknown;
}

/** 行動執行上下文 */
export interface ActionContext {
  /** 當前角色資料 */
  data: Record<string, unknown>;
  /** Schema 定義 */
  schema?: Record<string, unknown>;
  /** 觸發來源欄位 ID */
  sourceFieldId?: string;
  /** 額外上下文（如 Modal 結果） */
  extra?: Record<string, unknown>;
}

// ============================================================================
// 類型守衛（Type Guards）
// ============================================================================

/**
 * 檢查是否為舊版欄位行動（使用 handler 字串）
 */
export function isLegacyFieldAction(
  action: unknown
): action is { handler: string; icon?: string; tooltip?: string; visibleWhen?: string } {
  return (
    typeof action === "object" &&
    action !== null &&
    "handler" in action &&
    typeof (action as Record<string, unknown>).handler === "string"
  );
}

/**
 * 檢查是否為宣告式欄位行動配置
 */
export function isDeclarativeFieldAction(
  action: unknown
): action is FieldActionConfig {
  return (
    typeof action === "object" &&
    action !== null &&
    "type" in action &&
    ((action as Record<string, unknown>).type === "modal" ||
      (action as Record<string, unknown>).type === "inline")
  );
}
