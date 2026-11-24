"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { ScrollArea } from "@skald/sheet-sdk/components/ui/scroll-area";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { SHOP_CATEGORIES, shopCategory, type Catalog, type CatalogItem, type ShopCategory } from "../economy/catalog";
import { COINS, purseOf, totalCp } from "../economy/coins";
import { linkAttack } from "../economy/equip";
import { cartCost, purchase, shopItems } from "../economy/shop";
import { usePlay } from "./play-context";
import { text, weaponAttackRow, weaponsByRef } from "./play-model";
import { attackLabels, newWeaponRowId } from "./attack-rows";
import { srdItemRow } from "./item-rows";
import { useGp, usePrice } from "./coin-format";

/**
 * The shop (plan-uat2 §3.5, B-005): the SRD's priced items by category, a cart paid from the coin
 * purse with change. A purchase merges into an unequipped row of the same item; weapons also
 * become attacks unless the player turns it off. As the starting shop (D1 = A) it opens once after
 * the wizard; 完成購買, 略過 and closing all clear `startingShop`. The built-in shop sells SRD items only.
 */

type Row = Record<string, unknown>;
const ALL = "all";

export function ShopDialog({ catalog, start, onClose }: { catalog: Catalog; start: boolean; onClose: () => void }) {
  const t = useTranslations("economy.shop");
  const tEconomy = useTranslations("economy");
  const tDamage = useTranslations("play.damageType");
  const locale = useLocale();
  const price = usePrice();
  const gp = useGp();
  const { values, update, write, reference, schema, system } = usePlay();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ShopCategory | typeof ALL>(ALL);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [attacks, setAttacks] = useState(true);
  const weapons = useMemo(() => weaponsByRef(system.gameData?.weapons), [system]);

  const items = useMemo(() => {
    const order = new Map(SHOP_CATEGORIES.map((value, index) => [value, index]));
    return shopItems(catalog)
      .map((item) => ({ item, category: shopCategory(item), name: reference.nameOf(item.ref), english: englishName(reference.englishNames, item) }))
      .sort((a, b) => order.get(a.category)! - order.get(b.category)! || a.name.localeCompare(b.name, locale));
  }, [catalog, locale, reference]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((entry) => (category === ALL || entry.category === category)
      && (!needle || entry.name.toLowerCase().includes(needle) || entry.english.toLowerCase().includes(needle)));
  }, [category, items, query]);

  const have = totalCp(purseOf(values));
  const cost = cartCost(cart, catalog) ?? 0;
  const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const short = cost > have;

  const set = (ref: string, qty: number) =>
    setCart((previous) => {
      const next = { ...previous };
      if (qty <= 0) delete next[ref];
      else next[ref] = qty;
      return next;
    });

  const finish = () => {
    if (start) write({ startingShop: false });
    onClose();
  };

  const buy = () => {
    if (!update || count === 0 || short) return;
    const names = new Map(items.map((entry) => [entry.item.ref, entry.name]));
    const build = {
      row: (ref: string, qty: number) => srdItemRow(schema, ref, names.get(ref) ?? ref, qty),
      attack: (row: Row) => {
        const weapon = attacks ? weapons.get(text(row.ref)) : undefined;
        if (!weapon) return null;
        return linkAttack(weaponAttackRow(values, weapon, attackLabels(reference, (code) => tDamage(code), text(row.name)), newWeaponRowId()), row);
      },
    };
    // The coins, rows and attacks as they were, for 復原.
    const before: Row = Object.fromEntries([...COINS, "equipment", "weapons"].map((key) => [key, values[key]]));
    update((previous) => {
      const done = purchase(previous, cart, catalog, build);
      return done ? { ...done.data, ...(start ? { startingShop: false } : {}) } : previous;
    });
    toast.success(t("bought", { count, cost: price(cost) }), {
      action: { label: tEconomy("purse.undo"), onClick: () => update((previous) => ({ ...previous, ...before })) },
    });
    setCart({});
    if (start) onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && finish()}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col" data-shop-dialog={start ? "start" : "shop"}>
        <DialogHeader>
          <DialogTitle>{start ? t("startTitle") : t("title")}</DialogTitle>
          <DialogDescription>{start ? t("startHint") : t("srdOnly")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("title")}>
          {[ALL, ...SHOP_CATEGORIES].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value as ShopCategory | typeof ALL)}
              className={cn("min-h-9 rounded-full border px-3 text-sm", category === value ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-muted")}
              data-shop-category={value}
            >
              {value === ALL ? t("all") : t(`category.${value}`)}
            </button>
          ))}
        </div>
        <ScrollArea className="h-[45vh] min-h-48 pr-3">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map(({ item, name }) => (
                <ShopRow key={item.ref} item={item} name={name} qty={cart[item.ref] ?? 0} onQty={(qty) => set(item.ref, qty)} price={price} />
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <p className="flex flex-wrap gap-x-3 tabular-nums" data-shop-totals>
            <span className="font-semibold">{t("total", { cost: price(cost) })}</span>
            <span>・{t("have", { have: gp(have) })}</span>
            <span className={cn(short && "font-semibold text-destructive")}>・{short ? t("short") : t("after", { after: gp(have - cost) })}</span>
          </p>
          <label className="flex min-h-9 items-center gap-2">
            <Checkbox checked={attacks} onCheckedChange={(checked) => setAttacks(checked === true)} />
            {t("attacks")}
          </label>
        </div>
        <DialogFooter>
          {start && (
            <Button type="button" variant="outline" onClick={finish}>{t("skip")}</Button>
          )}
          <Button type="button" onClick={buy} disabled={count === 0 || short} data-shop-buy>
            {start ? t("done") : t("buy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function englishName(names: Record<string, Record<string, string> | undefined>, item: CatalogItem): string {
  const [kind, id] = [item.ref.slice(0, item.ref.indexOf(":")), item.ref.slice(item.ref.indexOf(":") + 1)];
  return names[kind]?.[id] ?? id;
}

function ShopRow({ item, name, qty, onQty, price }: { item: CatalogItem; name: string; qty: number; onQty: (qty: number) => void; price: (cp: number) => string }) {
  const t = useTranslations("economy.shop");
  const tEconomy = useTranslations("economy");
  const locale = useLocale();
  const weight = item.weight > 0 ? tEconomy("lb", { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.weight) }) : "—";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_auto]" data-shop-item={item.ref}>
      <span className="min-w-0 truncate font-medium">{name}</span>
      <span className="col-start-1 row-start-2 text-xs text-muted-foreground tabular-nums sm:col-start-auto sm:row-start-auto sm:text-right sm:text-sm sm:text-foreground">
        {price(item.costCp ?? 0)}
        <span className="sm:hidden"> · {weight}</span>
      </span>
      <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">{weight}</span>
      <span className="row-span-2 flex items-center gap-1 sm:row-span-1">
        <Button type="button" variant="outline" size="icon" className="size-9" disabled={qty === 0} onClick={() => onQty(qty - 1)} aria-label={t("fewer", { name })}>
          <Minus className="size-4" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={qty}
          onChange={(event) => onQty(Math.max(0, Math.trunc(Number(event.target.value) || 0)))}
          aria-label={t("qty", { name })}
          className="h-9 w-14 px-1 text-center tabular-nums"
        />
        <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => onQty(qty + 1)} aria-label={t("more", { name })}>
          <Plus className="size-4" />
        </Button>
      </span>
    </li>
  );
}

