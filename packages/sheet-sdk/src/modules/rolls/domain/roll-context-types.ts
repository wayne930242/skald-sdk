import type { RollConfig, RollExpressionResult } from "@skald/dice/roll-expression";
import { type MacroWrite } from "@skald/dice";
import { type RollPanelEntry } from "@skald/sheet-sdk/modules/rolls/domain/roll-panel";
import type { DeclaredDifficulty, DiceVisibility, SimpleDiceRoll, SkillCheckRoll } from "@skald/dice";
import { type SpendOption } from "@skald/dice";

/** 單次擲骰的選項 */
export interface ExecuteRollOptions {
  /**
   * 這次擲骰的可見性。沒給時：遊戲桌內用擲骰台選的對象（預設「所有人」），
   * 桌外沒有聊天可送，一律 "all"。
   */
  visibility?: DiceVisibility;
  /**
   * 這一擲宣告的難度（一般／困難／極難）。只有 `coc7:` 檢定、而且系統的擲骰規則能判難度時才有作用：
   * 以 `floor(目標值 / 1、2、5)` 判定成功、失敗與大失敗。沒給就是一般。
   */
  difficulty?: DeclaredDifficulty;
  /**
   * 擲的是哪個欄位或哪一列（欄位 id、技能 id）。擲後動作規則的 `notFor`
   * （SAN、幸運擲骰不能孤注一擲）就是拿它比對。
   */
  rollKey?: string;
  /**
   * 這一擲若達到成長條件，要勾的那一列。只有「擁有者自己可編輯的角色卡上、能成長
   * 且還沒勾」的技能列才該給；GM 的擲骰、唯讀卡與看別人的卡都不給，所以不會寫入。
   */
  improveTarget?: RollImproveTarget;
  /** 這一擲是孤注一擲，重擲的是這個 id 的那筆結果（內部使用，由 `pushRoll` 設定） */
  pushOf?: string;
  /**
   * The dice land on these faces, in order, instead of random ones, and no 3D dice roll: a
   * result-only follow-up on faces already rolled (Fate's +2 on the kept faces). Internal, set by
   * `rollFollowUp`.
   */
  fixedDice?: readonly FixedDie[];
  /**
   * This roll is a plugin's follow-up to the roll desk's entry with this id (internal, set by
   * `rollFollowUp`): it goes to chat as its own roll, and the desk keeps showing the entry it follows.
   */
  followUpOf?: string;
  /**
   * Post this roll with the caller's own delivery instead of the chat sink: a table rules port
   * writing the chat row through its RPC in the same transaction as its effects. Only in a table
   * session (otherwise the roll rejects before rolling). A rejection, or no `messageId`, rejects the
   * roll: nothing falls back to the chat sink and the desk records nothing. Absent: unchanged.
   */
  deliver?: RollDelivery;
}

/** A caller's delivery of a built roll (see `ExecuteRollOptions.deliver`). */
export type RollDelivery = (roll: SkillCheckRoll | SimpleDiceRoll) => Promise<RollDelivered>;

/** The chat row a delivery wrote. */
export interface RollDelivered {
  messageId: string;
}

/** A die of a result-only roll: which die (`"F"` for Fudge) and the face it shows. */
export interface FixedDie {
  sides: number | "F";
  face: number;
}

/** A plugin's follow-up roll (`rollFollowUp`): a new roll after the desk's entry, never a change of it. */
export interface RollFollowUpRequest {
  /** The roll, e.g. `1d6`, or a check such as `coc7:1d100<={{@target}}` with its `context`. */
  expression: string;
  /** The chat title of the new roll. */
  label: string;
  context?: Record<string, number>;
  /** Result-only: the dice show these faces (see `ExecuteRollOptions.fixedDice`). */
  fixedDice?: readonly FixedDie[];
  /** Post it with this delivery instead of the chat sink (see `ExecuteRollOptions.deliver`). */
  deliver?: RollDelivery;
}

/** What a follow-up roll gave. */
export interface RollFollowUpRolled {
  /** The roll desk entry of the new roll (not shown as the desk's latest result). */
  id: string;
  total: number;
  /** The faces as rolled (tens and units for a percentile check). */
  faces: number[];
  successLevel?: string;
  targetValue?: number;
  sentToChat: boolean;
  /** The chat row, when the request's `deliver` posted it. */
  messageId?: string;
}

/** 技能列的「可成長」勾：擲骰達到條件時 `mark`，結果卡的「撤銷」呼叫 `unmark` */
export interface RollImproveTarget {
  mark: () => void;
  unmark: () => void;
  /** 發出這個目標的角色卡列表還在畫面上嗎；不在了撤銷寫不進去 */
  isMounted?: () => boolean;
}

/** 一次擲骰完成後通知訂閱者的內容（擲骰台、之後的擲後動作與自動成長勾都從這裡取） */
export interface RollResultEvent {
  entry: RollPanelEntry;
  result: RollExpressionResult;
  config: RollConfig;
  fieldLabel?: string;
  visibility: DiceVisibility;
}

export type RollResultListener = (event: RollResultEvent) => void;

export interface RollContextValue {
  /** 執行擲骰 */
  executeRoll: (
    config: RollConfig,
    context: Record<string, number>,
    fieldLabel?: string,
    argOverrides?: Record<string, number>,
    options?: ExecuteRollOptions,
  ) => Promise<RollExpressionResult | null>;
  /**
   * Trigger a macro and get both the roll result (if any) and any pending
   * field writes — for macro-trigger-button fields, whose write-only macros
   * have nothing to roll/display but still need `writes` surfaced to the
   * caller (writes are not yet flushed to character data).
   */
  executeMacroTrigger: (
    config: RollConfig,
    context: Record<string, number>,
    fieldLabel?: string,
    argOverrides?: Record<string, number>,
    options?: ExecuteRollOptions,
  ) => Promise<{ result: RollExpressionResult | null; writes: MacroWrite[] } | null>;
  /**
   * 孤注一擲：重擲擲骰台上那筆結果的同一個目標，送出一則標 `pushed: true`、指向原本那
   * 一則的新訊息。規則不允許（沒失敗、已經推過、SAN／幸運）時回 false，什麼都不送。
   */
  pushRoll: (entryId: string) => Promise<boolean>;
  /**
   * 花幸運之後：送出一則記錄點數與等級變化的新訊息，並把擲骰台上那筆結果移到新等級。
   * 扣幸運由呼叫端先做（寫角色資料）；送出失敗回 false，結果維持原樣，呼叫端要把點數還回去。
   */
  announceLuckSpend: (entryId: string, option: SpendOption) => Promise<boolean | "already-posted">;
  /**
   * A plugin's follow-up to the desk's entry `entryId` (SAN loss, damage, Fate's +2): a NEW roll
   * through the same execute path, to chat with the entry's audience and the given label. The entry
   * is never changed. Null when the entry is gone or the roll did not happen.
   */
  rollFollowUp: (entryId: string, request: RollFollowUpRequest) => Promise<RollFollowUpRolled | null>;
  /**
   * A chat line under the desk's entry `entryId` that records what a follow-up changed (「SAN 70 → 65」):
   * a result-only roll message with the entry's audience, through the same roll sink. Only in a
   * table, and only when the entry itself went to chat (a line about a roll nobody saw is not sent);
   * otherwise it returns false.
   */
  postFollowUpNote: (entryId: string, note: { label: string; value: number }) => Promise<boolean>;
  /** 訂閱每一次擲骰結果；回傳取消訂閱 */
  onRollResult: (listener: RollResultListener) => () => void;
  /** 是否在 session 中 */
  isInSession: boolean;
  /** 當前角色 ID */
  characterId?: string;
  /** 當前角色名稱 */
  characterName?: string;
  /** 桌主從隊友的角色卡擲骰（以桌主自己的名義送出） */
  onBehalf: boolean;
}

/** 3D 擲骰器回呼函數類型（保留向後兼容） */
export type DiceRollerCallback = (
  notation: string,
  options?: {
    skillName?: string;
    targetValue?: number;
    successLevel?: string;
  },
) => Promise<void>;
