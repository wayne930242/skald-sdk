"use client";

import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MovesListField } from "@skald/types/schema";
import type { useFieldSetter } from "../../../schema-context";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@skald/sheet-sdk/components/ui/dialog";
import { BookOpen } from "lucide-react";
import type { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { MoveStatBadge } from "./move-stat-badge";
import { getLocalizedText } from "./move-presentation";
import { DialogMovesList } from "./dialog-moves-list";
import type { MoveDialogState, MoveRollProps, MoveViewProps } from "./move-presentation";

interface MoveSelectionDialogProps extends MoveViewProps, MoveDialogState, MoveRollProps {
  field: MovesListField;
  selectedPlaybook: string | undefined;
  selectable: boolean;
  selectedPath: string;
  setValue: ReturnType<typeof useFieldSetter>;
  resolveI18n: ReturnType<typeof useSchemaI18n>["resolveI18n"];
}

export function MoveSelectionDialog({
  moves,
  selectedPlaybook,
  t,
  selectedMoves,
  adjustedMaxSelected,
  resolveI18n,
  field,
  editable,
  selectable,
  setValue,
  selectedPath,
  setDialogOpen,
  cardGridClass,
  viewMode,
  locale,
  rollContext,
  handleStatRoll,
  getStatLabel,
  dialogOpen,
}: MoveSelectionDialogProps) {
  if (moves.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-4 text-center">
        {selectedPlaybook
          ? t("movesList.noMovesInPlaybook")
          : t("movesList.selectPlaybookFirst")}
      </div>
    );
  }

  const selectedMoveDefs = moves.filter((move) =>
    selectedMoves.includes(move.id),
  );
  const canSelectInDialog =
    !adjustedMaxSelected || selectedMoves.length < adjustedMaxSelected;
  const dialogTitle = resolveI18n(field.label) || t("movesList.selected");
  const handleDialogToggleMove = (moveId: string) => {
    if (!editable || !selectable) return;

    const isSelected = selectedMoves.includes(moveId);
    if (isSelected) {
      setValue(
        selectedPath,
        selectedMoves.filter((id) => id !== moveId),
      );
      return;
    }

    if (adjustedMaxSelected === 1) {
      setValue(selectedPath, [moveId]);
      setDialogOpen(false);
      return;
    }

    if (!adjustedMaxSelected || selectedMoves.length < adjustedMaxSelected) {
      setValue(selectedPath, [...selectedMoves, moveId]);
    }
  };

  return (
    <div className="space-y-2">
      {selectedMoveDefs.length > 0 && (
        <div className={cardGridClass}>
          {selectedMoveDefs.map((move) => {
            const _isSelected = selectedMoves.includes(move.id);
            const _isDisabled = !editable;

            return (
              <div
                key={move.id}
                className={cn(
                  "break-inside-avoid border-b border-border/40",
                  viewMode === "web" ? "py-2 text-sm" : "py-1.5 text-xs",
                )}
              >
                <div className="font-medium flex items-center justify-between gap-1 mb-1">
                  <span>{getLocalizedText(move.name, locale)}</span>
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
              </div>
            );
          })}
        </div>
      )}

      {editable && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full print:hidden">
              <BookOpen className="h-4 w-4 mr-2" />
              {dialogTitle}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <DialogMovesList
              moves={moves}
              selectedMoves={selectedMoves}
              adjustedMaxSelected={adjustedMaxSelected}
              canSelectInDialog={canSelectInDialog}
              handleDialogToggleMove={handleDialogToggleMove}
              resolveI18n={resolveI18n}
              getLocalizedText={getLocalizedText}
              getStatLabel={getStatLabel}
              locale={locale}
            />
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
