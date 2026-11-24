"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { useRoll } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import type { RollResultEvent } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";

interface LoggedRoll {
  id: string;
  label: string;
  total: number;
  detail: string;
}

const MAX_ROLLS = 50;

function describe({ entry, fieldLabel }: RollResultEvent): LoggedRoll {
  const dice = entry.rolls.length > 0 ? `[${entry.rolls.join(", ")}]` : "";
  return {
    id: entry.id,
    label: fieldLabel || entry.label,
    total: entry.total,
    detail: [entry.notation, dice].filter(Boolean).join(" "),
  };
}

/**
 * The previewer's roll sink: every roll the sheet makes through the shared roll context lands
 * here, newest first. Nothing leaves the page.
 */
export function RollLog() {
  const t = useTranslations("previewer.rollLog");
  const { onRollResult } = useRoll();
  const [rolls, setRolls] = useState<LoggedRoll[]>([]);
  useEffect(
    () => onRollResult((event) => setRolls((current) => [describe(event), ...current].slice(0, MAX_ROLLS))),
    [onRollResult],
  );

  return (
    <aside aria-labelledby="roll-log-title" className="rounded-card border bg-card p-4 text-sm" data-roll-log>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="roll-log-title" className="font-semibold">{t("title")}</h2>
        {rolls.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setRolls([])}>
            {t("clear")}
          </Button>
        )}
      </div>
      {rolls.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="space-y-2">
          {rolls.map((roll) => (
            <li key={roll.id} className="flex items-baseline justify-between gap-3 border-b pb-2 last:border-0">
              <span className="min-w-0">
                <span className="block truncate font-medium">{roll.label}</span>
                {roll.detail && <span className="block text-xs text-muted-foreground">{roll.detail}</span>}
              </span>
              <span className="text-lg font-semibold tabular-nums">{roll.total}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
