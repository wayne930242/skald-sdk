"use client";

/**
 * D&D 2024 content packs loaded from local files (docs/content-packs.md), kept in this tab's memory
 * only: nothing is stored or sent anywhere, and a reload clears them. The sheet reads them through
 * D&D's `dndPackSourcePort`, as Skald's sheet reads a player's packs; the previewer checks each file
 * with the same code as the `pack` command.
 */
import { useSyncExternalStore } from "react";
import type { PackErrorCode, PackReport, ValidatedPack } from "@skald/system-dnd5e/content-pack/domain/types";
import type { ValidateOpenPackDeps } from "@skald/system-dnd5e/content-pack/open/validate-open-pack";
import type { DndPackSource } from "@skald/system-dnd5e/sheet/pack-source-port";

export interface LoadedPack {
  /** The manifest's `name`. */
  name: string;
  /** The file it came from. */
  file: string;
  pack: ValidatedPack;
  report: PackReport;
}

export type AddPackResult = { ok: true; pack: LoadedPack } | { ok: false; error: PackErrorCode; detail?: string };

const NONE: readonly LoadedPack[] = [];
let packs: readonly LoadedPack[] = NONE;
const listeners = new Set<() => void>();

function publish(next: readonly LoadedPack[]) {
  packs = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The loaded packs, in priority order (the first supplies an entry two packs share). */
export function usePreviewPacks(): readonly LoadedPack[] {
  return useSyncExternalStore(subscribe, () => packs, () => NONE);
}

/** Changes whenever the loaded packs do: the sheet's key, so it mounts again and reads them. */
export function packsKey(loaded: readonly LoadedPack[]): string {
  return loaded.map(({ pack: { manifest } }) => `${manifest.packId}@${manifest.payloadSha256}`).join("|");
}

let deps: Promise<ValidateOpenPackDeps> | null = null;

/** The pack check's schema and built-in names, loaded with the first pack. */
function loadDeps(): Promise<ValidateOpenPackDeps> {
  deps ??= import("@skald/system-dnd5e/content-pack/open/load")
    .then(async ({ loadBuiltinIdentity, loadOpenPackSchemaCheck }) => {
      const [schema, identity] = await Promise.all([loadOpenPackSchemaCheck(), loadBuiltinIdentity()]);
      return { schema, builtinRefs: identity.refs, builtinNameKeys: identity.nameKeys };
    })
    .catch((error: unknown) => {
      deps = null;
      throw error;
    });
  return deps;
}

/** Checks a pack file and adds it; a pack with the same `packId` is replaced in its place. */
export async function addPackFile(file: File): Promise<AddPackResult> {
  const [{ validateOpenPackText }, checkDeps] = await Promise.all([
    import("@skald/system-dnd5e/content-pack/open/validate-open-pack"),
    loadDeps(),
  ]);
  const result = await validateOpenPackText(await file.text(), checkDeps);
  if (!result.ok) return result;
  const loaded: LoadedPack = { name: result.name, file: file.name, pack: result.pack, report: result.report };
  const at = packs.findIndex((item) => item.pack.manifest.packId === loaded.pack.manifest.packId);
  publish(at >= 0 ? packs.map((item, index) => (index === at ? loaded : item)) : [...packs, loaded]);
  return { ok: true, pack: loaded };
}

export function removePack(packId: string) {
  publish(packs.filter((item) => item.pack.manifest.packId !== packId));
}

async function view() {
  const { packsView } = await import("@skald/system-dnd5e/content-pack/open/view");
  return packsView(packs.map((item) => item.pack));
}

/** What the D&D sheet reads: the loaded packs as one view, and their names for the reference badge. */
export const previewerPackSource: DndPackSource = {
  readCached: view,
  revalidate: view,
  packNames: async () => Object.fromEntries(packs.map((item) => [item.pack.manifest.packId, item.name])),
};
