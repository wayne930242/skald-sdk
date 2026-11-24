import type { CompiledFormulaArtifact } from "@skald/formula";

/** The part of a schema field (or a List row field) the input defaults read. */
interface InputFieldLike {
  id: string;
  type: string;
  defaultValue?: unknown;
}

/**
 * The defaults of the inputs a formula or a roll reads: each non-computed field's `defaultValue`,
 * keyed by field id. `skip` names fields a formula writes (a default formula's target fills
 * itself at creation and is not shadowed here). A null default is no default.
 */
export function inputDefaultsOf(
  fields: Iterable<InputFieldLike>,
  skip: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "computed" || skip.has(field.id)) continue;
    if (field.defaultValue === undefined || field.defaultValue === null) continue;
    defaults[field.id] = field.defaultValue;
  }
  return defaults;
}

/**
 * `values` read with its schema's defaults: a key that is absent (undefined) takes the default;
 * a present value, null, 0 and "" included, is kept. A new object for reading only: a character
 * made before a field joined its schema computes and rolls as a new one would, and nothing is
 * written back to the data, the Yjs document or the database.
 */
export function withInputDefaults<T>(
  values: Record<string, T>,
  defaults: Readonly<Record<string, unknown>> | undefined,
): Record<string, T> {
  if (!defaults) return values;
  let filled: Record<string, T> | null = null;
  for (const [key, value] of Object.entries(defaults)) {
    if (values[key] !== undefined) continue;
    filled ??= { ...values };
    filled[key] = value as T;
  }
  return filled ?? values;
}

/**
 * The runtime with its schema's character input defaults, which the character formula values
 * and the roll context read. Fields a derived or default formula targets are left out. Idempotent per schema.
 */
export function withSchemaInputDefaults<T extends { artifact: Pick<CompiledFormulaArtifact, "programs"> }>(
  runtime: T,
  schema: { fields: Readonly<Record<string, InputFieldLike>> },
): Omit<T, "inputDefaults"> & { inputDefaults: Record<string, unknown> } {
  const targets = new Set(
    (runtime.artifact?.programs ?? [])
      // A validation rule's target is only the first field it reads: it writes nothing (T4G-R-F005).
      .filter((program) => program.location.scope === "character" && program.kind !== "validation")
      .map((program) => program.targetFieldId),
  );
  return {
    ...runtime,
    inputDefaults: inputDefaultsOf(Object.values(schema.fields), targets),
  };
}
