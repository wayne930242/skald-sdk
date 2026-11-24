"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MovesListField, MoveDefinition } from "@skald/types/schema";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Check } from "lucide-react";
import { MoveStatBadge } from "./move-stat-badge";
import { getLocalizedText } from "./move-presentation";
import type { MoveRollProps, MoveViewProps } from "./move-presentation";

interface InlineMovesProps extends MoveViewProps, MoveRollProps {
  displayStyle: NonNullable<MovesListField["displayStyle"]>;
  selectable: boolean;
  canSelectMore: boolean;
  handleToggleMove: (moveId: string) => void;
}

export function InlineMoves({
  displayStyle,
  moves,
  selectedMoves,
  editable,
  canSelectMore,
  viewMode,
  selectable,
  handleToggleMove,
  locale,
  rollContext,
  handleStatRoll,
  getStatLabel,
  cardGridClass,
}: InlineMovesProps) {
  const selecting = selectable && editable;

  // A selectable move's name is its toggle button; its ::after covers the card, so a press anywhere
  // on the card selects it, while the stat chip sits above it as a sibling button (BUAT-F005).
  const moveName = (move: MoveDefinition, isSelected: boolean, isDisabled: boolean): ReactNode => {
    const name = getLocalizedText(move.name, locale);
    if (!selecting) return name;
    return (
      <button
        type="button"
        data-move-select
        aria-pressed={isSelected}
        disabled={isDisabled}
        onClick={() => handleToggleMove(move.id)}
        className="cursor-pointer text-left after:absolute after:inset-0 focus-visible:outline-none disabled:cursor-default"
      >
        {name}
      </button>
    );
  };
  const selectCardClass = selecting && "relative has-[[data-move-select]:focus-visible]:ring-2 has-[[data-move-select]:focus-visible]:ring-ring";

  // The compact chips hold no stat chip: each chip is the move's toggle.
  const selectProps = (moveId: string, isSelected: boolean, isDisabled: boolean) => {
    if (!selectable || !editable) return {};
    const toggle = () => { if (!isDisabled) handleToggleMove(moveId); };
    return {
      role: "button",
      tabIndex: isDisabled ? -1 : 0,
      "aria-pressed": isSelected,
      "aria-disabled": isDisabled || undefined,
      onClick: toggle,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        if (!event.repeat) toggle();
      },
    };
  };

  // Render move card with optional selection - compact version
  const renderMoveCard = (move: MoveDefinition) => {
    const isSelected = selectedMoves.includes(move.id);
    const isDisabled = !editable || (!isSelected && !canSelectMore);

    return (
      <div
        key={move.id}
        className={cn(
          "border rounded break-inside-avoid",
          viewMode === "web" ? "p-3 text-sm" : "p-2 text-xs",
          selectCardClass,
          selectable && isSelected && "ring-2 ring-primary bg-primary/5",
          selectable && !isSelected && !isDisabled && "hover:bg-muted/50",
          selectable && isDisabled && "opacity-50",
        )}
      >
        <div className="font-medium flex items-center justify-between gap-1 mb-1">
          <span className="flex items-center gap-1">
            {selectable && isSelected && (
              <Check className="h-3 w-3 text-primary shrink-0" />
            )}
            {moveName(move, isSelected, isDisabled)}
          </span>
          {move.stat && (
            <MoveStatBadge
              moveName={getLocalizedText(move.name, locale)}
              statLabel={getStatLabel(move.stat)}
              canRoll={!!rollContext && move.stat !== "none"}
              onRoll={(transformExpression) =>
                handleStatRoll(move.stat!, move.id, getLocalizedText(move.name, locale), transformExpression)
              }
              className="text-2xs px-1 py-0 shrink-0"
              iconClassName="h-2.5 w-2.5 mr-0.5"
            />
          )}
        </div>
        <p className="text-muted-foreground leading-tight">
          {getLocalizedText(move.description, locale)}
        </p>
        {move.onHit && (
          <div className="mt-0.5 leading-tight">
            <span className="font-medium text-roll-extreme">10+: </span>
            {getLocalizedText(move.onHit, locale)}
          </div>
        )}
        {move.on7to9 && (
          <div className="leading-tight">
            <span className="font-medium text-roll-critical">7-9: </span>
            {getLocalizedText(move.on7to9, locale)}
          </div>
        )}
        {move.onMiss && (
          <div className="leading-tight">
            <span className="font-medium text-roll-fumble">6-: </span>
            {getLocalizedText(move.onMiss, locale)}
          </div>
        )}
      </div>
    );
  };

  if (displayStyle === "list") {
    return (
      <div className="space-y-2">
        {moves.map((move) => {
          const isSelected = selectedMoves.includes(move.id);
          const isDisabled = !editable || (!isSelected && !canSelectMore);

          return (
            <div
              key={move.id}
              className={cn(
                "p-3 border rounded-lg transition-colors",
                selectCardClass,
                selectable && isSelected && "ring-2 ring-primary bg-primary/5",
                selectable && !isSelected && !isDisabled && "hover:bg-muted/50",
                selectable && isDisabled && "opacity-50",
              )}
            >
              <div className="font-medium flex items-center gap-2">
                {selectable && isSelected && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
                {moveName(move, isSelected, isDisabled)}
                {move.stat && (
                  <MoveStatBadge
                    moveName={getLocalizedText(move.name, locale)}
                    statLabel={getStatLabel(move.stat)}
                    canRoll={!!rollContext && move.stat !== "none"}
                    onRoll={(transformExpression) =>
                      handleStatRoll(move.stat!, move.id, getLocalizedText(move.name, locale), transformExpression)
                    }
                    className="text-xs"
                    iconClassName="h-3 w-3 mr-1"
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {getLocalizedText(move.description, locale)}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  if (displayStyle === "compact") {
    return (
      <div className="flex flex-wrap gap-2">
        {moves.map((move) => {
          const isSelected = selectedMoves.includes(move.id);
          const isDisabled = !editable || (!isSelected && !canSelectMore);

          return (
            <Badge
              key={move.id}
              variant={isSelected ? "default" : "secondary"}
              className={cn(
                "py-1.5",
                selectable && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring",
                selectable && isDisabled && "opacity-50",
              )}
              {...selectProps(move.id, isSelected, isDisabled)}
            >
              {isSelected && <Check className="h-3 w-3 mr-1" />}
              {getLocalizedText(move.name, locale)}
            </Badge>
          );
        })}
      </div>
    );
  }

  // Default: cards - compact version with print support
  return (
    <div>
      <div className={cardGridClass}>{moves.map(renderMoveCard)}</div>
    </div>
  );
}
