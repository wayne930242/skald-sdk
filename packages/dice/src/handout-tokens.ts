import type { HandoutRefData } from "./types";

// {{handout:<pageId>}} — 沿用專案既有的 {{@...}}/{{#...}} 巨集標記慣例
// (見 inline-dice-roller.tsx 的 detectAutocompleteTrigger)。pageId 是 UUID。
const HANDOUT_TOKEN_PATTERN =
  "\\{\\{handout:([0-9a-fA-F-]+)\\}\\}";

export function serializeHandoutToken(pageId: string): string {
  return `{{handout:${pageId}}}`;
}

export type HandoutTokenSegment =
  | { type: "text"; value: string }
  | { type: "handout"; pageId: string };

/**
 * 切分含有 {{handout:pageId}} token 的字串為文字／handout 參照片段，
 * 供 web 端聊天室渲染與 bot 端 Discord embed 渲染共用同一套規則。
 */
export function parseHandoutTokens(content: string): HandoutTokenSegment[] {
  const regex = new RegExp(HANDOUT_TOKEN_PATTERN, "g");
  const segments: HandoutTokenSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "handout", pageId: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

export function hasHandoutToken(content: string): boolean {
  return new RegExp(HANDOUT_TOKEN_PATTERN).test(content);
}

/**
 * 將 content 中的 {{handout:pageId}} token 渲染成純文字可讀形式
 * （例如 `📄 神秘的信件`），供 Discord embed／複製訊息等純文字消費場景使用。
 * 找不到對應 ref 的 pageId 降級為「內容已不存在」。
 */
export function renderHandoutTokensAsPlainText(
  content: string,
  handoutRefs: Record<string, HandoutRefData> | null | undefined
): string {
  return parseHandoutTokens(content)
    .map((segment) => {
      if (segment.type === "text") return segment.value;
      const ref = handoutRefs?.[segment.pageId];
      return ref ? `📄 ${ref.pageTitle}` : "📄 [內容已不存在]";
    })
    .join("");
}
