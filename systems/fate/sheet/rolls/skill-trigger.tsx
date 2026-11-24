"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { defaultFateRollOptions, type FateRollOptions } from "../../domain/roll";
import { SKILL_CHIP } from "../play/card-styles";
import { useFatePlay } from "../play/play-context";
import { signed } from "../play/skill-ladder";
import type { FateSkillTriggerProps } from "../play/slots";
import { useFateRollGesture } from "./roll-gesture";
import { FateRollMessages } from "./roll-messages";
import { FateRollOptionsDialog } from "./roll-options-dialog";
import { useFateRolls } from "./use-fate-rolls";

const chipTone = (rating: number) => rating >= 4 && "border-accent/60 bg-accent/15 font-semibold";

function PlainChip({ skill, children }: FateSkillTriggerProps) {
  return <span className={cn(SKILL_CHIP, chipTone(skill.rating))}>{children}</span>;
}

function Trigger(props: FateSkillTriggerProps) {
  const { skill, label, children } = props;
  const t = useTranslations("fateRolls.trigger");
  const tr = useTranslations("renderer");
  const rolls = useFateRolls();
  const { editSkill } = useFatePlay();
  const [options, setOptions] = useState(false);
  const roll = (chosen: FateRollOptions) => void rolls.rollSkill(skill, label, chosen);
  const gesture = useFateRollGesture({
    enabled: rolls.canRoll,
    onRoll: () => roll(defaultFateRollOptions()),
    onOptions: () => setOptions(true),
    onEdit: editSkill ? (chip) => editSkill(skill.id, chip) : undefined,
  });
  const editing = gesture.editing;
  // Edit mode shows no options: ones opened in play close (B-023).
  if (editing && options) setOptions(false);
  // No roller on this host, or edit mode with no editor for this skill: the chip stays text,
  // never a button that does nothing (B-023 bare control).
  if (editing ? !editSkill : !rolls.canRoll) return <PlainChip {...props} />;
  return (
    <>
      <button
        type="button"
        {...gesture.props}
        aria-label={editing ? tr("editValue", { name: label }) : t("name", { skill: label, rating: signed(skill.rating) })}
        aria-busy={(!editing && rolls.busy) || undefined}
        data-fate-roll-trigger={skill.id}
        className={cn(
          SKILL_CHIP,
          chipTone(skill.rating),
          "cursor-pointer select-none touch-manipulation [-webkit-touch-callout:none] hover:border-accent/60 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {children}
      </button>
      {options && !editing && (
        <FateRollOptionsDialog
          skill={skill}
          label={label}
          rules={rolls.rules}
          onClose={() => setOptions(false)}
          onRoll={(chosen) => {
            setOptions(false);
            roll(chosen);
          }}
        />
      )}
    </>
  );
}

/**
 * The ladder's roll trigger (slot `SkillTrigger`, B-022): a tap, click, Enter or Space rolls the
 * skill with the defaults (overcome against +0, nothing selected), +0 skills included; a long
 * press, right click, Shift+Enter or the menu key opens the options without rolling. In edit mode
 * (B-023) the same chip opens the roster editor at its skill (name and rank), or is text when the
 * sheet has none.
 */
export function FateSkillTrigger(props: FateSkillTriggerProps) {
  return (
    <Suspense fallback={<PlainChip {...props} />}>
      <FateRollMessages>
        <Trigger {...props} />
      </FateRollMessages>
    </Suspense>
  );
}
