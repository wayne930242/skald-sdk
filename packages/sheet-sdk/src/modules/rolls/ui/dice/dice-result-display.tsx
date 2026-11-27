"use client";

import { cn } from "@skald/sheet-sdk/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { Dices, Target, TrendingUp, TrendingDown } from "lucide-react";
import {
  checkDisplayTone,
  difficultyTarget,
  rollDisplayLabel,
  keptRollFlags,
  type CoC7eSuccessLevel,
  type DiceRoll,
} from "@skald/dice";
import { PoolResult } from "../pool";
import { isBwbTier } from "@skald/sheet-sdk/modules/rolls/domain/roll-card-model";
import {
  formatRollSummaryLines,
  toRollRenderModelFromDiceRoll,
} from "@skald/sheet-sdk/modules/rolls/domain/roll-result-summary";

interface DiceResultDisplayProps {
  roll: DiceRoll;
  className?: string;
}

interface EquationColumn {
  label: string;
  value: number;
  op?: "+" | "-";
}

function buildAlignedColumns(expression: string | undefined, values: number[], total: number): EquationColumn[] | null {
  if (!expression || values.length === 0) return null;
  const expr = expression.replace(/\s+/g, "").toUpperCase();
  const terms = expr.match(/[+-]?((\d+)?D(\d+|F)|\d+)/g) ?? [];
  if (!terms.length) return null;
  const diceTerms = terms.filter((term) => /D/.test(term));
  if (diceTerms.length !== values.length) return null;

  const columns: EquationColumn[] = diceTerms.map((term, idx) => ({
    label: term.replace(/^[+-]/, ""),
    value: values[idx],
    op: term.startsWith("-") ? "-" : idx > 0 ? "+" : undefined,
  }));

  const diceTotal = values.reduce((sum, value) => sum + value, 0);
  const modifier = total - diceTotal;
  if (modifier !== 0) {
    columns.push({
      label: String(Math.abs(modifier)),
      value: Math.abs(modifier),
      op: modifier > 0 ? "+" : "-",
    });
  }

  return columns;
}

interface SuccessLevelStyleInfo {
  text: string;
  bg: string;
  border: string;
}

// CoC7e's own 6 success levels keep their existing, distinct colors — this
// table takes precedence so extreme/hard/regular don't collapse into one
// color even though they share the same DSL `style` category ("success").
const successLevelStyles: Record<CoC7eSuccessLevel, SuccessLevelStyleInfo> = {
  critical: {
    text: "text-roll-critical",
    bg: "bg-roll-critical/10",
    border: "border-roll-critical/30",
  },
  extreme: {
    text: "text-roll-extreme",
    bg: "bg-roll-extreme/10",
    border: "border-roll-extreme/30",
  },
  hard: {
    text: "text-roll-hard",
    bg: "bg-roll-hard/10",
    border: "border-roll-hard/30",
  },
  regular: {
    text: "text-roll-regular",
    bg: "bg-roll-regular/10",
    border: "border-roll-regular/30",
  },
  failure: {
    text: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-muted",
  },
  fumble: {
    text: "text-roll-fumble",
    bg: "bg-roll-fumble/10",
    border: "border-roll-fumble/30",
  },
};

// Success levels from other systems' dsl-roll-rules.json (Fate Condensed and
// others) that aren't in the CoC7e table above.
// Colors picked from their DSL `style` category.
const otherSystemSuccessLevelStyles: Record<string, SuccessLevelStyleInfo> = {
  "success-with-style": successLevelStyles.critical,
  success: successLevelStyles.regular,
  tie: { text: "text-roll-hard", bg: "bg-roll-hard/10", border: "border-roll-hard/30" },
  "bwb-extraordinary": successLevelStyles.critical,
  "bwb-strong": successLevelStyles.regular,
  "bwb-weak": successLevelStyles.hard,
  "bwb-miss": successLevelStyles.failure,
  strong: successLevelStyles.regular,
  weak: { text: "text-roll-hard", bg: "bg-roll-hard/10", border: "border-roll-hard/30" },
  miss: successLevelStyles.failure,
};

export function resolveSuccessLevelStyle(level: string): SuccessLevelStyleInfo {
  return (
    successLevelStyles[level as CoC7eSuccessLevel] ??
    otherSystemSuccessLevelStyles[level] ??
    successLevelStyles.regular
  );
}

export function DiceResultDisplay({ roll, className }: DiceResultDisplayProps) {
  const locale = useLocale();
  const t = useTranslations("dice");
  const tRoll = useTranslations("roll");
  const checkLabel = roll.type === "skill_check" ? rollDisplayLabel(roll.checkDisplay?.labels, locale) : undefined;
  const model = toRollRenderModelFromDiceRoll(roll);
  const summary = formatRollSummaryLines(
    model,
    (key, values) => tRoll(`toast.${key}`, values),
    (level) => checkLabel ?? tRoll(`successLevel.${level}`),
  );
  const ruleLabel =
    model.rule.id === "coc7-bonus"
      ? t("ruleLabel.bonus", { count: model.rule.amount ?? 0 })
      : model.rule.id === "coc7-penalty"
        ? t("ruleLabel.penalty", { count: model.rule.amount ?? 0 })
        : model.rule.id === "coc7-normal"
          ? t("ruleLabel.normal")
          : model.rule.id === "compare"
            ? model.rule.comparator ?? t("ruleLabel.compare")
            : t("ruleLabel.roll");
  const renderDieChip = (
    value: number,
    key: string,
    selected = false,
    tone: "default" | "tens" | "units" = "default",
  ) => (
    <span
      key={key}
      className={cn(
        "inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded px-1 font-mono text-xs",
        selected
          ? "border border-primary/50 bg-primary/20 text-foreground"
          : "bg-background/60 text-muted-foreground",
        tone !== "default" && selected && "ring-1 ring-primary/30",
      )}
    >
      {value}
    </span>
  );

  if (roll.type === "skill_check") {
    const tone = checkDisplayTone(roll.checkDisplay?.tone) ?? roll.successLevel;
    const styles = resolveSuccessLevelStyle(tone);
    const isSuccess = !["failure", "fumble", "miss"].includes(tone);
    const levelLabel = checkLabel ?? t(`successLevel.${roll.successLevel}`);

    return (
      <div
        className={cn(
          "rounded-lg border px-3 py-2 min-w-[180px]",
          styles.border,
          styles.bg,
          className,
        )}
      >
        {/* Header: Skill name and target */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-medium truncate">{roll.skillName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="inline-flex rounded border border-border px-1 py-0.5 text-2xs text-muted-foreground">
              {ruleLabel}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Target className="h-3 w-3" />
              {roll.targetValue}
            </span>
            {roll.difficulty && (
              <span data-roll-difficulty className="text-xs font-semibold">
                {t("difficulty.withTarget", {
                  level: t(`difficulty.${roll.difficulty}`),
                  target: difficultyTarget(roll.targetValue, roll.difficulty),
                })}
              </span>
            )}
          </div>
        </div>

        {roll.pushed && (
          <p className="mb-1 text-2xs font-semibold" data-roll-follow-up="pushed">
            {t("followUp.pushed")}
          </p>
        )}
        {roll.luckSpent !== undefined && (
          <p className="mb-1 text-2xs font-semibold" data-roll-follow-up="luck">
            {t("followUp.luckSpent", {
              cost: roll.luckSpent,
              skill: roll.skillName,
              target: roll.targetValue,
              level: levelLabel,
            })}
          </p>
        )}

        {/* Main result */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn("text-2xl font-bold tabular-nums", styles.text)}
            >
              {roll.roll}
            </span>
            {roll.bonusDice !== undefined && roll.bonusDice !== 0 && (
              <span className="text-xs text-muted-foreground flex items-center">
                {roll.bonusDice > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-success mr-0.5" />
                    <span>+{roll.bonusDice}</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 text-destructive mr-0.5" />
                    <span>{roll.bonusDice}</span>
                  </>
                )}
              </span>
            )}
          </div>

          {/* Success level badge */}
          <span
            className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full",
              styles.text,
              isSuccess ? "bg-background/50" : "bg-background/30",
            )}
          >
            {levelLabel}
          </span>
        </div>

        {/* Dice breakdown */}
        {(roll.tensDice?.length || roll.unitsDice?.length) && (
          <div className="mt-2 space-y-1 border-t border-border/40 pt-1.5">
            {summary.breakdown && (
              <div className="text-2xs text-muted-foreground">
                {summary.breakdown}
              </div>
            )}
            {!!roll.tensDice?.length && (
              <div className="flex items-center gap-1">
                <span className="w-10 text-2xs text-muted-foreground">
                  {t("rollControl.tens")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {roll.tensDice.map((value, i) =>
                    renderDieChip(
                      value,
                      `tens-${i}`,
                      roll.selectedTens === value,
                      "tens",
                    ),
                  )}
                </div>
              </div>
            )}
            {!!roll.unitsDice?.length && (
              <div className="flex items-center gap-1">
                <span className="w-10 text-2xs text-muted-foreground">
                  {t("rollControl.units")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {roll.unitsDice.map((value, i) =>
                    renderDieChip(
                      value,
                      `units-${i}`,
                      roll.selectedUnits === value,
                      "units",
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (roll.type === "simple") {
    if (roll.pool) return <div className={className}><strong>{roll.total}</strong> <PoolResult pool={roll.pool} rolls={roll.rolls} total={roll.total} /></div>;
    const diceGroup = model.diceGroups.find((group) => group.label === "dice");
    const diceValues = diceGroup?.values ?? [];
    // A keep/drop roll (`2d20kl1+5`) stores every face; only the kept ones add up
    const bwbTier = isBwbTier(roll.successLevel) ? roll.successLevel : undefined;
    const kept = keptRollFlags(roll.rolls, roll.notation);
    const dropsAny = kept.some((isKept) => !isKept);
    const alignedColumns = dropsAny
      ? null
      : buildAlignedColumns(model.expression, diceValues, model.total);
    const diceTotal = diceValues.reduce(
      (sum, value, index) => (kept[index] === false ? sum : sum + value),
      0,
    );
    const modifier = model.total - diceTotal;
    const droppedLabel = (face: number) => t("droppedDie", { face });

    return (
      <div
        className={cn(
          "rounded-lg border border-border/50 bg-muted/30 px-3 py-2 min-w-[140px]",
          className,
        )}
      >
        {/* Notation header */}
        <div className="flex items-center gap-1.5 mb-1">
          <Dices className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">
            {model.expression ?? roll.notation}
          </span>
        </div>

        {/* Result */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{roll.total}</span>
          <span className={cn("inline-flex rounded border border-border px-1 py-0.5 text-2xs text-muted-foreground", bwbTier && resolveSuccessLevelStyle(bwbTier).text)}>
            {bwbTier ? t(`successLevel.${bwbTier}`) : ruleLabel}
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="opacity-60">=</span>
            <div className="flex gap-0.5">
              {roll.rolls.map((r, i) =>
                kept[i] ? (
                  renderDieChip(r, `simple-${i}`, false, "default")
                ) : (
                  <s
                    key={`simple-${i}`}
                    data-dropped="true"
                    title={droppedLabel(r)}
                    aria-label={droppedLabel(r)}
                    className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded bg-background/30 px-1 font-mono text-xs text-muted-foreground/60"
                  >
                    {r}
                  </s>
                ),
              )}
              {modifier !== 0 && (
                <span className="inline-flex items-center gap-0.5 px-1">
                  <span>{modifier > 0 ? "+" : "-"}</span>
                  {renderDieChip(Math.abs(modifier), "simple-mod", false, "default")}
                </span>
              )}
            </div>
          </div>
        </div>
        {!bwbTier && !!diceValues.length && (
          <div className="mt-1">
            {alignedColumns ? (
              <div className="flex items-end gap-1 text-2xs">
                {alignedColumns.map((col, index) => (
                  <div key={`al-${index}`} className="flex items-end gap-1">
                    {col.op && <span className="pb-0.5 text-muted-foreground">{col.op}</span>}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-2xs text-muted-foreground">{col.label}</span>
                      <span className="inline-flex min-w-6 items-center justify-center rounded border border-border px-1 tabular-nums text-foreground">
                        {col.value}
                      </span>
                    </div>
                  </div>
                ))}
                <span className="pb-0.5 text-muted-foreground">=</span>
                <span className="inline-flex min-w-8 items-center justify-center rounded border border-primary bg-primary/15 px-1.5 py-0.5 font-semibold tabular-nums text-foreground">
                  {model.total}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
                {diceValues.map((value, index) =>
                  kept[index] === false ? (
                    <s key={`eq-${index}`} data-dropped="true" className="opacity-60">
                      {value}
                    </s>
                  ) : (
                    <div key={`eq-${index}`} className="flex items-center gap-1">
                      {kept.slice(0, index).some((isKept) => isKept) && <span>+</span>}
                      <span>{value}</span>
                    </div>
                  ),
                )}
                {modifier !== 0 && (
                  <div className="flex items-center gap-1">
                    <span>{modifier > 0 ? "+" : "-"}</span>
                    <span>{Math.abs(modifier)}</span>
                  </div>
                )}
                <span>=</span>
                <span className="font-semibold text-foreground">{model.total}</span>
              </div>
            )}
          </div>
        )}
        {!bwbTier && summary.breakdown && (
          <div className="mt-1 text-2xs text-muted-foreground">
            {summary.breakdown}
          </div>
        )}
      </div>
    );
  }

  return null;
}
