"use client";

import * as React from "react";
import type { GrowthAdvancesField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Plus, Minus } from "lucide-react";

interface TakenAdvance {
  id: string;
  count: number;
}

const DEFAULT_OPTIONS = [
  {
    id: "newPlaybookMove",
    label: "{{i18n:growth.advance.newPlaybookMove}}",
    maxCount: 2,
  },
  {
    id: "newOtherMove",
    label: "{{i18n:growth.advance.newOtherMove}}",
    maxCount: 2,
  },
  {
    id: "raiseAttribute",
    label: "{{i18n:growth.advance.raiseAttribute}}",
    maxCount: undefined,
  },
  {
    id: "shiftCenter",
    label: "{{i18n:growth.advance.shiftCenter}}",
    maxCount: 2,
  },
  {
    id: "unlockMoment",
    label: "{{i18n:growth.advance.unlockMoment}}",
    maxCount: 2,
  },
];

export function GrowthAdvancesFieldRenderer({
  field,
}: FieldRendererProps<GrowthAdvancesField>) {
  const { resolveI18n } = useSchemaI18n();
  const { editable } = useSchema();
  const setValue = useFieldSetter();

  const advancesPath = field.advancesPath || "growth.advances";
  const advances = useFieldValue<TakenAdvance[]>(advancesPath) ?? [];
  const options = field.options || DEFAULT_OPTIONS;

  const getCount = (id: string) => {
    const found = advances.find((a) => a.id === id);
    return found?.count || 0;
  };

  const handleIncrement = (id: string, maxCount?: number) => {
    if (!editable) return;
    const current = getCount(id);
    if (maxCount !== undefined && current >= maxCount) return;

    const newAdvances = advances.filter((a) => a.id !== id);
    newAdvances.push({ id, count: current + 1 });
    setValue(advancesPath, newAdvances);
  };

  const handleDecrement = (id: string) => {
    if (!editable) return;
    const current = getCount(id);
    if (current <= 0) return;

    const newAdvances = advances.filter((a) => a.id !== id);
    if (current > 1) {
      newAdvances.push({ id, count: current - 1 });
    }
    setValue(advancesPath, newAdvances);
  };

  const totalAdvances = advances.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">
          {resolveI18n(field.label || "{{i18n:growth.advances}}")}
        </div>
        {totalAdvances > 0 && (
          <Badge variant="outline" className="text-xs">
            {totalAdvances}x {resolveI18n("{{i18n:growth.taken}}")}
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {options.map((option) => {
          const count = getCount(option.id);
          const atMax =
            option.maxCount !== undefined && count >= option.maxCount;

          return (
            <div
              key={option.id}
              className={cn(
                "flex items-center justify-between gap-2 text-xs p-1.5 rounded border",
                count > 0 && "bg-primary/5 border-primary/20",
              )}
            >
              <div className="flex-1">
                <span>{resolveI18n(option.label)}</span>
                <span className="text-muted-foreground ml-1.5">
                  (
                  {option.maxCount
                    ? resolveI18n("{{i18n:growth.maxTimes}}").replace(
                        "{count}",
                        String(option.maxCount),
                      )
                    : resolveI18n("{{i18n:growth.unlimited}}")}
                  )
                </span>
              </div>
              <div className="flex items-center gap-1">
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleDecrement(option.id)}
                    disabled={count <= 0}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                )}
                <span
                  className={cn(
                    "w-4 text-center font-medium",
                    count > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleIncrement(option.id, option.maxCount)}
                    disabled={atMax}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

registerFieldRenderer("growth-advances", GrowthAdvancesFieldRenderer);
