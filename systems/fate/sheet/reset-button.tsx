"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import type { FateResetButtonField } from "@skald/types/schema";
import { useSchema } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import type { FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@skald/sheet-sdk/components/ui/alert-dialog";

export function FateResetButtonRenderer({
  field,
}: FieldRendererProps<FateResetButtonField>) {
  const { editable, setData, handlers } = useSchema();
  const { resolveI18n } = useSchemaI18n();
  const system = useSystemOptional();

  if (!editable || (system?.systemId === "fate-condensed" && system.builtinTemplate === true)) return null;

  const label = resolveI18n(field.label ?? "{{i18n:field.resetCharacter}}");
  const confirmTitle = resolveI18n("{{i18n:reset.confirmTitle}}");
  const confirmDescription = resolveI18n("{{i18n:reset.confirmDescription}}");
  const cancelText = resolveI18n("{{i18n:reset.cancel}}");
  const confirmText = resolveI18n("{{i18n:reset.confirm}}");

  const handleReset = () => {
    // Try to use a registered handler first
    if (handlers?.resetToDefaults) {
      handlers.resetToDefaults({}, setData ?? (() => {}));
    } else if (setData) {
      // Fallback: clear all data
      setData({});
    }
  };

  return (
    <div className="print:hidden">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <RotateCcw className="h-4 w-4 mr-2" />
            {label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelText}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Self-register
