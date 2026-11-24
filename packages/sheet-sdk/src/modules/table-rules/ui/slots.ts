import type { ComponentType } from "react";
import type { AbstractIntlMessages } from "next-intl";
import type { TablePartySummary, TableRulesCharacterScope, TableRulesScope } from "../domain/contracts";

export interface TableRulesPluginUi {
  readonly tableWorkspace?: ComponentType<{ scope: TableRulesScope }>;
  /** Keep notices in this slot after changing tabs; deliver only to their authorized target. */
  readonly tableNotice?: ComponentType<{ scope: TableRulesScope }>;
  readonly sheetActions?: {
    readonly Actions?: ComponentType<{ scope: TableRulesCharacterScope }>;
    readonly SceneConfirm?: ComponentType<{ scope: TableRulesCharacterScope }>;
  };
  /** GM runners only; shown in the workspace if provided, otherwise above the session tabs. */
  readonly gmArea?: ComponentType<{ scope: TableRulesScope }>;
}

export type TableRulesUiSlot = keyof TableRulesPluginUi;

export interface TableRulesRegistration {
  readonly pluginId: string;
  readonly protocolVersion: number;
  readonly systemSlugs: readonly string[];
  /** The host mounts only these slots. An empty list never loads UI. */
  readonly slots: readonly TableRulesUiSlot[];
  load(): Promise<TableRulesPluginUi>;
  /** Pure selector entry: keep this import independent of the UI entry. */
  loadPartySummary?(): Promise<TablePartySummary>;
  /** The table rules catalog, shared by the UI slots and party summary labels. */
  loadMessages?(locale: string): Promise<AbstractIntlMessages>;
}

export type ResolveTableRules = (systemSlug: string | null) => TableRulesRegistration | undefined;

export interface MountedTableRules {
  readonly registration: TableRulesRegistration;
  readonly scope: TableRulesScope;
}
