/**
 * The fate point tray's coins, as pure data (direction B, coin form 「金屬硬幣」): one coin per
 * point of refresh capacity or point held, whichever is more. Held points within refresh are
 * `available`, held points above it `extra`, and refresh capacity not held `spent` (a hollow coin).
 */
export type FateCoinState = "available" | "extra" | "spent";

/**
 * How much of the coin is drawn: `full` (raised rim with notches, burst, knurled field) where a
 * coin is at least {@link FATE_COIN_FULL_MIN_PX} wide, `simple` (rim and burst) below, where the
 * knurl would blur into a smudge.
 */
export type FateCoinTier = "full" | "simple";

/** Coins drawn before the rest of the points held is summed up as `+N`. */
export const FATE_COIN_CAP = 5;
export const FATE_COIN_FULL_MIN_PX = 40;

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

export function fateCoinTier(px: number): FateCoinTier {
  return px >= FATE_COIN_FULL_MIN_PX ? "full" : "simple";
}

/**
 * The row of coins and the points held that did not fit (`hidden`). Hidden hollow capacity is not
 * counted: `+N` always means more points held, and the refresh label beside the row states the
 * capacity.
 */
export function fateCoinRow(fatePoints: number, refresh: number, cap: number = FATE_COIN_CAP): { coins: FateCoinState[]; hidden: number } {
  const held = count(fatePoints);
  const capacity = count(refresh);
  const total = Math.max(held, capacity);
  const shown = Math.min(total, cap);
  const coins = Array.from({ length: shown }, (_, index): FateCoinState => (index >= held ? "spent" : index >= capacity ? "extra" : "available"));
  return { coins, hidden: Math.max(0, held - shown) };
}

/**
 * A phone coin's width in px: 28 while the row holds up to four coins, 24 for a full row, so the
 * coins, `+N` and the refresh button still share one line on a 320 px phone. Desktops draw 40 px.
 */
export function fateCoinPhonePx(shown: number): 24 | 28 {
  return shown >= FATE_COIN_CAP ? 24 : 28;
}
