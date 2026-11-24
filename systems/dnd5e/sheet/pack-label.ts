/** The badge naming the content pack that supplies an entry (B-025): 「內容包：XPHB 擴充內容」, or the pack id when the name list has none. */
type Translate = { (key: string, values?: Record<string, string>): string; has(key: string): boolean };

export function packLabel(tUi: Translate, packId: string | undefined): string | undefined {
  if (!packId) return undefined;
  const key = `packNames.${packId}`;
  return tUi("packFrom", { name: tUi.has(key) ? tUi(key) : packId });
}
