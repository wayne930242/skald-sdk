import type { FateSkillPyramidField } from "@skald/types/schema";
import { FATE_DEFAULT_REFRESH, FATE_FREE_STUNTS, type FateCharacterData } from "../domain/character";
import { fateConditionBoxKey } from "../domain/harm";
import { readFateResources, readFateStunts } from "../domain/normalize";
import type { FatePresetCatalog } from "../domain/presets";
import { projectFatePlayAspects, projectFatePlaySkills, type FatePlayAspect, type FatePlaySkill } from "../sheet/play/play-model";
import { projectFateSheet } from "../sheet/presets/sheet-state";
import { stuntProse } from "../sheet/stunts/commands";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function buildFatePrintModel(data: FateCharacterData, skillsField: FateSkillPyramidField | undefined, catalog: FatePresetCatalog, blanks: boolean) {
  const { roster, rules, harm, injuries } = projectFateSheet(data, catalog);
  const resources = readFateResources(data);
  const { permanent, held } = projectFatePlayAspects(data, "unknown");
  // The print path has no viewer. Keep only kind/placeholder for secrets, never text, custom
  // label, legacy conflict, or a user-provided ID in the printable representation.
  const saved = [...permanent, ...held].map(({ kind, label, text, freeInvokes, hidden }) => ({
    kind, label: hidden ? undefined : label, text: hidden ? "" : text.trim(),
    freeInvokes: hidden ? 0 : freeInvokes, hidden,
    invokeBoxes: hidden ? 0 : Math.min(freeInvokes, 3),
  }));
  const order = ["highConcept", "trouble", "relationship", "free", "situation", "boost"] as const satisfies readonly FatePlayAspect["kind"][];
  const aspects = order.flatMap(kind => {
    const rows = saved.filter(row => row.kind === kind);
    const minimum = kind === "boost" ? 0 : kind === "free" ? 2 : 1;
    return [...rows, ...Array.from({ length: Math.max(0, minimum - rows.length) }, () => ({
      kind, label: undefined, text: "", freeInvokes: 0, hidden: false, invokeBoxes: kind === "situation" ? 3 : 0,
    }))];
  });

  const allocation = rules.allocation;
  const stockNames = new Map(skillsField?.defaultSkills?.map(skill => [skill.id, skill.name]));
  const byRank = new Map<number, (FatePlaySkill & { stockName?: string })[]>();
  for (const skill of projectFatePlaySkills(data, skillsField, roster.active)) {
    const at = byRank.get(skill.rating) ?? [];
    at.push({ ...skill, stockName: stockNames.get(skill.id) });
    byRank.set(skill.rating, at);
  }
  const shape = new Map(allocation.kind === "shape" ? allocation.slots.map(({ rank, count }) => [rank, count]) : []);
  const explicitZero = roster.active.filter(skill => skill.rating === 0 && skill.explicit).length;
  const ranks = new Set([...byRank.keys(), ...shape.keys()]);
  const rungs = [...ranks].sort((a, b) => b - a).map(rating => {
    const skills = byRank.get(rating) ?? [];
    const filled = rating === 0 ? explicitZero : skills.length;
    return { rating, skills, blanks: Math.max(0, (shape.get(rating) ?? 0) - filled) };
  });

  const identity = { name: text(data.name), player: text(data.player), description: text(data.description), portrait: text(data.portrait) };
  const extras = text(data.extras);
  const notes = text(data.notes);
  const stunts = readFateStunts(data).map(row => ({ id: row.id, title: text(row.title), text: text(stuntProse(row)), oncePerSession: row.oncePerSession }))
    .filter(row => row.title || row.text);
  // The toolbar's pencil-space switch does not turn a populated character into a blank sheet.
  const blankSheet = !Object.values(identity).some(Boolean) && !extras && !notes && !stunts.length
    && !saved.some(row => row.hidden || row.text || row.label || row.freeInvokes)
    && !roster.active.some(skill => skill.explicit || skill.custom)
    && !harm.active.length && !harm.legacyExtraMild
    && resources.effectiveRefresh === FATE_DEFAULT_REFRESH;
  const pencil = blankSheet || blanks;
  const maxStress = Math.max(rules.stress.defaultBoxes, ...rules.stress.thresholds.map(({ boxes }) => boxes));
  const optionalSlots = pencil && rules.injuries.kind === "consequences"
    ? rules.injuries.extraSlots.filter(slot => !harm.slots.some(active => active.id === slot.id))
    : [];

  return {
    identity,
    aspects,
    allocation: allocation.id,
    rungs,
    stunts,
    resources: { ...resources, freeStunts: FATE_FREE_STUNTS },
    printRefresh: blankSheet ? null : resources.effectiveRefresh,
    stress: harm.stress.map(track => ({
      id: track.id, marks: Array.from({ length: track.capacity }, (_, i) => track.marks.includes(i + 1)),
      optionalBoxes: pencil ? maxStress - track.capacity : 0,
    })),
    injuryKind: harm.injuryKind,
    consequences: [
      ...harm.slots.map(slot => ({ ...slot, optional: false })),
      ...optionalSlots.map(({ id, value }) => ({ id, value, optional: true, occupied: false, text: "", blocked: null })),
    ],
    legacyExtraMild: harm.legacyExtraMild,
    conditions: harm.conditions.map(condition => ({
      id: condition.id, value: condition.value,
      boxes: condition.boxes.map(box => {
        const key = fateConditionBoxKey(condition.id, box.index);
        const custom = injuries.conditions[key]?.text;
        return { index: box.index, marked: box.marked, text: custom === key ? "" : text(custom), ...(box.extra ? { track: box.hitKinds?.[0] } : {}) };
      }),
    })),
    extras,
    notes,
  };
}

export type FatePrintModel = ReturnType<typeof buildFatePrintModel>;
