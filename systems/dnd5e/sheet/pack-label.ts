/**
 * The badge naming the content pack that supplies an entry (B-025): "Pack: <name>", with the name the
 * host gives the pack (`referenceUi.packNames`, merged in by `ReferenceIntl`), or the pack id when it has none.
 */
import { isHomebrewKey } from "../homebrew/domain/limits";

type Translate = { (key: string, values?: Record<string, string>): string; has(key: string): boolean };

export function packLabel(tUi: Translate, packId: string | undefined, displayName?: string): string | undefined {
  if (!packId) return undefined;
  const key = `packNames.${packId}`;
  return tUi(isHomebrewKey(packId) ? "homebrewFrom" : "packFrom", { name: displayName ?? (tUi.has(key) ? tUi(key) : packId) });
}
