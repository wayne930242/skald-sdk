import Ajv from "ajv";

/** One place where a value does not match its JSON Schema. */
export interface ShapeProblem {
  /** Path segments from the validated value's root. */
  path: string[];
  reason: string;
}

interface AjvError {
  // ajv v6 names the location dataPath, v8 instancePath; read both so an
  // upgrade does not silently drop the location.
  dataPath?: string;
  instancePath?: string;
  keyword?: string;
  message?: string;
  params?: { additionalProperty?: string; propertyName?: string };
}

const MAX_SHAPE_PROBLEMS = 50;

/**
 * The every-problem pass (`allErrors`) builds one error object per mismatch
 * and its cost grows faster than the value: a 250 KB array of wrong items
 * takes about a minute. It therefore runs only on a value this small; a
 * larger invalid value gets the first problem alone.
 */
const DETAIL_PASS_MAX_NODES = 20_000;
const DETAIL_PASS_MAX_ARRAY_LENGTH = 1_000;

/** Whether a value is small enough for the every-problem pass. Stops counting at the limit. */
function fitsDetailPass(root: unknown): boolean {
  let nodes = 0;
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > DETAIL_PASS_MAX_ARRAY_LENGTH) return false;
      nodes += value.length;
      if (nodes > DETAIL_PASS_MAX_NODES) return false;
      for (const item of value) pending.push(item);
      continue;
    }
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      nodes += 1;
      if (nodes > DETAIL_PASS_MAX_NODES) return false;
      pending.push((value as Record<string, unknown>)[key]);
    }
  }
  return true;
}

function pointerSegments(pointer: string): string[] {
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function problemsOf(errors: AjvError[]): ShapeProblem[] {
  const seen = new Set<string>();
  const problems: ShapeProblem[] = [];
  for (const error of errors) {
    // "should match then schema" only repeats the branch's own errors.
    if (error.keyword === "if") continue;
    const path = pointerSegments(error.instancePath ?? error.dataPath ?? "");
    const extra = error.params?.additionalProperty;
    // ajv quotes author input in some messages (a property name, for one).
    const reason = extra
      ? `unknown property "${excerpt(extra, 80)}"`
      : excerpt(error.message ?? "does not match the schema", 200);
    const key = `${path.join("/")}:${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({ path, reason });
    if (problems.length >= MAX_SHAPE_PROBLEMS) break;
  }
  return problems;
}

function excerpt(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * Compiles a draft-07 schema from `data/schemas/` into a checker that returns
 * the mismatches of a value with their paths, or an empty list when the value
 * conforms. The work is linear in the value: validity is decided by a pass
 * that stops at the first mismatch, and the pass that lists every mismatch
 * runs only on a value small enough for it.
 */
export function createShapeChecker(
  schema: object,
): (value: unknown) => ShapeProblem[] {
  // jsonPointers makes ajv v6 report "/steps/0/id" instead of ".steps[0].id".
  const conforms = new Ajv({ allErrors: false, jsonPointers: true }).compile(
    schema,
  );
  const everyProblem = new Ajv({ allErrors: true, jsonPointers: true }).compile(
    schema,
  );
  return (value) => {
    if (conforms(value)) return [];
    // A value that does not conform always yields a problem, whatever the
    // error list holds: an empty answer would read as "conforms".
    const first = problemsOf((conforms.errors ?? []) as AjvError[]);
    if (first.length === 0) {
      first.push({ path: [], reason: "does not match the schema" });
    }
    if (!fitsDetailPass(value)) return first;
    everyProblem(value);
    const problems = problemsOf((everyProblem.errors ?? []) as AjvError[]);
    return problems.length > 0 ? problems : first;
  };
}
