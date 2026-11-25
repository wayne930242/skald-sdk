import * as v from 'valibot';
import { GameDataMetaSchema } from '../base';

// ============================================================================
// Playbook (a character archetype with its own moves)
// ============================================================================

// Legacy format: inline multilang { "en": "...", "zh-TW": "..." }
// New format: simple string (uses i18n messages for localization)
const LocalizedTextSchema = v.union([
  v.string(),
  v.record(v.string(), v.string()),
]);

const PlaybookPrincipleSchema = v.object({
  id: v.string(),
  name: v.optional(LocalizedTextSchema),
  description: v.optional(LocalizedTextSchema),
});

const PlaybookMoveSchema = v.object({
  id: v.string(),
  name: v.optional(LocalizedTextSchema),
  description: v.optional(LocalizedTextSchema),
  statBonus: v.optional(v.record(v.string(), v.number())),
});

const PlaybookStatsSchema = v.object({
  creativity: v.optional(v.number()),
  focus: v.optional(v.number()),
  harmony: v.optional(v.number()),
  passion: v.optional(v.number()),
});

export const PlaybookSchema = v.object({
  id: v.string(),
  name: v.optional(LocalizedTextSchema),
  description: v.optional(LocalizedTextSchema),
  coreConcept: v.optional(v.array(v.string())),
  principles: v.optional(v.object({
    negative: v.optional(PlaybookPrincipleSchema),
    positive: v.optional(PlaybookPrincipleSchema),
  })),
  balanceMoment: v.optional(LocalizedTextSchema),
  defaultStats: v.optional(PlaybookStatsSchema),
  specialAbility: v.optional(v.object({
    id: v.string(),
    name: v.optional(LocalizedTextSchema),
    description: v.optional(LocalizedTextSchema),
    fields: v.optional(v.array(v.unknown())),
  })),
  moves: v.optional(v.array(PlaybookMoveSchema)),
  uniqueTechnique: v.optional(v.object({
    id: v.string(),
    name: v.optional(LocalizedTextSchema),
    type: v.optional(v.string()),
    description: v.optional(LocalizedTextSchema),
  })),
});

export const PlaybooksMasterSchema = v.object({
  ...GameDataMetaSchema.entries,
  playbooks: v.array(PlaybookSchema),
});

export type Playbook = v.InferOutput<typeof PlaybookSchema>;
export type PlaybooksMaster = v.InferOutput<typeof PlaybooksMasterSchema>;
