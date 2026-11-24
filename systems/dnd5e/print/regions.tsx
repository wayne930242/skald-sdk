"use client";

import type { ReactNode } from "react";
import type { AttackRowContent, EntryContent, EquipmentRowContent, ProseParagraph, SpellRowContent } from "./content";
import type { PrintLabels } from "./print-labels";

/**
 * The building blocks of the D&D print's pages: the official sheet's boxes and the frames inside
 * them, and what a frame holds (an entry, a summary line, a prose paragraph, a table row). The
 * measuring layer renders the same blocks, so the pager's heights are the printed ones.
 *
 * Every frame carries `data-print-frame` (it clips, and the pager fills it to a line short of its
 * height); every 續頁 heading carries `data-print-section`.
 */

/** ◇ / ◆: the official sheet's proficiency, training and slot marks. */
export function Diamond({ on = false }: { on?: boolean }) {
  return <span className="dnd-print-dia" data-on={on ? "true" : undefined} aria-hidden="true" />;
}

export function Check({ on = false }: { on?: boolean }) {
  return (
    <span className="dnd-print-check" aria-hidden="true">
      {on && (
        <svg viewBox="0 0 10 10">
          <path d="M1.8 5.2 L4.1 7.6 L8.4 2.4" />
        </svg>
      )}
    </span>
  );
}

export function Box({ region, title, note, className, children }: { region: string; title?: ReactNode; note?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <section className={["dnd-print-region", className].filter(Boolean).join(" ")} data-region={region}>
      {title !== undefined && (
        <h2>
          {title}
          {note ? <small>{note}</small> : null}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Frame({ id, className, children }: { id: string; className?: string; children?: ReactNode }) {
  return (
    <div className={["dnd-print-frame", className].filter(Boolean).join(" ")} data-print-frame={id}>
      {children}
    </div>
  );
}

/** One line of the frame's text, for the spare line a frame keeps (measuring layer only). */
export function LineProbe() {
  return <div className="dnd-print-probe" data-m="line">M</div>;
}

export function continued(labels: PrintLabels, title: string): string {
  return labels.print("continued", { title });
}

/** An entry's name line and paragraphs `[from, to)`; a part after the first says 「（續）」. */
export function EntryView({ entry, from = 0, to, cont = false, labels, measure = false }: {
  entry: EntryContent;
  from?: number;
  to?: number;
  cont?: boolean;
  labels: PrintLabels;
  measure?: boolean;
}) {
  return (
    <article className="dnd-print-entry" data-m={measure ? `entry:${entry.id}` : undefined} data-print-entry={measure ? undefined : entry.id}>
      <h4 data-m-head="">
        {cont ? continued(labels, entry.name) : entry.name}
        {entry.meta && <span className="dnd-print-meta">{entry.meta}</span>}
      </h4>
      {measure && (
        // the name line an entry prints atop the column it goes on in, measured once
        <h4 data-m-again="">
          {continued(labels, entry.name)}
          {entry.meta && <span className="dnd-print-meta">{entry.meta}</span>}
        </h4>
      )}
      {entry.paragraphs.slice(from, to).map((paragraph, index) => (
        <p key={from + index} data-m-part="">{paragraph}</p>
      ))}
    </article>
  );
}

export function GoTo({ title, labels, count, rows, compact }: { title: string; labels: PrintLabels; count?: number; rows?: boolean; compact?: boolean }) {
  const pointer = count === undefined
    ? labels.print(compact ? "gotoCompact" : "goto", { title })
    : labels.print(rows ? "moreRows" : "moreEntries", { count, title });
  return <span className="dnd-print-go" data-target-heading={title}>{pointer}</span>;
}

/** Rule H's summary line: the name, its level or category, the opening words and the heading above the full text. */
export function SummaryLine({ entry, title, labels, measure = false }: { entry: EntryContent; title: string; labels: PrintLabels; measure?: boolean }) {
  return (
    <div className="dnd-print-sum" data-m={measure ? `sum:${entry.id}` : undefined} data-print-summary={measure ? undefined : entry.id}>
      <b>{entry.name}</b>
      {entry.meta && <span className="dnd-print-meta">{entry.meta}</span>}
      <span className="dnd-print-teaser">{entry.teaser}</span>
      <GoTo title={title} labels={labels} />
    </div>
  );
}

export function MoreLine({ count, title, labels }: { count: number; title: string; labels: PrintLabels }) {
  return (
    <div className="dnd-print-sum dnd-print-more">
      <GoTo title={title} labels={labels} count={count} />
    </div>
  );
}

/** A prose paragraph's pieces `[from, to)`, with a named continuation pointer when it is cut. */
export function ProseView({ paragraph, from = 0, to, marker, measure }: { paragraph: ProseParagraph; from?: number; to?: number; marker?: ReactNode; measure?: string }) {
  return (
    <p className="dnd-print-para" data-m={measure}>
      {paragraph.label !== undefined && from === 0 && <span className="dnd-print-run">{paragraph.label}</span>}
      {paragraph.pieces.slice(from, to).map((piece, index) => (
        <span key={from + index} data-piece="">{piece}</span>
      ))}
      {marker}
    </p>
  );
}


// ── tables ──────────────────────────────────────────────────────────────────────────────────

export type TableKind = "attacks" | "spells" | "spellsCompact" | "equipment" | "index";

const WIDTHS: Record<TableKind, string[]> = {
  attacks: ["27%", "20%", "22%", "31%"],
  spells: ["5%", "6%", "20%", "13%", "14.5%", "16.5%", "25%"],
  /** 續頁's narrower spell table: C/R/M as letters, only where set. */
  spellsCompact: ["5%", "5%", "24%", "14%", "16%", "9%", "27%"],
  equipment: ["9%", "11%", "62%", "18%"],
  index: ["39%", "6%", "6%", "12%", "17%", "20%"],
};

export const COLUMNS: Record<TableKind, number> = { attacks: 4, spells: 7, spellsCompact: 7, equipment: 4, index: 6 };

function headLabels(kind: TableKind, labels: PrintLabels): string[] {
  const { print } = labels;
  switch (kind) {
    case "attacks":
      return [print("attacks.name"), print("attacks.hit"), print("attacks.damage"), print("attacks.notes")];
    case "spells":
      return [print("spells.level"), print("spells.prepared"), print("spells.name"), print("spells.castingTime"), print("spells.range"), print("spells.crm"), print("spells.notes")];
    case "spellsCompact":
      return [print("spells.level"), print("spells.prepared"), print("spells.name"), print("spells.castingTime"), print("spells.range"), print("spellbook.crm"), print("spells.notes")];
    case "equipment":
      return [print("equipment.equipped"), print("equipment.qty"), print("equipment.name"), print("equipment.weight")];
    case "index":
      return [print("spellbook.name"), print("spellbook.level"), print("spellbook.prepared"), print("spellbook.crm"), print("spellbook.castingTime"), print("spellbook.range")];
  }
}

export function RowTable({ kind, labels, children, measure }: { kind: TableKind; labels: PrintLabels; children?: ReactNode; measure?: string }) {
  return (
    <table className={`dnd-print-rows dnd-print-rows-${kind === "spellsCompact" ? "spells" : kind}`} data-m={measure}>
      <colgroup>
        {WIDTHS[kind].map((width, index) => <col key={index} style={{ width }} />)}
      </colgroup>
      <thead data-m-head="">
        <tr>
          {headLabels(kind, labels).map((label, index) => <th key={index}>{label}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function AttackRow({ row, measure }: { row: AttackRowContent; measure?: boolean }) {
  return (
    <tr data-m-row={measure ? "" : undefined}>
      <td className="dnd-print-strong">{row.name}</td>
      <td className="dnd-print-c">{row.hit}</td>
      <td>{row.damage}</td>
      <td>{row.notes}</td>
    </tr>
  );
}

function Crm({ c, r, m, labels }: { c: boolean; r: boolean; m: boolean; labels: PrintLabels }) {
  return (
    <td className="dnd-print-crm">
      <Diamond on={c} />
      {labels.print("spells.c")}
      <Diamond on={r} />
      {labels.print("spells.r")}
      <Diamond on={m} />
      {labels.print("spells.m")}
    </td>
  );
}

export function SpellRow({ row, labels, measure, compact = false }: { row: SpellRowContent; labels: PrintLabels; measure?: boolean; compact?: boolean }) {
  const { print } = labels;
  return (
    <tr data-m-row={measure ? "" : undefined}>
      <td className="dnd-print-c">{row.level}</td>
      <td className="dnd-print-c">{row.mark}</td>
      <td className="dnd-print-strong">{row.name}</td>
      <td>{row.castingTime}</td>
      <td>{row.range}</td>
      {compact ? (
        <td className="dnd-print-c">{[row.c ? print("spells.c") : "", row.r ? print("spells.r") : "", row.m ? print("spells.m") : ""].join("")}</td>
      ) : (
        <Crm c={row.c} r={row.r} m={row.m} labels={labels} />
      )}
      <td>{row.notes}</td>
    </tr>
  );
}

export function EquipmentRow({ row, measure }: { row: EquipmentRowContent; measure?: boolean }) {
  return (
    <tr data-m-row={measure ? "" : undefined}>
      <td className="dnd-print-c"><Check on={row.equipped} /></td>
      <td className="dnd-print-c">{row.qty}</td>
      <td>{row.name}</td>
      <td className="dnd-print-c">{row.weight}</td>
    </tr>
  );
}

/** An official empty row to write in. */
export function BlankRow({ kind, labels, measure }: { kind: TableKind; labels: PrintLabels; measure?: boolean }) {
  const mark = measure ? "blank" : undefined;
  if (kind === "spells") {
    return (
      <tr className="dnd-print-blank" data-m={mark}>
        <td /><td /><td /><td /><td />
        <Crm c={false} r={false} m={false} labels={labels} />
        <td />
      </tr>
    );
  }
  if (kind === "equipment") {
    return (
      <tr className="dnd-print-blank" data-m={mark}>
        <td className="dnd-print-c"><Check /></td><td /><td /><td />
      </tr>
    );
  }
  return (
    <tr className="dnd-print-blank" data-m={mark}>
      {Array.from({ length: COLUMNS[kind] }, (_, index) => <td key={index} />)}
    </tr>
  );
}

/** A named pointer for the remaining rows. */
export function MarkerRow({ kind, count, title, labels, measure }: { kind: TableKind; count: number; title: string; labels: PrintLabels; measure?: boolean }) {
  return (
    <tr className="dnd-print-marker" data-m={measure ? "marker" : undefined}>
      <td colSpan={COLUMNS[kind]}>
        <GoTo title={title} labels={labels} count={count} rows />
      </td>
    </tr>
  );
}
