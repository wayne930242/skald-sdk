import type { SystemConfig } from "@skald/types/system";
import type { SystemMessages, SystemPlugin } from "@skald/sheet-sdk/modules/systems";
import config from "@skald/system-dnd5e/data/dnd5e-2024/system.json";
import { loadDnd5e2024Data } from "./data-access/builtin-local-data";

/** Tier-A catalogs load on demand: about 20 KB gzip per locale is too much for every sheet and session first load. */
function loadDnd5e2024Messages(locale: string): Promise<SystemMessages> {
  return locale === "zh-TW"
    ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json").then((module) => module.default as SystemMessages)
    : import("@skald/system-dnd5e/data/dnd5e-2024/messages/en.json").then((module) => module.default as SystemMessages);
}

/**
 * D&D 5e (2024, SRD 5.2.1). Only system.json is static: the message catalogs, schema, template
 * and wizard game data load on demand, and the reference corpus is never reachable from here
 * (see reference/load-corpus.ts).
 */
export const dnd5ePlugin: SystemPlugin = {
  systems: {
    "dnd5e-2024": {
      config: config as SystemConfig,
      presentation: { icon: "dices", hue: 20 },
      loadBuiltinData: loadDnd5e2024Data,
      loadMessages: loadDnd5e2024Messages,
    },
  },
};
