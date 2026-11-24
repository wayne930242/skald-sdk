"use client";

import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MoveDefinition } from "@skald/types/schema";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@skald/sheet-sdk/components/ui/tabs";
import { Check } from "lucide-react";
import { getLocalizedText } from "./move-presentation";

/** Render move card inside dialog */
function DialogMoveCard({
  move,
  isSelected,
  isDisabled,
  onToggle,
  locale,
  getStatLabel,
}: {
  move: MoveDefinition;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: (id: string) => void;
  locale: string;
  getStatLabel: (stat: string | undefined) => string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={isDisabled}
      className={cn(
        "border rounded p-2 text-xs text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-ring",
        isSelected && "ring-2 ring-primary bg-primary/5",
        !isSelected && !isDisabled && "hover:bg-muted/50",
        isDisabled && "opacity-50 cursor-not-allowed",
      )}
      onClick={() => onToggle(move.id)}
    >
      <span className="font-medium flex items-center justify-between gap-1 mb-1">
        <span className="flex items-center gap-1">
          {isSelected && (
            <Check className="h-3 w-3 text-primary shrink-0" />
          )}
          {getLocalizedText(move.name, locale)}
        </span>
        {move.stat && (
          <Badge variant="outline" className="text-2xs px-1 py-0">
            {getStatLabel(move.stat)}
          </Badge>
        )}
      </span>
      <span className="block text-muted-foreground leading-tight">
        {getLocalizedText(move.description, locale)}
      </span>
    </button>
  );
}

/** Dialog moves list with optional tab grouping */
export function DialogMovesList({
  moves,
  selectedMoves,
  adjustedMaxSelected,
  replaceSingle = true,
  canSelectInDialog,
  handleDialogToggleMove,
  resolveI18n,
  locale,
  getStatLabel,
}: {
  moves: MoveDefinition[];
  selectedMoves: string[];
  adjustedMaxSelected: number | undefined;
  replaceSingle?: boolean;
  canSelectInDialog: boolean;
  handleDialogToggleMove: (id: string) => void;
  resolveI18n: (s: string) => string;
  getLocalizedText: typeof getLocalizedText;
  getStatLabel: (stat: string | undefined) => string;
  locale: string;
}) {
  const hasGroups = moves.some((m) => m.group);

  const renderMoveCards = (movesToRender: MoveDefinition[]) => (
    <div className="grid gap-1.5 grid-cols-1">
      {movesToRender.map((move) => {
        const isSelected = selectedMoves.includes(move.id);
        const isDisabled =
          !isSelected &&
          adjustedMaxSelected !== undefined &&
          (!replaceSingle || adjustedMaxSelected !== 1) &&
          !canSelectInDialog;
        return (
          <DialogMoveCard
            key={move.id}
            move={move}
            isSelected={isSelected}
            isDisabled={isDisabled}
            onToggle={handleDialogToggleMove}
            locale={locale}
            getStatLabel={getStatLabel}
          />
        );
      })}
    </div>
  );

  if (!hasGroups) {
    return <div className="flex-1 overflow-auto">{renderMoveCards(moves)}</div>;
  }

  // Collect groups in order of first appearance
  const groupOrder: string[] = [];
  const grouped = new Map<string, MoveDefinition[]>();
  for (const move of moves) {
    const g = move.group || "_ungrouped";
    if (!grouped.has(g)) {
      groupOrder.push(g);
      grouped.set(g, []);
    }
    grouped.get(g)!.push(move);
  }

  return (
    <Tabs defaultValue={groupOrder[0]} className="flex-1 overflow-hidden flex flex-col">
      <TabsList className="w-full shrink-0">
        {groupOrder.map((groupId) => {
          const label =
            groupId !== "_ungrouped"
              ? resolveI18n(`{{i18n:moveGroup.${groupId}}}`)
              : groupId;
          return (
            <TabsTrigger key={groupId} value={groupId}>
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {groupOrder.map((groupId) => (
        <TabsContent key={groupId} value={groupId} className="overflow-auto">
          {renderMoveCards(grouped.get(groupId)!)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
