import type { TableSetupProvider } from "@skald/sheet-sdk/modules/systems";
import { allowedSources, allowsDevicePacks, sources } from "./sources";

export const dndTableSetup: TableSetupProvider<string[]> = {
  id: "dnd5e-2024",
  protocolVersion: 1,
  systemSlugs: ["dnd5e-2024"],
  configSlot: "sources",
  listSources: () => sources,
  parse: (raw) => ({ config: allowedSources(allowsDevicePacks(raw)), issues: [] }),
  summarize: (config) => [{ id: "sources", labelKey: "dndSources.label", valueLabelKey: allowsDevicePacks(config) ? "dndSources.device" : "dndSources.srd", policy: "locked", scope: "creation" }],
  loadCharacterRules: async () => ({}),
  loadEditor: () => import("./editor").then((m) => m.SourceEditor),
  loadMessages: async (locale) => (locale === "zh-TW" ? await import("./zh-TW.json") : await import("./en.json")).default,
};
