import type { CoC7eSuccessLevel, CheckResult } from "./types";
import { rollD100 } from "./roller";

/**
 * Determine CoC 7e success level for a roll against a target
 *
 * @param rolled - The d100 roll result (1-100, where 00 = 100)
 * @param target - The target value (skill or attribute value)
 * @returns The success level
 */
export function getSuccessLevel(rolled: number, target: number): CoC7eSuccessLevel {
  // Normalize: 00 on dice = 100
  const normalizedRoll = rolled === 0 ? 100 : rolled;

  // Calculate thresholds
  const half = Math.floor(target / 2);
  const fifth = Math.floor(target / 5);

  // Check for fumble first
  // 技能不到 50 時擲出 96~00 為大失敗
  // 技能 50 以上時擲出 00 (100) 為大失敗
  if (target < 50 && normalizedRoll >= 96) {
    return "fumble";
  }
  if (normalizedRoll === 100) {
    return "fumble";
  }

  // Check for critical
  // 擲出 1（不包含技能只有 1 的情況）
  if (normalizedRoll === 1 && target > 1) {
    return "critical";
  }

  // Check for success levels (must be <= target)
  if (normalizedRoll <= target) {
    // Extreme: <= 1/5 of target
    if (normalizedRoll <= fifth) {
      return "extreme";
    }
    // Hard: <= 1/2 of target
    if (normalizedRoll <= half) {
      return "hard";
    }
    // Regular: <= target
    return "regular";
  }

  // Otherwise it's a failure
  return "failure";
}

/**
 * Alias for getSuccessLevel for compatibility with task specifications.
 * Calculate CoC 7e success level for a skill/attribute check.
 */
export const calculateSuccessLevel = getSuccessLevel;

/**
 * Perform a CoC skill/attribute check
 */
export function performCheck(target: number): CheckResult {
  const rolled = rollD100();
  const successLevel = getSuccessLevel(rolled, target);
  const isSuccess = ["critical", "extreme", "hard", "regular"].includes(
    successLevel,
  );

  return {
    target,
    targetHalf: Math.floor(target / 2),
    targetFifth: Math.floor(target / 5),
    rolled,
    successLevel,
    isSuccess,
    margin: target - rolled,
  };
}
