/**
 * For each limit but the file size and the depth: a change to a pack that makes its measure for
 * that limit exactly `size`. Used to test each limit at its value and one over it.
 */
import { entryBytes, jsonBytes } from "../parse";
import type { SystemPackLimit } from "../limits";
import type { PackContent } from "./minimal-pack";

type Section = Record<string, unknown> & { blocks: Record<string, unknown>[] };
const sections = (content: PackContent) => content.rules.sections as Section[];
const firstEntry = (content: PackContent) => content.entries.collections[0].entries[0];
const textBlock = (value: string) => [{ type: "paragraph", children: [{ type: "text", value }] }];

/** Makes content whose measure for `limit` is `size`, for a size reached by padding. */
export type Sizer = (content: PackContent, size: number) => void;

/** Pads a string field so `measure` reaches `size`; `measure` grows by one per padded character. */
function padTo(set: (content: PackContent, pad: string) => void, measure: (content: PackContent) => number): Sizer {
  return (content, size) => {
    set(content, "");
    const base = measure(content);
    set(content, "a".repeat(size - base));
  };
}

const CJK = "一";

export const LIMIT_SIZERS: Record<Exclude<SystemPackLimit, "maxPackBytes" | "maxDepth">, Sizer> = {
  maxManifestBytes: (content, size) => {
    // Three UTF-8 bytes per character keeps the notice under its own length limit.
    content.manifest.notice = "";
    const base = jsonBytes(content.manifest);
    const cjk = Math.floor((size - base) / 3);
    content.manifest.notice = CJK.repeat(cjk) + "a".repeat(size - base - cjk * 3);
  },
  maxNameLength: (content, size) => (content.manifest.name = "a".repeat(size)),
  maxVersionLength: (content, size) => (content.manifest.version = `1.0.${"0".repeat(size - 4)}`),
  maxSdkLength: (content, size) => (content.manifest.sdk = "a".repeat(size)),
  maxDescriptionLength: (content, size) => (content.manifest.description = "a".repeat(size)),
  maxNoticeLength: (content, size) => (content.manifest.notice = "a".repeat(size)),
  maxSystemBytes: padTo(
    (content, pad) => (content.system.defaultData = { pad }),
    (content) => jsonBytes(content.system),
  ),
  maxGameDataKeys: (content, size) => {
    content.gameData = Object.fromEntries(Array.from({ length: size }, (_, index) => [`key${index}`, index]));
  },
  maxGameDataValueBytes: padTo(
    (content, pad) => (content.gameData.big = pad),
    (content) => jsonBytes(content.gameData.big),
  ),
  maxSections: (content, size) => {
    for (let index = sections(content).length; index < size; index += 1) {
      content.rules.sections.push({ id: `s${index}`, parentId: null, title: "S", blocks: [] });
    }
  },
  maxSectionBytes: padTo(
    (content, pad) => (sections(content)[0].blocks = textBlock(pad)),
    (content) => jsonBytes(sections(content)[0].blocks),
  ),
  maxCollections: (content, size) => {
    for (let index = content.entries.collections.length; index < size; index += 1) {
      content.entries.collections.push({ id: `c${index}`, title: "C", entries: [] });
    }
  },
  maxEntries: (content, size) => {
    const { entries } = content.entries.collections[0];
    for (let index = entries.length; index < size; index += 1) entries.push({ id: `e${index}`, name: "E", blocks: [] });
  },
  maxEntryBytes: padTo(
    (content, pad) => (firstEntry(content).blocks = textBlock(pad)),
    (content) => entryBytes(firstEntry(content) as Parameters<typeof entryBytes>[0]),
  ),
  maxTitleLength: (content, size) => (sections(content)[0].title = "a".repeat(size)),
  maxSummaryLength: (content, size) => (firstEntry(content).summary = "a".repeat(size)),
  maxTags: (content, size) => (firstEntry(content).tags = Array.from({ length: size }, (_, index) => `t${index}`)),
  maxTagLength: (content, size) => (firstEntry(content).tags = ["a".repeat(size)]),
  maxUrlLength: (content, size) => {
    const url = "https://example.com/";
    sections(content)[0].blocks.push({ type: "external", url: url + "a".repeat(size - url.length), children: [] });
  },
};

