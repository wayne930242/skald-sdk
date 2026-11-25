import { loadEnglishIndex, loadLocalizedIndex } from "../../reference/load-corpus";

// Priced magic items live in the reference index, not the sheet's initial names catalog.
async function load(locale: string) {
  const [english, local] = await Promise.all([loadEnglishIndex("item-magic"), loadLocalizedIndex(locale, "item-magic")]);
  const names = new Map<string, { name: string; english: string }>();
  for (const [id, row] of Object.entries(english ?? {})) {
    const name = local?.[id]?.name;
    if (typeof row.name === "string") names.set(`item:${id}`, { name: typeof name === "string" && name ? name : row.name, english: row.name });
  }
  return names;
}

const indexes = new Map<string, ReturnType<typeof load>>();
export function shopMagicNames(locale: string) {
  const cached = indexes.get(locale);
  if (cached) return cached;
  const pending = load(locale);
  indexes.set(locale, pending);
  pending.catch(() => indexes.delete(locale));
  return pending;
}
