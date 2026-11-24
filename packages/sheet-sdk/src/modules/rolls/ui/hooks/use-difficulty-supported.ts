"use client";

import { rollRulesSupportDifficulty } from "@skald/dice";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";

/**
 * Whether the current system lets a player declare a difficulty (一般／困難／極難) for a check:
 * its roll rules judge one (`rollRulesSupportDifficulty`). Decided by the rule data, not the slug.
 */
export function useDifficultySupported(): boolean {
  const system = useSystemOptional();
  return rollRulesSupportDifficulty(system?.dsl?.rollRules);
}
