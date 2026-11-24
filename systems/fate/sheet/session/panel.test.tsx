import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import { FatePlayContext } from "../play/play-context";
import { projectFatePlayAspects } from "../play/play-model";
import { FateSessionPanel } from "./index";
import { previewMilestone } from "./milestone";
import { loadFatePresetCatalog } from "../../domain/presets";
import { sessionState } from "./commands";
const data = {
  fatePoints: 1,
  aspects: {
    format: 2,
    aspects: [
      {
        id: "freeAspect1",
        kind: "free",
        secret: true,
        labelOverride: "ForbiddenLabel",
        text: "ForbiddenText",
      },
    ],
  },
  fateV2: {
    ledger: [
      {
        operationId: "x",
        timestamp: "2026-11-22T12:00:00Z",
        reason: "invokePaid",
        delta: -1,
        aspectId: "freeAspect1",
      },
    ],
  },
};
it("never renders secret labels in ledger or milestone choices; cancelling the milestone calls no writer", async () => {
  const update = vi.fn();
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ skill: {} }}>
        <FatePlayContext.Provider
          value={{
            data,
            schema: { fields: {} } as Schema,
            system: {} as LoadedSystem,
            editable: true,
            structural: false,
            secretAccess: "unknown",
            aspects: projectFatePlayAspects(data, "unknown"),
            skills: [],
            update,
            openRules: vi.fn(),
            setField: vi.fn(),
          }}
        >
          <FateSessionPanel />
        </FatePlayContext.Provider>
      </NextIntlClientProvider>,
    );
  });
  fireEvent.click(await screen.findByRole("button", { name: "Session management" }));
  expect(document.body.textContent).not.toMatch(/Forbidden/);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Minor milestone" }));
  });
  fireEvent.change(await screen.findByLabelText("Choose at most one change"), {
    target: { value: "rewriteAspect" },
  });
  expect(document.body.textContent).not.toMatch(/Forbidden/);
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(update).not.toHaveBeenCalled();
});
it("major milestone allocates exactly one rank and records once on apply", async () => {
  const catalog = await loadFatePresetCatalog(),
    ctx = { operationId: "m", timestamp: "" },
    draft = { kind: "major" as const, lateral: null, increases: { fight: 1 } };
  const preview = previewMilestone(data, draft, catalog, "unknown", true, ctx);
  expect(preview.ok).toBe(true);
  if (!preview.ok) throw Error(preview.reason);
  expect(preview.card).toMatchObject({
    skills: { skills: [{ id: "fight", level: 1 }] },
    fateV2: { bankedSkillRanks: 0, majorMilestoneSequence: 1 },
  });
  expect(sessionState(data).milestones).toEqual([]);
  expect(previewMilestone(preview.card, draft, catalog, "unknown", true, ctx)).toMatchObject({
    ok: false,
    reason: "duplicateOperation",
  });
});
