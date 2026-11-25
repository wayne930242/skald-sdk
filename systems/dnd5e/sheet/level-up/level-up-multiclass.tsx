"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@skald/sheet-sdk/components/ui/radio-group";
import type { Prerequisite } from "../../reference/multiclass";
import type { LevelUpPlan } from "./plan";
import { Section } from "./level-up-parts";
import { useListText } from "./list-text";

/** The level-up dialog's multiclass parts (CLASS-IMPL §7.4): the class picker, prerequisites, gains, notes. */

/** A class the sheet does not have yet, offered by 新增職業. */
export interface ClassCandidate {
  id: string;
  name: string;
  prerequisites: Prerequisite[];
  /** A pack or homebrew class: listed after the built-in ones, past a divider. */
  custom: boolean;
}

export interface GainsDraft {
  off: ReadonlySet<string>;
  skills: readonly string[];
  tools: readonly string[];
}

/** "Needs Strength 13, Charisma 13 (now 10/8)": the unmet scores in one list, the current ones after (UAT m12, m25). */
export function usePrerequisiteText(): (missing: readonly Prerequisite[]) => string {
  const t = useTranslations("levelUp.multiclass");
  const tAbility = useTranslations("ability");
  const list = useListText();
  return (missing) => {
    const abilities = missing.map((entry) =>
      t("prerequisiteScore", {
        ability: "anyOf" in entry ? entry.anyOf.map(({ ability }) => tAbility(ability)).join(t("abilityOr")) : tAbility(entry.ability),
        need: entry.need,
      }),
    );
    const have = missing.flatMap((entry) => ("anyOf" in entry ? entry.anyOf.map(({ have: score }) => score) : [entry.have])).join(t("scoreSeparator"));
    return t("prerequisite", { abilities: list(abilities), have });
  };
}

/**
 * 新增職業: the classes not on the sheet, each with its prerequisite badge. Once one is picked the
 * list folds to that class and 更換, so the rest of the offer is in view (UAT M1).
 */
export function ClassPicker({ candidates, picked, onPick, onChange }: { candidates: ClassCandidate[]; picked: string | null; onPick: (id: string) => void; onChange: () => void }) {
  const t = useTranslations("levelUp.multiclass");
  const badge = usePrerequisiteText();
  const chosen = picked ? candidates.find((candidate) => candidate.id === picked) : undefined;
  if (picked) {
    return (
      <Section title={t("pickTitle")} data-level-up-class-picker data-level-up-picked={picked}>
        <div className="flex min-h-9 flex-wrap items-center gap-2">
          <Check className="size-4 text-primary" aria-hidden />
          <span className="text-sm font-medium">{chosen?.name ?? picked}</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onChange} data-level-up-change-class>
            {t("change")}
          </Button>
        </div>
      </Section>
    );
  }
  return (
    <Section title={t("pickTitle")} data-level-up-class-picker>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pickNone")}</p>
      ) : (
        <RadioGroup value="" onValueChange={onPick}>
          {candidates.map((candidate, index) => {
            const id = `level-up-add-${candidate.id}`;
            const unmet = candidate.prerequisites.length > 0;
            const divider = candidate.custom && index > 0 && !candidates[index - 1].custom;
            return (
              <div key={candidate.id} className={cn("flex min-h-9 flex-wrap items-center gap-2", divider && "mt-1 border-t border-border pt-2")} data-level-up-candidate={candidate.id} data-level-up-candidate-custom={candidate.custom || undefined}>
                <RadioGroupItem value={candidate.id} id={id} />
                <Label htmlFor={id} className="font-normal">{candidate.name}</Label>
                <span
                  className={unmet ? "rounded bg-destructive/10 px-1.5 text-xs text-destructive" : "rounded bg-muted px-1.5 text-xs text-muted-foreground"}
                  data-level-up-prerequisite={unmet ? "unmet" : "met"}
                >
                  {unmet ? badge(candidate.prerequisites) : t("prerequisiteMet")}
                </span>
              </div>
            );
          })}
        </RadioGroup>
      )}
    </Section>
  );
}

/** The new class's unmet 13s and the DM-approval checkbox that allows it anyway. */
export function PrerequisiteSection({ plan, allowed, onAllow }: { plan: LevelUpPlan; allowed: boolean; onAllow: (allowed: boolean) => void }) {
  const t = useTranslations("levelUp.multiclass");
  const text = usePrerequisiteText();
  const missing = plan.prerequisites ?? [];
  if (missing.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border border-destructive/40 p-3" data-level-up-prerequisites>
      <p className="text-sm text-destructive" role="alert">{text(missing)}</p>
      <div className="flex min-h-9 items-center gap-2">
        <Checkbox id="level-up-dm-override" checked={allowed} onCheckedChange={(value) => onAllow(value === true)} />
        <Label htmlFor="level-up-dm-override" className="font-normal">{t("dmOverride")}</Label>
      </div>
    </div>
  );
}

/** The proficiencies the new class gives: armor, weapons, granted tools (checkboxes), skill and tool picks. */
export function GainsSection({ plan, draft, onChange }: { plan: LevelUpPlan; draft: GainsDraft; onChange: (draft: GainsDraft) => void }) {
  const t = useTranslations("levelUp.multiclass.gains");
  const tField = useTranslations("field");
  const tSkill = useTranslations("skill");
  const gains = plan.gains;
  if (!gains) return null;
  const toggle = (key: string) => {
    const off = new Set(draft.off);
    if (off.has(key)) off.delete(key);
    else off.add(key);
    onChange({ ...draft, off });
  };
  const toggles: Array<{ key: string; label: string }> = [
    ...gains.armor.map((field) => ({ key: field, label: tField(field) })),
    ...(gains.weapons.length > 0 ? [{ key: "weapons", label: t("weapons", { items: gains.weapons.join("、") }) }] : []),
    ...gains.tools.grant.map((tool) => ({ key: tool.ref, label: t("toolGrant", { name: tool.name }) })),
  ];
  const skills = gains.skills;
  const pickSkill = (id: string) => {
    const has = draft.skills.includes(id);
    onChange({ ...draft, skills: has ? draft.skills.filter((skill) => skill !== id) : [...draft.skills, id] });
  };
  const choice = gains.tools.choice;
  const setTool = (index: number, value: string) => {
    const tools = Array.from({ length: choice?.count ?? 0 }, (_, n) => draft.tools[n] ?? "");
    tools[index] = value;
    onChange({ ...draft, tools });
  };
  return (
    <Section title={t("title")} data-level-up-gains>
      {!gains.known && <p className="text-sm text-muted-foreground">{t("unknown")}</p>}
      {toggles.length > 0 && (
        <ul className="space-y-1">
          {toggles.map((item) => {
            const id = `level-up-gain-${item.key}`;
            return (
              <li key={item.key} className="flex min-h-9 items-center gap-2" data-level-up-gain={item.key}>
                <Checkbox id={id} checked={!draft.off.has(item.key)} onCheckedChange={() => toggle(item.key)} />
                <Label htmlFor={id} className="font-normal">{item.label}</Label>
              </li>
            );
          })}
        </ul>
      )}
      {skills && (
        <fieldset className="space-y-1" data-level-up-gain-skills>
          <legend className="text-sm">{t("skills", { count: skills.count })}</legend>
          <ul className="grid gap-1 sm:grid-cols-2">
            {skills.from.map((skill) => {
              const id = `level-up-gain-skill-${skill}`;
              const picked = draft.skills.includes(skill);
              return (
                <li key={skill} className="flex min-h-9 items-center gap-2">
                  <Checkbox id={id} checked={picked} disabled={!picked && draft.skills.length >= skills.count} onCheckedChange={() => pickSkill(skill)} />
                  <Label htmlFor={id} className="font-normal">{tSkill.has(skill) ? tSkill(skill) : skill}</Label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {choice &&
        Array.from({ length: choice.count }, (_, index) => (
          <Input
            key={index}
            value={draft.tools[index] ?? ""}
            onChange={(event) => setTool(index, event.target.value)}
            aria-label={t("toolChoice", { category: choice.category, n: index + 1 })}
            data-level-up-gain-tool={index}
          />
        ))}
      <p className="text-sm text-muted-foreground" data-level-up-saves-note>{t("savesNote")}</p>
    </Section>
  );
}

/** Unarmored Defense of a new Barbarian or Monk, in its own 護甲等級 section (UAT m13): a checkbox while the sheet has none, else a note. */
export function UnarmoredSection({ plan, name, apply, onApply }: { plan: LevelUpPlan; name: string; apply: boolean; onApply: (apply: boolean) => void }) {
  const t = useTranslations("levelUp.multiclass.unarmored");
  const offer = plan.unarmoredDefense;
  if (!offer) return null;
  return (
    <Section title={t("title")} data-level-up-armor-class>
      {offer.settable ? (
        <div className="flex min-h-9 items-center gap-2" data-level-up-unarmored>
          <Checkbox id="level-up-unarmored" checked={apply} onCheckedChange={(value) => onApply(value === true)} />
          <Label htmlFor="level-up-unarmored" className="font-normal">{t("set", { name })}</Label>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" role="note" data-level-up-unarmored-note>{t("note")}</p>
      )}
    </Section>
  );
}
