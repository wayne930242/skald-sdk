/**
 * What every homebrew form shares (IMPL §3.3): an id, the English and zh-TW names, and texts in the
 * simple markup. The rules:
 *
 * - `entry.name` = `nameEn || nameZh`; `entry.source` = `"homebrew"`; `entry.entries` = the parsed
 *   `textEn || textZh`;
 * - `zhTW` = `{ name: nameZh || nameEn, entries: parsed(textZh || textEn) }` when any zh-TW field is set.
 *
 * Reading a payload back is the inverse up to these defaults: a name written only in Chinese comes
 * back as `nameZh` with a blank `nameEn`, and saving the form again gives the same payload.
 */
import { canonicalJson } from "../../../content-pack/domain/canonical-json";
import { PACK_ID_PATTERN } from "../../../content-pack/domain/limits";
import type { OpenPackEntry } from "../../../content-pack/open/format";
import type { PackZhEntry } from "../../../content-pack/domain/types";
import type { DndKind } from "../../../reference/tags";
import { slugId } from "../../../reference/tags";
import { parseMarkup, printMarkup } from "../markup";
import type { HomebrewFormKind, HomebrewPayload } from "../types";
import type { HomebrewRefContext } from "../wizard-items";

export interface NamedForm {
  /** The entry id (`kind:id` is its ref); `newHomebrewId` makes the default. */
  id: string;
  nameEn: string;
  nameZh: string;
}

export interface TextForm extends NamedForm {
  /** Markup (`markup.ts`). */
  textEn: string;
  textZh: string;
}

/** A form read from a stored payload; `lossless` false when saving it would change the entry or its zh-TW layer. */
export interface FormRead<F> {
  form: F;
  lossless: boolean;
}

export type FormIssue = "name" | "id" | (string & {});

/** One kind's conversion, the editor's only way to and from a stored payload. */
export interface HomebrewFormCodec<F extends NamedForm> {
  kind: HomebrewFormKind;
  /** A blank form for a new entry. */
  empty(): F;
  /** What blocks a save: `name` (both names blank), `id` (not a valid entry id), and the kind's own. */
  issues(form: F): FormIssue[];
  /** The payload of a valid form; throws on a form with issues. `context` names the refs it points to. */
  toPayload(form: F, context?: HomebrewRefContext): HomebrewPayload;
  /** The form a payload of this kind reads as; throws on a payload of another kind. */
  fromPayload(payload: HomebrewPayload): FormRead<F>;
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/**
 * The default id of a new entry: the pipeline's slug of the English name, or, when that is empty (a
 * name written only in Chinese), `hb-` and eight random `[a-z0-9]`.
 */
export function newHomebrewId(nameEn: string, random: () => number = Math.random): string {
  const slug = slugId(nameEn).slice(0, 200).replace(/-+$/, "");
  if (slug) return slug;
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let index = 0; index < 8; index += 1) suffix += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return `hb-${suffix}`;
}

export function namedIssues(form: NamedForm): FormIssue[] {
  const issues: FormIssue[] = [];
  if (!form.nameEn.trim() && !form.nameZh.trim()) issues.push("name");
  if (!PACK_ID_PATTERN.test(form.id)) issues.push("id");
  return issues;
}

export function assertNoIssues(kind: HomebrewFormKind, issues: readonly FormIssue[]): void {
  if (issues.length) throw new Error(`homebrew ${kind} form: ${issues.join(", ")}`);
}

/** The English and zh-TW text of one localized pair, by the defaults above. */
export function pair(en: string, zh: string): { en: string; zh: string } {
  const english = en.trim();
  const chinese = zh.trim();
  return { en: english || chinese, zh: chinese || english };
}

/**
 * Reads back a pair the defaults wrote: a Chinese-only value comes back on the zh-TW side. With
 * `blankSame`, a zh-TW value that only repeats the English one comes back blank (it fell back).
 */
export function readPair(en: string, zh: string | undefined, blankSame = false): { en: string; zh: string } {
  if (zh === undefined) return { en, zh: "" };
  if (zh !== en) return { en, zh };
  if (CJK.test(en)) return { en: "", zh };
  return { en, zh: blankSame ? "" : zh };
}

/** A text pair's entries by the defaults: each side falls back to the other. */
export function textEntries(textEn: string, textZh: string): { en: unknown[]; zh: unknown[] } {
  return { en: parseMarkup(textEn.trim() ? textEn : textZh), zh: parseMarkup(textZh.trim() ? textZh : textEn) };
}

/**
 * Reads back a text pair. When both sides are the same text, one of them was a fallback: the English
 * side of a Chinese-only entry, else the zh-TW side; that side comes back blank.
 */
export function readTexts(en: readonly unknown[], zh: readonly unknown[] | undefined, chineseOnly: boolean) {
  const english = printMarkup(en);
  const chinese = zh ? printMarkup(zh) : { text: "", lossless: true };
  const same = zh !== undefined && canonicalJson(en) === canonicalJson(zh);
  return {
    en: same && chineseOnly ? "" : english.text,
    zh: same && !chineseOnly ? "" : chinese.text,
    lossless: english.lossless && chinese.lossless,
  };
}

export function hasZh(...values: string[]): boolean {
  return values.some((value) => value.trim() !== "");
}

/** The entry and zh-TW layer of a form, from its parsed parts. */
export function entryOf(
  kind: DndKind,
  form: NamedForm,
  parts: { en: unknown[]; zh: unknown[]; meta: Record<string, unknown>; withZh: boolean; zhExtra?: Partial<PackZhEntry> },
): { entry: OpenPackEntry; zhTW?: PackZhEntry } {
  const names = pair(form.nameEn, form.nameZh);
  const entry: OpenPackEntry = { kind, id: form.id, ref: `${kind}:${form.id}`, name: names.en, source: "homebrew", entries: parts.en, meta: parts.meta };
  if (!parts.withZh) return { entry };
  return { entry, zhTW: { name: names.zh, entries: parts.zh, ...parts.zhExtra } };
}

/** The entry of a payload of `kind`, or a thrown error. */
export function entryOfKind(payload: HomebrewPayload, kind: DndKind): OpenPackEntry & { meta: Record<string, unknown> } {
  const entry = payload.entry;
  if (!entry || entry.kind !== kind) throw new Error(`not a homebrew ${kind} payload`);
  return { ...entry, meta: entry.meta ?? {} };
}

/** The names a payload's entry reads back as. */
export function readNames(payload: HomebrewPayload): { id: string; nameEn: string; nameZh: string; chineseOnly: boolean } {
  const entry = payload.entry!;
  const names = readPair(entry.name, payload.zhTW?.name);
  return { id: entry.id, nameEn: names.en, nameZh: names.zh, chineseOnly: names.en === "" };
}

/** The entry and zh-TW layer as compared for `lossless`: `ref` filled in, the author's `source` label ignored. */
function comparable(payload: HomebrewPayload): string {
  const entry = payload.entry;
  const normalized = entry ? { ...entry, ref: entry.ref ?? `${entry.kind}:${entry.id}`, meta: entry.meta ?? {}, source: undefined } : undefined;
  return canonicalJson({ entry: normalized, zhTW: payload.zhTW });
}

/** Whether saving `form` gives back `payload`'s entry and zh-TW layer unchanged. */
export function sameEntry(regenerated: HomebrewPayload, stored: HomebrewPayload): boolean {
  return comparable(regenerated) === comparable(stored);
}

/** `lossless` of a read: the markup was exact and saving the form gives the stored entry and zh-TW layer back. */
export function losslessRead(markupLossless: boolean, regenerate: () => HomebrewPayload, stored: HomebrewPayload): boolean {
  if (!markupLossless) return false;
  try {
    return sameEntry(regenerate(), stored);
  } catch {
    return false;
  }
}
