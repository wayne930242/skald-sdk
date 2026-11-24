/**
 * A spell's stat line in the spellbook (school · casting time · range · components · duration),
 * from the resolved entry's `meta` and the sheet row. Pure; the caller gives the labels.
 */
import { text } from "../sheet/play/play-model";
import type { Row } from "./print-model";

export interface SpellStatLabels {
  school: (code: string) => string | null;
  /** `duration.<key>` of the print catalog with `amount` or `time`. */
  duration: (key: string, values?: Record<string, string | number>) => string;
}

export interface SpellStats {
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
}

const UNITS = new Set(["round", "minute", "hour", "day"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 5etools `meta.duration` (instant, timed with or without Concentration, permanent, special). */
export function durationText(duration: unknown, labels: SpellStatLabels): string {
  if (!Array.isArray(duration)) return "";
  return duration
    .filter(isRecord)
    .map((part) => {
      if (part.type === "instant") return labels.duration("instant");
      if (part.type === "special") return labels.duration("special");
      if (part.type === "permanent") {
        const ends = Array.isArray(part.ends) ? part.ends : [];
        return labels.duration(ends.includes("trigger") ? "permanentTrigger" : "permanent");
      }
      if (part.type === "timed" && isRecord(part.duration)) {
        const unit = text(part.duration.type);
        const amount = typeof part.duration.amount === "number" ? part.duration.amount : 1;
        if (!UNITS.has(unit)) return "";
        const time = labels.duration(unit, { amount });
        return part.concentration === true ? labels.duration("concentration", { time }) : time;
      }
      return "";
    })
    .filter(Boolean)
    .join(" / ");
}

/** V, S, M (material) as the books write them. */
export function componentsText(components: unknown, row: Row): string {
  if (!isRecord(components)) return row.material === true ? "M" : "";
  const parts: string[] = [];
  if (components.v === true) parts.push("V");
  if (components.s === true) parts.push("S");
  if (components.m === true || typeof components.m === "string") {
    const material = text(components.mText) || (typeof components.m === "string" ? components.m : "");
    parts.push(material ? `M (${material})` : "M");
  }
  return parts.join(", ");
}

/**
 * `castingTime` and `range` are the row's line in the viewer's locale (`spellLine`'s parts: game
 * data tokens for a built-in spell, the row's own text for a pack or custom one).
 */
export function spellStats(
  meta: Record<string, unknown> | null,
  row: Row,
  line: { castingTime: string; range: string },
  labels: SpellStatLabels,
): SpellStats {
  const school = meta && typeof meta.school === "string" ? labels.school(meta.school) ?? "" : "";
  return {
    school,
    castingTime: line.castingTime,
    range: line.range,
    components: componentsText(meta?.components, row),
    duration: meta ? durationText(meta.duration, labels) : "",
  };
}
