import type { Schema, Template } from "@skald/types/schema";
import type { DSLConfig, SystemGameData, SystemMappings } from "@skald/types/system";

export interface BuiltinLocalSystemData {
  schema: Schema;
  template: Template;
  defaultData: Record<string, unknown>;
  mappings?: SystemMappings;
  gameData?: SystemGameData;
  dsl?: DSLConfig;
  /**
   * The field migration (`skald/field-migration/v1` or `/v2`) that upgrades
   * Characters from the previous built-in version. Omitted when there is none,
   * which keeps the template source and its hash unchanged.
   */
  fieldMigration?: unknown;
  /**
   * The Character Creation Wizard (`skald/wizard/v1`) the built-in template
   * publishes, validated against this System's game data and roll macros.
   * Omitted when there is none, which keeps the template source and its hash
   * unchanged.
   */
  wizard?: unknown;
  /** Optional second built-in template, with its own template macro source. */
  organization?: Pick<BuiltinLocalSystemData, "schema" | "template" | "defaultData" | "wizard"> & {
    macros?: unknown;
  };
}
