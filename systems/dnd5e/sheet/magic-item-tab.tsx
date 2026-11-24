"use client";

import { useMemo } from "react";
import { useViewState, type LiftedViewState, type MagicItemViewState } from "../reference/view-state";
import { BookOpen, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { useIndexRows } from "./use-index-rows";
import type { ReferenceContextValue } from "./use-reference-context";

/**
 * The magic item tab (plan T2b §5.3): the SRD magic items from the lazy item-magic index, searchable
 * by zh and English name and filtered by category, rarity and attunement. A variant lists with its
 * family's category and attunement. Picking adds an equipment row (built-in ref and name).
 */

const ALL = "__all__";
const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact", "varies", "none"];
const LIST_LIMIT = 200;

interface ItemRow {
  ref: string;
  name: string;
  english: string;
  category: string;
  rarity: string;
  attunement: boolean;
}

export function MagicItemTab({
  context,
  canAdd,
  onAdd,
  onPreview,
  viewState,
}: {
  context: ReferenceContextValue;
  canAdd: boolean;
  onAdd: (ref: string, name: string) => void;
  onPreview: (ref: string) => void;
  /** Kept by the compendium so a preview and Back keep the search and filters. */
  viewState?: LiftedViewState<MagicItemViewState>;
}) {
  const t = useTranslations("referenceUi.magicItems");
  const tItem = useTranslations("referenceUi.item");
  const tRef = useTranslations("reference");
  const tCompendium = useTranslations("compendium");
  const index = useIndexRows("item-magic", context.locale);
  const [{ query, category, rarity, attunement }, update] = useViewState(viewState, { query: "", category: ALL, rarity: ALL, attunement: ALL });
  const setQuery = (value: string) => update({ query: value });
  const setCategory = (value: string) => update({ category: value });
  const setRarity = (value: string) => update({ rarity: value });
  const setAttunement = (value: string) => update({ attunement: value });

  const rows = useMemo<ItemRow[]>(() => {
    const entries = [...(index ?? []), ...(context.packText?.magicItems() ?? []).map((item) => ({
      id: item.id, name: item.name, english: item.englishName, row: item.meta,
    }))];
    const byId = new Map(entries.map((entry) => [entry.id, entry.row]));
    return entries.map(({ id, name, english, row }) => {
      const family = typeof row.family === "string" ? byId.get(row.family) : undefined;
      const source = family ?? row;
      return {
        ref: `item:${id}`, name, english,
        category: String(source.category ?? ""), rarity: String(row.rarity ?? ""),
        attunement: source.attunement !== undefined && source.attunement !== null && source.attunement !== false,
      };
    });
  }, [index, context.packText]);
  const categories = useMemo(() => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(), [rows]);
  const label = (group: string, value: string) => (tItem.has(`${group}.${value}` as never) ? tItem(`${group}.${value}` as never) : value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (needle && !row.name.toLowerCase().includes(needle) && !row.english.toLowerCase().includes(needle)) return false;
        if (category !== ALL && row.category !== category) return false;
        if (rarity !== ALL && row.rarity !== rarity) return false;
        if (attunement !== ALL && row.attunement !== (attunement === "yes")) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, context.locale));
  }, [attunement, category, context.locale, query, rarity, rows]);

  return (
    <div className="space-y-2" data-magic-item-tab>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-8" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-36" aria-label={t("category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
            {categories.map((value) => (
              <SelectItem key={value} value={value}>{label("category", value)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rarity} onValueChange={setRarity}>
          <SelectTrigger className="w-32" aria-label={t("rarity")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allRarities")}</SelectItem>
            {RARITIES.map((value) => (
              <SelectItem key={value} value={value}>{label("rarity", value)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={attunement} onValueChange={setAttunement}>
          <SelectTrigger className="w-32" aria-label={t("attunement")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("anyAttunement")}</SelectItem>
            <SelectItem value="yes">{t("attunes")}</SelectItem>
            <SelectItem value="no">{t("noAttunement")}</SelectItem>
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
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  <span className="min-w-0 grow basis-48 text-sm wrap-anywhere">
                    {row.name}
                    {row.name !== row.english && <span className="ml-2 text-xs text-muted-foreground">{row.english}</span>}
                  </span>
                  <Badge variant="outline" className="text-2xs">{label("rarity", row.rarity)}</Badge>
                  <Badge variant="secondary" className="hidden text-2xs sm:inline-flex">{label("category", row.category)}</Badge>
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={tRef("open")} title={tRef("open")} onClick={() => onPreview(row.ref)}>
                  <BookOpen className="size-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={() => onAdd(row.ref, row.name)}>
                  <Plus className="size-4" />
                  {tCompendium("add")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
