/**
 * Homebrew limits, a mirror of the database's (migration 174), which is the authority: real accounts
 * only, the same for every tier. String length, depth and file size stay `PACK_LIMITS` (the v1
 * schema enforces them).
 */
import { DND_KINDS } from "../../reference/tags";
import type { HomebrewItemKind } from "./types";

export const HOMEBREW_LIMITS = {
  /** Rows per account: entries, overlays and wizard rows all count. */
  items: 300,
  /** Total payload bytes per account. */
  bytes: 1_048_576,
  /** Largest single payload. */
  itemBytes: 131_072,
  /** Packs per account, across systems. */
  packs: 20,
} as const;

/** The `EffectivePacks` key of a homebrew pack: `homebrew/<pack uuid>`, never the user's `packId`. */
export const HOMEBREW_KEY_PREFIX = "homebrew/";

export const isHomebrewKey = (key: string | undefined): boolean => !!key?.startsWith(HOMEBREW_KEY_PREFIX);

export const homebrewKey = (packUuid: string): string => `${HOMEBREW_KEY_PREFIX}${packUuid}`;

/** Every row kind the database accepts: the v1 entry kinds plus `overlay` and `wizard`. */
export const HOMEBREW_ITEM_KINDS: readonly HomebrewItemKind[] = [...DND_KINDS, "overlay", "wizard"];

const ITEM_KINDS: ReadonlySet<string> = new Set(HOMEBREW_ITEM_KINDS);

export function isHomebrewItemKind(value: unknown): value is HomebrewItemKind {
  return typeof value === "string" && ITEM_KINDS.has(value);
}

/** Longest row key (`item_key`). */
export const HOMEBREW_KEY_MAX_CHARS = 260;

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * The bytes a payload takes as the database counts them, `octet_length(payload::text)`: jsonb's
 * text form puts a space after each `:` and `,`. An estimate for the client; the database decides.
 */
export function homebrewPayloadBytes(value: unknown): number {
  if (value === null || typeof value !== "object") {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : utf8Length(text);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? 4 : homebrewPayloadBytes(item)));
    return 2 + items.reduce((sum, bytes) => sum + bytes, 0) + Math.max(0, items.length - 1) * 2;
  }
  const members = Object.entries(value).filter(([, child]) => child !== undefined);
  const inner = members.reduce((sum, [key, child]) => sum + utf8Length(JSON.stringify(key)) + 2 + homebrewPayloadBytes(child), 0);
  return 2 + inner + Math.max(0, members.length - 1) * 2;
}
