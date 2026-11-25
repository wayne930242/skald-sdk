/**
 * Fate Condensed's scene board preset (ADR 0017 §6c): zones, and situation aspects that are public
 * or secret, each on the scene or in one of the preset's zones. Pure and part of the SDK export;
 * the apply and export code that reaches the table lives in `../gm/`.
 */
import type { SceneBoardIssue, SceneBoardSummaryItem } from "@skald/sheet-sdk/modules/systems";

export const FATE_SCENE_BOARD_ID = "fate-condensed:scene-board";
export const FATE_SCENE_BOARD_LIMITS = { zones: 20, aspects: 50, zoneName: 80, aspectText: 200 } as const;

export interface FateSceneBoardAspect {
  readonly text: string;
  readonly secret: boolean;
  /** An index into `zones`; null puts the aspect on the scene. */
  readonly zone: number | null;
}

export interface FateSceneBoardPreset {
  readonly zones: readonly { readonly name: string }[];
  readonly aspects: readonly FateSceneBoardAspect[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseFateSceneBoard(raw: unknown): { board: FateSceneBoardPreset | null; issues: SceneBoardIssue[] } {
  const issues: SceneBoardIssue[] = [];
  const fail = (path: string, code: string) => ({ board: null, issues: [...issues, { path, code }] });
  if (!isRecord(raw) || !onlyKeys(raw, ["zones", "aspects"])) return fail("", "shape");
  const { zones: rawZones, aspects: rawAspects } = raw;
  if (!Array.isArray(rawZones) || rawZones.length > FATE_SCENE_BOARD_LIMITS.zones) return fail("zones", "count");
  if (!Array.isArray(rawAspects) || rawAspects.length > FATE_SCENE_BOARD_LIMITS.aspects) return fail("aspects", "count");
  if (rawZones.length + rawAspects.length === 0) return fail("", "empty");
  const zones: { name: string }[] = [];
  for (const [index, zone] of rawZones.entries()) {
    const name = isRecord(zone) && onlyKeys(zone, ["name"]) ? text(zone.name, FATE_SCENE_BOARD_LIMITS.zoneName) : null;
    if (name === null) return fail(`zones.${index}`, "zone");
    zones.push({ name });
  }
  const aspects: FateSceneBoardAspect[] = [];
  for (const [index, aspect] of rawAspects.entries()) {
    const path = `aspects.${index}`;
    if (!isRecord(aspect) || !onlyKeys(aspect, ["text", "secret", "zone"])) return fail(path, "aspect");
    const value = text(aspect.text, FATE_SCENE_BOARD_LIMITS.aspectText);
    if (value === null || typeof aspect.secret !== "boolean") return fail(path, "aspect");
    const zone = aspect.zone ?? null;
    if (zone !== null && (typeof zone !== "number" || !Number.isInteger(zone) || zone < 0 || zone >= zones.length)) {
      return fail(`${path}.zone`, "zone-ref");
    }
    aspects.push({ text: value, secret: aspect.secret, zone });
  }
  return { board: { zones, aspects }, issues };
}

export function summarizeFateSceneBoard(board: FateSceneBoardPreset): SceneBoardSummaryItem[] {
  return [
    ...board.zones.map((zone, index) => ({
      id: `zone:${index}`, labelKey: "sceneBoard.zone", values: { name: zone.name }, fingerprint: JSON.stringify(zone),
    })),
    ...board.aspects.map((aspect, index) => ({
      id: `aspect:${index}`, labelKey: aspect.secret ? "sceneBoard.secretAspect" : "sceneBoard.aspect",
      values: { text: aspect.text }, fingerprint: JSON.stringify(aspect),
    })),
  ];
}

/** A scene as the GM sees it, reduced to what a preset keeps (boosts and character aspects are not presets). */
export interface FateSceneBoardSource {
  readonly zones: readonly { readonly id: string; readonly name: string }[];
  readonly aspects: readonly {
    readonly kind: string;
    readonly scope: string;
    readonly zoneId?: string | null;
    readonly text: string;
    readonly secret: boolean;
  }[];
}

function presetAspects(scene: FateSceneBoardSource, zoneIndex: ReadonlyMap<string, number>) {
  return scene.aspects.filter((aspect) => aspect.kind === "situation"
    && (aspect.scope === "scene" || (aspect.scope === "zone" && zoneIndex.has(aspect.zoneId ?? ""))));
}

/** Which preset limit a scene exceeds, or null: a preset is refused, never cut, past them. */
export function fateSceneBoardOverflow(scene: FateSceneBoardSource): "zones" | "aspects" | null {
  if (scene.zones.length > FATE_SCENE_BOARD_LIMITS.zones) return "zones";
  const zoneIndex = new Map(scene.zones.map((zone, index) => [zone.id, index]));
  return presetAspects(scene, zoneIndex).length > FATE_SCENE_BOARD_LIMITS.aspects ? "aspects" : null;
}

/**
 * Exports an open scene as a preset: zones in order, situation aspects on the scene or a zone.
 * Nothing is cut: check `fateSceneBoardOverflow` first, and `parseFateSceneBoard` refuses an oversized result.
 */
export function exportFateSceneBoard(scene: FateSceneBoardSource): FateSceneBoardPreset {
  const zones = scene.zones;
  const zoneIndex = new Map(zones.map((zone, index) => [zone.id, index]));
  const aspects = presetAspects(scene, zoneIndex)
    .map((aspect) => ({ text: aspect.text, secret: aspect.secret, zone: aspect.scope === "zone" ? zoneIndex.get(aspect.zoneId!)! : null }));
  return { zones: zones.map(({ name }) => ({ name })), aspects };
}
