"use client";

import * as React from "react";
import type { MovesListField, MoveDefinition } from "@skald/types/schema";
import {
  useFieldValue,
  useFieldSetter,
  useSchema,
  useViewMode,
} from "../../schema-context";
import type { FieldRendererProps } from "../../registry";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { buildRollExpression } from "@skald/sheet-sdk/modules/rolls";
import { getLocalizedText, type PlaybookData } from "./moves-list/move-presentation";
import { OtherPlaybookMoves } from "./moves-list/other-playbook-moves";
import { MoveSelectionDialog } from "./moves-list/move-selection-dialog";
import { InlineMoves } from "./moves-list/inline-moves";

export function MovesListFieldRenderer({
  field,
}: FieldRendererProps<MovesListField>) {
  const { locale, resolveI18n, t } = useSchemaI18n();
  const system = useSystemOptional();
  const selectedPlaybook = useFieldValue<string>("playbook");
  const { editable, data } = useSchema();
  const viewMode = useViewMode();
  const setValue = useFieldSetter();
  const rollContext = useRollOptional();

  // Use larger gaps in web mode for better readability
  const cardGridClass =
    viewMode === "web"
      ? "grid gap-3 grid-cols-1"
      : "grid gap-1.5 grid-cols-1";

  // State for "other-playbooks" mode
  const [viewingPlaybook, setViewingPlaybook] = React.useState<string | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Get localized stat label
  const getStatLabel = (stat: string | undefined) => {
    if (!stat) return "";
    // Try to get i18n label, fallback to stat id with capitalization
    const i18nLabel = resolveI18n(`{{i18n:field.${stat}}}`);
    // If resolveI18n returns the original key pattern, use capitalized stat
    if (i18nLabel.includes("{{i18n:")) {
      return stat.charAt(0).toUpperCase() + stat.slice(1);
    }
    return i18nLabel;
  };

  // Get condition modifiers for a move
  interface ConditionModifier {
    moveId: string;
    value: number;
  }
  interface ConditionData {
    id: string;
    name: { en: string; "zh-TW": string };
    modifiers?: ConditionModifier[];
  }

  interface ConditionEffect {
    conditionName: string;
    value: number;
  }

  const getConditionModifiers = React.useCallback(
    (moveId: string): { total: number; effects: ConditionEffect[] } => {
      const activeConditions = data.conditions as
        | Record<string, boolean>
        | undefined;
      if (!activeConditions) return { total: 0, effects: [] };

      const gameData = system?.gameData?.gameData as {
        conditions?: ConditionData[];
      };
      const conditions = gameData?.conditions ?? [];

      let total = 0;
      const effects: ConditionEffect[] = [];

      for (const condition of conditions) {
        if (activeConditions[condition.id] && condition.modifiers) {
          const modifier = condition.modifiers.find((m) => m.moveId === moveId);
          if (modifier) {
            total += modifier.value;
            effects.push({
              conditionName: getLocalizedText(condition.name, locale),
              value: modifier.value,
            });
          }
        }
      }
      return { total, effects };
    },
    [data.conditions, system, locale],
  );

  // Handle stat badge roll; `transformExpression` is the roll options' choice (a modifier)
  const handleStatRoll = async (
    stat: string,
    moveId: string,
    moveName: string,
    transformExpression?: (expression: string) => string,
  ) => {
    if (!rollContext) return;

    const statValue = (data[stat] as number) ?? 0;
    const { total: conditionModifier, effects } = getConditionModifiers(moveId);
    const context: Record<string, number> = { [stat]: statValue };

    // PbtA roll: 2d6 + stat + condition modifiers
    let expression = `2d6+{{@${stat}}}`;
    if (conditionModifier !== 0) {
      expression +=
        conditionModifier > 0
          ? `+${conditionModifier}`
          : `${conditionModifier}`;
    }

    // Add condition info to move name if there's a modifier
    let rollLabel = moveName;
    if (effects.length > 0) {
      const effectsStr = effects
        .map((e) => {
          const modStr = e.value > 0 ? `+${e.value}` : `${e.value}`;
          return `${e.conditionName} ${modStr}`;
        })
        .join(", ");
      rollLabel = `${moveName} (${effectsStr})`;
    }

    const built = buildRollExpression(expression);
    await rollContext.executeRoll(
      { expression: transformExpression ? transformExpression(built) : built },
      context,
      rollLabel,
    );
  };

  // Selected moves tracking
  const selectedPath = field.selectedPath || `${field.id}Selected`;
  const selectedMovesRaw = useFieldValue<string[]>(selectedPath);
  const selectedMoves = React.useMemo(
    () => selectedMovesRaw ?? [],
    [selectedMovesRaw],
  );

  // Growth advances tracking - for playbook moves, increase limit based on advances
  interface TakenAdvance {
    id: string;
    count: number;
  }
  const growthAdvancesRaw = useFieldValue<TakenAdvance[]>("growth.advances");
  const growthAdvances = React.useMemo(
    () => growthAdvancesRaw ?? [],
    [growthAdvancesRaw],
  );

  // Calculate adjusted max based on growth advances
  const adjustedMaxSelected = React.useMemo(() => {
    if (field.moveSource === "other-playbooks") {
      // For other-playbooks, max is based on newOtherMove advances
      const newOtherMoveCount =
        growthAdvances.find((a) => a.id === "newOtherMove")?.count ?? 0;
      return newOtherMoveCount;
    }

    if (!field.maxSelected) return undefined;
    if (field.moveSource !== "playbook") return field.maxSelected;

    // Count "newPlaybookMove" advances
    const newPlaybookMoveCount =
      growthAdvances.find((a) => a.id === "newPlaybookMove")?.count ?? 0;
    return field.maxSelected + newPlaybookMoveCount;
  }, [field.maxSelected, field.moveSource, growthAdvances]);

  // Get all playbooks (for other-playbooks mode)
  const allPlaybooks = React.useMemo(() => {
    if (!system?.gameData?.playbooks) return [];
    const playbooks = system.gameData.playbooks as {
      playbooks: PlaybookData[];
    };
    return playbooks.playbooks;
  }, [system]);

  // Get other playbooks (excluding current)
  const otherPlaybooks = React.useMemo(() => {
    return allPlaybooks.filter((p) => p.id !== selectedPlaybook);
  }, [allPlaybooks, selectedPlaybook]);

  // Get moves based on source
  const moves = React.useMemo(() => {
    if (field.moveSource === "custom" && field.moves) {
      return field.moves;
    }

    if (field.moveSource === "basic") {
      const gameData = system?.gameData?.gameData as {
        basicMoves?: MoveDefinition[];
      };
      return gameData?.basicMoves || [];
    }

    if (field.moveSource === "balance") {
      const gameData = system?.gameData?.gameData as {
        balanceMoves?: MoveDefinition[];
      };
      return gameData?.balanceMoves || [];
    }

    if (field.moveSource === "other-playbooks") {
      // Show moves from the currently viewed playbook (in dialog)
      if (viewingPlaybook) {
        const playbook = otherPlaybooks.find((p) => p.id === viewingPlaybook);
        return playbook?.moves || [];
      }
      // Return empty when no playbook is being viewed
      return [];
    }

    // Default: playbook moves
    if (selectedPlaybook && system?.gameData?.playbooks) {
      const playbooks = system.gameData.playbooks as {
        playbooks: PlaybookData[];
      };
      const playbook = playbooks.playbooks.find(
        (p) => p.id === selectedPlaybook,
      );
      return playbook?.moves || [];
    }

    return [];
  }, [
    field.moveSource,
    field.moves,
    selectedPlaybook,
    system,
    viewingPlaybook,
    otherPlaybooks,
  ]);

  const displayStyle = field.displayStyle ?? "cards";
  const selectable = field.selectable ?? false;
  const selectionUi = field.selectionUi ?? "inline";
  const useDialogSelection =
    selectable && selectionUi === "dialog" && field.moveSource !== "other-playbooks";

  // Selection logic
  const canSelectMore =
    !adjustedMaxSelected || selectedMoves.length < adjustedMaxSelected;

  const handleToggleMove = (moveId: string) => {
    if (!editable || !selectable) return;

    const isSelected = selectedMoves.includes(moveId);
    if (isSelected) {
      // Can deselect unless minSelected would be violated
      if (!field.minSelected || selectedMoves.length > field.minSelected) {
        setValue(
          selectedPath,
          selectedMoves.filter((id) => id !== moveId),
        );
      }
    } else if (canSelectMore) {
      setValue(selectedPath, [...selectedMoves, moveId]);
    }
  };

  // Get all selected moves with their playbook info (for other-playbooks mode)
  const selectedMovesWithPlaybook = React.useMemo(() => {
    if (field.moveSource !== "other-playbooks") return [];

    return selectedMoves
      .map((moveId) => {
        // Find which playbook this move belongs to
        for (const playbook of otherPlaybooks) {
          const move = playbook.moves.find((m) => m.id === moveId);
          if (move) {
            return { move, playbook };
          }
        }
        return null;
      })
      .filter(Boolean) as { move: MoveDefinition; playbook: PlaybookData }[];
  }, [field.moveSource, selectedMoves, otherPlaybooks]);
  const viewProps = { moves, selectedMoves, cardGridClass, viewMode, editable, locale, getStatLabel };
  const dialogProps = { dialogOpen, setDialogOpen, adjustedMaxSelected, t };
  const rollProps = { rollContext, handleStatRoll };

  if (field.moveSource === "other-playbooks") {
    return (
      <OtherPlaybookMoves
        {...viewProps}
        {...dialogProps}
        selectedMovesWithPlaybook={selectedMovesWithPlaybook}
        otherPlaybooks={otherPlaybooks}
        viewingPlaybook={viewingPlaybook}
        setViewingPlaybook={setViewingPlaybook}
        handleToggleMove={handleToggleMove}
      />
    );
  }

  if (useDialogSelection) {
    return (
      <MoveSelectionDialog
        {...viewProps}
        {...dialogProps}
        {...rollProps}
        field={field}
        selectedPlaybook={selectedPlaybook}
        selectable={selectable}
        selectedPath={selectedPath}
        setValue={setValue}
        resolveI18n={resolveI18n}
      />
    );
  }

  if (moves.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-4 text-center">
        {selectedPlaybook
          ? t("movesList.noMovesInPlaybook")
          : t("movesList.selectPlaybookFirst")}
      </div>
    );
  }

  return (
    <InlineMoves
      {...viewProps}
      {...rollProps}
      displayStyle={displayStyle}
      selectable={selectable}
      canSelectMore={canSelectMore}
      handleToggleMove={handleToggleMove}
    />
  );
}
