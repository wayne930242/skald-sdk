"use client";

import { loadSnapshotLabels } from "../sheet/play/snapshot-labels";
import { Suspense, use, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { ClientSystemIntlProvider } from "@skald/sheet-sdk/components/providers/client-system-intl-provider";
import { useSystem } from "@skald/sheet-sdk/components/providers/system-provider";
import { PrintSheet } from "@skald/sheet-sdk/modules/character/ui/print/kit/print-sheet";
import { evaluateCharacterFormulaRuntime } from "@skald/sheet-sdk/modules/sheet-schema";
import type { PrintDocumentProps } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { loadCatalog, type Catalog } from "../sheet/economy/catalog";
import { dndPackSourcePort } from "../sheet/pack-source-port";
import { text } from "../sheet/play/play-model";
import { buildPrintContent, type SpellLineOf } from "./content";
import { devicePackLoader } from "./device-pack";
import { MeasureLayer, PrintedPages, continuesOnPage2 } from "./layout-views";
import { carryLine } from "./page-2";
import { usePrintLabels } from "./print-labels";
import { printCasting, printName, usePrintPacks, usePrintReference, type PrintReference } from "./print-reference";
import { useTablePackScope } from "../sheet/pack-scope";
import { buildDndPrintModel, type DndPrintModel, type Row } from "./print-model";
import { loadCantripFacts, loadPrintTexts, type CantripFacts, type PrintText } from "./print-text";
import { loadPrintMessages } from "./print-messages";
import { measureLayout, usePagedLayout } from "./use-paged-layout";
import "./dnd-print.css";

/**
 * The D&D 2024 print in the official 2024 sheet's structure (LAYOUT.md): pages 1 and 2 are the
 * official boxes, each a fixed frame; what fits prints in full, the rest as a summary line whose
 * full text continues on 續頁 under the region's heading with 「（續）」; then the spellbook. From
 * the data on screen: unsaved edits print; nothing is read from the database or written. Rules text
 * comes from the corpus chunks the sheet loads on demand and, for a pack row without its saved text,
 * this device's pack cache. The pages are laid out here, in the browser, before the preview offers
 * 列印 or 下載 PDF; the PDF renderer prints this DOM as it is. Black and white: rules and weights.
 * The frame is the shared print kit's: its pages, the one skald.tw footer on every page, no page
 * number or date; the SRD's CC-BY notice prints at the foot of page 2.
 */
export function DndPrintDocument(props: PrintDocumentProps) {
  return (
    <Suspense fallback={null}>
      <DndPrintMessages {...props} />
    </Suspense>
  );
}

function DndPrintMessages(props: PrintDocumentProps) {
  const locale = useLocale();
  const messages = use(loadPrintMessages(locale));
  return (
    <ClientSystemIntlProvider systemMessages={messages}>
      <DndPrintPages {...props} />
    </ClientSystemIntlProvider>
  );
}


interface Loaded {
  texts: Map<string, PrintText>;
  cantrips: Map<string, CantripFacts>;
}

/** The rules text of every printed row and the damage cantrips' save and type, for one model and locale. */
function useTexts(model: DndPrintModel, reference: PrintReference): Loaded | null {
  const packSource = useHostPort(dndPackSourcePort);
  const tableId = useTablePackScope()?.tableId;
  const entries = useMemo(
    () => [
      ...[...model.lists.features, ...model.lists.speciesTraits, ...model.lists.feats, ...model.itemRows, ...model.attackTexts].map(({ line, row }) => ({ key: line.key, row })),
      ...model.spells.map((spell) => ({ key: spell.key, row: spell.row })),
    ],
    [model],
  );
  const cantripRefs = useMemo(() => model.attacks.filter((attack) => attack.kind === "cantrip").map((attack) => attack.ref), [model]);
  const [loaded, setLoaded] = useState<{ entries: typeof entries; refs: string[]; locale: string; value: Loaded } | null>(null);
  useEffect(() => {
    let live = true;
    const pack = devicePackLoader(packSource, tableId === undefined ? undefined : { tableId });
    const deps = { locale: reference.locale, srd: reference.srd, pack, options: reference.options };
    void Promise.all([loadPrintTexts(entries, deps), loadCantripFacts(cantripRefs, deps)]).then(([texts, cantrips]) => {
      if (live) setLoaded({ entries, refs: cantripRefs, locale: reference.locale, value: { texts, cantrips } });
    });
    return () => {
      live = false;
    };
  }, [entries, cantripRefs, reference, packSource, tableId]);
  return loaded && loaded.entries === entries && loaded.refs === cantripRefs && loaded.locale === reference.locale ? loaded.value : null;
}

/** The SRD item catalog for the weights; null until it loads, and when it cannot. */
function useCatalog(): { catalog: Catalog | null; settled: boolean } {
  const [state, setState] = useState<{ catalog: Catalog | null; settled: boolean }>({ catalog: null, settled: false });
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (catalog) => live && setState({ catalog, settled: true }),
      () => live && setState({ catalog: null, settled: true }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function DndPrintPages({ data, formulaRuntime, paper, blanks, onReadyChange }: PrintDocumentProps) {
  const system = useSystem();
  const labels = usePrintLabels();
  const locale = useLocale();
  const gameData = system.gameData as Record<string, unknown> | undefined;
  const reference = usePrintReference(gameData);
  const snapshotLabels = use(loadSnapshotLabels(locale));
  const { catalog, settled: catalogSettled } = useCatalog();
  const { packs, settled: packsSettled } = usePrintPacks();
  const casting = useMemo(() => printCasting(reference.naming, packs, locale), [reference, packs, locale]);

  const values = useMemo(() => {
    const derived = formulaRuntime ? evaluateCharacterFormulaRuntime(formulaRuntime, data).derivedValues : {};
    return { ...data, ...derived };
  }, [data, formulaRuntime]);

  const model = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return buildDndPrintModel({
      values,
      blanks,
      snapshotLabels,
      nameOf: (row) => printName(reference.naming, row, snapshotLabels),
      compare: (a, b) => collator.compare(a, b),
      gameData,
      catalog,
      casting,
    });
  }, [blanks, casting, catalog, gameData, locale, reference, snapshotLabels, values]);
  const loaded = useTexts(model, reference);

  const lineOf: SpellLineOf = useCallback(
    (row: Row) => {
      const ref = text(row.ref);
      const game = ref.startsWith("spell:") && text(row.origin) !== "pack" ? reference.gameSpells.get(ref.slice(6)) : undefined;
      return {
        castingTime: game?.castingTime ? reference.naming.token(game.castingTime) : text(row.castingTime),
        range: game?.range ? reference.naming.token(game.range) : text(row.range),
      };
    },
    [reference],
  );

  const content = useMemo(
    () => (loaded && catalogSettled && packsSettled ? buildPrintContent({ model, texts: loaded.texts, cantrips: loaded.cantrips, labels, lineOf }) : null),
    [catalogSettled, labels, lineOf, loaded, model, packsSettled],
  );

  const portrait = typeof data.portrait === "string" && data.portrait ? data.portrait : null;
  const attribution = labels.sheet("system.attribution");
  const p2Continues = continuesOnPage2(model);
  const measure = useCallback((root: HTMLElement) => measureLayout(root, content!, p2Continues), [content, p2Continues]);
  const layoutKey = useMemo(() => ({ content, paper }), [content, paper]);
  const { ref, plan, ms } = usePagedLayout(layoutKey, content !== null, measure);

  const settled = plan !== null;
  // 列印 waits for this: the rules text is in and the pages are laid out. Before paint, so the
  // preview never offers 列印 for pages still loading, and tells assistive tech what it waits on.
  const waitingFor = labels.print(content ? "texts.layout" : "texts.loading");
  useLayoutEffect(() => onReadyChange?.(settled, settled ? undefined : waitingFor), [onReadyChange, settled, waitingFor]);

  const view = content && { model, content, labels, paper, portrait, attribution, carry: carryLine(model, labels) };
  return (
    <PrintSheet
      className="dnd-print"
      paper={paper}
      blanks={blanks}
      data-dnd-print-settled={settled ? "true" : undefined}
      data-pages={plan?.pages}
      data-layout-ms={ms === null ? undefined : Math.round(ms)}
    >
      {view && !plan && <MeasureLayer ref={ref} {...view} />}
      {view && plan && <PrintedPages plan={plan} {...view} />}
    </PrintSheet>
  );
}
