"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { RollConfig } from "@skald/dice/roll-expression";
import { EditSlot, usePlay } from "./play-context";
import { featureDice, num, rows, text } from "./play-model";
import { PlayRollButton } from "./play-roll-button";
import { displayName, summaryOf, useRowText } from "./row-text";
import { CARD, CARD_TITLE } from "./card-styles";
import { SnapshotText } from "../../reference/snapshot-text";
import type { CompendiumStart } from "../compendium-rows";
import type { CustomList } from "../custom-rows";
import { EditIntl } from "./edit-messages";
import { sheetClasses } from "./class-model";
import { AddControls, CustomLink, RowEditorHost, RowMenu, useOpenRowEditor, useRowWrites } from "./row-actions";

const DICE_ROLL: RollConfig = { expression: "{{@dice}}", system: "dnd5e" as RollConfig["system"] };

/** A feature, trait or feat: name and a summary line; opening it shows the whole text (S11, P7). */
export function RuleRow({ row, list }: { row: Record<string, unknown>; list: string }) {
  const t = useTranslations("play");
  const { reference, openReference, values } = usePlay();
  const openRow = useOpenRowEditor();
  const body = useRowText(reference, row);
  const name = displayName(reference, row);
  const summary = summaryOf(body.text);
  const pack = text(row.origin) === "pack";
  // A feature that rolls (a Proficiency Bonus of d4s, Second Wind) gets its dice next to it (A3-05).
  const dice = featureDice(body.text, num(values.profBonus, 2));
  return (
    <li className="flex items-start gap-2 border-t border-border first:border-t-0" data-play-rule={text(row.id) || name}>
      <details className="group min-w-0 flex-1">
        <summary className="flex min-h-12 cursor-pointer list-none items-start gap-2 px-1 py-2.5 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold">
              {name}
              {pack && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{t("features.pack")}</span>}
            </span>
            <span className="block text-sm text-muted-foreground group-open:hidden" data-play-summary>
              {body.loading ? t("features.loading") : summary}
            </span>
          </span>
        </summary>
        <div className="space-y-2 pb-3 pl-7 pr-1 text-sm leading-relaxed">
          {body.text ? (
            <SnapshotText text={body.text} />
          ) : (
            <p className="text-muted-foreground">{body.loading ? t("features.loading") : t("features.noText")}</p>
          )}
          {(text(row.ref) || body.text) && (
            <button type="button" onClick={() => openReference(row)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-accent hover:bg-muted">
              <BookOpen className="size-4" aria-hidden="true" />
              {t("features.reference", { name })}
            </button>
          )}
        </div>
      </details>
      <RowMenu list={list} row={row} name={name} shown={body.text} loading={body.loading} className="mt-0.5" />
      {dice.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1 py-1.5">
          {dice.map((expression) => (
            <PlayRollButton key={expression} onEdit={() => openRow({ kind: "text", list, row, name, shown: body.text })} roll={DICE_ROLL} data={{ ...values, dice: expression }} label={`${name} ${expression}`} aria-label={t("features.rollDice", { name, dice: expression })} data-play-feature-dice={expression}>
              {expression}
            </PlayRollButton>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * A list of rules rows with its 「＋ 新增」 (plan-uat2 §3.2): the library on the list's category,
 * or the custom form for a list the library does not serve. An editor sees the section empty too.
 */
function RuleSection({ title, id, list, library }: { title: string; id: CustomList; list: Record<string, unknown>[]; library?: CompendiumStart }) {
  const t = useTranslations("play");
  const { editable } = usePlay();
  const { canWrite } = useRowWrites();
  if (list.length === 0 && !(editable && canWrite)) return null;
  return (
    <section className={CARD} aria-label={title} data-play-rule-list={id}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={CARD_TITLE}>{title}</h3>
        <AddControls list={id} library={library} />
      </header>
      {list.length === 0 && <p className="py-2 text-sm text-muted-foreground">{t("features.empty")}</p>}
      <ul className="mt-1">
        {list.map((row, index) => (
          <RuleRow key={text(row.id) || index} row={row} list={id} />
        ))}
      </ul>
      {library && <CustomLink list={id} />}
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  const t = useTranslations("play");
  if (items.length === 0) return <span className="text-sm text-muted-foreground">{t("features.empty")}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="rounded-full bg-muted/60 px-2.5 py-1 text-sm">
          {item}
        </span>
      ))}
    </span>
  );
}

/** Tool proficiencies: each a chip an editor can remove, and 「＋」 for the custom form. */
function ToolChips() {
  const t = useTranslations("edit.row");
  const tBlank = useTranslations("play.character");
  const { values, reference, editable } = usePlay();
  const writes = useRowWrites();
  const tools = rows(values.toolProficiencies);
  if (!editable || !writes.canWrite) return <Chips items={tools.map((row) => displayName(reference, row)).filter(Boolean)} />;
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-play-tools>
      {tools.map((row, index) => {
        const name = displayName(reference, row) || tBlank("blank");
        return (
          <span key={text(row.id) || index} className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 py-0.5 pl-2.5 pr-0.5 text-sm">
            {name}
            <button type="button" onClick={() => writes.remove("toolProficiencies", row, name)} aria-label={t("remove", { name })} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-muted">
              ×
            </button>
          </span>
        );
      })}
      <AddControls list="toolProficiencies" />
    </span>
  );
}

function Training() {
  const t = useTranslations("play");
  const tField = useTranslations("field");
  const { values } = usePlay();
  const armor = (["armorLight", "armorMedium", "armorHeavy", "armorShields"] as const).filter((id) => values[id] === true).map((id) => tField(id));
  const masteries = rows(values.weaponMasteries).map((row) => [text(row.name), text(row.mastery)].filter(Boolean).join(" · "));
  const lines: Array<[string, string[] | "tools"]> = [
    [t("features.armor"), armor],
    [t("features.weapons"), text(values.weaponProficiencies) ? [text(values.weaponProficiencies)] : []],
    [t("features.tools"), "tools"],
  ];
  if (masteries.length > 0) lines.push([t("features.masteries"), masteries]);
  return (
    <section className={CARD} aria-label={t("features.training")}>
      <h3 className={CARD_TITLE}>{t("features.training")}</h3>
      <dl className="mt-2 space-y-2">
        {lines.map(([label, items]) => (
          <div key={label} className={cn("grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2")}>
            <dt className="pt-1 text-xs text-muted-foreground">{label}</dt>
            <dd>{items === "tools" ? <ToolChips /> : <Chips items={items} />}</dd>
          </div>
        ))}
      </dl>
      <EditSlot part="training" />
    </section>
  );
}

export function FeaturesTab() {
  return (
    <EditIntl>
      <RowEditorHost>
        <FeaturesTabBody />
      </RowEditorHost>
    </EditIntl>
  );
}

/** The 特性 library preset: the class, or on a multiclass sheet 「我的職業」 (every sheet class, CLASS-IMPL §7.5 M5). */
function featureLibrary(values: Record<string, unknown>, classId: string): CompendiumStart {
  const classIds = rows(values.multiclass).length > 0 ? [...new Set(sheetClasses(values).map((sheetClass) => sheetClass.classId).filter(Boolean))] : [];
  if (classIds.length > 1) return { tab: "features", classIds };
  return { tab: "features", ...(classId ? { classId } : {}) };
}

function FeaturesTabBody() {
  const t = useTranslations("play");
  const { values } = usePlay();
  const classId = text(values.classId);
  return (
    <div className="space-y-3" data-play-features-tab>
      <RuleSection title={t("features.class")} id="features" list={rows(values.features)} library={featureLibrary(values, classId)} />
      <RuleSection title={t("features.species")} id="speciesTraits" list={rows(values.speciesTraits)} />
      <RuleSection title={t("features.feats")} id="feats" list={rows(values.feats)} library={{ tab: "feats" }} />
      <Training />
    </div>
  );
}
