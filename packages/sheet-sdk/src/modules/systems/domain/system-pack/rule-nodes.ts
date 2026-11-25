/**
 * The rules text of a system pack: a small Markdown-like tree that the site renders with React
 * nodes only. It has no HTML, no images and no code; links point inside the pack, or to a
 * normalised `https:` URL.
 */
import type { SystemPackIssue, SystemPackIssuePath } from "./format";
import { SYSTEM_PACK_LIMITS } from "./limits";

export interface RuleTextNode {
  type: "text";
  value: string;
}

export interface RuleBreakNode {
  type: "break" | "thematicBreak";
}

export interface RuleParentNode {
  type: "paragraph" | "emphasis" | "strong" | "blockquote" | "listItem" | "table" | "tableRow";
  children: RuleNode[];
}

export interface RuleTableCellNode {
  type: "tableCell";
  span: number;
  children: RuleNode[];
}

export interface RuleListNode {
  type: "list";
  ordered: boolean;
  start: number;
  children: RuleNode[];
}

export interface RuleHeadingNode {
  type: "heading";
  depth: 3 | 4;
  children: RuleNode[];
}

/** `target` is a section id, or `entry:<collection>/<id>`, of the same pack. */
export interface RuleLinkNode {
  type: "link";
  target: string;
  children: RuleNode[];
}

export interface RuleExternalNode {
  type: "external";
  url: string;
  children: RuleNode[];
}

export type RuleNode =
  | RuleTextNode
  | RuleBreakNode
  | RuleParentNode
  | RuleTableCellNode
  | RuleListNode
  | RuleHeadingNode
  | RuleLinkNode
  | RuleExternalNode;

const PARENT_TYPES = new Set(["paragraph", "emphasis", "strong", "blockquote", "listItem", "table", "tableRow"]);
const ENTRY_LINK = /^entry:([a-z0-9][a-z0-9_-]{0,63})\/([a-z0-9][a-z0-9_-]{0,63})$/;

/** The link target of entry `id` in collection `collection`. */
export function entryLinkTarget(collection: string, id: string): string {
  return `entry:${collection}/${id}`;
}

/** Whether `target` names an entry rather than a section. */
export function isEntryLinkTarget(target: string): boolean {
  return ENTRY_LINK.test(target);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why `url` may not be an `external` link, or null when it may. */
export function externalUrlProblem(url: string): { code: "link_scheme_forbidden" | "link_url_invalid"; message: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: "link_url_invalid", message: "Not an absolute URL." };
  }
  if (parsed.protocol !== "https:") {
    return { code: "link_scheme_forbidden", message: `Only https: links are allowed, not ${parsed.protocol}` };
  }
  if (parsed.username || parsed.password) {
    return { code: "link_url_invalid", message: "A link may not carry a user name or password." };
  }
  if (parsed.href !== url) {
    return { code: "link_url_invalid", message: `URL is not normalised; write ${parsed.href}` };
  }
  return null;
}

/** Where a block walk reports, shared with the rest of the pack's checks. */
export interface RuleBlocksContext {
  /** Records an issue (the list is capped). */
  push(issue: SystemPackIssue): void;
  /** True once the issue list is full: the walk stops. */
  readonly full: boolean;
  /** Whether an internal link target names a section or entry of the pack. */
  resolves(target: string): boolean;
}

const NODE_KEYS = new Map<string, readonly string[]>([
  ["text", ["type", "value"]],
  ["break", ["type"]],
  ["thematicBreak", ["type"]],
  ["tableCell", ["type", "span", "children"]],
  ["list", ["type", "ordered", "start", "children"]],
  ["heading", ["type", "depth", "children"]],
  ["link", ["type", "target", "children"]],
  ["external", ["type", "url", "children"]],
  ...[...PARENT_TYPES].map((type): [string, readonly string[]] => [type, ["type", "children"]]),
]);

/**
 * Checks `blocks` against the node set and resolves internal links. Unknown node types (HTML,
 * images, code) and unknown keys are refused, never passed through. The walk keeps one path stack
 * and copies it only into an issue, and stops as soon as the issue list is full.
 */
export function checkRuleBlocks(blocks: unknown, path: SystemPackIssuePath, context: RuleBlocksContext): void {
  const at: SystemPackIssuePath = [...path];
  const report = (issue: Omit<SystemPackIssue, "path">, ...tail: (string | number)[]) =>
    context.push({ ...issue, path: [...at, ...tail] } as SystemPackIssue);

  const walkList = (list: unknown): void => {
    if (!Array.isArray(list)) {
      report({ code: "invalid_value", message: "Expected a list of rule nodes." });
      return;
    }
    for (let index = 0; index < list.length && !context.full; index += 1) {
      at.push(index);
      walkNode(list[index]);
      at.pop();
    }
  };

  const walkNode = (node: unknown): void => {
    if (!isRecord(node) || typeof node.type !== "string") {
      report({ code: "invalid_value", message: "Expected a rule node object with a type." });
      return;
    }
    const type = node.type;
    const allowedKeys = NODE_KEYS.get(type);
    if (!allowedKeys) {
      report({ code: "rule_node_unknown", message: `Unknown rule node type "${type.slice(0, 64)}"; HTML, images and code are not allowed.` }, "type");
      return;
    }
    for (const key of Object.keys(node)) {
      if (!allowedKeys.includes(key)) report({ code: "unknown_key", message: `Unknown key "${key.slice(0, 64)}" on a ${type} node.` }, key);
    }
    const invalid = (key: string, message: string) => report({ code: "invalid_value", message }, key);
    switch (type) {
      case "text":
        if (typeof node.value !== "string") invalid("value", "Expected a string.");
        return;
      case "break":
      case "thematicBreak":
        return;
      case "tableCell":
        if (!Number.isInteger(node.span) || (node.span as number) < 1 || (node.span as number) > 64) {
          invalid("span", "Expected an integer from 1 to 64.");
        }
        break;
      case "list":
        if (typeof node.ordered !== "boolean") invalid("ordered", "Expected a boolean.");
        if (!Number.isInteger(node.start) || (node.start as number) < 0 || (node.start as number) > 1_000_000) {
          invalid("start", "Expected an integer from 0 to 1000000.");
        }
        break;
      case "heading":
        if (node.depth !== 3 && node.depth !== 4) invalid("depth", "Expected 3 or 4.");
        break;
      case "link":
        if (typeof node.target !== "string") invalid("target", "Expected a string.");
        else if (!context.resolves(node.target)) {
          report({ code: "link_dangling", message: `No section or entry "${node.target.slice(0, 200)}" in this pack.` }, "target");
        }
        break;
      case "external": {
        if (typeof node.url !== "string") {
          invalid("url", "Expected a string.");
          break;
        }
        const max = SYSTEM_PACK_LIMITS.maxUrlLength;
        if (node.url.length > max) {
          report(
            { code: "limit_exceeded", message: `URL is longer than ${max} characters.`, limit: "maxUrlLength", max, actual: node.url.length },
            "url",
          );
          break;
        }
        const problem = externalUrlProblem(node.url);
        if (problem) report(problem, "url");
        break;
      }
    }
    at.push("children");
    walkList(node.children);
    at.pop();
  };

  walkList(blocks);
}

/** The plain text of `blocks`, one space between blocks: for search and summaries. */
export function ruleNodesPlainText(blocks: readonly RuleNode[]): string {
  const parts: string[] = [];
  const walk = (node: RuleNode) => {
    if (node.type === "text") parts.push(node.value);
    else if (!("children" in node)) parts.push(" ");
    else {
      node.children.forEach(walk);
      parts.push(" ");
    }
  };
  blocks.forEach(walk);
  return parts.join("").replace(/\s+/g, " ").trim();
}
