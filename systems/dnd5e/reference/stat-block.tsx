"use client";

import { Fragment, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { InlineText as Inline, type EntriesRenderContext } from "./entries-renderer";
import type { LocalizedBlock } from "./sources";
import { slugId } from "./tags";

/**
 * A 2024 creature stat block (plan T2b §5.1) from a creature's `meta` (5etools XMM shape) and its
 * blocks, grouped by `meta.section`. Labels and enumerated codes come from the lazy reference
 * labels; free text (gear, languages, hit point notes) arrives already localized in `meta`. Shows
 * whichever meta it is given: the overlay's while the XMM wording is shown, the SRD one when toggled.
 */

type Meta = Record<string, unknown>;

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SECTIONS = ["trait", "action", "bonus", "reaction", "legendary"] as const;
const SENSE = /^(Blindsight|Darkvision|Tremorsense|Truesight) (\d+) ft\.(.*)$/;

function isRecord(value: unknown): value is Meta {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const signed = (value: number) => (value >= 0 ? `+${value}` : `−${Math.abs(value)}`);
const modifier = (score: number) => Math.floor((score - 10) / 2);
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

export interface StatBlockProps {
  meta: Meta;
  blocks: LocalizedBlock[];
  context: EntriesRenderContext;
  /** One block as the caller shows it (with its English badge in a zh view). */
  renderBlock: (block: LocalizedBlock, index: number) => ReactNode;
  /** A built-in name by kind and id (conditions, languages), or undefined. */
  nameOf: (kind: "condition" | "language", id: string) => string | undefined;
  className?: string;
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="my-0.5">
      <span className="font-semibold">{label}</span> {children}
    </p>
  );
}

export function StatBlock({ meta, blocks, context, renderBlock, nameOf, className }: StatBlockProps) {
  const t = useTranslations("referenceUi.statBlock");
  const tSkill = useTranslations("skill");
  const has = (key: string) => t.has(key as never);
  const code = (group: string, value: string) => (has(`${group}.${value}`) ? t(`${group}.${value}` as never) : value);
  const locale = useLocale();
  const or = (values: string[]) => new Intl.ListFormat(locale, { type: "disjunction" }).format(values);
  const feet = (value: unknown) => t("feet", { value: String(value) });

  const sizes = or(array(meta.size).map((size) => code("size", String(size))));
  const typeText = (() => {
    const type = meta.type;
    if (typeof type === "string") return code("type", type);
    if (!isRecord(type)) return "";
    const base = type.type;
    if (isRecord(base) && Array.isArray(base.choose)) {
      const choice = or(base.choose.map((value) => code("type", String(value))));
      return type.note === "(Your Choice)" ? t("yourChoice", { choice }) : choice;
    }
    const name = code("type", String(base ?? ""));
    if (typeof type.swarmSize === "string") {
      return t("swarm", { size: sizes, swarmSize: code("size", type.swarmSize), type: code("swarmType", String(base)) });
    }
    const tags = array(type.tags).map((tag) => code("creatureTag", String(tag)));
    return tags.length > 0 ? `${name} (${tags.join(", ")})` : name;
  })();
  const isSwarm = isRecord(meta.type) && typeof meta.type.swarmSize === "string";
  const alignment = code("alignment", array(meta.alignment).join("") || "U");
  const subtitle = t("subtitle", { type: isSwarm ? typeText : t("sizedType", { size: sizes, type: typeText }), alignment });
  const sep = t("sep");

  const ac = array(meta.ac).map((value) => (typeof value === "number" ? String(value) : isRecord(value) ? String(value.special ?? value.ac ?? "") : ""));
  const initiative = typeof meta.initiative === "number" ? `${signed(meta.initiative)} (${10 + meta.initiative})` : undefined;
  const hp = isRecord(meta.hp) ? (typeof meta.hp.special === "string" ? meta.hp.special : `${String(meta.hp.average ?? "")} (${String(meta.hp.formula ?? "")})`) : "";

  const speed = (() => {
    if (!isRecord(meta.speed)) return "";
    const one = (value: unknown): string => {
      if (typeof value === "number") return feet(value);
      if (!isRecord(value)) return "";
      const condition = value.condition === "(hover)" ? t("hover") : typeof value.condition === "string" ? value.condition : "";
      return [feet(value.number), condition].filter(Boolean).join(" ");
    };
    const parts: string[] = [];
    if (meta.speed.walk !== undefined) parts.push(one(meta.speed.walk));
    for (const mode of ["burrow", "climb", "fly", "swim"]) {
      if (meta.speed[mode] !== undefined) parts.push(t("modeSpeed", { mode: code("speedMode", mode), speed: one(meta.speed[mode]) }));
    }
    const choose = meta.speed.choose;
    if (isRecord(choose)) {
      parts.push([or(array(choose.from).map((mode) => code("speedMode", String(mode)))), feet(choose.amount), typeof choose.note === "string" ? choose.note : ""].filter(Boolean).join(" "));
    }
    const alternate = meta.speed.alternate;
    if (isRecord(alternate)) for (const values of Object.values(alternate)) for (const value of array(values)) parts.push(one(value));
    return parts.filter(Boolean).join(sep);
  })();

  const abilities = isRecord(meta.abilities) ? meta.abilities : {};
  const saves = isRecord(meta.save) ? meta.save : {};

  const skills = isRecord(meta.skill)
    ? Object.entries(meta.skill).map(([skill, bonus]) => {
        const key = skill.replace(/ (\w)/g, (_, letter: string) => letter.toUpperCase());
        return `${tSkill.has(key as never) ? tSkill(key as never) : skill} ${String(bonus)}`;
      })
    : [];

  /** Damage or condition lists: codes, `{special}`, or `{<field>: [...], note}` groups. */
  const defenses = (value: unknown, field: string, kind: "damage" | "condition"): ReactNode[] =>
    array(value).map((item, index) => {
      if (typeof item === "string") {
        const label = kind === "damage" ? code("damage", item) : (nameOf("condition", slugId(item)) ?? item);
        return <Fragment key={index}>{label}</Fragment>;
      }
      if (!isRecord(item)) return null;
      if (typeof item.special === "string") return <Inline key={index} text={item.special} context={context} />;
      const inner = array(item[field]).map((part) => (kind === "damage" ? code("damage", String(part)) : (nameOf("condition", slugId(String(part))) ?? String(part))));
      return (
        <Fragment key={index}>
          {inner.join(sep)}
          {typeof item.note === "string" && <> <Inline text={item.note} context={context} /></>}
        </Fragment>
      );
    });
  const joined = (nodes: ReactNode[], separator: string) =>
    nodes.filter((node) => node !== null).map((node, index) => (
      <Fragment key={index}>
        {index > 0 && separator}
        {node}
      </Fragment>
    ));
  const resist = defenses(meta.resist, "resist", "damage");
  const vulnerable = defenses(meta.vulnerable, "vulnerable", "damage");
  const immune = defenses(meta.immune, "immune", "damage");
  const conditionImmune = defenses(meta.conditionImmune, "conditionImmune", "condition");

  const senses = array(meta.senses).map((sense, index) => {
    const text = String(sense);
    const match = SENSE.exec(text);
    if (!match) return <Inline key={index} text={text} context={context} />;
    return (
      <Fragment key={index}>
        {code("sense", match[1].toLowerCase())} {feet(match[2])}
        {match[3] && <Inline text={match[3]} context={context} />}
      </Fragment>
    );
  });
  if (typeof meta.passive === "number") senses.push(<Fragment key="passive">{t("passive", { value: meta.passive })}</Fragment>);

  const languages = array(meta.languages).map((language, index) => {
    const text = String(language);
    if (/\s/.test(text)) return <Inline key={index} text={text} context={context} />;
    return <Fragment key={index}>{nameOf("language", slugId(text)) ?? text}</Fragment>;
  });

  const gear = array(meta.gear).map((item, index) => <Inline key={index} text={String(item)} context={context} />);

  const cr = (() => {
    const pb = typeof meta.pb === "number" ? signed(meta.pb) : meta.pbNote === "equals your Proficiency Bonus" ? t("pbYours") : String(meta.pbNote ?? "");
    if (!isRecord(meta.cr)) return t("crSummon", { pb });
    const xp = Number(meta.cr.xp ?? 0).toLocaleString("en-US");
    const value = String(meta.cr.cr ?? "");
    return typeof meta.cr.xpLair === "number"
      ? t("crLineLair", { cr: value, xp, xpLair: meta.cr.xpLair.toLocaleString("en-US"), pb })
      : t("crLine", { cr: value, xp, pb });
  })();

  const sections = Array.isArray(meta.section) ? (meta.section as unknown[]) : [];
  const grouped = new Map<string, Array<{ block: LocalizedBlock; index: number }>>();
  let last = "trait";
  blocks.forEach((block, index) => {
    const section = typeof sections[index] === "string" ? (sections[index] as string) : last;
    last = section;
    grouped.set(section, [...(grouped.get(section) ?? []), { block, index }]);
  });
  const order = [...SECTIONS, ...[...grouped.keys()].filter((key) => !(SECTIONS as readonly string[]).includes(key))];

  return (
    <div className={cn("space-y-2 text-sm", className)} data-stat-block>
      {subtitle && <p className="italic text-muted-foreground" data-stat-subtitle>{subtitle}</p>}
      <div className="space-y-0.5 border-y py-1.5">
        <div className="flex flex-wrap gap-x-4">
          <Line label={t("ac")}>{ac.join(", ")}</Line>
          {initiative && <Line label={t("initiative")}>{initiative}</Line>}
        </div>
        <Line label={t("hp")}>{hp}</Line>
        <Line label={t("speed")}>{speed}</Line>
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-3" data-stat-abilities>
        {ABILITIES.map((ability) => {
          const score = typeof abilities[ability] === "number" ? (abilities[ability] as number) : 10;
          const mod = signed(modifier(score));
          const save = typeof saves[ability] === "string" ? String(saves[ability]).replace(/^-/, "−") : mod;
          return (
            <div key={ability} className="grid grid-cols-[3rem_2.25rem_2.5rem_2.5rem] items-baseline rounded bg-muted/40 px-1.5 py-0.5 tabular-nums" data-ability={ability}>
              <span className="font-semibold">{t(`ability.${ability}`)}</span>
              <span>{score}</span>
              <span title={t("mod")}>{mod}</span>
              <span title={t("save")} className="text-muted-foreground">{save}</span>
            </div>
          );
        })}
      </div>
      <div className="space-y-0.5 border-y py-1.5">
        {skills.length > 0 && <Line label={t("skills")}>{skills.join(sep)}</Line>}
        {resist.length > 0 && <Line label={t("resistances")}>{joined(resist, sep)}</Line>}
        {vulnerable.length > 0 && <Line label={t("vulnerabilities")}>{joined(vulnerable, sep)}</Line>}
        {(immune.length > 0 || conditionImmune.length > 0) && (
          <Line label={t("immunities")}>
            {joined(immune, sep)}
            {immune.length > 0 && conditionImmune.length > 0 && "; "}
            {joined(conditionImmune, sep)}
          </Line>
        )}
        {gear.length > 0 && <Line label={t("gear")}>{joined(gear, sep)}</Line>}
        <Line label={t("senses")}>{joined(senses, sep)}</Line>
        <Line label={t("languages")}>{languages.length > 0 ? joined(languages, sep) : t("none")}</Line>
        <Line label={t("cr")}>{cr}</Line>
      </div>
      {order.map((section) => {
        const rows = grouped.get(section);
        if (!rows) return null;
        return (
          <section key={section} data-stat-section={section}>
            {has(`section.${section}`) && <h4 className="mt-2 border-b font-semibold text-primary">{t(`section.${section}` as never)}</h4>}
            {rows.map(({ block, index }) => (
              <Fragment key={index}>{renderBlock(block, index)}</Fragment>
            ))}
          </section>
        );
      })}
    </div>
  );
}
