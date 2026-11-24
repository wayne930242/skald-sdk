/**
 * Pack spell casting time and range in the viewer's locale (B-014). A pack
 * spell pick carries the same codes as a built-in spell (`1-action`,
 * `point-60-feet`); where the built-in spells use the code, the wizard writes
 * the built-in message token, as for a built-in spell. Wizard only: the
 * sheet's catalog checks its messages instead (use-reference-context), so this
 * stays out of the sheet's chunk.
 */

type Item = Record<string, unknown>;

function isItem(value: unknown): value is Item {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The casting time and range codes the built-in spells use; each has a built-in message. */
export interface SpellCodes {
  castingTime: ReadonlySet<string>;
  range: ReadonlySet<string>;
}

export function spellCodes(builtin: unknown): SpellCodes {
  const castingTime = new Set<string>();
  const range = new Set<string>();
  for (const spell of Array.isArray(builtin) ? builtin : []) {
    if (!isItem(spell)) continue;
    if (typeof spell.castingTimeCode === "string") castingTime.add(spell.castingTimeCode);
    if (typeof spell.rangeCode === "string") range.add(spell.rangeCode);
  }
  return { castingTime, range };
}

/** The built-in message token for a code the built-in spells use; else the pack's own (English) text. */
export function packSpellTokens(item: Item, codes: SpellCodes): { castingTime?: string; range?: string } {
  const w = isItem(item.w) ? item.w : {};
  const pick = (code: unknown, known: ReadonlySet<string>, namespace: string, own: unknown) =>
    typeof code === "string" && known.has(code) ? `{{i18n:${namespace}.${code}}}` : typeof own === "string" ? own : undefined;
  // A shape the built-in spells lack (emanation-5-feet) whose pack text is a plain distance ("5 feet").
  const feet = typeof w.range === "string" ? /^(\d+) feet$/.exec(w.range)?.[1] : undefined;
  const rangeCode = typeof item.rangeCode === "string" && !codes.range.has(item.rangeCode) && feet ? `point-${feet}-feet` : item.rangeCode;
  const castingTime = pick(item.castingTimeCode, codes.castingTime, "spellCastingTime", w.castingTime);
  const range = pick(rangeCode, codes.range, "spellRange", w.range);
  return { ...(castingTime !== undefined ? { castingTime } : {}), ...(range !== undefined ? { range } : {}) };
}

/** `gameData` after the pack overlay, its pack spell picks reading casting time and range as tokens. */
export function withPackSpellTokens(gameData: Record<string, unknown>, builtin: unknown): Record<string, unknown> {
  if (!Array.isArray(gameData.spells)) return gameData;
  const codes = spellCodes(builtin);
  return {
    ...gameData,
    spells: gameData.spells.map((item: unknown) =>
      isItem(item) && item.origin === "pack" && isItem(item.w) ? { ...item, w: { ...item.w, ...packSpellTokens(item, codes) } } : item,
    ),
  };
}
