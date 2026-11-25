"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RollConfig } from "@skald/dice/roll-expression";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { usePlay } from "./play-context";
import { num } from "./play-model";
import { hitDicePools, spendHitDie as spendPoolDie, type HitDicePool } from "./class-model";
import { TILE, TILE_LABEL, useEditTap } from "./vitals-styles";

/**
 * Hit Point Dice in play: the vitals bar's block (one 使用生命骰 for one die size, a chip per size
 * for several) and the phone's compact tile, which stacks the pools one per line (UAT M11) so a
 * multiclass "d10 3/3 · d6 1/1" no longer runs over its neighbours.
 */

export function HitDiceBlock() {
  const t = useTranslations("play");
  const { values, editable, update } = usePlay();
  const roll = useRollOptional();
  const edit = useEditTap("hitDice", t("hitDice.short"));
  const pools = hitDicePools(values);
  const [busy, setBusy] = useState(false);
  const use = async (faces: number) => {
    const pool = pools.find((candidate) => candidate.faces === faces);
    if (!roll || busy || !pool || pool.left <= 0) return;
    setBusy(true);
    try {
      const result = await roll.executeRoll(
        { expression: `1d${faces}+{{@mod}}`, system: "dnd5e" as RollConfig["system"] },
        { mod: num(values.conMod) },
        t("hitDice.roll"),
      );
      if (!result || !update) return;
      // The dice can take seconds: heal from the HP and spent dice at commit time, so damage or a
      // die spent elsewhere meanwhile is kept. The maximums still come from the click-time values.
      update((previous) => {
        const patch = spendPoolDie(
          { ...values, hp: previous.hp, hitDiceSpent: previous.hitDiceSpent, multiclass: previous.multiclass },
          faces,
          result.rolled,
        );
        return patch ? { ...previous, ...patch } : previous;
      });
    } finally {
      setBusy(false);
    }
  };
  const single = pools.length === 1;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-play-hit-dice>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{single ? t("hitDice.title", { faces: pools[0].faces }) : t("hitDice.short")}</span>
        <span className="font-semibold text-foreground">
          {single ? t("hitDice.left", { left: pools[0].left, max: pools[0].max }) : null}
          <OverrideMark fieldId="hitDiceMax" />
        </span>
      </div>
      {single ? (
        <button
          type="button"
          disabled={!edit && (!editable || !update || !roll || pools[0].left <= 0 || busy)}
          title={!edit && pools[0].left <= 0 ? t("hitDice.none") : undefined}
          aria-label={edit?.label}
          onClick={edit?.onClick ?? (() => void use(pools[0].faces))}
          className={USE_DIE}
        >
          {t("hitDice.use")}
        </button>
      ) : (
        // Several die sizes (UAT m16): one compact chip per size, "d10 3/5", so the player picks which
        // die to spend; the counts sit in the chip rather than in a summary above it.
        <div className="flex flex-wrap gap-1.5">
          {pools.map((pool) => (
            <button
              key={pool.faces}
              type="button"
              disabled={!edit && (!editable || !update || !roll || pool.left <= 0 || busy)}
              title={!edit && pool.left <= 0 ? t("hitDice.none") : t("hitDice.use")}
              aria-label={edit?.label ?? `${t("hitDice.use")} d${pool.faces} ${pool.left}/${pool.max}`}
              onClick={edit?.onClick ?? (() => void use(pool.faces))}
              data-hit-die={pool.faces}
              className={cn(USE_DIE, "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2.5")}
            >
              <span>{`d${pool.faces}`}</span>
              <span className="font-normal tabular-nums text-muted-foreground">{`${pool.left}/${pool.max}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const USE_DIE =
  "min-h-11 rounded-lg border border-border bg-muted/50 px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-muted/50 sm:min-h-10";

/** One pool: "3/5"; several on one line: "d10 3/5 · d6 1/2". */
export function hitDiceSummary(pools: HitDicePool[]): string {
  if (pools.length === 1) return `${pools[0].left}/${pools[0].max}`;
  return pools.map((pool) => `d${pool.faces} ${pool.left}/${pool.max}`).join(" · ");
}

/** The phone's 生命骰 tile with several die sizes: one line per pool, smaller when a line is long. */
export function CompactHitDiceTile({ pools }: { pools: HitDicePool[] }) {
  const t = useTranslations("play");
  const label = t("hitDice.short");
  const edit = useEditTap("hitDice", label);
  const lines = pools.map((pool) => `d${pool.faces} ${pool.left}/${pool.max}`);
  const small = lines.some((line) => line.length > 7);
  const content = (
    <>
      <span className={TILE_LABEL}>{label}</span>
      <span className={cn("flex flex-col items-center font-semibold leading-tight tabular-nums", small ? "text-xs" : "text-sm")}>
        {lines.map((line) => (
          <span key={line} className="whitespace-nowrap">
            {line}
          </span>
        ))}
      </span>
      <OverrideMark fieldId="hitDiceMax" />
    </>
  );
  return edit ? (
    <button type="button" className={cn(TILE, "transition-colors hover:bg-muted")} data-play-stat="hit-dice" aria-label={edit.label} aria-haspopup="dialog" onClick={edit.onClick}>
      {content}
    </button>
  ) : (
    <div className={TILE} data-play-stat="hit-dice" aria-label={`${label} ${lines.join(", ")}`} role="group">
      {content}
    </div>
  );
}
