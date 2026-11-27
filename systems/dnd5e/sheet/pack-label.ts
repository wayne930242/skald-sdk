/**
 * The badge naming the content pack that supplies an entry (B-025): "Pack: <name>", with the name the
 * host gives the pack (`referenceUi.packNames`, merged in by `ReferenceIntl`), or the pack id when it has none.
 * A table's shared GM homebrew (`table/<table>/<sharer>`, homebrew step 8) reads 「GM 的自製內容」,
 * with the sharer's name when the host names it (a table with two or more sharers).
 */
import { isHomebrewKey } from "../homebrew/domain/limits";
import { parseTableHomebrewKey } from "../homebrew/domain/share";

type Translate = { (key: string, values?: Record<string, string>): string; has(key: string): boolean };

export function packLabel(tUi: Translate, packId: string | undefined, displayName?: string): string | undefined {
  if (!packId) return undefined;
  const key = `packNames.${packId}`;
  const named = displayName ?? (tUi.has(key) ? tUi(key) : undefined);
  if (parseTableHomebrewKey(packId)) return named ? tUi("gmHomebrewFrom", { name: named }) : tUi("gmHomebrew");
  return tUi(isHomebrewKey(packId) ? "homebrewFrom" : "packFrom", { name: named ?? packId });
}
