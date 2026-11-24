"use client";

import { useMemo } from "react";
import { useViewState, type LiftedViewState, type MonsterViewState } from "../reference/view-state";
import { BookOpen, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { crValue, useIndexRows } from "./use-index-rows";
import type { MonsterPreset } from "./reference-view";
import type { ReferenceContextValue } from "./use-reference-context";
import { packLabel } from "./pack-label";

/**
 * The monster browser (plan T2b §5.2): built-in creatures from the lazy creature index, the loaded
 * pack's creatures with the pack badge, searchable by zh and English name and filtered by CR, type
 * and size. Browse only: a row opens the stat block.
 */

const ALL = "__all__";
const CR_STEPS = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, index) => String(index + 1))];
const SIZES = ["T", "S", "M", "L", "H", "G"];
const LIST_LIMIT = 200;

interface MonsterRow {
  ref: string;
  name: string;
  english: string;
  cr: string | null;
  types: string[];
  sizes: string[];
  pack: boolean;
}

function typesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object") {
    const base = (value as { type?: unknown }).type;
    if (typeof base === "string") return [base];
    const choose = (base as { choose?: unknown } | undefined)?.choose;
    return Array.isArray(choose) ? choose.filter((item): item is string => typeof item === "string") : [];
  }
  return [];
}

export function MonsterBrowser({
  context,
  preset = {},
  onOpenRef,
  viewState,
}: {
  context: ReferenceContextValue;
  preset?: MonsterPreset;
  onOpenRef: (ref: string) => void;
  /** Kept by the parent so opening a creature and Back keep the search and filters. */
  viewState?: LiftedViewState<MonsterViewState>;
}) {
  const t = useTranslations("referenceUi.monsters");
  const tStat = useTranslations("referenceUi.statBlock");
  const tRef = useTranslations("reference");
  const tUi = useTranslations("referenceUi");
  const index = useIndexRows("creature", context.locale);
  const [{ query, maxCr, type, size }, update] = useViewState(viewState, { query: "", maxCr: preset.maxCr ?? ALL, type: preset.type ?? ALL, size: ALL });
  const setQuery = (value: string) => update({ query: value });
  const setMaxCr = (value: string) => update({ maxCr: value });
  const setType = (value: string) => update({ type: value });
  const setSize = (value: string) => update({ size: value });

  const rows = useMemo<MonsterRow[]>(() => {
    const builtin = (index ?? []).map(({ id, name, english, row }) => ({
      ref: `creature:${id}`, name, english, cr: typeof row.cr === "string" ? row.cr : null, types: typesOf(row.type),
      sizes: Array.isArray(row.size) ? (row.size as string[]) : [], pack: false,
    }));
    const pack = (context.packText?.creatures() ?? []).map((creature) => {
      const cr = creature.meta.cr;
      return {
        ref: creature.ref, name: creature.name, english: creature.englishName,
        cr: typeof cr === "string" ? cr : cr && typeof cr === "object" && typeof (cr as { cr?: unknown }).cr === "string" ? (cr as { cr: string }).cr : null,
        types: typesOf(creature.meta.type), sizes: Array.isArray(creature.meta.size) ? (creature.meta.size as string[]) : [], pack: true,
      };
    });
    return [...builtin, ...pack];
  }, [context.packText, index]);

  const types = useMemo(() => [...new Set(rows.flatMap((row) => row.types))].sort(), [rows]);
  const typeLabel = (value: string) => (tStat.has(`type.${value}` as never) ? tStat(`type.${value}` as never) : value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const limit = maxCr === ALL ? null : crValue(maxCr);
    return rows
      .filter((row) => {
        if (needle && !row.name.toLowerCase().includes(needle) && !row.english.toLowerCase().includes(needle)) return false;
        if (limit !== null) {
          const value = crValue(row.cr);
          if (value === null || value > limit) return false;
        }
        if (type !== ALL && !row.types.includes(type)) return false;
        if (size !== ALL && !row.sizes.includes(size)) return false;
        return true;
      })
      .sort((a, b) => (crValue(a.cr) ?? -1) - (crValue(b.cr) ?? -1) || a.name.localeCompare(b.name, context.locale));
  }, [context.locale, maxCr, query, rows, size, type]);

  return (
    <div className="space-y-2" data-monster-browser>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-8" />
        </div>
        <Select value={maxCr} onValueChange={setMaxCr}>
          <SelectTrigger className="w-36" aria-label={t("maxCr")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("anyCr")}</SelectItem>
            {CR_STEPS.map((value) => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36" aria-label={t("type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
            {types.map((value) => (
              <SelectItem key={value} value={value}>{typeLabel(value)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={size} onValueChange={setSize}>
          <SelectTrigger className="w-28" aria-label={t("size")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allSizes")}</SelectItem>
            {SIZES.map((value) => (
              <SelectItem key={value} value={value}>{tStat(`size.${value}` as never)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {index === null ? (
        <p className="text-sm text-muted-foreground">{tRef("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("count", { count: filtered.length })}</p>
          <ul className="space-y-1">
            {filtered.slice(0, LIST_LIMIT).map((row) => (
              <li key={row.ref} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/60" data-compendium-ref={row.ref}>
                <Badge variant="outline" className="w-10 justify-center px-0 text-2xs tabular-nums" title={tStat("cr")}>
                  {row.cr ?? "—"}
                </Badge>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  <button type="button" className="min-w-0 grow basis-48 text-left text-sm wrap-anywhere" onClick={() => onOpenRef(row.ref)}>
                    {row.name}
                    {row.name !== row.english && <span className="ml-2 text-xs text-muted-foreground">{row.english}</span>}
                  </button>
                  {row.pack && (
                    <Badge variant="outline" className="max-w-full whitespace-normal text-2xs wrap-anywhere" data-pack-badge>
                      {packLabel(tUi, context.packSupplier(row.ref)) ?? tRef("packBadge")}
                    </Badge>
                  )}
                  <span className="hidden text-xs text-muted-foreground sm:inline">{row.types.map(typeLabel).join(" / ")}</span>
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={tRef("open")} title={tRef("open")} onClick={() => onOpenRef(row.ref)}>
                  <BookOpen className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
