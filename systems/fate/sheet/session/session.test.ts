import { expect, it } from "vitest";
import { transition, reminders, pointChange } from "./commands";
const op = { operationId: "s1", timestamp: "2026-11-22" };
it("tops up shortfall once, preserves surplus and refuses read only", () => {
  for (const points of [1, 6]) {
    const card = { fatePoints: points };
    const next = transition(card, "session", undefined, op, true);
    expect(next.fatePoints).toBe(Math.max(points, 3));
    expect(next.fateV2).toMatchObject({
      ledger: points === 1 ? [expect.objectContaining({ delta: 2 })] : [],
    });
    expect(transition(next, "session", undefined, op, true)).toBe(next);
    expect(transition(card, "session", undefined, op, false)).toBe(card);
  }
});
it("scene only clears stress; partially elapsed recovery remains treated, not eligible", () => {
  const card = {
    physicalStress: [1],
    notes: "keep",
    mildConsequence: "bandaged",
    fateV2: {
      harm: {
        consequences: {
          mild: {
            injuryId: "x",
            injuryText: "bandaged",
            recovery: { boundary: "scene", treatedAtSequence: 0 },
          },
        },
      },
    },
  };
  const next = transition(card, "scene", undefined, op, true);
  expect(next).toMatchObject({ physicalStress: [], notes: "keep", mildConsequence: "bandaged" });
  expect(reminders(next)[0].status).toBe("recovering");
});
it("refusal cannot overdraw; withdrawal is not a charge", () => {
  const card = { fatePoints: 0 };
  expect(pointChange(card, "refuse", 0, "", op, true)).toBe(card);
  expect(pointChange(card, "withdraw", 0, "", op, true)).toBe(card);
});
