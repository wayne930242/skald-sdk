interface NormalizedDiceBoxRoll {
  rolls: number[];
  total: number;
}

/**
 * results[].total is already the authoritative value computed by
 * rollWithDiceParser (see modules/rolls/infrastructure/dice-box-bridge.ts), which correctly
 * applies keep/drop and exploding-dice rules on top of dice-box's real
 * physics rolls. This just flattens individual die values for display and
 * sums totals across multiple roll() calls, if any.
 */
export function normalizeDiceBoxRoll(
  results: DiceBoxResult[],
): NormalizedDiceBoxRoll {
  const rolls = results.flatMap((result) => result.rolls.map((die) => die.value));
  const total = results.reduce((sum, result) => sum + result.total, 0);
  return { rolls, total };
}

/**
 * 擲骰結果類型（來自 dice-box）
 */
export interface DiceBoxResult {
  notation: string;
  total: number;
  rolls: Array<{ value: number }>;
}
