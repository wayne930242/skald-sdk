/**
 * Shared vocabulary of the pure Fate engine (presets, roll, invoke, harm, lifecycle, advancement).
 * Nothing here reads storage, a clock, React, a table or a locale: callers inject IDs, timestamps
 * and randomness, then apply the returned deltas through their own `setData(previous => next)`.
 */

/** A command either yields its value or names why it was refused. */
export type FateVerdict<T, R extends string = string> =
  | ({ ok: true } & T)
  | { ok: false; reason: R; detail?: Readonly<Record<string, unknown>> };

export function refuse<R extends string>(reason: R, detail?: Readonly<Record<string, unknown>>): { ok: false; reason: R; detail?: Readonly<Record<string, unknown>> } {
  return detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };
}

/** IDs and the time a command was created. Generated outside any updater so a retry reuses them. */
export interface FateCommandContext {
  operationId: string;
  timestamp: string;
}

/** Kind of harm a hit deals; unified stress still needs it for extra mild eligibility. */
export type FateHitKind = "physical" | "mental";

export type FateFace = -1 | 0 | 1;
export type FateFaces = readonly [FateFace, FateFace, FateFace, FateFace];

export interface FateCite {
  /** Semantic section ID from scripts/fate-condensed/section-map.json. */
  rule: string;
  /** Line range in the vendored EN SRD. */
  srd: string;
  note?: string;
}

export const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
