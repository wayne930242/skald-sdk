import {
  FATE_ASPECT_FORMAT,
  FATE_CONSEQUENCE_FIELDS,
  FATE_DEFAULT_REFRESH,
  FATE_FREE_STUNTS,
  FATE_PERMANENT_ASPECT_SLOTS,
  type FateAspectKind,
  type FateAspectList,
  type FateAspectRow,
  type FateCharacterData,
  type FateInjury,
  type FateInjuryMetadata,
  type FateSeverity,
  type FateSplitStressField,
  type FateStuntRow,
} from "./character";

export function fateRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const text = (value: unknown): string => typeof value === "string" ? value : "";
const hasText = (value: unknown): boolean => text(value).trim() !== "";
const integer = (value: unknown, minimum: number): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : undefined;

const aspectSlots = Object.entries(FATE_PERMANENT_ASPECT_SLOTS);
const aspectKinds = new Set<string>([...Object.values(FATE_PERMANENT_ASPECT_SLOTS), "situation", "boost"]);
const stockAspectLabels: Readonly<Record<string, readonly string[]>> = {
  highConcept: ["High Concept", "高概念", "{{i18n:aspect.highConcept}}"],
  trouble: ["Trouble", "麻煩", "{{i18n:aspect.trouble}}"],
  relationship: ["Relationship", "關係", "{{i18n:aspect.relationship}}"],
  free: ["Free Aspect", "自由形象", "其他形象", "{{i18n:aspect.free}}", "New Aspect", "新形象", "{{i18n:aspect.new}}"],
  situation: ["Situation Aspect", "情境形象"],
  boost: ["Boost", "助益", "推助"],
};

function aspectId(row: Record<string, unknown>): string | undefined {
  return typeof row.id === "string" && hasText(row.id) && (row.kind === undefined || (typeof row.kind === "string" && aspectKinds.has(row.kind)))
    ? row.id : undefined;
}

function aspectKind(row: Record<string, unknown>, id: string): FateAspectKind {
  if (typeof row.kind === "string" && aspectKinds.has(row.kind)) return row.kind as FateAspectKind;
  return aspectSlots.find(([slot]) => slot === id)?.[1] ?? "free";
}

function aspectRow(row: Record<string, unknown>, id: string, flatText: string, canonicalList: boolean, unmarked = true): FateAspectRow {
  const kind = aspectKind(row, id);
  const legacyLabel = text(row.label);
  const labelOverride = typeof row.labelOverride === "string"
    ? row.labelOverride
    : !canonicalList && typeof row.text !== "string" && hasText(legacyLabel) && !stockAspectLabels[kind]?.includes(legacyLabel)
      ? legacyLabel : "";
  const result: FateAspectRow = {
    ...row, id, kind,
    // The old writer replaces the wrapper but spreads the row, leaving text stale.
    text: typeof row.text === "string"
      ? unmarked && row.secret !== true && typeof row.value === "string" ? row.value : row.text
      : hasText(row.value) ? text(row.value) : canonicalList ? "" : flatText,
    freeInvokes: kind === "boost" ? 1 : integer(row.freeInvokes, 0) ?? 0,
    secret: row.secret === true,
  };
  if (hasText(labelOverride)) result.labelOverride = labelOverride;
  else delete result.labelOverride;
  return result;
}

interface FateAspectConflict {
  id: string;
  flatText: string;
}

/** A projection only. `conflicts` must go through the same visibility filter as the active rows. */
export function readFateAspects(data: FateCharacterData): { rows: FateAspectRow[]; conflicts: FateAspectConflict[] } {
  const wrapper = fateRecord(data.aspects);
  const stored = rawAspectList(data);
  const canonical = wrapper.format === FATE_ASPECT_FORMAT;
  const rows: FateAspectRow[] = [];
  const conflicts: FateAspectConflict[] = [];
  const seen = new Set<string>();
  for (const raw of stored ?? []) {
    const row = fateRecord(raw);
    if (typeof row.id === "string") seen.add(row.id);
    const id = aspectId(row);
    if (!id) continue;
    const flatText = Object.hasOwn(FATE_PERMANENT_ASPECT_SLOTS, id) ? text(data[id]) : "";
    const active = aspectRow(row, id, flatText, canonical, !Object.hasOwn(wrapper, "format"));
    if (hasText(flatText) && hasText(active.text) && flatText !== active.text) {
      conflicts.push({ id, flatText });
    }
    rows.push(active);
  }
  if (!canonical) {
    for (const [id] of aspectSlots) {
      const flatText = text(data[id]);
      if (!seen.has(id) && (stored === undefined || hasText(flatText))) {
        rows.push(aspectRow({}, id, flatText, false));
      }
    }
  }
  return { rows, conflicts };
}

function rawAspectList(data: FateCharacterData): unknown[] | undefined {
  const list = Array.isArray(data.aspects) ? data.aspects : fateRecord(data.aspects).aspects;
  return Array.isArray(list) ? list : undefined;
}

/** Match edited rows to their raw extras by ID without discarding opaque list entries. */
function mergeRows<T extends Record<string, unknown> & { id: string }>(
  stored: readonly unknown[], next: readonly T[], knownId: (row: Record<string, unknown>) => string | undefined,
  merge: (raw: Record<string, unknown>, row: T) => Record<string, unknown> = (raw, row) => ({ ...raw, ...row }),
): unknown[] {
  const ids = stored.map(raw => knownId(fateRecord(raw)));
  const originals = new Map<string, Record<string, unknown>[]>();
  ids.forEach((id, index) => {
    if (id === undefined) return;
    const raw = fateRecord(stored[index]);
    const group = originals.get(id);
    if (group) group.push(raw);
    else originals.set(id, [raw]);
  });
  const edited = next.map(row => merge(originals.get(row.id)?.shift() ?? {}, row));
  let index = 0;
  const result = stored.flatMap((raw, slot) => ids[slot] === undefined ? [raw] : index < edited.length ? [edited[index++]] : []);
  return [...result, ...edited.slice(index)];
}

/** Called inside the host's functional setData; the format marker makes removals durable. */
export function updateFateAspects(
  data: FateCharacterData, update: (rows: readonly FateAspectRow[]) => readonly FateAspectRow[],
  stockLabel: (kind: FateAspectKind) => string = kind => stockAspectLabels[kind][0],
): FateCharacterData {
  const { rows } = readFateAspects(data);
  const next = update(rows);
  if (next.length === rows.length && next.every((row, index) => row === rows[index])) return data;
  // An actually empty list stays empty in v2. b73c8f93 will show default placeholders
  // for an empty array; a fake row would be visible/editable there and pollute saved data.
  const stored = mergeRows(rawAspectList(data) ?? [], next, aspectId, (raw, row) => {
    // The old renderer has no audience filter: do not mirror secret text or custom labels.
    const merged = { ...raw, ...row, value: row.secret ? "" : row.text, label: (row.secret ? undefined : row.labelOverride) ?? stockLabel(row.kind) };
    if (row.labelOverride === undefined) delete merged.labelOverride;
    return merged;
  });
  const aspects: FateAspectList = { ...fateRecord(data.aspects), format: FATE_ASPECT_FORMAT, aspects: stored };
  return { ...data, aspects };
}

const STUNT_TEXT_FIELDS = ["customText", "title", "quality", "skill", "action", "circumstance", "feat", "limitation", "because", "effect", "limit", "skillId", "usedSessionId"] as const;

function stuntId(row: Record<string, unknown>): string | undefined {
  return typeof row.id === "string" && hasText(row.id) && (row.type === "custom" || row.type === "bonus" || row.type === "rule-change")
    ? row.id : undefined;
}

export function readFateStunts(data: FateCharacterData): FateStuntRow[] {
  const list = fateRecord(data.stunts).stunts;
  if (!Array.isArray(list)) return [];
  return list.flatMap(value => {
    const row = fateRecord(value);
    const id = stuntId(row);
    if (!id) return [];
    const result: FateStuntRow = { ...row, id, type: row.type as FateStuntRow["type"] };
    for (const key of STUNT_TEXT_FIELDS) {
      if (typeof result[key] !== "string") delete result[key];
    }
    if (typeof result.oncePerSession !== "boolean") delete result.oncePerSession;
    return [result];
  });
}

export function updateFateStunts(data: FateCharacterData, update: (rows: readonly FateStuntRow[]) => readonly FateStuntRow[]): FateCharacterData {
  const rows = readFateStunts(data);
  const next = update(rows);
  if (next.length === rows.length && next.every((row, index) => row === rows[index])) return data;
  const wrapper = fateRecord(data.stunts);
  const stored = Array.isArray(wrapper.stunts) ? wrapper.stunts : [];
  const stunts = mergeRows(stored, next, stuntId, (raw, row) => {
    const merged = { ...raw, ...row };
    for (const key of [...STUNT_TEXT_FIELDS, "oncePerSession"] as const) {
      if (row[key] === undefined) delete merged[key];
    }
    return merged;
  });
  return { ...data, stunts: { ...wrapper, stunts } };
}

export function isFateStuntNonblank(row: FateStuntRow): boolean {
  return [row.customText, row.quality, row.circumstance, row.feat, row.limitation, row.because, row.effect, row.limit].some(hasText);
}

export function readFateResources(data: FateCharacterData) {
  const stored = fateRecord(data.fateV2).refresh;
  const config = fateRecord(stored);
  const legacyRefresh = integer(data.refresh, 1);
  const baseRefresh = integer(config.base, 1) ?? FATE_DEFAULT_REFRESH;
  const earnedRefresh = integer(config.earned, 0) ?? 0;
  // A legacy nondefault value was explicit saved effective refresh, not a new base.
  // Once v2 refresh accounting exists the compatibility field is just a mirror.
  const refreshOverride = integer(config.override, 1) ?? (
    stored === undefined && legacyRefresh !== FATE_DEFAULT_REFRESH ? legacyRefresh : undefined
  );
  const stuntCount = readFateStunts(data).filter(isFateStuntNonblank).length;
  const stuntCost = Math.max(0, stuntCount - FATE_FREE_STUNTS);
  // The refresh the rules give, an override aside (B-024's auto value).
  const autoRefresh = Math.max(1, baseRefresh + earnedRefresh - stuntCost);
  const effectiveRefresh = refreshOverride ?? autoRefresh;
  return { fatePoints: integer(data.fatePoints, 0) ?? effectiveRefresh, baseRefresh, earnedRefresh, refreshOverride, autoRefresh, effectiveRefresh, stuntCount, stuntCost };
}

/**
 * Sets (a number) or clears (`undefined`) the player's refresh override at `fateV2.refresh.override`,
 * keeping the accounting (base, earned) and the legacy `refresh` mirror. An override is a whole
 * number of at least 1, like every effective refresh. Clearing also ends a legacy saved refresh,
 * which counts as an override only while no v2 refresh exists.
 */
export function setFateRefreshOverride(data: FateCharacterData, override: number | undefined): FateCharacterData {
  if (override !== undefined && !Number.isFinite(override)) return data;
  const resources = readFateResources(data);
  const next = override === undefined ? undefined : Math.max(1, Math.round(override));
  if (next === resources.refreshOverride && fateRecord(data.fateV2).refresh !== undefined) return data;
  const fateV2 = fateRecord(data.fateV2);
  const refresh: Record<string, unknown> = { ...fateRecord(fateV2.refresh), base: resources.baseRefresh, earned: resources.earnedRefresh };
  if (next === undefined) delete refresh.override;
  else refresh.override = next;
  const updated = { ...data, fateV2: { ...fateV2, refresh } };
  // The balance stays as shown (a missing one defaults to the refresh), and `refresh` mirrors it.
  return { ...updated, fatePoints: resources.fatePoints, refresh: readFateResources(updated).effectiveRefresh };
}

const STRESS_KEY = /^stress(\d+)$/;

export function readFateStress(value: unknown): number[] {
  const indices: unknown[] = Array.isArray(value) ? value : Object.entries(fateRecord(value)).flatMap(([key, marked]) => {
    const match = STRESS_KEY.exec(key);
    return match && marked === true ? [Number(match[1])] : [];
  });
  return [...new Set(indices.filter((n): n is number => integer(n, 1) !== undefined))].sort((a, b) => a - b);
}

export function updateFateSplitStress(data: FateCharacterData, field: FateSplitStressField, update: (marks: readonly number[]) => readonly number[]): FateCharacterData {
  const marks = readFateStress(data[field]);
  const next = readFateStress(update(marks));
  if (next.length === marks.length && next.every((mark, index) => mark === marks[index])) return data;
  const extras = Object.entries(fateRecord(data[field])).filter(([key, value]) => {
    const match = STRESS_KEY.exec(key);
    return !match || integer(Number(match[1]), 1) === undefined || typeof value !== "boolean";
  });
  if (!extras.length) return { ...data, [field]: next };
  const fateV2 = fateRecord(data.fateV2);
  const legacyStress = fateRecord(fateV2.legacyStress);
  return { ...data, [field]: next, fateV2: {
    ...fateV2, legacyStress: { ...legacyStress, [field]: { ...fateRecord(legacyStress[field]), ...Object.fromEntries(extras) } },
  } };
}

export function readFateInjury(injuryText: string, stored: unknown): FateInjury {
  const raw = fateRecord(stored);
  if (!hasText(injuryText) || raw.injuryText !== injuryText || typeof raw.injuryId !== "string" || !hasText(raw.injuryId)) {
    return { text: injuryText };
  }
  const metadata: FateInjuryMetadata = { injuryId: raw.injuryId, injuryText };
  if (typeof raw.externalClaim === "boolean") metadata.externalClaim = raw.externalClaim;
  const recovery = fateRecord(raw.recovery);
  const boundary = recovery.boundary;
  const treatedAtSequence = integer(recovery.treatedAtSequence, 0);
  if ((boundary === "scene" || boundary === "session" || boundary === "majorMilestone") && treatedAtSequence !== undefined) {
    metadata.recovery = { boundary, treatedAtSequence };
  }
  return { text: injuryText, metadata };
}

export function readFateHarm(data: FateCharacterData) {
  const harm = fateRecord(fateRecord(data.fateV2).harm);
  const metadata = fateRecord(harm.consequences);
  const extraMild = fateRecord(harm.extraMild);
  const extraInjury = (value: unknown) => {
    const raw = fateRecord(value);
    return readFateInjury(text(raw.text), raw.metadata);
  };
  const legacyExtraMild = text(data.extraMildConsequence);
  return {
    physicalStress: readFateStress(data.physicalStress),
    mentalStress: readFateStress(data.mentalStress),
    unifiedStress: readFateStress(harm.unifiedStress),
    consequences: {
      mild: readFateInjury(text(data.mildConsequence), metadata.mild),
      moderate: readFateInjury(text(data.moderateConsequence), metadata.moderate),
      severe: readFateInjury(text(data.severeConsequence), metadata.severe),
    },
    legacyExtraMild: hasText(legacyExtraMild) ? legacyExtraMild : undefined,
    extraMild: { physical: extraInjury(extraMild.physical), mental: extraInjury(extraMild.mental) },
    conditions: Object.fromEntries(Object.entries(fateRecord(harm.conditions)).map(([id, injury]) => [id, extraInjury(injury)])),
  };
}

/** A manual replacement is not a treatment rename and must not inherit old metadata. */
export function replaceFateConsequence(data: FateCharacterData, severity: FateSeverity, replacement: string): FateCharacterData {
  const field = FATE_CONSEQUENCE_FIELDS[severity];
  if (replacement === data[field]) return data;
  const fateV2 = fateRecord(data.fateV2);
  const harm = fateRecord(fateV2.harm);
  const consequences = fateRecord(harm.consequences);
  if (!Object.hasOwn(consequences, severity)) return { ...data, [field]: replacement };
  const next = { ...consequences };
  delete next[severity];
  return { ...data, [field]: replacement, fateV2: { ...fateV2, harm: { ...harm, consequences: next } } };
}
