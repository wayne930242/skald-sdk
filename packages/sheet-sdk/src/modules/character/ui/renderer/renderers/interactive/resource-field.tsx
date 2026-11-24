// modules/character/ui/renderer/renderers/interactive/resource-field.tsx
//
// `resource`：目前值＋選填的上限與起始值。三種顯示：
// - stepper（預設）：− 值 ＋，按鈕 44px，進度條。
// - meter（`FieldReference.display: "meter"`）：迷你量表，點開底部 Sheet 用步進器調整。
// - print：0–N 刻度並圈出目前值，或「目前／上限／起始」三個寫字格。
//
// 目前值存在 `current` 路徑（預設 `<id>.current`）；上限與起始值是固定數字或衍生值。
// 比例以 `--res-ratio`、警戒帶以 `data-res-band` 輸出給主題 CSS。
"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ResourceField } from "@skald/types/schema";
import {
  useDerivedFormulaValue,
  useFieldBlur,
  useFieldSetter,
  useFieldValue,
  useSchemaStatic,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { useFieldDisplay } from "@skald/sheet-sdk/modules/character/ui/renderer/field-display";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@skald/sheet-sdk/components/ui/sheet";
import { initialResourceValue } from "@skald/sheet-sdk/modules/character/domain/sheets/follow-resource";
import {
  clampResource,
  resolveResourceSource,
  resourceBand,
  resourceCurrentPath,
  resourceRatio,
  stepResource,
} from "@skald/sheet-sdk/modules/character/domain/sheets/resource";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import "./resource-field.css";

type Translate = ReturnType<typeof useTranslations>;

function derivedSourceId(source: ResourceField["max"]): string {
  return typeof source === "object" && source !== null ? source.from : "";
}

interface ResourceState {
  label: string;
  current: number;
  max: number | undefined;
  start: number | undefined;
  step: number;
  editable: boolean;
  commit: (value: number) => void;
}

function useResourceState(field: ResourceField): ResourceState {
  const { editable } = useSchemaStatic();
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const path = resourceCurrentPath(field);
  const stored = useFieldValue<unknown>(path);
  const maxDerived = useDerivedFormulaValue(derivedSourceId(field.max));
  const startDerived = useDerivedFormulaValue(derivedSourceId(field.start));

  const max = resolveResourceSource(field.max, () => maxDerived?.value);
  const start = resolveResourceSource(field.start, () => startDerived?.value);
  // 還沒存過目前值的新角色：先顯示起始值（沒有則上限），第一次調整才寫入
  const current =
    typeof stored === "number" && Number.isFinite(stored)
      ? stored
      : (initialResourceValue({ max, start }) ?? 0);
  const step =
    typeof field.step === "number" && field.step > 0 ? field.step : 1;

  const commit = React.useCallback(
    (value: number) => {
      setValue(path, clampResource(value, max));
      onBlur?.();
    },
    [setValue, onBlur, path, max],
  );

  return {
    label: String(field.label || field.id),
    current,
    max,
    start,
    step,
    editable,
    commit,
  };
}

function valueName(t: Translate, state: ResourceState): string {
  return state.max === undefined
    ? t("resourceValueNoMax", { label: state.label, current: state.current })
    : t("resourceValue", {
        label: state.label,
        current: state.current,
        max: state.max,
      });
}

function rootProps(field: ResourceField, state: ResourceState) {
  const ratio = resourceRatio(state.current, state.max);
  const style = (
    ratio === undefined ? {} : { "--res-ratio": String(ratio) }
  ) as React.CSSProperties;
  return {
    "data-resource-id": field.id,
    "data-res-band": resourceBand(ratio),
    style,
  };
}

function ResourceBar() {
  return (
    <div className="skald-resource-bar" aria-hidden="true">
      <i />
    </div>
  );
}

function Value({ state }: { state: ResourceState }) {
  return (
    <>
      <b className="skald-resource-current">{state.current}</b>
      {state.max !== undefined && (
        <span className="skald-resource-max">/ {state.max}</span>
      )}
    </>
  );
}

/** − 值 ＋；鍵盤：↑→ + 加、↓← − 減、Home 歸零、End 填滿 */
function Stepper({ state }: { state: ResourceState }) {
  const t = useTranslations("renderer");
  const { label, current, max, step, editable, commit } = state;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!editable) return;
    const key = event.key;
    if (key === "ArrowUp" || key === "ArrowRight" || key === "+" || key === "=") {
      commit(stepResource(current, 1, step, max));
    } else if (key === "ArrowDown" || key === "ArrowLeft" || key === "-") {
      commit(stepResource(current, -1, step, max));
    } else if (key === "Home") {
      commit(0);
    } else if (key === "End" && max !== undefined) {
      commit(max);
    } else {
      return;
    }
    event.preventDefault();
  };

  const value = (
    <div
      role="spinbutton"
      tabIndex={0}
      aria-label={valueName(t, state)}
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-readonly={editable ? undefined : true}
      className="skald-resource-value"
      onKeyDown={onKeyDown}
    >
      <Value state={state} />
    </div>
  );

  if (!editable) return <div className="skald-resource-row">{value}</div>;

  return (
    <div className="skald-resource-row">
      <button
        type="button"
        className="skald-resource-step size-11"
        aria-label={t("resourceDecrease", { label, step })}
        disabled={current <= 0}
        onClick={() => commit(stepResource(current, -1, step, max))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      {value}
      <button
        type="button"
        className="skald-resource-step size-11"
        aria-label={t("resourceIncrease", { label, step })}
        disabled={max !== undefined && current >= max}
        onClick={() => commit(stepResource(current, 1, step, max))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function StepperDisplay({
  field,
  state,
}: {
  field: ResourceField;
  state: ResourceState;
}) {
  const hideLabel = field.labelPosition === "hidden";
  return (
    <div
      className="skald-resource"
      data-resource-display="stepper"
      {...rootProps(field, state)}
    >
      {!hideLabel && <span className="skald-resource-label">{state.label}</span>}
      <Stepper state={state} />
      {state.max !== undefined && <ResourceBar />}
    </div>
  );
}

function MeterDisplay({
  field,
  state,
}: {
  field: ResourceField;
  state: ResourceState;
}) {
  const t = useTranslations("renderer");
  const body = (
    <>
      <span className="skald-resource-label">{state.label}</span>
      <span className="skald-resource-meter-value">
        <Value state={state} />
      </span>
      {state.max !== undefined && <ResourceBar />}
    </>
  );
  const props = {
    className: "skald-resource",
    "data-resource-display": "meter",
    ...rootProps(field, state),
  };

  if (!state.editable) {
    return (
      <div {...props} role="group" aria-label={valueName(t, state)}>
        <div className="skald-resource-meter">{body}</div>
      </div>
    );
  }

  return (
    <div {...props}>
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="skald-resource-meter"
            aria-label={t("resourceMeterOpen", {
              name: valueName(t, state),
            })}
          >
            {body}
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="skald-resource-sheet"
          data-resource-id={field.id}
          data-res-band={props["data-res-band"]}
          style={props.style}
        >
          <SheetHeader>
            <SheetTitle>{state.label}</SheetTitle>
            <SheetDescription>{valueName(t, state)}</SheetDescription>
          </SheetHeader>
          <div className="skald-resource px-4 pb-6">
            <Stepper state={state} />
            {state.max !== undefined && <ResourceBar />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** 列印：0–N 刻度並圈出目前值 */
function PrintTicks({ field, state }: { field: ResourceField; state: ResourceState }) {
  const boxes = field.track?.boxes ?? state.max ?? 0;
  const circle = field.track?.circleCurrent !== false;
  const ticks = Array.from({ length: Math.max(0, Math.floor(boxes)) + 1 }, (_, i) => i);
  return (
    <ol className="skald-resource-ticks" aria-hidden="true">
      {ticks.map((tick) => (
        <li
          key={tick}
          data-tick={tick}
          data-current={circle && tick === state.current ? "true" : undefined}
        >
          {tick}
        </li>
      ))}
    </ol>
  );
}

/** 列印：目前／上限／起始 三個寫字格 */
function PrintBoxes({ state }: { state: ResourceState }) {
  const t = useTranslations("renderer");
  const cells: Array<[string, number | undefined]> = [
    [t("resourcePrintCurrent"), state.current],
    [t("resourcePrintMax"), state.max],
    [t("resourcePrintStart"), state.start],
  ];
  return (
    <div className="skald-resource-boxes">
      {cells.map(([name, value]) => (
        <div key={name} className="skald-resource-box">
          <span className="skald-resource-box-value">{value ?? ""}</span>
          <span className="skald-resource-box-label">{name}</span>
        </div>
      ))}
    </div>
  );
}

function PrintDisplay({
  field,
  state,
}: {
  field: ResourceField;
  state: ResourceState;
}) {
  const hasTicks = (field.track?.boxes ?? state.max ?? 0) > 0;
  const variant = field.print?.variant ?? (hasTicks ? "ticks" : "boxes");
  return (
    <div
      className="skald-resource"
      data-resource-display="print"
      data-print-variant={variant}
      {...rootProps(field, state)}
    >
      <span className="skald-resource-label">{state.label}</span>
      {variant === "ticks" ? (
        <PrintTicks field={field} state={state} />
      ) : (
        <PrintBoxes state={state} />
      )}
    </div>
  );
}

export function ResourceFieldRenderer({ field }: FieldRendererProps<ResourceField>) {
  const { viewMode } = useSchemaStatic();
  const display = useFieldDisplay();
  const state = useResourceState(field);

  if (viewMode === "print") return <PrintDisplay field={field} state={state} />;
  if (display === "meter") return <MeterDisplay field={field} state={state} />;
  return <StepperDisplay field={field} state={state} />;
}

registerFieldRenderer("resource", ResourceFieldRenderer);
