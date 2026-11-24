/** Shape of data/fate-condensed/rules/<locale>.json; owned by the offline build, read by plugins/fate/reference. */
export type RulesLocale = "en" | "zh-TW";
export type RuleNode =
  | { type: "text" | "code" | "dice"; value: string }
  | { type: "break" | "thematicBreak" }
  | {
      type: "paragraph" | "emphasis" | "strong" | "blockquote" | "listItem" | "table" | "tableRow";
      children: RuleNode[];
    }
  | { type: "tableCell"; span: number; children: RuleNode[] }
  | { type: "list"; ordered: boolean; start: number; children: RuleNode[] }
  | { type: "link"; target: string; children: RuleNode[] }
  | { type: "external"; url: string; children: RuleNode[] };
export interface RuleSection {
  id: string;
  parentId: string | null;
  sourceLines: [number, number];
  title: string;
  blocks: RuleNode[];
}
export interface RulesCorpus {
  version: 1;
  locale: RulesLocale;
  source: { url: string; sha256: string; revision?: string };
  notices: string[];
  anchors: Record<string, string>;
  unresolved: { line: number; text: string }[];
  sections: RuleSection[];
}
