"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { packLabel } from "./pack-label";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { ScrollArea } from "@skald/sheet-sdk/components/ui/scroll-area";
import { SnapshotText } from "../reference/snapshot-text";
import type { ResolvedReference } from "../reference/sources";
import { RULES_GLOSSARY_REF } from "../reference/chapter-map";
import { parseReferenceHistory, recordReferenceVisit, REFERENCE_HISTORY_KEY, toggleReferencePin } from "../reference/recent";
import { groupedReferenceSearch, SEARCH_FILTERS, type ReferenceFilter, type ReferenceHit } from "../reference/search";
import { splitRef, type DndKind } from "../reference/tags";
import { ReferenceIntl, useKindLabel } from "./reference-intl";
import { ReferenceView, type MonsterPreset } from "./reference-view";
import type { ReferenceContextValue } from "./use-reference-context";

import { useLiftedViewState, type BookViewState, type MonsterViewState } from "../reference/view-state";

const MonsterBrowser = lazy(() => import("./monster-browser").then((module) => ({ default: module.MonsterBrowser })));
const BookReader = lazy(() => import("../reference/book-reader").then((module) => ({ default: module.BookReader })));

/** A row of the character that names something: its list, name, ref and saved text. */
export interface CharacterReferenceRow {
  list: string;
  name: string;
  ref: string;
  origin: string;
  text: string;
}

/** `level`: the character's level, which a class's progression table highlights (§5.4). */
export type ReferenceRequest = (
  | { mode: "row"; row: CharacterReferenceRow }
  | { mode: "ref"; ref: string }
  | { mode: "browser"; rows: CharacterReferenceRow[] }
) & { level?: number };

const RESULTS_PER_KIND = 6;

interface SearchView {
  query: string;
  filter: ReferenceFilter;
  limits: Partial<Record<DndKind, number>>;
}

const HOME: SearchView = { query: "", filter: "all", limits: {} };

type ReferenceViewRoute =
  | { type: "entry"; ref: string; row?: CharacterReferenceRow }
  | { type: "search"; view: SearchView }
  | { type: "monsters"; preset: MonsterPreset }
  | { type: "books"; startAt?: { ref: string; magicItem?: boolean }; view: BookViewState | null };

function AttributionFooter() {
  const t = useTranslations("system");
  return (
    <footer className="mt-4 space-y-1 border-t pt-2 text-xs leading-snug text-muted-foreground" data-dnd-attribution>
      <p>{t("attribution")}</p>
      <p>{t("translationNote")}</p>
    </footer>
  );
}

function useResolved(ref: string | null, context: ReferenceContextValue, onVisit: (ref: string) => void) {
  const [state, setState] = useState<{ ref: string | null; value: ResolvedReference | null; loading: boolean }>({
    ref: null,
    value: null,
    loading: false,
  });
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    // Until this ref resolves, the return below reports it as loading.
    void context.sources.resolve(ref, context.locale).then((value) => {
      if (cancelled) return;
      setState({ ref, value, loading: false });
      if (value) onVisit(ref);
    });
    return () => {
      cancelled = true;
    };
  }, [ref, context.sources, context.locale, onVisit]);
  return state.ref === ref ? state : { ref, value: null, loading: !!ref };
}

function stackFor(request: ReferenceRequest | null): ReferenceViewRoute[] {
  if (request?.mode === "ref") return [{ type: "entry", ref: request.ref }];
  if (request?.mode === "row") return [{ type: "entry", ref: request.row.ref, row: request.row }];
  return [];
}

function readHistory() {
  try {
    return parseReferenceHistory(window.localStorage.getItem(REFERENCE_HISTORY_KEY));
  } catch {
    return parseReferenceHistory(null);
  }
}

export function ReferenceDialog(props: { request: ReferenceRequest | null; context: ReferenceContextValue; onClose: () => void }) {
  return (
    <ReferenceIntl>
      <ReferenceDialogBody {...props} />
    </ReferenceIntl>
  );
}

function ReferenceDialogBody({
  request,
  context,
  onClose,
}: {
  request: ReferenceRequest | null;
  context: ReferenceContextValue;
  onClose: () => void;
}) {
  const t = useTranslations("reference");
  const tUi = useTranslations("referenceUi");
  const kindLabel = useKindLabel();
  const tSearch = useTranslations("referenceSearch");
  const [srdFor, setSrdFor] = useState<string | null>(null);
  const [stack, setStack] = useState(() => stackFor(request));
  const [rootSearch, setRootSearch] = useState(HOME);
  const [lastRequest, setLastRequest] = useState(request);
  const [history, setHistory] = useState(readHistory);
  const monsterView = useLiftedViewState<MonsterViewState>();
  if (lastRequest !== request) {
    setLastRequest(request);
    setStack(stackFor(request));
    setRootSearch(HOME);
    setSrdFor(null);
    monsterView.set(null);
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(REFERENCE_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // The dialog still works in memory if this browser disallows storage.
    }
  }, [history]);
  const visit = useCallback((ref: string) => setHistory((previous) => recordReferenceVisit(previous, ref)), []);
  const route = stack.at(-1);
  const current = route?.type === "entry" ? route.ref : null;
  const parsed = current ? splitRef(current) : null;
  const { value: resolved, loading } = useResolved(parsed ? current : null, context, visit);
  const row = route?.type === "entry" ? route.row : undefined;
  const showRowText = !!row?.text && (!resolved || row.origin !== "srd");
  const pinned = !!current && history.pinned.includes(current);
  const showSrd = srdFor === current;
  const search = route?.type === "search" ? route.view : rootSearch;
  const push = (next: ReferenceViewRoute) => setStack((previous) => [...previous, next]);
  const replaceRoute = (next: ReferenceViewRoute) => setStack((previous) => [...previous.slice(0, -1), next]);
  const open = (ref: string) => push({ type: "entry", ref });
  const openRow = (entry: CharacterReferenceRow) => push({ type: "entry", ref: entry.ref, row: entry });
  const back = () => setStack((previous) => previous.slice(0, -1));
  const browseMonsters = (preset: MonsterPreset) => {
    monsterView.set(null);
    push({ type: "monsters", preset });
  };
  const openBook = (startAt?: { ref: string; magicItem?: boolean }) => push({ type: "books", startAt, view: null });
  const browseKind = (kind: DndKind) => {
    const previousSearch = stack.findLast((entry) => entry.type === "search");
    push({ type: "search", view: { ...HOME, query: previousSearch?.view.query ?? rootSearch.query, filter: kind } });
  };
  const overlayTitle = resolved?.textSource && !showSrd ? resolved.overlayName : undefined;
  // The pack that supplies what shows: a pack entry, or an overlay while it shows (B-025).
  const fromPack = resolved && (resolved.origin === "pack" || (resolved.textSource && !showSrd));
  const supplierLabel = fromPack ? packLabel(tUi, context.packSupplier(resolved.ref)) : undefined;
  const title = route?.type === "monsters" ? tUi("monsters.tab")
    : route?.type === "books" ? tUi("books.tab")
      : current ? (overlayTitle ?? resolved?.localizedName ?? (showRowText && row?.name ? row.name : context.nameOf(current)))
        : row?.name || t("title");

  return (
    <Dialog open={request !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl" data-dnd-reference-dialog>
        <DialogHeader>
          <div className="flex items-center gap-2 pr-6">
            {(stack.length > 1 || (request?.mode === "browser" && route)) && (
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t("back")} onClick={back}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <DialogTitle className="min-w-0 break-words text-left">{title}</DialogTitle>
          </div>
          {(parsed || row?.origin === "pack" || supplierLabel) && (
            <div className="flex flex-wrap items-center gap-2">
              {parsed && (
                <Button type="button" variant="secondary" size="sm" aria-label={tSearch("filterByKind", { kind: kindLabel(parsed.kind) })} onClick={() => browseKind(parsed.kind)}>
                  {kindLabel(parsed.kind)}
                </Button>
              )}
              {supplierLabel ? (
                <Badge variant="outline" data-pack-supplier>{supplierLabel}</Badge>
              ) : (
                row?.origin === "pack" && <Badge variant="outline">{t("packBadge")}</Badge>
              )}
              {resolved && (
                <>
                  <Button type="button" size="sm" variant="outline" aria-pressed={pinned} aria-label={tSearch("pin")} onClick={() => setHistory((previous) => toggleReferencePin(previous, resolved.ref))}>
                    <Star className={pinned ? "fill-current" : undefined} aria-hidden />
                    {tSearch(pinned ? "unpin" : "pin")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => openBook({ ref: resolved.ref, magicItem: resolved.meta.magic === true })}>
                    <BookOpen aria-hidden />
                    {tSearch("viewInBook")}
                  </Button>
                </>
              )}
            </div>
          )}
          <DialogDescription className="sr-only">{t("title")}</DialogDescription>
        </DialogHeader>
        <ScrollArea key={stack.length} className="-mx-1 max-h-[65vh] pr-3">
          {/* p-1: the viewport clips at its edges, so focus rings need room inside it (B-011). */}
          <div className="p-1" data-reference-scroll-content>
            {route?.type === "monsters" && (
              <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
                <MonsterBrowser context={context} preset={route.preset} onOpenRef={open} viewState={monsterView} />
              </Suspense>
            )}
            {route?.type === "books" && (
              <Suspense fallback={<p className="text-sm text-muted-foreground">{t("loading")}</p>}>
                <BookReader
                  context={context}
                  onOpenRef={open}
                  startAt={route.startAt}
                  viewState={{ value: route.view, set: (view) => replaceRoute({ ...route, view }) }}
                  highlightLevel={request?.level}
                />
              </Suspense>
            )}
            {parsed && loading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
            {parsed && !loading && resolved && (
              <ReferenceView
                key={resolved.ref}
                resolved={resolved}
                context={context}
                onOpenRef={open}
                showSrd={showSrd}
                onShowSrdChange={(value) => setSrdFor(value ? current : null)}
                highlightLevel={request?.level}
                onBrowseMonsters={browseMonsters}
              />
            )}
            {parsed && !loading && !resolved && !showRowText && <p className="text-sm text-muted-foreground">{t("notFound")}</p>}
            {showRowText && (
              <section className="mt-2" data-row-text>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">{t("rowText")}</h4>
                <SnapshotText text={row.text} className="mt-1" />
              </section>
            )}
            {(route?.type === "search" || (!route && request?.mode === "browser")) && (
              <ReferenceBrowser
                context={context}
                history={history}
                rows={request?.mode === "browser" ? request.rows : []}
                view={search}
                onChange={(view) => route?.type === "search" ? replaceRoute({ type: "search", view }) : setRootSearch(view)}
                onOpenRef={open}
                onOpenRow={openRow}
                onOpenBook={openBook}
              />
            )}
            <AttributionFooter />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

const rowClass = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

function ReferenceList({ hits, onOpenRef }: { hits: readonly ReferenceHit[]; onOpenRef: (ref: string) => void }) {
  return (
    <ul>
      {hits.map(({ ref, name, matchedName }) => (
        <li key={ref}>
          <button type="button" className={rowClass} onClick={() => onOpenRef(ref)}>
            <span className="min-w-0 break-words">
              {name}
              {matchedName && <span className="block text-xs text-muted-foreground">{matchedName}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReferenceBrowser({ context, history, rows, view, onChange, onOpenRef, onOpenRow, onOpenBook }: {
  context: ReferenceContextValue;
  history: ReturnType<typeof readHistory>;
  rows: readonly CharacterReferenceRow[];
  view: SearchView;
  onChange: (view: SearchView) => void;
  onOpenRef: (ref: string) => void;
  onOpenRow: (row: CharacterReferenceRow) => void;
  onOpenBook: (startAt?: { ref: string }) => void;
}) {
  const t = useTranslations("reference");
  const tSearch = useTranslations("referenceSearch");
  const tBook = useTranslations("referenceUi.books");
  const kindLabel = useKindLabel();
  const { query, filter, limits } = view;
  const showHome = !query.trim() && filter === "all";
  const overlayNames = useMemo(() => context.packText?.overlayNames() ?? [], [context.packText]);
  const groups = useMemo(() => groupedReferenceSearch({ ...context, overlayNames }, query, filter, context.locale), [context, overlayNames, query, filter]);
  const pickFilter = (next: ReferenceFilter) => onChange({ query, filter: next, limits: {} });
  const chips: readonly ReferenceFilter[] = SEARCH_FILTERS.some((group) => group === filter) ? SEARCH_FILTERS : [...SEARCH_FILTERS, filter];
  const historyHits = (refs: readonly string[]) => refs.map((ref) => ({ ref, name: overlayNames.find((entry) => entry.ref === ref)?.name ?? context.nameOf(ref) }));
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onChange({ query: event.target.value, filter, limits: {} })}
          placeholder={t("search")}
          aria-label={t("search")}
          className="pl-8"
        />
      </div>
      <div role="group" aria-label={tSearch("filters")} className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Button key={chip} type="button" variant={filter === chip ? "default" : "outline"} size="sm" aria-pressed={filter === chip} onClick={() => pickFilter(chip)}>
            {isFilterGroup(chip) ? tSearch(`filter.${chip}`) : kindLabel(chip)}
          </Button>
        ))}
      </div>
      {showHome ? (
        <>
          <div role="group" aria-label={tSearch("quickLinks")} className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="secondary" onClick={() => pickFilter("condition")}>{kindLabel("condition")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => pickFilter("action")}>{kindLabel("action")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onOpenBook({ ref: RULES_GLOSSARY_REF })}>{tSearch("glossary")}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onOpenBook()}>
              <BookOpen aria-hidden />
              {tBook("tab")}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["pinned", "recent"] as const).map((section) => (
              <section key={section} className="min-w-0 rounded-md border p-2">
                <h4 className="mb-1 px-2 text-xs font-semibold text-muted-foreground">{tSearch(section)}</h4>
                {history[section].length > 0
                  ? <ReferenceList hits={historyHits(history[section])} onOpenRef={onOpenRef} />
                  : <p className="px-2 text-sm text-muted-foreground">{tSearch(`${section}Empty`)}</p>}
              </section>
            ))}
          </div>
          <section>
            <h4 className="mb-1 px-2 text-xs font-semibold text-muted-foreground">{t("characterEntries")}</h4>
            <ul>
              {rows.map((entry, index) => (
                <li key={`${entry.list}-${index}`}>
                  <button type="button" className={`${rowClass} disabled:opacity-60`} disabled={!entry.ref && !entry.text} onClick={() => onOpenRow(entry)}>
                    <span className="min-w-0 flex-1 break-words">{entry.name}</span>
                    {entry.origin === "pack" && <Badge variant="outline" className="text-2xs">{t("packBadge")}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : groups.length ? (
        <div className="space-y-3">
          {groups.map(({ kind, hits }) => {
            const limit = limits[kind] ?? RESULTS_PER_KIND;
            return (
              <section key={kind} className="rounded-md border p-2">
                <h4 className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
                  {tSearch("groupCount", { kind: kindLabel(kind), count: hits.length })}
                </h4>
                <ReferenceList hits={hits.slice(0, limit)} onOpenRef={onOpenRef} />
                {hits.length > limit && (
                  <Button type="button" variant="ghost" size="sm" aria-label={tSearch("moreKind", { kind: kindLabel(kind) })}
                    onClick={() => onChange({ query, filter, limits: { ...limits, [kind]: limit + RESULTS_PER_KIND } })}>
                    {tSearch("more")}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t("noResults")}</p>}
    </div>
  );
}

function isFilterGroup(filter: ReferenceFilter): filter is (typeof SEARCH_FILTERS)[number] {
  return SEARCH_FILTERS.some((group) => group === filter);
}
