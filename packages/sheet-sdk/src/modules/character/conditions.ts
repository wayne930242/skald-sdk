/**
 * The sheet condition rules as their own entry: pure and system-agnostic, so the template compiler
 * (and the open-source export) reaches them without the rest of the character index.
 */
export {
  CONDITION_FORMULA_ID_PREFIX,
  conditionItemIdIssues,
  conditionSuggestFormulaId,
  conditionSuggestTargetId,
  isConditionChecked,
  isGeneratedConditionDefinition,
  shouldSuggestCondition,
  suggestingItems,
} from "./domain/sheets/conditions";
