/**
 * Flattens Character data into a roll formula context, e.g.
 * `{ str: { value: 50, half: 25 } }` -> `{ str: 50, str_value: 50, str_half: 25 }`.
 * An object with a numeric `value` also gives its own key that number.
 */
export function flattenDataToContext(
  data: Record<string, unknown>,
  prefix = "",
): Record<string, number> {
  const context: Record<string, number> = {};

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}_${key}` : key;

    if (typeof value === "number") {
      context[fullKey] = value;
      // Also the key without its prefix, unless that is taken.
      if (!prefix || !(key in context)) {
        context[key] = value;
      }
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const obj = value as Record<string, unknown>;

      // An object with a numeric `value` gives its key that number:
      // str: { value: 50 } -> str: 50
      // san: { current: 45, max: 99 } -> san_current: 45, san_max: 99
      if (typeof obj.value === "number") {
        context[fullKey] = obj.value;
        if (!prefix || !(key in context)) {
          context[key] = obj.value;
        }
      }

      // Every member of a nested object, prefixed with its path.
      const nested = flattenDataToContext(obj, fullKey);
      Object.assign(context, nested);
    }
  }

  return context;
}
