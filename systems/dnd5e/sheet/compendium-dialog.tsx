"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Search, Swords } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { LoadedSystem } from "@skald/types/system";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { ScrollArea } from "@skald/sheet-sdk/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@skald/sheet-sdk/components/ui/tabs";
import { splitRef, type DndKind } from "../reference/tags";
import { PACK_LIMITS } from "../content-pack/domain/limits";
import { stampOf } from "../homebrew/domain/rows";
import { packSnapshotBytes } from "../content-pack/domain/overlay";
import { packLabel } from "./pack-label";
import { buildCompendiumRow, type CompendiumDialogTab, type CompendiumStart, type CompendiumTab } from "./compendium-rows";
import type { ReferenceContextValue } from "./use-reference-context";
import { loadEnglishCorpus } from "../reference/load-corpus";
import { appendAttack, attackLabels } from "./play/attack-rows";
import { loadEditMessages } from "./play/edit-messages";
import { featSheetPatch, weaponsByRef } from "./play/play-model";
import { ReferenceIntl, useKindLabel } from "./reference-intl";

// The reference tabs load when first opened (plan T2b §5: in no route's first load).
import { useLiftedViewState, type BookViewState, type MagicItemViewState, type MonsterViewState } from "../reference/view-state";

const MagicItemTab = lazy(() => import("./magic-item-tab").then((module) => ({ default: module.MagicItemTab })));
const MonsterBrowser = lazy(() => import("./monster-browser").then((module) => ({ default: module.MonsterBrowser })));
const BookReader = lazy(() => import("../reference/book-reader").then((module) => ({ default: module.BookReader })));

/** Equipment kinds a character carries; mounts, vehicles and ships are not equipment (P6). */
const ITEM_CATEGORY: Record<string, ItemCategory | null> = {
  M: "weapon", R: "weapon",
  LA: "armor", MA: "armor", HA: "armor", S: "armor",
  AT: "tools", T: "tools", GS: "tools", INS: "tools",
  G: "gear", A: "gear", SCF: "gear", FD: "gear", TAH: "gear",
  MNT: null, VEH: null, SHP: null, AIR: null,
};
const ITEM_CATEGORIES = ["weapon", "armor", "tools", "gear"] as const;
type ItemCategory = (typeof ITEM_CATEGORIES)[number];
const FEAT_CATEGORIES = ["origin", "general", "fightingStyle", "epicBoon"] as const;

/** Item type per ref from the English corpus, loaded when the equipment tab first shows. */
function useItemTypes(active: boolean): ReadonlyMap<string, string> | null {
  const [types, setTypes] = useState<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    if (!active || types) return;
    let live = true;
    void Promise.all([loadEnglishCorpus("baseItem"), loadEnglishCorpus("item")]).then((parts) => {
      const map = new Map<string, string>();
      for (const part of parts) {
        for (const [ref, entry] of Object.entries(part ?? {})) {
          const type = entry.meta?.type;
          if (typeof type === "string") map.set(ref, type.split("|")[0]);
        }
      }
      if (live) setTypes(map);
    });
    return () => {
      live = false;
    };
  }, [active, types]);
  return types;
}

/** Damage type names live with the lazy play labels (play-tabs); the dialog reads them when it adds an attack. */
function useDamageTypes(): (code: string) => string {
  const locale = useLocale();
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void loadEditMessages(locale).then(({ play }) => {
      const found = (play as { damageType?: Record<string, string> }).damageType;
      if (live && found) setNames(found);
    });
    return () => {
      live = false;
    };
  }, [locale]);
  return (code) => names[code] ?? code;
}

/** List tabs (pick a row into the list of the same name) and the reference tabs (plan T2b §5.2, §5.3, §5.5). */
type DialogTab = CompendiumDialogTab;
const TABS: readonly DialogTab[] = ["spells", "feats", "equipment", "magicItems", "features", "monsters", "books"];
const REFERENCE_TABS: ReadonlySet<DialogTab> = new Set(["magicItems", "monsters", "books"]);
const isListTab = (tab: DialogTab): tab is CompendiumTab => !REFERENCE_TABS.has(tab);
const TAB_KINDS: Record<DialogTab, readonly DndKind[]> = {
  spells: ["spell"],
  feats: ["feat"],
  equipment: ["baseItem", "item"],
  features: ["classFeature", "subclassFeature", "optionalFeature"],
  magicItems: [],
  monsters: [],
  books: [],
};

/**
 * Single units a bundle entry already lists (F014): `arrow` beside `arrows-20`, `iron-spike` beside
 * `iron-spikes`. The SRD equipment tables price the bundle; the single unit stays reachable by link.
 */
function bundledSingles(ids: Iterable<string>): Set<string> {
  const all = [...ids];
  const known = new Set(all);
  return new Set(all.filter((id) => known.has(`${id}s`) || all.some((other) => other.startsWith(`${id}s-`) && /^\d+$/.test(other.slice(id.length + 2)))));
}
// Radix uses a table-sized wrapper to measure horizontal scrolling. These vertical lists must wrap at the viewport instead.
const VERTICAL_LIST = "pr-3 [&_[data-slot=scroll-area-viewport]>div]:block!";
const LIST_LIMIT = 200;
const ALL = "__all__";

export type CharacterUpdater = (updater: (previous: Record<string, unknown>) => Record<string, unknown>) => void;

interface Candidate {
  ref: string;
  name: string;
  english: string;
  level?: number;
  classes?: string[];
  classId?: string;
  /** A class or subclass feature's level, from its id (`-l4`). */
  featureLevel?: number;
  subclassName?: string;
  subclassEnglish?: string;
}

export function CompendiumDialog(props: Parameters<typeof CompendiumDialogBody>[0]) {
  return (
    <ReferenceIntl>
      <CompendiumDialogBody {...props} />
    </ReferenceIntl>
  );
}

function CompendiumDialogBody({
  open,
  system,
  context,
  onClose,
  onUpdate,
  onPreview,
  characterLevel,
  start,
  onTabChange,
  inTable = false,
}: {
  open: boolean;
  system: LoadedSystem;
  context: ReferenceContextValue;
  onClose: () => void;
  onUpdate: CharacterUpdater | null;
  onPreview: (ref: string) => void;
  /** The character's level: the book reader's progression tables highlight it. */
  characterLevel?: number;
  /** The tab and filters it opens on (plan-uat2 §3.2); 法術 when absent. */
  start?: CompendiumStart;
  /** Hears each tab change, so the next open can return to it. */
  onTabChange?: (tab: DialogTab) => void;
  /** The sheet is a table's copy: a pack row is added without its text (D9). */
  inTable?: boolean;
}) {
  const t = useTranslations("compendium");
  const tField = useTranslations("field");
  const tRef = useTranslations("reference");
  const tPack = useTranslations("pack");
  const tOption = useTranslations("option");
  const tUi = useTranslations("referenceUi");
  const kindLabel = useKindLabel();
  const [tab, setTab] = useState<DialogTab>(start?.tab ?? "spells");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(ALL);
  const [classId, setClassId] = useState(start?.classId ?? ALL);
  const [category, setCategory] = useState(start?.category ?? ALL);
  // Opened from 戰鬥: a weapon is added as an attack first (its main action).
  const attackIntent = start?.intent === "attack" && tab === "equipment";
  // The reference tabs unmount while a preview covers the compendium; their state lives here.
  const magicItemView = useLiftedViewState<MagicItemViewState>();
  const monsterView = useLiftedViewState<MonsterViewState>();
  const bookView = useLiftedViewState<BookViewState>();
  const itemTypes = useItemTypes(open && tab === "equipment");
  const damageType = useDamageTypes();
  const weapons = useMemo(() => weaponsByRef(system.gameData?.weapons), [system]);
  const featCategories = useMemo(() => {
    const feats = Array.isArray(system.gameData?.feats) ? (system.gameData.feats as Array<{ ref?: string; id?: string; category?: string }>) : [];
    return new Map(feats.map((feat) => [feat.ref ?? `feat:${feat.id}`, feat.category ?? ""]));
  }, [system]);

  const known = useMemo(() => Object.keys(context.names.class ?? context.englishNames.class ?? {}).sort(), [context]);
  // A preset class the catalog does not name (a pack class) still shows as the selected filter.
  const classes = classId !== ALL && !known.includes(classId) ? [...known, classId] : known;

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    const idsOf = (kind: DndKind) => new Set([...Object.keys(context.names[kind] ?? {}), ...Object.keys(context.englishNames[kind] ?? {})]);
    const singles = tab === "equipment" ? bundledSingles(TAB_KINDS[tab].flatMap((kind) => [...idsOf(kind)])) : new Set<string>();
    for (const kind of TAB_KINDS[tab]) {
      const ids = idsOf(kind);
      for (const id of ids) {
        if (singles.has(id)) continue;
        const ref = `${kind}:${id}`;
        const spell = kind === "spell" ? context.gameSpells.get(id) : undefined;
        const subclassId = kind === "subclassFeature" ? id.split("/").slice(0, 2).join("/") : undefined;
        out.push({
          ...(subclassId && { subclassName: context.nameOf(`subclass:${subclassId}`), subclassEnglish: context.englishNames.subclass?.[subclassId] }),
          ref,
          name: context.nameOf(ref),
          english: context.englishNames[kind]?.[id] ?? id,
          ...(spell ? { level: spell.level, classes: spell.classes } : {}),
          ...(kind === "classFeature" || kind === "subclassFeature" ? { classId: id.split("/")[0] } : {}),
          ...(/-l(\d+)$/.test(id) && kind !== "optionalFeature" ? { featureLevel: Number(/-l(\d+)$/.exec(id)![1]) } : {}),
        });
      }
    }
    if (tab === "features") return out.sort((a, b) => (a.featureLevel ?? 0) - (b.featureLevel ?? 0)
      || (a.subclassName ?? "").localeCompare(b.subclassName ?? "", context.locale)
      || a.name.localeCompare(b.name, context.locale));
    return out.sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name, context.locale));
  }, [context, tab]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (needle && ![candidate.name, candidate.english, candidate.subclassName, candidate.subclassEnglish].some((label) => label?.toLowerCase().includes(needle))) return false;
      if (tab === "spells" && level !== ALL && candidate.level !== Number(level)) return false;
      if (tab === "equipment") {
        // Magic items have their own tab: the equipment tab lists the corpus's mundane items and pack items.
        if (itemTypes && !itemTypes.has(candidate.ref) && !context.packRefs.has(candidate.ref)) return false;
        const type = itemTypes?.get(candidate.ref);
        const kind = type === undefined ? undefined : ITEM_CATEGORY[type];
        if (kind === null) return false;
        if (category !== ALL && kind !== category) return false;
      }
      if (tab === "feats" && category !== ALL && featCategories.get(candidate.ref) !== category) return false;
      if (classId !== ALL) {
        if (tab === "spells" && !candidate.classes?.includes(classId)) return false;
        if (tab === "features" && candidate.classId !== undefined && candidate.classId !== classId) return false;
      }
      return true;
    });
  }, [candidates, category, classId, context.packRefs, featCategories, itemTypes, level, query, tab]);

  const addAttack = (candidate: Candidate) => {
    const weapon = weapons.get(candidate.ref);
    if (!onUpdate || !weapon) return;
    onUpdate((previous) => appendAttack(previous, weapon, attackLabels(context, damageType, candidate.name)));
    toast.success(t("addedAttack", { name: candidate.name }));
  };

  const add = (candidate: Pick<Candidate, "ref" | "name">, listTab: CompendiumTab | null = isListTab(tab) ? tab : null) => {
    if (!onUpdate || !listTab) return;
    const built = buildCompendiumRow(listTab, candidate.ref, candidate.name, system, context, !inTable);
    if (!built) return;
    onUpdate((previous) => {
      const rows = Array.isArray(previous[built.list]) ? (previous[built.list] as unknown[]) : [];
      // A feat's own sheet fields come with its row (Archery: the ranged attack bonus the attack formula reads).
      const next = { ...previous, ...(listTab === "feats" ? featSheetPatch(candidate.ref) : undefined), [built.list]: [...rows, built.row] };
      // Snapshot cap (§5b): the picker refuses a pack row that would pass 200 KB of pack text.
      if ((built.row.origin === "pack" && !inTable) || stampOf(built.row)) {
        const bytes = packSnapshotBytes(next);
        if (bytes > PACK_LIMITS.snapshotBytes) {
          queueMicrotask(() => toast.error(tPack("tooMuchText", { kb: Math.ceil(bytes / 1024) })));
          return previous;
        }
      }
      queueMicrotask(() => toast.success(t("added", { list: tField(built.list) })));
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-2xl" data-dnd-compendium-dialog>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("search")}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as DialogTab);
            setCategory(ALL);
            onTabChange?.(value as DialogTab);
          }}
        >
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            {TABS.map((value) => (
              // A fixed height: the default `h-[calc(100%-1px)]` breaks when the list wraps (en: Books on a second row).
              <TabsTrigger key={value} value={value} className="h-8 flex-none">
                {isListTab(value) ? t(`tab.${value}`) : tUi(`${value}.tab`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {!isListTab(tab) ? (
          <ScrollArea className={`h-[60vh] ${VERTICAL_LIST}`}>
            <Suspense fallback={<p className="text-sm text-muted-foreground">{tRef("loading")}</p>}>
              {tab === "magicItems" && (
                <MagicItemTab context={context} canAdd={!!onUpdate} onAdd={(ref, name) => add({ ref, name }, "equipment")} onPreview={onPreview} viewState={magicItemView} />
              )}
              {tab === "monsters" && <MonsterBrowser context={context} onOpenRef={onPreview} viewState={monsterView} />}
              {tab === "books" && <BookReader context={context} onOpenRef={onPreview} viewState={bookView} highlightLevel={characterLevel} />}
            </Suspense>
          </ScrollArea>
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-8" />
          </div>
          {tab === "spells" && (
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-32" aria-label={t("level")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allLevels")}</SelectItem>
                {Array.from({ length: 10 }, (_, value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(tab === "equipment" || tab === "feats") && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40" aria-label={t("category")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
                {tab === "equipment"
                  ? ITEM_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`itemCategory.${value}`)}
                      </SelectItem>
                    ))
                  : FEAT_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tOption(`featCategory.${value}`)}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          )}
          {(tab === "spells" || tab === "features") && (
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-40" aria-label={t("class")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allClasses")}</SelectItem>
                {classes.map((id) => (
                  <SelectItem key={id} value={id}>
                    {context.nameOf(`class:${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <ScrollArea className={`h-[55vh] ${VERTICAL_LIST}`}>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.slice(0, LIST_LIMIT).map((candidate) => (
                <li key={candidate.ref} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/60" data-compendium-ref={candidate.ref}>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {candidate.level !== undefined && (
                      <Badge variant="outline" className="w-6 justify-center px-0 text-2xs">{candidate.level}</Badge>
                    )}
                    <span className="min-w-0 grow basis-48 text-sm wrap-anywhere">
                      {candidate.name}
                      {candidate.name !== candidate.english && <span className="ml-2 text-xs text-muted-foreground">{candidate.english}</span>}
                    </span>
                    {tab === "features" && candidate.classId !== undefined && (
                      // F012: the same feature name recurs across classes and levels.
                      <>
                        <Badge variant="outline" className="max-w-full whitespace-normal text-2xs wrap-anywhere" data-feature-class>{context.nameOf(`class:${candidate.classId}`)}</Badge>
                        {candidate.subclassName && <Badge variant="outline" className="max-w-full whitespace-normal text-2xs wrap-anywhere" data-feature-subclass>{candidate.subclassName}</Badge>}
                        {candidate.featureLevel !== undefined && (
                          <Badge variant="outline" className="text-2xs" data-feature-level>{tUi("compendium.featureLevel", { level: candidate.featureLevel })}</Badge>
                        )}
                      </>
                    )}
                    {context.packRefs.has(candidate.ref) && (
                      <Badge variant="outline" className="max-w-full whitespace-normal text-2xs wrap-anywhere" data-pack-badge>
                        {packLabel(tUi, context.packSupplier(candidate.ref)) ?? tRef("packBadge")}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-2xs">{kindLabel(splitRef(candidate.ref)?.kind ?? "rule")}</Badge>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 max-sm:max-w-32">
                    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={tRef("open")} title={tRef("open")} onClick={() => onPreview(candidate.ref)}>
                      <BookOpen className="size-4" />
                    </Button>
                    {tab === "equipment" && weapons.has(candidate.ref) && (
                      <Button type="button" variant={attackIntent ? "default" : "outline"} size="sm" disabled={!onUpdate} onClick={() => addAttack(candidate)} aria-label={`${t("addAttack")} · ${candidate.name}`} data-main-action={attackIntent || undefined}>
                        <Swords className="size-4" />
                        {t("addAttack")}
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" disabled={!onUpdate} onClick={() => add(candidate)}>
                      <Plus className="size-4" />
                      {t("add")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
