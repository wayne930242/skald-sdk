// modules/rolls/ui/hooks/use-roll-handler.ts
"use client";

import { useCallback } from "react";
import { useRollOptional, type ExecuteRollOptions } from "../context/roll-context";
import type { RollConfig } from "@skald/dice/roll-expression";
import {
  buildRollExpression,
  type RollExpressionAdjustments,
} from "@skald/sheet-sdk/modules/rolls/domain/build-roll-expression";

interface UseRollHandlerOptions {
  system?: "coc7" | undefined;
}

/**
 * Hook that creates a roll handler for skill checks and attribute rolls.
 * Returns null if RollProvider is not present (non-session context).
 */
export function useRollHandler(options: UseRollHandlerOptions = {}) {
  const rollContext = useRollOptional();
  const { system = "coc7" } = options;

  const rollSkill = useCallback(
    async (
      skillName: string,
      targetValue: number,
      context: Record<string, number> = {},
      adjustments: RollExpressionAdjustments = {},
      options?: ExecuteRollOptions,
    ) => {
      if (!rollContext) return null;

      const expression = buildRollExpression(
        `${system}:1d100<={{@target}}`,
        adjustments,
      );
      const rollConfig: RollConfig = {
        expression,
        target: "session",
      };

      return rollContext.executeRoll(
        rollConfig,
        { ...context, target: targetValue },
        skillName,
        undefined,
        options,
      );
    },
    [rollContext, system],
  );

  const rollAttribute = useCallback(
    async (
      attrName: string,
      value: number,
      context: Record<string, number> = {},
      adjustments: RollExpressionAdjustments = {},
    ) => {
      if (!rollContext) return null;

      const expression = buildRollExpression(
        `${system}:1d100<={{@target}}`,
        adjustments,
      );
      const rollConfig: RollConfig = {
        expression,
        target: "session",
      };

      return rollContext.executeRoll(
        rollConfig,
        { ...context, target: value },
        attrName,
      );
    },
    [rollContext, system],
  );

  const rollExpression = useCallback(
    async (
      expression: string,
      context: Record<string, number>,
      label?: string,
      adjustments: RollExpressionAdjustments = {},
    ) => {
      if (!rollContext) return null;

      const rollConfig: RollConfig = {
        expression: buildRollExpression(expression, adjustments),
        target: "session",
      };

      return rollContext.executeRoll(rollConfig, context, label);
    },
    [rollContext],
  );

  if (!rollContext) return null;

  return {
    rollSkill,
    rollAttribute,
    rollExpression,
    isInSession: rollContext.isInSession,
  };
}
