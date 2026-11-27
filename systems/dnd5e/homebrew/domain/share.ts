/**
 * Bringing a GM's homebrew into a table (ADR 0018, homebrew step 8): which rows a pick takes with
 * it, how the table's limits stand, and how each row on the table compares with its source. The
 * server copies the rows (`share_table_homebrew`, migration 188) and is the authority on limits;
 * this mirrors it for the picker. Pure: no React, Next, Supabase or environment.
 */
import { HOMEBREW_LIMITS } from "./limits";
import type { HomebrewItemKind, HomebrewItemRecord } from "./types";

/** Per table, across every sharer: the values `share_table_homebrew` enforces. */
export const TABLE_HOMEBREW_LIMITS = { items: HOMEBREW_LIMITS.items, bytes: HOMEBREW_LIMITS.bytes } as const;

/** The `EffectivePacks` key of one sharer's copy at a table. */
export const TABLE_HOMEBREW_KEY_PREFIX = "table/";

export const tableHomebrewKey = (tableId: string, sharedBy: string): string => `${TABLE_HOMEBREW_KEY_PREFIX}${tableId}/${sharedBy}`;

/** The table and sharer a key names, or null for any other pack key. */
export function parseTableHomebrewKey(key: string | undefined): { tableId: string; sharedBy: string } | null {
  if (!key?.startsWith(TABLE_HOMEBREW_KEY_PREFIX)) return null;
  const [tableId, sharedBy, ...rest] = key.slice(TABLE_HOMEBREW_KEY_PREFIX.length).split("/");
  return tableId && sharedBy && rest.length === 0 ? { tableId, sharedBy } : null;
}

/** Kinds a table never takes: wording over built-in entries (`overlay`) and ownerless import rows (`wizard`). */
const UNSHAREABLE: ReadonlySet<HomebrewItemKind> = new Set<HomebrewItemKind>(["overlay", "wizard"]);

export const isShareableKind = (kind: HomebrewItemKind): boolean => !UNSHAREABLE.has(kind);

/** Why a row joins a pick it was not ticked in. */
export type ShareReason = "classFeature" | "subclassFeature" | "parentClass" | "originFeat";

export interface ShareAddition {
  id: string;
  /** The row that brought it in (a picked row, or another addition). */
  by: string;
  reason: ShareReason;
}

/** A homebrew entry a shared row names (a text tag, a subclass's spell) that the share leaves out. */
export interface ShareLink {
  /** The shared row that names it. */
  from: string;
  /** The homebrew row it names. */
  to: string;
}

export interface ShareClosure {
  /** Every id the share sends: the picked ones in order, then the additions; each once, shareable only. */
  ids: string[];
  /** Rows added to the pick (shown as 「會一起分享」). */
  added: ShareAddition[];
  /** Picked ids that cannot be shared: unknown, or an overlay or wizard row. */
  refused: string[];
  /** Links to homebrew left out: a warning only, the share still works. */
  links: ShareLink[];
  /**
   * Rows that repeat an earlier row's kind and key (two packs can hold the same entry id): the
   * server refuses the later one (`share_table_homebrew`), so the share cannot be sent as it is.
   */
  duplicates: ShareDuplicate[];
}

/** Two rows of the share with one kind and key: `second` comes later in `ids`. */
export interface ShareDuplicate {
  first: string;
  second: string;
}

type Row = Pick<HomebrewItemRecord, "id" | "packUuid" | "kind" | "key" | "payload">;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** The rows of `kind` and `key`, the ones in `pack` first, then in the order given. */
function find(rows: readonly Row[], kind: HomebrewItemKind, key: string, pack: string): Row | undefined {
  return rows.find((r) => r.kind === kind && r.key === key && r.packUuid === pack) ?? rows.find((r) => r.kind === kind && r.key === key);
}

/** A row's rows that go with it, each with its reason. */
function companions(row: Row, rows: readonly Row[]): Array<{ row: Row; reason: ShareReason }> {
  const out: Array<{ row: Row; reason: ShareReason }> = [];
  const samePack = rows.filter((r) => r.packUuid === row.packUuid);
  if (row.kind === "class") {
    for (const r of samePack) if (r.kind === "classFeature" && r.key.startsWith(`${row.key}/`)) out.push({ row: r, reason: "classFeature" });
  }
  if (row.kind === "subclass") {
    for (const r of samePack) if (r.kind === "subclassFeature" && r.key.startsWith(`${row.key}/`)) out.push({ row: r, reason: "subclassFeature" });
    const parent = object(row.payload.entry?.meta).parent;
    const parentRow = typeof parent === "string" && parent ? find(rows, "class", parent, row.packUuid) : undefined;
    if (parentRow) out.push({ row: parentRow, reason: "parentClass" });
  }
  if (row.kind === "background") {
    const ref = object(object(row.payload.entry?.meta).originFeat).ref;
    const id = typeof ref === "string" && ref.startsWith("feat:") ? ref.slice("feat:".length) : "";
    const feat = id ? find(rows, "feat", id, row.packUuid) : undefined;
    if (feat) out.push({ row: feat, reason: "originFeat" });
  }
  return out;
}

const TAG = /\{@([a-zA-Z]+) ([^|}]+)/g;

/** 5etools tags whose name differs from the kind (lowercase). */
const TAG_KINDS: Readonly<Record<string, string>> = { race: "species" };

/** The `kind:name` pairs a row's text tags name, and a subclass's spells as `spell:<id>` refs. */
function namedRefs(row: Row): { tags: Array<[string, string]>; refs: string[] } {
  const tags: Array<[string, string]> = [];
  const text = JSON.stringify([row.payload.entry?.entries ?? [], row.payload.zhTW?.entries ?? []]);
  for (const match of text.matchAll(TAG)) {
    const tag = match[1].toLowerCase();
    tags.push([TAG_KINDS[tag] ?? tag, match[2].trim().toLowerCase()]);
  }
  const refs: string[] = [];
  if (row.kind === "subclass") {
    const spells = object(row.payload.entry?.meta).spells;
    for (const group of Array.isArray(spells) ? spells : []) {
      for (const ref of Array.isArray(object(group).refs) ? (object(group).refs as unknown[]) : []) if (typeof ref === "string") refs.push(ref);
    }
  }
  return { tags, refs };
}

/** The homebrew rows `row` names that `shared` leaves out. */
function linksOf(row: Row, rows: readonly Row[], shared: ReadonlySet<string>): ShareLink[] {
  const { tags, refs } = namedRefs(row);
  const out = new Set<string>();
  for (const [tag, name] of tags) {
    for (const other of rows) {
      if (other.kind.toLowerCase() !== tag) continue;
      const entry = other.payload.entry;
      if (!entry) continue;
      if (entry.name.toLowerCase() === name || entry.id.toLowerCase() === name || other.key.toLowerCase() === name) out.add(other.id);
    }
  }
  for (const ref of refs) {
    const [kind, id] = ref.split(":");
    const other = rows.find((r) => r.kind === kind && r.key === id);
    if (other) out.add(other.id);
  }
  return [...out].filter((id) => id !== row.id && !shared.has(id)).map((to) => ({ from: row.id, to }));
}

/**
 * What a pick of the viewer's own rows (`rows`: every homebrew row of the System, any pack) shares:
 * a class takes its class features, a subclass its features and its homebrew parent class (and so
 * that class's features), a background its homebrew origin feat. Text tags (`{@spell …}`) and a
 * subclass's spells that name left-out homebrew only warn (`links`).
 */
export function shareClosure(rows: readonly Row[], picked: readonly string[]): ShareClosure {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ids: string[] = [];
  const seen = new Set<string>();
  const refused: string[] = [];
  const added: ShareAddition[] = [];
  const queue: Row[] = [];
  for (const id of picked) {
    if (seen.has(id)) continue;
    const row = byId.get(id);
    if (!row || !isShareableKind(row.kind)) {
      if (!refused.includes(id)) refused.push(id);
      continue;
    }
    seen.add(id);
    ids.push(id);
    queue.push(row);
  }
  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const { row, reason } of companions(next, rows)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      ids.push(row.id);
      added.push({ id: row.id, by: next.id, reason });
      queue.push(row);
    }
  }
  const links = ids.flatMap((id) => linksOf(byId.get(id)!, rows, seen));
  const firstOf = new Map<string, string>();
  const duplicates: ShareDuplicate[] = [];
  for (const id of ids) {
    const row = byId.get(id)!;
    const slot = `${row.kind}\u0000${row.key}`;
    const first = firstOf.get(slot);
    if (first) duplicates.push({ first, second: id });
    else firstOf.set(slot, id);
  }
  return { ids, added, refused, links, duplicates };
}

/** One sharer's use of the table: rows and payload bytes (`table_homebrew_shares.item_count`, `payload_bytes`). */
export interface ShareUsage {
  items: number;
  bytes: number;
}

export interface ShareLimitCheck {
  /** The table's total after this share: the others' shares plus this one. */
  items: number;
  bytes: number;
  /** The first limit the total passes, as the server reports it; null within both. */
  over: "items" | "bytes" | null;
}

/**
 * The table's use if the viewer shares `rows` (their own rows, `bytes` as the database counts
 * them), with every other sharer's share as it stands (`others`): the server refuses the same.
 */
export function checkShareLimits(rows: readonly Pick<HomebrewItemRecord, "bytes">[], others: readonly ShareUsage[]): ShareLimitCheck {
  const items = rows.length + others.reduce((sum, share) => sum + share.items, 0);
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0) + others.reduce((sum, share) => sum + share.bytes, 0);
  const over = items > TABLE_HOMEBREW_LIMITS.items ? "items" : bytes > TABLE_HOMEBREW_LIMITS.bytes ? "bytes" : null;
  return { items, bytes, over };
}

/** A row on the table as its sharer's picker sees it: the source it was copied from. */
export interface SharedSource {
  sourceItemId: string;
  sourceRevision: number;
}

/** `current`: same revision as the source. `newer`: the source changed since (「有新版本」). `deleted`: the source is gone (「來源已刪除」). */
export type SharedStatus = "current" | "newer" | "deleted";

export function sharedStatus(shared: SharedSource, rows: readonly Pick<HomebrewItemRecord, "id" | "revision">[]): SharedStatus {
  const source = rows.find((r) => r.id === shared.sourceItemId);
  if (!source) return "deleted";
  return source.revision > shared.sourceRevision ? "newer" : "current";
}

export interface SharePlan {
  /** The ids to send: the source of every shared row still there (the server copies its current revision). */
  ids: string[];
  /** Shared rows whose source is gone: a new share leaves them out. */
  dropped: SharedSource[];
}

/**
 * 「更新到桌上」: the share that brings every row of the viewer's share to its source's current
 * revision. A share always replaces the whole set, so a row whose source was deleted cannot stay.
 */
export function refreshShare(shared: readonly SharedSource[], rows: readonly Pick<HomebrewItemRecord, "id">[]): SharePlan {
  const live = new Set(rows.map((r) => r.id));
  const ids: string[] = [];
  const dropped: SharedSource[] = [];
  for (const item of shared) {
    if (live.has(item.sourceItemId)) {
      if (!ids.includes(item.sourceItemId)) ids.push(item.sourceItemId);
    } else dropped.push(item);
  }
  return { ids, dropped };
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Shares in table order, the merge order at the table: the owner's first, then by when each was
 * first made (`created_at`), then by sharer.
 */
export function byShareOrder<T extends { sharedBy: string; createdAt: string }>(shares: readonly T[], ownerId: string | null): T[] {
  return [...shares].sort(
    (a, b) =>
      Number(b.sharedBy === ownerId) - Number(a.sharedBy === ownerId) ||
      compareText(a.createdAt, b.createdAt) ||
      compareText(a.sharedBy, b.sharedBy),
  );
}
