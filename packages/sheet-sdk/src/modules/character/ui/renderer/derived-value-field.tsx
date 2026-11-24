"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Field } from "@skald/types/schema";
import type { FormulaValue } from "@skald/formula";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  SheetInput,
  type LabelPosition as SheetLabelPosition,
} from "@skald/sheet-sdk/modules/character/ui/fields";
import type { DerivedFormulaValue } from "./schema-context";
import { useFieldDisplay } from "./field-display";
import { useSheetMode } from "./sheet-mode";
import {
  StatTile,
  TileNumberInput,
  TileTextInput,
  getTileFractions,
  isTileDisplay,
} from "./stat-tile";

export interface DerivedValueFieldProps {
  field: Field;
  derived: DerivedFormulaValue;
  editable: boolean;
}

export function DerivedValueField({
  field,
  derived,
  editable,
}: DerivedValueFieldProps) {
  const t = useTranslations("renderer");
  const display = useFieldDisplay();
  const mode = useSheetMode();
  const [pending, setPending] = useState(false);
  const asTile = isTileDisplay(display, field.type, derived.resultType);
  const label = String(field.label || field.id);
  const labelPosition = ((field as { labelPosition?: string }).labelPosition ||
    "left") as SheetLabelPosition;
  const error = derived.issues.map((issue) => issue.message).join("\n");
  const canWrite = editable && !!derived.setOverride;

  const persistOverride = async (value: FormulaValue) => {
    if (!derived.setOverride) return;
    setPending(true);
    try {
      await derived.setOverride(value);
    } finally {
      setPending(false);
    }
  };

  const refresh = async () => {
    if (!derived.refresh) return;
    setPending(true);
    try {
      await derived.refresh();
    } finally {
      setPending(false);
    }
  };

  const refreshButton = derived.refresh ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={asTile ? "size-11 shrink-0" : "h-7 w-7 shrink-0 print:hidden"}
      disabled={!derived.hasOverride || pending}
      aria-label={t("refreshDerivedValue")}
      title={t("refreshDerivedValue")}
      onClick={() => void refresh()}
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </Button>
  ) : null;

  // views.web 的 display: "tile"：衍生值磚。編輯模式才能覆寫，並保留重新計算鈕。
  if (asTile) {
    const numeric = typeof derived.value === "number" ? derived.value : undefined;
    const valueText =
      derived.value === undefined || typeof derived.value === "boolean"
        ? ""
        : String(derived.value);
    const input =
      canWrite && mode === "edit" ? (
        derived.resultType === "number" ? (
          <TileNumberInput
            label={label}
            value={numeric}
            readOnly={pending}
            onChange={(value) => void persistOverride(value)}
          />
        ) : (
          <TileTextInput
            label={label}
            value={valueText}
            readOnly={pending}
            onChange={(value) => void persistOverride(value)}
          />
        )
      ) : undefined;

    return (
      <div
        data-derived-value="true"
        data-derived-overridden={derived.hasOverride ? "true" : "false"}
      >
        <StatTile
          fieldId={field.id}
          label={label}
          valueText={valueText}
          {...getTileFractions(
            field as { showHalf?: boolean; showFifth?: boolean },
            numeric,
          )}
          title={error || undefined}
          input={input}
          extra={mode === "edit" ? refreshButton : null}
        />
      </div>
    );
  }

  const valueControl =
    derived.resultType === "boolean" ? (
      <label className="flex h-9 min-w-[4.5rem] items-center justify-center gap-2 border-b">
        {labelPosition !== "hidden" && (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
        <input
          type="checkbox"
          checked={derived.value === true}
          disabled={!canWrite || pending}
          onChange={(event) => void persistOverride(event.target.checked)}
        />
      </label>
    ) : (
      <SheetInput
        type={derived.resultType === "number" ? "number" : "text"}
        label={label}
        labelPosition={labelPosition}
        variant="underline"
        inputSize="md"
        textAlign="center"
        value={
          typeof derived.value === "boolean" ? "" : (derived.value ?? "")
        }
        readOnly={!canWrite || pending}
        aria-invalid={derived.issues.length > 0}
        title={error || undefined}
        className={derived.issues.length > 0 ? "text-destructive" : "bg-muted/50"}
        onChange={(event) => {
          if (derived.resultType === "number") {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) void persistOverride(value);
            return;
          }
          void persistOverride(event.target.value);
        }}
      />
    );

  return (
    <div
      className="flex items-center gap-1"
      data-derived-value="true"
      data-derived-overridden={derived.hasOverride ? "true" : "false"}
    >
      <div className="min-w-0 flex-1">{valueControl}</div>
      {refreshButton}
    </div>
  );
}
