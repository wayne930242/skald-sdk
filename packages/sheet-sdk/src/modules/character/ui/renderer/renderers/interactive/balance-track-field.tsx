// modules/character/ui/renderer/renderers/interactive/balance-track-field.tsx
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { BalanceTrackField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { TrackCell } from "../../primitives/track-cell";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@skald/sheet-sdk/components/ui/popover";

/**
 * Balance Track Field Renderer
 *
 * Renders a PbtA-style balance track showing a spectrum between two principles.
 * The track displays positions from min (-4 by default) to max (+4 by default).
 *
 * Features:
 * - Clickable position buttons for direct selection
 * - Arrow buttons for incremental movement
 * - Visual indication of current position and center marker
 * - Display of principle values based on position
 * - Playbook-specific principle names via i18n
 */
export function BalanceTrackFieldRenderer({
  field,
}: FieldRendererProps<BalanceTrackField>) {
  const positionPath = field.positionPath || `${field.id}.position`;
  const centerPath = field.centerPath || `${field.id}.center`;

  const position = useFieldValue<number>(positionPath) ?? 0;
  const center = useFieldValue<number>(centerPath) ?? 0;
  const selectedPlaybook = useFieldValue<string>("playbook");
  const setValue = useFieldSetter();
  const { editable } = useSchema();
  const { resolveI18n } = useSchemaI18n();

  const min = field.minPosition ?? -4;
  const max = field.maxPosition ?? 4;
  const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // Get principle labels from i18n - use playbook-specific if available
  const principle1Label = selectedPlaybook
    ? resolveI18n(`{{i18n:playbook.${selectedPlaybook}.principle.negative}}`)
    : resolveI18n(field.principle1.label);

  const principle2Label = selectedPlaybook
    ? resolveI18n(`{{i18n:playbook.${selectedPlaybook}.principle.positive}}`)
    : resolveI18n(field.principle2.label);

  // Calculate principle values based on position
  // Principle 1 (left) is active when position is negative
  // Principle 2 (right) is active when position is positive
  const principle1Value = Math.abs(Math.min(0, position));
  const principle2Value = Math.max(0, position);

  const handleMove = (direction: -1 | 1) => {
    const newPos = Math.max(min, Math.min(max, position + direction));
    setValue(positionPath, newPos);
  };

  const handlePositionClick = (pos: number) => {
    if (editable) {
      setValue(positionPath, pos);
    }
  };

  const handleSetCenter = (pos: number) => {
    if (editable) {
      setValue(centerPath, pos);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Principle labels */}
      <div className="flex justify-between text-sm font-medium">
        <span className={cn(position < 0 && "text-primary font-bold")}>
          {principle1Label}
          {principle1Value > 0 && ` +${principle1Value}`}
        </span>
        <span className={cn(position > 0 && "text-primary font-bold")}>
          {principle2Label}
          {principle2Value > 0 && ` +${principle2Value}`}
        </span>
      </div>

      {/* Track */}
      <div className="flex items-center gap-1">
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleMove(-1)}
            disabled={position <= min}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        {/*
          九格固定 32px 加兩個箭頭按鈕共需 376px，手機上放不下（實測溢出 20px）。
          不能用 sm: 這類視窗斷點：print 版面的頁面固定 816px 寬，在手機視窗開
          print 預覽時斷點會誤判成窄版。改讓格子隨容器收縮、上限維持 32px，
          兩種版面都由實際可用寬度決定。
        */}
        <div className="flex-1 flex justify-center gap-0.5 min-w-0">
          {range.map((pos) => (
            <TrackCell
              key={pos}
              size="lg"
              active={pos === position}
              // 中心點是參考標記，與「目前位置」是兩回事
              dashed={pos === center && pos !== position}
              disabled={!editable}
              onClick={() => handlePositionClick(pos)}
              className="font-mono flex-1 min-w-0 max-w-8"
            >
              {pos > 0 ? `+${pos}` : pos}
            </TrackCell>
          ))}
        </div>

        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleMove(1)}
            disabled={position >= max}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Center indicator - clickable to set new center */}
      {field.showCenter !== false && (
        <div className="text-xs text-muted-foreground text-center">
          {editable ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                  <Target className="h-3 w-3" />
                  {resolveI18n("{{i18n:balance.center}}")}:{" "}
                  {center > 0 ? `+${center}` : center}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="center">
                <div className="text-xs text-muted-foreground mb-2">
                  {resolveI18n("{{i18n:balance.setCenter}}")}
                </div>
                <div className="flex gap-0.5 flex-wrap justify-center">
                  {range.map((pos) => (
                    <TrackCell
                      key={pos}
                      size="md"
                      active={pos === center}
                      onClick={() => handleSetCenter(pos)}
                      className="font-mono"
                    >
                      {pos > 0 ? `+${pos}` : pos}
                    </TrackCell>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              {resolveI18n("{{i18n:balance.center}}")}:{" "}
              {center > 0 ? `+${center}` : center}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Self-register
registerFieldRenderer("balance-track", BalanceTrackFieldRenderer);
