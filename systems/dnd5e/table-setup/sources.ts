import type { TableContentSource } from "@skald/sheet-sdk/modules/systems";

export const SRD = "srd52";
export const DEVICE_PACKS = "device-packs";
export const sources: readonly TableContentSource[] = [
  { id: SRD, labelKey: "dndSources.srd", required: true },
  { id: DEVICE_PACKS, labelKey: "dndSources.device" },
];

/** Old tables predate source restrictions; explicit lists are allowlists. */
export function allowsDevicePacks(raw: unknown): boolean {
  return raw === undefined || (Array.isArray(raw) && raw.includes(DEVICE_PACKS));
}

export function allowedSources(device: boolean): string[] {
  return sources.filter((s) => s.required || device).map((s) => s.id);
}
