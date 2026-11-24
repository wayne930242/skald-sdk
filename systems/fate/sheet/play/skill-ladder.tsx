"use client";

import { BookOpen, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "./play-context";
import { fateLadderRows, type FatePlaySkill, type FateSpreadHint } from "./play-model";
import { CARD, CARD_HEAD, CARD_TITLE, ICON_BUTTON, MUTED, SKILL_CHIP } from "./card-styles";
import type { FatePlaySlots } from "./slots";
import { useSkillName } from "./use-skill-name";

/** `+3`, `−1` (a real minus sign), `+0`. */
export function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

function Skill({ skill, trigger: Trigger }: { skill: FatePlaySkill; trigger: FatePlaySlots["SkillTrigger"] }) {
  const name = useSkillName()(skill);
  const content = <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>;
  return (
    <li className="min-w-0 max-w-full" data-fate-skill={skill.id}>
      {Trigger ? (
        <Trigger skill={skill} label={name}>{content}</Trigger>
      ) : (
        <span className={cn(SKILL_CHIP, skill.rating >= 4 && "border-accent/60 bg-accent/15 font-semibold")}>{content}</span>
      )}
    </li>
  );
}

interface SkillLadderProps {
  trigger?: FatePlaySlots["SkillTrigger"];
  /** The active allocation against the roster (pyramid, diamond, approach spread, point buy). */
  hint: FateSpreadHint;
  /** The allocation's name, for assistive tech. */
  shape: string;
}

/**
 * The adjective ladder (frame 03): +4..+1 always present, empty outer rungs folded into one line,
 * +0 as a compact list that stays reachable (a +0 skill rolls too), and the active spread's
 * columns as guidance that allows blanks. A roll trigger (F6) wraps each chip when wired; without
 * it the chips are plain text, never a button that does nothing.
 */
export function SkillLadder({ trigger, hint, shape }: SkillLadderProps) {
  const t = useTranslations("fatePlay");
  const { skills, openRules } = useFatePlay();
  const rows = fateLadderRows(skills);
  const rung = (rating: number) => t(`ladder.${rating}`);
  return (
    <section className={CARD} data-fate-ladder>
      <div className={CARD_HEAD}>
        <span className="inline-flex items-center gap-1">
          <h2 className={CARD_TITLE}>{t("skills.title")}</h2>
          <button type="button" onClick={() => openRules(sheetRuleTargets.ladder)} aria-label={t("rules.section", { section: t("skills.title") })} className={ICON_BUTTON}>
            <BookOpen className="size-4" aria-hidden />
          </button>
        </span>
        <p
          className={cn("inline-flex flex-wrap items-center gap-x-2 text-sm tabular-nums", hint.complete ? "text-emerald-500 dark:text-emerald-400" : "text-muted-foreground")}
          data-fate-pyramid
          data-complete={hint.complete ? "true" : "false"}
        >
          <span className="sr-only">{shape}</span>
          {hint.kind === "pointBuy" ? (
            <span>{t("skills.points", { spent: hint.spent, budget: hint.budget })}</span>
          ) : (
            hint.columns.map((column) => (
              <span key={column.rating} aria-label={t("skills.column", { rating: signed(column.rating), filled: column.filled, required: column.required })}>
                <span aria-hidden>{column.filled}/{column.required}</span>
              </span>
            ))
          )}
          {hint.complete && <Check className="size-4" aria-label={t("skills.complete", { shape })} />}
        </p>
      </div>
      <ol className="divide-y divide-border/60">
        {rows.map((row) =>
          row.kind === "collapsed" ? (
            <li key={`collapsed-${row.from}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm text-muted-foreground" data-fate-collapsed>
              <span>{t("skills.collapsed", { from: signed(row.from), fromLabel: rung(row.from), to: signed(row.to), toLabel: rung(row.to) })}</span>
              <span className="text-xs">{t("skills.collapsedNote")}</span>
            </li>
          ) : (
            <li
              key={row.rating}
              className={cn("grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2 py-2 @md:grid-cols-[6.5rem_minmax(0,1fr)]", row.rating === 0 && "items-start")}
              data-fate-rung={row.rating}
            >
              <span className="flex flex-col text-sm @md:flex-row @md:items-baseline @md:gap-2">
                <span className="font-semibold tabular-nums text-accent">{signed(row.rating)}</span>
                <span className="text-muted-foreground">{rung(row.rating)}</span>
              </span>
              {row.skills.length === 0 ? (
                <span className={cn(MUTED, "text-xs")} aria-hidden>—</span>
              ) : (
                <ul className={cn("flex min-w-0 flex-wrap gap-1.5", row.rating === 0 && "gap-1")}>
                  {row.skills.map((skill) => <Skill key={skill.id} skill={skill} trigger={trigger} />)}
                </ul>
              )}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
