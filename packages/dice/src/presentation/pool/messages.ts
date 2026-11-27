import en from "./en.json";
import zh from "./zh-TW.json";
import { poolTierKey, type PoolOutcome } from "../../pool-highest";

export function poolMessages(locale: string) {
  return locale === "zh-TW" ? zh : en;
}

export function poolCaption(pool: PoolOutcome, t: (key: string, args?: Record<string, string>) => string) {
  const delta = pool.stressDelta;
  return {
    kind: t(`kind.${pool.kind}`), tier: t(`tier.${poolTierKey(pool)}`),
    notes: [
      ...(pool.rating + pool.extraThreats <= 0 ? [t("lowest")] : []),
      ...(delta !== undefined ? [t("stress", { delta: delta > 0 ? `+${delta}` : String(delta) })] : []),
      ...(pool.edge ? [t("edge")] : []),
    ],
  };
}
