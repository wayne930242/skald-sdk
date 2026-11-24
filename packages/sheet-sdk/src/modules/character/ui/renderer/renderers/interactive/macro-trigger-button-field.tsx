// modules/character/ui/renderer/renderers/interactive/macro-trigger-button-field.tsx
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dices } from "lucide-react";
import type { MacroTriggerButtonField, SelectField } from "@skald/types/schema";
import { useSchema } from "../../schema-context";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { flattenDataToContext } from "@skald/sheet-sdk/modules/rolls";
import { resolveSelectFieldOptions } from "../primitives/select-field";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { FieldIcon } from "../../primitives/field-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@skald/sheet-sdk/components/ui/tooltip";

export function MacroTriggerButtonFieldRenderer({
  field,
}: FieldRendererProps<MacroTriggerButtonField>) {
  const rollContext = useRollOptional();
  const { data, schema, optionSources } = useSchema();
  const { resolveI18n } = useSchemaI18n();
  const t = useTranslations("roll");
  const [pending, setPending] = React.useState(false);

  const label = resolveI18n(field.label);
  const tooltip = resolveI18n(field.tooltip);

  if (!rollContext) return null;

  const handleClick = async () => {
    const context = flattenDataToContext(data);
    let argOverrides: Record<string, number> | undefined;

    if (field.optionSource) {
      const targetField = schema.fields[field.optionSource.fieldId] as
        | SelectField
        | undefined;
      const options = targetField
        ? resolveSelectFieldOptions(targetField, optionSources)
        : [];
      if (options.length === 0) {
        // Guard the zero-options case: the executor rejects `1d0` and
        // MacroEvaluationError propagates uncaught past this point — don't
        // let that happen, fail visibly instead.
        toast.error(t("error.title"), { description: t("error.noOptions") });
        return;
      }
      argOverrides = { [field.optionSource.argParam]: options.length };
    }

    setPending(true);
    try {
      await rollContext.executeMacroTrigger(field.macro, context, label, argOverrides);
    } catch (error) {
      console.error("[MacroTriggerButton] Macro evaluation failed:", error);
      toast.error(t("error.title"), { description: t("error.invalidExpression") });
    } finally {
      setPending(false);
    }
  };

  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="print:hidden"
    >
      <FieldIcon name={field.icon} fallback={Dices} className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Self-register
registerFieldRenderer("macro-trigger-button", MacroTriggerButtonFieldRenderer);
