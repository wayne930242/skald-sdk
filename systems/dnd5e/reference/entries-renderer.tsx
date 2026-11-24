"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { inlineHeadSeparator } from "./inline-head";
import { linkRefs, parseTags, tokensToText, type LabelResolver, type TextToken } from "./tags";

/**
 * 5etools entries → React nodes (design §1.6, §3.6). Text only ever becomes React text nodes:
 * no HTML string reaches the DOM, so pack or corpus text cannot inject markup.
 */

type Node = Record<string, unknown>;

export interface EntriesRenderContext {
  /** The concrete ref a link candidate resolves to (built-in or loaded pack), or null. */
  resolveRef: (candidate: string) => string | null;
  /** Opens the reference view for a resolved ref. */
  onOpenRef?: (ref: string) => void;
  label?: LabelResolver;
  abilityDc?: (name: string, abilities: string) => string;
  abilityAttackMod?: (name: string, abilities: string) => string;
  /**
   * The entry an `include` node (or a resolved `statblock` embed) embeds, drawn by the reference view
   * (plan T2b §2.5). Without it, include nodes draw nothing and embeds show their name.
   */
  renderInclude?: (ref: string) => ReactNode;
  /** A chapter's `refList` index (spells, creatures, magic items); nothing without it. */
  renderRefList?: (node: Record<string, unknown>) => ReactNode;
  /** The character's level: a progression table highlights its row (§5.4). */
  highlightLevel?: number;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STYLE_CLASS: Record<string, string> = {
  bold: "font-semibold",
  italic: "italic",
  underline: "underline",
  strike: "line-through",
  note: "italic text-muted-foreground",
  highlight: "bg-muted px-0.5 rounded-sm",
  code: "font-mono",
};

function TokenNodes({ tokens, context }: { tokens: TextToken[]; context: EntriesRenderContext }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "text":
          case "plain":
            return <Fragment key={index}>{token.text}</Fragment>;
          case "label":
            return <Fragment key={index}>{context.label?.(token.key, token.value) ?? token.text}</Fragment>;
          case "styled": {
            const content = <TokenNodes tokens={token.children} context={context} />;
            if (token.style === "sup") return <sup key={index}>{content}</sup>;
            if (token.style === "sub") return <sub key={index}>{content}</sub>;
            return <span key={index} className={STYLE_CLASS[token.style]}>{content}</span>;
          }
          case "link": {
            const ref = token.refs.map((candidate) => context.resolveRef(candidate)).find(Boolean);
            if (!ref || !context.onOpenRef) return <Fragment key={index}>{token.text}</Fragment>;
            return (
              <button
                key={index}
                type="button"
                data-ref={ref}
                className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                onClick={() => context.onOpenRef?.(ref)}
              >
                {token.text}
              </button>
            );
          }
        }
      })}
    </>
  );
}

/** One string's inline text (tags as links, labels and styles), with no paragraph around it. */
export function InlineText({ text, context }: { text: string; context: EntriesRenderContext }) {
  return <TokenNodes tokens={parseTags(text)} context={context} />;
}

function RefLink({ raw, tag, context }: { raw: unknown; tag: string; context: EntriesRenderContext }) {
  const args = String(raw ?? "").split("|");
  const token: TextToken = { type: "link", refs: linkRefs(tag, args), text: args[0] ?? "" };
  return (
    <p className="my-1 font-medium">
      <TokenNodes tokens={[token]} context={context} />
    </p>
  );
}

function Name({ value, context, as = "span" }: { value: unknown; context: EntriesRenderContext; as?: "span" | "h4" }) {
  if (typeof value !== "string" || !value) return null;
  if (as === "h4") {
    return (
      <h4 className="mt-3 mb-1 font-semibold">
        <InlineText text={value} context={context} />
      </h4>
    );
  }
  return (
    <span className="font-semibold italic">
      <InlineText text={value} context={context} />
      {inlineHeadSeparator(tokensToText(parseTags(value)))}
    </span>
  );
}

function Cell({ cell, context }: { cell: unknown; context: EntriesRenderContext }) {
  if (typeof cell === "string") return <InlineText text={cell} context={context} />;
  if (typeof cell === "number") return <>{cell}</>;
  if (isNode(cell) && isNode(cell.roll)) {
    const roll = cell.roll;
    return <>{roll.exact !== undefined ? String(roll.exact) : `${String(roll.min ?? "")}–${String(roll.max ?? "")}`}</>;
  }
  return <Entry value={cell} context={context} />;
}

function Body({ node, context }: { node: Node; context: EntriesRenderContext }) {
  const nested = node.entries ?? node.entry;
  return <Entry value={nested} context={context} />;
}

/**
 * A progression table: its rows start with the levels 1, 2, 3, … in order (§5.4).
 * Detected by the rows, not the column label, which is localized (「等級」 in zh-TW).
 */
function isProgression(rows: unknown[]): boolean {
  return rows.length > 1 && rows.every((row, index) => Array.isArray(row) && row[0] === index + 1);
}

function Table({ node, context }: { node: Node; context: EntriesRenderContext }) {
  const labels = Array.isArray(node.colLabels) ? node.colLabels : [];
  const rows = Array.isArray(node.rows) ? node.rows : [];
  const groups = Array.isArray(node.colGroups) ? node.colGroups.filter(isNode) : [];
  const progression = isProgression(rows);
  // The Level column stays in view while a wide progression table scrolls sideways.
  const sticky = (index: number) => (progression && index === 0 ? "sticky left-0 z-[1] bg-background" : undefined);
  const groupRow = (() => {
    if (groups.length === 0) return null;
    const cells: ReactNode[] = [];
    let column = 0;
    for (const group of [...groups].sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0))) {
      const start = Number(group.start ?? 0);
      const span = Math.max(1, Number(group.span ?? 1));
      if (start > column) cells.push(<th key={`gap-${column}`} colSpan={start - column} className={sticky(column)} />);
      cells.push(
        <th key={`group-${start}`} colSpan={span} className="border-b px-2 pt-1 text-center text-xs font-semibold">
          <Cell cell={group.entry} context={context} />
        </th>,
      );
      column = start + span;
    }
    if (column < labels.length) cells.push(<th key="rest" colSpan={labels.length - column} />);
    return <tr>{cells}</tr>;
  })();
  return (
    <div className="my-2 overflow-x-auto" data-entry-type="table" data-progression={progression || undefined}>
      <table className="w-full border-collapse text-sm">
        {typeof node.caption === "string" && (
          <caption className="mb-1 text-left font-semibold">
            <InlineText text={node.caption} context={context} />
          </caption>
        )}
        {labels.length > 0 && (
          <thead>
            {groupRow}
            <tr>
              {labels.map((label, index) => (
                <th key={index} className={cn("border-b px-2 py-1 text-left font-semibold", sticky(index))}>
                  <Cell cell={label} context={context} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => {
            const cells = Array.isArray(row) ? row : isNode(row) && Array.isArray(row.row) ? row.row : [];
            const highlight = progression && context.highlightLevel !== undefined && cells[0] === context.highlightLevel;
            return (
              <tr key={rowIndex} className={cn("odd:bg-muted/40", highlight && "bg-primary/15 font-medium odd:bg-primary/15")} data-highlight={highlight || undefined}>
                {cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className={cn("px-2 py-1 align-top", sticky(cellIndex), highlight && cellIndex === 0 && "bg-primary/15")}>
                    <Cell cell={cell} context={context} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {Array.isArray(node.footnotes) && node.footnotes.map((note, index) => (
        <p key={index} className="mt-1 text-xs text-muted-foreground" data-entry-type="footnote">
          <Cell cell={note} context={context} />
        </p>
      ))}
    </div>
  );
}

/** One entry (string, array or typed node). */
export function Entry({ value, context, depth = 0 }: { value: unknown; context: EntriesRenderContext; depth?: number }): ReactNode {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    return (
      <p className="my-1.5 leading-relaxed">
        <InlineText text={value} context={context} />
      </p>
    );
  }
  if (typeof value === "number") return <p className="my-1.5">{value}</p>;
  if (Array.isArray(value)) {
    return (
      <>
        {value.map((item, index) => (
          <Entry key={index} value={item} context={context} depth={depth} />
        ))}
      </>
    );
  }
  if (!isNode(value)) return null;
  const type = typeof value.type === "string" ? value.type : "entries";
  switch (type) {
    case "image":
      return null;
    case "list": {
      const items = Array.isArray(value.items) ? value.items : [];
      const hang = typeof value.style === "string" && value.style.includes("hang");
      return (
        <ul className={cn("my-1.5 space-y-1", hang ? "list-none pl-0" : "list-disc pl-5")}>
          {items.map((item, index) => (
            <li key={index}>
              {typeof item === "string" ? <InlineText text={item} context={context} /> : <Entry value={item} context={context} depth={depth + 1} />}
            </li>
          ))}
        </ul>
      );
    }
    case "item":
    case "itemSub":
      return (
        <div className="my-1" data-entry-type={type}>
          <Name value={value.name} context={context} />
          {typeof value.entry === "string" ? (
            <InlineText text={value.entry} context={context} />
          ) : Array.isArray(value.entries) && value.entries.every((part) => typeof part === "string") ? (
            <InlineText text={(value.entries as string[]).join(" ")} context={context} />
          ) : (
            <Body node={value} context={context} />
          )}
        </div>
      );
    case "table":
      return <Table node={value} context={context} />;
    case "inset":
    case "insetReadaloud":
      return (
        <aside className="my-2 rounded-md border bg-muted/40 px-3 py-2" data-entry-type={type}>
          <Name value={value.name} context={context} as="h4" />
          <Body node={value} context={context} />
        </aside>
      );
    case "quote":
      return (
        <figure className="my-2 rounded-md bg-muted/40 px-3 py-2 italic" data-entry-type="quote">
          <Body node={value} context={context} />
          {typeof value.by === "string" && <figcaption className="not-italic text-muted-foreground">— {value.by}</figcaption>}
        </figure>
      );
    case "refClassFeature":
      return <RefLink raw={value.classFeature} tag="classFeature" context={context} />;
    case "refSubclassFeature":
      return <RefLink raw={value.subclassFeature} tag="subclassFeature" context={context} />;
    case "refOptionalfeature":
      return <RefLink raw={value.optionalfeature} tag="optfeature" context={context} />;
    case "abilityDc":
    case "abilityAttackMod": {
      const name = typeof value.name === "string" ? value.name : "";
      const abilities = (Array.isArray(value.attributes) ? value.attributes : []).join("/");
      const sentence = type === "abilityDc"
        ? context.abilityDc?.(name, abilities) ?? `${name} save DC = 8 + your Proficiency Bonus + your ${abilities} modifier`
        : context.abilityAttackMod?.(name, abilities) ?? `${name} attack modifier = your Proficiency Bonus + your ${abilities} modifier`;
      return <p className="my-1.5 text-center font-medium" data-entry-type={type}>{sentence}</p>;
    }
    case "inline":
    case "inlineBlock": {
      const parts = Array.isArray(value.entries) ? value.entries : [];
      return (
        <p className="my-1.5" data-entry-type={type}>
          {parts.map((part, index) =>
            typeof part === "string" ? <InlineText key={index} text={part} context={context} /> : <Entry key={index} value={part} context={context} />,
          )}
        </p>
      );
    }
    case "include":
      return typeof value.ref === "string" && context.renderInclude ? (
        <div className="my-1" data-entry-type="include" data-include={value.ref}>
          {context.renderInclude(value.ref)}
        </div>
      ) : null;
    case "refList":
      return context.renderRefList ? <div data-entry-type="refList">{context.renderRefList(value)}</div> : null;
    case "statblock": {
      // `{type: "statblock", tag, name}` embeds another entry's block (a pack item or creature): drawn
      // like an include when that entry resolves, else by its name.
      if (typeof value.name !== "string") return null;
      const tag = typeof value.tag === "string" ? value.tag : "creature";
      const ref = context.renderInclude ? linkRefs(tag, [value.name, String(value.source ?? "")]).map((candidate) => context.resolveRef(candidate)).find(Boolean) : null;
      if (ref && context.renderInclude) {
        return (
          <div className="my-2 rounded-md border px-3 py-2" data-entry-type="statblock" data-include={ref}>
            <h4 className="mb-1 font-semibold">{value.name}</h4>
            {context.renderInclude(ref)}
          </div>
        );
      }
      return <p className="my-1.5 font-medium" data-entry-type="statblock">{value.name}</p>;
    }
    case "options":
    case "section":
    case "entries":
    default: {
      const nested = value.entries ?? value.entry ?? value.items;
      const heading = depth === 0 && type !== "options";
      if (heading || typeof value.name !== "string") {
        return (
          <section className="my-1" data-entry-type={type}>
            <Name value={value.name} context={context} as="h4" />
            <Entry value={nested} context={context} depth={depth + 1} />
          </section>
        );
      }
      // A named sub-entry runs its name into the first paragraph, as the printed rules do.
      const [first, ...rest] = Array.isArray(nested) ? nested : [nested];
      return (
        <div className="my-1" data-entry-type={type}>
          {typeof first === "string" ? (
            <p className="my-1.5 leading-relaxed">
              <Name value={value.name} context={context} />
              <InlineText text={first} context={context} />
            </p>
          ) : (
            <>
              <Name value={value.name} context={context} as="h4" />
              <Entry value={first} context={context} depth={depth + 1} />
            </>
          )}
          <Entry value={rest} context={context} depth={depth + 1} />
        </div>
      );
    }
  }
}

export function EntriesRenderer({ entries, context, className }: { entries: unknown; context: EntriesRenderContext; className?: string }) {
  return (
    <div className={cn("text-sm", className)}>
      <Entry value={entries} context={context} />
    </div>
  );
}
