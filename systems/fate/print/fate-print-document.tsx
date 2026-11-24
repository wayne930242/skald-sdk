"use client";

import { Suspense, use, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ClientSystemIntlProvider } from "@skald/sheet-sdk/components/providers/client-system-intl-provider";
import type { PrintDocumentProps } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { loadFatePresetCatalog, loadFatePresetLabels, type FatePresetLabels } from "../domain/presets";
import { loadFatePrintMessages } from "./print-messages";
import { buildFatePrintModel } from "./print-model";
import { FatePrintAspects, FatePrintHarm, FatePrintIdentity, FatePrintNote, FatePrintSkills, FatePrintStunts } from "./print-sections";
import { PrintPage } from "@skald/sheet-sdk/modules/character/ui/print/kit/print-page";
import { PrintSheet } from "@skald/sheet-sdk/modules/character/ui/print/kit/print-sheet";
import { usePrintImage } from "@skald/sheet-sdk/modules/character/ui/print/kit/ready";
import "./fate-print.css";

const caches = new Map<string, ReturnType<typeof fetchResources>>();

function fetchResources(locale: "en" | "zh-TW") {
  return Promise.all([loadFatePrintMessages(locale), loadFatePresetCatalog(), loadFatePresetLabels(locale)]);
}

function loadResources(locale: string) {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  let resources = caches.get(key);
  if (!resources) {
    const pending = fetchResources(key);
    caches.set(key, pending);
    void pending.catch(() => {
      if (caches.get(key) === pending) caches.delete(key);
    });
    resources = pending;
  }
  return resources;
}

export function FatePrintDocument(props: PrintDocumentProps) {
  return <Suspense key={props.locale} fallback={<Pending onReadyChange={props.onReadyChange} />}>
    <FatePrintResources {...props} />
  </Suspense>;
}

function Pending({ onReadyChange }: Pick<PrintDocumentProps, "onReadyChange">) {
  useLayoutEffect(() => onReadyChange?.(false), [onReadyChange]);
  return null;
}

function FatePrintResources(props: PrintDocumentProps) {
  const [messages, catalog, labels] = use(loadResources(props.locale));
  const { data, schema, blanks } = props;
  const model = useMemo(() => {
    const field = schema.fields.skills;
    return buildFatePrintModel(data, field?.type === "fate-skill-pyramid" ? field : undefined, catalog, blanks);
  }, [data, schema, catalog, blanks]);
  return <ClientSystemIntlProvider systemMessages={messages}>
    <FatePrintPages key={model.identity.portrait} {...props} model={model} labels={labels} />
  </ClientSystemIntlProvider>;
}

function FatePrintPages({ model, labels, paper, blanks, onReadyChange }: Pick<PrintDocumentProps, "paper" | "blanks" | "onReadyChange"> & {
  model: ReturnType<typeof buildFatePrintModel>;
  labels: FatePresetLabels;
}) {
  const t = useTranslations("fatePrint");
  const { node: portraitNode, status: portrait } = usePrintImage(model.identity.portrait, t("portrait"), "fate-print-portrait");
  const first = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLDivElement>(null);
  const fit = usePrintFit(first, second, useMemo(() => ({ model, paper }), [model, paper]), portrait !== "pending");
  const split = fit.split ?? model.stunts.length;
  const continuation = fit.split !== undefined;
  const remainingStunts = split < model.stunts.length;
  const fullWidthNotes = !remainingStunts && !model.extras;
  const portraitFailed = portrait === "failed" ? t("portraitFailed") : undefined;
  const clipped = fit.clippedFirst || fit.clippedSecond;
  const ready = portrait !== "pending" && fit.settled;
  const status = portrait === "pending" ? t("portraitLoading") : portraitFailed ?? (clipped ? t("overflow") : undefined);
  useLayoutEffect(() => onReadyChange?.(ready, status), [onReadyChange, ready, status]);

  const sections = { model, labels };
  return <PrintSheet className="fate-print" paper={paper} blanks={blanks} data-compact={fit.compact}>
    {portraitFailed && <p className="fate-print-portrait-status" role="status">{portraitFailed}</p>}
    <PrintPage paper={paper} page={1} className="fate-print-page" data-clipped={fit.clippedFirst}>
      <div className="fate-print-content" ref={first}>
        <FatePrintIdentity {...sections} portrait={portrait !== "failed" ? portraitNode : null} />
        <div className="fate-print-columns" data-continued={continuation}>
          <div className="fate-print-column" data-fate-print-left>
            <FatePrintAspects {...sections} />
            <FatePrintStunts model={model} from={0} to={split} />
            {!continuation && <div className="fate-print-notes">
              <FatePrintNote field="extras" text={model.extras} />
              <FatePrintNote field="notes" text={model.notes} />
            </div>}
          </div>
          <div className="fate-print-column" data-fate-print-right>
            <FatePrintHarm {...sections} />
            <FatePrintSkills {...sections} />
          </div>
        </div>
      </div>
      {(continuation || fit.clippedFirst) && <p className="fate-print-overflow" data-footer={!fit.clippedFirst}>
        {t(fit.clippedFirst ? "overflow" : "tailContinued")}
      </p>}
    </PrintPage>
    {continuation && <PrintPage paper={paper} page={2} className="fate-print-page" data-clipped={fit.clippedSecond} data-continuation>
      <div className="fate-print-content" ref={second}>
        <header className="fate-print-continuation"><b>{model.identity.name || t("title")}</b><span>{t("continued")}</span></header>
        <div className="fate-print-columns" data-full-width={fullWidthNotes}>
          {!fullWidthNotes && <div className="fate-print-column" data-fate-print-left>
            {remainingStunts && <FatePrintStunts model={model} from={split} to={model.stunts.length} continuation />}
            <FatePrintNote field="extras" text={model.extras} />
          </div>}
          <div className="fate-print-column" data-fate-print-right><FatePrintNote field="notes" text={model.notes} /></div>
        </div>
      </div>
      {fit.clippedSecond && <p className="fate-print-overflow">{t("overflow")}</p>}
    </PrintPage>}
  </PrintSheet>;
}

type ContentRef = React.RefObject<HTMLDivElement | null>;
interface Fit {
  compact: boolean;
  split?: number;
  settled: boolean;
  clippedFirst?: boolean;
  clippedSecond?: boolean;
}

const initial: Fit = { compact: false, settled: false };
// Leave 1.5 mm for print layout differences and glyphs extending below the line box.
const printReserve = 1.5 * 96 / 25.4;

function safeBottom(content: HTMLElement) {
  const { bottom, height } = content.getBoundingClientRect();
  return height > 0 ? bottom - printReserve : Infinity;
}

function columnOverflows(content: HTMLElement | null, side: "left" | "right") {
  const last = content?.querySelector(`[data-fate-print-${side}]`)?.lastElementChild;
  return !!content && !!last && last.getBoundingClientRect().bottom > safeBottom(content);
}

function usePrintFit(first: ContentRef, second: ContentRef, key: { model: ReturnType<typeof buildFatePrintModel> }, canMeasure: boolean) {
  const [state, setState] = useState<{ key: unknown; fit: Fit }>();
  const fit = state?.key === key ? state.fit : initial;
  useLayoutEffect(() => {
    if (!canMeasure || fit.settled) return;
    let active = true;
    // Measure at the same fixed dimensions as the paper, after the current text's fonts arrive.
    void Promise.resolve(document.fonts?.ready).then(() => {
      const page = first.current;
      if (!active || !page) return;
      const leftOverflows = columnOverflows(page, "left");
      const clippedFirst = leftOverflows || columnOverflows(page, "right");
      const clippedSecond = columnOverflows(second.current, "left") || columnOverflows(second.current, "right");
      const update = (next: Fit) => setState({ key, fit: next });
      if (leftOverflows && fit.split === undefined) {
        // The continuation footer needs 5 mm in addition to the normal printing reserve.
        const bottom = safeBottom(page) - 5 * 96 / 25.4;
        const piece = Array.from(page.querySelectorAll<HTMLElement>("[data-fate-print-piece]"))
          .find(el => el.getBoundingClientRect().bottom > bottom);
        update({ ...fit, split: piece ? Number(piece.dataset.fatePrintPiece) : key.model.stunts.length });
      } else if ((clippedFirst || clippedSecond) && !fit.compact) {
        update({ ...initial, compact: true });
      } else {
        update({ ...fit, settled: true, clippedFirst, clippedSecond });
      }
    });
    return () => { active = false; };
  }, [first, second, key, fit, canMeasure]);
  return fit;
}
