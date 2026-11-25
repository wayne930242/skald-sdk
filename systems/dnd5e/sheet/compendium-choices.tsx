"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@skald/sheet-sdk/components/ui/select";

/**
 * The compendium's class filter order (UAT m11): the built-in classes by their name in the viewer's
 * locale (zh-TW collation in Chinese, so they no longer follow the English ids), then pack and
 * homebrew classes the same way, after a divider (`packStart`).
 */
export function sortClassFilter(
  ids: readonly string[],
  { builtin, nameOf, locale }: { builtin: ReadonlySet<string>; nameOf: (id: string) => string; locale: string },
): { ids: string[]; packStart: number } {
  const collator = new Intl.Collator(locale);
  const byName = (a: string, b: string) => collator.compare(nameOf(a), nameOf(b)) || a.localeCompare(b);
  const own = ids.filter((id) => builtin.has(id)).sort(byName);
  const others = ids.filter((id) => !builtin.has(id)).sort(byName);
  return { ids: [...own, ...others], packStart: others.length > 0 && own.length > 0 ? own.length : -1 };
}

/** Radix Select forbids an empty item value: the starting class's `""` maps to this key. */
const START = "__start__";

/**
 * A spell row's class chip (UAT M5): the spell is on several of the sheet's class lists, so the
 * player picks which class casts it before 加入.
 */
export function SpellCasterSelect({
  casters,
  value,
  onChange,
  label,
}: {
  casters: ReadonlyArray<{ castingClass: string; name: string }>;
  value: string;
  onChange: (castingClass: string) => void;
  label: string;
}) {
  return (
    <Select value={value || START} onValueChange={(next) => onChange(next === START ? "" : next)}>
      <SelectTrigger size="sm" className="h-8 max-w-32 text-xs" aria-label={label} data-compendium-caster>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {casters.map((caster) => (
          <SelectItem key={caster.castingClass || START} value={caster.castingClass || START}>
            {caster.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
