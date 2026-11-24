/**
 * What kind of plain (`simple`) roll a stored roll is, read from its dice alone.
 * Shared by the web roll card and the Discord roll card so both tell a Fate
 * roll from d6s the same way, including rows written before the notation said `dF`.
 */

/**
 * Whether this simple roll is a Fate `4dF` roll. Every face must be -1, 0 or +1,
 * and then it is Fate when
 *  - the notation names dF (`4dF`, `4dF+3`), which the bot and the web write; or
 *  - (legacy web rows, which wrote a 4dF as a d6) the notation is exactly `1d6`
 *    with an optional `±n`, and there are exactly 4 faces.
 * The faces alone never decide: d6s that came up 1 look the same as pluses, and
 * so would the dice of `1d20+1d6`. No notation means not Fate.
 */
export function isFateRoll(rolls: number[], notation?: string): boolean {
  if (rolls.length === 0 || !rolls.every((face) => face >= -1 && face <= 1)) return false;
  if (!notation) return false;
  if (/\dd[fF]|^\s*d[fF]/.test(notation)) return true;
  return rolls.length === 4 && /^\s*1d6\s*([+-]\s*\d+)?\s*$/i.test(notation);
}

/** The three PbtA tiers a 2d6 + stat total falls into, best first (ids from the systems' dsl-roll-rules). */
export const PBTA_TIERS = [
  { id: "strong", min: 10, max: null },
  { id: "weak", min: 7, max: 9 },
  { id: "miss", min: null, max: 6 },
] as const;

export type PbtaTierId = (typeof PBTA_TIERS)[number]["id"];

export function isPbtaTier(level: string | undefined): level is PbtaTierId {
  return level === "strong" || level === "weak" || level === "miss";
}
