type NestedMessages = Record<string, unknown>;
type FlattenedMessages = Record<string, string>;

interface CompiledSchemaI18n {
  messages: FlattenedMessages;
  resolveI18n: (text: string | undefined) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const flattenedMessagesCache = new WeakMap<NestedMessages, FlattenedMessages>();
const compiledSchemaI18nCache = new WeakMap<NestedMessages, CompiledSchemaI18n>();

const TRANSLATABLE_KEYS = new Set([
  "label",
  "labelActive",
  "placeholder",
  "title",
  "description",
  "text",
  "tooltip",
  "helperText",
  "emptyText",
  "confirmTitle",
  "confirmDescription",
  "cancelText",
  "confirmText",
  "spendingLabel",
  "cashLabel",
  "assetsLabel",
  "noFormulaPlaceholder",
]);

/**
 * Flatten nested messages object into dot-notation keys.
 * e.g., { section: { identity: "Identity" } } -> { "section.identity": "Identity" }
 */
export function flattenMessages(
  obj: NestedMessages,
  prefix = "",
): FlattenedMessages {
  if (!prefix) {
    const cached = flattenedMessagesCache.get(obj);
    if (cached) return cached;
  }

  const result: FlattenedMessages = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenMessages(value as NestedMessages, newKey));
    } else if (typeof value === "string") {
      result[newKey] = value;
    }
  }

  if (!prefix) {
    flattenedMessagesCache.set(obj, result);
  }

  return result;
}

/**
 * Create a deterministic i18n resolver using flattened messages.
 */
export function createSchemaI18nResolver(messages: Record<string, string>) {
  return (text: string | undefined): string => {
    if (!text) return "";

    const replaced = text.replace(/\{\{i18n:(.+?)\}\}/gi, (_, key) => {
      return messages[key] || key;
    });

    // Support direct key strings like "field.name".
    if (messages[replaced]) {
      return messages[replaced];
    }

    return replaced;
  };
}

function interpolateMessage(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

/**
 * Create a key-based translator similar to t("namespace.key").
 * The caller should pass full key path (e.g., "techniques.mastery.learned").
 */
export function createSchemaKeyTranslator(messages: Record<string, string>) {
  return (key: string, values?: Record<string, string | number>): string => {
    const template = messages[key] ?? key;
    return interpolateMessage(template, values);
  };
}

/**
 * Build schema i18n helpers once per messages object.
 * Safe for dynamic locale/set switching because each payload object gets its own cache slot.
 */
export function compileSchemaI18n(messages: NestedMessages): CompiledSchemaI18n {
  const cached = compiledSchemaI18nCache.get(messages);
  if (cached) return cached;

  const flattened = flattenMessages(messages);
  const compiled: CompiledSchemaI18n = {
    messages: flattened,
    resolveI18n: createSchemaI18nResolver(flattened),
    t: createSchemaKeyTranslator(flattened),
  };
  compiledSchemaI18nCache.set(messages, compiled);
  return compiled;
}

/**
 * Deep-resolve i18n strings for known display keys.
 * Technical strings (formula/expression/id/path) are preserved.
 */
export function resolveI18nDeep<T>(
  value: T,
  resolveI18n: (text: string | undefined) => string,
  parentKey?: string,
): T {
  if (typeof value === "string") {
    const hasI18nMarker = value.includes("{{i18n:");
    const canTranslateByKey = !!parentKey && TRANSLATABLE_KEYS.has(parentKey);

    if (!hasI18nMarker && !canTranslateByKey) {
      return value;
    }
    return resolveI18n(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveI18nDeep(item, resolveI18n, parentKey),
    ) as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = resolveI18nDeep(child, resolveI18n, key);
    }
    return output as T;
  }

  return value;
}
