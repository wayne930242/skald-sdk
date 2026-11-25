/** The magic item form: category, rarity, attunement, charges and weight. Magic items have no wizard items. */
import type { HomebrewPayload } from "../types";
import {
  assertNoIssues, entryOf, entryOfKind, hasZh, losslessRead, namedIssues, readNames, readTexts, textEntries,
  type FormIssue, type HomebrewFormCodec, type TextForm,
} from "./common";

export const MAGIC_ITEM_CATEGORIES = ["Wondrous Item", "Armor", "Weapon", "Potion", "Ring", "Rod", "Scroll", "Staff", "Wand"] as const;
export const MAGIC_ITEM_RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact", "varies"] as const;

export type MagicItemCategory = (typeof MAGIC_ITEM_CATEGORIES)[number];
export type MagicItemRarity = (typeof MAGIC_ITEM_RARITIES)[number];

export interface ItemForm extends TextForm {
  category: MagicItemCategory;
  rarity: MagicItemRarity;
  attunement: boolean;
  /** Who may attune, in the built-in wording ("by a wizard"); "" for anyone. */
  attunementBy: string;
  /** null: no charges. */
  charges: number | null;
  /** Pounds; null: not given. */
  weight: number | null;
}

function issues(form: ItemForm): FormIssue[] {
  const out = namedIssues(form);
  if (!MAGIC_ITEM_CATEGORIES.includes(form.category)) out.push("category");
  if (!MAGIC_ITEM_RARITIES.includes(form.rarity)) out.push("rarity");
  if (form.charges !== null && !(Number.isInteger(form.charges) && form.charges > 0)) out.push("charges");
  if (form.weight !== null && !(form.weight >= 0)) out.push("weight");
  return out;
}

function toPayload(form: ItemForm): HomebrewPayload {
  assertNoIssues("item", issues(form));
  const by = form.attunementBy.trim();
  const { entry, zhTW } = entryOf("item", form, {
    ...textEntries(form.textEn, form.textZh),
    meta: {
      magic: true,
      category: form.category,
      rarity: form.rarity,
      ...(form.attunement ? { attunement: by || true } : {}),
      ...(form.charges !== null ? { charges: form.charges } : {}),
      ...(form.weight !== null ? { weight: form.weight } : {}),
    },
    withZh: hasZh(form.nameZh, form.textZh),
  });
  return { entry, ...(zhTW ? { zhTW } : {}) };
}

function fromPayload(payload: HomebrewPayload) {
  const entry = entryOfKind(payload, "item");
  const m = entry.meta;
  const names = readNames(payload);
  const texts = readTexts(entry.entries, payload.zhTW?.entries, names.chineseOnly);
  const form: ItemForm = {
    id: names.id, nameEn: names.nameEn, nameZh: names.nameZh, textEn: texts.en, textZh: texts.zh,
    category: MAGIC_ITEM_CATEGORIES.find((value) => value === m.category) ?? "Wondrous Item",
    rarity: MAGIC_ITEM_RARITIES.find((value) => value === m.rarity) ?? "uncommon",
    attunement: m.attunement === true || (typeof m.attunement === "string" && m.attunement !== ""),
    attunementBy: typeof m.attunement === "string" ? m.attunement : "",
    charges: typeof m.charges === "number" ? m.charges : null,
    weight: typeof m.weight === "number" ? m.weight : null,
  };
  return { form, lossless: losslessRead(texts.lossless, () => toPayload(form), payload) };
}

export const itemForm: HomebrewFormCodec<ItemForm> = {
  kind: "item",
  empty: () => ({
    id: "", nameEn: "", nameZh: "", textEn: "", textZh: "",
    category: "Wondrous Item", rarity: "uncommon", attunement: false, attunementBy: "", charges: null, weight: null,
  }),
  issues,
  toPayload: (form) => toPayload(form),
  fromPayload,
};
