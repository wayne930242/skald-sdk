/**
 * The content-pack text rule (D9) as its own entry: pure and system-agnostic, so plugin domain code
 * (and the open-source export) reaches it without the rest of the character index.
 */
export { importedSheetData, PACK_ORIGIN, stripPackText } from "./domain/pack-text";
