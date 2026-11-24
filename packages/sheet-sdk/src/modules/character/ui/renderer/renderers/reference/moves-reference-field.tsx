// modules/character/ui/renderer/renderers/reference/moves-reference-field.tsx
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { MovesReferenceField } from "@skald/types/schema";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { EmptyReference } from "./empty-reference";

// ── Data types ──────────────────────────────────────────────────────

interface LocalizedText {
  en: string;
  "zh-TW": string;
}

interface MoveResult {
  tier: string;
  text: LocalizedText;
}

interface ReferenceMove {
  id: string;
  name: LocalizedText;
  trigger: LocalizedText;
  results?: MoveResult[];
  note?: LocalizedText;
  bullets?: LocalizedText[];
}

interface ReferenceMoveData {
  moves: ReferenceMove[];
}

// ── Helpers ─────────────────────────────────────────────────────────

function getLocalizedText(
  text: string | LocalizedText | undefined,
  locale: string,
): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[locale as "en" | "zh-TW"] || text.en;
}

/** Map tier to semantic text color class */
function getTierColorClass(tier: string): string {
  if (tier === "12+") return "text-roll-critical";
  if (tier.startsWith("10")) return "text-roll-extreme";
  if (tier.startsWith("7")) return "text-roll-regular";
  if (tier.startsWith("6")) return "text-roll-fumble";
  return "text-muted-foreground";
}

// ── Sub-components ──────────────────────────────────────────────────

function MoveResultRow({
  result,
  locale,
}: {
  result: MoveResult;
  locale: string;
}) {
  return (
    <div className="flex gap-1.5 items-baseline text-2xs leading-snug">
      <span
        className={cn(
          "shrink-0 font-bold tabular-nums",
          getTierColorClass(result.tier),
        )}
      >
        {result.tier}
      </span>
      <span className="text-muted-foreground">
        {getLocalizedText(result.text, locale)}
      </span>
    </div>
  );
}

function MoveCard({
  move,
  locale,
  action,
}: {
  move: ReferenceMove;
  locale: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      {/* Move name */}
      <h4 className="text-xs font-bold tracking-wide border-b border-foreground/20 pb-0.5">
        {getLocalizedText(move.name, locale)}
      </h4>

      {/* Trigger text */}
      <p className="text-2xs leading-snug text-foreground/80 italic">
        {getLocalizedText(move.trigger, locale)}
      </p>

      {/* Bullet list (Gold Crown Move) */}
      {move.bullets && move.bullets.length > 0 && (
        <ul className="text-2xs leading-snug text-foreground/80 list-disc pl-3 space-y-0.5">
          {move.bullets.map((bullet, i) => (
            <li key={i}>{getLocalizedText(bullet, locale)}</li>
          ))}
        </ul>
      )}

      {/* Results */}
      {move.results && move.results.length > 0 && (
        <div className="space-y-0.5 pt-0.5">
          {move.results.map((result) => (
            <MoveResultRow
              key={result.tier}
              result={result}
              locale={locale}
            />
          ))}
        </div>
      )}

      {/* Note */}
      {move.note && (
        <p className="text-2xs leading-snug text-muted-foreground italic pt-0.5">
          {getLocalizedText(move.note, locale)}
        </p>
      )}
      {action}
    </div>
  );
}

// ── Main renderer ───────────────────────────────────────────────────

export function MovesReferenceFieldRenderer({
  field: _field,
  renderAction,
}: FieldRendererProps<MovesReferenceField> & { renderAction?: (moveId: string) => React.ReactNode }) {
  const { locale, t } = useSchemaI18n();
  const system = useSystemOptional();

  const moves = React.useMemo(() => {
    const data = system?.gameData?.referenceMoves as ReferenceMoveData | undefined;
    return data?.moves || [];
  }, [system]);

  if (moves.length === 0) {
    return <EmptyReference>{t("movesReference.noData")}</EmptyReference>;
  }

  // Split into two columns: first 4 left, rest right (matches PDF layout)
  const leftMoves = moves.slice(0, 4);
  const rightMoves = moves.slice(4);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
      <div className="space-y-3">
        {leftMoves.map((move) => (
          <MoveCard key={move.id} move={move} locale={locale} action={renderAction?.(move.id)} />
        ))}
      </div>
      <div className="space-y-3">
        {rightMoves.map((move) => (
          <MoveCard key={move.id} move={move} locale={locale} action={renderAction?.(move.id)} />
        ))}
      </div>
    </div>
  );
}

// Self-register
registerFieldRenderer("moves-reference", MovesReferenceFieldRenderer);
