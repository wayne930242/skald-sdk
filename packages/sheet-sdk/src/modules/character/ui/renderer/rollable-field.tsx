"use client";

import type { RollConfig } from "@skald/dice/roll-expression";
import { useTranslations } from "next-intl";
import { useSchemaData } from "./schema-context";
import { useRollData } from "./roll-data-context";
import {
  RollableField as RollControlField,
  useRollAction as useRollControlAction,
  type RollActionOptions,
  type RollableFieldProps,
} from "@skald/sheet-sdk/modules/rolls/ui/field/rollable-field";

export type { RollActionOptions };

export function useRollAction(
  roll: RollConfig | string | boolean | undefined,
  fieldLabel: string | undefined,
  actionOptions?: RollActionOptions,
) {
  return useRollControlAction(useRollData(useSchemaData()), roll, fieldLabel, actionOptions);
}

export function RollableField(props: RollableFieldProps) {
  const t = useTranslations("characters.derived");
  // B-023: a template form's computed value has no input to edit; say why its dice button does nothing
  const editHint = props.fieldType === "computed" ? t("fixed") : undefined;
  return <RollControlField {...props} editHint={editHint} data={useRollData(useSchemaData())} />;
}
