"use client";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { RulesTocList } from "@skald/sheet-sdk/modules/rules-reference/ui/reference/rules-toc";
import { RuleBlocks, ruleText } from "./blocks";
import type { RulesCorpus, RulesLocale, RuleSection } from "./corpus";
import { loadRules, loadRulesMessages } from "./load-rules";
import type { RuleId } from "./rule-ids";

export interface FateRulesDialogProps {
  initialSection?: RuleId;
  onClose: () => void;
}
type Book = { corpus: RulesCorpus; messages: Awaited<ReturnType<typeof loadRulesMessages>> };

export function FateRulesDialog({ initialSection = "intro", onClose }: FateRulesDialogProps) {
  const appLocale = useLocale();
  const t = useTranslations();
  const [locale, setLocale] = useState<RulesLocale>(appLocale === "zh-TW" ? "zh-TW" : "en");
  const [requested, go] = useState<string>(initialSection);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<{
    locale: RulesLocale;
    attempt: number;
    book: Book | null;
  }>();
  useEffect(() => {
    let live = true;
    Promise.all([loadRules(locale), loadRulesMessages(locale)]).then(
      ([corpus, messages]) => {
        if (live) setResult({ locale, attempt, book: { corpus, messages } });
      },
      () => {
        if (live) setResult({ locale, attempt, book: null });
      },
    );
    return () => {
      live = false;
    };
  }, [locale, attempt]);
  const book = result?.locale === locale && result.attempt === attempt ? result.book : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="flex h-[min(88dvh,50rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <DialogClose
          aria-label={t("common.close")}
          className="absolute right-3 top-3 rounded-md border p-2"
        >
          <X size={16} />
        </DialogClose>
        {book ? (
          <NextIntlClientProvider locale={locale} messages={book.messages}>
            <Reader corpus={book.corpus} requested={requested} go={go} switchLocale={setLocale} />
          </NextIntlClientProvider>
        ) : (
          <div className="p-6" aria-live="polite">
            <DialogTitle>{t(book === null ? "common.error" : "common.loading")}</DialogTitle>
            {book === null && (
              <button className="mt-3 rounded border p-2" onClick={() => retry((n) => n + 1)}>
                {t("errorPages.error.retry")}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Reader({
  corpus,
  requested,
  go,
  switchLocale,
}: {
  corpus: RulesCorpus;
  requested: string;
  go: (id: string) => void;
  switchLocale: (l: RulesLocale) => void;
}) {
  const t = useTranslations("fateRules");
  const [query, search] = useState("");
  const { sections, locale } = corpus;
  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const text = useMemo(
    () =>
      new Map(
        sections.map((s) => [s.id, (s.title + " " + ruleText(s.blocks)).toLocaleLowerCase(locale)]),
      ),
    [sections, locale],
  );
  const selected = byId.get(requested) ?? byId.get("intro")!;
  const trail: RuleSection[] = [selected];
  let parent = selected.parentId;
  while (parent) {
    const section = byId.get(parent)!;
    trail.unshift(section);
    parent = section.parentId;
  }
  const expanded = new Set(trail.map((s) => s.id));
  const needle = query.trim().toLocaleLowerCase(locale);
  const toc = sections.filter((s) =>
    needle ? text.get(s.id)!.includes(needle) : !s.parentId || expanded.has(s.parentId),
  );
  const descendants = new Set([selected.id]);
  const body = sections.filter((s) => {
    if (s.parentId && descendants.has(s.parentId)) descendants.add(s.id);
    return descendants.has(s.id);
  });
  const navigate = (id: string) => {
    search("");
    go(id);
  };
  return (
    <>
      <header className="flex min-h-14 items-center justify-between gap-2 border-b px-4 pr-16">
        <DialogTitle className="flex items-center gap-2 font-serif">
          <BookOpen size={20} />
          {t("title")}
        </DialogTitle>
        <div className="flex gap-1">
          {(["zh-TW", "en"] as const).map((l) => (
            <button
              type="button"
              className="rounded-md border px-2 py-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              key={l}
              aria-pressed={l === locale}
              onClick={() => switchLocale(l)}
            >
              {t(l)}
            </button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav
          aria-label={t("contents")}
          className="flex max-h-[30%] flex-col gap-2 bg-muted/40 p-3 sm:max-h-none sm:w-64 sm:shrink-0"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => search(e.target.value)}
            aria-label={t("search")}
            placeholder={t("search")}
            className="rounded-md border bg-background p-2"
          />
          <span className="hidden text-sm text-muted-foreground sm:block">
            {t("contents")} / {t("book")}
          </span>
          <RulesTocList
            entries={toc.map((s) => ({ id: s.id, label: s.title, depth: s.parentId ? 1 : 0 }))}
            currentId={selected.id}
            onSelect={navigate}
            className="flex-row overflow-auto text-base sm:flex-col"
          />
          {!toc.length && <p role="status">{t("empty")}</p>}
        </nav>
        <article
          key={selected.id}
          lang={locale}
          tabIndex={0}
          aria-label={selected.title}
          className="min-w-0 flex-1 space-y-5 overflow-y-auto p-5 leading-relaxed sm:p-10"
        >
          {selected.id !== requested && <p role="status">{t("fallback")}</p>}
          <div className="text-sm text-muted-foreground">
            {[t("book"), ...trail.slice(0, -1).map((s) => s.title)].join(" / ")}
          </div>
          {body.map((s) => (
            <section key={s.id} className="space-y-3">
              {s === selected ? (
                <h2 className="font-serif text-3xl">{s.title}</h2>
              ) : (
                <h3 className="font-serif text-xl">{s.title}</h3>
              )}
              <RuleBlocks nodes={s.blocks} go={navigate} />
            </section>
          ))}
        </article>
      </div>
      <footer className="max-h-[35%] overflow-y-auto border-t px-5 py-3">
        <details>
          <summary className="cursor-pointer">
            {t("credits")} · {t("book")}
          </summary>
          <div className="space-y-2 py-3">
            {corpus.notices.map((n) => (
              <p key={n}>{n}</p>
            ))}
            <p>{t("changes")}</p>
            <div className="flex flex-wrap gap-4 underline">
              <a href="https://fate-srd.com/fate-condensed">{t("source")}</a>
              <a href="https://wayne.tw/blog/trpg/systems/fate-condensed">{t("translation")}</a>
              <a href="https://creativecommons.org/licenses/by/3.0/">{t("license")}</a>
            </div>
          </div>
        </details>
      </footer>
    </>
  );
}
