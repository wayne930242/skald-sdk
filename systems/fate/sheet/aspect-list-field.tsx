"use client";

import * as React from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import type { FateAspectListField, FateAspect } from "@skald/types/schema";
import {
  useFieldValue,
  useFieldSetter,
  useSchema,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import type { FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import type { FateAspectRow } from "../domain/character";
import { readFateAspects, updateFateAspects } from "../domain/normalize";

const DEFAULT_ASPECTS = [
  { id: "highConcept", label: "{{i18n:aspect.highConcept}}" },
  { id: "trouble", label: "{{i18n:aspect.trouble}}" },
  { id: "relationship", label: "{{i18n:aspect.relationship}}" },
  { id: "freeAspect1", label: "{{i18n:aspect.free}}" },
  { id: "freeAspect2", label: "{{i18n:aspect.free}}" },
];

interface AspectsData {
  aspects: FateAspect[];
}

function generateId(): string {
  return `aspect-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function FateAspectListFieldRenderer({
  field,
}: FieldRendererProps<FateAspectListField>) {
  const rawData = useFieldValue<AspectsData>(field.id);
  const setValue = useFieldSetter();
  const { data: character, editable, setupMode, setData, onBlur } = useSchema();
  const system = useSystemOptional();
  const builtin = system?.systemId === "fate-condensed" && system.builtinTemplate === true && field.id === "aspects";
  const { resolveI18n, t } = useSchemaI18n();

  const defaultAspects = field.defaultAspects ?? DEFAULT_ASPECTS;
  const allowAdd = field.allowAdd ?? true;
  const allowRemove = field.allowRemove ?? true;
  const allowEditLabel = field.allowEditLabel ?? true;

  const projection = builtin ? readFateAspects(character) : undefined;
  // This fallback has no viewer identity. Never render secret rows or their flat conflicts.
  const rows: FateAspect[] = projection
    ? projection.rows.filter(row => !row.secret).map(row => ({
        id: row.id,
        label: row.labelOverride ?? t(`aspect.${row.kind}`),
        value: row.text,
      }))
    : rawData?.aspects?.length
      ? rawData.aspects
      : defaultAspects.map(a => ({ id: a.id, label: resolveI18n(a.label), value: "" }));
  const mayEdit = editable && (!builtin || Boolean(setData));
  const mayEditStructure = mayEdit && (!builtin || setupMode);

  const commit = (update: (rows: readonly FateAspectRow[]) => readonly FateAspectRow[], save = true) => {
    if (!mayEdit || !setData) return;
    setData(previous => updateFateAspects(previous, update, kind => t(`aspect.${kind}`)));
    if (save) onBlur?.();
  };

  const [editingLabelId, setEditingLabelId] = React.useState<string | null>(null);
  const [editingLabel, setEditingLabel] = React.useState("");

  const handleValueChange = (aspectId: string, value: string) => {
    if (builtin) {
      commit(rows => rows.map(row => row.id === aspectId && !row.secret && row.text !== value ? { ...row, text: value } : row), false);
    } else {
      setValue(field.id, { aspects: rows.map(a => a.id === aspectId ? { ...a, value } : a) });
    }
  };

  const handleStartEditLabel = (aspect: FateAspect) => {
    setEditingLabelId(aspect.id);
    setEditingLabel(aspect.label);
  };

  const handleSaveLabel = (aspectId: string) => {
    const label = editingLabel.trim();
    if (label && mayEditStructure) {
      if (builtin) {
        commit(rows => rows.map(row => row.id === aspectId && !row.secret ? { ...row, labelOverride: label } : row));
      } else {
        setValue(field.id, { aspects: rows.map(a => a.id === aspectId ? { ...a, label } : a) });
      }
    }
    setEditingLabelId(null);
    setEditingLabel("");
  };

  const handleAddAspect = () => {
    const id = generateId();
    if (builtin) {
      commit(rows => [...rows, { id, kind: "free", text: "", freeInvokes: 0, secret: false }]);
    } else {
      setValue(field.id, { aspects: [...rows, { id, label: resolveI18n("{{i18n:aspect.new}}"), value: "" }] });
    }
  };

  const handleRemoveAspect = (aspectId: string) => {
    if (builtin) {
      commit(rows => rows.filter(row => row.id !== aspectId || row.secret));
    } else {
      setValue(field.id, { aspects: rows.filter(a => a.id !== aspectId) });
    }
  };

  return (
    <div className="space-y-1">
      {rows.map((aspect) => (
        <div key={aspect.id} className="flex items-center gap-2 group">
          {/* Label */}
          <div className="w-20 shrink-0">
            {editingLabelId === aspect.id && mayEditStructure ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveLabel(aspect.id);
                    if (e.key === "Escape") setEditingLabelId(null);
                  }}
                  className="h-6 text-xs px-1"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => handleSaveLabel(aspect.id)}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">{aspect.label}</span>
                {mayEditStructure && allowEditLabel && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100"
                    onClick={() => handleStartEditLabel(aspect)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Value */}
          {mayEdit ? (
            <Input
              value={aspect.value}
              onChange={(e) => handleValueChange(aspect.id, e.target.value)}
              onBlur={builtin ? onBlur : undefined}
              className="h-7 text-sm flex-1"
              placeholder={aspect.label}
            />
          ) : (
            <span className="text-sm border-b border-border flex-1 min-h-[24px] pb-0.5">
              {aspect.value || "—"}
            </span>
          )}

          {/* Remove button */}
          {mayEditStructure && allowRemove && (builtin || rows.length > 1) && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-destructive"
              onClick={() => handleRemoveAspect(aspect.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}

      {mayEditStructure && projection?.conflicts.filter(conflict => !projection.rows.some(row => row.id === conflict.id && row.secret)).map(conflict => (
        <p key={conflict.id} className="text-xs text-muted-foreground">
          {t("aspect.legacyConflict", { text: conflict.flatText })}
        </p>
      ))}

      {mayEditStructure && allowAdd && (
        <Button
          variant="outline"
          size="sm"
          className="w-full print:hidden mt-2"
          onClick={handleAddAspect}
        >
          <Plus className="h-4 w-4 mr-2" />
          {resolveI18n("{{i18n:aspect.add}}")}
        </Button>
      )}
    </div>
  );
}

// Self-register
