interface RollExpressionParts {
  systemPrefix: string;
  diceExpr: string;
  suffix: string;
}

export interface RollExpressionAdjustments {
  cocBonusDice?: number;
  flatModifier?: number;
  extraDice?: string;
}

const COMPARATORS = ["<=", ">=", "<", ">", "="] as const;

function splitExpression(expression: string): RollExpressionParts {
  const trimmed = expression.trim();
  const systemMatch = trimmed.match(/^([a-z0-9]+:)/i);
  const systemPrefix = systemMatch?.[1] ?? "";
  const withoutPrefix = systemPrefix ? trimmed.slice(systemPrefix.length) : trimmed;

  let diceExpr = withoutPrefix;
  let suffix = "";
  for (const comparator of COMPARATORS) {
    const index = withoutPrefix.indexOf(comparator);
    if (index > 0) {
      diceExpr = withoutPrefix.slice(0, index);
      suffix = withoutPrefix.slice(index);
      break;
    }
  }

  return {
    systemPrefix,
    diceExpr: diceExpr.trim(),
    suffix: suffix.trim(),
  };
}

function normalizeSignedTerm(term: string): string {
  const normalized = term.trim();
  if (!normalized) return "";
  if (normalized.startsWith("+") || normalized.startsWith("-")) return normalized;
  return `+${normalized}`;
}

export function buildRollExpression(
  baseExpression: string,
  adjustments: RollExpressionAdjustments = {},
): string {
  const parts = splitExpression(baseExpression);
  let diceExpr = parts.diceExpr;

  if (adjustments.cocBonusDice && /^1d100(?:[bp]\d+)?$/i.test(diceExpr)) {
    const amount = Math.abs(adjustments.cocBonusDice);
    if (amount > 0) {
      const sign = adjustments.cocBonusDice > 0 ? "b" : "p";
      diceExpr = "1d100";
      diceExpr += `${sign}${amount}`;
    }
  }

  if (adjustments.flatModifier && adjustments.flatModifier !== 0) {
    diceExpr += normalizeSignedTerm(String(adjustments.flatModifier));
  }

  if (adjustments.extraDice) {
    diceExpr += normalizeSignedTerm(adjustments.extraDice);
  }

  return `${parts.systemPrefix}${diceExpr}${parts.suffix}`;
}

