"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { EditSlot, rowFieldRoll, usePlay } from "./play-context";
import { PlayRollButton } from "./play-roll-button";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import { cantripDice, num, rows, signed, text, weaponAttack } from "./play-model";
import { castingClasses } from "./casting-classes";
import { CastButton, SlotPips, SpellDamageButtons } from "./spells-tab";
import { Conditions, DeathSaves, HitDiceBlock, RestButtons } from "./vitals-bar";
import { displayName, spellLine, summaryOf, useSpellFacts } from "./row-text";
import { rowBodyText } from "./row-body";
import { SnapshotText } from "../../reference/snapshot-text";
import { CARD, CARD_TITLE } from "./card-styles";
import { EditIntl } from "./edit-messages";
import { AddControls, CustomLink, RowEditorHost, RowMenu, useOpenRowEditor } from "./row-actions";

const ATTACK_LIBRARY = { tab: "equipment", category: "weapon", intent: "attack" } as const;

function damageText(dice: string, mod: number, type: string): string {
  const base = dice ? (mod === 0 ? dice : `${dice}${signed(mod)}`) : signed(mod);
  return type ? `${base} ${type}` : base;
}

function WeaponRow({ row, compact }: { row: Record<string, unknown>; compact: boolean }) {
  const t = useTranslations("play");
  const { values, schema, reference } = usePlay();
  const openRow = useOpenRowEditor();
  const name = text(row.name) || (text(row.ref) ? reference.nameOf(text(row.ref)) : "—");
  // B-023: in edit mode the attack and damage open the attack's fields
  const editFields = () => openRow({ kind: "fields", list: "weapons", row, name });
  const { attack, damageMod } = weaponAttack(values, row);
  const data = { ...values, ...row, attack, damageMod };
  const damage = damageText(text(row.damageDice), damageMod, text(row.damageType));
  const sub = [text(row.notes), text(row.mastery)].filter(Boolean).join(" · ");
  // The attack's own description (編輯文字): a weapon row has no rules text of its own.
  const body = rowBodyText(row, null).trim();
  const summary = summaryOf(body);
  return (
    <li className={cn("grid items-center gap-2 border-t border-border py-2.5 first:border-t-0", compact ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_6rem_10rem]")} data-play-weapon>
      <div className={cn("flex min-w-0 items-start gap-1", compact && "col-span-2")}>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
          {body && summary === body && (
            <p className="text-xs text-muted-foreground" data-play-weapon-text>
              {body}
            </p>
          )}
          {body && summary !== body && (
            <details className="group mt-0.5" data-play-weapon-text>
              <summary className="flex cursor-pointer list-none items-start gap-1 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
                <ChevronDown className="mt-0.5 size-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                <span className="min-w-0 truncate group-open:sr-only">{summary}</span>
              </summary>
              <SnapshotText text={body} className="mt-1 pl-4.5 text-xs" />
            </details>
          )}
        </div>
        <RowMenu list="weapons" row={row} name={name} className="-my-1.5" />
      </div>
      <PlayRollButton onEdit={editFields} roll={rowFieldRoll(schema, "weapons", "attack")} data={data} label={t("combat.attackRoll", { name })} aria-label={t("combat.attackRoll", { name }) + ` ${signed(attack)}`} className="justify-start">
        {compact ? t("combat.hitValue", { value: signed(attack) }) : signed(attack)}
      </PlayRollButton>
      <PlayRollButton
        onEdit={editFields}
        roll={rowFieldRoll(schema, "weapons", "damageMod")}
        data={data}
        damage
        label={t("combat.damageRoll", { name })}
        disabled={!text(row.damageDice)}
        aria-label={t("combat.damageRoll", { name }) + ` ${damage}`}
        className="justify-start"
      >
        <span className="truncate">{compact ? t("combat.damageValue", { value: damage }) : damage}</span>
      </PlayRollButton>
    </li>
  );
}

/** A damage cantrip in the attack table, rolled like the spells tab does. */
function CantripRow({ spell, compact }: { spell: Record<string, unknown>; compact: boolean }) {
  const t = useTranslations("play");
  const { values, reference } = usePlay();
  const facts = useSpellFacts(text(spell.ref));
  if (!facts?.dice) return null;
  const name = displayName(reference, spell);
  const sub = [t("spells.cantrips"), spellLine(reference, spell)].filter(Boolean).join(" · ");
  return (
    <li className={cn("grid items-center gap-2 border-t border-border py-2.5 first:border-t-0", compact ? "grid-cols-2" : "grid-cols-[minmax(0,1fr)_16.5rem]")} data-play-cantrip>
      <div className={cn("min-w-0", compact && "col-span-2")}>
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className={cn("grid gap-2", compact ? "col-span-2 grid-cols-2" : "grid-cols-[6rem_10rem]")}>
        <SpellDamageButtons spell={spell} facts={{ ...facts, dice: cantripDice(facts.dice, num(values.level, 1)) }} compact={compact} />
      </div>
    </li>
  );
}

export function AttackTable({ compact }: { compact: boolean }) {
  const t = useTranslations("play");
  const tEdit = useTranslations("edit");
  const { values } = usePlay();
  const weapons = rows(values.weapons);
  const cantrips = rows(values.spells).filter((spell) => num(spell.level) === 0 && text(spell.ref).startsWith("spell:"));
  return (
    <section className={CARD} aria-label={t("combat.attacks")} data-play-attacks>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={CARD_TITLE}>{t("combat.attacks")}</h3>
        <AddControls list="weapons" library={ATTACK_LIBRARY} label={tEdit("addAttack")} />
      </header>
      {!compact && (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_6rem_10rem] gap-2 border-b border-border pb-1 text-xs text-muted-foreground">
          <span>{t("combat.name")}</span>
          <span>{t("combat.hit")}</span>
          <span>{t("combat.damage")}</span>
        </div>
      )}
      <ul>
        {weapons.map((row, index) => (
          <WeaponRow key={text(row.id) || index} row={row} compact={compact} />
        ))}
        {cantrips.map((spell, index) => (
          <CantripRow key={text(spell.id) || index} spell={spell} compact={compact} />
        ))}
      </ul>
      {weapons.length === 0 && cantrips.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("combat.empty")}</p>}
      <CustomLink list="weapons" />
    </section>
  );
}

function CombatSpells() {
  const t = useTranslations("play");
  const { values, reference } = usePlay();
  const leveled = rows(values.spells).filter((spell) => num(spell.level) > 0 && spell.prepared === true);
  if (leveled.length === 0) return null;
  const levels = [...new Set(leveled.map((spell) => num(spell.level)))].sort((a, b) => a - b);
  const casters = castingClasses(values);
  return (
    <section className={CARD} aria-label={t("combat.spells")} data-play-combat-spells>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={CARD_TITLE}>{t("combat.spells")}</h3>
        {casters.length > 0 ? (
          // A multiclass sheet: one DC and attack per casting class (CLASS-IMPL §7.5 M5).
          <span className="text-xs text-muted-foreground" data-play-casting-hint>
            {casters.map((caster) => t("spells.multiclass.hint", { class: caster.name, dc: caster.dc, attack: signed(caster.attack) })).join(" / ")}
          </span>
        ) : (
        <span className="text-xs text-muted-foreground">
          {t("combat.spellsHint", { dc: num(values.spellSaveDc), attack: signed(num(values.spellAttack)) })}
          <OverrideMark fieldId="spellSaveDc" />
          <OverrideMark fieldId="spellAttack" />
        </span>
        )}
      </header>
      <div className="mt-2 space-y-1">
        {levels.map((level) => (
          <SlotPips key={level} level={level} label={t("combat.slots", { level })} />
        ))}
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {leveled.map((spell, index) => (
          <li key={text(spell.id) || index} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{displayName(reference, spell)}</p>
              <p className="truncate text-xs text-muted-foreground">{spellLine(reference, spell)}</p>
            </div>
            <CastButton spell={spell} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Frame 07's lower half: what the compact bar has no room for. */
function LifeAndRest() {
  const t = useTranslations("play");
  return (
    <section className={cn(CARD, "space-y-3")} aria-label={t("combat.vitals")} data-play-life>
      <div className="grid grid-cols-2 gap-3">
        <DeathSaves />
        <HitDiceBlock />
      </div>
      <Conditions />
      <RestButtons />
    </section>
  );
}

export function CombatTab({ compact }: { compact: boolean }) {
  return (
    <EditIntl>
      <RowEditorHost>
        <CombatTabBody compact={compact} />
      </RowEditorHost>
    </EditIntl>
  );
}

function CombatTabBody({ compact }: { compact: boolean }) {
  return (
    <div className="space-y-3">
      <EditSlot part="combat" />
      <AttackTable compact={compact} />
      <CombatSpells />
      {compact && <LifeAndRest />}
    </div>
  );
}
