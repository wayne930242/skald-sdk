import type { SpecializationOption } from "@skald/types/schema";

/**
 * Base value of a specialization option in an era: the era's entry in
 * `eraBaseValues` when the option has one, else its flat `baseValue`.
 */
export function resolveSpecializationBase(
  option: Pick<SpecializationOption, "baseValue" | "eraBaseValues">,
  era: string,
): number {
  return option.eraBaseValues?.[era] ?? option.baseValue;
}
