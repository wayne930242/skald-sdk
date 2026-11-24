import type { ReactNode } from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";

const URL_PATTERN = /https?:\/\/[^\s<>"'）)]+[^\s<>"'）).,;:!?。，；：]/g;

/** The text with each http(s) URL as a link, so the PDF's annotation opens it. */
function linked(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <a key={start} href={match[0]}>
        {match[0]}
      </a>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * License text a System must print (the D&D SRD's CC-BY notice, game-icons' CC BY): small grey
 * type in the page body, never in the footer, with its URLs as links. The text comes from the
 * System's own catalog; the kit translates nothing.
 */
export function PrintAttribution({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("pk-attribution", className)}>{typeof children === "string" ? linked(children) : children}</p>;
}
