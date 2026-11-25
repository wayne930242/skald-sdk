/**
 * An in-memory `DndHomebrewStore` with the database's rules (migration 174): owner-only writes, the
 * account limits (`HOMEBREW_LIMITS`), unique keys, server-owned revisions, optimistic saves and an
 * all-or-nothing import. For tests and the SDK previewer; `snapshot`/`restore` let a host persist it.
 */
import { canonicalJson } from "../../content-pack/domain/canonical-json";
import { PACK_ID_PATTERN } from "../../content-pack/domain/limits";
import { HOMEBREW_KEY_MAX_CHARS, HOMEBREW_LIMITS, homebrewPayloadBytes, isHomebrewItemKind } from "../domain/limits";
import type { HomebrewItemKind, HomebrewItemRecord, HomebrewPackRecord, HomebrewPayload } from "../domain/types";
import { runHomebrewBatch } from "../store-port";
import type {
  DndHomebrewStore, HomebrewErrorCode, HomebrewImport, HomebrewItemSave, HomebrewOwner, HomebrewPackPatch, HomebrewResult, HomebrewUsage,
} from "../store-port";

export interface MemoryHomebrewState {
  packs: HomebrewPackRecord[];
  items: HomebrewItemRecord[];
}

export interface MemoryHomebrewOptions {
  owner?: HomebrewOwner;
  /** The name `defaultPack` creates; the host passes its localized "My homebrew". */
  defaultPackName?: string;
  limits?: Partial<Record<keyof typeof HOMEBREW_LIMITS, number>>;
  /** Starting rows, as `snapshot()` returned them. */
  initial?: MemoryHomebrewState;
  now?: () => string;
  uuid?: () => string;
  /** Called after every write that changed something (the host's device refresh). */
  onWrite?: () => void | Promise<void>;
}

export interface MemoryHomebrewStore extends DndHomebrewStore {
  setOwner(owner: HomebrewOwner): void;
  snapshot(): MemoryHomebrewState;
}

const ok = <T>(value: T): HomebrewResult<T> => ({ ok: true, value });
const fail = <T>(error: HomebrewErrorCode, detail?: string): HomebrewResult<T> => ({ ok: false, error, detail });
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const clone = <T>(value: T): T => structuredClone(value);

const DEFAULT_PACK_ID = "my-homebrew";

function defaultUuid(): string {
  return globalThis.crypto.randomUUID();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createMemoryHomebrewStore(options: MemoryHomebrewOptions = {}): MemoryHomebrewStore {
  let owner: HomebrewOwner = options.owner ?? "account";
  const limits: Record<keyof typeof HOMEBREW_LIMITS, number> = { ...HOMEBREW_LIMITS, ...options.limits };
  const now = options.now ?? (() => new Date().toISOString());
  const uuid = options.uuid ?? defaultUuid;
  let packs: HomebrewPackRecord[] = clone(options.initial?.packs ?? []);
  let items: HomebrewItemRecord[] = clone(options.initial?.items ?? []);

  // A batch writes through `saveItem` / `deleteItem` (so tests can wrap them) and notifies once at its end.
  let batching = false;
  const written = async () => {
    if (!batching) await options.onWrite?.();
  };
  const signedIn = () => owner === "account";
  const sortedPacks = () => [...packs].sort((a, b) => a.position - b.position || compare(a.id, b.id));
  const totalBytes = (rows: readonly HomebrewItemRecord[]) => rows.reduce((sum, row) => sum + row.bytes, 0);

  /** The row checks of the table: kind, key length, an object payload under the row cap. */
  function rowProblem(kind: unknown, key: unknown, payload: unknown): HomebrewErrorCode | null {
    if (!isHomebrewItemKind(kind) || typeof key !== "string" || key.length < 1 || key.length > HOMEBREW_KEY_MAX_CHARS) return "invalid";
    if (!isObject(payload) || homebrewPayloadBytes(payload) > limits.itemBytes) return "invalid";
    return null;
  }

  /** The account limits for the rows `next` would leave. */
  function limitProblem(next: readonly HomebrewItemRecord[], inserted: boolean): HomebrewErrorCode | null {
    if (inserted && next.length > limits.items) return "limitItems";
    if (totalBytes(next) > limits.bytes) return "limitBytes";
    return null;
  }

  function packProblem(fields: { packId: string; name: string; notice: string; packVersion: string }, except?: string): HomebrewErrorCode | null {
    if (!PACK_ID_PATTERN.test(fields.packId)) return "invalid";
    if (fields.name.length < 1 || fields.name.length > 200 || fields.notice.length > 20_000) return "invalid";
    if (fields.packVersion.length < 1 || fields.packVersion.length > 150) return "invalid";
    if (packs.some((pack) => pack.packId === fields.packId && pack.id !== except)) return "duplicatePackId";
    return null;
  }

  function bump(packUuid: string, at: string) {
    packs = packs.map((pack) => (pack.id === packUuid ? { ...pack, revision: pack.revision + 1, updatedAt: at } : pack));
  }

  function newPack(fields: { packId: string; name: string; notice: string; packVersion: string }, at: string): HomebrewPackRecord {
    const position = packs.reduce((max, pack) => Math.max(max, pack.position + 1), 0);
    return { id: uuid(), ...fields, position, enabled: true, revision: 1, updatedAt: at };
  }

  function newRow(packUuid: string, row: { kind: HomebrewItemKind; key: string; payload: HomebrewPayload }, at: string): HomebrewItemRecord {
    const payload = clone(row.payload);
    return { id: uuid(), packUuid, kind: row.kind, key: row.key, payload, revision: 1, bytes: homebrewPayloadBytes(payload), updatedAt: at };
  }

  const store: MemoryHomebrewStore = {
    async owner() {
      return owner;
    },

    setOwner(next) {
      owner = next;
    },

    snapshot() {
      return clone({ packs, items });
    },

    async listPacks() {
      return ok(signedIn() ? clone(sortedPacks()) : []);
    },

    async createPack(input) {
      if (!signedIn()) return fail("signIn");
      const fields = { packId: input.packId, name: input.name, notice: input.notice ?? "", packVersion: "1.0.0" };
      const problem = packProblem(fields);
      if (problem) return fail(problem);
      if (packs.length >= limits.packs) return fail("limitPacks");
      const pack = newPack(fields, now());
      packs = [...packs, pack];
      await written();
      return ok(clone(pack));
    },

    async updatePack(id, patch: HomebrewPackPatch) {
      if (!signedIn()) return fail("signIn");
      const pack = packs.find((candidate) => candidate.id === id);
      if (!pack) return fail("notFound");
      const next = { ...pack, ...patch };
      const problem = packProblem(next, id);
      if (problem) return fail(problem);
      if (!Number.isInteger(next.position) || next.position < 0) return fail("invalid");
      const changed = (["name", "notice", "packVersion", "enabled"] as const).some((key) => next[key] !== pack[key]);
      const updated = { ...next, revision: pack.revision + (changed ? 1 : 0), updatedAt: now() };
      packs = packs.map((candidate) => (candidate.id === id ? updated : candidate));
      await written();
      return ok(clone(updated));
    },

    async deletePack(id) {
      if (!signedIn()) return fail("signIn");
      if (!packs.some((pack) => pack.id === id)) return fail("notFound");
      packs = packs.filter((pack) => pack.id !== id);
      items = items.filter((item) => item.packUuid !== id);
      await written();
      return ok(undefined);
    },

    async defaultPack() {
      if (!signedIn()) return fail("signIn");
      const first = sortedPacks()[0];
      if (first) return ok(clone(first));
      let packId = DEFAULT_PACK_ID;
      for (let suffix = 2; packs.some((pack) => pack.packId === packId); suffix += 1) packId = `${DEFAULT_PACK_ID}-${suffix}`;
      return store.createPack({ packId, name: options.defaultPackName ?? "My homebrew" });
    },

    async listItems(packUuid) {
      if (!signedIn()) return ok([]);
      if (!packs.some((pack) => pack.id === packUuid)) return fail("notFound");
      const rows = items.filter((item) => item.packUuid === packUuid).sort((a, b) => compare(a.kind, b.kind) || compare(a.key, b.key));
      return ok(clone(rows));
    },

    async saveItems(pack, batch, progress) {
      batching = true;
      try {
        return await runHomebrewBatch(batch, (row) => store.saveItem(pack, row), (id) => store.deleteItem(id), progress);
      } finally {
        batching = false;
        await written();
      }
    },
    async saveItem(packUuid, input: HomebrewItemSave) {
      if (!signedIn()) return fail("signIn");
      if (!packs.some((pack) => pack.id === packUuid)) return fail("notFound");
      const problem = rowProblem(input.kind, input.key, input.payload);
      if (problem) return fail(problem);
      const clash = items.find((item) => item.packUuid === packUuid && item.kind === input.kind && item.key === input.key && item.id !== input.id);
      if (clash) return fail("duplicateKey");
      const at = now();
      if (input.id === undefined) {
        const row = newRow(packUuid, input, at);
        const next = [...items, row];
        const limit = limitProblem(next, true);
        if (limit) return fail(limit);
        items = next;
        bump(packUuid, at);
        await written();
        return ok(clone(row));
      }
      const current = items.find((item) => item.id === input.id && item.packUuid === packUuid);
      if (!current) return fail("notFound");
      if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) return fail("conflict");
      const payload = clone(input.payload);
      const changed = canonicalJson(payload) !== canonicalJson(current.payload);
      const row: HomebrewItemRecord = {
        ...current, kind: input.kind, key: input.key, payload, bytes: homebrewPayloadBytes(payload),
        revision: current.revision + (changed ? 1 : 0), updatedAt: at,
      };
      const next = items.map((item) => (item.id === row.id ? row : item));
      const limit = limitProblem(next, false);
      if (limit) return fail(limit);
      items = next;
      if (changed) bump(packUuid, at);
      await written();
      return ok(clone(row));
    },

    async deleteItem(id) {
      if (!signedIn()) return fail("signIn");
      const row = items.find((item) => item.id === id);
      if (!row) return fail("notFound");
      items = items.filter((item) => item.id !== id);
      bump(row.packUuid, now());
      await written();
      return ok(undefined);
    },

    async importPack(input: HomebrewImport) {
      if (!signedIn()) return fail("signIn");
      const fields = { ...input.manifest };
      const replaced = input.replace !== undefined ? packs.find((pack) => pack.id === input.replace) : undefined;
      if (input.replace !== undefined && !replaced) return fail("notFound");
      const problem = packProblem(fields, replaced?.id);
      if (problem) return fail(problem);
      if (!replaced && packs.length >= limits.packs) return fail("limitPacks");
      const keys = new Set<string>();
      for (const row of input.items) {
        const rowError = rowProblem(row.kind, row.key, row.payload);
        if (rowError) return fail(rowError, `${row.kind}:${row.key}`);
        const key = `${row.kind}\n${row.key}`;
        if (keys.has(key)) return fail("duplicateKey", `${row.kind}:${row.key}`);
        keys.add(key);
      }
      const at = now();
      const pack: HomebrewPackRecord = replaced
        ? { ...replaced, ...fields, revision: replaced.revision + 1, updatedAt: at }
        : newPack(fields, at);
      const rows = input.items.map((row) => newRow(pack.id, row, at));
      const next = [...items.filter((item) => item.packUuid !== pack.id), ...rows];
      const limit = limitProblem(next, rows.length > 0);
      if (limit) return fail(limit);
      items = next;
      packs = replaced ? packs.map((candidate) => (candidate.id === pack.id ? pack : candidate)) : [...packs, pack];
      await written();
      return ok(clone(pack));
    },

    async usage(): Promise<HomebrewResult<HomebrewUsage>> {
      if (!signedIn()) return ok({ items: 0, bytes: 0, packs: 0 });
      return ok({ items: items.length, bytes: totalBytes(items), packs: packs.length });
    },

    async refreshDevice() {
      await written();
    },
  };
  return store;
}
