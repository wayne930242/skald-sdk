"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import type { FateStuntListField, FateStunt } from "@skald/types/schema";
import {
  useFieldValue,
  useFieldSetter,
  useSchema,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import type { FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import type { FateStuntRow } from "../domain/character";
import { readFateStunts, updateFateStunts } from "../domain/normalize";

interface StuntsData {
  stunts: FateStunt[];
}

function generateId(): string {
  return `stunt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function FateStuntListFieldRenderer({
  field,
}: FieldRendererProps<FateStuntListField>) {
  const rawData = useFieldValue<StuntsData>(field.id);
  const setValue = useFieldSetter();
  const { data, editable, setupMode, setData, onBlur } = useSchema();
  const system = useSystemOptional();
  const builtin = system?.systemId === "fate-condensed" && system.builtinTemplate === true && field.id === "stunts";
  const { resolveI18n, t } = useSchemaI18n();
  const canonicalStunts = builtin ? readFateStunts(data) : undefined;
  const stunts = canonicalStunts ?? rawData?.stunts ?? [];
  const mayEdit = editable && (!builtin || Boolean(setData));
  const mayEditStructure = mayEdit && (!builtin || setupMode);
  const maxStunts = field.maxStunts;

  const commit = (update: (rows: readonly FateStuntRow[]) => readonly FateStuntRow[], save = true) => {
    if (!mayEdit || !setData) return;
    setData(previous => updateFateStunts(previous, update));
    if (save) onBlur?.();
  };

  // 新增絕技
  const handleAddStunt = () => {
    if (!mayEditStructure || (maxStunts && stunts.length >= maxStunts)) return;

    const newStunt: FateStuntRow = {
      id: generateId(),
      type: "custom",
      customText: "",
    };

    if (builtin) {
      commit(rows => maxStunts && rows.length >= maxStunts ? rows : [...rows, newStunt]);
    } else {
      setValue(field.id, { ...rawData, stunts: [...stunts, newStunt] });
    }
  };

  // 刪除絕技
  const handleRemoveStunt = (stuntId: string) => {
    if (!mayEditStructure) return;
    if (builtin) {
      commit(rows => rows.filter(row => row.id !== stuntId));
    } else {
      setValue(field.id, { ...rawData, stunts: stunts.filter(row => row.id !== stuntId) });
    }
  };

  // 更新絕技
  const handleUpdateStunt = (stuntId: string, text: string) => {
    if (builtin) {
      commit(rows => rows.map(row => row.id === stuntId && row.customText !== text ? { ...row, customText: text } : row), false);
    } else {
      setValue(field.id, { ...rawData, stunts: stunts.map(row => row.id === stuntId ? { ...row, customText: text } : row) });
    }
  };

  return (
    <div className="space-y-2">
      {stunts.map((stunt, index) => {
        const row = canonicalStunts?.[index];
        const summary = row && [
          row.title, row.because ?? row.quality,
          row.circumstance, row.effect ?? row.feat, row.limit ?? row.limitation,
        ].filter(Boolean).join(" · ");
        return (
          <div key={stunt.id} className="space-y-1">
            {summary && <p className="text-sm">{summary}</p>}
            <div className="flex gap-2 items-start group">
              {mayEdit ? (
                <>
                  <Textarea
                    value={stunt.customText ?? ""}
                    onChange={(e) => handleUpdateStunt(stunt.id, e.target.value)}
                    onBlur={builtin ? onBlur : undefined}
                    placeholder={t("stunt.placeholder", { index: index + 1 })}
                    className="min-h-[60px] text-sm resize-none"
                  />
                  {mayEditStructure && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => handleRemoveStunt(stunt.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm border-b border-border pb-1 w-full min-h-[24px]">
                  {stunt.customText || (summary ? "" : "—")}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {mayEditStructure && (!maxStunts || stunts.length < maxStunts) && (
        <Button
          variant="outline"
          size="sm"
          className="w-full print:hidden"
          onClick={handleAddStunt}
        >
          <Plus className="h-4 w-4 mr-2" />
          {resolveI18n("{{i18n:stunt.add}}")}
        </Button>
      )}

      {!mayEdit && stunts.length === 0 && (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

// Self-register
