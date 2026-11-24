/**
 * Character Creation Wizard contract (ADR 0011).
 *
 * A Character Sheet Template Version may carry a declarative `wizard` in its
 * source envelope, next to `schema`, `template` and `formulas`. The wizard
 * writes initial values once, at Wizard Commit; it holds no code. Dice go
 * through Actions (roll macros), calculation through the template formula
 * language (ADR 0004).
 *
 * The JSON Schema twin of these types is
 * `apps/web/data/schemas/wizard.schema.json`; publish validation lives in
 * `apps/web/lib/template-publishing/wizard-artifact-validator.ts`.
 */

import type { MacroParamDefinition } from "@skald/dice";

export const WIZARD_SCHEMA = "skald/wizard/v1" as const;
export const TEMPLATE_MACROS_SCHEMA = "skald/template-macros/v1" as const;
export const CREATION_ROLL_LOG_SCHEMA = "skald/creation-roll-log/v1" as const;

/** Publish-time limits; exceeding any of them blocks Publish. */
export const WIZARD_LIMITS = {
  maxSteps: 40,
  maxInputsPerStep: 60,
  /**
   * `count` of a roll method and `repeat` of a rollWrites method. A literal
   * (a number or a constant formula such as `"=30"`) is checked at Publish.
   * A formula that reads the draft is evaluated when the step rolls: a result
   * that is not an integer from the method's minimum up to this limit fails
   * the step, and nothing is rolled.
   */
  maxRollCount: 20,
  maxPickSourceItems: 2000,
  /**
   * Elements of one array inside a game data item: the `from` array of an
   * entries op, the `options` of a specialization group, a preset's values.
   * An array over the limit is reported once, as this limit, and not walked.
   */
  maxDataElementsPerItem: 1000,
  /**
   * Length of an id or key read from System game data: an item `id`, an
   * option `id`, the List Entry key of an entries op. A longer one makes its
   * item invalid (`wizard_game_data_item_invalid`).
   */
  maxDataIdLength: 200,
  /** Distinct System game data keys (`gameData`) the steps of one wizard reference. */
  maxGameDataKeys: 64,
  /**
   * Bytes one validation reads from the System: the game data its steps
   * reference plus the System's roll macros, default data and roll rules
   * (the last two for the dry run), as the database sends them. The read
   * stops at the limit and the wizard is rejected; the rest is not loaded.
   */
  maxSystemResourceBytes: 4 * 1024 * 1024,
  /** Plain (non `{{i18n:…}}`) LocalizedText length in characters. */
  maxPlainTextLength: 2000,
  /** Serialized size of the whole `wizard` value. */
  maxWizardBytes: 256 * 1024,
  /** Body length of a System roll macro a wizard references. */
  maxSystemMacroBodyLength: 8192,
  /**
   * Work one publish validation may spend, in units: one per game data item
   * or element a check reads, one per List Entry key it resolves and per
   * schema default entry it reads, more per reported issue and per compiled
   * formula. A wizard whose checks need more is rejected, not published
   * unchecked.
   */
  maxValidationWork: 2_000_000,
  /**
   * Test runs of a wizard dry run (Validate runs the wizard headlessly with
   * seeded dice): at most this many runs, this many steps over all runs, and
   * this much wall-clock time, checked between steps, between the previews
   * of a step's alternatives and before a run's commit. Hitting one before
   * every step was reached, or before a reached end was checked, ends the dry
   * run with a budget warning.
   */
  maxDryRuns: 32,
  maxDryRunSteps: 1200,
  dryRunTimeoutMs: 3000,
} as const;

export const TEMPLATE_MACRO_LIMITS = {
  maxMacros: 50,
  /** Also the limit for a System or global macro a wizard references. */
  maxParams: 8,
  maxBodyLength: 2048,
  /** Length of a parameter's `default` formula; also applies to System macros a wizard references. */
  maxDefaultLength: 256,
  maxLabelLength: 200,
  /** Serialized size of the whole `macros` value. */
  maxMacrosBytes: 256 * 1024,
  /** Dice per `NdS` group in a roll template. */
  maxDiceCount: 100,
  maxDiceSides: 1000,
} as const;

/**
 * Limits of the Creation Roll Log, the same numbers as
 * `apps/web/data/schemas/creation-roll-log.schema.json`.
 *
 * Publish validation checks every macro a wizard can call (template, System
 * or global) against the per-entry limits, so one macro call always yields an
 * entry the schema accepts.
 *
 * `maxEntries` and `maxBytes` bound the whole log. A roll is never refused
 * because the log is full (owner decision Q5, amended 2026-11-15): the engine
 * appends the roll's entries, then drops entries from the oldest end until
 * the log is within both limits, and adds the number dropped to
 * `CreationRollLog.droppedEntries`. The log therefore holds the newest rolls
 * that fit. An entry is dropped whole, never truncated or rewritten; one
 * that alone exceeds `maxBytes` is dropped as well, and the roll still
 * applies its values. A Wizard Commit is never refused because of a log the
 * engine itself built.
 */
export const CREATION_ROLL_LOG_LIMITS = {
  maxEntries: 2000,
  /** Serialized size of the whole log. */
  maxBytes: 256 * 1024,
  /** Arguments of one macro call, the engine-supplied ones included. */
  maxArgs: 8,
  /** `roll("…")` calls one macro call can make. */
  maxRollsPerCall: 50,
  /** Length of a resolved dice expression. */
  maxExpressionLength: 200,
  /** Dice of one expression: the roller's 1000, plus the units die of a CoC percentile roll. */
  maxDicePerRoll: 1001,
  /** Length of a string `return`. */
  maxOutcomeLength: 200,
  /** Field writes one macro call can make. */
  maxWritesPerCall: 50,
  /** Length of a written field's name. */
  maxWriteFieldLength: 200,
} as const;

/** `/^[A-Za-z0-9_-]+$/`, the same rule as a formula field id. */
export type WizardId = string;
/**
 * `/^[A-Za-z_][A-Za-z0-9_]*$/`, the form a `{{#id[…]}}` reference can spell
 * (`macroId` in the JSON Schemas); narrower than `WizardId`.
 */
export type WizardMacroId = string;
/** `"{{i18n:key}}"`, or plain text in the author's language (never parsed as HTML or Markdown). */
export type LocalizedText = string;
/** Starts with `=`; `skald-excel-v1` (ADR 0004). */
export type WizardFormula = string;
export type WizardLiteral = number | string | boolean;
export type WizardValueType = "number" | "string" | "boolean";

/**
 * Where `Formula | Literal` is accepted, a string that starts with `=` is a
 * formula and any other string is a literal.
 */
export type WizardFormulaOrLiteral = WizardFormula | WizardLiteral;

export interface CharacterWizard {
  $schema: typeof WIZARD_SCHEMA;
  title?: LocalizedText;
  variables?: Record<WizardId, WizardVariable>;
  /** 1 to `WIZARD_LIMITS.maxSteps` steps, run in order. */
  steps: WizardStep[];
  finalize?: WizardFinalize;
  /**
   * Extension E1: rules that replace the base of List Entries while they are
   * written (for example skill bases derived from characteristics). Applied
   * in order to every write of every step, `finalize` included.
   */
  entryBases?: WizardEntryBases[];
  /**
   * Extension E5 (ADR 0016): what a table's GM may preset or lock for the players' runs at the
   * table. Without it the wizard runs the same at every table.
   */
  tableSetup?: WizardTableSetup;
}

/**
 * E5: the variables and step choices a table setup may preset. Each item a GM sets is either a
 * default the player may change or a lock (D1); locks bind players only, in the in-table wizard.
 */
export interface WizardTableSetup {
  /** Variables whose start value a GM may set: an id, or an id with the label the setup page shows. */
  variables?: Array<WizardId | WizardTableSetupVariable>;
  /** Steps whose choice a GM may set, by step id. */
  steps?: Record<WizardId, WizardTableSetupStep>;
}

export interface WizardTableSetupVariable {
  var: WizardId;
  /** Defaults to the label of the fill input that sets the variable. */
  label?: LocalizedText;
}

export interface WizardTableSetupStep {
  /** A pick step that takes one item: the GM may name it. */
  choice?: boolean;
  /** A generate step with several methods: the GM may name the ones offered. */
  methods?: boolean;
  /** Defaults to the step's title. */
  label?: LocalizedText;
}

/** A value that lives only while the wizard runs and is never written to the Character. */
export interface WizardVariable {
  type: WizardValueType;
  /** Must match `type`. */
  default: WizardLiteral;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/**
 * Part of a compound field. `attribute` accepts `"value"` (the default);
 * `coc-tracked-resource` and `resource` accept `"current"` (the default).
 * Other field types take no part. Derived parts (max, start, half, fifth)
 * are not writable by a wizard.
 */
export type WizardFieldPart = "value" | "current";

export interface WizardFieldTarget {
  field: WizardId;
  part?: WizardFieldPart;
  /**
   * One member of a pure-data `object` field whose `defaultValue` is an
   * object holding a number, string or boolean under this key; that value's
   * type is the type the target accepts. A write keeps the other members and
   * starts from `defaultValue` while the Character has no object yet. Not
   * together with `part`, and not as a fill input.
   */
  member?: WizardId;
}

export interface WizardVariableTarget {
  var: WizardId;
}

/** One row field of one List Entry; `key` is the entry's stable key (`id` for a generic List). */
export interface WizardListEntryTarget {
  list: WizardId;
  key: string;
  field: WizardId;
}

export type WizardTargetRef =
  | WizardFieldTarget
  | WizardVariableTarget
  | WizardListEntryTarget;

/** System game data key, and a dotted path to an array inside it when the key is not the array itself. */
export interface WizardDataRef {
  gameData: WizardId;
  path?: string;
}

/**
 * A roll macro: the template's own (`source.macros`), the System's, or a
 * global one, resolved in that order. `args` are evaluated with template
 * formulas first and passed as numbers.
 *
 * Whoever owns it, the macro must be able to run to an end and to log each
 * call within `CREATION_ROLL_LOG_LIMITS`: no roll result read before a roll
 * bound it, and no `if` without a final `else`. A System or global macro
 * that does not is `wizard_macro_invalid`.
 */
export interface WizardMacroRef {
  macro: WizardMacroId;
  args?: Array<WizardFormula | number>;
}

/** A value source usable where no picked data item is in scope (effects, `mark`). */
export type WizardLocalValueSource =
  | { const: WizardLiteral }
  /** Evaluated against the draft's current values. */
  | { formula: WizardFormula };

export type WizardValueSource =
  | WizardLocalValueSource
  /**
   * Dotted path into the picked data item (or the array element being
   * applied). `localize` writes the i18n token's text in the current locale;
   * `chooseOne` lets the user pick one value when the path holds an array.
   */
  | { item: string; default?: WizardLiteral; localize?: boolean; chooseOne?: boolean }
  /** Path to a number or a `=formula` string in the data item; written as a number. */
  | { dataFormula: string };

// ---------------------------------------------------------------------------
// Shared step parts
// ---------------------------------------------------------------------------

export interface WizardCheck {
  /** Must return boolean. */
  rule: WizardFormula;
  /** `error` blocks "next"; `warning` asks for confirmation. */
  severity: "error" | "warning";
  message: LocalizedText;
}

export interface WizardSetEffect {
  when?: WizardFormula;
  target: WizardTargetRef;
  value: WizardFormulaOrLiteral;
}

export interface WizardAppendEntryEffect {
  when?: WizardFormula;
  appendEntry: { list: WizardId; set: Record<WizardId, WizardLocalValueSource> };
}

export type WizardEffect = WizardSetEffect | WizardAppendEntryEffect;

export interface WizardStepBase {
  /** Unique within the wizard. */
  id: WizardId;
  /** Required unless `presentation` is `"hidden"`. */
  title?: LocalizedText;
  description?: LocalizedText;
  /** Boolean; the step is skipped and writes nothing when false. */
  when?: WizardFormula;
  optional?: boolean;
  /** `hidden`: no screen, completes by itself; only for steps that need no user input. */
  presentation?: "page" | "hidden";
  /** Evaluated after the step's writes and effects. */
  checks?: WizardCheck[];
  /** Applied in order after the step's own writes. */
  effects?: WizardEffect[];
}

// ---------------------------------------------------------------------------
// fill
// ---------------------------------------------------------------------------

export interface WizardVariableInput {
  kind: "number" | "text" | "toggle" | "select";
  options?: WizardSelectOption[];
  min?: number;
  max?: number;
}

export interface WizardSelectOption {
  value: WizardLiteral;
  label: LocalizedText;
  /**
   * Extension E4: boolean; the option is offered only while it holds, on the
   * values the input sees (those of the inputs before it). A value whose
   * option is not offered is refused like one not listed.
   */
  when?: WizardFormula;
}

export interface WizardFillInput {
  /** A field (a whole List included), a List Entry field, or a wizard variable. */
  target: WizardTargetRef;
  /** Defaults to the field's own label. */
  label?: LocalizedText;
  when?: WizardFormula;
  required?: boolean;
  /** Applied on entering the step, only when the target is empty. */
  prefill?: WizardFormulaOrLiteral;
  /**
   * The input takes its `prefill` whenever it is left out, whatever its target
   * holds, so it follows the inputs before it (a preset chosen above) until the
   * user sets it. A screen drops a value set here when an input before it
   * without `followPrefill` changes. Requires `prefill`.
   */
  followPrefill?: boolean;
  /** Required for, and only allowed on, variable targets; fields use their own renderer (ADR 0005). */
  input?: WizardVariableInput;
}

export interface WizardFillStep extends WizardStepBase {
  type: "fill";
  inputs: WizardFillInput[];
}

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

export type WizardBound =
  | number
  | WizardFormula
  /** The value the target had when the step was entered. */
  | "baseline"
  /** A row field of the same List Entry; List targets only. */
  | { entryField: WizardId };

export interface WizardGenerateMethodBase {
  id: WizardId;
  label?: LocalizedText;
}

export interface WizardRollMethod extends WizardGenerateMethodBase {
  kind: "roll";
  /** Each call yields the macro result's `rolled` (a numeric `return` overrides it). The macro must not write fields. */
  action: WizardMacroRef;
  /** Number of calls; defaults to the number of targets. At most `WIZARD_LIMITS.maxRollCount`. */
  count?: WizardFormula | number;
  /** Folds the `count` results into one value (for example roll twice, keep the higher). */
  combine?: "max" | "min" | "sum";
  /** `ordered`: results go to targets in order; `free`: the user assigns results to targets. */
  assign: "ordered" | "free";
}

export interface WizardRollWritesMethod extends WizardGenerateMethodBase {
  kind: "rollWrites";
  /** The macro's own `@field := …` writes are applied to the draft between calls; it may only write the step's targets. */
  action: WizardMacroRef;
  /** Number of sequential calls, 0 to `WIZARD_LIMITS.maxRollCount`. */
  repeat: WizardFormula | number;
}

export interface WizardPresetMethod extends WizardGenerateMethodBase {
  kind: "preset";
  /** Each item holds one array of numbers. */
  source: WizardDataRef;
  /** Path to that array in an item; its length must equal the number of targets. */
  valuesPath: string;
  /** Optional "roll for a set": the engine passes the item count as the first argument and expects 1..n. */
  pickByRoll?: WizardMacroRef;
  assign: "ordered" | "free";
}

export interface WizardPointBuyMethod extends WizardGenerateMethodBase {
  kind: "pointBuy";
  pool: WizardFormula | number;
  rule: "exact" | "max";
  min?: number | WizardFormula;
  max?: number | WizardFormula;
  warnMin?: number | WizardFormula;
  warnMax?: number | WizardFormula;
  /**
   * Sibling methods whose numbers the user can carry into this point buy:
   * a `roll` without `combine` or a `preset`, by id. Once that method has
   * values the step offers a switch to point buy, which starts the targets
   * at them; the pool rule and the limits decide as without it.
   */
  seedFrom?: WizardId[];
  /**
   * Extension E2: what each score costs, read from a System lookup table
   * (`LOOKUP(score, lookup)`, the tables formulas use). Spent is the sum of
   * the targets' costs instead of the sum of the scores. Publish requires
   * literal `min` and `max`, a row at `min`, and integer costs that never
   * decrease from `min` to `max`.
   */
  cost?: WizardPointBuyCost;
}

/** Extension E2: the lookup table a point buy prices its scores with. */
export interface WizardPointBuyCost {
  lookup: string;
}

export type WizardGenerateMethod =
  | WizardRollMethod
  | WizardRollWritesMethod
  | WizardPresetMethod
  | WizardPointBuyMethod;

export interface WizardGenerateStep extends WizardStepBase {
  type: "generate";
  /** Numeric fields or variables that receive the values. */
  targets: WizardTargetRef[];
  /** String variable recording the chosen method id; methods are shown as tabs when there are several. */
  methodVar?: WizardId;
  methods: WizardGenerateMethod[];
  /**
   * Whether the user may roll this step again. Default false. Every roll and
   * reroll is appended to the Creation Roll Log; a reroll never removes the
   * entries of the rolls before it. Only a full log drops entries, oldest
   * first (`CREATION_ROLL_LOG_LIMITS`).
   */
  rerollable?: boolean;
}

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------

export type WizardPickFilter = WizardPickValueFilter | WizardPickListFilter;

export interface WizardPickValueFilter {
  path: string;
  op: "equals" | "includes" | "absentOrIncludes";
  value: WizardFormulaOrLiteral;
}

/**
 * Extension E3: compares an item with the entries a List of the draft holds
 * on entering the step. `inList` lets an item through when its scalar at
 * `path` equals row field `field` of an entry of `list` (among the entries
 * `where` selects); `notInList` lets through only the items no such entry
 * matches, so a later step does not offer what an earlier one already gave.
 */
export interface WizardPickListFilter {
  path: string;
  op: "inList" | "notInList";
  list: WizardId;
  /** A row field of the List, or `id` for the entry key. */
  field: WizardId;
  where?: { field: WizardId; equals: WizardLiteral };
}

/**
 * Stable key of the List Entry a chosen specialization becomes:
 * `<group id>:<option id>`. Publish validation and the wizard engine share it.
 */
export function wizardSpecializationEntryKey(groupId: string, optionId: string): string {
  return `${groupId}:${optionId}`;
}

/**
 * Row fields of a List that a chosen specialization fills, each a row field
 * key. Without the map the engine writes only the entry key.
 *
 * The `optionsFrom` group of a specialization may carry two optional keys:
 * `base` (a number or a `=formula`), the base of a custom name instead of 0,
 * and `entryDefaults` (row field → literal), written first on every row the
 * choice places.
 */
export interface WizardEntryFields {
  /** Receives the group id. */
  group?: WizardId;
  /**
   * Receives the entry key `<group>:<option>` when an option was chosen;
   * nothing for a custom name. Written after `group`, so it wins when both
   * name the same row field.
   */
  option?: WizardId;
  /** Receives the option's label, or the custom name. */
  name?: WizardId;
  /** Receives the option's `base`; a custom name starts at its group's `base`, else 0. */
  base?: WizardId;
}

/**
 * "Pick one of a group" elements inside an applied array. A chosen option
 * becomes (or fills) the List Entry keyed by `wizardSpecializationEntryKey`.
 */
export interface WizardChooseSpec {
  /** An element that has this path needs a choice. */
  when: string;
  /** Element path to the group id. */
  group: string;
  /** Element path to the allowed option ids; the whole group when absent. */
  options?: string;
  /** Groups: `[{ id, options: [{ id, … }] }]`. */
  optionsFrom: WizardDataRef;
  /** Which groups and options are offered; see `WizardAddEntries.filter`. */
  filter?: WizardPickFilter[];
  allowCustomName: boolean;
  entryFields?: WizardEntryFields;
  /**
   * A numeric row field that moves with the base: when the chosen option's
   * base (`entryFields.base`) replaces a number `set` wrote to the same
   * field, a number `set` wrote here moves by the same difference, as
   * `WizardEntryBases.valueField` does. Absent, `set`'s value is kept.
   */
  valueField?: WizardId;
}

export type WizardApplyOp =
  | { op: "set"; target: WizardTargetRef; value: WizardValueSource }
  /** Rebuilds the whole List from an array in the item; `key` is the element path of the entry key. */
  | {
      op: "replaceEntries";
      list: WizardId;
      from: string;
      key: string;
      set: Record<WizardId, WizardValueSource>;
    }
  /** Updates the entry with that key, or adds it. */
  | {
      op: "upsertEntries";
      list: WizardId;
      from: string;
      key: string;
      set: Record<WizardId, WizardValueSource>;
      choose?: WizardChooseSpec;
    }
  /** Updates existing entries only. */
  | {
      op: "updateEntries";
      list: WizardId;
      from: string;
      key: string;
      set: Record<WizardId, WizardValueSource>;
    }
  | { op: "appendEntry"; list: WizardId; set: Record<WizardId, WizardValueSource> };

/**
 * How many items a pick takes; defaults to exactly one. Each bound is a
 * literal integer or a numeric formula. A formula is evaluated on the values
 * the step starts from. When either bound is a formula, the pair must be
 * integers with 0 <= min <= max and 1 <= max <=
 * `WIZARD_LIMITS.maxPickSourceItems`, or the step fails (`count_invalid`) and
 * writes nothing. Literal bounds are checked at Publish.
 */
export interface WizardPickCount {
  min: number | WizardFormula;
  max: number | WizardFormula;
}

/**
 * A list of game data a pick step shows beside its items. Without `apply`
 * it is read-only: nothing in it can be picked, and it writes nothing and
 * takes no part in the step's completion, replay or draft. The filter is
 * evaluated on the values the step starts from. A `presentation: "hidden"`
 * step cannot have one.
 */
export interface WizardPickReference {
  title: LocalizedText;
  /** An array whose items each have a unique string `id`. */
  source: WizardDataRef;
  filter?: WizardPickFilter[];
  /** Item paths shown per entry; the id stands in for a missing label. */
  display: { label: string; description?: string };
  /**
   * Makes the list pickable: the user may complete the step with one of its
   * items instead of the step's own (`referenceId`). These ops are applied
   * to that item in place of the step's `apply`; `store` is not written.
   */
  apply?: WizardApplyOp[];
}

export interface WizardPickStep extends WizardStepBase {
  type: "pick";
  /** An array whose items each have a unique string `id`. */
  source: WizardDataRef;
  filter?: WizardPickFilter[];
  /** Defaults to exactly one. */
  count?: WizardPickCount;
  /** Automatic selection (returns an item id); with `presentation: "hidden"` no screen is shown. */
  select?: WizardFormula;
  pickByRoll?: WizardMacroRef;
  /** A "custom" option that only sets a variable and applies no item. */
  allowCustom?: { var: WizardId; value: WizardLiteral; label: LocalizedText };
  /**
   * Receives the picked item id. A pure-data `object` field whose
   * `defaultValue` is an array of strings (an id list) receives every picked
   * id as an array, in pick order, whatever the count; any other target
   * receives one id, so it needs `count.max` 1 (a literal, or a constant
   * formula).
   */
  store?: WizardTargetRef;
  /** Item paths shown on the card; `label` defaults to `"label"`. */
  display?: { label: string; description?: string; badges?: string[] };
  reference?: WizardPickReference;
  apply: WizardApplyOp[];
  /** See `WizardGenerateStep.rerollable`; applies to `pickByRoll`. */
  rerollable?: boolean;
}

// ---------------------------------------------------------------------------
// allocate
// ---------------------------------------------------------------------------

export type WizardAllocateTargets =
  | { fields: WizardId[] }
  | {
      list: WizardId;
      where?: { field: WizardId; equals: WizardLiteral };
      include?: string[];
      exclude?: string[];
    };

/**
 * Entries an allocate step can add. A specialization of `optionsFrom` becomes
 * the entry `<group>:<option>`; a plain item of `itemsFrom` becomes the entry
 * keyed by its own `id`.
 */
export interface WizardAddEntries {
  optionsFrom: WizardDataRef;
  /**
   * Plain items: `[{ id, label?, base?, entryDefaults? }]`. An added item is
   * appended as a new entry: its `entryDefaults` (row field → literal), its
   * id in `entryFields.option`, and its `base` (a number or a `=formula`,
   * else 0) in `entryFields.base` and the value field. An item whose key the
   * List already has cannot be added.
   */
  itemsFrom?: WizardDataRef;
  /** What the screen calls the `itemsFrom` items; a neutral generic label when absent. */
  itemsLabel?: LocalizedText;
  /**
   * Which groups, options and items are offered: each must pass every filter,
   * evaluated against the values on entering the step (pick filter semantics).
   */
  filter?: WizardPickFilter[];
  groupField: WizardId;
  allowCustomName: boolean;
  entryFields?: WizardEntryFields;
}

/**
 * Entries an allocate step's `pickTargets` start with: the ones an earlier
 * step marked. When the inputs name no `picked`, these are the picked ones.
 * One the user unpicks is released: its value returns to `release`, the
 * points that frees go back to the pool (in a `transfer`, they must be moved
 * elsewhere), and `releaseSet` is written to it. Direction and limits do not
 * bind a released entry.
 */
export interface WizardPreselectedTargets {
  where: { field: WizardId; equals: WizardLiteral };
  release: WizardBound;
  releaseSet?: Record<WizardId, WizardLocalValueSource>;
}

/**
 * A rule of one allocate target, by its key (a field id, or a List Entry
 * key). It applies while `when` holds on entering the step (always without
 * it) and the step has that target. Bounds are evaluated on the values on
 * entering the step.
 */
export interface WizardAllocateTargetRule {
  target: string;
  /** Boolean. */
  when?: WizardFormula;
  /**
   * Where the target starts while picked and the inputs give it no value.
   * Its change from the baseline is spent from the pool like the user's.
   */
  prefill?: number | WizardFormula;
  /**
   * The target's own suggested range, in place of the step's `warnMin` and
   * `warnMax`. It is checked whether or not the value changed, so a target
   * put back to its baseline outside the range still warns.
   */
  warnMin?: number | WizardFormula;
  warnMax?: number | WizardFormula;
}

export interface WizardAllocateStep extends WizardStepBase {
  type: "allocate";
  targets: WizardAllocateTargets;
  /** The user first picks the subset to allocate to. List targets only. */
  pickTargets?: {
    min: number;
    max: number;
    required?: string[];
    preselected?: WizardPreselectedTargets;
  };
  /** Adding entries (specializations, or plain items) while allocating. List targets only. */
  addEntries?: WizardAddEntries;
  /** Numeric row field of a List Entry; defaults to `"value"`. */
  valueField?: WizardId;
  /** Starting point: the value on entering the step. */
  baseline?: "current";
  direction: "increase" | "decrease" | "transfer";
  /** Ignored for `transfer`, whose net change must be 0. */
  pool: WizardFormula | number;
  rule: "exact" | "max";
  warnUnspent?: boolean;
  min?: WizardBound;
  max?: WizardBound;
  warnMin?: WizardBound;
  warnMax?: WizardBound;
  /** At most one rule per target. */
  targetRules?: WizardAllocateTargetRule[];
  /** Written to entries that were picked or changed. List targets only. */
  mark?: Record<WizardId, WizardLocalValueSource>;
  /** Extension E1. List targets only. */
  extensions?: WizardAllocateExtensions;
}

export type WizardStep =
  | WizardFillStep
  | WizardGenerateStep
  | WizardPickStep
  | WizardAllocateStep;

export interface WizardFinalize {
  /** Extension E1: applied first at Wizard Commit, before `effects`. */
  groupFloors?: WizardGroupFloor[];
  /** Applied in order just before Wizard Commit. */
  effects?: WizardEffect[];
}

// ---------------------------------------------------------------------------
// Extension E1: specialization groups
// ---------------------------------------------------------------------------

/**
 * Whether List Entry `key` is a specialization of group `groupId`: its key is
 * `<group id>:<name>` (`wizardSpecializationEntryKey`). An unnamed slot of
 * the group is not one. Publish validation and the wizard engine share it.
 */
export function isWizardSpecializationOf(groupId: string, key: string): boolean {
  const prefix = wizardSpecializationEntryKey(groupId, "");
  return key.length > prefix.length && key.startsWith(prefix);
}

/**
 * Group floors ("specialization minimums"): at Wizard Commit, every
 * specialization of each group is raised to `FLOOR(highest value of the
 * group × ratio)` when it is lower. Applied once; the sheet keeps no floor.
 */
export interface WizardGroupFloor {
  /** Boolean, evaluated against the values at Wizard Commit; absent means always. */
  when?: WizardFormula;
  list: WizardId;
  /** Group ids; entry `<group>:<name>` belongs to its group. Each group is floored on its own. */
  groups: string[];
  /** Greater than 0, at most 1. */
  ratio: number;
  /** Numeric row field; defaults to `"value"`. */
  valueField?: WizardId;
}

/**
 * Purchasing specializations (an allocate step option): a specialization
 * bought in the step for the first time may start at `FLOOR(related value ×
 * ratio)` instead of its base, when that is higher.
 *
 * - First bought: the entry was added in the step, or its value on entering
 *   the step equals its `baseField`. Only such an entry whose value the user
 *   raises gets a start; one already bought keeps its baseline.
 * - Related: an entry of the same group (never an unnamed slot). In an
 *   `autoRelatedGroups` group every specialization is related to every
 *   other, and the engine takes the highest one available: entries not
 *   bought in the step, then the bought ones in order of value (highest
 *   first, then key), so no entry relates to one that relates back. In any
 *   other group the user names the related entry (`inputs.related`) when
 *   `playerDeclared`; a named chain that loops is an error.
 * - The bought value must exceed the start: points are spent from the start,
 *   and a value between the baseline and the start is an error.
 */
export interface WizardPurchaseRelated {
  /** Boolean, evaluated on entering the step; absent means always. */
  enabled?: WizardFormula;
  /** The specialization groups, `[{ id, … }]` (the shape of `addEntries.optionsFrom`). */
  groupsFrom: WizardDataRef;
  /** Numeric row field holding the entry's base. */
  baseField: WizardId;
  /** Groups whose specializations are all related to each other. */
  autoRelatedGroups?: string[];
  /** Whether the user may name the related entry in the other groups. */
  playerDeclared: boolean;
  /** Greater than 0, at most 1. */
  ratio: number;
}

export interface WizardAllocateExtensions {
  purchaseRelated?: WizardPurchaseRelated;
}

/**
 * Replaces the base of List Entries as they are written (for example skill
 * bases derived from characteristics). Whenever a write gives an entry of
 * `list` a number in `baseField` and `source` has a base for the entry, that
 * base is written instead, and a `valueField` number written with it moves
 * by the same difference, so points added on top of the base are kept.
 *
 * `source` items are `{ id, base }`, `base` a number or a `=formula` over
 * template fields, evaluated against the values the write is made on. An
 * item matches the entry with key `id`; failing that, an item whose `id` is
 * a group matches the group's specializations (`<group>:<name>`) and its
 * unnamed slots.
 */
export interface WizardEntryBases {
  /** Boolean, evaluated against the values each write is made on; absent means always. */
  when?: WizardFormula;
  list: WizardId;
  source: WizardDataRef;
  baseField: WizardId;
  /** Defaults to `"value"`. */
  valueField?: WizardId;
}

// ---------------------------------------------------------------------------
// Template-owned roll macros
// ---------------------------------------------------------------------------

/**
 * A roll macro owned by the Template Version. Same body language as a System
 * roll macro, restricted at publish: no field writes, no System roll prefix,
 * allow-listed dice notation and functions, every reference resolved.
 *
 * A macro that cannot run is rejected too: `@rolled`/`@total` read before a
 * roll, `@target`/`@margin` read before a roll with a comparison, an `if`
 * without a final `else`, and a parameter default that reads anything but a
 * numeric template field (defaults are evaluated in the caller's context,
 * where no parameter exists yet).
 *
 * The id and parameter names follow `/^[A-Za-z_][A-Za-z0-9_]*$/`, the form a
 * `{{#id[…]}}` reference and an `@name` read can spell, and are not
 * `__proto__`, `constructor` or `prototype`.
 */
export interface TemplateMacroDefinition {
  label?: LocalizedText;
  params: MacroParamDefinition[];
  body: string;
}

/** The `macros` key of a template source envelope. */
export interface TemplateMacros {
  $schema: typeof TEMPLATE_MACROS_SCHEMA;
  macros: Record<WizardMacroId, TemplateMacroDefinition>;
}

export type WizardMacroOwner = "template" | "system" | "global";

// ---------------------------------------------------------------------------
// Creation Roll Log
// ---------------------------------------------------------------------------

/** One dice expression executed by a macro call. */
export interface CreationRollDice {
  /** Resolved dice notation, placeholders substituted (for example `2d6+5`). */
  expression: string;
  rolled: number;
  /** Individual die faces. */
  dice: number[];
}

/**
 * One macro call made by the wizard. A reroll adds entries with a higher
 * `attempt` and never changes or removes the entries of earlier rolls; an
 * entry leaves the log only when the log is full and it is the oldest
 * (`CREATION_ROLL_LOG_LIMITS`).
 */
export interface CreationRollLogEntry {
  /**
   * 1-based number of this macro call among all the wizard made since the
   * draft started, dropped ones included. Contiguous within the log: the
   * first entry's `order` is `droppedEntries + 1`.
   */
  order: number;
  stepId: WizardId;
  /** Generate method that rolled; absent for a pick step's `pickByRoll`. */
  methodId?: WizardId;
  purpose: "roll" | "rollWrites" | "pickByRoll";
  /** 1 for the first time the step rolled, +1 for each reroll of that step. */
  attempt: number;
  /** 0-based index of this call within its attempt. */
  sequence: number;
  macro: {
    id: WizardMacroId;
    owner: WizardMacroOwner;
    /** Evaluated argument values, in call order. */
    args: number[];
  };
  result: {
    /** The macro result's headline value (after a numeric `return` override); null when it returned no roll. */
    value: number | null;
    /** A string `return` (for example `"improved"`). */
    outcome?: string;
    rolls: CreationRollDice[];
    /** Field writes a `rollWrites` macro produced in this call. */
    writes?: Array<{ field: string; value: number | string }>;
  };
  /** ISO 8601 UTC timestamp of the roll. */
  rolledAt: string;
}

/**
 * The rolls and rerolls made while creating a Character (owner decision Q5).
 * Not part of `Character.data`.
 *
 * In a Wizard Draft the log lives with the draft: it grows with every roll,
 * drops its oldest entries when it is full, and is cleared when the user
 * restarts the wizard, which discards the draft and starts `order` and
 * `droppedEntries` over. At Wizard Commit the draft's log is committed with
 * the Character and is read-only from then on: nobody can change or delete
 * it, and the owner and the GM of the Character's table can read it.
 */
export interface CreationRollLog {
  $schema: typeof CREATION_ROLL_LOG_SCHEMA;
  /** The Template Version whose wizard produced the rolls. */
  templateVersionId: string;
  /**
   * How many of the oldest entries were dropped to keep the log within
   * `CREATION_ROLL_LOG_LIMITS`; absent or 0 when the log is complete. A
   * reader shows it, so a KP can tell that rolls before `entries[0]` existed.
   */
  droppedEntries?: number;
  /** Oldest first; at most `CREATION_ROLL_LOG_LIMITS.maxEntries`. */
  entries: CreationRollLogEntry[];
}

// ---------------------------------------------------------------------------
// Publish validation issue codes
// ---------------------------------------------------------------------------

/**
 * Issues of the wizard dry run Validate does after the static checks (S10):
 * what a user on one tested branch would hit. The first six are errors and
 * block Publish (unless the server's `WIZARD_DRY_RUN_BLOCKS_PUBLISH` switch
 * is off); the last three are warnings.
 */
export const WIZARD_RUN_ISSUE_CODES = [
  "wizard_run_formula_error",
  "wizard_run_data_missing",
  "wizard_run_count_invalid",
  "wizard_run_step_failed",
  "wizard_run_pick_empty",
  "wizard_run_commit_invalid",
  "wizard_run_step_unvisited",
  "wizard_run_inconclusive",
  "wizard_run_budget_exhausted",
  "wizard_run_not_started",
] as const;

export type WizardRunIssueCode = (typeof WIZARD_RUN_ISSUE_CODES)[number];

export const WIZARD_ISSUE_CODES = [
  "wizard_shape_invalid",
  "wizard_limit_exceeded",
  "wizard_step_id_duplicate",
  "wizard_variable_shadows_field",
  "wizard_target_not_found",
  "wizard_target_not_writable",
  "wizard_target_type_mismatch",
  "wizard_list_key_missing",
  "wizard_formula_invalid",
  "wizard_formula_type",
  "wizard_game_data_not_found",
  "wizard_game_data_item_invalid",
  "wizard_game_data_key_unmatched",
  "wizard_macro_not_found",
  "wizard_macro_invalid",
  "wizard_macro_args",
  "wizard_macro_write_undeclared",
  "wizard_preset_length",
  "wizard_hidden_step_needs_input",
  "wizard_bounds_conflict",
  "wizard_step_unreachable",
  "wizard_table_setup_invalid",
  ...WIZARD_RUN_ISSUE_CODES,
] as const;

export type WizardIssueCode = (typeof WIZARD_ISSUE_CODES)[number];

export const TEMPLATE_MACRO_ISSUE_CODES = [
  "template_macro_shape_invalid",
  "template_macro_limit_exceeded",
  "template_macro_syntax",
  "template_macro_param_invalid",
  "template_macro_side_effect",
  "template_macro_dice_not_allowed",
  "template_macro_function_not_allowed",
  "template_macro_reference_not_found",
  "template_macro_no_roll",
] as const;

export type TemplateMacroIssueCode = (typeof TEMPLATE_MACRO_ISSUE_CODES)[number];
