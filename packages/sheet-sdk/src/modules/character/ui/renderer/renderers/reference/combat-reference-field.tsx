"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { CombatReferenceField } from "@skald/types/schema";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchema } from "../../schema-context";
import { EmptyReference } from "./empty-reference";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Dices } from "lucide-react";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { buildRollExpression } from "@skald/sheet-sdk/modules/rolls";

interface Technique {
  id: string;
  name: { en: string; "zh-TW": string };
  description: { en: string; "zh-TW": string };
}

interface CombatStance {
  id: string;
  name: { en: string; "zh-TW": string };
  stat: string;
  description: { en: string; "zh-TW": string };
  techniques: Technique[];
}

interface CombatResultTable {
  "10+": { en: string; "zh-TW": string };
  "7-9": { en: string; "zh-TW": string };
  miss: { en: string; "zh-TW": string };
}

function getLocalizedText(
  text: string | { en: string; "zh-TW": string } | undefined,
  locale: string,
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[locale as "en" | "zh-TW"] || text.en;
}

export function CombatReferenceFieldRenderer({
  field,
}: FieldRendererProps<CombatReferenceField>) {
  const { locale, resolveI18n, t } = useSchemaI18n();
  const system = useSystemOptional();
  const { data } = useSchema();
  const rollContext = useRollOptional();

  const combatData = React.useMemo(() => {
    const gameData = system?.gameData?.gameData as {
      combatStances?: CombatStance[];
      combatResultTable?: CombatResultTable;
    };
    return {
      stances: gameData?.combatStances || [],
      resultTable: gameData?.combatResultTable,
    };
  }, [system]);

  // Get localized stat label
  const getStatLabel = (stat: string) => {
    const i18nLabel = resolveI18n(`{{i18n:field.${stat}}}`);
    if (i18nLabel.includes("{{i18n:")) {
      return stat.charAt(0).toUpperCase() + stat.slice(1);
    }
    return i18nLabel;
  };

  // Handle stat badge roll
  const handleStatRoll = async (
    stat: string,
    stanceName: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!rollContext) return;

    const statValue = (data[stat] as number) ?? 0;
    const context: Record<string, number> = { [stat]: statValue };

    // PbtA roll: 2d6 + stat
    const expression = buildRollExpression(`2d6+{{@${stat}}}`);

    await rollContext.executeRoll({ expression }, context, stanceName);
  };

  if (combatData.stances.length === 0) {
    return <EmptyReference>{t("combatReference.noData")}</EmptyReference>;
  }

  const displayStyle = field.displayStyle ?? "compact";

  if (displayStyle === "compact") {
    return (
      <div className="grid gap-1.5 grid-cols-2 print:grid-cols-2">
        {/* Result table - same width as stance cards */}
        {combatData.resultTable && (
          <div className="text-xs border rounded p-2 break-inside-avoid">
            <div className="font-medium mb-1">
              {t("sheetUi.stanceRollResults")}
            </div>
            <div className="space-y-0.5 text-muted-foreground">
              <div>
                <span className="font-medium">10+:</span>{" "}
                {getLocalizedText(combatData.resultTable["10+"], locale)}
              </div>
              <div>
                <span className="font-medium">7-9:</span>{" "}
                {getLocalizedText(combatData.resultTable["7-9"], locale)}
              </div>
              <div>
                <span className="font-medium">6-:</span>{" "}
                {getLocalizedText(combatData.resultTable["miss"], locale)}
              </div>
            </div>
          </div>
        )}

        {/* Stances and techniques */}
        {combatData.stances.map((stance) => (
          <div
            key={stance.id}
            className="border rounded p-2 text-xs break-inside-avoid"
          >
            <div className="font-medium flex items-center justify-between gap-1 mb-1">
              <span>{getLocalizedText(stance.name, locale)}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-2xs px-1 py-0 shrink-0",
                  rollContext && "cursor-pointer hover:bg-primary/10",
                )}
                onClick={(e) =>
                  rollContext &&
                  handleStatRoll(
                    stance.stat,
                    getLocalizedText(stance.name, locale),
                    e,
                  )
                }
              >
                {rollContext && <Dices className="h-2.5 w-2.5 mr-0.5" />}
                {getStatLabel(stance.stat)}
              </Badge>
            </div>
            <div className="space-y-1">
              {stance.techniques.map((tech) => (
                <div
                  key={tech.id}
                  className="text-muted-foreground leading-tight"
                >
                  <span className="font-medium text-foreground">
                    {getLocalizedText(tech.name, locale)}:
                  </span>{" "}
                  {getLocalizedText(tech.description, locale)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Full display style
  return (
    <div className="space-y-4">
      {/* Result table */}
      {combatData.resultTable && (
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="font-medium mb-2">
            {t("sheetUi.stanceRollResults")}
          </div>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-roll-extreme font-medium">10+:</span>{" "}
              {getLocalizedText(combatData.resultTable["10+"], locale)}
            </div>
            <div>
              <span className="text-roll-critical font-medium">7-9:</span>{" "}
              {getLocalizedText(combatData.resultTable["7-9"], locale)}
            </div>
            <div>
              <span className="text-roll-fumble font-medium">6-:</span>{" "}
              {getLocalizedText(combatData.resultTable["miss"], locale)}
            </div>
          </div>
        </div>
      )}

      {/* Stances */}
      {combatData.stances.map((stance) => (
        <div key={stance.id} className="border rounded-lg p-3">
          <div className="font-medium flex items-center gap-2 mb-2">
            {getLocalizedText(stance.name, locale)}
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                rollContext && "cursor-pointer hover:bg-primary/10",
              )}
              onClick={(e) =>
                rollContext &&
                handleStatRoll(
                  stance.stat,
                  getLocalizedText(stance.name, locale),
                  e,
                )
              }
            >
              {rollContext && <Dices className="h-3 w-3 mr-1" />}
              {getStatLabel(stance.stat)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {getLocalizedText(stance.description, locale)}
          </p>
          <div className="space-y-2">
            {stance.techniques.map((tech) => (
              <div
                key={tech.id}
                className="text-sm pl-2 border-l-2 border-muted"
              >
                <span className="font-medium">
                  {getLocalizedText(tech.name, locale)}
                </span>
                <p className="text-muted-foreground">
                  {getLocalizedText(tech.description, locale)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

registerFieldRenderer("combat-reference", CombatReferenceFieldRenderer);
