"use client";

import type { ReactNode } from "react";
import { Dices, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@skald/sheet-sdk/components/ui/radio-group";
import { ABILITIES, type Ability } from "../play/play-model";
import type { LevelUpFeature, LevelUpPlan, SlotsOffer } from "./plan";

/** The level-up dialog's sections (phase 2b §4.1), one per part of the offer. */

export type HpDraft = { mode: "average" } | { mode: "roll"; result: string };
export type AsiDraft = { kind: "abilities"; increases: Partial<Record<Ability, number>> } | { kind: "feat" } | { kind: "later" };

export function Section({ title, children, ...props }: { title: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className="space-y-2 rounded-lg border border-border p-3" aria-label={title} {...props}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Choice({ id, value, label, description }: { id: string; value: string; label: string; description?: string }) {
  const described = description ? `${id}-description` : undefined;
  return (
    <div className="flex min-h-9 items-start gap-2 py-1">
      <RadioGroupItem value={value} id={id} className="mt-0.5" aria-describedby={described} />
      <div className="min-w-0">
        <Label htmlFor={id} className="font-normal">{label}</Label>
        {description && <p id={described} className="text-xs text-muted-foreground" data-level-up-choice-description>{description}</p>}
      </div>
    </div>
  );
}

/**
 * This level's hit point gain: the die's average or the roll plus the Constitution modifier
 * (UAT m6, m7), null while a roll has no valid result.
 */
export function hpGainText(
  t: (key: "gainAverage" | "gainRoll" | "plus" | "minus", values?: Record<string, string | number>) => string,
  die: { average: number } | { roll: number } | null,
  conMod: number,
): string | null {
  if (!die) return null;
  const base = "roll" in die ? die.roll : die.average;
  const values = { total: signed(base + conMod), sign: conMod < 0 ? t("minus") : t("plus"), con: Math.abs(conMod) };
  return "roll" in die ? t("gainRoll", { ...values, roll: die.roll }) : t("gainAverage", { ...values, value: die.average });
}

/** 平均 (nothing written: the formula adds it) or 擲骰 (a d{faces} button or a typed result), with the gain. */
export function HpSection({ plan, gain, draft, onChange, onRoll }: { plan: LevelUpPlan; gain: string | null; draft: HpDraft; onChange: (draft: HpDraft) => void; onRoll: () => void }) {
  const t = useTranslations("levelUp.hp");
  const { faces } = plan.hp;
  const result = draft.mode === "roll" ? Number(draft.result) : NaN;
  const valid = Number.isInteger(result) && result >= 1 && result <= faces;
  return (
    <Section title={t("title")} data-level-up-hp>
      <RadioGroup value={draft.mode} onValueChange={(mode) => onChange(mode === "roll" ? { mode: "roll", result: "" } : { mode: "average" })}>
        <Choice id="level-up-hp-average" value="average" label={t("average")} />
        <Choice id="level-up-hp-roll" value="roll" label={t("roll")} />
      </RadioGroup>
      {draft.mode === "roll" && (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <Button type="button" variant="outline" size="sm" onClick={onRoll}>
            <Dices className="size-4" aria-hidden />
            {t("rollButton", { faces })}
          </Button>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={faces}
            value={draft.result}
            onChange={(event) => onChange({ mode: "roll", result: event.target.value })}
            aria-label={t("result")}
            className="w-20"
          />
        </div>
      )}
      {draft.mode === "roll" && draft.result !== "" && !valid && (
        <p className="pl-6 text-sm text-destructive" role="alert">{t("invalid", { faces })}</p>
      )}
      {gain && <p className="text-sm font-medium tabular-nums" data-level-up-hp-gain>{gain}</p>}
    </Section>
  );
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export type OptionPick = { ref?: string; name: string };

/** The features a run adds, each a checkbox, checked by default; a feature that is a choice gets its options. */
export function FeaturesSection({
  features,
  unchecked,
  onToggle,
  notes = {},
  picks = {},
  onPick = () => {},
  feats = [],
}: {
  features: LevelUpFeature[];
  unchecked: ReadonlySet<string>;
  onToggle: (ref: string) => void;
  /** A note beside a feature (「額外攻擊不疊加」). */
  notes?: Readonly<Record<string, string>>;
  /** The picked option of each feature that is a choice (UAT M4). */
  picks?: Readonly<Record<string, OptionPick | undefined>>;
  onPick?: (ref: string, pick: OptionPick | null) => void;
  /** The feats a `feat` choice offers (Fighting Style feats). */
  feats?: ReadonlyArray<{ ref: string; name: string }>;
}) {
  const t = useTranslations("levelUp.features");
  return (
    <Section title={t("title")} data-level-up-features>
      {features.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="space-y-1">
          {features.map((feature) => {
            const id = `level-up-feature-${feature.ref}`;
            const checked = !unchecked.has(feature.ref);
            return (
              <li key={feature.ref} data-level-up-feature={feature.ref}>
                <div className="flex min-h-9 items-center gap-2">
                  <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(feature.ref)} />
                  <Label htmlFor={id} className="font-normal">{feature.name}</Label>
                  {notes[feature.ref] && <span className="text-xs text-muted-foreground" data-level-up-feature-note>{notes[feature.ref]}</span>}
                </div>
                {feature.choice && checked && (
                  <FeatureChoiceGroup feature={feature} pick={picks[feature.ref]} onPick={(pick) => onPick(feature.ref, pick)} feats={feats} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** One feature's options as a radio group, with 稍後再選 (稍後在資料庫選 for a feat). */
function FeatureChoiceGroup({ feature, pick, onPick, feats }: { feature: LevelUpFeature; pick: OptionPick | undefined; onPick: (pick: OptionPick | null) => void; feats: ReadonlyArray<{ ref: string; name: string }> }) {
  const t = useTranslations("levelUp.features");
  const choice = feature.choice;
  if (!choice) return null;
  const LATER = "";
  const named = (names: readonly string[]) => names.map((name) => ({ value: `named:${name}`, pick: { name } }));
  // A Fighting Style: a feat, or an option the feature names instead (Ranger's Druidic Warrior, UAT F006).
  const options: Array<{ value: string; pick: OptionPick }> =
    choice.kind === "feature"
      ? choice.options.map((option) => ({ value: option.ref, pick: { ref: option.ref, name: option.name } }))
      : choice.kind === "feat"
        ? [...feats.map((feat) => ({ value: feat.ref, pick: { ref: feat.ref, name: feat.name } })), ...named(choice.alternatives?.options ?? [])]
        : named(choice.options);
  const value = pick ? (pick.ref ?? `named:${pick.name}`) : LATER;
  const key = (suffix: string) => `level-up-option-${feature.ref}-${suffix}`;
  return (
    <RadioGroup
      className="gap-0 pb-1 pl-6"
      value={value}
      onValueChange={(next) => onPick(options.find((option) => option.value === next)?.pick ?? null)}
      aria-label={t("choose", { name: feature.name })}
      data-level-up-feature-choice={choice.kind}
    >
      {options.map((option) => (
        <Choice key={option.value} id={key(option.value)} value={option.value} label={option.pick.name} />
      ))}
      <Choice id={key("later")} value={LATER} label={choice.kind === "feat" ? t("featLater") : t("later")} />
    </RadioGroup>
  );
}

/** The known subclass, or the picker of the class's subclasses with 「稍後再選」. */
export function SubclassSection({ plan, picked, onPick }: { plan: LevelUpPlan; picked: string | null; onPick: (ref: string | null) => void }) {
  const t = useTranslations("levelUp.subclass");
  const { known, choose, options } = plan.subclass;
  // A known subclass with nothing new at this level needs no card (UAT m9).
  if (known && (plan.subclass.offers[known.ref] ?? []).length === 0) return null;
  if (known) {
    return (
      <Section title={t("title")} data-level-up-subclass>
        <p className="text-sm">{t("known", { name: known.name })}</p>
      </Section>
    );
  }
  if (!choose) return null;
  const LATER = "";
  return (
    <Section title={t("title")} data-level-up-subclass>
      {options.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
      <RadioGroup value={picked ?? LATER} onValueChange={(value) => onPick(value === LATER ? null : value)}>
        {options.map((option) => (
          <Choice key={option.ref} id={`level-up-subclass-${option.ref}`} value={option.ref} label={option.name} description={option.summary} />
        ))}
        <Choice id="level-up-subclass-later" value={LATER} label={t("later")} />
      </RadioGroup>
    </Section>
  );
}

/** 屬性值提升 (+2 to one or +1 to two, capped), 其他專長, or decide later. */
export function AsiSection({ plan, draft, onChange }: { plan: LevelUpPlan; draft: AsiDraft; onChange: (draft: AsiDraft) => void }) {
  const t = useTranslations("levelUp.asi");
  const tAbility = useTranslations("ability");
  const asi = plan.asi;
  if (!asi) return null;
  const increases = draft.kind === "abilities" ? draft.increases : {};
  const used = Object.values(increases).reduce((sum, value) => sum + (value ?? 0), 0);
  const step = (ability: Ability, by: 1 | -1) => {
    const next = { ...increases, [ability]: (increases[ability] ?? 0) + by };
    if (!next[ability]) delete next[ability];
    onChange({ kind: "abilities", increases: next });
  };
  return (
    <Section title={t("title")} data-level-up-asi>
      <RadioGroup value={draft.kind} onValueChange={(kind) => onChange(kind === "abilities" ? { kind, increases: {} } : { kind: kind as "feat" | "later" })}>
        <Choice id="level-up-asi-abilities" value="abilities" label={t("abilities")} />
        {/* The ± grid sits under its own option, not after the last one (UAT m9). */}
        {draft.kind === "abilities" && (
          <div className="space-y-1 pb-1 pl-6" data-level-up-asi-grid>
            <p className="text-xs text-muted-foreground" data-level-up-asi-points>{t("points", { used, total: asi.points })}</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {ABILITIES.map((ability) => {
                const from = asi.abilities[ability];
                const added = increases[ability] ?? 0;
                const to = Math.min(asi.cap, from + added);
                const name = tAbility(ability);
                const canAdd = used < asi.points && added < asi.points && from + added < asi.cap;
                return (
                  <li key={ability} className="flex items-center justify-between gap-2" data-level-up-ability={ability}>
                    <span className="text-sm">
                      {name} <span className="tabular-nums text-muted-foreground">{t("score", { from, to })}</span>
                    </span>
                    <span className="flex gap-1">
                      <Button type="button" variant="outline" size="icon" className="size-8" disabled={added === 0} onClick={() => step(ability, -1)} aria-label={t("decrease", { ability: name })}>
                        <Minus className="size-4" aria-hidden />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="size-8" disabled={!canAdd} onClick={() => step(ability, 1)} aria-label={t("increase", { ability: name })}>
                        <Plus className="size-4" aria-hidden />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <Choice id="level-up-asi-feat" value="feat" label={t("feat")} />
        {draft.kind === "feat" && <p className="pb-1 pl-6 text-sm text-muted-foreground">{t("featHint")}</p>}
        <Choice id="level-up-asi-later" value="later" label={t("later")} />
      </RadioGroup>
    </Section>
  );
}

/** The new slot totals: a checkbox, on when the sheet matches the class table now or holds no slots yet. */
export function SlotsSection({ slots, apply, onApply }: { slots: SlotsOffer | null; apply: boolean; onApply: (apply: boolean) => void }) {
  const t = useTranslations("levelUp.slots");
  if (!slots || !slots.changed) return null;
  const tableLines = slots.after.flatMap((after, index) => (after !== slots.before[index] ? [t("level", { level: index + 1, from: slots.before[index], to: after })] : []));
  // A repair with an unchanged table (UAT F002): the sheet's totals to the target's.
  const lines = tableLines.length > 0 ? tableLines : slots.after.flatMap((after, index) => (after !== slots.sheet.slots[index] ? [t("level", { level: index + 1, from: slots.sheet.slots[index], to: after })] : []));
  const pact = slots.pact;
  if (pact && (pact.before.slots !== pact.after.slots || pact.before.level !== pact.after.level)) {
    lines.push(t("pact", { from: pact.before.slots, to: pact.after.slots, fromLevel: pact.before.level, toLevel: pact.after.level }));
  }
  return (
    <Section title={t("title")} data-level-up-slots>
      <ul className="text-sm tabular-nums">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {slots.unset ? (
        <p className="text-sm text-muted-foreground" data-level-up-slots-unset>{t("unset")}</p>
      ) : (
        !slots.matches && <p className="text-sm text-muted-foreground" data-level-up-slots-differ>{t("differs")}</p>
      )}
      <div className="flex min-h-9 items-center gap-2">
        <Checkbox id="level-up-slots" checked={apply} onCheckedChange={(value) => onApply(value === true)} />
        <Label htmlFor="level-up-slots" className="font-normal">{t("apply")}</Label>
      </div>
    </Section>
  );
}

/** Cantrip and prepared counts before and after, with the sheet's count: the player adds the spells. */
export function SpellsSection({ plan }: { plan: LevelUpPlan }) {
  const t = useTranslations("levelUp.spells");
  const spells = plan.spells;
  if (!spells) return null;
  const lines: string[] = [];
  if (spells.cantrips && spells.cantrips.before !== spells.cantrips.after) {
    lines.push(t("cantrips", { from: spells.cantrips.before, to: spells.cantrips.after, have: spells.sheet.cantrips }));
  }
  if (spells.prepared && spells.prepared.before !== spells.prepared.after) {
    lines.push(t("prepared", { from: spells.prepared.before, to: spells.prepared.after, have: spells.sheet.prepared }));
  }
  if (lines.length === 0) return null;
  return (
    <Section title={t("title")} data-level-up-spells>
      <ul className="text-sm tabular-nums">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
    </Section>
  );
}

/** Other class columns that change (Rages 3→4, Eldritch Invocations 1→3): information only. */
export function ColumnsSection({ plan, labels }: { plan: LevelUpPlan; labels: Readonly<Record<number, string>> }) {
  const t = useTranslations("levelUp.columns");
  if (plan.columns.length === 0) return null;
  return (
    <Section title={t("title")} data-level-up-columns>
      <ul className="text-sm tabular-nums">
        {plan.columns.map((column) => (
          <li key={column.index}>{t("row", { label: labels[column.index] ?? column.label, from: String(column.before), to: String(column.after) })}</li>
        ))}
      </ul>
    </Section>
  );
}
