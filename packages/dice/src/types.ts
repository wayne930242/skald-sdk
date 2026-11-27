// lib/dice/types.ts

/** Dice modifier types (Roll20-style) */
export interface DiceModifiers {
  /** Keep highest N dice (kh, k) */
  keepHighest?: number;
  /** Keep lowest N dice (kl) */
  keepLowest?: number;
  /** Drop highest N dice (dh) */
  dropHighest?: number;
  /** Drop lowest N dice (dl, d) */
  dropLowest?: number;
  /** Exploding dice - reroll on max (!) */
  exploding?: boolean;
  /** Compounding dice - keep rerolling on max (!!) */
  compounding?: boolean;
  /** Penetrating explode - explode but -1 on rerolls (!p) */
  penetrating?: boolean;
  /** Explode/compound on this value (default: max) */
  explodeOn?: number;
}

/** Single die specification */
export interface Die {
  count: number; // Number of dice (e.g., 3 in 3D6)
  sides: number | "F"; // Sides per die (e.g., 6 in 3D6, "F" for Fudge dice)
  modifiers?: DiceModifiers; // Roll20-style modifiers
  sign?: -1; // Present when the group is subtracted (e.g. "-1D4" in "2D6-1D4")
}

/** Single die roll with metadata */
export interface SingleRoll {
  value: number;
  kept: boolean; // Whether this roll was kept (not dropped)
  exploded?: boolean; // Whether this roll triggered an explosion
}

/** Result of rolling a single die type */
export interface DieRollResult {
  die: Die;
  rolls: number[]; // Individual results [3, 5, 2] (for backward compatibility)
  detailedRolls?: SingleRoll[]; // Detailed rolls with kept/exploded info
  subtotal: number; // Sum of kept rolls only
}

/** Complete dice expression result */
export interface DiceRollResult {
  expression: string; // Original expression "3D6+5"
  dice: DieRollResult[]; // Results for each die type
  modifier: number; // +/- modifier
  total: number; // Final total
  timestamp: Date;
}

/** CoC 7e's 6 fixed success levels — kept as a literal union for exhaustiveness checks on CoC7e-specific lookup tables. */
export type CoC7eSuccessLevel =
  | "critical"
  | "extreme"
  | "hard"
  | "regular"
  | "failure"
  | "fumble";

/**
 * Success level id. Widened from the CoC7e-only union to `string` because
 * DSL-evaluated rules (`dsl-roll-rules.json`) define arbitrary per-system ids
 * (e.g. Fate Condensed's "success-with-style"/"tie") — the runtime value was
 * always an arbitrary string cast `as SuccessLevel`, this makes the type
 * honest about it.
 */
export type SuccessLevel = string;

/** CoC skill/attribute check result */
export interface CheckResult {
  target: number; // Target value to roll under
  targetHalf: number; // Target / 2 (hard success threshold)
  targetFifth: number; // Target / 5 (extreme success threshold)
  rolled: number; // D100 result
  successLevel: CoC7eSuccessLevel;
  isSuccess: boolean;
  margin: number; // target - rolled (positive = success margin)
}

/** Attribute generation formula */
export interface AttributeFormula {
  id: string; // e.g., "str", "dex"
  label: string; // e.g., "STR", "力量"
  formula: string; // e.g., "3D6×5", "(2D6+6)×5"
}

/** Attribute roll result */
export interface AttributeRollResult {
  attribute: AttributeFormula;
  diceResult: DiceRollResult;
  finalValue: number; // After multiplier
}

/** Roll history entry */
export interface RollHistoryEntry {
  id: string;
  type: "dice" | "check" | "attribute";
  result: DiceRollResult | CheckResult | AttributeRollResult;
  timestamp: Date;
  accepted?: boolean;
}

// ====================
// REALTIME DICE TYPES
// ====================

/** Dice visibility - who can see this roll */
export type DiceVisibility =
  | "all" // Everyone at the table
  | "gm" // Only GM can see
  | "self" // Only roller can see
  | "selected"; // Specific members (requires memberIds)

/** Base dice roll result for network/realtime context */
export interface DiceRollBase {
  id: string;
  timestamp: Date;
  rollerId: string;
  rollerName: string;
  characterId?: string;
  characterName?: string;
  /**
   * The table owner rolled from a teammate's card (`characterId` is that teammate's
   * character) and the message is sent in the owner's own name. Cosmetic: the chat
   * shows "owner (character)" instead of the character alone. Only the table owner can
   * speak as someone else's character (migration 130), so a forged flag changes nothing.
   */
  onBehalf?: true;
  visibility: DiceVisibility;
  visibleToMemberIds?: string[];
}

/** Simple dice roll for network context (e.g., 1d6, 2d10) */
export interface SimpleDiceRoll extends DiceRollBase {
  pool?: import("./pool-highest").PoolOutcome;
  /** Reader-only marker: the stored row claimed a pool but its inputs and faces disagree. */
  invalidPool?: true;
  type: "simple";
  notation: string; // e.g., "1d100", "2d6+3"
  rolls: number[];
  total: number;
  modifier?: number;
  /** Title of the roll: the sheet field it came from (e.g. a PbtA move's stat) */
  label?: string;
  /**
   * The level the system's roll rules gave a plain roll from its total alone
   * (PbtA `strong` / `weak` / `miss`), or `success` / `failure` for a comparison roll.
   * Rows written before this existed have none.
   */
  successLevel?: SuccessLevel;
  /** A comparison roll (`1d20>=15`): the operator and the number it was held against */
  comparator?: string;
  targetValue?: number;
}

/** CoC 7e skill/attribute check for network context */
export interface RollDisplayLabels {
  en: string;
  "zh-TW": string;
}

export interface CheckDisplay {
  labels: RollDisplayLabels;
  tone: "critical" | "success" | "failure" | "fumble";
}

export interface SkillCheckRoll extends DiceRollBase {
  type: "skill_check";
  skillName: string;
  targetValue: number;
  roll: number; // 1-100
  successLevel: SuccessLevel;
  /**
   * The difficulty the roller declared, only when it was Hard or Extreme: `successLevel` was
   * judged against `difficultyTarget(targetValue, difficulty)` (`targetValue` stays the full
   * value). Absent on Regular rolls and on every row written before it existed.
   */
  difficulty?: "hard" | "extreme";
  bonusDice?: number; // Positive = bonus, negative = penalty
  unitsDice?: number[]; // All unit dice rolled
  tensDice?: number[]; // All tens dice rolled
  selectedUnits: number;
  selectedTens: number;
  /**
   * Stable key of what was rolled (a skill's id), set by the sheet that rolled. `skillName`
   * is the name in the roller's language at roll time, so it cannot identify the skill after
   * a language or translation-set switch; the key can. Absent on rolls that predate it and
   * on rolls from outside a sheet (Discord).
   */
  rollKey?: string;
  /**
   * Post-roll follow-up metadata. A follow-up is a NEW message; the roll it follows
   * is never edited. Visibility is the original's.
   */
  /** This message is a pushed re-roll of the roll `followsRollId` */
  pushed?: true;
  /**
   * This message records Luck spent on the roll `followsRollId`: the points of this
   * spend (not a running total). `roll` stays the dice total as rolled; `successLevel`
   * is the level after the spend and `previousSuccessLevel` the level before it.
   */
  luckSpent?: number;
  previousSuccessLevel?: SuccessLevel;
  /** `DiceRoll.id` of the roll this message follows (a push or a Luck spend) */
  followsRollId?: string;
  /** Portable labels and tone for a check graded by a system plugin. */
  checkDisplay?: CheckDisplay;
  /** A linked result-only follow-up's action, in the viewer's locale. */
  followUpLabel?: RollDisplayLabels;
}

/** Opposed roll result for network context */
export interface OpposedRoll extends DiceRollBase {
  type: "opposed";
  attackerRoll: SkillCheckRoll;
  defenderRoll: SkillCheckRoll;
  winner: "attacker" | "defender" | "tie";
}

/** Combined roll type for network context */
export type DiceRoll = SimpleDiceRoll | SkillCheckRoll | OpposedRoll;

// ====================
// CHAT TYPES
// ====================

/** Speak mode for chat messages */
export type SpeakMode = "ic" | "ooc" | "narration" | "action" | "npc";

/** Display metadata for one inline handout reference (`{{handout:pageId}}` token) */
export interface HandoutRefData {
  pageTitle: string;
  pageType: string;
  thumbnailUrl?: string;
}

/**
 * Handout chat card (`table_messages.dice_data` of a `handout` message), parsed
 * from either shape: the release shape written by issue_handout, or the older
 * pushed-handout shape (`legacy`), which has no audience or read state.
 */
export interface HandoutCardData {
  pageId: string;
  pageTitle: string;
  pageType: string;
  /** Two-line teaser of the revealed content; blank once the handout is revoked */
  summary: string;
  audience: "all" | "selected";
  revealMode: "whole" | "staged";
  /** Sections the GM has not revealed yet */
  hiddenCount: number;
  issuedAt?: string;
  revokedAt?: string;
  /** User ids of a `selected` card (from the message's visible_to_member_ids) */
  recipientIds: string[];
  /** Old shape: no read state, no audience; always treated as for everyone */
  legacy: boolean;
  thumbnailUrl?: string;
}

/** Chat message types */
export interface ChatMessage {
  id: string;
  tableId: string;
  senderId: string;
  senderName: string;
  /** The sender's account was deleted (idle guest cleanup): the row's sender_id is NULL */
  senderDeleted?: true;
  senderAvatarUrl?: string;
  characterId?: string;
  characterName?: string;
  content: string;
  timestamp: Date;
  type: "text" | "dice_roll" | "system" | "handout";
  diceRoll?: DiceRoll;
  speakMode?: SpeakMode;
  isDeleted?: boolean;
  editedAt?: Date;
  // Handout 卡片（message_type = 'handout'），見 parseHandoutCardData
  handout?: HandoutCardData;
  // Inline handout 參照（content 內嵌 {{handout:pageId}} token 對應的顯示資料）
  handoutRefs?: Record<string, HandoutRefData>;
  // NPC 發言專用（speakMode === "npc"）
  npc?: {
    pageId: string;
    name: string;
    avatarUrl?: string;
  };
}

/** Realtime broadcast payload - discriminated union for type safety */
export type TableBroadcastPayload =
  | { type: "chat"; data: ChatMessage }
  | { type: "dice_roll"; data: DiceRoll }
  | { type: "user_joined"; data: { userId: string; userName: string } }
  | { type: "user_left"; data: { userId: string; userName: string } }
  | { type: "typing"; data: { userId: string; userName: string } };
