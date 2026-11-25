/** The feat form: category and repeatable; class grants are out of the first batch (imports keep them). */
import type { HomebrewPayload } from "../types";
import { wizardItemsOf, type HomebrewRefContext } from "../wizard-items";
import {
  assertNoIssues, entryOf, entryOfKind, hasZh, losslessRead, namedIssues, readNames, readTexts, textEntries,
  type FormIssue, type HomebrewFormCodec, type TextForm,
} from "./common";

export const FEAT_CATEGORIES = ["origin", "general", "fightingStyle", "epicBoon"] as const;
export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

export interface FeatForm extends TextForm {
  category: FeatCategory;
  repeatable: boolean;
}

function issues(form: FeatForm): FormIssue[] {
  const out = namedIssues(form);
  if (!FEAT_CATEGORIES.includes(form.category)) out.push("category");
  return out;
}

function toPayload(form: FeatForm, context?: HomebrewRefContext): HomebrewPayload {
  assertNoIssues("feat", issues(form));
  const text = textEntries(form.textEn, form.textZh);
  const { entry, zhTW } = entryOf("feat", form, {
    ...text,
    meta: { category: form.category, grants: {}, repeatable: form.repeatable },
    withZh: hasZh(form.nameZh, form.textZh),
  });
  return { entry, ...(zhTW ? { zhTW } : {}), wizard: wizardItemsOf(entry, zhTW, context) };
}

function fromPayload(payload: HomebrewPayload) {
  const entry = entryOfKind(payload, "feat");
  const names = readNames(payload);
  const texts = readTexts(entry.entries, payload.zhTW?.entries, names.chineseOnly);
  const category = FEAT_CATEGORIES.find((value) => value === entry.meta.category) ?? "general";
  const form: FeatForm = {
    id: names.id, nameEn: names.nameEn, nameZh: names.nameZh, textEn: texts.en, textZh: texts.zh,
    category, repeatable: entry.meta.repeatable === true,
  };
  return { form, lossless: losslessRead(texts.lossless, () => toPayload(form), payload) };
}

export const featForm: HomebrewFormCodec<FeatForm> = {
  kind: "feat",
  empty: () => ({ id: "", nameEn: "", nameZh: "", textEn: "", textZh: "", category: "general", repeatable: false }),
  issues,
  toPayload,
  fromPayload,
};
