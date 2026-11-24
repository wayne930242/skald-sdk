"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useViewState, type BookViewState, type LiftedViewState } from "./view-state";
import { ArrowLeft, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { RulesTocList } from "@skald/sheet-sdk/modules/rules-reference/ui/reference/rules-toc";
import { ReferenceView } from "../sheet/reference-view";
import type { ReferenceContextValue } from "../sheet/use-reference-context";
import { bookLocationFor } from "./chapter-map";
import { loadCorpusParts } from "./load-corpus";
import type { ResolvedReference } from "./sources";
import { isIncludeNode } from "./sources";

/**
 * The reader shows the built-in SRD and books supplied by enabled packs. A
 * chapter's sections load as they scroll near (include), and its refLists link the indexes.
 */

const BOOK_LABEL = { srd: "srd", xphb: "phb", xdmg: "dmg" } as const;

/** The SRD chapters in book order (the built-in chapter parts, design T2b §2.7). */
const SRD_CHAPTERS = ["playing-the-game", "character-creation", "classes", "character-origins", "feats", "equipment", "spells",
  "rules-glossary", "gameplay-toolbox", "magic-items", "monsters"];

interface TocChapter {
  ref: string;
  name: string;
}

/** The include refs a chapter lists, in order (its sections). */
function sectionRefs(entries: unknown, out: string[] = []): string[] {
  if (Array.isArray(entries)) for (const entry of entries) sectionRefs(entry, out);
  else if (isIncludeNode(entries)) {
    if (entries.ref.startsWith("chapter:")) out.push(entries.ref);
  } else if (entries && typeof entries === "object") sectionRefs((entries as { entries?: unknown }).entries, out);
  return out;
}

interface BookReaderProps {
  context: ReferenceContextValue;
  onOpenRef: (ref: string) => void;
  highlightLevel?: number;
  /** Kept by the parent so following a link and Back keep the book, chapter and filter. */
  viewState?: LiftedViewState<BookViewState>;
  /** An entry's chapter (and section anchor for a chapter ref) when entering from the reference dialog. */
  startAt?: { ref: string; magicItem?: boolean };
}

export function BookReader({ startAt, ...props }: BookReaderProps) {
  const destination = startAt && !props.viewState?.value
    ? bookLocationFor(use(loadCorpusParts()), startAt.ref, startAt.magicItem)
    : null;
  const initial: BookViewState = { book: "srd", chapter: null, anchor: null, query: "", ...destination };
  return <BookReaderBody {...props} initial={initial} />;
}

function BookReaderBody({ context, onOpenRef, highlightLevel, viewState, initial }: Omit<BookReaderProps, "startAt"> & { initial: BookViewState }) {
  const t = useTranslations("referenceUi.books");
  const tRef = useTranslations("reference");
  const packChapters = useMemo(() => {
    const entries = context.packText ? context.packText.chapters() : [];
    return entries
      .filter((entry) => entry.id.split("/").length === 2)
      .sort((a, b) => a.bookChapter - b.bookChapter);
  }, [context.packText]);
  const books = (["srd", "xphb", "xdmg"] as const).filter((id) => id === "srd" || packChapters.some((entry) => entry.id.startsWith(`${id}/`)));
  const [{ book, chapter, anchor, query }, update] = useViewState(viewState, initial);
  const setQuery = (value: string) => update({ query: value });

  const toc = useMemo<TocChapter[]>(() => {
    if (book !== "srd") return packChapters.filter((entry) => entry.id.startsWith(`${book}/`));
    return SRD_CHAPTERS.map((slug) => `chapter:srd/${slug}`)
      .filter((ref) => context.nameOf(ref) !== ref.slice("chapter:".length))
      .map((ref) => ({ ref, name: context.nameOf(ref) }));
  }, [book, context, packChapters]);

  /** Sections whose name matches the filter, under their chapter (both books; ids nest under the chapter). */
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const prefix = `${book}/`;
    const ids = new Set([...Object.keys(context.names.chapter ?? {}), ...Object.keys(context.englishNames.chapter ?? {})]);
    return [...ids]
      .filter((id) => id.startsWith(prefix) && id.split("/").length > 2)
      .map((id) => ({ ref: `chapter:${id}`, chapter: `chapter:${id.split("/").slice(0, 2).join("/")}`, name: context.nameOf(`chapter:${id}`), english: context.englishNames.chapter?.[id] ?? "" }))
      .filter((row) => row.name.toLowerCase().includes(needle) || row.english.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, context.locale));
  }, [book, context, query]);

  const openSection = (chapterRef: string | null, sectionRef: string | null) => {
    update({ chapter: chapterRef, anchor: sectionRef });
  };

  return (
    <div className="space-y-2" data-book-reader>
      <div className="flex flex-wrap gap-1" role="group">
        {books.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={book === id ? "default" : "outline"}
            aria-pressed={book === id}
            onClick={() => {
              update({ book: id, chapter: null, anchor: null });
            }}
          >
            {t(BOOK_LABEL[id])}
          </Button>
        ))}
      </div>
      {chapter ? (
        <ChapterView
          key={chapter}
          chapterRef={chapter}
          anchor={anchor}
          context={context}
          onOpenRef={onOpenRef}
          highlightLevel={highlightLevel}
          onBack={() => openSection(null, null)}
          onAnchorChange={(section) => update({ anchor: section })}
        />
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("filter")} aria-label={t("filter")} className="pl-8" />
          </div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">{t("contents")}</h4>
          {query.trim() ? (
            matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {matches.map((row) => (
                  <li key={row.ref}>
                    <button type="button" className="text-left text-primary underline decoration-dotted underline-offset-2" onClick={() => openSection(row.chapter, row.ref)}>
                      {row.name}
                    </button>
                    <span className="ml-2 text-xs text-muted-foreground">{context.nameOf(row.chapter)}</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <RulesTocList
              entries={toc.map((row) => ({ id: row.ref, label: row.name, data: { "data-toc": row.ref } }))}
              onSelect={(ref) => openSection(ref, null)}
            />
          )}
          {toc.length === 0 && <p className="text-sm text-muted-foreground">{tRef("loading")}</p>}
        </>
      )}
    </div>
  );
}

function ChapterView({
  chapterRef,
  anchor,
  context,
  onOpenRef,
  highlightLevel,
  onBack,
  onAnchorChange,
}: {
  chapterRef: string;
  anchor: string | null;
  context: ReferenceContextValue;
  onOpenRef: (ref: string) => void;
  highlightLevel?: number;
  onBack: () => void;
  onAnchorChange: (section: string) => void;
}) {
  const t = useTranslations("referenceUi.books");
  const tRef = useTranslations("reference");
  const [state, setState] = useState<{ ref: string; value: ResolvedReference | null } | null>(null);
  const [showSrd, setShowSrd] = useState(false);
  const [jumpAttempt, setJumpAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    void context.sources.resolve(chapterRef, context.locale).then((value) => {
      if (live) setState({ ref: chapterRef, value });
    });
    return () => {
      live = false;
    };
  }, [chapterRef, context.locale, context.sources]);
  const resolved = state?.ref === chapterRef ? state.value : null;
  const sections = useMemo(() => (resolved ? sectionRefs(resolved.blocks.map((block) => block.block)) : []), [resolved]);
  useEffect(() => {
    const chapter = root.current;
    if (!anchor || !resolved || !chapter) return;
    const section = chapter.querySelector(`[data-included="${CSS.escape(anchor)}"]`);
    if (!section) return;
    const viewport = chapter.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) {
      section.scrollIntoView?.({ block: "start", behavior: "instant" });
      return;
    }
    const align = () => {
      const offset = section.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) viewport.scrollTop += offset;
    };
    align();
    if (typeof ResizeObserver === "undefined") return;
    // Includes above the destination expand once they load. Keep the anchor in place until the
    // reader interacts, then leave scrolling alone.
    const observer = new ResizeObserver(align);
    observer.observe(chapter);
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const stop = () => {
      observer.disconnect();
      for (const event of events) viewport.removeEventListener(event, stop, true);
    };
    for (const event of events) viewport.addEventListener(event, stop, { capture: true, passive: true });
    return stop;
  }, [anchor, jumpAttempt, resolved]);
  return (
    <div ref={root} data-chapter={chapterRef}>
      <div className="mb-2 flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t("contents")}
        </Button>
        <h3 className="font-semibold">{resolved?.localizedName ?? context.nameOf(chapterRef)}</h3>
      </div>
      {sections.length > 0 && (
        <nav className="mb-2 flex flex-wrap gap-1" aria-label={t("contents")}>
          {sections.map((ref) => (
            <button
              key={ref}
              type="button"
              className={cn("rounded border px-2 py-0.5 text-xs hover:bg-muted", anchor === ref && "border-primary")}
              onClick={() => {
                onAnchorChange(ref);
                setJumpAttempt((attempt) => attempt + 1);
              }}
            >
              {context.nameOf(ref)}
            </button>
          ))}
        </nav>
      )}
      {resolved ? (
        <ReferenceView resolved={resolved} context={context} onOpenRef={onOpenRef} showSrd={showSrd} onShowSrdChange={setShowSrd} highlightLevel={highlightLevel} />
      ) : (
        <p className="text-sm text-muted-foreground">{tRef("loading")}</p>
      )}
    </div>
  );
}
