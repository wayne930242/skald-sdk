/**
 * A feature row whose feature is a named choice (Hunter's Prey: Colossus Slayer) keeps the pick in
 * two row fields outside the schema, like a homebrew stamp: `option`, the option's English name as
 * the blocks write it (a stable id), and `optionName`, its name in the locale it was picked in. The
 * play view and the print name the row "Feature: Option" with the feature from the catalog. Pure;
 * the print imports it without row-text.
 */

export const OPTION_FIELDS = { id: "option", name: "optionName" } as const;

/** The message token of the "{feature}: {option}" pattern (root catalog, read with `token`). */
export const OPTION_ROW_MESSAGE = "{{i18n:reference.featureOption}}";

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The picked option's label on a row (its picked-locale name, else its id), or null without a pick. */
export function rowOption(row: Record<string, unknown>): string | null {
  return str(row[OPTION_FIELDS.name]) || str(row[OPTION_FIELDS.id]) || null;
}

/** The row fields of a pick. */
export function optionFields(id: string, name: string): Record<string, string> {
  return { [OPTION_FIELDS.id]: id, [OPTION_FIELDS.name]: name };
}

/** `feature` with the row's picked option ("Feature: Option" in the viewer's catalog), else `feature`. */
export function withRowOption(token: (value: unknown) => string, feature: string, row: Record<string, unknown>): string {
  const option = rowOption(row);
  if (!option) return feature;
  const pattern = token(OPTION_ROW_MESSAGE);
  return pattern.includes("{feature}") && pattern.includes("{option}")
    ? pattern.replace("{feature}", () => feature).replace("{option}", () => option)
    : `${feature}: ${option}`;
}
