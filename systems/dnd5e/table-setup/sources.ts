import type { TableContentSource } from "@skald/sheet-sdk/modules/systems";

export const SRD = "srd52";
export const DEVICE_PACKS = "device-packs";
/** 「GM 的自製內容」: the frozen copies the table's owner and GM assistants brought (ADR 0018, homebrew step 8). */
export const GM_HOMEBREW = "gm-homebrew";
export const sources: readonly TableContentSource[] = [
  { id: SRD, labelKey: "dndSources.srd", required: true },
  { id: DEVICE_PACKS, labelKey: "dndSources.device" },
  { id: GM_HOMEBREW, labelKey: "dndSources.gmHomebrew" },
];

/** Old tables predate source restrictions; explicit lists are allowlists. */
export function allowsDevicePacks(raw: unknown): boolean {
  return raw === undefined || (Array.isArray(raw) && raw.includes(DEVICE_PACKS));
}

/** Only an explicit list takes the GM's homebrew: old tables never had it. */
export function allowsGmHomebrew(raw: unknown): boolean {
  return Array.isArray(raw) && raw.includes(GM_HOMEBREW);
}

/** The sources in their fixed order: the SRD always, then each optional one that is on. */
export function allowedSources(device: boolean, gmHomebrew = false): string[] {
  return sources.filter((s) => s.required || (s.id === DEVICE_PACKS ? device : gmHomebrew)).map((s) => s.id);
}

/** A stored list, or none for an old table, as the allowlist it means; unknown ids are dropped. */
export function parseSources(raw: unknown): string[] {
  return allowedSources(allowsDevicePacks(raw), allowsGmHomebrew(raw));
}

/** The summary's value: the ticked sources, so the invite page names 「GM 的自製內容」. */
export function sourcesLabelKey(config: readonly string[]): string {
  const device = config.includes(DEVICE_PACKS);
  const gm = config.includes(GM_HOMEBREW);
  return device ? (gm ? "dndSources.deviceGm" : "dndSources.device") : gm ? "dndSources.gm" : "dndSources.srd";
}
