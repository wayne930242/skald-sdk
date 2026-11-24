import type { Json } from "./json";

export const FIELD_MIGRATION_SCHEMA = "skald/field-migration/v1" as const;
/**
 * v2 accepts every v1 rule plus `systemConverter`, which names a converter
 * shipped with Skald. Only built-in templates may use it.
 */
export const FIELD_MIGRATION_SCHEMA_V2 = "skald/field-migration/v2" as const;

export type FieldValueConverter =
  | "string-to-number@1"
  | "number-to-string@1"
  | "string-to-boolean@1"
  | "boolean-to-string@1";

interface FieldMigrationRuleBase {
  fieldId: string;
}

export type AddFieldMigrationRule = FieldMigrationRuleBase & {
  type: "add";
  path: string;
} & (
    | { defaultValue: Json; nullable?: never }
    | { nullable: true; defaultValue?: never }
  );

export interface MoveFieldMigrationRule extends FieldMigrationRuleBase {
  type: "move";
  from: string;
  to: string;
}

export interface RemoveFieldMigrationRule extends FieldMigrationRuleBase {
  type: "remove";
  path: string;
}

export interface ConvertFieldMigrationRule extends FieldMigrationRuleBase {
  type: "convert";
  path: string;
  converter: FieldValueConverter;
}

/** Runs a registered System Converter over one Character (v2 only). */
export interface SystemConverterFieldMigrationRule extends FieldMigrationRuleBase {
  type: "systemConverter";
  converter: string;
}

export type FieldMigrationRule =
  | AddFieldMigrationRule
  | MoveFieldMigrationRule
  | RemoveFieldMigrationRule
  | ConvertFieldMigrationRule;

export type FieldMigrationRuleV2 =
  | FieldMigrationRule
  | SystemConverterFieldMigrationRule;

export type FieldMigrationPlan =
  | { $schema: typeof FIELD_MIGRATION_SCHEMA; rules: FieldMigrationRule[] }
  | { $schema: typeof FIELD_MIGRATION_SCHEMA_V2; rules: FieldMigrationRuleV2[] };

type JsonObject = { [key: string]: Json | undefined };

/** `<system>/<converter>@<version>`, for example `coc7e/keeper-companion-skills@1`. */
export const SYSTEM_CONVERTER_ID_PATTERN =
  /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*@[1-9][0-9]*$/;

export interface SystemConverterInput {
  /** The `fieldId` of the rule that runs the converter. */
  fieldId: string;
  /** A private copy of the Character data; the converter may mutate it. */
  data: JsonObject;
  /** A private copy of the Character's preserved data. */
  preservedData: JsonObject;
}

export interface SystemConverterIssue {
  path: string;
  message: string;
}

export type SystemConverterResult =
  | { success: true; data: JsonObject; preservedData: JsonObject }
  | { success: false; issues: SystemConverterIssue[] };

/**
 * A named, versioned conversion of one Character's data, written in the repo
 * for a built-in template whose change the declarative rules cannot express.
 *
 * Contract:
 * - Deterministic: the same input always yields the same output.
 * - Idempotent: converting its own output changes nothing. A published
 *   template's migration runs again on every later Publish, including on
 *   Characters it already converted. The runner checks this per Character and
 *   blocks Publish when a second run differs.
 * - Never overwrites a value the player set. It may rename or move entries,
 *   fill values still at an old default, and move removed values into
 *   preserved data; anything ambiguous stays as it was.
 * - A new behaviour gets a new id version; a published id never changes
 *   meaning.
 */
export interface SystemConverter {
  id: string;
  convert(input: SystemConverterInput): SystemConverterResult;
}

export interface SystemConverterRegistry {
  get(id: string): SystemConverter | undefined;
}

export function createSystemConverterRegistry(
  converters: readonly SystemConverter[]
): SystemConverterRegistry {
  const byId = new Map<string, SystemConverter>();
  for (const converter of converters) {
    if (!SYSTEM_CONVERTER_ID_PATTERN.test(converter.id)) {
      throw new Error(`System Converter id "${converter.id}" is not <system>/<name>@<version>.`);
    }
    if (byId.has(converter.id)) {
      throw new Error(`System Converter "${converter.id}" is registered twice.`);
    }
    byId.set(converter.id, converter);
  }
  return { get: (id) => byId.get(id) };
}

export interface FieldMigrationOptions {
  /** Converters a `systemConverter` rule may name. */
  systemConverters?: SystemConverterRegistry;
  /**
   * `systemConverter` rules run code shipped with Skald, so only built-in
   * templates may use them. Defaults to false.
   */
  allowSystemConverters?: boolean;
}

/** Shape stored across template_version_migrations.converter_version + rules. */
export interface StoredFieldMigrationDefinition {
  converterVersion: string;
  rules: Json;
}

export interface PreservedFieldValue {
  sourcePath: string;
  value: Json;
}

export interface FieldMigrationIssue {
  code:
    | "invalid_plan"
    | "source_missing"
    | "target_exists"
    | "parent_not_object"
    | "conversion_failed"
    | "preserved_conflict"
    | "system_converter_not_allowed"
    | "system_converter_failed"
    | "system_converter_not_idempotent";
  ruleIndex: number;
  fieldId?: string;
  path: string;
  message: string;
}

export type FieldMigrationResult =
  | {
      success: true;
      data: { [key: string]: Json | undefined };
      preservedData: { [key: string]: Json | undefined };
      issues: [];
    }
  | {
      success: false;
      issues: FieldMigrationIssue[];
    };

const FIELD_PATH_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const FIELD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const JSON_NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const CONVERTERS = new Set<FieldValueConverter>([
  "string-to-number@1",
  "number-to-string@1",
  "string-to-boolean@1",
  "boolean-to-string@1",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJson(value: unknown, seen = new Set<object>()): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);

  const valid = Array.isArray(value)
    ? value.every((item) => isJson(item, seen))
    : Object.values(value).every(
        (item) => item === undefined || isJson(item, seen)
      );
  seen.delete(value);
  return valid;
}

function cloneJson<T extends Json>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJson(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === undefined ? undefined : cloneJson(item as Json),
      ])
    ) as T;
  }
  return value;
}

function jsonEqual(left: Json, right: Json): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => jsonEqual(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          jsonEqual(left[key] as Json, right[key] as Json)
      )
    );
  }
  return false;
}

function ruleIssue(
  ruleIndex: number,
  path: string,
  message: string,
  fieldId?: string
): FieldMigrationIssue {
  return {
    code: "invalid_plan",
    ruleIndex,
    fieldId,
    path,
    message,
  };
}

function isValidFieldPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    FIELD_PATH_PATTERN.test(path) &&
    path.split(".").every((segment) => !UNSAFE_PATH_SEGMENTS.has(segment))
  );
}

export function validateFieldMigrationPlan(
  input: unknown,
  options: FieldMigrationOptions = {}
): { success: true; data: FieldMigrationPlan } | { success: false; issues: FieldMigrationIssue[] } {
  if (!isRecord(input)) {
    return { success: false, issues: [ruleIssue(-1, "$", "Migration plan must be an object.")] };
  }

  const issues: FieldMigrationIssue[] = [];
  const isV2 = input.$schema === FIELD_MIGRATION_SCHEMA_V2;
  if (input.$schema !== FIELD_MIGRATION_SCHEMA && !isV2) {
    issues.push(
      ruleIssue(
        -1,
        "$.$schema",
        `Expected ${FIELD_MIGRATION_SCHEMA} or ${FIELD_MIGRATION_SCHEMA_V2}.`
      )
    );
  }
  if (!Array.isArray(input.rules)) {
    issues.push(ruleIssue(-1, "$.rules", "Migration rules must be an array."));
    return { success: false, issues };
  }

  input.rules.forEach((rawRule, ruleIndex) => {
    const basePath = `$.rules[${ruleIndex}]`;
    if (!isRecord(rawRule)) {
      issues.push(ruleIssue(ruleIndex, basePath, "Rule must be an object."));
      return;
    }

    const fieldId =
      typeof rawRule.fieldId === "string" ? rawRule.fieldId : undefined;
    if (!fieldId || !FIELD_ID_PATTERN.test(fieldId)) {
      issues.push(
        ruleIssue(
          ruleIndex,
          `${basePath}.fieldId`,
          "fieldId must be a stable alphanumeric, hyphen, or underscore identifier."
        )
      );
    }

    const checkPath = (key: "path" | "from" | "to") => {
      const path = rawRule[key];
      if (!isValidFieldPath(path)) {
        issues.push(
          ruleIssue(
            ruleIndex,
            `${basePath}.${key}`,
            "Field path must use dot-separated object keys.",
            fieldId
          )
        );
      }
    };

    switch (rawRule.type) {
      case "add": {
        checkPath("path");
        const hasDefault = Object.hasOwn(rawRule, "defaultValue");
        const nullable = rawRule.nullable === true;
        if (hasDefault === nullable) {
          issues.push(
            ruleIssue(
              ruleIndex,
              basePath,
              "Add rule requires exactly one of defaultValue or nullable: true.",
              fieldId
            )
          );
        } else if (hasDefault && !isJson(rawRule.defaultValue)) {
          issues.push(
            ruleIssue(
              ruleIndex,
              `${basePath}.defaultValue`,
              "defaultValue must be JSON data.",
              fieldId
            )
          );
        }
        break;
      }
      case "move":
        checkPath("from");
        checkPath("to");
        if (rawRule.from === rawRule.to) {
          issues.push(
            ruleIssue(
              ruleIndex,
              basePath,
              "Move source and target must be different.",
              fieldId
            )
          );
        }
        if (
          typeof rawRule.from === "string" &&
          typeof rawRule.to === "string" &&
          (rawRule.from.startsWith(`${rawRule.to}.`) ||
            rawRule.to.startsWith(`${rawRule.from}.`))
        ) {
          issues.push(
            ruleIssue(
              ruleIndex,
              basePath,
              "Move source and target must not contain one another.",
              fieldId
            )
          );
        }
        break;
      case "remove":
        checkPath("path");
        break;
      case "convert":
        checkPath("path");
        if (!CONVERTERS.has(rawRule.converter as FieldValueConverter)) {
          issues.push(
            ruleIssue(
              ruleIndex,
              `${basePath}.converter`,
              "Converter is not registered or versioned.",
              fieldId
            )
          );
        }
        break;
      case "systemConverter":
        if (!isV2) {
          issues.push(
            ruleIssue(
              ruleIndex,
              `${basePath}.type`,
              `systemConverter rules require ${FIELD_MIGRATION_SCHEMA_V2}.`,
              fieldId
            )
          );
          break;
        }
        if (!options.allowSystemConverters) {
          issues.push({
            code: "system_converter_not_allowed",
            ruleIndex,
            fieldId,
            path: `${basePath}.type`,
            message: "Only built-in templates may use systemConverter rules.",
          });
        }
        if (
          typeof rawRule.converter !== "string" ||
          !options.systemConverters?.get(rawRule.converter)
        ) {
          issues.push(
            ruleIssue(
              ruleIndex,
              `${basePath}.converter`,
              "System Converter is not registered.",
              fieldId
            )
          );
        }
        break;
      default:
        issues.push(
          ruleIssue(
            ruleIndex,
            `${basePath}.type`,
            isV2
              ? "Rule type must be add, move, remove, convert, or systemConverter."
              : "Rule type must be add, move, remove, or convert.",
            fieldId
          )
        );
    }
  });

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: input as unknown as FieldMigrationPlan };
}

export function readStoredFieldMigration(
  stored: StoredFieldMigrationDefinition,
  options: FieldMigrationOptions = {}
): ReturnType<typeof validateFieldMigrationPlan> {
  return validateFieldMigrationPlan(
    {
      $schema: stored.converterVersion,
      rules: stored.rules,
    },
    options
  );
}

export function writeStoredFieldMigration(
  planInput: unknown,
  options: FieldMigrationOptions = {}
):
  | { success: true; data: StoredFieldMigrationDefinition }
  | { success: false; issues: FieldMigrationIssue[] } {
  const parsed = validateFieldMigrationPlan(planInput, options);
  if (!parsed.success) return parsed;
  return {
    success: true,
    data: {
      converterVersion: parsed.data.$schema,
      rules: cloneJson(parsed.data.rules as unknown as Json),
    },
  };
}

function readPath(root: JsonObject, path: string): { exists: boolean; value?: Json } {
  const segments = path.split(".");
  let current: Json | undefined = root;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { exists: false };
    }
    current = current[segment] as Json | undefined;
  }
  return current === undefined ? { exists: false } : { exists: true, value: current };
}

function writePath(
  root: JsonObject,
  path: string,
  value: Json
): "ok" | "target_exists" | "parent_not_object" {
  const segments = path.split(".");
  const last = segments.pop() as string;
  let current: JsonObject = root;
  for (const segment of segments) {
    const next = current[segment];
    if (next === undefined) {
      const child: JsonObject = {};
      current[segment] = child;
      current = child;
    } else if (isRecord(next)) {
      current = next as JsonObject;
    } else {
      return "parent_not_object";
    }
  }
  if (Object.hasOwn(current, last)) return "target_exists";
  current[last] = cloneJson(value);
  return "ok";
}

function replacePath(root: JsonObject, path: string, value: Json): void {
  const segments = path.split(".");
  const last = segments.pop() as string;
  let current = root;
  for (const segment of segments) {
    current = current[segment] as JsonObject;
  }
  current[last] = cloneJson(value);
}

function deletePath(root: JsonObject, path: string): void {
  const segments = path.split(".");
  const last = segments.pop() as string;
  let current = root;
  for (const segment of segments) {
    current = current[segment] as JsonObject;
  }
  delete current[last];
}

function convertValue(
  value: Json,
  converter: FieldValueConverter
): { success: true; value: Json } | { success: false } {
  switch (converter) {
    case "string-to-number@1": {
      if (typeof value !== "string" || !JSON_NUMBER_PATTERN.test(value.trim())) {
        return { success: false };
      }
      const converted = Number(value.trim());
      return Number.isFinite(converted)
        ? { success: true, value: converted }
        : { success: false };
    }
    case "number-to-string@1":
      return typeof value === "number" && Number.isFinite(value)
        ? { success: true, value: String(value) }
        : { success: false };
    case "string-to-boolean@1":
      if (typeof value !== "string") return { success: false };
      if (value.trim().toLowerCase() === "true") return { success: true, value: true };
      if (value.trim().toLowerCase() === "false") return { success: true, value: false };
      return { success: false };
    case "boolean-to-string@1":
      return typeof value === "boolean"
        ? { success: true, value: String(value) }
        : { success: false };
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJson(value);
}

function runSystemConverter(
  converter: SystemConverter,
  fieldId: string,
  data: JsonObject,
  preservedData: JsonObject
): SystemConverterResult {
  const malformed = (message: string): SystemConverterResult => ({
    success: false,
    issues: [{ path: fieldId, message }],
  });
  try {
    const result: unknown = converter.convert({
      fieldId,
      data: cloneJson(data),
      preservedData: cloneJson(preservedData),
    });
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      return malformed("System Converter returned a malformed result.");
    }
    if (typeof (result as { then?: unknown }).then === "function") {
      return malformed("System Converter must be synchronous.");
    }
    const shaped = result as {
      success?: unknown;
      issues?: unknown;
      data?: unknown;
      preservedData?: unknown;
    };
    if (shaped.success === false) {
      const issues = shaped.issues;
      if (
        !Array.isArray(issues) ||
        issues.length === 0 ||
        !issues.every(
          (issue) =>
            typeof issue === "object" &&
            issue !== null &&
            typeof (issue as { path?: unknown }).path === "string" &&
            typeof (issue as { message?: unknown }).message === "string"
        )
      ) {
        return malformed("System Converter failed without reporting issues.");
      }
      return { success: false, issues: issues as SystemConverterIssue[] };
    }
    if (shaped.success !== true) {
      return malformed("System Converter returned a malformed result.");
    }
    if (!isJsonObject(shaped.data) || !isJsonObject(shaped.preservedData)) {
      return malformed("System Converter must return JSON objects for data and preserved data.");
    }
    return {
      success: true,
      data: cloneJson(shaped.data),
      preservedData: cloneJson(shaped.preservedData),
    };
  } catch (error) {
    return malformed(
      `System Converter threw: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Runs a `systemConverter` rule and checks that a second run changes nothing. */
function applySystemConverterRule(
  rule: SystemConverterFieldMigrationRule,
  ruleIndex: number,
  converter: SystemConverter,
  data: JsonObject,
  preservedData: JsonObject
):
  | { success: true; data: JsonObject; preservedData: JsonObject }
  | { success: false; issues: FieldMigrationIssue[] } {
  const failed = (
    issues: SystemConverterIssue[],
    code: FieldMigrationIssue["code"]
  ) => ({
    success: false as const,
    issues: issues.map((issue) => ({
      code,
      ruleIndex,
      fieldId: rule.fieldId,
      path: issue.path,
      message: issue.message,
    })),
  });

  const first = runSystemConverter(converter, rule.fieldId, data, preservedData);
  if (!first.success) return failed(first.issues, "system_converter_failed");
  const second = runSystemConverter(
    converter,
    rule.fieldId,
    first.data,
    first.preservedData
  );
  if (!second.success) return failed(second.issues, "system_converter_failed");
  if (
    !jsonEqual(first.data, second.data) ||
    !jsonEqual(first.preservedData, second.preservedData)
  ) {
    return failed(
      [
        {
          path: rule.fieldId,
          message: `System Converter ${rule.converter} changed its own output on a second run.`,
        },
      ],
      "system_converter_not_idempotent"
    );
  }
  return first;
}

export function applyFieldMigration(
  planInput: unknown,
  sourceData: JsonObject,
  existingPreservedData: JsonObject = {},
  options: FieldMigrationOptions = {}
): FieldMigrationResult {
  const parsed = validateFieldMigrationPlan(planInput, options);
  if (!parsed.success) return parsed;
  if (!isJson(sourceData) || !isRecord(sourceData) || !isJson(existingPreservedData)) {
    return {
      success: false,
      issues: [ruleIssue(-1, "$", "Character and preserved data must be JSON objects.")],
    };
  }

  let data = cloneJson(sourceData);
  let preservedData = cloneJson(existingPreservedData);
  const issues: FieldMigrationIssue[] = [];

  (parsed.data.rules as FieldMigrationRuleV2[]).forEach((rule, ruleIndex) => {
    if (rule.type === "systemConverter") {
      // Later rules see the converted data; a failed rule leaves it unchanged.
      const converter = options.systemConverters?.get(rule.converter);
      if (!converter) return; // validateFieldMigrationPlan already rejected it.
      const converted = applySystemConverterRule(
        rule,
        ruleIndex,
        converter,
        data,
        preservedData
      );
      if (!converted.success) {
        issues.push(...converted.issues);
        return;
      }
      data = converted.data;
      preservedData = converted.preservedData;
      return;
    }

    if (rule.type === "add") {
      const value = Object.hasOwn(rule, "defaultValue") ? rule.defaultValue : null;
      const writeResult = writePath(data, rule.path, value as Json);
      if (writeResult !== "ok") {
        issues.push({
          code: writeResult,
          ruleIndex,
          fieldId: rule.fieldId,
          path: rule.path,
          message:
            writeResult === "target_exists"
              ? "Add target already exists."
              : "Add target parent is not an object.",
        });
      }
      return;
    }

    if (rule.type === "move") {
      const source = readPath(data, rule.from);
      if (!source.exists) {
        issues.push({
          code: "source_missing",
          ruleIndex,
          fieldId: rule.fieldId,
          path: rule.from,
          message: "Move source does not exist.",
        });
        return;
      }
      const writeResult = writePath(data, rule.to, source.value as Json);
      if (writeResult !== "ok") {
        issues.push({
          code: writeResult,
          ruleIndex,
          fieldId: rule.fieldId,
          path: rule.to,
          message:
            writeResult === "target_exists"
              ? "Move target already exists."
              : "Move target parent is not an object.",
        });
        return;
      }
      deletePath(data, rule.from);
      return;
    }

    if (rule.type === "remove") {
      const source = readPath(data, rule.path);
      if (!source.exists) return;

      const removedFields = preservedData.removedFields;
      if (removedFields !== undefined && !isRecord(removedFields)) {
        issues.push({
          code: "preserved_conflict",
          ruleIndex,
          fieldId: rule.fieldId,
          path: "removedFields",
          message: "Preserved removedFields value is not an object.",
        });
        return;
      }

      const removedFieldsObject = (removedFields ?? {}) as JsonObject;
      const preservedValue: JsonObject = {
        sourcePath: rule.path,
        value: cloneJson(source.value as Json),
      };
      const existing = removedFieldsObject[rule.fieldId];
      if (existing !== undefined && !jsonEqual(existing, preservedValue)) {
        issues.push({
          code: "preserved_conflict",
          ruleIndex,
          fieldId: rule.fieldId,
          path: `removedFields.${rule.fieldId}`,
          message: "Removed field would overwrite different preserved data.",
        });
        return;
      }

      removedFieldsObject[rule.fieldId] = preservedValue;
      preservedData.removedFields = removedFieldsObject;
      deletePath(data, rule.path);
      return;
    }

    const source = readPath(data, rule.path);
    if (!source.exists) {
      issues.push({
        code: "source_missing",
        ruleIndex,
        fieldId: rule.fieldId,
        path: rule.path,
        message: "Conversion source does not exist.",
      });
      return;
    }
    const converted = convertValue(source.value as Json, rule.converter);
    if (!converted.success) {
      issues.push({
        code: "conversion_failed",
        ruleIndex,
        fieldId: rule.fieldId,
        path: rule.path,
        message: `Value is incompatible with ${rule.converter}.`,
      });
      return;
    }
    replacePath(data, rule.path, converted.value);
  });

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data, preservedData, issues: [] };
}
