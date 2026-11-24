"use client";

import { useLocale, useTranslations } from "next-intl";
import { priceCoin } from "../economy/coins";

/** Prices and coin sums in `economy.*` labels: the shop, the purse and their toasts. */

/** A price or a sum in the coin the SRD tables use for it: 75 GP, 5 SP, 2 CP. */
export function usePrice(): (cp: number) => string {
  const t = useTranslations("economy");
  const locale = useLocale();
  return (cp) => {
    const { amount, coin } = priceCoin(Math.max(0, Math.round(cp)));
    return t("price", { amount: new Intl.NumberFormat(locale).format(amount), coin: t(`coin.${coin}`) });
  };
}

/** A purse total as GP with up to two decimals (12.55 金幣). */
export function useGp(): (cp: number) => string {
  const t = useTranslations("economy");
  const locale = useLocale();
  return (cp) => t("price", { amount: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(cp / 100), coin: t("coin.gp") });
}
