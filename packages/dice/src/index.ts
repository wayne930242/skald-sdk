// @skald/dice

// Types
export type {
  Die,
  DiceModifiers,
  SingleRoll,
  DieRollResult,
  DiceRollResult,
  SuccessLevel,
  CoC7eSuccessLevel,
  CheckResult,
  AttributeFormula,
  AttributeRollResult,
  RollHistoryEntry,
  // Realtime dice types
  DiceVisibility,
  DiceRollBase,
  SimpleDiceRoll,
  SkillCheckRoll,
  OpposedRoll,
  DiceRoll,
  // Chat types
  SpeakMode,
  ChatMessage,
  HandoutRefData,
  HandoutCardData,
  TableBroadcastPayload,
} from "./types";

// Roll kind
export { isFateRoll, isPbtaTier, PBTA_TIERS } from "./roll-kind";
export type { PbtaTierId } from "./roll-kind";
export { keptRollFlags } from "./kept-rolls";

// Parser
export { parseDiceExpression, validateDiceExpression } from "./parser";
export type {
  ParsedDiceExpression,
  ValidationError,
  ValidationResult,
} from "./parser";

// Roller
export {
  rollDice,
  rollDiceExpression,
  rollD100,
  rollCoC7eSkillCheck,
} from "./roller";
export type { RandomSource, SkillCheckInput } from "./roller";

// Check
export { getSuccessLevel, calculateSuccessLevel, performCheck } from "./check";

// Attributes
export {
  COC7E_ATTRIBUTE_FORMULAS,
  PULP_CORE_CHAR_FORMULA,
  rollAttribute,
  rollAllAttributes,
  rollPulpCoreChar,
} from "./attributes";

// DSL Roll Evaluator
export { createRollEvaluator, evaluateRollThreshold } from "./dsl-roll-evaluator";
export type {
  SuccessLevel as DslSuccessLevel,
  SuccessLevelStyle,
  RollUnderRule,
  RollOverRule,
  ComparisonRule,
  RollRule,
  RollRulesDefinition,
  RollEvaluator,
} from "./dsl-roll-evaluator";

// Declared difficulty (CoC Regular / Hard / Extreme)
export {
  DECLARED_DIFFICULTIES,
  difficultyTarget,
  isDeclaredDifficulty,
  judgePercentileCheck,
  ruleSupportsDifficulty,
  rollRulesSupportDifficulty,
} from "./difficulty";
export type {
  DeclaredDifficulty,
  JudgePercentileCheckInput,
  PercentileJudgement,
} from "./difficulty";

// Post-roll actions (push, spend Luck, auto-improve)
export {
  decideAutoImprove,
  evaluatePostRollActions,
  postRollActionExcludes,
  findPostRollActions,
  resolveRollRuleId,
  shouldAutoImprove,
} from "./post-roll-actions";
export type {
  AutoImproveDecision,
  AutoImproveInput,
  ImprovePostRollAction,
  PostRollAction,
  PostRollEvaluation,
  PostRollState,
  PushBlockReason,
  PushDecision,
  RerollPostRollAction,
  SpendBlockReason,
  SpendDecision,
  SpendOption,
  SpendPostRollAction,
  SpendPostRollLevel,
} from "./post-roll-actions";

// What a roll changes on a character's data (Luck spend, improvement tick, macro writes)
export {
  applyFieldWrites,
  numberAtPath,
  readResourceValue,
  setAtPath,
  spendResource,
  tickSkillImproved,
} from "./roll-effects";
export type {
  CharacterData,
  FieldWritesOutcome,
  ResolvedFieldWrite,
  SkillTickTarget,
  SpendOutcome,
  TickOutcome,
} from "./roll-effects";

// Roll Expression (re-export for convenience)
export * from "./roll-expression";

// Macro types
export * from "./macro";

// Roll Handlers
export * from "./handlers";

// Presentation / Renderer model
export * from "./presentation";

// Autocomplete (shared {{@ / {{# trigger detection)
export * from "./autocomplete";

// Avatar resolution (shared between web send path and bot embed construction)
export { isPublicHttpUrl, resolveAvatarUrl } from "./avatar";
export type { ResolveAvatarUrlInput } from "./avatar";

// Inline handout reference tokens (shared between chat composer, chat log
// renderer, and bot embed construction)
export {
  serializeHandoutToken,
  parseHandoutTokens,
  hasHandoutToken,
  renderHandoutTokensAsPlainText,
} from "./handout-tokens";
export type { HandoutTokenSegment } from "./handout-tokens";

// Handout chat card parsing (shared between web chat and the Discord bot)
export { parseHandoutCardData } from "./handout-card";
