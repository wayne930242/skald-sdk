"use client";

import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { FileDown, Printer, X } from "lucide-react";
import type { LoadedSystem } from "@skald/types/system";
import type { Template } from "@skald/types/schema";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Switch } from "@skald/sheet-sdk/components/ui/switch";
import { ClientSystemIntlProvider } from "@skald/sheet-sdk/components/providers/client-system-intl-provider";
import { QuillLoader } from "@skald/sheet-sdk/components/skeletons";
import type { PrintPaper, SystemPrint } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { PRINT_MARGIN_MM } from "./kit/geometry";
import { GenericPrintDocument } from "./template-print-document";
import type { CharacterPrintProps } from "./types";
import type { PdfDownload } from "./download-pdf";
import en from "./messages/en.json";
import zhTW from "./messages/zh-TW.json";

export const PRINT_ROOT_ID = "skald-print-root";

const STATUS_ID = "skald-print-status";
const PDF_OFF_ID = "skald-print-pdf-off";

const GENERIC_PRINT: SystemPrint = { Document: GenericPrintDocument };

export type LoadSystemPrint = (system: LoadedSystem) => Promise<SystemPrint | null>;

type PrintSettings = NonNullable<Template["printSettings"]>;

/** The template's declared paper, else A4 in zh-TW and Letter elsewhere. */
export function defaultPaper(settings: PrintSettings | undefined, locale: string): PrintPaper {
  if (settings?.pageSize === "A4" || settings?.pageSize === "letter") return settings.pageSize;
  return locale === "zh-TW" ? "A4" : "letter";
}

/**
 * `@page` for the chosen paper. The margin stays 10 mm, the printable width the print zoom in
 * styles/sheet-sdk.css is based on; a template's `printSettings` only picks the default paper (its
 * orientation is not applied: the renderer lays every page out at its portrait width).
 */
export function pageRule(paper: PrintPaper): string {
  return `@page { size: ${paper === "A4" ? "A4" : "letter"}; margin: ${PRINT_MARGIN_MM}mm; }`;
}

/** Waits for the fonts and the images inside `root`, so the printed pages carry both. */
export async function whenPrintable(root: HTMLElement): Promise<void> {
  await document.fonts?.ready;
  await Promise.all(
    [...root.querySelectorAll("img")]
      .filter((image) => !image.complete)
      .map((image) => new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })),
  );
}

type Loaded = { status: "loading" } | { status: "ready"; print: SystemPrint } | { status: "failed" };

/** 下載 PDF: idle, making one, the last attempt's failure, or off because this host or server runs no renderer. */
type PdfState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "failed"; result: Extract<PdfDownload, { ok: false }> }
  | { status: "off" };

/**
 * Set once the server answers that it runs no PDF service (a deploy without the renderer's token):
 * every preview opened later in this page starts with 下載 PDF off, without asking again. A reload,
 * which a deploy that turns it on needs anyway (staleBuild), clears it.
 */
let pdfServiceOff = false;

/**
 * The serializer and the request, loaded once per page: the preview starts the load when it
 * opens, so the click's serialization runs right after its settled check, with no network wait
 * between them in which the pages could change.
 */
let pdfModule: Promise<typeof import("./download-pdf")> | null = null;
function loadPdfModule() {
  pdfModule ??= import("./download-pdf").catch((error: unknown) => {
    pdfModule = null;
    throw error;
  });
  return pdfModule;
}

/**
 * The pages in `root` are still the settled ones for `paper`: the preview reports ready and the
 * pages are laid out for that paper. A layout that reset during an await (a realtime edit, a web
 * font that came in) is a measuring layer again, and is not what should print.
 */
function settledFor(root: HTMLElement, paper: PrintPaper): boolean {
  return root.querySelector(`[data-print-ready="true"] [data-print-paper="${paper}"]`) !== null;
}

/** The PDF's title and file name: the character's name when the sheet has one. */
function printTitle(data: Record<string, unknown>, fallback: string): string {
  const name = data.name;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

/**
 * Keeps a print document that throws while rendering (a lazy chunk that failed to load, say)
 * inside the preview: it reports the error, and the preview shows its retry screen instead of the
 * sheet's error page.
 */
class PrintDocumentBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Print document failed", error, info.componentStack);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function PrintPreviewBody({
  system,
  data,
  formulaRuntime,
  editable,
  setupMode,
  handlers,
  optionSources,
  onClose,
  loadSystemPrint,
  root,
}: CharacterPrintProps & { loadSystemPrint: LoadSystemPrint; root: HTMLElement }) {
  const locale = useLocale();
  const settings = system.template.printSettings;
  const [paper, setPaper] = useState<PrintPaper>(() => defaultPaper(settings, locale));
  const [blanks, setBlanks] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  // What a document with `signalsReady` last reported, for the document it came from
  const [reported, setReported] = useState<{ print: SystemPrint; ready: boolean; status?: string } | null>(null);
  // Ctrl+P while not ready: a new node in the live region, so the reason is announced again
  const [nudge, setNudge] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    loadSystemPrint(system).then(
      (print) => current && setLoaded({ status: "ready", print: print ?? GENERIC_PRINT }),
      () => current && setLoaded({ status: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [loadSystemPrint, system, attempt]);

  useEffect(() => {
    let current = true;
    void Promise.resolve(document.fonts?.ready).then(() => current && setFontsReady(true));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => closeRef.current?.focus(), []);

  const print = useCallback(async () => {
    await whenPrintable(root);
    // the layout may have reset while the fonts and images came in: say why instead of printing it
    if (!settledFor(root, paper)) {
      setNudge((count) => count + 1);
      return;
    }
    window.print();
  }, [root, paper]);

  // The host's PDF service; a host without one (the local previewer) keeps 下載 PDF off
  const renderPdf = useHostPort(corePorts.pdfRenderer);
  const [pdf, setPdf] = useState<PdfState>(() => (pdfServiceOff || !renderPdf ? { status: "off" } : { status: "idle" }));
  useEffect(() => {
    if (!pdfServiceOff && renderPdf) void loadPdfModule().catch(() => {});
  }, [renderPdf]);
  const downloadPdf = useCallback(async (droppedImagesNote: string) => {
    if (!renderPdf) return;
    setPdf({ status: "working" });
    try {
      await whenPrintable(root);
      const { downloadPrintPdf } = await loadPdfModule();
      // serialized right after this check, with no await between: the pages sent are the settled
      // ones for the paper the request names
      if (!settledFor(root, paper)) {
        setPdf({ status: "failed", result: { ok: false, code: "layoutChanged" } });
        return;
      }
      const result = await downloadPrintPdf(root, {
        paper,
        locale,
        title: printTitle(data, system.config.name),
        system: system.config.id,
        droppedImagesNote,
      }, renderPdf);
      if (!result.ok && result.code === "disabled") {
        pdfServiceOff = true;
        setPdf({ status: "off" });
        return;
      }
      setPdf(result.ok ? { status: "idle" } : { status: "failed", result });
    } catch (error) {
      console.error("PDF download failed", error);
      setPdf({ status: "failed", result: { ok: false, code: "failed" } });
    }
  }, [root, paper, locale, data, system.config.name, system.config.id, renderPdf]);

  const current = loaded.status === "ready" ? loaded.print : null;
  const Document = current?.Document ?? null;
  const controls = current?.controls || { paper: true, blanks: true };
  const documentReady = !current?.signalsReady || (reported?.print === current && reported.ready);
  const ready = Document !== null && fontsReady && documentReady;
  const onReadyChange = useCallback(
    (value: boolean, status?: string) => {
      if (!current) return;
      setReported((last) =>
        last?.print === current && last.ready === value && last.status === status ? last : { print: current, ready: value, status },
      );
    },
    [current],
  );
  // Why 列印 is off, for assistive tech: the document's words, else the preview's
  const waiting = !ready && loaded.status !== "failed";
  const reportedStatus = reported?.print === current && !reported.ready ? reported.status : undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey) {
        // The preview's controls are buttons; the printed document itself is inert.
        // Inert keeps Tab off the sheet, but it can still leave for the browser chrome.
        const buttons = [...root.querySelectorAll<HTMLButtonElement>("button:enabled")].filter(
          (button) => button.tabIndex >= 0 && !button.closest("[inert]") &&
            button.getClientRects().length > 0 && getComputedStyle(button).visibility === "visible",
        );
        const active = document.activeElement;
        const first = buttons[0];
        const last = buttons.at(-1);
        if (!root.contains(active) || active === (event.shiftKey ? first : last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        // like the disabled 列印: before the document is ready the page would print blank
        if (ready) void print();
        else setNudge((count) => count + 1);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (root.isConnected && event.target instanceof Node && !root.contains(event.target)) {
        closeRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [onClose, print, ready, root]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skald-print-title"
      className="skald-print-preview"
      data-print-ready={ready ? "true" : undefined}
    >
      {controls.paper && <style>{pageRule(paper)}</style>}
      <PrintMessages>
        <PrintToolbar
          controls={controls}
          paper={paper}
          onPaperChange={setPaper}
          blanks={blanks}
          onBlanksChange={setBlanks}
          ready={ready}
          waiting={waiting}
          status={reportedStatus}
          nudge={nudge}
          onPrint={() => void print()}
          pdf={pdf}
          onDownloadPdf={(note) => void downloadPdf(note)}
          onClose={onClose}
          closeRef={closeRef}
        />
        {loaded.status === "failed" && (
          <PrintLoadFailed onRetry={() => {
            setLoaded({ status: "loading" });
            setAttempt((count) => count + 1);
          }} />
        )}
        {loaded.status === "loading" && <PrintLoading />}
      </PrintMessages>
      {Document && (
        <PrintDocumentBoundary key={attempt} onError={() => setLoaded({ status: "failed" })}>
          {/* inert: the pages are paper, not a form; nothing in them takes focus or input */}
          <div className="skald-print-pages" inert data-print-paper={paper}>
            <Document
              data={data}
              schema={system.schema}
              template={system.template}
              formulaRuntime={formulaRuntime}
              locale={locale}
              paper={paper}
              blanks={blanks}
              editable={editable}
              setupMode={setupMode}
              handlers={handlers}
              optionSources={optionSources}
              onReadyChange={onReadyChange}
            />
          </div>
        </PrintDocumentBoundary>
      )}
    </div>
  );
}

/** The preview's own strings, a lazy catalog of this chunk; the pages keep the sheet's messages. */
function PrintMessages({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <ClientSystemIntlProvider systemMessages={locale === "zh-TW" ? zhTW : en}>{children}</ClientSystemIntlProvider>
  );
}

function PrintToolbar({
  controls,
  paper,
  onPaperChange,
  blanks,
  onBlanksChange,
  ready,
  waiting,
  status,
  nudge,
  onPrint,
  pdf,
  onDownloadPdf,
  onClose,
  closeRef,
}: {
  controls: NonNullable<SystemPrint["controls"]>;
  paper: PrintPaper;
  onPaperChange: (paper: PrintPaper) => void;
  blanks: boolean;
  onBlanksChange: (blanks: boolean) => void;
  ready: boolean;
  waiting: boolean;
  status: string | undefined;
  nudge: number;
  onPrint: () => void;
  pdf: PdfState;
  /** Takes the note the PDF prints when an image is left out, in the preview's own messages. */
  onDownloadPdf: (droppedImagesNote: string) => void;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("sheetPrint");
  const working = pdf.status === "working";
  const off = pdf.status === "off";
  return (
    <div className="skald-print-toolbar print:hidden" data-print-toolbar>
      <h2 id="skald-print-title" className="mr-auto font-serif text-base font-semibold">{t("title")}</h2>
      {controls.paper && (
        <div role="group" aria-label={t("paper")} className="flex items-center gap-1">
          {(["A4", "letter"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={paper === option ? "default" : "outline"}
              aria-pressed={paper === option}
              disabled={working}
              onClick={() => onPaperChange(option)}
            >
              {option === "A4" ? t("paperA4") : t("paperLetter")}
            </Button>
          ))}
        </div>
      )}
      {controls.blanks && (
        <div className="flex items-center gap-2">
          <Switch id="skald-print-blanks" checked={blanks} onCheckedChange={onBlanksChange} disabled={working} />
          <Label htmlFor="skald-print-blanks">{t("blanks")}</Label>
        </div>
      )}
      {/* always in the DOM, so a screen reader hears the reason when it appears */}
      <p id={STATUS_ID} role="status" aria-live="polite" className="sr-only" data-print-status>
        {waiting && <span key={nudge}>{status ?? t("loading")}</span>}
      </p>
      <Button
        type="button"
        size="sm"
        onClick={onPrint}
        disabled={!ready}
        aria-describedby={waiting ? STATUS_ID : undefined}
        data-print-now
      >
        <Printer className="h-4 w-4" />
        {t("print")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onDownloadPdf(t("pdfImagesDropped"))}
        disabled={!ready || working || off}
        aria-busy={working || undefined}
        aria-describedby={off ? PDF_OFF_ID : waiting ? STATUS_ID : undefined}
        data-print-pdf
      >
        <FileDown className="h-4 w-4" />
        {working ? t("pdfWorking") : t("downloadPdf")}
      </Button>
      {off && (
        <p id={PDF_OFF_ID} role="alert" className="basis-full text-sm text-muted-foreground" data-print-pdf-error="disabled">
          {t("pdfError.disabled")}
        </p>
      )}
      {pdf.status === "failed" && (
        <p role="alert" className="basis-full text-sm text-destructive" data-print-pdf-error={pdf.result.code}>
          {pdf.result.code === "rateLimited"
            ? t("pdfError.rateLimited", { minutes: Math.max(1, Math.ceil((pdf.result.retryAfterSeconds ?? 60) / 60)) })
            : t(`pdfError.${pdf.result.code}`)}
        </p>
      )}
      <Button ref={closeRef} type="button" size="sm" variant="outline" onClick={onClose} aria-label={t("close")}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PrintLoading() {
  const t = useTranslations("sheetPrint");
  return (
    <div className="flex justify-center py-16 print:hidden" role="status" aria-label={t("loading")}>
      <QuillLoader size="lg" />
    </div>
  );
}

function PrintLoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("sheetPrint");
  return (
    <div className="flex flex-col items-center gap-3 py-16 print:hidden" role="alert">
      <p>{t("loadFailed")}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

/**
 * Full-screen print preview of the sheet's own data, rendered through a portal inside the sheet's
 * React tree so it uses the sheet's System, plugin UI, messages and rolls. It makes no request and
 * writes nothing; print CSS (styles/sheet-sdk.css) hides everything else on the page while it is open.
 */
export function PrintPreview(props: CharacterPrintProps & { loadSystemPrint: LoadSystemPrint }) {
  // Client only: the sheet loads this module when the player prints, never on the server.
  const [root] = useState(() => {
    const element = document.createElement("div");
    element.id = PRINT_ROOT_ID;
    return element;
  });

  // A layout effect: the root is in the document before the body's effects focus its close button
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // A modal: the sheet behind takes no focus or input while the preview is open
    const behind = [...document.body.children].filter((element) => !element.hasAttribute("inert"));
    for (const element of behind) element.setAttribute("inert", "");
    document.body.appendChild(root);
    document.body.classList.add("skald-print-open");
    return () => {
      document.body.classList.remove("skald-print-open");
      root.remove();
      for (const element of behind) element.removeAttribute("inert");
      if (opener?.isConnected) opener.focus();
    };
  }, [root]);

  return createPortal(<PrintPreviewBody {...props} root={root} />, root);
}
