/**
 * The coin purse (plan-uat2 §3.5, SRD 5.2.1 p.89): CP 1/100, SP 1/10, EP 1/2, GP 1, PP 10 GP.
 * Pure: the purse dialog, the shop and their tests share it. No history is kept (D4 = A); each
 * action's toast offers 復原, which writes the purse back.
 */

export const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;
export type Coin = (typeof COINS)[number];
export type Purse = Record<Coin, number>;

/** Each coin's worth in copper pieces. */
export const COIN_CP: Readonly<Record<Coin, number>> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

/** "Fifty coins weigh a pound" (p.89). */
export const COINS_PER_POUND = 50;

const whole = (value: unknown): number => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : 0;
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

export function purseOf(values: Record<string, unknown>): Purse {
  return { cp: whole(values.cp), sp: whole(values.sp), ep: whole(values.ep), gp: whole(values.gp), pp: whole(values.pp) };
}

export function totalCp(purse: Purse): number {
  return COINS.reduce((sum, coin) => sum + purse[coin] * COIN_CP[coin], 0);
}

export function coinCount(purse: Purse): number {
  return COINS.reduce((sum, coin) => sum + purse[coin], 0);
}

export function coinWeight(purse: Purse): number {
  return coinCount(purse) / COINS_PER_POUND;
}

/** Income: the coins added as they came. */
export function addCoins(purse: Purse, add: Partial<Purse>): Purse {
  return Object.fromEntries(COINS.map((coin) => [coin, purse[coin] + whole(add[coin])])) as Purse;
}

/** `cp` as change in GP, SP and CP (the coins a merchant hands back). */
export function changeOf(cp: number): Purse {
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp - gp * 100) / 10);
  return { cp: cp - gp * 100 - sp * 10, sp, ep: 0, gp, pp: 0 };
}

/**
 * Pays `costCp`: lower coins first (as many of each as fit), then the smallest coin left that
 * covers the rest is broken and the change comes back as GP/SP/CP. Null when the purse is short.
 */
export function spend(purse: Purse, costCp: number): Purse | null {
  const cost = whole(costCp);
  if (totalCp(purse) < cost) return null;
  const next: Purse = { ...purse };
  let rest = cost;
  for (const coin of COINS) {
    const used = Math.min(next[coin], Math.floor(rest / COIN_CP[coin]));
    next[coin] -= used;
    rest -= used * COIN_CP[coin];
  }
  if (rest === 0) return next;
  // Every coin left is worth more than what is still owed (the pass above took the rest).
  const broken = COINS.find((coin) => next[coin] > 0 && COIN_CP[coin] >= rest);
  if (!broken) return null;
  next[broken] -= 1;
  return addCoins(next, changeOf(COIN_CP[broken] - rest));
}

/**
 * Exchanges `count` coins of `from` for `to` at the SRD rates. Going up takes exact multiples
 * only (12 SP do not make 1.2 GP): null when the count does not divide, or exceeds the purse.
 */
export function convert(purse: Purse, from: Coin, to: Coin, count: number): Purse | null {
  const amount = whole(count);
  if (amount === 0 || from === to || amount > purse[from]) return null;
  const value = amount * COIN_CP[from];
  if (value % COIN_CP[to] !== 0) return null;
  return { ...purse, [from]: purse[from] - amount, [to]: purse[to] + value / COIN_CP[to] };
}

/** The whole purse in GP, for 「約 N GP」 (two decimals at most). */
export function gpValue(cp: number): number {
  return Math.round(cp) / 100;
}

/** A price in its largest whole coin, the way the SRD tables print it: 7500 cp → 75 gp, 5 cp → 5 cp. */
export function priceCoin(cp: number): { amount: number; coin: Coin } {
  if (cp === 0) return { amount: 0, coin: "gp" };
  for (const coin of ["gp", "sp"] as const) {
    if (cp >= COIN_CP[coin] && cp % COIN_CP[coin] === 0) return { amount: cp / COIN_CP[coin], coin };
  }
  return { amount: cp, coin: "cp" };
}
