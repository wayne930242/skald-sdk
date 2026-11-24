import * as v from 'valibot';
import { GameDataMetaSchema, LocalizableItemSchema } from '../base';

// ============================================================================
// CoC7e Occupation
// ============================================================================

const OccupationSkillChoiceSchema = v.object({
  type: v.picklist(['list', 'group', 'any']),
  options: v.optional(v.array(v.string())),
  group: v.optional(v.string()),
  count: v.number(),
});

const OccupationSkillsSchema = v.object({
  fixed: v.optional(v.array(v.string())),
  choices: v.optional(v.array(OccupationSkillChoiceSchema)),
  personal: v.optional(v.number()),
});

export const OccupationSchema = v.object({
  ...LocalizableItemSchema.entries, // id, name?
  creditMin: v.optional(v.number()),
  creditMax: v.optional(v.number()),
  skillPointFormula: v.optional(v.string()),
  skills: v.optional(OccupationSkillsSchema),
});

// Array format (legacy, no $schema)
export const OccupationsArraySchema = v.array(OccupationSchema);

// Master format with $schema
export const OccupationsMasterSchema = v.object({
  ...GameDataMetaSchema.entries,
  occupations: v.array(OccupationSchema),
});

export type Occupation = v.InferOutput<typeof OccupationSchema>;
export type OccupationsMaster = v.InferOutput<typeof OccupationsMasterSchema>;
