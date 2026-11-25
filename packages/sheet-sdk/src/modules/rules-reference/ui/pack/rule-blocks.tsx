import { Fragment, type ReactNode } from "react";
import { externalUrlProblem, type RuleNode } from "@skald/sheet-sdk/modules/systems/domain/system-pack/rule-nodes";

export function RuleBlocks({ blocks, navigate }: { blocks: RuleNode[]; navigate: (target: string) => void }) {
  function render(node: RuleNode): ReactNode {
    const kids = "children" in node ? node.children.map((n,i) => <Fragment key={i}>{render(n)}</Fragment>) : null;
    switch (node.type) {
      case "text": return node.value;
      case "break": return <br />;
      case "thematicBreak": return <hr />;
      case "paragraph": return <p>{kids}</p>;
      case "emphasis": return <em>{kids}</em>;
      case "strong": return <strong>{kids}</strong>;
      case "blockquote": return <blockquote>{kids}</blockquote>;
      case "listItem": return <li>{kids}</li>;
      case "table": return <table><tbody>{kids}</tbody></table>;
      case "tableRow": return <tr>{kids}</tr>;
      case "tableCell": return <td colSpan={node.span}>{kids}</td>;
      case "list": return node.ordered ? <ol className="list-decimal pl-5" start={node.start}>{kids}</ol> : <ul className="list-disc pl-5">{kids}</ul>;
      case "heading": return node.depth === 3 ? <h3>{kids}</h3> : <h4>{kids}</h4>;
      case "link": return <button className="text-primary underline" onClick={() => navigate(node.target)}>{kids}</button>;
      case "external": return externalUrlProblem(node.url) ? kids : <a className="text-primary underline" href={node.url} target="_blank" rel="noopener noreferrer">{kids}</a>;
    }
  }
  return <div className="space-y-2 overflow-x-auto break-words">{blocks.map((n,i) => <Fragment key={i}>{render(n)}</Fragment>)}</div>;
}
