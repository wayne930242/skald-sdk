/**
 * The system contract of scene board presets (ADR 0017, plan §1 and §6c): a System's opening
 * content for a scene board, shared through the Library as the `scene_board` kind and applied at a
 * table into its open scene. A System plugs in through one `SceneBoardPresetProvider`, registered
 * in `plugins/registry.scene-board.ts`; parse and summarize are pure, apply loads on demand.
 *
 * Nothing here touches Supabase or the environment: this is part of the sheet SDK boundary.
 */

/** The envelope schema of a stored preset (`library_item_versions.payload`). */
export const SCENE_BOARD_SCHEMA = "skald/scene-board/v1";

/** A stored preset: the envelope, the System it belongs to, and the provider's own board. */
export interface SceneBoardPresetEnvelope<B = unknown> {
  readonly schema: typeof SCENE_BOARD_SCHEMA;
  /** The System slug; a provider answers for the slugs it lists. */
  readonly system: string;
  readonly board: B;
}

/** A value a provider could not read, reported and never rewritten. */
export interface SceneBoardIssue {
  /** Where in the board, as a dotted path. */
  readonly path: string;
  readonly code: string;
}

/** One line of a preset's summary, for the review queue and pickers. */
export interface SceneBoardSummaryItem {
  readonly id: string;
  /** A message key in the provider's catalog. */
  readonly labelKey: string;
  readonly values?: Readonly<Record<string, string | number>>;
  /** A stable fingerprint of the part, for the review diff. */
  readonly fingerprint: string;
}

/** The host's answer to one command: the result, or a contract code (`unavailable` when unknown). */
export type SceneBoardCallResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code: string; readonly detail?: string };

/**
 * Where a preset applies: the table, its open scene, and the Library version it came from. The
 * provider derives each command's idempotency key from (sceneId, versionId, the board, index), so
 * the same user applying the same version into the same scene again replays the first run instead
 * of adding rows. Receipts are per actor: a second GM applying it adds its own set.
 */
export interface SceneBoardApplyTarget {
  readonly tableId: string;
  readonly sceneId: string;
  readonly versionId: string;
  /** Sends one of the System's table commands as the signed-in user. */
  call(rpc: string, args: Readonly<Record<string, unknown>>): Promise<SceneBoardCallResult>;
}

export type SceneBoardApplyResult =
  | { readonly ok: true; readonly commands: number }
  | { readonly ok: false; readonly code: string; readonly detail?: string; readonly applied: number };

export type SceneBoardApply<B> = (board: B, target: SceneBoardApplyTarget) => Promise<SceneBoardApplyResult>;

export interface SceneBoardPresetProvider<B = unknown> {
  readonly id: string;
  readonly protocolVersion: 1;
  readonly systemSlugs: readonly string[];
  /** Reads a stored board; null with issues when any part is unreadable (no partial presets). */
  parse(raw: unknown): { readonly board: B | null; readonly issues: readonly SceneBoardIssue[] };
  summarize(board: B): readonly SceneBoardSummaryItem[];
  loadApply(): Promise<SceneBoardApply<B>>;
}

export type SceneBoardEnvelopeParse =
  | { readonly ok: true; readonly envelope: SceneBoardPresetEnvelope; readonly provider: SceneBoardPresetProvider }
  | { readonly ok: false; readonly issues: readonly SceneBoardIssue[] };

/** Checks the envelope and hands the board to the provider for the envelope's System. */
export function parseSceneBoardEnvelope(
  raw: unknown,
  resolve: (system: string) => SceneBoardPresetProvider | undefined,
): SceneBoardEnvelopeParse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, issues: [{ path: "", code: "not-object" }] };
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== "schema" && key !== "system" && key !== "board")) {
    return { ok: false, issues: [{ path: "", code: "unknown-key" }] };
  }
  if (value.schema !== SCENE_BOARD_SCHEMA) return { ok: false, issues: [{ path: "schema", code: "schema" }] };
  if (typeof value.system !== "string") return { ok: false, issues: [{ path: "system", code: "system" }] };
  const provider = resolve(value.system);
  if (!provider || !provider.systemSlugs.includes(value.system)) return { ok: false, issues: [{ path: "system", code: "no-provider" }] };
  const parsed = provider.parse(value.board);
  if (parsed.board === null || parsed.issues.length) {
    return { ok: false, issues: parsed.issues.length ? parsed.issues : [{ path: "board", code: "invalid" }] };
  }
  return { ok: true, envelope: { schema: SCENE_BOARD_SCHEMA, system: value.system, board: parsed.board }, provider };
}
