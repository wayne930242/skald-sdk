import availability from "@skald/system-dnd5e/data/dnd5e-2024/zh-availability.json";

/**
 * The zh-TW data files a D&D test reads text from, relative to data/dnd5e-2024.
 *
 * The public repo withholds some zh-TW files until the retranslation from the English SRD clears
 * them (open-source plan §2 step 3b): the export writes the English text at each path and lists the
 * path in zh-availability.json. A case that asserts zh-TW text, or finds controls by their zh-TW
 * names, skips while a file it reads is withheld, and runs again once that file is cleared. Skald's
 * own repo withholds nothing, so every case runs there.
 */
export type ZhFile =
  | "messages/zh-TW.json"
  | "messages/economy/zh-TW.json"
  | "messages/edit/zh-TW.json"
  | "messages/homebrew/zh-TW.json"
  | "messages/play/zh-TW.json"
  | "messages/play-tabs/zh-TW.json"
  | "messages/print/zh-TW.json"
  | "messages/reference/zh-TW.json"
  | "messages/roll/zh-TW.json"
  | `corpus/zh-TW/${string}.json`
  | `corpus/index/zh-TW/${string}.json`;

const withheld = new Set<string>(availability.withheld);

/** Whether this repo withholds any of `files`: then a case that reads their zh-TW text skips. */
export function zhWithheld(...files: [ZhFile, ...ZhFile[]]): boolean {
  return files.some((file) => withheld.has(file));
}

/** Whether this repo withholds any zh-TW file: the sheet then shows the fallback notice. */
export const anyZhWithheld = withheld.size > 0;
