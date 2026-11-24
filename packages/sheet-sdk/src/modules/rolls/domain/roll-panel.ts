// modules/rolls/domain/roll-panel.ts
//
// 擲骰台與擲骰選項視窗用的純函式：獎懲骰選項、門檻、結果卡資料。
// 沒有 React、沒有 store，所以可以直接測。
import type { DeclaredDifficulty, DiceVisibility, RollExpressionResult } from "@skald/dice";
import type { RollConfig } from "@skald/dice/roll-expression";

/** 擲骰對象：只有「所有人」與「暗骰」（GM 與擲骰者）。RLS 讓桌主看得到所有訊息，所以沒有「僅自己」 */
export type RollAudience = "all" | "gm";

export const ROLL_AUDIENCES: readonly RollAudience[] = ["all", "gm"];

/** 擲骰台保留的最近結果數（只在本次頁面記憶體） */
export const ROLL_PANEL_HISTORY_LIMIT = 4;

/** 獎懲骰的範圍（系統巨集宣告的 `bonusDice` min／max），擲骰選項視窗用 */
export interface NextRollRange {
  min: number;
  max: number;
}

/** 範圍內的所有選項，由懲罰到獎勵（含 0＝一般） */
export function nextRollOptions(range: NextRollRange): number[] {
  const options: number[] = [];
  for (let value = range.min; value <= range.max; value += 1) {
    options.push(value);
  }
  return options;
}

export interface RollThresholds {
  regular: number;
  hard: number;
  extreme: number;
}

/** 一般、困難（½）、極限（⅕）三個門檻；與 `calculateSuccessLevel` 一樣無條件捨去 */
export function thresholdsFor(target: number): RollThresholds {
  return {
    regular: target,
    hard: Math.floor(target / 2),
    extreme: Math.floor(target / 5),
  };
}

/** 重擲同一檢定（孤注一擲）需要的原始輸入；只存在記憶體，不進聊天 */
export interface RollReplay {
  config: RollConfig;
  context: Record<string, number>;
  fieldLabel?: string;
  argOverrides?: Record<string, number>;
}

/**
 * 這筆結果的「可成長」狀態：自動勾了（`undo` 把勾拿掉）、撤銷了，
 * 或是暗骰達標但不自動勾（`withheld-blind`，結果卡提示玩家結算時自行勾）
 */
export type RollImproveState =
  | {
      status: "ticked" | "undone";
      undo: () => void;
      /** 勾的那張角色卡列表還在畫面上嗎；不在了（換分頁重掛）撤銷寫不進去。沒給就當作還在 */
      isMounted?: () => boolean;
    }
  | { status: "withheld-blind" };

/** 擲骰台上的一筆結果 */
export interface RollPanelEntry {
  id: string;
  timestamp: number;
  label: string;
  total: number;
  /** 帶目標值的檢定才有 */
  targetValue?: number;
  thresholds?: RollThresholds;
  successLevel?: string;
  /**
   * 擲之前宣告的難度（只有困難、極難才有）；判定的目標是 `difficultyTarget(targetValue, difficulty)`，
   * `targetValue` 仍是完整的技能值
   */
  difficulty?: Exclude<DeclaredDifficulty, "regular">;
  /** 正數＝獎勵骰、負數＝懲罰骰 */
  bonusDice?: number;
  tensDice?: number[];
  unitsDice?: number[];
  selectedTens?: number;
  selectedUnits?: number;
  /** 一般骰（非十位／個位）的明細 */
  rolls: number[];
  /**
   * 沒有目標值的一般擲骰（傷害、自訂骰）的骰式，例如 `1D10`。結果卡用它說明這一擲擲了什麼；
   * 檢定與百分骰已經有目標值與十位／個位，不需要。
   */
  notation?: string;
  visibility: DiceVisibility;
  /** 這筆結果是否真的送進聊天 */
  sentToChat: boolean;
  /** The chat row's id, when the caller's own delivery (`ExecuteRollOptions.deliver`) posted it. */
  messageId?: string;
  /** 套用哪一組擲骰規則（`coc7`）；擲後動作從這組規則取 */
  ruleId?: string;
  /** 擲的是哪個欄位或哪一列（`notFor` 比對用） */
  rollKey?: string;
  /** 擲骰的角色卡；擲骰台只對同一張卡的結果開動作 */
  characterId?: string;
  /** 這筆結果本身是孤注一擲 */
  pushed?: boolean;
  /** 已經從這筆結果孤注一擲過 */
  wasPushed?: boolean;
  /** 孤注一擲時，被重擲的那筆結果的 id */
  followsId?: string;
  /** 這筆結果已花掉的幸運（累計） */
  luckSpent?: number;
  /** 資料庫說這一擲的接續已經在別處送出：幸運按鈕不再出現 */
  luckAlreadyPosted?: boolean;
  /** 第一次花幸運之前的成功等級 */
  levelBeforeLuck?: string;
  replay?: RollReplay;
  improve?: RollImproveState;
}

export interface BuildRollPanelEntryInput {
  id: string;
  timestamp: number;
  label: string;
  result: RollExpressionResult;
  visibility: DiceVisibility;
  sentToChat: boolean;
  messageId?: string;
  ruleId?: string;
  rollKey?: string;
  characterId?: string;
  pushed?: boolean;
  followsId?: string;
  replay?: RollReplay;
  improve?: RollImproveState;
}

export function buildRollPanelEntry({
  id,
  timestamp,
  label,
  result,
  visibility,
  sentToChat,
  messageId,
  ruleId,
  rollKey,
  characterId,
  pushed,
  followsId,
  replay,
  improve,
}: BuildRollPanelEntryInput): RollPanelEntry {
  const successLevel =
    typeof result.successLevel === "string"
      ? result.successLevel
      : result.successLevel?.id;
  const hasTarget = result.targetValue !== undefined;
  const isPercentile = !!result.tensDice?.length;

  return {
    id,
    timestamp,
    label,
    total: result.rolled,
    targetValue: result.targetValue,
    // 十位／個位的百分骰才有「一般／困難／極限」三個門檻
    thresholds:
      hasTarget && isPercentile ? thresholdsFor(result.targetValue as number) : undefined,
    successLevel,
    ...(result.difficulty && { difficulty: result.difficulty }),
    bonusDice: result.bonusDice || undefined,
    tensDice: result.tensDice,
    unitsDice: result.unitsDice,
    selectedTens: result.selectedTens,
    selectedUnits: result.selectedUnits,
    rolls: result.rolls,
    ...(!hasTarget && !isPercentile && result.resolvedDiceExpr
      ? { notation: result.resolvedDiceExpr.toUpperCase() }
      : {}),
    visibility,
    sentToChat,
    ...(messageId !== undefined && { messageId }),
    ...(ruleId !== undefined && { ruleId }),
    ...(rollKey !== undefined && { rollKey }),
    ...(characterId && { characterId }),
    ...(pushed && { pushed: true, followsId }),
    ...(replay && { replay }),
    ...(improve && { improve }),
  };
}

/** 一筆結果追加到最近紀錄的最前面，只留最近 N 筆 */
export function appendRollHistory(
  history: readonly RollPanelEntry[],
  entry: RollPanelEntry,
  limit = ROLL_PANEL_HISTORY_LIMIT,
): RollPanelEntry[] {
  return [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, limit);
}
