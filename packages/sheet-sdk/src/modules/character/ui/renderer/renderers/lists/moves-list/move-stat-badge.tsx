"use client";

import { lazy, Suspense } from "react";
import { Dices } from "lucide-react";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { LoadFailureBoundary } from "@skald/sheet-sdk/modules/rolls/ui/dice/load-failure-boundary";

export interface MoveRollBadgeProps {
  moveName: string;
  statLabel: string;
  onRoll: (transformExpression?: (expression: string) => string) => void | Promise<void>;
  className: string;
  iconClassName: string;
}

// The rolling chip and its gesture load with the first moves list that rolls: a sheet without
// moves (CoC, D&D) never fetches them.
const MoveRollBadge = lazy(() => import("./move-roll-badge"));

/**
 * A move's stat chip. When the move rolls, the chip is its roll button with the gesture of every
 * sheet roll (B-022): a tap rolls 2d6 + stat at once; a long-press, a right-click or Shift+Enter
 * opens the options its system's roll rule registers (Avatar: a modifier). It sits above the
 * cover of the move's select button, beside it, and its name carries the visible stat.
 */
export function MoveStatBadge({ moveName, statLabel, canRoll, onRoll, className, iconClassName }: MoveRollBadgeProps & {
  canRoll: boolean;
}) {
  if (!canRoll) {
    return <Badge variant="outline" className={className}>{statLabel}</Badge>;
  }
  // Until it has loaded (or if it fails to), the chip shows as it will, without the press.
  const still = (
    <Badge variant="outline" className={className}>
      <Dices className={iconClassName} aria-hidden="true" />
      {statLabel}
    </Badge>
  );
  return (
    <LoadFailureBoundary fallback={still}>
      <Suspense fallback={still}>
        <MoveRollBadge moveName={moveName} statLabel={statLabel} onRoll={onRoll} className={className} iconClassName={iconClassName} />
      </Suspense>
    </LoadFailureBoundary>
  );
}
