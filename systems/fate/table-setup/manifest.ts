import type { TableSetupProvider } from "@skald/sheet-sdk/modules/systems";
import { FATE_TABLE_SETUP_ID, parseFateTableSetup, summarizeFateTableSetup, type FateTableSetupConfig } from "./config";

/**
 * Fate Condensed's table setup provider (ADR 0016 S2). Only `parse` and `summarize` load with the
 * registry; the editor, the character rules (with the preset catalog) and the catalog of names
 * load when used.
 */
export const fateTableSetupProvider: TableSetupProvider<FateTableSetupConfig> = {
  id: FATE_TABLE_SETUP_ID,
  protocolVersion: 1,
  systemSlugs: ["fate-condensed"],
  parse: parseFateTableSetup,
  summarize: summarizeFateTableSetup,
  loadEditor: () => import("./editor").then((module) => module.FateTableSetupEditor),
  loadCharacterRules: () => import("./character-rules").then((module) => module.loadFateTableSetupRules()),
  loadMessages: (locale) => import("./messages").then((module) => module.loadFateTableSetupMessages(locale)),
};
