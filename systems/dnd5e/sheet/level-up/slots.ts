/** A level-up's spell slot offer (phase 2b §4.1): the totals before and after, and the sheet's. Pure. */

export interface SlotsOffer {
  /** The class table at the current level and the target level, spell levels 1–9. */
  before: number[];
  after: number[];
  pact?: { before: { slots: number; level: number }; after: { slots: number; level: number } };
  /** The sheet's totals now. */
  sheet: { slots: number[]; pact: { slots: number; level: number } };
  /** The sheet's totals equal the table at the current level: the checkbox starts on. */
  matches: boolean;
  /**
   * The sheet holds no slots at all while the table at the current level has some (slots never set,
   * and the slots come from a casting subclass taken at an earlier level, i.e. a sheet from before such
   * slots were counted): the checkbox starts on to set them. A plain caster at zero may be intentional.
   */
  unset: boolean;
  /** The table changes over the run, or the sheet's totals differ from the target's (a repair). */
  changed: boolean;
}

/** Whether the update starts on: the sheet matches the table now, or holds no slots yet. */
export const slotsDefaultOn = (offer: SlotsOffer | null): boolean => offer !== null && (offer.matches || offer.unset);

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** A slots offer from the before / after totals (null = none of that kind); null when neither kind exists. */
export function slotsFrom(
  data: Record<string, unknown>,
  beforeSlots: readonly number[] | null,
  afterSlots: readonly number[] | null,
  beforePact: { slots: number; level: number } | null,
  afterPact: { slots: number; level: number } | null,
  legacySubclass = false,
): SlotsOffer | null {
  if (!beforeSlots && !afterSlots && !beforePact && !afterPact) return null;
  const zero = Array.from({ length: 9 }, () => 0);
  const fill = (slots: readonly number[] | null) => zero.map((_, index) => slots?.[index] ?? 0);
  const sheet = {
    slots: zero.map((_, index) => num(data[`slot${index + 1}Total`])),
    pact: { slots: num(data.pactSlots), level: num(data.pactSlotLevel) },
  };
  const out: SlotsOffer = { before: fill(beforeSlots), after: fill(afterSlots), sheet, matches: false, unset: false, changed: false };
  if (beforePact || afterPact) out.pact = { before: beforePact ?? { slots: 0, level: 0 }, after: afterPact ?? { slots: 0, level: 0 } };
  const same = (a: readonly number[], b: readonly number[]) => a.every((value, index) => value === b[index]);
  const samePact = (a: { slots: number; level: number }, b: { slots: number; level: number }) => a.slots === b.slots && a.level === b.level;
  out.matches = same(sheet.slots, out.before) && (!out.pact || samePact(sheet.pact, out.pact.before));
  const blank = sheet.slots.every((value) => value === 0) && sheet.pact.slots === 0;
  out.unset = legacySubclass && !out.matches && blank && (out.before.some((value) => value > 0) || (out.pact?.before.slots ?? 0) > 0);
  const sheetDiffers = !same(sheet.slots, out.after) || (out.pact !== undefined && !samePact(sheet.pact, out.pact.after));
  // Before equal to after with the sheet matching means the sheet already holds the target.
  out.changed = sheetDiffers;
  return out;
}
