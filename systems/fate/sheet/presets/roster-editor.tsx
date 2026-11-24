"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { FatePresetCatalog, FateRosterSkill } from "../../domain/presets";
import { FATE_CONTROL } from "../harm/fate-dialog";
import { ICON_BUTTON, MUTED, TEXT_BUTTON } from "../play/card-styles";
import { useSkillName } from "../play/use-skill-name";
import { useFatePlay } from "../play/play-context";
import { InfoTip } from "@skald/sheet-sdk/components/ui/info-tip";
import { editFateRoster, type FateRosterEdit } from "./preset-actions";
import type { projectFateSheet } from "./sheet-state";

const SKILL_NAME_INPUT = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true" } as const;

export function FateRosterEditor({ catalog, sheet, skillName, focusSkill }: {
  catalog: FatePresetCatalog; sheet: ReturnType<typeof projectFateSheet>; skillName: (id: string) => string;
  /** Open with this skill's row focused (its name selected): a ladder chip's edit target. */
  focusSkill?: string;
}) {
  const t = useTranslations("fatePresets");
  const { data, update, editable, structural } = useFatePlay();
  const defaultSkillName = useSkillName();
  const [name, setName] = useState("");
  const [blocked, setBlocked] = useState(false);
  if (!editable || !structural) return null;
  const edit = (edit: FateRosterEdit) => {
    const action = edit.kind === "rename" ? { ...edit, defaultName: defaultSkillName({ id: edit.id }) } : edit;
    const apply = (previous: typeof data) => editFateRoster(previous, catalog, action, structural);
    if (apply(data) === data) { setBlocked(true); return false; }
    setBlocked(false);
    update(apply);
    return true;
  };
  return <details className="space-y-2 rounded-lg border p-3" open={focusSkill !== undefined || undefined}>
    <summary className="cursor-pointer font-medium">{t("roster")}</summary>
    <p className={`${MUTED} flex items-center gap-1`}>{t("rosterDescription")}<InfoTip label={t("rosterScopeLabel")}>{t("rosterScope")}</InfoTip></p>
    {blocked && <p role="alert" className="text-sm">{t("rosterBlocked")}</p>}
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      if (name.trim() && edit({ kind: "add", id: `custom-${crypto.randomUUID()}`, name })) setName("");
    }}>
      <label className="grid min-w-0 gap-1 text-sm">{t("name")}<input {...SKILL_NAME_INPUT} className={FATE_CONTROL} value={name} onChange={event => setName(event.target.value)} /></label>
      <button className={TEXT_BUTTON} type="submit" disabled={!name.trim()}>{t("add")}</button>
    </form>
    <ul className="space-y-2">
      {sheet.roster.active.map(skill => {
        const label = skillName(skill.id);
        return <li key={skill.id} className="rounded-md border p-2"><RosterRow key={label} {...{ skill, label, edit }} focus={skill.id === focusSkill} /></li>;
      })}
    </ul>
    {sheet.input.hidden.length > 0 && <div>
      <h3 className="text-sm font-medium">{t("hidden")}</h3>
      <ul className="flex flex-wrap gap-2">{[...new Set(sheet.input.hidden)].map(id => {
        const label = skillName(id);
        return <li key={id}>
          <button className={TEXT_BUTTON} type="button" aria-label={t("restoreLabel", { skill: label })} onClick={() => edit({ kind: "hide", id, hidden: false })}>{label}</button>
        </li>;
      })}</ul>
    </div>}
  </details>;
}

function RosterRow({ skill, label, edit, focus }: { skill: FateRosterSkill; label: string; edit: (value: FateRosterEdit) => boolean; focus: boolean }) {
  const t = useTranslations("fatePresets");
  const [name, setName] = useState(label);
  const input = useRef<HTMLInputElement>(null);
  // Once, when the dialog opens at this skill: a later rename keeps the player's place.
  const [focused] = useState(focus);
  useEffect(() => {
    if (!focused) return;
    // After the dialog's own open focus.
    const frame = requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  const id = skill.id;
  return <div className="flex flex-wrap items-end gap-2">
    <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (name.trim() && name.trim() !== label) edit({ kind: "rename", id, name }); }}>
      <label className="grid min-w-0 gap-1 text-sm">
        <span className="sr-only">{t("renameLabel", { skill: label })}</span>
        <input {...SKILL_NAME_INPUT} ref={input} className={FATE_CONTROL} value={name} onChange={event => setName(event.target.value)} />
      </label>
      <button className={TEXT_BUTTON} type="submit" disabled={!name.trim() || name.trim() === label}>{t("rename")}</button>
    </form>
    <span className="flex min-h-11 items-center text-sm" aria-live="polite">
      {skill.explicit ? t("skillRank", { name: label, rank: skill.rating }) : t("unrated")}
    </span>
    <button className={ICON_BUTTON} type="button" aria-label={t("lowerRank", { skill: label })}
      disabled={!skill.explicit} onClick={() => edit({ kind: "rank", id, rank: skill.rating <= 0 ? null : skill.rating - 1 })}><Minus size={16} aria-hidden /></button>
    <button className={ICON_BUTTON} type="button" aria-label={t("raiseRank", { skill: label })}
      onClick={() => edit({ kind: "rank", id, rank: skill.explicit ? Math.max(0, skill.rating + 1) : 0 })}><Plus size={16} aria-hidden /></button>
    {skill.explicit && <button className={ICON_BUTTON} type="button" aria-label={t("clearRank", { skill: label })}
      onClick={() => edit({ kind: "rank", id, rank: null })}><RotateCcw size={16} aria-hidden /></button>}
    <button className={TEXT_BUTTON} type="button" aria-label={t("hideLabel", { skill: label })} onClick={() => edit({ kind: "hide", id, hidden: true })}>{t("hide")}</button>
  </div>;
}
