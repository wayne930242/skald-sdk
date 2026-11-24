"use client";

import { forwardRef, type ReactNode } from "react";
import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import type { PrintContent } from "./content";
import {
  ContinuationColumn,
  FlowPage,
  IndexHeading,
  IndexRow,
  LevelHeading,
  sectionHeading,
  SpellbookColumn,
  SpellbookEntryView,
} from "./flow-pages";
import { Page1, type FrameContents } from "./page-1";
import { Page2, hasSpellArea } from "./page-2";
import { SECTIONS, type DocumentPlan, type ProsePlan, type ProseId, type TablePlan, type TextRegionId, type TextRegionPlan } from "./paginate";
import type { PrintLabels } from "./print-labels";
import type { DndPrintModel } from "./print-model";
import {
  AttackRow,
  BlankRow,
  EntryView,
  EquipmentRow,
  LineProbe,
  MarkerRow,
  MoreLine,
  GoTo,
  ProseView,
  RowTable,
  SpellRow,
  SummaryLine,
  type TableKind,
} from "./regions";

export interface LayoutViewProps {
  model: DndPrintModel;
  content: PrintContent;
  labels: PrintLabels;
  paper: PrintPaper;
  portrait: string | null;
  attribution: string;
  carry: string;
}

/** Page 2's left half takes 續頁 content: a non-caster's compact print. */
export function continuesOnPage2(model: DndPrintModel): boolean {
  return !hasSpellArea(model);
}

// ── what a frame holds while measuring: every candidate ─────────────────────────────────────

function proseCandidates(id: ProseId | "notes", content: PrintContent, labels: PrintLabels): ReactNode {
  return (
    <>
      {content.prose[id].map((paragraph, index) => <ProseView key={index} paragraph={paragraph} measure={`prose:${id}:${index}`} />)}
      <p className="dnd-print-para" data-m="marker"><GoTo title={sectionHeading(id, false, labels)} labels={labels} /></p>
      <LineProbe />
    </>
  );
}

function tableRows(kind: Exclude<TableKind, "index">, content: PrintContent, labels: PrintLabels, measure: boolean, from = 0, to?: number) {
  if (kind === "attacks") return content.attacks.slice(from, to).map((row) => <AttackRow key={row.id} row={row} measure={measure} />);
  if (kind === "spells" || kind === "spellsCompact") {
    return content.spells.slice(from, to).map((row) => <SpellRow key={row.id} row={row} labels={labels} measure={measure} compact={kind === "spellsCompact"} />);
  }
  return content.equipment.slice(from, to).map((row) => <EquipmentRow key={row.id} row={row} measure={measure} />);
}

function tableCandidates(kind: "attacks" | "spells" | "equipment", content: PrintContent, labels: PrintLabels): ReactNode {
  return (
    <>
      <RowTable kind={kind} labels={labels} measure="table">
        {tableRows(kind, content, labels, true)}
        <MarkerRow kind={kind} count={99} title={sectionHeading(kind, false, labels)} labels={labels} measure />
        <BlankRow kind={kind} labels={labels} measure />
      </RowTable>
      <LineProbe />
    </>
  );
}

function textCandidates(id: TextRegionId, content: PrintContent, labels: PrintLabels): ReactNode {
  return (
    <>
      {content.text[id].map((entry) => <EntryView key={entry.id} entry={entry} labels={labels} measure />)}
      {content.text[id].map((entry) => <SummaryLine key={`s${entry.id}`} entry={entry} title={sectionHeading(id, false, labels)} labels={labels} measure />)}
      <MoreLine count={content.text[id].length} title={sectionHeading(id, false, labels)} labels={labels} />
      <LineProbe />
    </>
  );
}

/** Everything that may continue on 續頁, at one column's width. */
function continuationCandidates(content: PrintContent, labels: PrintLabels): ReactNode {
  return (
    <>
      <LineProbe />
      {SECTIONS.map((id) => <h3 key={id} className="dnd-print-sec" data-m={`title:${id}`}>{sectionHeading(id, false, labels)}</h3>)}
      {[...content.text.features, ...content.text.speciesTraits, ...content.text.feats, ...content.items, ...content.attackTexts].map((entry) => (
        <EntryView key={entry.id} entry={entry} labels={labels} measure />
      ))}
      {(["attacks", "spells", "equipment"] as const).map((id) => {
        const kind = id === "spells" ? "spellsCompact" : id;
        return <RowTable key={id} kind={kind} labels={labels} measure={`table:${id}`}>{tableRows(kind, content, labels, true)}</RowTable>;
      })}
      {(["identity", "status", "training", "appearance", "backstory", "languages", "notes"] as const).map((id) =>
        content.prose[id].map((paragraph, index) => <ProseView key={`${id}${index}`} paragraph={paragraph} measure={`prose:${id}:${index}`} />),
      )}
    </>
  );
}

function spellbookCandidates(content: PrintContent, labels: PrintLabels): ReactNode {
  return (
    <>
      <IndexHeading labels={labels} measure="index-title" />
      <RowTable kind="index" labels={labels} measure="table:index">
        {content.index.map((row) => <IndexRow key={row.id} row={row} measure />)}
      </RowTable>
      {content.spellbook.map((level) => (
        <div key={level.level}>
          <LevelHeading level={level.level} again={false} content={content} labels={labels} measure={`title:level:${level.level}`} />
          <LevelHeading level={level.level} again content={content} labels={labels} measure={`again:level:${level.level}`} />
          {level.spells.map((spell) => (
            <SpellbookEntryView key={spell.id} spell={spell} labels={labels} measure />
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * The measuring layer: pages 1 and 2 with every candidate in its frame, a 續頁 and a spellbook
 * page with everything that may go on them in one column. Offscreen and hidden; it is gone once
 * the pages are laid out, so it never prints.
 */
export const MeasureLayer = forwardRef<HTMLDivElement, LayoutViewProps>(function MeasureLayer(props, ref) {
  const { model, content, labels, paper } = props;
  const p2Cont = continuesOnPage2(model);
  const frames1: FrameContents = {
    status: content.prose.status.length > 0 ? proseCandidates("status", content, labels) : <LineProbe />,
    training: proseCandidates("training", content, labels),
    attacks: tableCandidates("attacks", content, labels),
    "features:0": textCandidates("features", content, labels),
    "features:1": <LineProbe />,
    speciesTraits: textCandidates("speciesTraits", content, labels),
    feats: textCandidates("feats", content, labels),
  };
  const frames2: FrameContents = {
    ...(p2Cont ? { "p2:0": continuationCandidates(content, labels), "p2:1": <LineProbe /> } : { spells: tableCandidates("spells", content, labels) }),
    appearance: proseCandidates("appearance", content, labels),
    backstory: proseCandidates("backstory", content, labels),
    languages: proseCandidates("languages", content, labels),
    equipment: tableCandidates("equipment", content, labels),
  };
  return (
    <div className="dnd-print-measure" ref={ref} aria-hidden="true">
      <Page1 model={model} labels={labels} paper={paper} frames={frames1} identity={{ fields: content.identity, fits: null }} />
      <Page2 model={model} labels={labels} paper={paper} frames={frames2} portrait={props.portrait} attribution={props.attribution} carry={props.carry} />
      <FlowPage
        paper={paper}
        page={3}
        running={labels.print("running.continuation")}
        name={model.name}
        labels={labels}
        frames={[{ id: "measure:cont", children: continuationCandidates(content, labels) }, { id: "measure:cont:1", children: null }]}
      />
      {content.spellbook.length > 0 && (
        <FlowPage
          paper={paper}
          page={4}
          running={labels.print("running.spellbook")}
          name={model.name}
          labels={labels}
          frames={[{ id: "measure:book", children: <><LineProbe />{spellbookCandidates(content, labels)}</> }, { id: "measure:book:1", children: null }]}
        />
      )}
    </div>
  );
});

// ── the printed pages ───────────────────────────────────────────────────────────────────────

function placedText(plan: TextRegionPlan, frame: number, content: PrintContent, id: TextRegionId, labels: PrintLabels): ReactNode {
  const byId = new Map(content.text[id].map((entry) => [entry.id, entry]));
  return plan.frames[frame]?.map((piece, index) => {
    if (piece.kind === "more") return <MoreLine key={`more${index}`} count={piece.ids.length} title={sectionHeading(id, false, labels)} labels={labels} />;
    const entry = byId.get(piece.id);
    if (!entry) return null;
    if (piece.kind === "summary") return <SummaryLine key={piece.id} entry={entry} title={sectionHeading(id, false, labels)} labels={labels} />;
    return <EntryView key={`${piece.id}:${piece.from}`} entry={entry} from={piece.from} to={piece.to} cont={piece.cont} labels={labels} />;
  });
}

/** What a prose frame prints: whole paragraphs, the cut one with a named continuation pointer, then lines to write on. */
function placedProse(id: ProseId, plan: ProsePlan, content: PrintContent, labels: PrintLabels, ruled = true): ReactNode {
  const paragraphs = content.prose[id];
  const marker = plan.cut && <GoTo title={sectionHeading(id, false, labels)} labels={labels} />;
  return (
    <>
      {paragraphs.slice(0, plan.paragraphs).map((paragraph, index) => <ProseView key={index} paragraph={paragraph} />)}
      {plan.cut && paragraphs[plan.paragraphs] && (
        <ProseView paragraph={paragraphs[plan.paragraphs]} to={plan.cut.pieces} marker={marker} />
      )}
      {ruled && !plan.cut && <div className="dnd-print-ruled-fill" />}
    </>
  );
}

function placedTable(kind: "attacks" | "spells" | "equipment", plan: TablePlan | null, content: PrintContent, labels: PrintLabels): ReactNode {
  if (!plan) return null;
  const total = kind === "attacks" ? content.attacks.length : kind === "spells" ? content.spells.length : content.equipment.length;
  return (
    <RowTable kind={kind} labels={labels}>
      {tableRows(kind, content, labels, false, 0, plan.rows)}
      {plan.marker && <MarkerRow kind={kind} count={total - plan.rows} title={sectionHeading(kind, false, labels)} labels={labels} />}
      {Array.from({ length: plan.blanks }, (_, index) => <BlankRow key={`blank${index}`} kind={kind} labels={labels} />)}
    </RowTable>
  );
}

/** What page 2's left half has left after 續頁 content: lines for notes. */
function NotesLines({ title }: { title?: string }) {
  return (
    <div className="dnd-print-notes-lines">
      {title && <h3 className="dnd-print-sec">{title}</h3>}
      <div className="dnd-print-ruled-fill" />
    </div>
  );
}

export function PrintedPages({ plan, ...props }: LayoutViewProps & { plan: DocumentPlan }) {
  const { model, content, labels, paper } = props;
  const frames1: FrameContents = {
    status: model.blanks ? null : placedProse("status", plan.prose.status, content, labels),
    training: placedProse("training", plan.prose.training, content, labels, false),
    attacks: placedTable("attacks", plan.tables.attacks, content, labels),
    "features:0": placedText(plan.text.features, 0, content, "features", labels),
    "features:1": placedText(plan.text.features, 1, content, "features", labels),
    speciesTraits: placedText(plan.text.speciesTraits, 0, content, "speciesTraits", labels),
    feats: placedText(plan.text.feats, 0, content, "feats", labels),
  };
  const p2 = plan.continuation.p2;
  let titled = content.prose.notes.length > 0;
  const p2Frame = (index: number) => {
    const column = p2?.[index];
    if (!column) return null;
    const left = column.frame.capacity - column.used;
    const title = !titled && left > 40 ? labels.print("regions.notes") : undefined;
    if (title) titled = true;
    return (
      <>
        <ContinuationColumn column={column} content={content} labels={labels} />
        {left > 20 && <NotesLines title={title} />}
      </>
    );
  };
  const frames2: FrameContents = {
    ...(p2 ? { "p2:0": p2Frame(0), "p2:1": p2Frame(1) } : { spells: placedTable("spells", plan.tables.spells, content, labels) }),
    appearance: placedProse("appearance", plan.prose.appearance, content, labels),
    backstory: placedProse("backstory", plan.prose.backstory, content, labels),
    languages: placedProse("languages", plan.prose.languages, content, labels),
    equipment: placedTable("equipment", plan.tables.equipment, content, labels),
  };
  const name = model.name || labels.print("unnamed");
  return (
    <>
      <Page1
        model={model}
        labels={labels}
        paper={paper}
        frames={frames1}
        identity={{ fields: content.identity, fits: plan.identity }}
      />
      <Page2 model={model} labels={labels} paper={paper} frames={frames2} portrait={props.portrait} attribution={props.attribution} carry={props.carry} />
      {plan.continuation.pages.map((columns) => {
        const page = columns[0].frame.page;
        return (
          <FlowPage
            key={`c${page}`}
            paper={paper}
            page={page}
            running={labels.print("running.continuation")}
            name={name}
            labels={labels}
            frames={[0, 1].map((index) => ({
              id: `cont:${page}:${index}`,
              children: columns[index] ? <ContinuationColumn column={columns[index]} content={content} labels={labels} /> : null,
            }))}
          />
        );
      })}
      {plan.spellbook?.pages.map((columns) => {
        const page = columns[0].frame.page;
        return (
          <FlowPage
            key={`b${page}`}
            paper={paper}
            page={page}
            running={labels.print("running.spellbook")}
            name={name}
            labels={labels}
            frames={[0, 1].map((index) => ({
              id: `book:${page}:${index}`,
              children: columns[index] ? <SpellbookColumn column={columns[index]} content={content} labels={labels} /> : null,
            }))}
          />
        );
      })}
    </>
  );
}
