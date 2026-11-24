"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MoveDefinition } from "@skald/types/schema";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@skald/sheet-sdk/components/ui/dialog";
import { Check, BookOpen, X } from "lucide-react";
import { getLocalizedText } from "./move-presentation";
import type { MoveDialogState, MoveViewProps, PlaybookData } from "./move-presentation";

interface OtherPlaybookMovesProps extends MoveViewProps, MoveDialogState {
  selectedMovesWithPlaybook: { move: MoveDefinition; playbook: PlaybookData }[];
  otherPlaybooks: PlaybookData[];
  viewingPlaybook: string | null;
  setViewingPlaybook: React.Dispatch<React.SetStateAction<string | null>>;
  handleToggleMove: (moveId: string) => void;
}

export function OtherPlaybookMoves({
  adjustedMaxSelected,
  selectedMoves,
  selectedMovesWithPlaybook,
  cardGridClass,
  viewMode,
  editable,
  handleToggleMove,
  locale,
  dialogOpen,
  setDialogOpen,
  t,
  viewingPlaybook,
  otherPlaybooks,
  setViewingPlaybook,
  moves,
  getStatLabel,
}: OtherPlaybookMovesProps) {
  const canSelectMore =
    adjustedMaxSelected !== undefined &&
    selectedMoves.length < adjustedMaxSelected;
  const hasAdvances = (adjustedMaxSelected ?? 0) > 0;

  // Hide completely if no advances taken AND no moves selected
  if (!hasAdvances && selectedMovesWithPlaybook.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Show selected moves from other playbooks */}
      {selectedMovesWithPlaybook.length > 0 && (
        <div className={cardGridClass}>
          {selectedMovesWithPlaybook.map(({ move, playbook }) => (
            <div
              key={move.id}
              className={cn(
                "border rounded break-inside-avoid relative group",
                viewMode === "web" ? "p-3 text-sm" : "p-2 text-xs",
              )}
            >
              {/* Hover delete button */}
              {editable && (
                <button
                  onClick={() => handleToggleMove(move.id)}
                  className="absolute top-1 right-1 text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <div className="font-medium flex items-center justify-between gap-1 mb-1">
                <span>{getLocalizedText(move.name, locale)}</span>
                <Badge variant="secondary" className="text-2xs">
                  {getLocalizedText(playbook.name, locale)}
                </Badge>
              </div>
              <p className="text-muted-foreground leading-tight">
                {getLocalizedText(move.description, locale)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Button to open playbook selection dialog */}
      {editable && canSelectMore && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full print:hidden"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              {t("movesList.selectFromOtherPlaybook")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("movesList.otherPlaybookMoves")}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {!viewingPlaybook ? (
                // Playbook selection
                <div className="grid grid-cols-2 gap-2">
                  {otherPlaybooks.map((playbook) => (
                    <Button
                      key={playbook.id}
                      variant="outline"
                      className="h-auto py-3 justify-start"
                      onClick={() => setViewingPlaybook(playbook.id)}
                    >
                      <span className="font-medium">
                        {getLocalizedText(playbook.name, locale)}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                // Moves from selected playbook
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingPlaybook(null)}
                    className="mb-2"
                  >
                    ← {t("movesList.backToPlaybooks")}
                  </Button>
                  <div className="grid gap-1.5 grid-cols-1">
                    {moves.map((move) => {
                      const isSelected = selectedMoves.includes(move.id);
                      const isDisabled = !isSelected && !canSelectMore;

                      return (
                        <button
                          key={move.id}
                          type="button"
                          aria-pressed={isSelected}
                          disabled={isDisabled}
                          className={cn(
                            "border rounded p-2 text-xs text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-ring",
                            isSelected && "ring-2 ring-primary bg-primary/5",
                            !isSelected && !isDisabled && "hover:bg-muted/50",
                            isDisabled && "opacity-50 cursor-not-allowed",
                          )}
                          onClick={() => {
                            if (!isDisabled || isSelected) {
                              handleToggleMove(move.id);
                              if (!isSelected && canSelectMore) {
                                // Close dialog after selecting
                                setDialogOpen(false);
                                setViewingPlaybook(null);
                              }
                            }
                          }}
                        >
                          <span className="font-medium flex items-center justify-between gap-1 mb-1">
                            <span className="flex items-center gap-1">
                              {isSelected && (
                                <Check className="h-3 w-3 text-primary shrink-0" />
                              )}
                              {getLocalizedText(move.name, locale)}
                            </span>
                            {move.stat && (
                              <Badge
                                variant="outline"
                                className="text-2xs px-1 py-0"
                              >
                                {getStatLabel(move.stat)}
                              </Badge>
                            )}
                          </span>
                          <span className="block text-muted-foreground leading-tight">
                            {getLocalizedText(move.description, locale)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Selection count */}
    </div>
  );
}
