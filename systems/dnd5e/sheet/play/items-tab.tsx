"use client";

import { lazy, Suspense, use, useState } from "react";
import { Backpack, Coins, Plus, Settings2, Sparkles, Store, Swords } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { usePlay, usePlayEditing } from "./play-context";
import { useDndRecalc } from "./use-dnd-recalc";
import { num, rows, text, weaponAttackRow, weaponsByRef, type GameWeapon } from "./play-model";
import { CARD, CARD_TITLE } from "./card-styles";
import { attackLabels, newWeaponRowId } from "./attack-rows";
import { RowEditorHost, RowMenu } from "./row-actions";
import { displayName, useRowText } from "./row-text";
import { CarrySummary } from "./carry-summary";
import { armorCategory, catalogItem, loadCatalog, slotOf, type Catalog } from "../economy/catalog";
import { bonusOf, isAttuned, linkAttack, linkedAttacks, toggleEquipped } from "../economy/equip";
import { COINS } from "../economy/coins";

/**
 * The 物品 tab (plan-uat2 §3.3, §3.5): equipment rows with one body armor and one shield worn at a
 * time (AC follows them), item settings, magic items, the shop, the coin purse and the carried
 * weight. A lazy play tab; the item catalog and every dialog load with it or when opened.
 */

const ShopDialog = lazy(() => import("./shop-dialog").then((module) => ({ default: module.ShopDialog })));
const PurseDialog = lazy(() => import("./purse-dialog").then((module) => ({ default: module.PurseDialog })));
const MagicItemDialog = lazy(() => import("./magic-item-dialog").then((module) => ({ default: module.MagicItemDialog })));
const ItemConfigDialog = lazy(() => import("./item-config").then((module) => ({ default: module.ItemConfigDialog })));

type Row = Record<string, unknown>;

const PILL = "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted sm:min-h-9";
const HEADER_ACTION = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-accent hover:bg-muted sm:min-h-9";

/** Armor training the sheet records for a slot's item (SRD p.92: without it, a warning only). */
function trained(values: Row, catalog: Catalog, row: Row): boolean {
  const item = catalogItem(catalog, row.ref);
  const field = slotOf(item) === "shield" ? "armorShields" : { light: "armorLight", medium: "armorMedium", heavy: "armorHeavy" }[armorCategory(item) ?? "light"];
  return values[field] !== false;
}

function EquipmentRow({ row, index, weapon, catalog, onConfigure }: { row: Row; index: number; weapon: GameWeapon | undefined; catalog: Catalog; onConfigure: () => void }) {
  const t = useTranslations("play");
  const tItem = useTranslations("economy.item");
  const tDamage = useTranslations("play.damageType");
  const tRenderer = useTranslations("renderer");
  const { values, data, editable, update, reference, openReference } = usePlay();
  const recalc = useDndRecalc();
  // B-023: in edit mode the equip switch opens the item's settings instead
  const editing = usePlayEditing();
  const name = displayName(reference, row);
  const rowText = useRowText(reference, row);
  const equipped = row.equipped === true;
  const qty = num(row.qty, 1);
  const bonus = bonusOf(row);
  const toggle = () => {
    if (!update) return;
    const wearing = !equipped;
    // The toasts read the sheet as shown; the write applies to the stored data.
    const preview = toggleEquipped(values, index, catalog);
    update((previous) => toggleEquipped(previous, index, catalog).data);
    for (const at of preview.swapped) toast(tItem("swapped", { name: displayName(reference, rows(values.equipment)[at] ?? {}) }));
    // B-024 (Q7): what equipping recalculated, in place of 「AC 已依裝備更新」
    recalc(data, toggleEquipped(data, index, catalog).data);
    if (wearing && slotOf(catalogItem(catalog, row.ref)) && !trained(values, catalog, row)) toast.warning(tItem("untrained"));
  };
  const addAttack = () => {
    if (!weapon || !update) return;
    // The derived modifiers decide the ability (finesse): use the sheet's values, then add the row.
    const attack = linkAttack(weaponAttackRow(values, weapon, attackLabels(reference, (code) => tDamage(code), name), newWeaponRowId(), text(row.origin) || "srd"), row);
    update((previous) => ({ ...previous, weapons: [...rows(previous.weapons), attack] }));
    toast.success(t("items.added", { name }));
  };
  return (
    // The controls wrap to a line of their own when the name would be squeezed (a phone).
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border py-2 first:border-t-0" data-play-equipment={text(row.id) || name}>
      <span className="flex min-w-28 flex-1 items-center gap-1.5">
        <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">×{qty}</span>
        <button type="button" onClick={() => openReference(row)} className="min-w-0 truncate text-left font-medium underline-offset-4 hover:underline" disabled={!text(row.ref) && !text(row.text)}>
          {name}
        </button>
        {bonus !== 0 && <span className="shrink-0 rounded bg-accent/15 px-1.5 text-xs font-semibold text-accent" data-item-bonus>{tItem("bonusChip", { bonus })}</span>}
        {row.attunement === true && (
          <span className="shrink-0 rounded bg-muted px-1.5 text-2xs text-muted-foreground" data-item-attunement>
            {isAttuned(values, name) ? tItem("attunedChip") : tItem("attunementChip")}
          </span>
        )}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {/* An item with its attack already (bought or added before) offers no second one. */}
        {weapon && editable && update && linkedAttacks(values, row).length === 0 && (
          <button type="button" onClick={addAttack} aria-label={t("items.addAttackFor", { name })} className={PILL}>
            <Swords className="size-4" aria-hidden="true" />
            {t("items.addAttack")}
          </button>
        )}
        <button
          type="button"
          {...(editing
            ? { "aria-haspopup": "dialog" as const, "aria-label": tRenderer("editValue", { name }) }
            : { role: "switch", "aria-checked": equipped, "aria-label": t("items.toggle", { name, state: equipped ? t("items.equipped") : t("items.notEquipped") }) })}
          disabled={!editable}
          onClick={editing ? onConfigure : toggle}
          data-equipped={equipped ? "true" : "false"}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors sm:min-h-9",
            equipped ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-foreground hover:bg-muted",
            "disabled:cursor-default",
          )}
        >
          <Backpack className={cn("size-4", equipped && "fill-current")} aria-hidden="true" />
          {equipped ? t("items.equipped") : t("items.notEquipped")}
        </button>
        {editable && update && (
          <button type="button" onClick={onConfigure} aria-label={tItem("settingsFor", { name })} title={tItem("settings")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:size-9" data-item-settings>
            <Settings2 className="size-4" aria-hidden="true" />
          </button>
        )}
        <RowMenu list="equipment" row={row} name={name} shown={rowText.text} loading={rowText.loading} />
      </span>
    </li>
  );
}

type Open = { kind: "shop"; start: boolean } | { kind: "purse" } | { kind: "magic" } | { kind: "config"; index: number | null } | null;

export function ItemsTab() {
  const t = useTranslations("play");
  const tEconomy = useTranslations("economy");
  const tField = useTranslations("field");
  const catalog = use(loadCatalog());
  const { values, system, openCompendium, editable, update } = usePlay();
  const equipment = rows(values.equipment);
  const weapons = weaponsByRef(system.gameData?.weapons);
  const canWrite = editable && update !== null;
  // The starting shop (D1 = A): opens with the tab after the wizard, on a sheet the player can change.
  const [open, setOpen] = useState<Open>(() => (canWrite && values.startingShop === true ? { kind: "shop", start: true } : null));
  return (
    <RowEditorHost>
    <div className="space-y-3" data-play-items-tab>
      <section className={CARD} aria-label={t("items.equipment")}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={CARD_TITLE}>{t("items.equipment")}</h3>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => setOpen({ kind: "shop", start: false })} className={HEADER_ACTION} data-open-shop>
                <Store className="size-4" aria-hidden="true" />
                {tEconomy("shop.open")}
              </button>
              <button type="button" onClick={() => setOpen({ kind: "magic" })} className={HEADER_ACTION} data-open-magic-item>
                <Sparkles className="size-4" aria-hidden="true" />
                {tEconomy("magic.open")}
              </button>
              {openCompendium && (
                <button type="button" onClick={() => openCompendium({ tab: "equipment" })} className={HEADER_ACTION}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t("items.compendium")}
                </button>
              )}
            </div>
          )}
        </header>
        {equipment.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{t("items.empty")}</p>
        ) : (
          <ul className="mt-1">
            {equipment.map((row, index) => (
              <EquipmentRow
                key={text(row.id) || index}
                row={row}
                index={index}
                weapon={weapons.get(text(row.ref))}
                catalog={catalog}
                onConfigure={() => setOpen({ kind: "config", index })}
              />
            ))}
          </ul>
        )}
        {canWrite && (
          <button
            type="button"
            onClick={() => setOpen({ kind: "config", index: null })}
            className="min-h-11 rounded-md px-1 text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-9"
            data-custom-item
          >
            {tEconomy("item.custom")}
          </button>
        )}
        <CarrySummary catalog={catalog} />
      </section>
      <section className={CARD} aria-label={t("items.coins")}>
        <header className="flex items-center justify-between gap-2">
          <h3 className={CARD_TITLE}>{t("items.coins")}</h3>
          {canWrite && (
            <button type="button" onClick={() => setOpen({ kind: "purse" })} className={HEADER_ACTION} data-open-purse>
              <Coins className="size-4" aria-hidden="true" />
              {tEconomy("purse.open")}
            </button>
          )}
        </header>
        <dl className="mt-2 grid grid-cols-5 gap-2">
          {COINS.map((coin) => (
            <div key={coin} className="flex flex-col items-center rounded-lg bg-muted/50 py-2" data-play-coin={coin}>
              <dt className="text-xs text-muted-foreground">{tField(coin)}</dt>
              <dd className="text-lg font-semibold tabular-nums">{num(values[coin])}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Suspense fallback={null}>
        {open?.kind === "shop" && <ShopDialog catalog={catalog} start={open.start} onClose={() => setOpen(null)} />}
        {open?.kind === "purse" && <PurseDialog onClose={() => setOpen(null)} />}
        {open?.kind === "magic" && <MagicItemDialog catalog={catalog} onClose={() => setOpen(null)} />}
        {open?.kind === "config" && (
          <ItemConfigDialog catalog={catalog} index={open.index} onClose={() => setOpen(null)} />
        )}
      </Suspense>
    </div>
    </RowEditorHost>
  );
}
