import { cn } from "@skald/sheet-sdk/lib/utils";
import { normalizeInlineHead } from "./inline-head";

/**
 * A named item's title, as entries-to-text writes it (`inline-head.ts`, at most 24 characters):
 * "Name. text", "Feat: text", or zh 「戲法：text」 with no space. Older snapshots have a space after
 * a fullwidth mark (「專長： text」), a period after it (「專長：. text」) or a period after a zh
 * name (「戲法. text」); all still read. A fullwidth 「。！？」 without a space ends a sentence, not
 * a title.
 */
const NAMED = /^(.{1,24}?(?:[.:!?](?= )|[：。！？](?:\.(?= ))?(?= )|：))\s?(.+)$/;

export interface NamedLine {
  /** The title with its end mark, without the stale period. */
  title: string;
  /** The title ends in a fullwidth mark, which needs no space after it. */
  fullwidth: boolean;
  body: string;
}

/** A list item's title and text, or null when the item has no title. */
export function namedLine(text: string): NamedLine | null {
  const named = NAMED.exec(text);
  if (!named) return null;
  const title = named[1].replace(/([：。！？])\.$/, "$1");
  return { title, fullwidth: /[：。！？]$/.test(title), body: named[2] };
}

export interface SnapshotBlock {
  list: boolean;
  lines: string[];
}

/** The text's paragraphs and lists: one paragraph per line, consecutive "• " lines as one list. */
export function snapshotBlocks(text: string): SnapshotBlock[] {
  const blocks: SnapshotBlock[] = [];
  for (const raw of text.split("\n")) {
    // a snapshot saved before B-001 reads with today's heads; the saved text stays as it is
    const line = normalizeInlineHead(raw.trim());
    if (!line) continue;
    const list = line.startsWith("• ");
    const last = blocks[blocks.length - 1];
    if (list && last?.list) last.lines.push(line.slice(2));
    else blocks.push({ list, lines: [list ? line.slice(2) : line] });
  }
  return blocks;
}

export function SnapshotLine({ text, item = false }: { text: string; item?: boolean }) {
  // Only list items: a paragraph's short first sentence ("You gain advantage. …") is not a title.
  const named = item ? namedLine(text) : null;
  if (!named) return <>{text}</>;
  return (
    <>
      <strong className="font-semibold">{named.title}</strong>
      {named.fullwidth ? "" : " "}
      {named.body}
    </>
  );
}

/**
 * Saved plain text (a pack row's snapshot, P7) with its structure back: one paragraph per line,
 * "• " lines as a list, and a named list item's title in bold. Plain React text, so
 * nothing in the snapshot is read as markup.
 */
export function SnapshotText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)} data-snapshot-text>
      {snapshotBlocks(text).map((block, index) =>
        block.list ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.lines.map((line, at) => (
              <li key={at}>
                <SnapshotLine text={line} item />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <SnapshotLine text={block.lines[0]} />
          </p>
        ),
      )}
    </div>
  );
}
