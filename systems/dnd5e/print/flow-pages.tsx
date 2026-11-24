"use client";

import type { ReactNode } from "react";
import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import type { PrintContent, SpellbookEntry } from "./content";
import { Page } from "./page-1";
import type { FlowColumn, FlowItem, SectionId } from "./paginate";
import type { PrintLabels } from "./print-labels";
import {
  AttackRow,
  continued,
  EntryView,
  EquipmentRow,
  Frame,
  partViews,
  ProseView,
  RowTable,
  SpellRow,
  type TableKind,
} from "./regions";

/** A region's own title, as page 1 or 2 prints it. */
export function regionTitle(id: SectionId, labels: PrintLabels): string {
  const { print } = labels;
  switch (id) {
    case "status":
      return print("status.title");
    case "training":
      return print("training.title");
    case "attacks":
      return print("attacks.title");
    case "spells":
      return print("spells.title");
    case "appearance":
      return print("appearance.title");
    case "backstory":
      return print("backstory.title");
    case "languages":
      return print("languages");
    case "equipment":
      return print("equipment.title");
    default:
      return print(`regions.${id}`);
  }
}

/** Sections only 續頁 prints: their first heading is the plain title. */
const OWN_SECTIONS: ReadonlySet<string> = new Set(["items", "attackTexts", "notes"]);

/** The heading a 續頁 section prints: the region's title with 「（續）」. */
export function sectionHeading(id: SectionId, again: boolean, labels: PrintLabels): string {
  const title = regionTitle(id, labels);
  return OWN_SECTIONS.has(id) && !again ? title : continued(labels, title);
}

const TABLE_OF: Partial<Record<string, TableKind>> = { attacks: "attacks", spells: "spellsCompact", equipment: "equipment" };

function findEntry(content: PrintContent, id: string) {
  const list = id.split(":")[0];
  if (list === "features" || list === "speciesTraits" || list === "feats") return content.text[list].find((entry) => entry.id === id);
  if (list === "equipment") return content.items.find((entry) => entry.id === id);
  if (list === "weapons") return content.attackTexts.find((entry) => entry.id === id);
  return undefined;
}

function TableRow({ kind, index, content, labels }: { kind: TableKind; index: number; content: PrintContent; labels: PrintLabels }) {
  if (kind === "attacks") return <AttackRow row={content.attacks[index]} />;
  if (kind === "spells" || kind === "spellsCompact") return <SpellRow row={content.spells[index]} labels={labels} compact={kind === "spellsCompact"} />;
  return <EquipmentRow row={content.equipment[index]} />;
}

/** A 續頁 column: section headings, entries, prose and table rows as the pager placed them. */
export function ContinuationColumn({ column, content, labels }: { column: FlowColumn; content: PrintContent; labels: PrintLabels }) {
  const out: ReactNode[] = [];
  let table: { kind: TableKind; rows: ReactNode[]; key: string } | null = null;
  const flush = () => {
    if (!table) return;
    const { kind, rows, key } = table;
    out.push(<RowTable key={key} kind={kind} labels={labels}>{rows}</RowTable>);
    table = null;
  };
  column.items.forEach((item: FlowItem, index) => {
    if (item.kind === "title") {
      flush();
      const id = item.section as SectionId;
      out.push(
        <h3 key={`t${index}`} className="dnd-print-sec" data-print-section={id} data-again={item.again ? "true" : undefined}>
          {sectionHeading(id, item.again, labels)}
        </h3>,
      );
      return;
    }
    if (item.kind === "tableHead") {
      flush();
      table = { kind: TABLE_OF[item.section] ?? "attacks", rows: [], key: `table${index}` };
      return;
    }
    const kind = TABLE_OF[item.section];
    if (kind && item.block.includes(":row:")) {
      const row = Number(item.block.split(":row:")[1]);
      table ??= { kind, rows: [], key: `table${index}` };
      table.rows.push(<TableRow key={item.block} kind={kind} index={row} content={content} labels={labels} />);
      return;
    }
    flush();
    const [prose, paragraph] = item.block.split(":");
    if (prose in content.prose) {
      const found = content.prose[prose as keyof PrintContent["prose"]][Number(paragraph)];
      if (found) out.push(<ProseView key={item.block + index} paragraph={found} from={item.from} to={item.to} />);
      return;
    }
    const entry = findEntry(content, item.block);
    if (entry) out.push(<EntryView key={item.block + index} entry={entry} from={item.from} to={item.to} cont={item.cont} labels={labels} />);
  });
  flush();
  return <>{out}</>;
}

function SpellbookEntryView({ spell, from = 0, to, cont = false, labels, measure }: { spell: SpellbookEntry; from?: number; to?: number; cont?: boolean; labels: PrintLabels; measure?: boolean }) {
  const lead = spellLead(spell, labels);
  return (
    <article className="dnd-print-spell" data-m={measure ? `spell:${spell.id}` : undefined} data-print-spell={measure ? undefined : spell.id}>
      <h4 data-m-head="">
        <span className="dnd-print-mark">{spell.mark}</span>
        <span data-spell-name="">{cont ? continued(labels, spell.name) : spell.name}</span>
        {spell.tags.map((tag) => <span key={tag} className="dnd-print-tag">{tag}</span>)}
      </h4>
      {measure && (
        // the name line a spell prints atop the column it goes on in, measured once
        <h4 data-m-again="">
          <span className="dnd-print-mark">{spell.mark}</span>
          <span>{continued(labels, spell.name)}</span>
          {spell.tags.map((tag) => <span key={tag} className="dnd-print-tag">{tag}</span>)}
        </h4>
      )}
      {lead.slice(from, to)}
      {partViews(spell.paragraphs, spell.joined, Math.max(0, from - lead.length), to === undefined ? undefined : Math.max(0, to - lead.length), Boolean(measure))}
    </article>
  );
}

/** A spell's parts after its name line before its text (`partViews`): the stat line and its notes. */
function spellLead(spell: SpellbookEntry, labels: PrintLabels): ReactNode[] {
  return [
    ...(spell.stats.length > 0
      ? [
        <p key="stats" className="dnd-print-spell-stats" data-m-part="">
          {spell.stats.map((stat) => (
            <span key={stat.label}>
              <span className="dnd-print-label">{stat.label}</span> {stat.value}
            </span>
          ))}
        </p>,
      ]
      : []),
    ...(spell.notes
      ? [
        <p key="notes" className="dnd-print-spell-notes" data-m-part="">
          <b>{labels.print("spellbook.notes")}</b>
          {spell.notes}
        </p>,
      ]
      : []),
  ];
}

export { SpellbookEntryView };

export function IndexRow({ row, measure }: { row: PrintContent["index"][number]; measure?: boolean }) {
  return (
    <tr data-m-row={measure ? "" : undefined} data-index-spell={measure ? undefined : row.id}>
      <td data-target-heading={measure ? undefined : row.name}>{row.name}</td>
      <td className="dnd-print-c">{row.level}</td>
      <td className="dnd-print-c">{row.mark}</td>
      <td>{row.crm}</td>
      <td>{row.castingTime}</td>
      <td>{row.range}</td>
    </tr>
  );
}

export function LevelHeading({ level, again, content, labels, measure }: { level: number; again: boolean; content: PrintContent; labels: PrintLabels; measure?: string }) {
  const found = content.spellbook.find((entry) => entry.level === level);
  const title = found?.title ?? "";
  return (
    <h3 className="dnd-print-level" data-m={measure} data-print-section={measure ? undefined : `level:${level}`} data-again={again ? "true" : undefined}>
      {again ? continued(labels, title) : title}
      {found && found.slots > 0 && <small>{labels.print("spellbook.slotCount", { count: found.slots })}</small>}
    </h3>
  );
}

export function IndexHeading({ labels, measure }: { labels: PrintLabels; measure?: string }) {
  return (
    <h3 className="dnd-print-sec" data-m={measure} data-print-section={measure ? undefined : "index"}>
      {labels.print("spellbook.index")}
      <small>{labels.print("spellbook.legend")}</small>
    </h3>
  );
}

/** A spellbook column: the index (by spell name), level headings and the spells. */
export function SpellbookColumn({ column, content, labels }: { column: FlowColumn; content: PrintContent; labels: PrintLabels }) {
  const out: ReactNode[] = [];
  let rows: ReactNode[] | null = null;
  const flush = () => {
    if (!rows) return;
    out.push(<RowTable key={`index${out.length}`} kind="index" labels={labels}>{rows}</RowTable>);
    rows = null;
  };
  const spells = new Map(content.spellbook.flatMap((level) => level.spells.map((spell) => [spell.id, spell] as const)));
  const index = new Map(content.index.map((row) => [row.id, row]));
  column.items.forEach((item, position) => {
    if (item.kind === "title") {
      flush();
      if (item.section === "index") out.push(<IndexHeading key={`t${position}`} labels={labels} />);
      else out.push(<LevelHeading key={`t${position}`} level={Number(item.section.split(":")[1])} again={item.again} content={content} labels={labels} />);
      return;
    }
    if (item.kind === "tableHead") {
      flush();
      rows = [];
      return;
    }
    if (item.block.startsWith("index:")) {
      const id = item.block.slice("index:".length);
      const row = index.get(id);
      rows ??= [];
      if (row) rows.push(<IndexRow key={item.block} row={row} />);
      return;
    }
    flush();
    const spell = spells.get(item.block);
    if (spell) out.push(<SpellbookEntryView key={item.block + position} spell={spell} from={item.from} to={item.to} cont={item.cont} labels={labels} />);
  });
  flush();
  return <>{out}</>;
}

/** A page after the core two: a running head and two column frames. */
export function FlowPage({ paper, page, running, name, frames }: {
  paper: PrintPaper;
  page: number;
  running: string;
  name: string;
  frames: Array<{ id: string; children: ReactNode }>;
}) {
  return (
    <Page paper={paper} page={page} kind="flow">
      <div className="dnd-print-running">
        <b>{running}</b>
        <span>{name}</span>
      </div>
      <div className="dnd-print-flow-body">
        {frames.map((frame) => <Frame key={frame.id} id={frame.id} className="dnd-print-flow-frame">{frame.children}</Frame>)}
      </div>
    </Page>
  );
}
