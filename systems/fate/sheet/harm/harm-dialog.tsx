"use client";

import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { FateHitKind } from "../../domain/engine";
import type { FateHarmPlan } from "../../domain/harm";
import { fateTreatmentDifficulty, type FateInjuryRef, type FateRecoveryStatus } from "../../domain/lifecycle";
import { useFatePlay } from "../play/play-context";
import { MUTED, TEXT_BUTTON } from "../play/card-styles";
import type { FateFeatureResources } from "../presets/feature-scope";
import { projectFateSheet } from "../presets/sheet-state";
import { FATE_CONTROL, FateDialog } from "./fate-dialog";
import { applyIncomingHarm, planIncomingHarm, recoverFateSheetInjury } from "./harm-actions";

interface DialogProps extends FateFeatureResources { close: () => void; restoreFocus: () => void }

export function FateIncomingHarmDialog({ catalog, labels, close, restoreFocus }: DialogProps) {
  const t = useTranslations("fateHarm");
  const fmt = useFormatter();
  const group = useId();
  const { data, update, editable, aspects, secretAccess } = useFatePlay();
  const sheet = projectFateSheet(data, catalog);
  const [kind, setKind] = useState<FateHitKind>("physical");
  const [shifts, setShifts] = useState("1");
  const [useArmor, confirmArmor] = useState(false);
  const [armor, setArmor] = useState(String(sheet.gear.armor ?? 0));
  const [selected, select] = useState<FateHarmPlan>();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [aspect, setAspect] = useState<{ id: string; text: string }>();
  const [extremeText, setExtremeText] = useState("");
  const [refused, markRefused] = useState(false);
  if (!editable) return null;
  const hit = { kind, shifts: Number(shifts), armor: armor === "" ? NaN : Number(armor), useArmor };
  const options = planIncomingHarm(sheet, hit);
  const plan = options.kind === "plans" && selected ? options.plans.find(candidate => candidate.key === selected.key && candidate.shifts === selected.shifts && candidate.absorbed === selected.absorbed) : undefined;
  const track = sheet.harm.stress.find(track => track.hitKinds.includes(kind));
  const replaceable = aspects.permanent.filter(row => !row.hidden && !sheet.harm.extreme.protectedKinds.includes(row.kind));
  const aspectCurrent = replaceable.some(row => row.id === aspect?.id && row.text === aspect?.text);
  const canConfirm = plan && plan.needsText.every(slot => texts[slot]?.trim()) && (!plan.replacesAspect || aspectCurrent && extremeText.trim());
  const ratings = sheet.rules.ratings;
  const reset = () => { select(undefined); markRefused(false); };
  const description = (candidate: FateHarmPlan) => {
    const parts: string[] = [];
    if (candidate.stress) parts.push(t("stressPlan", { track: labels.tracks[candidate.stress.trackId], count: candidate.stress.boxes.length }));
    for (const slot of sheet.harm.slots.filter(slot => candidate.slots.includes(slot.id))) parts.push(t("slotPlan", { slot: labels.slots[slot.id], value: slot.value }));
    for (const { conditionId, boxes } of candidate.conditions) {
      const condition = sheet.harm.conditions.find(c => c.id === conditionId);
      if (condition) parts.push(t("slotPlan", { slot: labels.conditions[conditionId], value: condition.value * boxes.length }));
    }
    return t("plan", { parts: fmt.list(parts, { type: "unit" }), absorbed: candidate.absorbed });
  };
  function submit() {
    if (!canConfirm || !plan) return;
    const input = { hit, plan, texts, extreme: aspect ? { aspectId: aspect.id, previousText: aspect.text, text: extremeText.trim() } : undefined };
    const operation = { operationId: crypto.randomUUID(), timestamp: new Date().toISOString() };
    const apply = (current: typeof data) => applyIncomingHarm(current, catalog, input, operation, editable, secretAccess);
    if (apply(data) === data) { markRefused(true); return; }
    update(apply);
    close();
  }
  return <FateDialog title={t("recordHit")} description={t("hitDescription")} close={close} restoreFocus={restoreFocus}>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">{t("hitKind")}
          <select className={FATE_CONTROL} value={kind} onChange={event => { setKind(event.target.value === "mental" ? "mental" : "physical"); reset(); }}>
            <option value="physical">{labels.tracks.physical}</option><option value="mental">{labels.tracks.mental}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t("shifts")}
          <input className={FATE_CONTROL} type="number" min={1} value={shifts} onChange={event => { setShifts(event.target.value); reset(); }} />
        </label>
      </div>
      {ratings.enabled && <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={useArmor} onChange={event => { confirmArmor(event.target.checked); reset(); }} />{t("useArmor")}</label>
        <label className="grid gap-1 text-sm">{t("armor")}
          <input className={`${FATE_CONTROL} w-24`} disabled={!useArmor} type="number" min={ratings.min} max={ratings.max} value={armor} onChange={event => { setArmor(event.target.value); reset(); }} />
        </label>
      </div>}
      <div className="rounded-lg border p-3 text-sm" aria-live="polite">
        {options.kind !== "invalid" && <p className="font-medium">{t("net", { shifts: hit.shifts, armor: useArmor ? hit.armor : 0, net: options.net })}</p>}
        {track && <p className={MUTED}>{t("freeCells", { track: labels.tracks[track.id], used: track.capacity - track.free.length, free: track.free.length })}</p>}
        {options.kind === "invalid" && <p>{t("invalid")}</p>}
        {options.kind === "noHit" && <p>{t("noHit")}</p>}
        {options.kind === "takenOut" && <p>{t("takenOut", { max: options.maxAbsorb, shortfall: options.shortfall })}</p>}
      </div>
      {options.kind === "plans" && <fieldset className="space-y-1">
        <legend className="font-medium">{t("allocation")}</legend>
        <p className={MUTED}>{t("onlyFree")}</p>
        {sheet.harm.slots.filter(slot => slot.occupied && (!slot.hitKinds || slot.hitKinds.includes(kind))).map(slot =>
          <p key={slot.id} className={`${MUTED} break-words`}>{t("unavailable", { slot: labels.slots[slot.id], text: slot.text })}</p>)}
        {options.plans.map(candidate => <label key={candidate.key} className="flex min-h-11 items-center gap-2 rounded-lg border px-2 text-sm has-checked:border-accent has-checked:bg-accent/10">
          <input type="radio" name={group} checked={plan?.key === candidate.key} onChange={() => { select(candidate); setTexts({}); setAspect(undefined); setExtremeText(""); markRefused(false); }} />
          <span>{description(candidate)}</span>
        </label>)}
      </fieldset>}
      {(refused || selected && !plan || aspect && !aspectCurrent) && <p role="alert">{t("stale")}</p>}
      {plan?.needsText.map(slot => <label key={slot} className="grid gap-1 text-sm">{t("newInjury", { slot: labels.slots[slot] })}
        <input className={FATE_CONTROL} value={texts[slot] ?? ""} onChange={event => setTexts({ ...texts, [slot]: event.target.value })} />
      </label>)}
      {plan?.replacesAspect && <div className="space-y-2 rounded-lg border p-3">
        <p className={MUTED}>{t("extremeWarning")}</p>
        <label className="grid gap-1 text-sm">{t("extremeTarget")}
          <select className={FATE_CONTROL} value={aspectCurrent ? aspect?.id ?? "" : ""} onChange={event => setAspect(replaceable.find(row => row.id === event.target.value))}>
            <option value="">{t("chooseAspect")}</option>
            {replaceable.map(row => <option key={row.id} value={row.id}>{t("aspectChoice", { kind: row.label ?? t(`aspectKinds.${row.kind}`), text: row.text || t("empty") })}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t("extremeText")}
          <input className={FATE_CONTROL} value={extremeText} onChange={event => setExtremeText(event.target.value)} />
        </label>
      </div>}
      {plan && (plan.slots.length > 0 || plan.conditions.length > 0) && <p className={MUTED}>{t("attackerClaim")}</p>}
      <footer className="flex flex-wrap justify-end gap-2">
        <button className={TEXT_BUTTON} type="button" onClick={close}>{t("cancel")}</button>
        <button className={`${TEXT_BUTTON} border-accent bg-accent/15`} type="submit" disabled={!canConfirm}>{t("confirm")}</button>
      </footer>
    </form>
  </FateDialog>;
}

export function FateRecoveryDialog({ catalog, close, restoreFocus, injury, label, status }: DialogProps & { injury: FateInjuryRef; label: string; status: FateRecoveryStatus }) {
  const t = useTranslations("fateHarm");
  const { data, update, editable } = useFatePlay();
  const [self, setSelf] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [name, setName] = useState("");
  const [refused, markRefused] = useState(false);
  const clear = status === "clearable";
  const canConfirm = clear || succeeded && (!injury.renamable || name.trim() !== "" && name.trim() !== injury.text);
  if (!editable) return null;
  const { rules } = projectFateSheet(data, catalog);
  return <FateDialog title={t(clear ? "clear" : "treat")} description={t(clear ? "clearDescription" : "treatmentDescription")} close={close} restoreFocus={restoreFocus}>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (!canConfirm) return;
      const action = clear ? { kind: "clear" as const } : { kind: "treat" as const, succeeded, name: name.trim(), id: crypto.randomUUID() };
      const apply = (current: typeof data) => recoverFateSheetInjury(current, catalog, injury, action, editable);
      if (apply(data) === data) { markRefused(true); return; }
      update(apply);
      close();
    }}>
      <p className="break-words font-medium">{label}</p>
      {!clear && <>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={self} onChange={event => { setSelf(event.target.checked); setSucceeded(false); }} />{t("selfTreatment")}</label>
        <p>{t("difficulty", { difficulty: fateTreatmentDifficulty(rules.recovery, injury.severity, self) })}</p>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={succeeded} onChange={event => setSucceeded(event.target.checked)} />{t("succeeded")}</label>
        {injury.renamable && <label className="grid gap-1">{t("rename")}<input className={FATE_CONTROL} value={name} onChange={event => setName(event.target.value)} /></label>}
      </>}
      {refused && <p role="alert">{t("stale")}</p>}
      <footer className="flex flex-wrap justify-end gap-2">
        <button className={TEXT_BUTTON} type="button" onClick={close}>{t("cancel")}</button>
        <button className={TEXT_BUTTON} disabled={!canConfirm} type="submit">{t(clear ? "confirmClear" : "confirmTreatment")}</button>
      </footer>
    </form>
  </FateDialog>;
}
