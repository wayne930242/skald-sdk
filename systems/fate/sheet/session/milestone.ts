import type { FateCharacterData as Card, FateSeverity } from "../../domain/character";
import type { FateCommandContext } from "../../domain/engine";
import {
  planFateMajorMilestone,
  planFateMinorMilestone,
  type FateLateralOption,
} from "../../domain/advancement";
import { fateBoundaries, type FateInjuryRef } from "../../domain/lifecycle";
import {
  fateRecord,
  readFateHarm,
  readFateResources,
  isFateStuntNonblank,
  readFateStunts,
  updateFateAspects,
  updateFateStunts,
} from "../../domain/normalize";
import { projectFateSkills, resolveFateRules, type FatePresetCatalog } from "../../domain/presets";
import { projectFatePlayAspects, type FateSecretAccess } from "../play/play-model";
import { sessionState } from "./commands";

export interface MilestoneDraft {
  kind: "minor" | "major";
  lateral: FateLateralOption | null;
  stuntText?: string;
  highConcept?: string;
  extremeRename?: string;
  increases?: Record<string, number>;
  beginRecovery?: Record<string, string>;
  clear?: string[];
  gm?: { refresh: boolean; secondSkillPoint: boolean };
}
export function milestoneState(
  card: Card,
  catalog: FatePresetCatalog,
  access: FateSecretAccess,
  editable: boolean,
) {
  const v = sessionState(card),
    r = readFateResources(card),
    harm = readFateHarm(card),
    { rules } = resolveFateRules(catalog, v.preset);
  const wrapper = fateRecord(card.skills),
    raw: unknown[] = Array.isArray(wrapper.skills) ? wrapper.skills : [];
  const rows = raw.map(fateRecord).flatMap((row) =>
    typeof row.id === "string"
      ? [
          {
            id: row.id,
            level: typeof row.level === "number" ? row.level : undefined,
            name: typeof row.name === "string" ? row.name : undefined,
          },
        ]
      : [],
  );
  const skills = projectFateSkills(
    {
      rows,
      order: Array.isArray(wrapper.skillOrder) ? wrapper.skillOrder : [],
      hidden: Array.isArray(wrapper.hiddenSkillIds) ? wrapper.hiddenSkillIds : [],
    },
    rules.skills,
    catalog,
  ).active;
  const aspects = projectFatePlayAspects(card, access).permanent.filter((a) => !a.hidden);
  const injuries: FateInjuryRef[] =
    rules.injuries.kind === "conditions"
      ? Object.entries(harm.conditions).flatMap(([key, injury]) => {
          const condition =
            rules.injuries.kind === "conditions" &&
            rules.injuries.conditions.find((c) => key.startsWith(`${c.id}:`));
          return condition && injury.text
            ? [{ key, ...injury, severity: condition.severity, renamable: false }]
            : [];
        })
      : Object.entries(harm.consequences).flatMap(([severity, injury]) =>
          injury.text
            ? [{ key: severity, severity: severity as FateSeverity, ...injury, renamable: true }]
            : [],
        );
  const extremeId = v.harm?.extreme?.aspectId;
  return {
    skills,
    aspects,
    injuries,
    stunts: readFateStunts(card).filter(isFateStuntNonblank),
    readOnly: !editable,
    refresh: {
      base: r.baseRefresh,
      earned: r.earnedRefresh,
      override: r.refreshOverride,
      nonblankStunts: r.stuntCount,
    },
    bankedSkillRanks: v.bankedSkillRanks ?? 0,
    boundaries: fateBoundaries(v),
    milestones: v.milestones,
    extremeAspectId: aspects.some((a) => a.id === extremeId) ? extremeId : undefined,
  };
}
/** Pure preview. Discarding the returned card has no effect on history, ranks or recovery. */
export function previewMilestone(
  card: Card,
  d: MilestoneDraft,
  catalog: FatePresetCatalog,
  access: FateSecretAccess,
  editable: boolean,
  ctx: FateCommandContext,
) {
  const state = milestoneState(card, catalog, access, editable),
    v = sessionState(card);
  if (
    (d.lateral?.kind === "rewriteStunt" || d.lateral?.kind === "purchaseStunt") &&
    !d.stuntText?.trim()
  )
    return { ok: false, reason: "blankText" } as const;
  // A legacy override is the effective refresh. Include an agreed GM increase before the purchase check.
  if (state.refresh.override !== undefined && d.kind === "major" && d.gm?.refresh)
    state.refresh.override += catalog.advancement.major.gmRefresh;
  const plan =
    d.kind === "minor"
      ? planFateMinorMilestone(state, d.lateral, catalog, ctx)
      : planFateMajorMilestone(state, d, catalog, ctx);
  if (!plan.ok) return plan;
  const { delta, entry } = plan;
  let next = updateFateAspects(card, (rows) =>
    rows.map((a) => (Object.hasOwn(delta.aspects, a.id) ? { ...a, text: delta.aspects[a.id] } : a)),
  );
  if (delta.rewriteStuntId)
    next = updateFateStunts(next, (rows) =>
      rows.map((s) => (s.id === delta.rewriteStuntId ? { ...s, customText: d.stuntText } : s)),
    );
  if (delta.purchaseStunt)
    next = updateFateStunts(next, (rows) => [
      ...rows,
      { id: ctx.operationId, type: "custom", customText: d.stuntText },
    ]);
  const wrapper = fateRecord(next.skills);
  const skills: unknown[] = Array.isArray(wrapper.skills) ? [...wrapper.skills] : [];
  for (const [id, level] of Object.entries(delta.skills)) {
    const idx = skills.findIndex((s) => fateRecord(s).id === id);
    if (idx < 0) skills.push({ id, level });
    else skills[idx] = { ...fateRecord(skills[idx]), level };
  }
  if (Object.keys(delta.skills).length) next = { ...next, skills: { ...wrapper, skills } };
  const harm = { ...v.harm };
  for (const key of [...Object.keys(delta.injuries.begin), ...delta.injuries.clear]) {
    const treatment = delta.injuries.begin[key];
    const injury = state.injuries.find((i) => i.key === key)!;
    if (injury.renamable) {
      next = { ...next, [`${injury.severity}Consequence`]: treatment?.text ?? "" };
      harm.consequences = { ...harm.consequences };
      if (treatment) harm.consequences[injury.severity] = treatment.metadata;
      else delete harm.consequences[injury.severity];
    } else {
      harm.conditions = { ...harm.conditions };
      if (treatment) harm.conditions[key] = treatment;
      else delete harm.conditions[key];
    }
  }
  if (delta.extremeText && harm.extreme)
    harm.extreme = { ...harm.extreme, text: delta.extremeText };
  const override = delta.purchaseStunt?.refreshOverride ?? state.refresh.override;
  const refresh = {
    ...v.refresh,
    base: state.refresh.base,
    earned: state.refresh.earned + delta.refreshEarnedDelta,
    ...(override !== undefined ? { override } : {}),
  };
  next = {
    ...next,
    fateV2: {
      ...v,
      harm,
      refresh,
      bankedSkillRanks: delta.bankedSkillRanks,
      majorMilestoneSequence: delta.majorMilestoneSequence ?? v.majorMilestoneSequence,
      milestones: [...v.milestones, entry],
      ledger: [
        ...v.ledger,
        { ...ctx, delta: 0, reason: d.kind === "major" ? "milestoneMajor" : "milestoneMinor" },
      ],
    },
  };
  return {
    ok: true as const,
    delta,
    card: {
      ...next,
      fatePoints: readFateResources(card).fatePoints,
      refresh: readFateResources(next).effectiveRefresh,
    },
  };
}
