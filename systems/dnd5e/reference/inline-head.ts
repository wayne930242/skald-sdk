/**
 * What follows an inline head ("Cantrips. Choose…", zh 「戲法：自選…」), the one rule the reference
 * renderer, the plain text (snapshots, play rows, print) and the snapshot reader share (B-001):
 *
 * - a head that ends in its own mark takes nothing more: a fullwidth one (「專長：」) no space,
 *   an ASCII one ("Feat:") a space;
 * - a zh head (any CJK in it, such as 「燃燒【危害】」 or 「魔法物品 A–Z」) takes 「：」, no space;
 * - any other head takes ". ".
 *
 * `normalizeInlineHead` reads a line saved under an older rule with this one.
 *
 * Pure, no imports: print and sheet chunks share it.
 */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function inlineHeadSeparator(head: string): string {
  if (/[：。！？]$/.test(head)) return "";
  if (/[.:!?]$/.test(head)) return " ";
  return CJK.test(head) ? "：" : ". ";
}

/** An older head with a fullwidth mark: 「專長：. x」 or 「專長： x」. */
const OLD_FULLWIDTH = /^(.{1,24}?[：。！？])\.? (?=\S)/;
/** An older zh head with a period: 「戲法. x」. A sentence mark in it means it is not a head. */
const OLD_PERIOD = /^([^。！？；.:!?]{1,24}?)\. (?=\S)/;

/**
 * A saved line (a pack row's snapshot, P7) read with today's heads: snapshots written before
 * B-001 gave a zh head a period (「戲法. x」) or a space after its fullwidth mark (「專長： x」).
 * Read only: the saved text is never rewritten. A list line keeps its "• ".
 */
export function normalizeInlineHead(line: string): string {
  const bullet = line.startsWith("• ") ? "• " : "";
  const rest = line.slice(bullet.length);
  const fullwidth = OLD_FULLWIDTH.exec(rest);
  if (fullwidth) return `${bullet}${fullwidth[1]}${rest.slice(fullwidth[0].length)}`;
  const period = OLD_PERIOD.exec(rest);
  if (period && CJK.test(period[1])) return `${bullet}${period[1]}${inlineHeadSeparator(period[1])}${rest.slice(period[0].length)}`;
  return line;
}
