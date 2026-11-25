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
import type { LevelUpFeature, LevelUpPlan } from "./plan";

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

function Choice({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <div className="flex min-h-9 items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="font-normal">{label}</Label>
    </div>
  );
}

/** 平均 (nothing written: the formula adds it) or 擲骰 (a d{faces} button or a typed result). */
export function HpSection({ plan, draft, onChange, onRoll }: { plan: LevelUpPlan; draft: HpDraft; onChange: (draft: HpDraft) => void; onRoll: () => void }) {
  const t = useTranslations("levelUp.hp");
  const { faces, average } = plan.hp;
  const result = draft.mode === "roll" ? Number(draft.result) : NaN;
  const valid = Number.isInteger(result) && result >= 1 && result <= faces;
  return (
    <Section title={t("title")} data-level-up-hp>
      <RadioGroup value={draft.mode} onValueChange={(mode) => onChange(mode === "roll" ? { mode: "roll", result: "" } : { mode: "average" })}>
        <Choice id="level-up-hp-average" value="average" label={t("average", { value: average })} />
        <Choice id="level-up-hp-roll" value="roll" label={t("roll")} />
      </RadioGroup>
      {draft.mode === "roll" && (
        <div className="space-y-1 pl-6">
          <div className="flex flex-wrap items-center gap-2">
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
          {draft.result !== "" && (
            <p className="text-sm text-muted-foreground" role={valid ? undefined : "alert"}>
              {valid ? t("delta", { delta: signed(result - average) }) : t("invalid", { faces })}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** The features a run adds, each a checkbox, checked by default. */
export function FeaturesSection({
  features,
  unchecked,
  onToggle,
  notes = {},
}: {
  features: LevelUpFeature[];
  unchecked: ReadonlySet<string>;
  onToggle: (ref: string) => void;
  /** A note beside a feature (「額外攻擊不疊加」). */
  notes?: Readonly<Record<string, string>>;
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
            return (
              <li key={feature.ref} className="flex min-h-9 items-center gap-2" data-level-up-feature={feature.ref}>
                <Checkbox id={id} checked={!unchecked.has(feature.ref)} onCheckedChange={() => onToggle(feature.ref)} />
                <Label htmlFor={id} className="font-normal">{feature.name}</Label>
                {notes[feature.ref] && <span className="text-xs text-muted-foreground" data-level-up-feature-note>{notes[feature.ref]}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** The known subclass, or the picker of the class's subclasses with 「稍後再選」. */
export function SubclassSection({ plan, picked, onPick }: { plan: LevelUpPlan; picked: string | null; onPick: (ref: string | null) => void }) {
  const t = useTranslations("levelUp.subclass");
  const { known, choose, options } = plan.subclass;
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
          <Choice key={option.ref} id={`level-up-subclass-${option.ref}`} value={option.ref} label={option.name} />
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
        <Choice id="level-up-asi-feat" value="feat" label={t("feat")} />
        <Choice id="level-up-asi-later" value="later" label={t("later")} />
      </RadioGroup>
      {draft.kind === "abilities" && (
        <div className="space-y-1 pl-6">
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
      {draft.kind === "feat" && <p className="pl-6 text-sm text-muted-foreground">{t("featHint")}</p>}
    </Section>
  );
}

/** The new slot totals: a checkbox, on when the sheet matches the class table now. */
export function SlotsSection({ plan, apply, onApply }: { plan: LevelUpPlan; apply: boolean; onApply: (apply: boolean) => void }) {
  const t = useTranslations("levelUp.slots");
  const slots = plan.slots;
  if (!slots || !slots.changed) return null;
  const lines = slots.after.flatMap((after, index) => (after !== slots.before[index] ? [t("level", { level: index + 1, from: slots.before[index], to: after })] : []));
  const pact = slots.pact;
  if (pact && (pact.before.slots !== pact.after.slots || pact.before.level !== pact.after.level)) {
    lines.push(t("pact", { from: pact.before.slots, to: pact.after.slots, fromLevel: pact.before.level, toLevel: pact.after.level }));
  }
  return (
    <Section title={t("title")} data-level-up-slots>
      <ul className="text-sm tabular-nums">
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {!slots.matches && <p className="text-sm text-muted-foreground" data-level-up-slots-differ>{t("differs")}</p>}
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
