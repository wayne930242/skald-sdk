import type { ComponentType } from "react";

/**
 * The system contract of table setup (ADR 0016). A table's GM picks the template, a System's rule
 * choices and house rules once; players read them from the invite link and create their character
 * in the table. The host (`modules/table-setup`) owns storage, the setup page and the landing page;
 * a System plugs in through one `TableSetupProvider`, registered in `plugins/registry.table-setup.ts`.
 *
 * Nothing here touches Supabase or the environment: this is part of the sheet SDK boundary.
 */

/** The envelope schema of `table_setups.config`. */
export const TABLE_SETUP_SCHEMA = "skald/table-setup/v1";

/** `locked`: players cannot change it in the table's wizard or rule dialogs. `default`: prefilled, changeable (D1). */
export type TableSetupPolicy = "locked" | "default";

/**
 * `creation`: only shapes a new character (an ability method); later changes leave existing cards alone.
 * `ongoing`: a rule the card keeps using (a stress model); a change offers existing cards to apply it (D5).
 */
export type TableSetupScope = "creation" | "ongoing";

/** One choice and its policy, as a provider stores it in its config. */
export interface TableSetupValue<T = unknown> {
  readonly value: T;
  readonly policy: TableSetupPolicy;
}

/** A setup's stored config (`skald/table-setup/v1`). Each part is read by its owner, never by the host. */
export interface TableSetupConfig {
  readonly schema: typeof TABLE_SETUP_SCHEMA;
  /** Provider configs, keyed by `TableSetupProvider.id`. */
  readonly system?: Readonly<Record<string, unknown>>;
  /** Wizard presets and locks of a template that declares them (ADR 0011 extension, S3). */
  readonly wizard?: TableSetupWizardSeed;
  /** Allowed content sources: ids from the provider's `listSources`. */
  readonly sources?: readonly string[];
}

/** What a wizard run starts from at this table: variable and step presets with their policies. */
export interface TableSetupWizardSeed {
  readonly variables?: Readonly<Record<string, TableSetupValue>>;
  readonly steps?: Readonly<Record<string, TableSetupStepSeed>>;
}

export interface TableSetupStepSeed {
  /** A pick step's chosen option. */
  readonly choice?: string;
  /** A generate step's allowed methods. */
  readonly methods?: readonly string[];
  readonly policy?: TableSetupPolicy;
}

/** A value a provider could not read: unknown, retired, or out of range. It is reported, never rewritten. */
export interface TableSetupIssue {
  /** Where in the provider's config, as a dotted path. */
  readonly path: string;
  /** A message key in the provider's catalog. */
  readonly messageKey: string;
}

/** One line of a setup's summary, shown on the invite page and to the GM. Keys resolve in the provider's catalog. */
export interface TableSetupItem {
  readonly id: string;
  readonly labelKey: string;
  readonly valueLabelKey: string;
  /** Interpolation values for `valueLabelKey`. */
  readonly values?: Readonly<Record<string, string | number>>;
  readonly policy: TableSetupPolicy;
  readonly scope: TableSetupScope;
}

/** A published source or a category such as D&D's device-packs (players' own packs). Never an individual private pack. */
export interface TableContentSource {
  readonly id: string;
  readonly labelKey: string;
  /** Always allowed (the System's own SRD). */
  readonly required?: boolean;
}

/** A character's `data`. */
export type TableSetupCharacterData = Record<string, unknown>;

/** One item of an apply preview: what it changes on the card. */
export interface TableSetupChange {
  readonly itemId: string;
  readonly labelKey: string;
  readonly fromLabelKey?: string;
  readonly toLabelKey: string;
  readonly policy: TableSetupPolicy;
}

/** An item the card cannot take as it is, with the reason (for example, occupied stress boxes). */
export interface TableSetupBlock {
  readonly itemId: string;
  readonly labelKey: string;
  readonly reasonKey: string;
}

export interface TableSetupApplyResult {
  readonly data: TableSetupCharacterData;
  readonly changes: readonly TableSetupChange[];
  readonly blocked: readonly TableSetupBlock[];
}

/** Rules on a character, loaded only where a character is created or the apply prompt opens. */
export interface TableSetupCharacterRules<C> {
  /** A template without a wizard: write the setup onto the template's default data. */
  seedBlank?(config: C, defaultData: TableSetupCharacterData): TableSetupCharacterData;
  /** A wizard run's presets and locks. */
  wizardSeed?(config: C): TableSetupWizardSeed;
  /**
   * D5: a pure, previewable apply, item by item: each item applies whole or reports why not.
   * An empty `changes` means the card already follows the setup; the host then records the
   * revision without asking anyone.
   */
  apply?(config: C, data: TableSetupCharacterData, itemIds?: readonly string[]): TableSetupApplyResult;
}

export interface TableSetupCharacterRecipe {
  readonly id: string;
  readonly name: string;
  readonly location: "vault" | "table";
  /** The requested recipe, not the rest of the card. Absent storage is represented by null. */
  readonly recipe: unknown;
}

/** What a registered after-save hook is told: the table, and the revision the setup was just saved at. */
export interface TableSetupAfterSaveInput {
  readonly tableId: string;
  readonly revision: number;
}

/**
 * A hook's result. A failure carries a message already in the viewer's language; the host shows
 * it and the setup stays saved.
 */
export type TableSetupAfterSaveResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export type TableSetupAfterSaveHook = (input: TableSetupAfterSaveInput) => Promise<TableSetupAfterSaveResult>;

export interface TableSetupEditorProps<C> {
  /** The table this setup belongs to (ADR 0016 §after-save). */
  readonly tableId: string;
  /**
   * Registers work that follows a successful save of the setup, for content an editor keeps outside
   * the config (such as a copy to the table). The host runs the hooks in registration order, one at
   * a time; a hook's failure is shown and does not undo the save or stop the later hooks. Returns
   * the unregister function; register in an effect and unregister in its cleanup.
   */
  readonly registerAfterSave: (hook: TableSetupAfterSaveHook) => () => void;
  readonly config: C;
  readonly onChange: (config: C) => void;
  readonly disabled?: boolean;
  /** Reads the viewer's cards of this system, in the vault or at this table, on demand. */
  readonly listCharacterRecipes?: (recipePath: readonly [string, ...string[]]) => Promise<readonly TableSetupCharacterRecipe[]>;
}

/**
 * A System's table setup. `parse`, `summarize` and `listSources` are pure and ride the light
 * registry; the editor, the character rules and the catalog load on demand.
 */
export interface TableSetupProvider<C = unknown> {
  /** The key of this provider's part of `TableSetupConfig.system`. */
  readonly id: string;
  /** A source editor owns the envelope's allowlist instead of a System-specific object. */
  readonly configSlot?: "sources";
  readonly protocolVersion: 1;
  readonly systemSlugs: readonly string[];
  /** Read a stored config. Unknown or retired values are omitted and reported as issues, except unrecognized D&D source ids, which are ignored. */
  parse(raw: unknown): { readonly config: C; readonly issues: readonly TableSetupIssue[] };
  summarize(config: C): readonly TableSetupItem[];
  listSources?(): readonly TableContentSource[];
  loadEditor(): Promise<ComponentType<TableSetupEditorProps<C>>>;
  loadCharacterRules(): Promise<TableSetupCharacterRules<C>>;
  loadMessages(locale: string): Promise<Record<string, unknown>>;
}

/** What a System's sheet hands the host's apply prompt: its provider and the card it shows. */
export interface TableSetupApplyPromptProps {
  readonly provider: TableSetupProvider;
  readonly data: TableSetupCharacterData;
  /**
   * Writes the card through the sheet's own update path (a whole-record updater). The updater runs
   * synchronously, before `update` returns, on the card as the sheet holds it then (Skald's
   * character runtime does); one that does not run is treated as a write that did not happen.
   */
  readonly update: (updater: (data: TableSetupCharacterData) => TableSetupCharacterData) => void;
}

/**
 * A table copy's view of its table's setup (ADR 0016 §5), given by the host around the sheet. The
 * card's `data` stays the only runtime source: this only carries the locks (D1, D2) and the D5
 * prompt. Absent (null) for a vault sheet, a sheet outside a table, or a host without one.
 */
export interface TableSetupSheetPort {
  readonly tableId: string;
  /** The table's setup; null while it has none (or before it is read). */
  readonly setup: { readonly config: TableSetupConfig; readonly revision: number } | null;
  /** The setup revision this copy last applied or set aside; null for a copy brought into the table. */
  readonly appliedRevision: number | null;
  /**
   * Whether the setup's locks bind this viewer (D2: players cannot change a locked item). False for
   * those who set the table up, its owner and approved GM assistants, on any card of the table.
   */
  readonly locksApply: boolean;
  /**
   * The host's D5 prompt: shown when the setup moved past `appliedRevision` and the provider's
   * `apply` would change the card; dismissible, never blocking. A sheet mounts it for its editors.
   */
  readonly ApplyPrompt: ComponentType<TableSetupApplyPromptProps>;
}

/** `locked`: the player cannot change it. `default`: preset, changeable. An item without one is locked (D1). */
export type WizardSetupPolicy = "locked" | "default";

/**
 * The one reading of a stored item's policy, shared by the wizard seed, the setup page, the server
 * book-lock check and the sheet catalog filter: none is `locked` (D1), an unknown one undefined.
 */
export function readSetupPolicy(policy: unknown): WizardSetupPolicy | undefined {
  if (policy === undefined) return "locked";
  return policy === "locked" || policy === "default" ? policy : undefined;
}

/**
 * The wizard variables a setup locks for the table's players (`config.wizard`, policy `locked` or none),
 * with their values. A stored config is read as it is: anything malformed locks nothing.
 */
export function lockedWizardVariables(config: TableSetupConfig | null | undefined): Record<string, unknown> {
  const variables: unknown = config?.wizard?.variables;
  if (typeof variables !== "object" || variables === null || Array.isArray(variables)) return {};
  return Object.fromEntries(
    Object.entries(variables as Record<string, unknown>).flatMap(([id, item]) =>
      typeof item === "object" && item !== null && readSetupPolicy((item as { policy?: unknown }).policy) === "locked" && "value" in item
        ? [[id, (item as { value: unknown }).value]]
        : [],
    ),
  );
}
