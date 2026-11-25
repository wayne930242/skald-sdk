import { useTranslations } from "next-intl";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import type { HomebrewFormKind } from "../domain/types";
import { FEAT_CATEGORIES } from "../domain/forms/feat";
import {
  MAGIC_ITEM_CATEGORIES,
  MAGIC_ITEM_RARITIES,
} from "../domain/forms/item";
import { SPECIES_SIZES } from "../domain/forms/species";
import {
  ABILITIES,
  CASTING_UNITS,
  DISTANCE_UNITS,
  DURATION_TYPES,
  DURATION_UNITS,
  RANGE_SHAPES,
  SPELL_SCHOOLS,
} from "../domain/forms/spell";
import { SKILL_FIELDS } from "../domain/wizard-items";

const lists: Record<string, readonly string[]> = {
  rarity: MAGIC_ITEM_RARITIES,
  size: SPECIES_SIZES,
  school: SPELL_SCHOOLS,
  castingUnit: CASTING_UNITS,
  rangeShape: RANGE_SHAPES,
  rangeUnit: DISTANCE_UNITS,
  durationType: DURATION_TYPES,
  durationUnit: DURATION_UNITS,
  saveAbility: ["", ...ABILITIES],
  abilityOptions: ABILITIES,
  skills: ["", ...Object.keys(SKILL_FIELDS)],
  classes: [
    "bard",
    "cleric",
    "druid",
    "paladin",
    "ranger",
    "sorcerer",
    "warlock",
    "wizard",
  ],
};
const templates: Record<string, unknown> = {
  traits: { nameZh: "", nameEn: "", textZh: "", textEn: "" },
  items: { ref: "", displayName: "", qty: 1 },
  toolChoice: { category: "", count: 1 },
  skillChoice: { count: 1, from: "any" },
};
const optionalNumbers = ["charges", "weight", "rangeAmount", "durationAmount"];

/** The codecs own the shape; nested rows use the same labeled controls as the top-level record. */
export function Field({
  name,
  value,
  kind,
  change,
}: {
  name: string;
  value: unknown;
  kind: HomebrewFormKind;
  change(value: unknown): void;
}) {
  const t = useTranslations("homebrew");
  const label = t(`field.${name}`);
  const options =
    name === "category"
      ? kind === "feat"
        ? FEAT_CATEGORIES
        : kind === "item"
          ? MAGIC_ITEM_CATEGORIES
          : undefined
      : lists[name];
  if (Array.isArray(value) && name !== "from") {
    const fixed = name === "skills" || name === "abilityOptions";
    return (
      <fieldset className="col-span-full space-y-2">
        <legend>{label}</legend>
        {value.map((child, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field
              name={name}
              value={child}
              kind={kind}
              change={(v) => change(value.map((x, j) => (i === j ? v : x)))}
            />
            {!fixed && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => change(value.filter((_, j) => j !== i))}
              >
                {t("remove")}
              </Button>
            )}
          </div>
        ))}
        {!fixed && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              change([...value, templates[name] ?? options?.[0] ?? ""])
            }
          >
            {t("add", { field: label })}
          </Button>
        )}
      </fieldset>
    );
  }
  if ((name === "skillChoice" || name === "toolChoice") && !value)
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => change(templates[name])}
      >
        {t("add", { field: label })}
      </Button>
    );
  if (value && typeof value === "object" && !Array.isArray(value))
    return (
      <fieldset className="col-span-full grid gap-2 rounded border p-3 sm:grid-cols-2">
        <legend>{label}</legend>
        {Object.entries(value).map(([k, v]) => (
          <Field
            key={k}
            kind={kind}
            name={k}
            value={v}
            change={(x) => change({ ...value, [k]: x })}
          />
        ))}
        {(name === "skillChoice" || name === "toolChoice") && (
          <Button type="button" variant="ghost" onClick={() => change(null)}>
            {t("remove")}
          </Button>
        )}
      </fieldset>
    );
  const display = String(value ?? "");
  const number = typeof value === "number" || optionalNumbers.includes(name);
  if (typeof value === "boolean")
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => change(e.target.checked)}
        />
        {label}
      </label>
    );
  return (
    <label className="grid gap-1 text-sm">
      {label}
      {options ? (
        <select
          className="rounded border bg-background p-2"
          value={display}
          onChange={(e) => change(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt ? t(`option.${opt.replaceAll(" ", "_")}`) : t("none")}
            </option>
          ))}
        </select>
      ) : /^(text|higher)(En|Zh)$/.test(name) ? (
        <Textarea value={display} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input
          list={
            ["originFeat", "ref", "toolGrants"].includes(name)
              ? `hb-${name}`
              : undefined
          }
          type={number ? "number" : "text"}
          step={number ? "any" : undefined}
          value={display}
          onChange={(e) => {
            const s = e.target.value;
            change(
              number
                ? !s && optionalNumbers.includes(name)
                  ? null
                  : Number(s)
                : name === "from" && s !== "any"
                  ? s.split(",")
                  : s,
            );
          }}
        />
      )}
    </label>
  );
}
