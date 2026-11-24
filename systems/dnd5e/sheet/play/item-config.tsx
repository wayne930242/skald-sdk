"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import { appendRow } from "../custom-rows";
import { catalogItem, slotOf, takesBonus, type Catalog } from "../economy/catalog";
import { attune, bonusOf, isAttuned, patchItem, unattune, ATTUNEMENT_FIELDS } from "../economy/equip";
import { usePlay } from "./play-context";
import { num, rows, text } from "./play-model";
import { customItemRow, RARITIES } from "./item-rows";
import { PLAYER_TEXT_MAX_CHARS } from "./row-body";
import { displayName } from "./row-text";
import { useDndRecalc } from "./use-dnd-recalc";

/**
 * 「設定」 for an item row (plan-uat2 §3.3, B-019): name, quantity, +N (weapons and armor), rarity,
 * attunement, weight, notes and, for a custom item, its description. A new +N or name reaches the
 * attacks made from the item, and a +N on worn armor its AC. `index` null adds a custom item.
 */

const NONE = "__none__";

type Row = Record<string, unknown>;

/** The attunement slot writes for a change of name or of the 同調 toggle; null when all three are taken. */
export function attunementPatch(values: Row, before: string, after: string, attuned: boolean): Row | null {
  const was = before !== "" && isAttuned(values, before);
  if (!attuned) return was ? unattune(values, before) : {};
  if (was && before !== after) {
    const field = ATTUNEMENT_FIELDS.find((slot) => text(values[slot]).trim() === before.trim());
    return field ? { [field]: after } : {};
  }
  return was ? {} : attune(values, after);
}

export function ItemConfigDialog({ catalog, index, onClose }: { catalog: Catalog; index: number | null; onClose: () => void }) {
  const t = useTranslations("economy.item");
  const tLb = useTranslations("economy");
  const id = useId();
  const { values, data, update, reference, schema } = usePlay();
  const recalc = useDndRecalc();
  const row: Row | undefined = index === null ? undefined : rows(values.equipment)[index];
  const shown = row ? displayName(reference, row) : "";
  const custom = !row || text(row.origin) === "custom" || (!row.origin && !row.ref);
  const base = catalogItem(catalog, row?.ref);
  const [name, setName] = useState(shown);
  const [qty, setQty] = useState(String(row ? num(row.qty, 1) : 1));
  const [bonus, setBonus] = useState(String(row ? bonusOf(row) : 0));
  const [rarity, setRarity] = useState(text(row?.rarity) || NONE);
  const [attunement, setAttunement] = useState(row?.attunement === true);
  const [attuned, setAttuned] = useState(shown !== "" && isAttuned(values, shown));
  const [weight, setWeight] = useState(row && typeof row.weight === "number" ? String(row.weight) : "");
  const [notes, setNotes] = useState(text(row?.notes));
  const [body, setBody] = useState(text(row?.text));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const own = name.trim();
    if (!own) return setError(t("nameRequired"));
    const slots = attunementPatch(values, shown, own, attunement && attuned);
    if (slots === null) return setError(t("attuneFull"));
    const weightValue = weight.trim() === "" ? undefined : Math.max(0, Number(weight));
    const fields: Row = {
      qty: Math.max(0, Math.trunc(Number(qty) || 0)),
      bonus: takesBonus(base) ? Math.trunc(Number(bonus) || 0) : bonusOf(row ?? {}),
      rarity: rarity === NONE ? "" : rarity,
      attunement,
      weight: weightValue !== undefined && Number.isFinite(weightValue) ? weightValue : undefined,
      notes,
      ...(custom ? { text: body.slice(0, PLAYER_TEXT_MAX_CHARS) } : {}),
    };
    if (!update) return;
    if (row === undefined || index === null) {
      update((previous) => ({ ...appendRow(previous, "equipment", customItemRow(schema, { name: own, ...fields })), ...slots }));
      toast.success(t("added", { name: own }));
      onClose();
      return;
    }
    // A built-in row the player renames becomes their own: the sheet shows the row's name, not the catalog's.
    const renamed = own !== shown;
    const patch: Row = { ...fields, ...(renamed ? { name: own, ...(custom ? {} : { origin: "custom" }) } : {}) };
    update((previous) => ({ ...patchItem(previous, index, patch, catalog).data, ...slots }));
    toast.success(t("saved", { name: own }));
    // B-024: a worn armor's or shield's +N recalculates AC (the notice replaces 「AC 已依裝備更新」)
    recalc(data, patchItem(data, index, patch, catalog).data);
    onClose();
  };

  const field = (key: string) => `${id}-${key}`;
  const catalogWeight = base?.weight;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-item-config>
        <DialogHeader>
          <DialogTitle>{row ? t("settingsFor", { name: shown }) : t("customTitle")}</DialogTitle>
          <DialogDescription>{slotOf(base) ? t("acHint") : t("title")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={field("name")}>{t("name")}</Label>
            <Input id={field("name")} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("qty")}>{t("qty")}</Label>
            <Input id={field("qty")} type="number" inputMode="numeric" min={0} value={qty} onChange={(event) => setQty(event.target.value)} />
          </div>
          {takesBonus(base) && (
            <div className="space-y-1">
              <Label htmlFor={field("bonus")}>{t("bonus")}</Label>
              <Input id={field("bonus")} type="number" inputMode="numeric" value={bonus} onChange={(event) => setBonus(event.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={field("rarity")}>{t("rarity")}</Label>
            <Select value={rarity} onValueChange={setRarity}>
              <SelectTrigger id={field("rarity")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("rarities.none")}</SelectItem>
                {RARITIES.map((value) => (
                  <SelectItem key={value} value={value}>{t(`rarities.${value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("weight")}>{t("weight")}</Label>
            <Input
              id={field("weight")}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={weight}
              placeholder={catalogWeight !== undefined ? String(catalogWeight) : ""}
              onChange={(event) => setWeight(event.target.value)}
            />
            {catalogWeight !== undefined && <p className="text-xs text-muted-foreground">{t("weightHint", { value: tLb("lb", { value: catalogWeight }) })}</p>}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
            <Checkbox checked={attunement} onCheckedChange={(checked) => setAttunement(checked === true)} />
            {t("attunement")}
          </label>
          {attunement && (
            <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
              <Checkbox checked={attuned} onCheckedChange={(checked) => setAttuned(checked === true)} />
              {t("attuned")}
            </label>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={field("notes")}>{t("notes")}</Label>
            <Input id={field("notes")} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {custom && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={field("text")}>{t("text")}</Label>
              <Textarea id={field("text")} rows={4} maxLength={PLAYER_TEXT_MAX_CHARS} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button type="button" onClick={save}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
