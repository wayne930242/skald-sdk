"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { InfoTip } from "@skald/sheet-sdk/components/ui/info-tip";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useTableSetupSheet, useTableSetupSheetConfig } from "@skald/sheet-sdk/modules/systems/ui/table-setup-sheet";
import { applyFateRecipe, checkFateAllocation, FATE_PRESET_AXES, fateAxisOptions, selectFatePresetOption, type FatePresetAxis, type FatePresetLabels } from "../../domain/presets";
import { fateRecord } from "../../domain/normalize";
import { FATE_CONTROL, FateDialog } from "../harm/fate-dialog";
import { TEXT_BUTTON, MUTED } from "../play/card-styles";
import { useFatePlay } from "../play/play-context";
import { readFatePlaySkills } from "../play/play-model";
import { useSkillName } from "../play/use-skill-name";
import type { FateFeatureResources } from "./feature-scope";
import { applyFatePresetDraft, previewFatePresetDraft, type FatePresetDraft } from "./preset-actions";
import { projectFateSheet, readFateSheetPreset } from "./sheet-state";
import { FateRosterEditor } from "./roster-editor";
import { fateTableSetupLocks, type FateTableSetupLocks } from "../../table-setup/config";
import { fateTableSetupProvider } from "../../table-setup/manifest";

const NO_LOCKS: FateTableSetupLocks = { axes: {}, overrides: {} };

const labelGroup = {
  skills: "skillLists", allocation: "allocations", stress: "stress", injuries: "injuryModels", extreme: "extreme", ratings: "ratings", scale: "scale",
} as const satisfies Record<FatePresetAxis, keyof FatePresetLabels>;

export function FatePresetDialog({ catalog, labels, close, restoreFocus, focusSkill }: FateFeatureResources & {
  close: () => void; restoreFocus: () => void;
  /** Opened from a ladder chip in edit mode (B-023): the roster editor opens at this skill. */
  focusSkill?: string;
}) {
  const t = useTranslations("fatePresets");
  const fmt = useFormatter();
  const displaySkillName = useSkillName();
  const { data, editable, structural, schema, update } = useFatePlay();
  const [initial] = useState(() => ({ raw: JSON.stringify(fateRecord(data.fateV2).preset ?? null), selection: projectFateSheet(data, catalog).rules.selection }));
  const [draft, setDraft] = useState<FatePresetDraft>(() => ({ selection: initial.selection, overrides: readFateSheetPreset(data).overrides ?? {} }));
  // D1, D2 (ADR 0016): a table copy cannot move a locked item off the table's value. A card that
  // already differs keeps its own value or takes the table's; nothing is checked or rewritten.
  // The table's owner and GM assistants set the table up: its locks do not bind them (TS2-F002).
  const locksApply = useTableSetupSheet()?.locksApply ?? false;
  const tableSetup = useTableSetupSheetConfig(fateTableSetupProvider);
  const locks = tableSetup && locksApply ? fateTableSetupLocks(tableSetup) : NO_LOCKS;
  const lockedOut = (axis: FatePresetAxis, value: string) => locks.axes[axis] !== undefined && locks.axes[axis] !== value && initial.selection[axis] !== value;
  const anyLock = Object.keys(locks.axes).length > 0 || Object.keys(locks.overrides).length > 0;
  if (!editable || !structural) return null;
  const preview = previewFatePresetDraft(data, catalog, draft);
  const { current, next } = preview;
  const stale = initial.raw !== JSON.stringify(fateRecord(data.fateV2).preset ?? null);
  const allocation = next.rules.allocation;
  const previous = current.rules.allocation;
  const pointChanges = allocation.kind === "pointBuy" && previous.kind === "pointBuy" ? (["budget", "cap"] as const).filter(key => previous[key] !== allocation[key]) : [];
  const changed = preview.changes.length > 0 || pointChanges.length > 0;
  const report = checkFateAllocation(next.roster.active, allocation);
  const cautionIds = [...new Set([...report.overCap, ...(report.kind === "shape" ? report.unexpected.map(s => s.id) : report.negative)])];
  const suggested = next.rules.skills.suggestedAllocation;
  const options = (axis: FatePresetAxis, id: string) => labels[labelGroup[axis]][id];
  const field = schema.fields.skills;
  const customNames = new Map(readFatePlaySkills(data, field?.type === "fate-skill-pyramid" ? field : undefined)
    .map(({ id, customName }) => [id, customName]));
  const skillName = (id: string) => displaySkillName({ id, customName: customNames.get(id) });
  const changeAxis = (axis: FatePresetAxis, id: string) => {
    const result = selectFatePresetOption(draft.selection, axis, id, catalog);
    if (result.ok) setDraft({ ...draft, selection: result.selection });
  };
  return <FateDialog title={t("open")} close={close} restoreFocus={restoreFocus}>
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-medium">{t("shortcuts")}</legend>
          {catalog.recipes.filter(recipe => recipe.set).map(recipe => <button type="button" className={TEXT_BUTTON} key={recipe.id}
            disabled={(Object.entries(recipe.set ?? {}) as [FatePresetAxis, string][]).some(([axis, value]) => lockedOut(axis, value))} onClick={() => {
            const result = applyFateRecipe(draft.selection, recipe.id, catalog);
            if (result.ok) setDraft({ ...draft, selection: result.selection });
          }}>{labels.recipes[recipe.id]}</button>)}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
            {t("choices")}
            {anyLock && <InfoTip label={t("tableNoticeLabel")}>{t("tableNotice")}</InfoTip>}
          </legend>
          {FATE_PRESET_AXES.map(axis => {
            const choices = fateAxisOptions(catalog, axis).filter(option => !lockedOut(axis, option.id));
            const locked = locks.axes[axis] !== undefined;
            return <label key={axis} className="grid gap-1 text-sm" data-fate-preset-axis={axis}>
              <span className="inline-flex flex-wrap items-center gap-x-2">{t(`axis.${axis}`)}
                {locked && <span className={`inline-flex items-center gap-1 ${MUTED}`}><Lock size={12} aria-hidden />{t("lockedByTable")}</span>}
              </span>
              <select className={FATE_CONTROL} value={draft.selection[axis]} disabled={locked && choices.length < 2} onChange={event => changeAxis(axis, event.target.value)}>
                {choices.map(option => <option key={option.id} value={option.id}>{options(axis, option.id)}</option>)}
              </select>
            </label>;
          })}
          {suggested && suggested !== allocation.id && !lockedOut("allocation", suggested) && <button type="button" className={TEXT_BUTTON} onClick={() => changeAxis("allocation", suggested)}>
            {t("suggestion", { shape: labels.allocations[suggested] })}
          </button>}
          {allocation.kind === "pointBuy" && <div className="grid grid-cols-2 gap-2">
            {(["budget", "cap"] as const).map(key => {
              const override = key === "budget" ? "pointBudget" : "pointCap";
              const raw = draft.overrides[override];
              const value = typeof raw === "number" ? raw === 0 ? "" : raw : allocation[key];
              const lockedValue = locks.overrides[override];
              return <div key={key} className="grid content-start gap-1">
                <label className="grid gap-1 text-sm">{t(key)}
                  <input type="number" min={1} className={FATE_CONTROL} disabled={lockedValue !== undefined} value={value}
                    onChange={event => setDraft({ ...draft, overrides: { ...draft.overrides, [override]: Number(event.target.value) } })} />
                </label>
                {/* Locked: the card keeps its number or takes the table's, as a locked axis does (TS2-F004). */}
                {lockedValue !== undefined && value !== lockedValue && <button type="button" className={TEXT_BUTTON}
                  onClick={() => setDraft({ ...draft, overrides: { ...draft.overrides, [override]: lockedValue } })}>{t("useTableValue", { value: lockedValue })}</button>}
              </div>;
            })}
          </div>}
        </fieldset>
      </div>
      <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm" aria-label={t("preview")}>
        <h3 className="font-medium">{t("preview")}</h3>
        {!changed && <p className={MUTED}>{t("noChanges")}</p>}
        {preview.changes.map(({ axis, from, to }) => <p key={axis}>{t("change", { axis: t(`axis.${axis}`), before: options(axis, from), after: options(axis, to) })}</p>)}
        {previous.kind === "pointBuy" && allocation.kind === "pointBuy" && pointChanges.map(key => <p key={key}>{t("change", { axis: t(key), before: previous[key], after: allocation[key] })}</p>)}
        {report.kind === "pointBuy" ? <p>{t("pointSummary", { spent: report.spent, budget: report.budget, remaining: report.remaining, cap: report.cap })}</p>
          : <div className="grid grid-cols-2 gap-1">{report.ranks.map(rank => <p key={rank.rank} className={rank.status === "over" ? "text-destructive" : undefined}>{t("shapeSummary", { rank: rank.rank, actual: rank.actual, expected: rank.expected })}</p>)}</div>}
        {cautionIds.length > 0 && <p role="status">{t("overRank", { skills: fmt.list(cautionIds.map(skillName)) })}</p>}
        <p className={cn(MUTED, "flex items-center gap-1")}>{t("kept")}<InfoTip label={t("keptLabel")}>{t("keptDetail")}</InfoTip></p>
        {([
          ["dormant", preview.goingDormant], ["restored", preview.restored],
          ["retained", next.roster.dormant.filter(skill => !preview.goingDormant.some(s => s.id === skill.id))],
        ] as const).map(([key, skills]) => skills.length > 0 && <div key={key}>
          <p className="font-medium">{t(key)}</p>
          <ul className="break-words pl-3">{skills.map(skill => <li key={skill.id}>{skill.explicit ? t("skillRank", { name: skillName(skill.id), rank: skill.rating }) : skillName(skill.id)}</li>)}</ul>
        </div>)}
        {(next.harm.legacyExtraMild || next.harm.inactive.length > 0) && <div>
          <p className="font-medium">{t("retainedHarm")}</p>
          <ul className="break-words pl-3">
            {next.harm.legacyExtraMild && <li>{t("retainedLegacy", { text: next.harm.legacyExtraMild })}</li>}
            {next.harm.inactive.map(item => item.kind === "consequence"
              ? <li key={item.slotId}>{t("retainedInjury", { label: labels.slots[item.slotId], text: item.text })}</li>
              : item.kind === "stress"
                ? <li key={`${item.trackId}:${item.index}`}>{t("retainedCell", { label: labels.tracks[item.trackId], index: item.index })}</li>
                : <li key={`${item.conditionId}:${item.index}`}>{t("retainedCell", { label: labels.conditions[item.conditionId] ?? labels.injuryModels.conditions, index: item.index })}</li>)}
          </ul>
        </div>}
        {!next.rules.ratings.enabled && typeof next.gear.armor === "number" && <p>{t("keptArmor", { value: next.gear.armor })}</p>}
        {!next.rules.ratings.enabled && typeof next.gear.weapon === "number" && <p>{t("keptWeapon", { value: next.gear.weapon })}</p>}
        {!next.rules.scale.enabled && typeof next.gear.scaleTierId === "string" && labels.scaleTiers[next.gear.scaleTierId] && <p>{t("keptTier", { value: labels.scaleTiers[next.gear.scaleTierId] })}</p>}
        {next.harm.extreme.enabled && !next.harm.extreme.active && <p>{t("inactiveExtreme")}</p>}
        {(!preview.allowed || stale) && <div role="alert" className="space-y-1 rounded-md border p-2">
          {stale && <p>{t("stale")}</p>}
          {preview.occupiedStress && <p>{t("blockedStress")}</p>}
          {preview.occupiedInjuries && <p>{t("blockedInjuries")}</p>}
          {!preview.guard.ok && <p>{t("blockedHarm")}</p>}
          {next.issues.length > 0 && <p>{t("blockedPreset")}</p>}
        </div>}
      </section>
    </div>
    <FateRosterEditor catalog={catalog} sheet={current} skillName={skillName} focusSkill={focusSkill} />
    <footer className="flex flex-wrap justify-end gap-2">
      <button type="button" className={TEXT_BUTTON} onClick={close}>{t(changed ? "cancel" : "close")}</button>
      <button type="button" className={`${TEXT_BUTTON} border-accent bg-accent/15`} disabled={!changed || stale || !preview.allowed} onClick={() => {
        update(previous => applyFatePresetDraft(previous, catalog, initial.selection, draft, structural, initial.raw));
        close();
      }}>{t("apply")}</button>
    </footer>
  </FateDialog>;
}
