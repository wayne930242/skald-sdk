"use client";

import { lazy, Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { RollConfig } from "@skald/dice/roll-expression";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { EditSlot, fieldRoll, useOpenDndEditor, usePlay, usePlayEditing } from "./play-context";
import { PlayRollButton } from "./play-roll-button";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import {
  alwaysPreparedCount,
  canCastRitual,
  cantripDice,
  castOptions,
  castPatch,
  healWithSpellMod,
  num,
  pactSlots,
  rows,
  signed,
  spellGroups,
  spellSlots,
  tapSlotPip,
  text,
  upcastDice,
  type CastOption,
  type SlotLevel,
} from "./play-model";
import { displayName, spellLine, summaryOf, useRowText, useSpellFacts, type SpellFacts } from "./row-text";
import { ConcentrationChip } from "./vitals-bar";
import { castingClasses, isMulticlass, spellCasting } from "./casting-classes";
import { CastingClassControl, CastingTiles, TILE } from "./casting-tiles";
import { sheetClasses } from "./class-model";
import type { CompendiumStart } from "../compendium-rows";
import type { ReferenceContextValue } from "../use-reference-context";
import { EditIntl } from "./edit-messages";
import { AddControls, CustomLink, PrepareToggle, RowEditorHost, RowMenu, useOpenRowEditor } from "./row-actions";

/** The slot and ritual choice loads on the first cast that has a choice (no first-load weight). */
const CastDialog = lazy(() => import("./cast-dialog").then((module) => ({ default: module.CastDialog })));

/** The rule id is data (`dsl-roll-rules.json`), wider than the dice package's built-in names. */
const DAMAGE_ROLL: RollConfig = { expression: "{{@dice}}", system: "dnd5e" as RollConfig["system"] };

/** Tappable slot pips of one level (S12): an open pip spends, a spent pip gives back. */
export function SlotPips({ level, label, showCount = true }: { level: number; label: string; showCount?: boolean }) {
  const t = useTranslations("play");
  const { values, editable, write } = usePlay();
  const slot: SlotLevel | undefined = spellSlots(values).find((item) => item.level === level);
  const pact = pactSlots(values);
  const entries: Array<{ slot: SlotLevel; field: string; label: string }> = [];
  if (slot) entries.push({ slot, field: `slot${level}Used`, label });
  if (pact && pact.level === level) entries.push({ slot: pact, field: "pactUsed", label: t("spells.pact", { level }) });
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(({ slot: current, field, label: rowLabel }) => {
        const open = current.total - current.used;
        return (
          <div key={field} className="flex flex-wrap items-center gap-2" role="group" aria-label={rowLabel} data-play-slots={field}>
            <span className="text-sm font-semibold">{rowLabel}</span>
            <span className="flex items-center">
              {Array.from({ length: current.total }, (_, index) => {
                const available = index < open;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!editable}
                    aria-pressed={!available}
                    aria-label={t("spells.pip", { level, index: index + 1, state: available ? t("spells.open") : t("spells.spent") })}
                    data-pip={available ? "open" : "spent"}
                    onClick={() => write({ [field]: tapSlotPip(current, index) })}
                    className="inline-flex size-11 items-center justify-center rounded-full disabled:cursor-default"
                  >
                    <span className={cn("size-5 rounded-full border-2", available ? "border-accent bg-accent" : "border-muted-foreground/50 bg-transparent")} />
                  </button>
                );
              })}
            </span>
            {showCount && <span className="text-xs text-muted-foreground">{t("spells.left", { left: open, total: current.total })}</span>}
          </div>
        );
      })}
    </>
  );
}

/**
 * A leveled spell's damage and healing dice cast at `castLevel` (its own level when not upcast):
 * the higher-level dice of game data once per slot level above (T4F-R-F004). Healing that adds the
 * spellcasting ability modifier carries `spellMod` once, after the dice (T4G-R-F002).
 */
export function castFacts(facts: SpellFacts, spellLevel: number, castLevel: number, spellMod = 0): SpellFacts {
  return {
    ...facts,
    dice: facts.dice ? upcastDice(facts.dice, facts.diceHigher, spellLevel, castLevel) : null,
    heal: facts.heal ? healWithSpellMod(upcastDice(facts.heal, facts.healHigher, spellLevel, castLevel), facts.healMod, spellMod) : null,
  };
}

/**
 * Cast a leveled spell. One open slot level and no ritual option: spends it at once. Otherwise the
 * caster picks the slot level (upcasting, A2-11) or a Ritual without a slot (A2-09). A
 * Concentration spell replaces the one held before (A2-12). `onCast` hears the level it was cast
 * at, so the row rolls the dice of that level; the toast names them too.
 */
export function CastButton({ spell, onCast }: { spell: Record<string, unknown>; onCast?: (level: number) => void }) {
  const t = useTranslations("play");
  const { values, editable, write, reference } = usePlay();
  // B-023 Q2: casting has nothing to edit, so edit mode disables it
  const editing = usePlayEditing();
  const [choosing, setChoosing] = useState(false);
  const facts = useSpellFacts(text(spell.ref));
  const name = displayName(reference, spell);
  // An unprepared spell is castable only as a Ritual from a Wizard's spellbook (SRD 5.2.1 Ritual
  // Adept): it takes no slot (T4F-R-F006).
  const options = spell.prepared === true ? castOptions(values, num(spell.level)) : [];
  const ritual = canCastRitual(values, spell);
  const cast = (via: CastOption | "ritual") => {
    const { patch, replaced } = castPatch(values, spell, via);
    write(patch);
    const level = via === "ritual" ? num(spell.level) : via.level;
    onCast?.(level);
    const atLevel = facts ? castFacts(facts, num(spell.level), level, spellCasting(values, spell).mod) : null;
    const dice = atLevel?.dice ?? atLevel?.heal;
    const done =
      via === "ritual"
        ? t("spells.castRitualDone", { name })
        : dice
          ? t("spells.castDoneDice", { name, level: via.level, dice })
          : t("spells.castDone", { name, level: via.level });
    const previous = replaced ? (replaced.startsWith("spell:") ? reference.nameOf(replaced) : replaced) : "";
    toast(previous ? `${done}${t("spells.concentrationReplaced", { name: previous })}` : done);
  };
  const castable = options.length > 0 || ritual;
  return (
    <>
      <button
        type="button"
        disabled={!editable || !castable || editing}
        aria-label={t("spells.castSpell", { name })}
        title={!castable ? t("spells.noSlot", { name }) : undefined}
        onClick={() => {
          if (options.length === 1 && !ritual) cast(options[0]);
          else if (castable) setChoosing(true);
          else toast.error(t("spells.noSlot", { name }));
        }}
        className="min-h-11 shrink-0 rounded-lg border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-background"
      >
        {t("spells.cast")}
      </button>
      {choosing && (
        <Suspense fallback={null}>
          <CastDialog
            name={name}
            options={options}
            ritual={ritual}
            onClose={() => setChoosing(false)}
            onCast={(via) => {
              setChoosing(false);
              cast(via);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

/** A spell's attack and damage roll targets (frame 06 Fire Bolt). */
export function SpellDamageButtons({ spell, facts, compact = false }: { spell: Record<string, unknown>; facts: SpellFacts; compact?: boolean }) {
  const t = useTranslations("play");
  const { values, schema, reference } = usePlay();
  const open = useOpenDndEditor();
  const openRow = useOpenRowEditor();
  const name = displayName(reference, spell);
  // A multiclass sheet's row rolls with its own class's attack bonus (CLASS-IMPL §7.5 M5).
  const attack = spellCasting(values, spell).attack;
  const attackData = isMulticlass(values) ? { ...values, spellAttack: attack } : values;
  // B-023: in edit mode the attack opens spellcasting, the dice the spell's fields
  const editFields = () => openRow({ kind: "fields", list: "spells", row: spell, name });
  return (
    <>
      {facts.attack ? (
        <PlayRollButton onEdit={() => open("spellcasting")} roll={fieldRoll(schema, "spellAttack")} data={attackData} label={t("combat.attackRoll", { name })} aria-label={`${t("combat.attackRoll", { name })} ${signed(attack)}`} className="justify-start">
          {compact ? t("combat.hitValue", { value: signed(attack) }) : signed(attack)}
          <OverrideMark fieldId="spellAttack" />
        </PlayRollButton>
      ) : (
        <span />
      )}
      {facts.dice && (
        <PlayRollButton onEdit={editFields} roll={DAMAGE_ROLL} damage data={{ ...values, dice: facts.dice }} label={t("combat.damageRoll", { name })} aria-label={`${t("combat.damageRoll", { name })} ${facts.dice}`} className="justify-start">
          {compact ? t("combat.damageValue", { value: facts.dice }) : facts.dice}
        </PlayRollButton>
      )}
      {!facts.dice && facts.heal && (
        <PlayRollButton onEdit={editFields} roll={DAMAGE_ROLL} data={{ ...values, dice: facts.heal }} label={t("combat.healRoll", { name })} aria-label={`${t("combat.healRoll", { name })} ${facts.heal}`} className="justify-start">
          {compact ? t("combat.healValue", { value: facts.heal }) : facts.heal}
        </PlayRollButton>
      )}
    </>
  );
}

function Tag({ children }: { children: string }) {
  return <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">{children}</span>;
}

function SpellRow({ spell }: { spell: Record<string, unknown> }) {
  const t = useTranslations("play");
  const { values, reference, openReference } = usePlay();
  const level = num(spell.level);
  const facts = useSpellFacts(text(spell.ref));
  const body = useRowText(reference, spell);
  const summary = summaryOf(body.text);
  const name = displayName(reference, spell);
  // The slot level the spell was last cast at: its damage and healing roll that level's dice.
  const [castLevel, setCastLevel] = useState(level);
  const unprepared = level > 0 && spell.prepared !== true;
  const castable = level > 0 && (!unprepared || canCastRitual(values, spell));
  const scaled = facts && level > 0 ? castFacts(facts, level, castLevel, spellCasting(values, spell).mod) : facts;
  const dice = scaled?.dice ? (level === 0 ? cantripDice(scaled.dice, num(values.level, 1)) : scaled.dice) : null;
  const heal = scaled?.heal ?? null;
  const rollable = facts && (facts.attack || dice || heal);
  return (
    <li className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-border px-1 py-3 first:border-t-0", unprepared && "opacity-60")} data-play-spell={text(spell.ref) || name}>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => openReference(spell)} className="text-left font-semibold underline-offset-4 hover:underline" aria-label={`${name} · ${t("features.reference", { name })}`}>
            {name}
          </button>
          {spell.concentration === true && <Tag>{t("spells.concentration")}</Tag>}
          {spell.ritual === true && <Tag>{t("spells.ritual")}</Tag>}
          {spell.material === true && <Tag>{t("spells.material")}</Tag>}
          {unprepared && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("spells.unprepared")}</span>}
          <CastingClassControl spell={spell} name={name} />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {spellLine(reference, spell)}
          {summary && <span className="block text-foreground/80 @[40rem]:inline @[40rem]:before:content-['_·_']">{summary}</span>}
        </p>
        {text(spell.notes).trim() && (
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground" data-play-spell-notes>
            {text(spell.notes).trim()}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rollable && facts && (
          <div className="grid grid-cols-[auto_auto] gap-2">
            <SpellDamageButtons spell={spell} facts={{ ...facts, dice, heal }} />
          </div>
        )}
        {castable && <CastButton spell={spell} onCast={setCastLevel} />}
        {level > 0 && <PrepareToggle spell={spell} name={name} />}
        <RowMenu list="spells" row={spell} name={name} shown={body.text} loading={body.loading} />
      </div>
    </li>
  );
}

function preparedLimit(system: ReturnType<typeof usePlay>["system"], values: Record<string, unknown>): number | null {
  if (num(values.level, 1) !== 1) return null;
  const classes = Array.isArray(system.gameData?.classes) ? (system.gameData.classes as Array<Record<string, unknown>>) : [];
  const found = classes.find((item) => item.id === values.classId);
  const prepared = (found?.spellcasting as { preparedL1?: unknown } | undefined)?.preparedL1;
  return typeof prepared === "number" && prepared > 0 ? prepared : null;
}

/**
 * The spell list the class casts from (phase 2b §3): a class that borrows another's list (`w.spellList`
 * on its wizard item, or `meta.spellcasting.list` on a Drive-pack or homebrew class entry) presets the
 * library to that list, else to its own id.
 */
export function classSpellList(system: ReturnType<typeof usePlay>["system"], classId: string, reference?: Pick<ReferenceContextValue, "packSpellListOf">): string {
  const fromPack = reference?.packSpellListOf?.(classId);
  if (fromPack) return fromPack;
  const classes = Array.isArray(system.gameData?.classes) ? (system.gameData.classes as Array<Record<string, unknown>>) : [];
  const borrowed = (classes.find((item) => item.id === classId)?.w as { spellList?: unknown } | undefined)?.spellList;
  return typeof borrowed === "string" && borrowed ? borrowed : classId;
}


/**
 * The 法術 library preset. Single class: that class's list, as before. Multiclass: 「我的職業」, the
 * union of every sheet class's list (borrowed lists respected); a spell added while one list is
 * filtered records the class that casts from it (`castingClass`, CLASS-IMPL §7.5 M5).
 */
export function spellLibrary(
  system: ReturnType<typeof usePlay>["system"],
  values: Record<string, unknown>,
  reference?: Pick<ReferenceContextValue, "packSpellListOf">,
): CompendiumStart {
  if (!isMulticlass(values)) {
    const classId = text(values.classId);
    return { tab: "spells", ...(classId ? { classId: classSpellList(system, classId, reference) } : {}) };
  }
  const castingClassOf: Record<string, string> = {};
  for (const sheetClass of sheetClasses(values)) {
    if (!sheetClass.classId) continue;
    const list = classSpellList(system, sheetClass.classId, reference);
    if (!(list in castingClassOf)) castingClassOf[list] = sheetClass.start ? "" : sheetClass.classId;
  }
  return { tab: "spells", classIds: Object.keys(castingClassOf), castingClassOf };
}

export function SpellsTab() {
  return (
    <EditIntl>
      <RowEditorHost>
        <SpellsTabBody />
      </RowEditorHost>
    </EditIntl>
  );
}

function SpellsTabBody() {
  const t = useTranslations("play");
  const tAbility = useTranslations("ability");
  const tRenderer = useTranslations("renderer");
  const { values, schema, system, reference } = usePlay();
  const open = useOpenDndEditor();
  const editing = usePlayEditing();
  const spells = rows(values.spells);
  const groups = spellGroups(spells);
  const prepared = spells.filter((spell) => num(spell.level) > 0 && spell.prepared === true && (text(spell.source) || "class") === "class").length;
  const always = alwaysPreparedCount(spells);
  const limit = preparedLimit(system, values);
  const ability = text(values.spellAbility);
  const attack = num(values.spellAttack);
  const slotLevels = new Set([...spellSlots(values).map((slot) => slot.level), ...(pactSlots(values) ? [pactSlots(values)!.level] : [])]);
  const levels = [...new Set([...groups.map((group) => group.level), ...slotLevels])].sort((a, b) => a - b);
  const casters = castingClasses(values);
  const preparedTile = (
    <div className={TILE} data-play-stat="prepared">
      <span className="text-xs text-muted-foreground">{t("spells.preparedLong")}</span>
      <span className="text-xl font-semibold tabular-nums">{limit ? `${prepared} / ${limit}` : prepared}</span>
      {always > 0 && (
        <span className="text-xs text-muted-foreground" title={t("spells.alwaysPreparedLong", { count: always })} data-play-always-prepared>
          {t("spells.alwaysPrepared", { count: always })}
        </span>
      )}
    </div>
  );
  const tile = TILE;
  return (
    <div className="space-y-3" data-play-spells-tab>
      {casters.length > 0 ? (
        <>
          {casters.map((caster) => (
            <CastingTiles key={caster.castingClass || "start"} caster={caster} />
          ))}
          <div className="grid grid-cols-3 gap-2 @[34rem]:grid-cols-4">{preparedTile}</div>
        </>
      ) : (
      <div className="grid grid-cols-3 gap-2 @[34rem]:grid-cols-4">
        {ability && ability !== "none" && (
          <div className={cn(tile, "hidden @[34rem]:flex")}>
            <span className="text-xs text-muted-foreground">{t("spells.ability")}</span>
            <span className="text-lg font-semibold">
              {tAbility(ability)} {signed(num(values.spellMod))}
            </span>
          </div>
        )}
        {editing ? (
          // B-023: in edit mode the DC tile opens spellcasting
          <button type="button" className={cn(tile, "transition-colors hover:bg-muted")} data-play-stat="spell-dc" aria-label={tRenderer("editValue", { name: t("spells.dc") })} aria-haspopup="dialog" onClick={() => open("spellcasting")}>
            <span className="text-xs text-muted-foreground">{t("spells.dc")}</span>
            <span className="text-xl font-semibold tabular-nums">{num(values.spellSaveDc)}<OverrideMark fieldId="spellSaveDc" /></span>
          </button>
        ) : (
          <div className={tile} data-play-stat="spell-dc">
            <span className="text-xs text-muted-foreground">{t("spells.dc")}</span>
            <span className="text-xl font-semibold tabular-nums">{num(values.spellSaveDc)}<OverrideMark fieldId="spellSaveDc" /></span>
          </div>
        )}
        <PlayRollButton onEdit={() => open("spellcasting")} roll={fieldRoll(schema, "spellAttack")} data={values} label={t("spells.attack")} icon={false} aria-label={`${t("spells.attack")} ${signed(attack)}`} className={cn(tile, "h-auto rounded-xl font-normal")}>
          <span className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">{t("spells.attack")}</span>
            <span className="text-xl font-semibold">{signed(attack)}<OverrideMark fieldId="spellAttack" /></span>
          </span>
        </PlayRollButton>
        {preparedTile}
      </div>
      )}
      <ConcentrationChip />
      <EditSlot part="spellcasting" />
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <AddControls list="spells" library={spellLibrary(system, values, reference)} />
        <CustomLink list="spells" />
      </div>
      <section className="space-y-2 rounded-xl border border-border bg-card p-2">
        {levels.length === 0 && <p className="p-2 text-sm text-muted-foreground">{t("spells.empty")}</p>}
        {levels.map((level) => {
          const group = groups.find((item) => item.level === level);
          const groupPrepared = (group?.spells ?? []).filter((spell) => spell.prepared === true).length;
          return (
            <div key={level} data-play-spell-level={level}>
              <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1">
                {level === 0 ? (
                  <>
                    <h3 className="text-sm font-semibold">{t("spells.cantrips")}</h3>
                    <span className="text-xs text-muted-foreground">{t("spells.atWill")}</span>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <SlotPips level={level} label={t("spells.level", { level })} />
                      {!slotLevels.has(level) && <h3 className="text-sm font-semibold">{t("spells.level", { level })}</h3>}
                    </div>
                    {group && <span className="text-xs text-muted-foreground">{t("spells.preparedCount", { count: groupPrepared })}</span>}
                  </>
                )}
              </header>
              {group && (
                <ul>
                  {group.spells.map((spell, index) => (
                    <SpellRow key={text(spell.id) || index} spell={spell} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
