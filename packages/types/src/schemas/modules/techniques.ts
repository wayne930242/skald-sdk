import * as v from 'valibot';
import { GameDataMetaSchema, LocalizableItemSchema } from '../base';

// ============================================================================
// Technique (a move a character can learn)
// ============================================================================

export const TechniqueSchema = v.object({
  ...LocalizableItemSchema.entries, // id, name?
  training: v.string(),
  approach: v.optional(v.string()),
  cost: v.optional(v.string()),
  rare: v.optional(v.boolean()),
});

export const TechniquesMasterSchema = v.object({
  ...GameDataMetaSchema.entries,
  techniques: v.array(TechniqueSchema),
});

export type Technique = v.InferOutput<typeof TechniqueSchema>;
export type TechniquesMaster = v.InferOutput<typeof TechniquesMasterSchema>;
