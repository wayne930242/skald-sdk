"use client";

import { useTranslations } from "next-intl";
import type { StatListColumn, StatListField } from "@skald/types/schema";
import { type RowSelector, type StatRow } from "../../../row-selectors";
import {
  StatTile,
  TileNumberInput,
  TileRollScope,
  getTileFractions,
} from "../../../stat-tile";
import { rollLabel, useRowRoll, useRowImproveTarget, type WriteRow } from "./stat-row-roll";

export function StatTileItem({
  field,
  selector,
  row,
  columns,
  editing,
  editable,
  onValue,
  onWriteLatest,
}: {
  field: StatListField;
  selector: RowSelector;
  row: StatRow;
  columns: StatListColumn[];
  editing: boolean;
  editable: boolean;
  onValue: (value: number) => void;
  onWriteLatest: WriteRow;
}) {
  const t = useTranslations("renderer");
  const { roll } = useRowRoll(field, selector, row);
  const label = rollLabel(row, t);
  const { rollKey, improveTarget } = useRowImproveTarget(row, editable, onWriteLatest);
  const fractions = getTileFractions(
    { showHalf: columns.includes("half"), showFifth: columns.includes("fifth") },
    row.value,
  );
  return (
    <TileRollScope roll={roll} label={label} rollKey={rollKey} improveTarget={improveTarget}>
      <StatTile
        label={label}
        valueText={String(row.value)}
        half={fractions.half}
        fifth={fractions.fifth}
        fieldId={row.id}
        input={
          editing ? (
            <TileNumberInput label={label} value={row.value} onChange={onValue} />
          ) : undefined
        }
      />
    </TileRollScope>
  );
}
