import { Fragment, type ReactNode } from "react";
import type { RuleNode } from "./corpus";

export function ruleText(nodes: RuleNode[]): string {
  return nodes
    .map((n) => ("value" in n ? n.value : "children" in n ? ruleText(n.children) : " "))
    .join("");
}
export function RuleBlocks({ nodes, go }: { nodes: RuleNode[]; go: (target: string) => void }) {
  function render(n: RuleNode, header = false): ReactNode {
    const kids =
      "children" in n
        ? n.children.map((child, i) => (
            <Fragment key={i}>{render(child, n.type === "table" ? i === 0 : header)}</Fragment>
          ))
        : null;
    switch (n.type) {
      case "text":
        return n.value;
      case "code":
        return <code>{n.value}</code>;
      case "dice":
        return (
          <span className="whitespace-nowrap font-mono">
            {Array.from(n.value, (face, i) => (
              <span className="inline-block rounded border px-1" key={i}>
                {face}
              </span>
            ))}
          </span>
        );
      case "strong":
        return <strong>{kids}</strong>;
      case "emphasis":
        return <em>{kids}</em>;
      case "break":
        return <br />;
      case "thematicBreak":
        return <hr />;
      case "paragraph":
        return <p>{kids}</p>;
      case "blockquote":
        return (
          <blockquote className="space-y-2 rounded-lg border bg-muted/40 p-4">{kids}</blockquote>
        );
      case "list":
        return n.ordered ? (
          <ol className="list-decimal space-y-1 pl-6" start={n.start}>
            {kids}
          </ol>
        ) : (
          <ul className="list-disc space-y-1 pl-6">{kids}</ul>
        );
      case "listItem":
        return <li>{kids}</li>;
      case "table":
        return (
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <tbody>{kids}</tbody>
            </table>
          </div>
        );
      case "tableRow":
        return <tr>{kids}</tr>;
      case "tableCell":
        return header ? (
          <th scope="col" className="border p-2 text-start" colSpan={n.span}>
            {kids}
          </th>
        ) : (
          <td className="border p-2" colSpan={n.span}>
            {kids}
          </td>
        );
      case "link":
        return (
          <button type="button" className="text-primary underline" onClick={() => go(n.target)}>
            {kids}
          </button>
        );
      case "external":
        return (
          <a className="text-primary underline" href={n.url}>
            {kids}
          </a>
        );
    }
  }
  return nodes.map((n, i) => <Fragment key={i}>{render(n)}</Fragment>);
}
