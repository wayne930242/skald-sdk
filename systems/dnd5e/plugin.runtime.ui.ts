import type { SystemPluginRuntimeUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useDnd5eSheetAdapter } from "./sheet/dnd-sheet-adapter";

export const dnd5ePluginRuntimeUi: SystemPluginRuntimeUi = {
  sheetAdapters: { dnd5e: { useAdapter: useDnd5eSheetAdapter } },
};
