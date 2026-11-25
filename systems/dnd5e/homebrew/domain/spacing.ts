/**
 * Filling the generated-text templates (`{class}`, `{sub}`, …) with the house CJK spacing rule: a
 * value that holds Latin letters or digits (a name like "UAT2-Arcanist") is set off by a space where
 * it meets CJK text in the template, so the Chinese text does not run into it. `spaced` false fills
 * the values in as they are, as v4.152.0 did (its saves are read back with that wording).
 */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LATIN = /[A-Za-z0-9]/;

export function fillSpaced(template: string, values: Readonly<Record<string, string>>, spaced = true): string {
  return template.replace(/\{(\w+)\}/g, (match: string, key: string, at: number) => {
    const value = values[key];
    if (value === undefined) return match;
    if (!spaced || !LATIN.test(value)) return value;
    const before = HAN.test(template[at - 1] ?? "") ? " " : "";
    const after = HAN.test(template[at + match.length] ?? "") ? " " : "";
    return `${before}${value}${after}`;
  });
}
