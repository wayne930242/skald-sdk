"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { rollDice } from "@skald/dice";
import type { LoadedSystem } from "@skald/types/system";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { buildCompendiumRow } from "../compendium-rows";
import type { ReferenceContextValue } from "../use-reference-context";
import type { LevelUpRequest } from "../play/play-context";
import { ABILITIES } from "../play/play-model";
import { applyLevelUp, runIds, type LevelUpChoices, type LevelUpFollowUp, type LevelUpRowBuilder } from "./apply";
import { useListText } from "./list-text";
import { useLevelUpNotice } from "./level-up-notice";
import { offeredFeatures, slotsDefaultOn, slotsFor, type LevelUpPlan } from "./plan";
import { GainsSection, PrerequisiteSection, UnarmoredSection, type GainsDraft } from "./level-up-multiclass";
import { AsiSection, ColumnsSection, FeaturesSection, HpSection, SlotsSection, SpellsSection, SubclassSection, hpGainText, type AsiDraft, type HpDraft, type OptionPick } from "./level-up-parts";

/** The level-up dialog's form: one scrollable body and a footer that stays in view (UAT M1). */

export type Applied = {
  level: number;
  followUp: LevelUpFollowUp;
  /** The run's undo token (`useLevelUpNotice`): 復原上次升級 while it is the latest. */
  token: symbol;
  /** What the run changed, one line each. */
  summary: string[];
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const rowsIn = (data: Record<string, unknown>, list: string) => (Array.isArray(data[list]) ? (data[list] as Array<Record<string, unknown>>) : []);

/**
 * The dialog below its header: the body scrolls, the footer (取消, 套用 and why 套用 is off) never
 * leaves the dialog, at any width and with any number of classes in the body.
 */
export function LevelUpShell({
  children,
  onCancel,
  onApply,
  blocked,
  error,
}: {
  children: ReactNode;
  onCancel: () => void;
  onApply?: () => void;
  /** Why 套用 is off; null when it can be pressed. */
  blocked: string | null;
  error?: string | null;
}) {
  const t = useTranslations("levelUp");
  return (
    <>
      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-1" data-level-up-body>
        {children}
      </div>
      <div className="shrink-0 space-y-2 border-t border-border pt-3" data-level-up-footer>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {blocked && (
            <p id="level-up-blocked" className="mr-auto min-w-0 flex-1 basis-48 text-xs text-muted-foreground" data-level-up-blocked>
              {blocked}
            </p>
          )}
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onApply} disabled={blocked !== null || !onApply} aria-describedby={blocked ? "level-up-blocked" : undefined} data-level-up-apply>
            {t("apply")}
          </Button>
        </div>
      </div>
    </>
  );
}

export function LevelUpForm({
  plan,
  before,
  featChoices,
  columnLabels,
  unarmoredName,
  request,
  system,
  context,
  inTable,
  onApplied,
  onClose,
}: {
  plan: LevelUpPlan;
  /** What the body shows above the form (the new-class picker). */
  before?: ReactNode;
  /** The feats a Fighting Style choice offers. */
  featChoices: ReadonlyArray<{ ref: string; name: string }>;
  columnLabels: Readonly<Record<number, string>>;
  /** The localized class name of the offered Unarmored Defense. */
  unarmoredName: string;
  request: LevelUpRequest;
  system: LoadedSystem;
  context: ReferenceContextValue;
  inTable: boolean;
  onApplied: (applied: Applied) => void;
  onClose: () => void;
}) {
  const t = useTranslations("levelUp");
  const tMulti = useTranslations("levelUp.multiclass");
  const tHp = useTranslations("levelUp.hp");
  const tAbility = useTranslations("ability");
  const list = useListText();
  const notice = useLevelUpNotice(request);
  const [hp, setHp] = useState<HpDraft>({ mode: "average" });
  // Extra Attack another class already gives starts unchecked: it never stacks.
  const stacks = plan.extraAttackStacks ?? [];
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set(stacks));
  const [allowed, setAllowed] = useState(false);
  const [gains, setGains] = useState<GainsDraft>({ off: new Set(), skills: [], tools: [] });
  const [unarmored, setUnarmored] = useState(true);
  const [picks, setPicks] = useState<Readonly<Record<string, OptionPick | undefined>>>({});
  const [subclass, setSubclass] = useState<string | null>(null);
  const [asi, setAsi] = useState<AsiDraft>({ kind: "abilities", increases: {} });
  // null: the offer's default (on when the sheet matches the table or holds no slots yet); the offer follows the picked subclass.
  const [slotsChoice, setSlotsChoice] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One row per pick for the whole run: a re-run of the apply inside the updater keeps the row ids the undo removes.
  const built = useRef(new Map<string, ReturnType<LevelUpRowBuilder>>());
  const buildRow: LevelUpRowBuilder = (tab, ref, name) => {
    const key = `${tab}|${ref}`;
    if (!built.current.has(key)) built.current.set(key, buildCompendiumRow(tab, ref, name, system, context, !inTable));
    return built.current.get(key) ?? null;
  };

  const features = offeredFeatures(plan, plan.subclass.choose ? subclass : plan.subclass.known?.ref ?? null);
  const slotOffer = slotsFor(plan, plan.subclass.choose ? subclass : null);
  const slots = slotsChoice ?? slotsDefaultOn(slotOffer);
  const rolled = hp.mode === "roll" ? Number(hp.result) : NaN;
  const hpReady = hp.mode === "average" || (Number.isInteger(rolled) && rolled >= 1 && rolled <= plan.hp.faces);
  const asiUsed = asi.kind === "abilities" ? Object.values(asi.increases).reduce((sum, value) => sum + (value ?? 0), 0) : 0;
  const asiReady = !plan.asi || asi.kind !== "abilities" || asiUsed === plan.asi.points;
  const issues = plan.issues ?? [];
  const prerequisitesReady = (plan.prerequisites ?? []).length === 0 || allowed;
  const blocked =
    issues.length > 0
      ? t("blocked.issues")
      : !prerequisitesReady
        ? t("blocked.prerequisites")
        : !hpReady
          ? t("blocked.hp")
          : !asiReady
            ? t("blocked.asi", { left: (plan.asi?.points ?? 0) - asiUsed })
            : null;
  const notes = Object.fromEntries(stacks.map((ref) => [ref, tMulti("extraAttack")]));

  const toggle = (ref: string) =>
    setUnchecked((previous) => {
      const next = new Set(previous);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  const characterTo = plan.character?.to ?? plan.toLevel;
  const issuesText = tMulti("issues", { items: list(issues.map((issue) => tMulti(`issue.${issue}`))) });
  const conMod = Math.floor((num(request.current().con, 10) - 10) / 2);
  const hpGain = hpGainText(tHp, hp.mode === "roll" ? (hpReady ? { roll: rolled } : null) : { average: plan.hp.average }, conMod);

  /** What the run changed, for the result screen (UAT m8). */
  const summarize = (before: Record<string, unknown>, after: Record<string, unknown>): string[] => {
    const lines: string[] = [];
    if (plan.newClass) lines.push(t("result.newClass", { name: plan.newClass.name }));
    if (hpGain) lines.push(hpGain);
    const added = (listId: string) => {
      const had = new Set(rowsIn(before, listId).map((row) => row.id));
      return rowsIn(after, listId).filter((row) => !had.has(row.id)).map((row) => text(row.name)).filter(Boolean);
    };
    const featureNames = added("features");
    if (featureNames.length > 0) lines.push(t("result.features", { items: list(featureNames) }));
    const picked = plan.subclass.options.find((option) => option.ref === subclass);
    if (plan.subclass.choose && picked) lines.push(t("result.subclass", { name: picked.name }));
    const raised = ABILITIES.filter((ability) => after[ability] !== before[ability]).map((ability) => t("result.score", { ability: tAbility(ability), from: num(before[ability], 10), to: num(after[ability], 10) }));
    if (raised.length > 0) lines.push(t("result.asi", { items: list(raised) }));
    const featNames = added("feats").filter((name) => name !== plan.asi?.featName);
    if (featNames.length > 0) lines.push(t("result.featRows", { items: list(featNames) }));
    if (Array.from({ length: 9 }, (_, index) => `slot${index + 1}Total`).concat("pactSlots", "pactSlotLevel").some((field) => after[field] !== before[field])) lines.push(t("result.slots"));
    return lines;
  };

  const apply = () => {
    const choices: LevelUpChoices = {
      hp: hp.mode === "roll" ? { mode: "roll", result: rolled } : { mode: "average" },
      unchecked: [...unchecked],
      subclass,
      asi: asi.kind === "abilities" ? { kind: "abilities", increases: asi.increases } : asi.kind === "feat" ? { kind: "feat" } : null,
      slots,
      checked: stacks.filter((ref) => !unchecked.has(ref)),
      ...(plan.gains ? { gains: { off: [...gains.off], skills: gains.skills, tools: gains.tools.filter((name) => name.trim()) } } : {}),
      unarmoredDefense: unarmored,
      options: Object.fromEntries(Object.entries(picks).filter((entry): entry is [string, OptionPick] => entry[1] !== undefined)),
      optionRowName: (feature, option) => t("features.optionRow", { feature, option }),
    };
    const now = request.current();
    const ids = runIds();
    const result = applyLevelUp(now, plan, choices, buildRow, ids);
    if (!result.ok) {
      setError(result.reason === "snapshot" ? t("tooMuchText", { kb: Math.ceil(result.bytes / 1024) }) : result.reason === "issues" ? issuesText : t("stale"));
      return;
    }
    // One data update. The sheet may have moved since `now` (a remote change): apply again on the latest data.
    request.update((previous) => {
      if (previous === now) return result.after;
      const again = applyLevelUp(previous, plan, choices, buildRow, ids);
      return again.ok ? again.after : previous;
    });
    const token = notice.announce(characterTo, result.undo, now, result.after);
    onApplied({ level: characterTo, followUp: result.followUp, token, summary: summarize(now, result.after) });
  };

  return (
    <LevelUpShell onCancel={onClose} onApply={apply} blocked={blocked} error={error}>
      {before}
      {issues.length > 0 && <p className="text-sm text-destructive" role="alert" data-level-up-issues>{issuesText}</p>}
      {issues.length === 0 && <PrerequisiteSection plan={plan} allowed={allowed} onAllow={setAllowed} />}
      {issues.length === 0 && !plan.classFound && <p className="text-sm text-muted-foreground" role="note" data-level-up-no-class>{t("noClass")}</p>}
      {issues.length === 0 && <HpSection
        plan={plan}
        gain={hpGain}
        draft={hp}
        onChange={setHp}
        onRoll={() => setHp({ mode: "roll", result: String(rollDice({ count: 1, sides: plan.hp.faces }).subtotal) })}
      />}
      {issues.length === 0 && plan.classFound && (
        <>
          <SubclassSection plan={plan} picked={subclass} onPick={setSubclass} />
          <FeaturesSection
            features={features}
            unchecked={unchecked}
            onToggle={toggle}
            notes={notes}
            picks={picks}
            onPick={(ref, pick) => setPicks((previous) => ({ ...previous, [ref]: pick ?? undefined }))}
            feats={featChoices}
          />
          <GainsSection plan={plan} draft={gains} onChange={setGains} />
          <UnarmoredSection plan={plan} name={unarmoredName} apply={unarmored} onApply={setUnarmored} />
          <AsiSection plan={plan} draft={asi} onChange={setAsi} />
          {plan.epicBoon && <p className="text-sm" data-level-up-epic-boon>{t("epicBoon")}</p>}
          <SlotsSection slots={slotOffer} apply={slots} onApply={setSlotsChoice} />
          {plan.slotsUnknown && <p className="text-sm text-muted-foreground" role="note" data-level-up-slots-unknown>{tMulti("slotsUnknown")}</p>}
          <SpellsSection plan={plan} />
          <ColumnsSection plan={plan} labels={columnLabels} />
        </>
      )}
    </LevelUpShell>
  );
}
