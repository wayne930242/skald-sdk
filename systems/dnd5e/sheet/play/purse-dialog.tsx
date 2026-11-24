"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@skald/sheet-sdk/components/ui/tabs";
import { addCoins, COIN_CP, COINS, coinWeight, convert, purseOf, spend, totalCp, type Coin, type Purse } from "../economy/coins";
import { usePlay } from "./play-context";
import { usePrice } from "./coin-format";

/**
 * The coin purse (plan-uat2 §3.5, B-006): income, spending with change, conversion at SRD rates
 * (p.89) and a direct edit. No history (D4 = A): each action's toast offers 復原, which writes the
 * purse back as it was.
 */

type Tab = "income" | "spend" | "convert" | "edit";
const TABS: readonly Tab[] = ["income", "spend", "convert", "edit"];

const whole = (value: string) => Math.max(0, Math.trunc(Number(value) || 0));

function CoinInputs({ values, onChange, prefix }: { values: Record<Coin, string>; onChange: (coin: Coin, value: string) => void; prefix: string }) {
  const tCoin = useTranslations("field");
  return (
    <div className="grid grid-cols-5 gap-2">
      {COINS.map((coin) => (
        <div key={coin} className="space-y-1">
          <Label htmlFor={`${prefix}-${coin}`} className="justify-center">{tCoin(coin)}</Label>
          <Input id={`${prefix}-${coin}`} type="number" inputMode="numeric" min={0} value={values[coin]} onChange={(event) => onChange(coin, event.target.value)} className="px-1 text-center tabular-nums" />
        </div>
      ))}
    </div>
  );
}

function CoinSelect({ value, onChange, id }: { value: Coin; onChange: (coin: Coin) => void; id: string }) {
  const tCoin = useTranslations("field");
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Coin)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COINS.map((coin) => (
          <SelectItem key={coin} value={coin}>{tCoin(coin)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const blank = (): Record<Coin, string> => ({ cp: "", sp: "", ep: "", gp: "", pp: "" });

export function PurseDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("economy.purse");
  const tCoin = useTranslations("field");
  const locale = useLocale();
  const id = useId();
  const price = usePrice();
  const { values, write } = usePlay();
  const purse = purseOf(values);
  const [tab, setTab] = useState<Tab>("income");
  const [income, setIncome] = useState(blank);
  const [amount, setAmount] = useState("");
  const [spendCoin, setSpendCoin] = useState<Coin>("gp");
  const [from, setFrom] = useState<Coin>("gp");
  const [to, setTo] = useState<Coin>("sp");
  const [count, setCount] = useState("");
  const [edit, setEdit] = useState<Record<Coin, string>>(() => Object.fromEntries(COINS.map((coin) => [coin, String(purse[coin])])) as Record<Coin, string>);
  const [error, setError] = useState<string | null>(null);

  /** Writes the purse; the toast's 復原 writes back the purse as it was. */
  const apply = (next: Purse, message: string) => {
    const before = purse;
    write(next);
    setError(null);
    toast.success(message, { action: { label: t("undo"), onClick: () => write(before) } });
  };

  const doIncome = () => {
    const add = Object.fromEntries(COINS.map((coin) => [coin, whole(income[coin])])) as Purse;
    if (totalCp(add) === 0) return;
    apply(addCoins(purse, add), t("added"));
    setIncome(blank());
  };
  const doSpend = () => {
    const cost = whole(amount) * COIN_CP[spendCoin];
    if (cost === 0) return;
    const next = spend(purse, cost);
    if (!next) return setError(t("short", { cost: price(cost) }));
    apply(next, t("spent", { cost: price(cost) }));
    setAmount("");
  };
  const doConvert = () => {
    const coins = whole(count);
    if (coins === 0 || from === to) return;
    if (coins > purse[from]) return setError(t("tooMany", { have: purse[from], from: tCoin(from) }));
    const next = convert(purse, from, to, coins);
    if (!next) return setError(t("notExact", { count: coins, from: tCoin(from), to: tCoin(to) }));
    apply(next, t("converted", { count: coins, from: tCoin(from), to: tCoin(to) }));
    setCount("");
  };
  const doEdit = () => apply(Object.fromEntries(COINS.map((coin) => [coin, whole(edit[coin])])) as Purse, t("saved"));

  const weight = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(coinWeight(purse));
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg" data-purse-dialog>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="tabular-nums" data-purse-total>
            {COINS.map((coin) => `${tCoin(coin)} ${purse[coin]}`).join("・")}
            <br />
            {t("total", { gp: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(totalCp(purse) / 100) })}・{t("weight", { value: weight })}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as Tab);
            setError(null);
          }}
          className="gap-3"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value} className="h-8 flex-none">{t(`tab.${value}`)}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="income" className="space-y-3">
            <CoinInputs prefix={`${id}-income`} values={income} onChange={(coin, value) => setIncome((previous) => ({ ...previous, [coin]: value }))} />
            <Button type="button" onClick={doIncome}>{t("add")}</Button>
          </TabsContent>
          <TabsContent value="spend" className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${id}-amount`}>{t("amount")}</Label>
                <Input id={`${id}-amount`} type="number" inputMode="numeric" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-spend-coin`}>{t("coin")}</Label>
                <CoinSelect id={`${id}-spend-coin`} value={spendCoin} onChange={setSpendCoin} />
              </div>
            </div>
            <Button type="button" onClick={doSpend}>{t("spend")}</Button>
          </TabsContent>
          <TabsContent value="convert" className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${id}-count`}>{t("count")}</Label>
                <Input id={`${id}-count`} type="number" inputMode="numeric" min={0} value={count} onChange={(event) => setCount(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-from`}>{t("from")}</Label>
                <CoinSelect id={`${id}-from`} value={from} onChange={setFrom} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-to`}>{t("to")}</Label>
                <CoinSelect id={`${id}-to`} value={to} onChange={setTo} />
              </div>
            </div>
            <Button type="button" onClick={doConvert}>{t("convert")}</Button>
          </TabsContent>
          <TabsContent value="edit" className="space-y-3">
            <CoinInputs prefix={`${id}-edit`} values={edit} onChange={(coin, value) => setEdit((previous) => ({ ...previous, [coin]: value }))} />
            <Button type="button" onClick={doEdit}>{t("save")}</Button>
          </TabsContent>
        </Tabs>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">{t("sellNote")}</p>
      </DialogContent>
    </Dialog>
  );
}
