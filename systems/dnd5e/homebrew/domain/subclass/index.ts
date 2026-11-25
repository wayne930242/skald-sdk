export * from "./form";
export * from "./parents";
export * from "./slots";
import { empty, issues } from "./form";
import { toRows } from "./generate";
import { fromRows, rowsOf, plan } from "./plan";
/** fromRows(subclassPayload, featureRecords, ctx): SC2 supplies the same parent, names, labels and sibling feature ids used for generation. Open read-only unless lossless. */
export const subclassCodec = { empty, issues, toRows, fromRows, rowsOf, plan };
