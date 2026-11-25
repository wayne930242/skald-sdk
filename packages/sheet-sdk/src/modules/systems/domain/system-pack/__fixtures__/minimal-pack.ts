/** A small valid `skald/system-pack/v1` file for tests, built in code (pack files do not belong in the repository). */
import { SYSTEM_PACK_SCHEMA_ID } from "../format";
import { systemPackHash } from "../hash";

export type PackContent = Record<string, unknown> & {
  manifest: Record<string, unknown>;
  system: Record<string, unknown> & { template: Record<string, unknown> };
  gameData: Record<string, unknown>;
  rules: { sections: Record<string, unknown>[] };
  entries: { collections: (Record<string, unknown> & { entries: Record<string, unknown>[] })[] };
};

export function minimalPackContent(): PackContent {
  return {
    schema: SYSTEM_PACK_SCHEMA_ID,
    manifest: {
      packId: "test-game",
      name: "Test Game",
      version: "1.0.0",
      description: "A test system.",
      category: "other",
      locale: "en",
    },
    system: {
      schema: {
        $schema: "skald/schema/v1",
        id: "test-game",
        name: "Test Game",
        version: "1.0.0",
        fields: {
          name: { id: "name", label: "Name", type: "text" },
          might: { id: "might", label: "Might", type: "number", defaultValue: 1, icon: "game:police-badge" },
        },
      },
      template: {
        $schema: "skald/template/v1",
        id: "test-game-sheet",
        name: "Test Game",
        version: "1.0.0",
        schemaId: "test-game",
        schemaVersion: "1.0.0",
        scopedStyles: { css: ".skald-user-title { color: var(--skald-accent); }" },
        pages: [
          {
            id: "main",
            layout: { type: "stack" },
            children: [
              { type: "field-ref", fieldId: "name" },
              { type: "field-ref", fieldId: "might" },
            ],
          },
        ],
      },
      defaultData: { name: "", might: 1 },
      dsl: {
        rollRules: {
          default: "check",
          rules: {
            check: {
              type: "roll-over",
              dice: "2d6",
              modifier: "{{@might}}",
              successLevels: [
                { id: "hit", label: "Hit", condition: "{{@total >= 7}}", style: "success" },
                { id: "miss", label: "Miss", condition: "{{@total < 7}}", style: "failure" },
              ],
            },
          },
        },
      },
    },
    gameData: { origins: [{ id: "farmer", label: "Farmer" }] },
    rules: {
      sections: [
        {
          id: "basics",
          parentId: null,
          title: "Basics",
          blocks: [
            {
              type: "paragraph",
              children: [
                { type: "text", value: "Roll 2d6. See " },
                { type: "link", target: "combat", children: [{ type: "text", value: "Combat" }] },
                { type: "text", value: " and " },
                { type: "link", target: "entry:moves/strike", children: [{ type: "text", value: "Strike" }] },
                { type: "text", value: "." },
              ],
            },
          ],
        },
        {
          id: "combat",
          parentId: "basics",
          title: "Combat",
          blocks: [
            { type: "heading", depth: 3, children: [{ type: "text", value: "Order" }] },
            {
              type: "list",
              ordered: true,
              start: 1,
              children: [{ type: "listItem", children: [{ type: "paragraph", children: [{ type: "text", value: "Act." }] }] }],
            },
            { type: "external", url: "https://example.com/", children: [{ type: "text", value: "More" }] },
          ],
        },
      ],
    },
    entries: {
      collections: [
        {
          id: "moves",
          title: "Moves",
          entries: [
            {
              id: "strike",
              name: "Strike",
              tags: ["combat"],
              summary: "Hit something.",
              blocks: [{ type: "paragraph", children: [{ type: "text", value: "Roll Might." }] }],
            },
          ],
        },
      ],
    },
  };
}

/** `content` with its hash set. */
export async function sealed(content: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { ...content, hash: await systemPackHash(content) };
}

/** The game icon names the fixture uses. */
export const FIXTURE_GAME_ICONS: ReadonlySet<string> = new Set(["police-badge"]);
