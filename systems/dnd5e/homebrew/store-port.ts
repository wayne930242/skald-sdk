/**
 * The host port behind "my homebrew" (IMPL §4): the user's homebrew packs and their rows for one
 * system. skald.tw binds it to its database (owner-only, real accounts); the SDK previewer and tests
 * bind the in-memory store (`testing/memory-store.ts`). Plugin code reaches storage only through it.
 */
import { defineHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { HomebrewItemKind, HomebrewItemRecord, HomebrewManifest, HomebrewPackRecord, HomebrewPayload } from "./domain/types";

/** Who is signed in: only an account may write (guests and visitors get `signIn`). */
export type HomebrewOwner = "account" | "guest" | "visitor";

export type HomebrewErrorCode =
  | "signIn" | "limitItems" | "limitBytes" | "limitPacks" | "duplicateKey"
  | "duplicatePackId" | "conflict" | "notFound" | "invalid" | "network";

export type HomebrewResult<T> = { ok: true; value: T } | { ok: false; error: HomebrewErrorCode; detail?: string };

export interface HomebrewUsage {
  items: number;
  bytes: number;
  packs: number;
}

export interface HomebrewItemSave {
  /** Absent: a new row. */
  id?: string;
  kind: HomebrewItemKind;
  key: string;
  payload: HomebrewPayload;
  /** The revision the editor read; a row changed since answers `conflict`. */
  expectedRevision?: number;
}

export interface HomebrewImport {
  manifest: HomebrewManifest;
  items: Array<{ kind: HomebrewItemKind; key: string; payload: HomebrewPayload }>;
  /** An own pack's uuid whose rows the import replaces; absent: a new pack. */
  replace?: string;
}

export type HomebrewPackPatch = Partial<Pick<HomebrewPackRecord, "name" | "notice" | "packVersion" | "enabled" | "position">>;

export interface DndHomebrewStore {
  owner(): Promise<HomebrewOwner>;
  /** This system's packs, by position. */
  listPacks(): Promise<HomebrewResult<HomebrewPackRecord[]>>;
  createPack(input: { packId: string; name: string; notice?: string }): Promise<HomebrewResult<HomebrewPackRecord>>;
  updatePack(id: string, patch: HomebrewPackPatch): Promise<HomebrewResult<HomebrewPackRecord>>;
  deletePack(id: string): Promise<HomebrewResult<void>>;
  /** The pack "save as homebrew" writes to: the first pack, created as "My homebrew" (localized) when there is none. */
  defaultPack(): Promise<HomebrewResult<HomebrewPackRecord>>;
  listItems(packUuid: string): Promise<HomebrewResult<HomebrewItemRecord[]>>;
  saveItem(packUuid: string, item: HomebrewItemSave): Promise<HomebrewResult<HomebrewItemRecord>>;
  deleteItem(id: string): Promise<HomebrewResult<void>>;
  /** All or nothing: a new pack with its rows, or an own pack's rows replaced. */
  importPack(input: HomebrewImport): Promise<HomebrewResult<HomebrewPackRecord>>;
  usage(): Promise<HomebrewResult<HomebrewUsage>>;
  /** Called after any write: the host refreshes this device's copy so the sheet and the editor preview see it. */
  refreshDevice?(): Promise<void>;
}

export const dndHomebrewStorePort = defineHostPort<DndHomebrewStore>("dnd5e.homebrewStore");
