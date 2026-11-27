import type {
  LocalizedText,
  WizardDataRef,
  WizardFormula,
  WizardFormulaOrLiteral,
  WizardId,
  WizardLiteral,
  WizardMacroRef,
  WizardStepBase,
  WizardTargetRef,
  WizardValueSource,
} from "./wizard";

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
export function wizardSpecializationEntryKey(
  groupId: string,
  optionId: string,
): string {
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
  | {
      op: "appendEntry";
      list: WizardId;
      set: Record<WizardId, WizardValueSource>;
    };

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

/**
 * Text the user types for one column of a picked owned row, given in
 * `WizardPickInputs.instanceText[<row id>][<column>]`. It is trimmed and
 * must not be empty; it may be at most `maxLength` characters long, an
 * integer from 1 to `WIZARD_LIMITS.maxInstanceTextLength` (the default).
 */
export interface WizardInstanceText {
  label: LocalizedText;
  maxLength?: number;
}

/** A column value of `WizardPickInstances.update`. */
export type WizardInstanceValue = WizardValueSource | { text: WizardInstanceText };

/**
 * A pick over the rows a List already holds: each candidate is one row (its
 * `id` the row key, its `label` the row's `label` column) joined with the
 * catalog item of `source` that its `ref` column names. Rows that share a
 * catalog item stay distinct choices.
 */
export interface WizardPickInstances {
  list: WizardId;
  ref: WizardId;
  label: WizardId;
  /**
   * Columns written on each picked row, and on that row only: its other
   * columns and every other row keep their values. A value source reads the
   * joined candidate (`item`) or the draft (`formula`); `{ text }` takes what
   * the user typed for that row. Each column must be a writable column of
   * the List other than `id` and `ref`, and accept the value's type (`text`
   * needs a text column). Requires distinct picks (no `price.repeat`).
   *
   * The step's `price` charges each picked row once. Text for a row that
   * was not picked, for a column that is not a `text` column, or text that
   * breaks its bounds fails the step with nothing written or charged.
   * Written before the step's `apply` ops.
   */
  update?: Record<WizardId, WizardInstanceValue>;
}

/** Each source slot has id, parent, optional label (LocalizedText), columns and either fixed {id,label?,columns?}
 * or options of that shape (its own, an `optionPool` id, or both), with optional allowCustom/allowUnresolved flags.
 * `@unresolved` is reserved. Slot and identity keys encode tuples, never labels. */
export interface WizardSlotGrants {
  from: string;
  /**
   * Option lists that slots share, `[{ id, options: [...] }]`, options of the
   * slot shape. A slot whose `optionPool` names one offers its own `options`
   * first, then every option of the pool whose id they do not hold, in pool
   * order. A slot that names a pool needs this; a fixed slot names none.
   */
  optionPools?: WizardDataRef;
  list: WizardId;
  identity: WizardId;
  label: WizardId;
  state: WizardId;
  /** Numeric grant to sum later, excluded from rule-column agreement. */
  amount?: WizardId;
  /** Required when a source slot allows an unresolved choice. */
  unresolvedLabel?: LocalizedText;
  /** Offer the slot's options as column variants for a custom name. */
  customVariantLabel?: LocalizedText;
  /**
   * With `customVariantLabel`: the columns a custom name takes from the
   * variant it is likened to (its rule columns); every other column comes
   * from the slot's own `columns`, which must then hold them. A custom name
   * that resolves to a catalog option must agree with the variant on these
   * columns only, and keeps the option's other columns. Absent, a custom
   * name takes every column of its variant.
   */
  customVariantColumns?: WizardId[];
}

/**
 * Names the user types in a counted pick, each counted as one item and
 * applied as `{ id: "custom:<normalized name>", label }`. A name may not
 * repeat another, nor match (after normalizing) the id or label of any item
 * of the step's source, whether its filter offers that item or not.
 */
export interface WizardCountedCustom {
  label: LocalizedText;
  /**
   * The signed integer charge of each custom name in the step's `price`
   * balance; required when the step has `price`, allowed only then.
   */
  price?: number;
  /**
   * A name may not match (after normalizing) the value of text column
   * `field` of any entry `list` holds on entering the step: the rows
   * earlier steps already added.
   */
  distinctFrom?: { list: WizardId; field: WizardId };
}

/**
 * How `expand` reads the elements of a library member array such as
 * `[{ itemId, quantity, optional, configuration }]`, in place of the built-in
 * slot shape `{ id, ref, quantity?, alternatives?, alternativesSharing? }`. A member is identified
 * by its index in the array, so one catalog item may appear twice; it offers
 * no alternatives, so it needs no choice. An item without the array has no
 * members.
 */
export interface WizardExpandMembers {
  /** Member path to the catalog id. */
  ref: string;
  /** Member path to a whole quantity of at least 1, each unit its own row; 1 when the member has none. */
  quantity?: string;
  /**
   * List column → member path, copied into each row (for example a level or
   * a configuration). An absent value leaves the column unwritten; `null`
   * is copied as `null`, so the column must be a number or text column of
   * a sheet List.
   */
  columns?: Record<WizardId, string>;
  /** A member whose value at `path` equals `equals` is left out (for example an optional one). */
  skipWhen?: { path: string; equals: WizardLiteral };
}

/**
 * The owner `expand` writes into `column` of each row: chosen per slot from
 * the eligible rows of `list` (automatic when only one qualifies), or
 * (`self`) the picked instance itself.
 */
export type WizardExpandOwner =
  | {
      list: WizardId;
      column: WizardId;
      label: WizardId;
      where?: { field: WizardId; equals: WizardLiteral };
      /**
       * A per-option owner filter: the option's catalog record holds at path
       * `option` the values allowed in owner row field `field` (`id` for the
       * row key). An option whose path is absent or `null` may go to any
       * owner; an owner the option does not allow is never offered, and one
       * named anyway is refused with nothing written.
       */
      match?: { option: string; field: WizardId };
    }
  | {
      /**
       * The picked row of `instancesFrom` (required) owns every row its
       * members expand to; nobody chooses it. Two rows that share a catalog
       * item each get their own set.
       */
      column: WizardId;
      self: true;
    };

/**
 * The built-in slot shape: `ref` is the catalog id the slot gives, and the
 * user may take any of its alternatives instead, all of the same exchange
 * value. `alternatives` lists catalog ids; `alternativesSharing`, a catalog
 * record path, adds after them every other catalog item whose value there
 * equals that of `ref`'s record (for example every item of the same price),
 * in catalog order. `quantity` defaults to 1.
 */
export interface WizardExpandSlot {
  id: WizardId;
  ref: WizardId;
  quantity?: number;
  alternatives?: WizardId[];
  alternativesSharing?: string;
}

/**
 * Catalog expansion: each unit of each member of each picked item becomes its
 * own row of `list`, keyed `[step, item id, occurrence, slot id, unit]` as a
 * JSON array (with `instancesFrom` the item id is the instance row id and the
 * occurrence 0; with `members` the slot id is the member's index). The keys
 * are the same on every run, so going back and changing an earlier step
 * re-derives the rows from the rows that step leaves. Every row is planned and
 * checked before anything is written or charged: a failure writes nothing.
 */
export interface WizardPickExpand {
  /** Item path to the member array. */
  from: string;
  catalog: WizardDataRef;
  list: WizardId;
  /** Column receiving the catalog id. */
  ref: WizardId;
  /**
   * Option record path to the id `ref` and `blueprint` store (a canonical
   * catalog id shared by price variants such as `server-self` and
   * `server-managed`); the option's own `id` still keys the choice, its cost
   * and the exchange. Every option must hold an id there. Absent, the
   * option's `id` is stored.
   */
  refPath?: string;
  /** Column receiving the slot's original catalog id when an alternative replaced it. */
  blueprint?: WizardId;
  /** Column → catalog record path; a `null` value is copied as `null` (see `WizardExpandMembers.columns`). */
  columns?: Record<WizardId, string>;
  /** Read members with library paths instead of the built-in slot shape. */
  members?: WizardExpandMembers;
  /** Literal columns written on every row (for example the owner's kind). */
  constants?: Record<WizardId, WizardLiteral>;
  owner?: WizardExpandOwner;
  exchange?: { balance: WizardId; path: string };
}

/**
 * Items that share the value at `path` are variants of one thing, such as
 * the levels of one trait; an item without a value there is a group of its
 * own. A pick takes at most one item of a group (not two levels, nor one
 * level twice), refused as `variant_repeated` before anything is written or
 * charged. A group whose items hold `true` at `repeatable` may be taken again
 * on the same screen (the same item twice needs `price.repeat`); with
 * `distinct`, the rows each occurrence of a group appends to `distinct.list`
 * must differ in `distinct.columns` (for example the configuration of each
 * repeat), else `variant_not_distinct` and nothing is written or charged.
 */
export interface WizardVariantGroups {
  path: string;
  repeatable?: string;
  distinct?: { list: WizardId; columns: WizardId[] };
}

export interface WizardPickStep extends WizardStepBase {
  /** Signed integer catalog prices. Negative prices credit the balance. */
  price?: {
    balance: WizardId;
    path: string;
    rebateLimit: number;
    repeat?: boolean;
    /**
     * The charge of an item listed at price 0 when another picked item has
     * a price, or when it is not the first such item: one zero-price item
     * stays free only while nothing else picked has a price. The order of
     * the picks does not change the total.
     */
    subsequentZero?: number;
    /**
     * A pick of two or more items needs one whose listed price (the number at
     * `path`, before `freeWhen`; a custom name's `countedCustom.price`) is not
     * 0: one free item may be taken alone, several free ones are refused
     * (`price_all_free`) with nothing written or charged.
     */
    severalNeedPriced?: boolean;
    freeWhen?: { path: string; equals: WizardLiteral };
  };
  /** Levels or variants of one thing among the items, and whether each may repeat. */
  variantGroups?: WizardVariantGroups;
  /** Offer one choice per owned instance, joined by its catalog reference. */
  instancesFrom?: WizardPickInstances;
  /** Members at `from` (by default `WizardExpandSlot`); each unit becomes its own row. */
  expand?: WizardPickExpand;
  /**
   * After a preceding step changes, offer this step's last inputs again as
   * suggestions: the picked ids still offered (each occurrence of a repeated
   * pick, up to `count.max`), custom names and texts that still fit, and the
   * `choices` (alternative, owner, grant variant or name) the step still asks
   * for and accepts on its new values; a choice of a vanished owner or item is
   * dropped. Nothing is written until the user completes the step.
   */
  retainInputs?: boolean;
  grants?: WizardSlotGrants;
  /** Custom names count alongside picked ids and provide {id,label} to apply. */
  countedCustom?: WizardCountedCustom;
  type: "pick";
  /** An array whose items each have a unique string `id`. */
  source: WizardDataRef;
  filter?: WizardPickFilter[];
  /** Defaults to exactly one. */
  count?: WizardPickCount;
  /** Automatic selection (returns an item id); with `presentation: "hidden"` no screen is shown. */
  select?: WizardFormula;
  /**
   * Takes every candidate, in order, with no input: for example every owned
   * row of `instancesFrom`, so each instance expands its own members. Only on
   * a hidden step, without `count`, `select`, `pickByRoll`, custom items or
   * `retainInputs`; `store` needs an id-list field. Inputs given to it are
   * refused (`input_unknown`). No candidate takes nothing.
   */
  selectAll?: true;
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
  display?: {
    label: string;
    description?: string;
    badges?: string[];
    /**
     * Item path to the item's detail reference: an opaque string the System
     * reads (e.g. a rules book section id). Optional per item; the path must
     * not be the candidate `id`, which `instancesFrom` replaces with the row id.
     */
    detail?: string;
    /** Item path to the URL of an image shown as the item's thumbnail. Optional per item. */
    icon?: string;
  };
  reference?: WizardPickReference;
  apply: WizardApplyOp[];
  /** See `WizardGenerateStep.rerollable`; applies to `pickByRoll`. */
  rerollable?: boolean;
}
