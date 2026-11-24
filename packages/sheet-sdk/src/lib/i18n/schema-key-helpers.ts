type SchemaTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Translate by full key and fall back to a provided value when key is missing.
 */
export function translateSchemaKey(
  t: SchemaTranslator,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  const translated = t(key, values);
  return translated === key ? fallback : translated;
}

/**
 * Translate CoC skill id using `skill.<id>` key.
 */
export function translateSkillId(
  t: SchemaTranslator,
  skillId: string,
): string {
  return translateSchemaKey(t, `skill.${skillId}`, skillId);
}
