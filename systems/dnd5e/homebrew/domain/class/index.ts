export * from "./form";
export { asiLevels, builtinChassis, copyFrom, featureTable, generatedFeatures, proficiencyAt, reservedSlugs, slotsAt, type GeneratedFeature } from "./chassis";
export { EN_TABLE_LABELS, toRows } from "./generate";
export { fromRows, plan, rowsOf } from "./plan";
import { copyFrom } from "./chassis";
import { empty, issues } from "./form";
import { toRows } from "./generate";
import { fromRows, plan, rowsOf } from "./plan";

/**
 * The class builder's codec (CLASS-IMPL §2.4): `toRows` gives the class row then its generated and
 * authored feature rows; `fromRows(classPayload, rowsOf(key, all), ctx)` reads a form back (open
 * read-only unless lossless); `plan` lists the writes and deletes of a save.
 */
export const classCodec = { empty, copyFrom, issues, toRows, fromRows, rowsOf, plan };
