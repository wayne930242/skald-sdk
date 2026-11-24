"use client";

import { lazy, Suspense, useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { BookOpen, Check } from "lucide-react";
import { DerivedValueView, type DerivedValueState } from "@skald/sheet-sdk/modules/character/ui/derived/derived-value";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { fateRecoveryStatus, type FateInjuryRef, type FateRecoveryStatus } from "../../domain/lifecycle";
import { fateConditionBoxKey } from "../../domain/harm";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { CARD_HEAD, CARD_TITLE, ICON_BUTTON, MUTED, TEXT_BUTTON } from "../play/card-styles";
import { fateExtraSlots, fateStressId } from "../play/derived";
import { useFatePlay } from "../play/play-context";
import { FateFeatureScope, type FateFeatureResources } from "../presets/feature-scope";
import { editFateGear } from "../presets/preset-actions";
import { projectFateSheet } from "../presets/sheet-state";
import { assignLegacyFateInjury, fateSheetInjuries, setStressMark } from "./harm-actions";

const Incoming = lazy(() => import("./harm-dialog").then(module => ({ default: module.FateIncomingHarmDialog })));
const Recovery = lazy(() => import("./harm-dialog").then(module => ({ default: module.FateRecoveryDialog })));
const CELL = "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-sm tabular-nums @3xl:size-8";
const SELECT = "min-h-11 max-w-full rounded-md border border-border bg-background px-2 text-sm @3xl:min-h-9";

type Dialog = { kind: "incoming" } | { kind: "recovery"; injury: FateInjuryRef; label: string; status: FateRecoveryStatus };

/** F9 vitals slot: parent supplies the card frame and FatePlayContext. */
export function FateVitalsPane() {
  return <FateFeatureScope feature="harm">{resources => <VitalsBody {...resources} />}</FateFeatureScope>;
}

function VitalsBody({ catalog, labels }: FateFeatureResources) {
  const t = useTranslations("fateHarm");
  const { data, editable: writable, structural, update, openRules } = useFatePlay();
  // B-023: edit mode never records play state, so marks, hits and recovery act in play only.
  const editable = writable && !structural;
  const sheet = projectFateSheet(data, catalog);
  const { harm, rules, boundaries } = sheet;
  const [dialog, setDialog] = useState<Dialog>();
  const trigger = useRef<HTMLButtonElement>(null);
  const allocate = useRef<HTMLButtonElement>(null);
  const close = () => setDialog(undefined);
  const restoreFocus = () => (trigger.current?.isConnected ? trigger.current : allocate.current)?.focus();
  const open = (event: MouseEvent<HTMLButtonElement>, next: Dialog) => { trigger.current = event.currentTarget; setDialog(next); };
  const wounds = new Map(fateSheetInjuries(sheet, catalog).map(injury => [injury.key, injury]));
  /** A wound's recovery state; `named` also shows the words the player gave it (a condition's 腳踝扭傷). */
  const showWound = (key: string, label: string, named = false) => {
    const injury = wounds.get(key);
    if (!injury) return null;
    const status = fateRecoveryStatus(injury, boundaries);
    const own = named && injury.text !== key ? injury.text.trim() : "";
    return <div className="mt-1 flex flex-col items-start gap-1 text-sm">
      {own && <span className="break-words font-medium" data-fate-condition-text>{own}</span>}
      <span className={cn("rounded-full px-2", status === "untreated" ? "bg-muted" : "bg-accent/15")}>{t(`status.${status}`)}</span>
      {injury.metadata?.externalClaim && <span className={MUTED}>{t("external")}</span>}
      {editable && status !== "recovering" && <button className={TEXT_BUTTON} type="button" onClick={event => open(event, { kind: "recovery", injury, label, status })}>
        {t(status === "clearable" ? "clear" : "treat")}
      </button>}
    </div>;
  };
  return <div className="space-y-3">
    <header className={CARD_HEAD}>
      <h2 className={CARD_TITLE}>{t("title")}</h2>
      <button type="button" className={ICON_BUTTON} aria-label={t("rules")} onClick={() => openRules(sheetRuleTargets.harm)}><BookOpen size={16} aria-hidden /></button>
    </header>
    {structural && <Capacities {...{ sheet, labels }} />}
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("stress")}</h3>
      {harm.stress.map(track => <div key={track.id} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={labels.tracks[track.id]}>
        <span className="mr-1 text-sm">{labels.tracks[track.id]}</span>
        {rules.stress.tracks.find(config => config.id === track.id)?.links.map(kind => {
          const id = rules.skills.trackLinks[kind];
          return id && <span key={kind} className={MUTED}>{t("trackLink", { skill: labels.skills[id], rank: sheet.links[kind] ?? 0 })}</span>;
        })}
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: track.capacity }, (_, i) => {
            const index = i + 1;
            const marked = track.marks.includes(index);
            const label = t("stressCell", { track: labels.tracks[track.id], index });
            const className = cn(CELL, marked && "border-accent bg-accent/20", editable && "hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring");
            const content = marked ? <Check size={16} aria-hidden /> : index;
            return editable ? <button key={index} type="button" className={className} aria-label={label} aria-pressed={marked}
              onClick={() => update(previous => setStressMark(previous, catalog, track.id, index, !marked, editable))}>{content}</button>
              : <span key={index} role="checkbox" aria-checked={marked} aria-readonly="true" aria-label={label} className={className}>{content}</span>;
          })}
        </div>
      </div>)}
    </div>
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t(harm.injuryKind)}</h3>
      {harm.legacyExtraMild && <div className="space-y-2 rounded-md border border-accent/40 bg-accent/10 p-2 text-sm">
        <p className="break-words">{t("legacy", { text: harm.legacyExtraMild })}</p>
        <p className={MUTED}>{t("legacyBlocked")}</p>
        {/* Giving the old text a track fixes the record, so it is an edit in either mode. */}
        {writable && harm.slots.filter(slot => slot.extra && !slot.occupied).map(slot =>
          <button type="button" key={slot.id} className={TEXT_BUTTON} onClick={() => {
            const text = harm.legacyExtraMild;
            if (text) update(previous => assignLegacyFateInjury(previous, catalog, slot.id, text, writable));
          }}>{t("assign", { track: labels.tracks[slot.hitKinds?.[0] ?? "physical"] })}</button>)}
      </div>}
      {harm.slots.map(slot => {
        const name = t("unit", { name: labels.slots[slot.id], value: slot.value });
        return <div key={slot.id} className="rounded-md border border-border bg-muted/15 p-2">
          <p className="text-sm font-medium">{name}</p>
          <p className={cn("break-words text-sm", !slot.occupied && MUTED)}>{slot.occupied ? slot.text : t(slot.blocked === "extremeUsed" ? "usedExtreme" : slot.blocked === "legacyUnassigned" ? "legacyBlocked" : "empty")}</p>
          {slot.occupied && showWound(slot.id, slot.text)}
        </div>;
      })}
      {harm.conditions.map(condition => <div key={condition.id} className="rounded-md border border-border bg-muted/15 p-2" data-fate-condition={condition.id}>
        <p className="text-sm font-medium">{t("unit", { name: labels.conditions[condition.id], value: condition.value })}</p>
        <div className="flex flex-wrap gap-1">
          {condition.boxes.map(box => {
            const key = fateConditionBoxKey(condition.id, box.index);
            const label = box.extra ? t("extraConditionCell", { condition: labels.conditions[condition.id], index: box.index, track: labels.tracks[box.hitKinds?.[0] ?? "physical"] })
              : t("conditionCell", { condition: labels.conditions[condition.id], index: box.index });
            return <div key={box.index}>
              <span role="checkbox" aria-checked={box.marked} aria-readonly="true" aria-label={label} className={cn(CELL, box.marked && "border-accent bg-accent/20")}>
                {box.marked ? <Check size={16} aria-hidden /> : box.index}
              </span>
              {box.extra && <span className="ml-1 text-xs text-muted-foreground">{labels.tracks[box.hitKinds?.[0] ?? "physical"]}</span>}
              {box.marked && showWound(key, label, true)}
            </div>;
          })}
        </div>
      </div>)}
      {harm.extreme.enabled && !harm.extreme.active && <p className={MUTED}>{t("inactiveExtreme")}</p>}
    </div>
    {harm.inactive.length > 0 && <details className="rounded-md border p-2 text-sm">
      <summary className="cursor-pointer">{t("inactive")}</summary>
      <ul className="mt-2 space-y-2">
        {harm.inactive.map(item => {
          if (item.kind === "stress") return <li key={`${item.trackId}:${item.index}`}>{t("stressCell", { track: labels.tracks[item.trackId], index: item.index })}</li>;
          const key = item.kind === "condition" ? fateConditionBoxKey(item.conditionId, item.index) : item.slotId;
          const label = item.kind === "condition" ? t("conditionCell", { condition: labels.conditions[item.conditionId] ?? t("conditions"), index: item.index }) : item.text;
          return <li key={key} className="break-words">{label}{showWound(key, label)}</li>;
        })}
      </ul>
    </details>}
    {(rules.ratings.enabled || rules.scale.enabled) && <Gear {...{ catalog, labels, sheet }} editable={writable} />}
    {editable && <>
      <button ref={allocate} type="button" className={TEXT_BUTTON} onClick={event => open(event, { kind: "incoming" })}>{t("recordHit")}</button>
      <Suspense fallback={null}>
        {dialog?.kind === "incoming" && <Incoming {...{ catalog, labels, close, restoreFocus }} />}
        {dialog?.kind === "recovery" && <Recovery {...{ catalog, labels, close, restoreFocus }} injury={dialog.injury} status={dialog.status} label={dialog.label} />}
      </Suspense>
    </>}
  </div>;
}

/**
 * Edit mode's derived capacities (B-024, auto-only): each stress track's box count and each extra
 * consequence slot the linked skill grants. The rules set them; nobody overrides them.
 */
function Capacities({ sheet, labels }: Pick<FateFeatureResources, "labels"> & { sheet: ReturnType<typeof projectFateSheet> }) {
  const t = useTranslations("fatePlay.derived");
  const auto = (value: number): DerivedValueState => ({ value, auto: value, overridden: false });
  return <div className="divide-y divide-border/60 rounded-md border border-border px-2" data-fate-capacities>
    {sheet.harm.stress.map(track => <DerivedValueView key={track.id} fieldId={fateStressId(track.id)} mode="auto-only" state={auto(track.capacity)}
      label={t("stress", { id: track.id, track: labels.tracks[track.id] ?? track.id })} />)}
    {fateExtraSlots(sheet).map(slot => <DerivedValueView key={slot.id} fieldId={slot.id} mode="auto-only" state={auto(slot.granted ? 1 : 0)}
      label={t("slot", { slot: labels.slots[slot.id] ?? slot.id })} />)}
  </div>;
}

/** Weapon, armor and scale: setup values, so they edit in play and in edit mode alike. */
function Gear({ catalog, labels, sheet, editable }: FateFeatureResources & { sheet: ReturnType<typeof projectFateSheet>; editable: boolean }) {
  const t = useTranslations("fateHarm");
  const { update } = useFatePlay();
  const { ratings, scale } = sheet.rules;
  const tier = typeof sheet.gear.scaleTierId === "string" && scale.tiers.includes(sheet.gear.scaleTierId) ? sheet.gear.scaleTierId : "";
  return <div className="space-y-2 rounded-md border p-2">
    <h3 className="text-sm font-medium">{t("gear")}</h3>
    <div className="flex flex-wrap gap-2">
      {ratings.enabled && (["weapon", "armor"] as const).map(field => {
        const value = typeof sheet.gear[field] === "number" ? sheet.gear[field] : 0;
        const options = Array.from({ length: ratings.max - ratings.min + 1 }, (_, i) => ratings.min + i);
        return <label key={field} className="grid min-w-0 gap-1 text-sm">{t(field)}
          {editable ? <select className={SELECT} value={options.includes(value) ? value : ""} onChange={event => {
            const rating = Number(event.target.value);
            update(data => editFateGear(data, catalog, field, rating, editable));
          }}>
            {!options.includes(value) && <option value="" disabled>{t("notSet")}</option>}
            {options.map(rating => <option key={rating} value={rating}>{rating}</option>)}
          </select> : <span>{options.includes(value) ? value : t("notSet")}</span>}
        </label>;
      })}
      {scale.enabled && <label className="grid min-w-0 gap-1 text-sm">{t("scale")}
        {editable ? <select className={SELECT} value={tier} onChange={event => {
          const selected = event.target.value;
          update(data => editFateGear(data, catalog, "scaleTierId", selected, editable));
        }}>
          <option value="">{t("notSet")}</option>
          {scale.tiers.map(id => <option key={id} value={id}>{labels.scaleTiers[id]}</option>)}
        </select> : <span>{tier ? labels.scaleTiers[tier] : t("notSet")}</span>}
      </label>}
    </div>
  </div>;
}
