import type { SystemPluginRuntimeUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useFateSheetAdapter } from "./sheet/fate-sheet-adapter";

export const fatePluginRuntimeUi: SystemPluginRuntimeUi = {
  sheetAdapters: { fate: { useAdapter: useFateSheetAdapter } },
};
