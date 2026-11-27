"use client";

import { createTranslator, useLocale } from "next-intl";
import { poolCaption, poolMessages, poolSelected, type PoolOutcome } from "@skald/dice";

export function PoolResult({ pool, rolls, total }: { pool: PoolOutcome; rolls: number[]; total: number }) {
  const locale = useLocale();
  const t = createTranslator({ locale, messages: poolMessages(locale) });
  const caption = poolCaption(pool, (key, args) => t(key as Parameters<typeof t>[0], args));
  const selected = poolSelected(pool, rolls, total);
  return <span className="inline-flex flex-wrap items-baseline gap-x-2">
    <span>{caption.kind}</span>
    {rolls.map((face, i) => selected.includes(i)
      ? <strong key={i} data-pool-selected className="font-mono text-foreground">[{face}]</strong>
      : <span key={i} className="font-mono">[{face}]</span>)}
    <strong data-pool-tier>{caption.tier}</strong>
    {caption.notes.map((note) => <span key={note}>{note}</span>)}
  </span>;
}
