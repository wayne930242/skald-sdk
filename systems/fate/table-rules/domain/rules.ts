import type { FateCharacterData } from "../../domain/character";
import { readFateResources } from "../../domain/normalize";

/** The table rules plugin and the systems it runs (supabase/migrations/163_fate_table_rules.sql). */
export const FATE_TABLE_PLUGIN_ID = "fate-condensed";
export const FATE_TABLE_PROTOCOL_VERSION = 1;
export const FATE_TABLE_SYSTEM_SLUGS: readonly string[] = ["fate-condensed"];

export interface FateWalletSeed {
  /** The wallet's first balance: the saved card's balance, else its refresh. */
  readonly fatePoints: number;
  /** The refresh a play session start tops the wallet up to. */
  readonly refresh: number;
}

/**
 * What enrolment seeds a wallet with, from the persisted card by the F1 legacy/default rules.
 * The server mirrors this in fate__seed_fate_points / fate__effective_refresh; rule-fixtures.json
 * holds the cases both run. After enrolment the wallet, not the card, is the balance.
 */
export function fateWalletSeed(data: FateCharacterData): FateWalletSeed {
  const resources = readFateResources(data);
  return { fatePoints: resources.fatePoints, refresh: resources.effectiveRefresh };
}

/** A play session start, once per PC and session: at least the refresh, never less than now. */
export function sessionStartBalance(available: number, refresh: number): number {
  return Math.max(available, refresh);
}

export type FateRuleResult<Value, Code extends string> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: Code };

/**
 * A compel answer. Accepting takes +1 from the rules' unlimited supply (not the GM pool);
 * refusing costs 1 and needs a point; the point leaves play rather than going to the pool.
 */
export function compelOutcome(
  available: number,
  accept: boolean,
): FateRuleResult<{ readonly available: number; readonly delta: 1 | -1 }, "insufficient"> {
  if (accept) return { ok: true, value: { available: available + 1, delta: 1 } };
  if (available < 1) return { ok: false, code: "insufficient" };
  return { ok: true, value: { available: available - 1, delta: -1 } };
}

/** The GM pool of a scene: one per PC in the confirmed roster, plus the NPC credits the GM adds. */
export function gmScenePool(rosterSize: number, npcCredits = 0): number {
  return rosterSize + npcCredits;
}

export interface FateDeferredCredit {
  readonly characterId: string;
  readonly beneficiaryKind: "pc" | "npc";
}

/**
 * Scene close: each PC's pending hostile-invoke credits go into its wallet; an NPC's become
 * credits the GM may add to a later scene's pool, once each.
 */
export function bookDeferredCredits(credits: readonly FateDeferredCredit[]): {
  readonly wallets: Readonly<Record<string, number>>;
  readonly npcCredits: readonly string[];
} {
  const wallets: Record<string, number> = {};
  const npcCredits: string[] = [];
  for (const credit of credits) {
    if (credit.beneficiaryKind === "pc") wallets[credit.characterId] = (wallets[credit.characterId] ?? 0) + 1;
    else npcCredits.push(credit.characterId);
  }
  return { wallets, npcCredits };
}

/** A paid invoke owes someone only when it is hostile and on another character's own aspect. */
export function hostileInvokePayee(
  aspect: { readonly kind: "scene" } | { readonly kind: "character"; readonly characterId: string },
  payerCharacterId: string | null,
  hostile: boolean,
): string | null {
  if (!hostile || aspect.kind !== "character" || aspect.characterId === payerCharacterId) return null;
  return aspect.characterId;
}
