import { expect, it } from "vitest";
import { readFateStunts, readFateResources } from "../../domain/normalize";
import { transition } from "../session/commands";
import { saveStunt, markUsed } from "./commands";
it("a fourth untouched template costs nothing until filled; editing never spends current FP", () => {
  const data = {
    stunts: { stunts: ["a", "b", "c"].map((id) => ({ id, type: "custom", customText: id })) },
  };
  const blank = {
    id: "template",
    type: "bonus" as const,
    templateText: "Because [quality]…",
    customText: "Because [quality]…",
  };
  expect(saveStunt(data, blank, false)).toBe(data);
  const draft = saveStunt(data, blank, true);
  expect(readFateResources(draft)).toMatchObject({ effectiveRefresh: 3, stuntCount: 3 });
  const filled = saveStunt(draft, { ...blank, customText: "a completed stunt" }, true);
  expect(readFateResources(filled)).toMatchObject({
    effectiveRefresh: 2,
    fatePoints: 3,
    stuntCount: 4,
  });
});
it("drafts are free; editing preserves source and only starting a session renews use", () => {
  const op = { operationId: "a", timestamp: "" };
  const base = transition({}, "session", undefined, op, true);
  const draft = saveStunt(base, { id: "k", type: "custom", title: "Draft" }, true);
  expect(readFateResources(draft).stuntCount).toBe(0);
  const saved = saveStunt(
    draft,
    {
      id: "k",
      type: "custom",
      customText: "effect",
      sourceRef: "character.stunts.writing",
      oncePerSession: true,
    },
    true,
  );
  const used = markUsed(saved, "k", true);
  expect(readFateStunts(used)[0].usedSessionId).toBe("a");
  const edited = saveStunt(used, { id: "k", type: "custom", customText: "edited" }, true);
  expect(readFateStunts(edited)[0].sourceRef).toBe("character.stunts.writing");
  const scene = transition(edited, "scene", undefined, { ...op, operationId: "b" }, true);
  expect(markUsed(scene, "k", true)).toBe(scene);
  const fresh = transition(scene, "session", "a", { ...op, operationId: "c" }, true);
  expect(readFateStunts(markUsed(fresh, "k", true))[0].usedSessionId).toBe("c");
});
