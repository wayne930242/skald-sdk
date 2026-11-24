"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@skald/sheet-sdk/components/ui/tabs";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import { catalogItem, shopCategory, type Catalog } from "../economy/catalog";
import { linkAttack } from "../economy/equip";
import { usePlay } from "./play-context";
import { rows, weaponAttackRow, weaponsByRef } from "./play-model";
import { attackLabels, newWeaponRowId } from "./attack-rows";
import { customItemRow, RARITIES } from "./item-rows";
import { PLAYER_TEXT_MAX_CHARS } from "./row-body";

/**
 * 「新增魔法物品」 (plan-uat2 §3.3, B-019): a base item from the catalog as the template, then the
 * item's own name, +N, rarity, attunement and description. The row keeps the base `ref`, so its
 * slot, weight, AC and Strength come from the base; a weapon can be added as an attack too. SRD
 * magic items stay in the library's 魔法物品 tab.
 */

type Kind = "weapon" | "armor" | "other";
const KINDS: readonly Kind[] = ["weapon", "armor", "other"];
const NONE = "__none__";

export function MagicItemDialog({ catalog, onClose }: { catalog: Catalog; onClose: () => void }) {
  const t = useTranslations("economy.magic");
  const tItem = useTranslations("economy.item");
  const tDamage = useTranslations("play.damageType");
  const id = useId();
  const { values, update, reference, schema, system } = usePlay();
  const [kind, setKind] = useState<Kind>("weapon");
  const [base, setBase] = useState(NONE);
  const [name, setName] = useState("");
  const [bonus, setBonus] = useState("1");
  const [rarity, setRarity] = useState<string>("uncommon");
  const [attunement, setAttunement] = useState(false);
  const [body, setBody] = useState("");
  const [asAttack, setAsAttack] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const weapons = useMemo(() => weaponsByRef(system.gameData?.weapons), [system]);

  const bases = useMemo(() => {
    const refs = Object.keys(catalog).filter((ref) => {
      const item = catalogItem(catalog, ref)!;
      const category = shopCategory(item);
      return kind === "other" ? category !== "weapon" && category !== "armor" : category === kind;
    });
    return refs.map((ref) => ({ ref, name: reference.nameOf(ref) })).sort((a, b) => a.name.localeCompare(b.name, reference.locale));
  }, [catalog, kind, reference]);

  const plus = kind !== "other";
  const add = () => {
    const own = name.trim();
    if (!own) return setError(tItem("nameRequired"));
    if (plus && base === NONE) return setError(t("baseRequired"));
    if (!update) return;
    const row = customItemRow(schema, {
      qty: 1,
      name: own,
      ref: base === NONE ? "" : base,
      bonus: plus ? Math.trunc(Number(bonus) || 0) : 0,
      rarity,
      attunement,
      text: body.slice(0, PLAYER_TEXT_MAX_CHARS),
    });
    const weapon = kind === "weapon" && asAttack ? weapons.get(base) : undefined;
    const attack = weapon ? linkAttack(weaponAttackRow(values, weapon, attackLabels(reference, (code) => tDamage(code), own), newWeaponRowId(), "custom"), row) : null;
    update((previous) => ({
      ...previous,
      equipment: [...rows(previous.equipment), row],
      ...(attack ? { weapons: [...rows(previous.weapons), attack] } : {}),
    }));
    toast.success(tItem("added", { name: own }));
    onClose();
  };

  const field = (key: string) => `${id}-${key}`;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-magic-item-dialog>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value as Kind);
            setBase(NONE);
          }}
        >
          <TabsList className="h-auto flex-wrap justify-start">
            {KINDS.map((value) => (
              <TabsTrigger key={value} value={value} className="h-8 flex-none">{t(`tab.${value}`)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={field("base")}>{t("base")}</Label>
            <Select value={base} onValueChange={setBase}>
              <SelectTrigger id={field("base")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("noBase")}</SelectItem>
                {bases.map((item) => (
                  <SelectItem key={item.ref} value={item.ref}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={field("name")}>{tItem("name")}</Label>
            <Input id={field("name")} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {plus && (
            <div className="space-y-1">
              <Label htmlFor={field("bonus")}>{tItem("bonus")}</Label>
              <Input id={field("bonus")} type="number" inputMode="numeric" value={bonus} onChange={(event) => setBonus(event.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={field("rarity")}>{tItem("rarity")}</Label>
            <Select value={rarity} onValueChange={setRarity}>
              <SelectTrigger id={field("rarity")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RARITIES.map((value) => (
                  <SelectItem key={value} value={value}>{tItem(`rarities.${value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
            <Checkbox checked={attunement} onCheckedChange={(checked) => setAttunement(checked === true)} />
            {tItem("attunement")}
          </label>
          {kind === "weapon" && (
            <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
              <Checkbox checked={asAttack} onCheckedChange={(checked) => setAsAttack(checked === true)} />
              {t("attack")}
            </label>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={field("text")}>{tItem("text")}</Label>
            <Textarea id={field("text")} rows={4} maxLength={PLAYER_TEXT_MAX_CHARS} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{tItem("cancel")}</Button>
          <Button type="button" onClick={add}>{t("add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
