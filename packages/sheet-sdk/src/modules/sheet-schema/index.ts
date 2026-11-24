// This kernel has no import-time effects. Keep it safe to tree-shake (package.json).
export {
  buildCharacterFormulaValues,
  buildListRowDerivedOverrideKey,
  evaluateCharacterDefaultFormulas,
  evaluateCharacterFormulaRuntime,
  readCharacterFormulaRuntime,
  type CharacterFormulaRuntime,
} from "./domain/character-runtime";
export { inputDefaultsOf, withInputDefaults, withSchemaInputDefaults } from "./domain/input-defaults";
export {
  autoOf,
  diffDerived,
  outOfCapRow,
  snapshotDerived,
  type DerivedSnapshot,
  type RecalcRow,
} from "./domain/derived-recalc";
export {
  readCompiledTemplateCssArtifact,
  SCOPED_CSS_COMPILER_VERSION,
  SCOPED_CSS_VARIABLE_PREFIX,
} from "./domain/compiled-template-css-artifact";
export { fieldFormulaValueType, FORMULA_VALUE_TYPES } from "./domain/field-formula-value-type";
export {
  baseFieldSchema,
  containerSchema,
  fieldDefinitionSchema,
  fieldLayoutSchema,
  fieldReferenceSchema,
  fieldsRecordSchema,
  listFieldSchema,
  listRowFieldSchema,
  listRowTemplateSchema,
  pageContentSchema,
  pageLayoutSchema,
  pageSchema,
  schemaDefinitionSchema,
  sectionSchema,
  templateCustomClassNameSchema,
  templateDefinitionSchema,
  templateStyleVariableNameSchema,
} from "./domain/field-schema";
export { getLegacyFieldTypes, isLegacyFieldType, LEGACY_FIELD_TRANSFORMS } from "./domain/legacy-field-presets";
export {
  BASE_DERIVED,
  defaultEntryKey,
  defaultEntrySources,
  isEmptySlotKey,
  listRowContract,
  type ListRowContract,
  type ListRowField,
} from "./domain/list-row-contracts";
export { getEnabledLegacyTypes, normalizeSchema, normalizeTemplate } from "./domain/normalize-schema";
export { DEFAULT_SECTION_LAYOUT } from "./domain/section-layout";
export { isIdListField, objectMemberContract, type ObjectMemberContract } from "./domain/object-field-contracts";
export {
  structuredListColumnToRowField,
  structuredListToListField,
  type LegacyStructuredListColumn,
  type LegacyStructuredListField,
} from "./domain/structured-list-adapter";
export type {
  JsonObject,
  TemplateArtifactCharacterState,
  TemplateArtifactValidationResult,
  TemplateArtifactValidator,
  TemplateValidationCandidate,
  TemplateValidationCandidateSubject,
  TemplateValidationCharacter,
  TemplateValidationContext,
  TemplateValidationIssue,
  TemplateValidationOrganization,
  TemplateValidationRepository,
  TemplateValidationSummary,
} from "./domain/validation-types";
export { compiledArtifactHasWizard } from "./domain/compiled-artifact-has-wizard";
export type { EditorHandler, EditorHandlerContext, EditorHandlers, OptionSource } from "./domain/editor-handlers";
export type { PublishedTemplateArtifact } from "./domain/published-template-artifact";
export type { RowEntryTranslator, RowPatch, RowSelection, RowSelector, RowSelectorContext, StatGroup, StatRow } from "./domain/row-selector";
