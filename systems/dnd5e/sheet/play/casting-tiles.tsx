"use client";

import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import { fieldRoll, useOpenDndEditor, usePlay, usePlayEditing } from "./play-context";
import { PlayRollButton } from "./play-roll-button";
import { rows, signed, text } from "./play-model";
import { isMulticlass, spellSourceOf, type CastingClass } from "./casting-classes";
import { className } from "./sheet-names";
import { useSheetNames } from "./use-sheet-names";
import { sheetClasses } from "./class-model";

/** The spells tab's stat tile. */
export const TILE = "flex flex-col items-center justify-center gap-1 rounded-xl bg-muted/50 px-2 py-2 text-center";

/** One casting class's ability, save DC and attack tiles on a multiclass sheet. */
export function CastingTiles({ caster }: { caster: CastingClass }) {
  const t = useTranslations("play");
  const tAbility = useTranslations("ability");
  const tRenderer = useTranslations("renderer");
  const { values, schema } = usePlay();
  const open = useOpenDndEditor();
  const editing = usePlayEditing();
  const start = caster.castingClass === "";
  const label = t("spells.multiclass.tile", { class: caster.name, ability: tAbility(caster.ability) });
  const dc = (
    <>
      <span className="text-xs text-muted-foreground">{t("spells.dc")}</span>
      <span className="text-xl font-semibold tabular-nums">{caster.dc}{start && <OverrideMark fieldId="spellSaveDc" />}</span>
    </>
  );
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={label} data-play-casting={caster.castingClass || "start"}>
      <div className={TILE} data-play-stat="spell-ability">
        <span className="text-xs text-muted-foreground">{caster.name}</span>
        <span className="text-lg font-semibold">
          {tAbility(caster.ability)} {signed(caster.mod)}
        </span>
      </div>
      {editing ? (
        <button type="button" className={cn(TILE, "transition-colors hover:bg-muted")} data-play-stat="spell-dc" aria-label={tRenderer("editValue", { name: t("spells.dc") })} aria-haspopup="dialog" onClick={() => open("spellcasting")}>
          {dc}
        </button>
      ) : (
        <div className={TILE} data-play-stat="spell-dc">
          {dc}
        </div>
      )}
      <PlayRollButton onEdit={() => open("spellcasting")} roll={fieldRoll(schema, "spellAttack")} data={{ ...values, spellAttack: caster.attack }} label={`${t("spells.attack")} · ${caster.name}`} icon={false} aria-label={`${t("spells.attack")} · ${caster.name} ${signed(caster.attack)}`} className={cn(TILE, "h-auto rounded-xl font-normal")}>
        <span className="flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">{t("spells.attack")}</span>
          <span className="text-xl font-semibold">{signed(caster.attack)}{start && <OverrideMark fieldId="spellAttack" />}</span>
        </span>
      </PlayRollButton>
    </div>
  );
}

/**
 * A multiclass spell row's class: a badge, and in edit mode the 施法職業 select that writes the
 * row's `castingClass`. Nothing on a single-class sheet.
 */
export function CastingClassControl({ spell, name }: { spell: Record<string, unknown>; name: string }) {
  const t = useTranslations("play");
  const tOption = useTranslations("option");
  const { values, editable, write } = usePlay();
  const { names } = useSheetNames();
  const editing = usePlayEditing();
  if (!isMulticlass(values)) return null;
  const classes = sheetClasses(values)
    .filter((sheetClass) => sheetClass.start || sheetClass.classId)
    .map((sheetClass) => ({ ...sheetClass, name: className(sheetClass.classId, sheetClass.name, names) }));
  const current = text(spell.castingClass);
  // A background's or feat's spell (Magic Initiate) or a species' spell belongs to no class: it shows its source (UAT M5).
  const source = spellSourceOf(spell);
  if (source && !(editing && editable)) {
    const key = `spellSource.${source}`;
    return (
      <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground" title={t("spells.multiclass.castingClass")} data-play-spell-source={source}>
        {tOption.has(key) ? tOption(key) : source}
      </span>
    );
  }
  const keyOf = (sheetClass: (typeof classes)[number]) => (sheetClass.start ? "" : sheetClass.classId);
  const shown = classes.find((sheetClass) => keyOf(sheetClass) === current) ?? classes[0];
  if (editing && editable) {
    const choose = (value: string) => {
      const next = value === START ? "" : value;
      write({ spells: rows(values.spells).map((row) => (row.id === spell.id ? { ...row, castingClass: next } : row)) });
    };
    return (
      <Select value={current || START} onValueChange={choose}>
        <SelectTrigger size="sm" className="h-7 text-xs" aria-label={t("spells.multiclass.castingClassOf", { name })} data-play-casting-class-select>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {classes.map((sheetClass) => (
            <SelectItem key={keyOf(sheetClass) || START} value={keyOf(sheetClass) || START}>
              {sheetClass.name || sheetClass.classId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground" title={t("spells.multiclass.castingClass")} data-play-casting-class={current || "start"}>
      {shown?.name || shown?.classId}
    </span>
  );
}

/** Radix Select forbids an empty item value: the starting class's `""` maps to this key. */
const START = "__start__";
