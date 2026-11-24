"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PawPrint } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Switch } from "@skald/sheet-sdk/components/ui/switch";
import { EntriesRenderer, type EntriesRenderContext } from "../reference/entries-renderer";
import { loadEnglishIndex } from "../reference/load-corpus";
import type { LocalizedBlock, ResolvedReference } from "../reference/sources";
import { slugId, splitRef, type DndKind } from "../reference/tags";
import { useReferenceRenderContext } from "./reference-intl";
import { useIndexRows, type IndexName } from "./use-index-rows";
import type { ReferenceContextValue } from "./use-reference-context";

const StatBlock = lazy(() => import("../reference/stat-block").then((module) => ({ default: module.StatBlock })));

/** A monster browser filter a view can open with (Wild Shape: beasts up to CR 1/4). */
export interface MonsterPreset {
  type?: string;
  maxCr?: string;
}

/** Wild Shape's Beast Shapes table: the highest CR at the feature's first level. */
const WILD_SHAPE = /^classFeature:druid\/wild-shape-l\d+$/;

/** Include depth past which an embedded entry is not drawn (chapters nest sections three deep). */
const MAX_INCLUDE_DEPTH = 6;

type Meta = Record<string, unknown>;

function isRecord(value: unknown): value is Meta {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function EnglishBadge() {
  const t = useTranslations("reference");
  return (
    <Badge variant="outline" className="mb-1 text-2xs" data-english-badge>
      {t("englishBadge")}
    </Badge>
  );
}

function Block({ block, context }: { block: LocalizedBlock; context: EntriesRenderContext }) {
  return (
    <div data-block-english={block.english || undefined}>
      {block.english && <EnglishBadge />}
      <EntriesRenderer entries={[block.block]} context={context} />
    </div>
  );
}

function SpellHeader({ id, meta, context }: { id: string; meta: Meta; context: ReferenceContextValue }) {
  const t = useTranslations("reference");
  const level = typeof meta.level === "number" ? meta.level : undefined;
  const game = context.gameSpells.get(id);
  const components = meta.components as { v?: boolean; s?: boolean; m?: boolean; mText?: string } | undefined;
  const parts = components
    ? [components.v && "V", components.s && "S", components.m && (components.mText ? `M (${components.mText})` : "M")].filter(Boolean).join(", ")
    : "";
  const rows: Array<[string, string]> = [];
  if (game?.castingTime) rows.push([t("castingTime"), context.token(game.castingTime)]);
  if (game?.range) rows.push([t("range"), context.token(game.range)]);
  if (parts) rows.push([t("components"), parts]);
  return (
    <div className="mb-2 space-y-0.5 text-sm">
      {level !== undefined && <p className="italic text-muted-foreground">{level === 0 ? t("cantrip") : t("level", { level })}</p>}
      {rows.map(([label, value]) => (
        <p key={label}>
          <span className="font-semibold">{label}</span> {value}
        </p>
      ))}
    </div>
  );
}

/** The SRD header's base item detail ("Any Medium or Heavy, Except Hide Armor"), from the item index. */
function useItemDetail(id: string, family: string | undefined): string | undefined {
  const [detail, setDetail] = useState<{ id: string; value?: string } | null>(null);
  useEffect(() => {
    let live = true;
    void loadEnglishIndex("item-magic").then((index) => {
      const row = index?.[family ?? id];
      if (live) setDetail({ id, value: typeof row?.detail === "string" ? row.detail : undefined });
    });
    return () => {
      live = false;
    };
  }, [id, family]);
  return detail?.id === id ? detail.value : undefined;
}

/**
 * A detail in the viewer's language: whole phrases from the labels ("Any Medium or Heavy"), base
 * item names from the names catalog. English as written when any part has no translation.
 */
function useLocalizedDetail(detail: string | undefined, context: ReferenceContextValue): string | undefined {
  const locale = useLocale();
  const t = useTranslations("referenceUi.item");
  if (!detail || locale === "en") return detail;
  const list = (text: string): string | undefined => {
    const any = /^Any (.+)$/.exec(text);
    if (any) {
      const key = `anyGroup.${slugId(any[1])}`;
      return t.has(key as never) ? t("any", { list: t(key as never) }) : undefined;
    }
    const names = text.split(/, or |, | or /).map((name) => context.names.baseItem?.[slugId(name)]);
    return names.every(Boolean) ? new Intl.ListFormat(locale, { type: "disjunction" }).format(names as string[]) : undefined;
  };
  const except = /^(.*), Except (.+)$/.exec(detail);
  if (except) {
    const head = list(except[1]);
    const item = context.names.baseItem?.[slugId(except[2])];
    return head && item ? t("except", { list: head, item }) : detail;
  }
  return list(detail) ?? detail;
}

function MagicItemHeader({ resolved, meta, context, onOpenRef }: { resolved: ResolvedReference; meta: Meta; context: ReferenceContextValue; onOpenRef: (ref: string) => void }) {
  const t = useTranslations("referenceUi.item");
  const locale = useLocale();
  const family = typeof meta.family === "string" ? meta.family : undefined;
  const detail = useLocalizedDetail(useItemDetail(resolved.id, family ? splitRef(family)?.id : undefined), context);
  const label = (group: string, value: unknown) => {
    const key = `${group}.${String(value)}`;
    return t.has(key as never) ? t(key as never) : String(value ?? "");
  };
  const category = label("category", meta.category);
  const type = detail ? t("withDetail", { category, detail }) : category;
  const line = t("line", { type, rarity: label("rarity", meta.rarity) });
  const attunement = meta.attunement === true
    ? t("attunement")
    : typeof meta.attunement === "string"
      ? t("attunementBy", { by: t.has(`by.${slugId(meta.attunement)}` as never) ? t(`by.${slugId(meta.attunement)}` as never) : meta.attunement.replace(/\{@\w+ ([^|}]*)[^}]*\}/g, "$1") })
      : undefined;
  const variantLabel = isRecord(meta.variant) && typeof meta.variant.label === "string" ? meta.variant.label : undefined;
  return (
    <div className="mb-2 space-y-0.5 text-sm" data-magic-item-header>
      <p className="italic text-muted-foreground">{attunement ? t("withAttunement", { line, attunement }) : line}</p>
      {family && (
        <p data-variant-of={family}>
          <span>{t("variantOf")}</span>{" "}
          <button type="button" className="text-primary underline decoration-dotted underline-offset-2" onClick={() => onOpenRef(family)}>
            {context.nameOf(family)}
          </button>
          {variantLabel && (locale === "en" || !/[a-z]/i.test(variantLabel)) && <span className="text-muted-foreground"> ({variantLabel})</span>}
        </p>
      )}
    </div>
  );
}

/** Resolves a ref through `source` once `ref` is set; null while loading or when nothing has it. */
function useResolvedRef(ref: string | null, resolve: (ref: string) => Promise<ResolvedReference | null>) {
  const [state, setState] = useState<{ ref: string; value: ResolvedReference | null } | null>(null);
  useEffect(() => {
    if (!ref) return;
    let live = true;
    void resolve(ref).then((value) => {
      if (live) setState({ ref, value });
    });
    return () => {
      live = false;
    };
  }, [ref, resolve]);
  return { value: state?.ref === ref ? state.value : null, loading: !!ref && state?.ref !== ref };
}

/** True once the element has scrolled near the viewport (at once where IntersectionObserver is missing). */
function useNearViewport<T extends Element>(): [boolean, (node: T | null) => void] {
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  const observer = useRef<IntersectionObserver | null>(null);
  const attach = (node: T | null) => {
    observer.current?.disconnect();
    if (!node || near || typeof IntersectionObserver === "undefined") return;
    observer.current = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        setNear(true);
        observer.current?.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.current.observe(node);
  };
  useEffect(() => () => observer.current?.disconnect(), []);
  return [near, attach];
}

interface ViewOptions {
  context: ReferenceContextValue;
  onOpenRef: (ref: string) => void;
  highlightLevel?: number;
  onBrowseMonsters?: (preset: MonsterPreset) => void;
  /** Refs of the entries this one is embedded in, outermost first (include cycle guard). */
  trail?: readonly string[];
}

/** An entry embedded by an `include` node: resolved when it nears the viewport, with its own toggle. */
function IncludedEntry({ refId, ...options }: ViewOptions & { refId: string }) {
  const t = useTranslations("reference");
  const { context } = options;
  const trail = options.trail ?? [];
  const [near, attach] = useNearViewport<HTMLDivElement>();
  const resolve = useMemo(() => (ref: string) => context.sources.resolve(ref, context.locale), [context]);
  const blocked = trail.includes(refId) || trail.length >= MAX_INCLUDE_DEPTH;
  const { value, loading } = useResolvedRef(near && !blocked ? refId : null, resolve);
  const [showSrd, setShowSrd] = useState(false);
  if (blocked) return null;
  return (
    <div ref={attach} data-included={refId} className="min-h-4">
      {value ? (
        <ReferenceView resolved={value} showSrd={showSrd} onShowSrdChange={setShowSrd} embedded {...options} trail={[...trail, refId]} />
      ) : (
        loading || !near ? <p className="text-xs text-muted-foreground">{t("loading")}</p> : null
      )}
    </div>
  );
}

/** A chapter's linked index (`refList`, plan T2b §5.5): spells, classes, creatures or magic items, filterable. */
function RefList({ node, context, onOpenRef }: { node: Meta; context: ReferenceContextValue; onOpenRef: (ref: string) => void }) {
  const t = useTranslations("referenceUi.refList");
  const kind = typeof node.kind === "string" ? (node.kind as DndKind) : null;
  const index: IndexName | null = kind === "creature" ? "creature" : kind === "item" ? "item-magic" : null;
  const indexRows = useIndexRows(index ?? "creature", context.locale, index !== null);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    if (!kind) return [];
    const filter = isRecord(node.filter) ? node.filter : {};
    if (index) {
      return (indexRows ?? [])
        .filter(({ row }) => Object.entries(filter).every(([key, wanted]) => {
          if (key === "magic") return true;
          const actual = row[key === "srdChapter" ? "chapter" : key];
          return wanted === null ? actual === undefined || actual === null : actual === wanted;
        }))
        .map(({ id, name, english }) => ({ ref: `${kind}:${id}`, name, english }));
    }
    // The names include a loaded pack's entries; the SRD book lists built-in entries only (P4).
    const ids = new Set([...Object.keys(context.names[kind] ?? {}), ...Object.keys(context.englishNames[kind] ?? {})]);
    return [...ids].filter((id) => !context.packRefs.has(`${kind}:${id}`)).map((id) => ({ ref: `${kind}:${id}`, name: context.nameOf(`${kind}:${id}`), english: context.englishNames[kind]?.[id] ?? id }));
  }, [context, index, indexRows, kind, node.filter]);
  const needle = query.trim().toLowerCase();
  const shown = rows
    .filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.english.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, context.locale));
  if (!kind) return null;
  return (
    <div className="my-2 rounded-md border p-2" data-ref-list={kind}>
      <div className="mb-1 flex items-center gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("filter")} aria-label={t("filter")} className="h-8" />
        <span className="shrink-0 text-xs text-muted-foreground">{t("count", { count: shown.length })}</span>
      </div>
      <ul className="max-h-72 columns-1 gap-4 overflow-y-auto text-sm sm:columns-2">
        {shown.map((row) => (
          <li key={row.ref} className="break-inside-avoid">
            <button type="button" data-ref={row.ref} className="text-left text-primary underline decoration-dotted underline-offset-2" onClick={() => onOpenRef(row.ref)}>
              {row.name}
            </button>
            {row.name !== row.english && <span className="ml-1 text-xs text-muted-foreground">{row.english}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A variant's family text (P7): the SRD family entry's blocks, shown under the variant header. */
function FamilyText({ familyRef, srd, ...options }: ViewOptions & { familyRef: string; srd: boolean }) {
  const { context } = options;
  const resolve = useMemo(
    () => (ref: string) => (srd ? context.srdSource : context.sources).resolve(ref, context.locale),
    [context, srd],
  );
  const { value } = useResolvedRef(familyRef, resolve);
  const render = useRenderContext(options);
  if (!value) return null;
  const blocks = srd && value.srdBlocks ? value.srdBlocks : value.blocks;
  return (
    <div data-family-text={familyRef}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} context={render} />
      ))}
    </div>
  );
}

function useRenderContext({ context, onOpenRef, highlightLevel, onBrowseMonsters, trail }: ViewOptions): EntriesRenderContext {
  const base = useReferenceRenderContext(context);
  return useMemo(() => ({
    ...base,
    onOpenRef,
    highlightLevel,
    renderInclude: (ref: string) => (
      <IncludedEntry refId={ref} context={context} onOpenRef={onOpenRef} highlightLevel={highlightLevel} onBrowseMonsters={onBrowseMonsters} trail={trail} />
    ),
    renderRefList: (node: Meta) => <RefList node={node} context={context} onOpenRef={onOpenRef} />,
  }), [base, context, highlightLevel, onBrowseMonsters, onOpenRef, trail]);
}

function Lore({ lore, meta, render }: { lore: LocalizedBlock[]; meta: Meta; render: EntriesRenderContext }) {
  const t = useTranslations("referenceUi.overlay");
  const lists = (["habitat", "treasure"] as const).filter((key) => Array.isArray(meta[key]) && (meta[key] as unknown[]).length > 0);
  if (lore.length === 0 && lists.length === 0) return null;
  return (
    <section className="mt-3 border-t pt-2" data-lore>
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{t("lore")}</h4>
      {lists.map((key) => (
        <p key={key} className="my-1 text-sm">
          <span className="font-semibold">{t(key)}</span> {(meta[key] as unknown[]).map(String).join(", ")}
        </p>
      ))}
      {lore.map((block, index) => (
        <Block key={index} block={block} context={render} />
      ))}
    </section>
  );
}

function Errata({ meta }: { meta: Meta }) {
  const t = useTranslations("referenceUi.statBlock");
  const locale = useLocale();
  const notes = Array.isArray(meta.srdErrata) ? meta.srdErrata.filter(isRecord) : [];
  if (notes.length === 0) return null;
  return (
    <aside className="mt-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground" data-srd-errata>
      {notes.map((note, index) => (
        <p key={index}>
          {locale !== "en" && <EnglishBadge />} <span className="font-semibold">{t("errata", { page: Number(note.page ?? 0) })}</span>
          {": "}
          {String(note.note ?? "")}
        </p>
      ))}
    </aside>
  );
}

export interface ReferenceViewProps extends ViewOptions {
  resolved: ResolvedReference;
  /** Show the SRD version of an overlaid entry (the toggle; overlay text by default, Q4). */
  showSrd: boolean;
  onShowSrdChange: (value: boolean) => void;
  /** Drawn inside another entry (an include): no lore heading of its own beyond the entry's. */
  embedded?: boolean;
}

/**
 * One reference entry as the dialog, the reader and includes show it: the overlay badge, source and
 * SRD toggle (plan T2b §5.8), the kind's header (spell, magic item) or stat block, the text, lore.
 */
export function ReferenceView({ resolved, showSrd, onShowSrdChange, embedded = false, ...options }: ReferenceViewProps) {
  const tUi = useTranslations("referenceUi");
  const tRef = useTranslations("reference");
  const { context, onOpenRef, onBrowseMonsters } = options;
  const render = useRenderContext(options);
  const toggleable = !!resolved.textSource && resolved.srdBlocks !== undefined;
  const srd = toggleable && showSrd;
  const blocks = srd ? resolved.srdBlocks ?? [] : resolved.blocks;
  const higher = srd ? resolved.srdHigherLevel ?? [] : resolved.higherLevel;
  const meta = srd ? resolved.srdMeta ?? resolved.meta : resolved.meta;
  const family = resolved.kind === "item" && typeof meta.family === "string" ? meta.family : undefined;
  const nameOf = (kind: "condition" | "language", id: string) => context.names[kind]?.[id];
  let body: ReactNode;
  if (resolved.kind === "creature") {
    body = (
      <Suspense fallback={<p className="text-sm text-muted-foreground">{tRef("loading")}</p>}>
        <StatBlock meta={meta} blocks={blocks} context={render} nameOf={nameOf} renderBlock={(block) => <Block block={block} context={render} />} />
      </Suspense>
    );
  } else {
    body = blocks.map((block, index) => <Block key={index} block={block} context={render} />);
  }
  return (
    <div data-reference={resolved.ref} data-text-source={srd ? "srd" : resolved.textSource}>
      {resolved.textSource && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-2 py-1 text-xs" data-overlay-bar>
          <Badge variant="outline" className="text-2xs">{tUi(resolved.textSource === "pack" ? "overlay.badgePack" : "overlay.badge")}</Badge>
          {resolved.textSource !== "pack" && <span className="text-muted-foreground">{tUi(`overlay.source.${resolved.textSource}`)}</span>}
          {toggleable && (
            <label className="ml-auto flex items-center gap-1.5">
              <Switch checked={showSrd} onCheckedChange={onShowSrdChange} aria-label={tUi("overlay.showSrd")} />
              {tUi("overlay.showSrd")}
            </label>
          )}
        </div>
      )}
      {resolved.kind === "spell" && <SpellHeader id={resolved.id} meta={meta} context={context} />}
      {resolved.kind === "item" && meta.magic === true && <MagicItemHeader resolved={resolved} meta={meta} context={context} onOpenRef={onOpenRef} />}
      {body}
      {family && blocks.length === 0 && <FamilyText familyRef={family} srd={!resolved.textSource || srd} {...options} />}
      {higher.map((block, index) => (
        <Block key={`higher-${index}`} block={block} context={render} />
      ))}
      {resolved.kind === "creature" && <Errata meta={meta} />}
      {onBrowseMonsters && WILD_SHAPE.test(resolved.ref) && (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onBrowseMonsters({ type: "beast", maxCr: "1/4" })}>
          <PawPrint className="size-4" />
          {tUi("monsters.wildShape")}
        </Button>
      )}
      {!embedded || resolved.lore.length > 0 ? <Lore lore={srd ? [] : resolved.lore} meta={srd ? {} : meta} render={render} /> : null}
    </div>
  );
}
