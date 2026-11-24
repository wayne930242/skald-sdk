import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import type { Schema } from "@skald/types/schema";
import { describe, expect, it, vi } from "vitest";
import { SchemaDataContext, SchemaStaticContext } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import messages from "@skald/system-fate/data/fate-condensed/messages/en.json";
import zhMessages from "@skald/system-fate/data/fate-condensed/messages/zh-TW.json";
import appMessages from "@skald/sheet-sdk/messages/en.json";
import { FateAspectListFieldRenderer } from "./aspect-list-field";
import { FateRefreshFieldRenderer } from "./refresh-field";
import { FateResetButtonRenderer } from "./reset-button";
import { FateStressTrackFieldRenderer } from "./stress-track-field";
import { FateStuntListFieldRenderer } from "./stunt-list-field";

const host = vi.hoisted(() => ({ system: null as null | { systemId: string; builtinTemplate?: boolean } }));
vi.mock("@skald/sheet-sdk/components/providers/system-provider", () => ({ useSystemOptional: () => host.system }));

function mount(children: ReactNode, data: Record<string, unknown>, builtinTemplate?: boolean, locale: "en" | "zh-TW" = "en") {
  host.system = { systemId: "fate-condensed", builtinTemplate };
  const setData = vi.fn();
  const onChange = vi.fn();
  const onBlur = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={{ ...appMessages, ...(locale === "en" ? messages : zhMessages) }} timeZone="UTC">
      <SchemaStaticContext.Provider value={{ schema: { version: "1.0.0", fields: {} } as Schema, editable: true, setupMode: true, printMode: false, viewMode: "web", setData, onChange, onBlur }}>
        <SchemaDataContext.Provider value={{ data }}>{children}</SchemaDataContext.Provider>
      </SchemaStaticContext.Provider>
    </NextIntlClientProvider>,
  );
  return { setData, onChange, onBlur };
}

const aspectsField = { id: "aspects", type: "fate-aspect-list" } as const;
const resetField = { id: "resetButton", type: "fate-reset-button" } as const;

describe("Fate built-in fallback", () => {
  it("uses the blog term for boost", () => {
    expect(zhMessages.aspect.boost).toBe("推助");
  });

  it("localizes fallback punctuation and does not expose raw stunt IDs", () => {
    mount(<>
      <FateRefreshFieldRenderer field={{ id: "refresh", type: "fate-refresh" }} />
      <FateStressTrackFieldRenderer field={{ id: "mentalStress", type: "fate-stress-track", skillPyramidField: "skills", linkedSkillId: "will", label: "Mental" }} />
      <FateStuntListFieldRenderer field={{ id: "stunts", type: "fate-stunt-list" }} />
    </>, { extraMildConsequence: "燒傷", mentalStress: [5, 6], stunts: { stunts: [{ id: "stunt", type: "bonus", title: "熟悉街巷", skill: "contacts", action: "createAdvantage" }] } }, true, "zh-TW");
    expect(screen.getByText("未分配的額外輕微後果 (2)：燒傷")).toBeInTheDocument();
    expect(screen.getByText("超出目前容量的已勾選格：5、6")).toBeInTheDocument();
    expect(screen.getByText("熟悉街巷")).toBeInTheDocument();
    expect(screen.queryByText(/contacts|createAdvantage/)).not.toBeInTheDocument();
  });
  it("mounts an editable v1 card without writing, displays the collision and zero FP, and hides reset", () => {
    const { setData, onChange, onBlur } = mount(<>
      <FateAspectListFieldRenderer field={aspectsField} />
      <FateRefreshFieldRenderer field={{ id: "refresh", type: "fate-refresh" }} />
      <FateResetButtonRenderer field={resetField} />
      <FateStressTrackFieldRenderer field={{ id: "physicalStress", type: "fate-stress-track", skillPyramidField: "skills", linkedSkillId: "physique", label: "Physical" }} />
      <FateStuntListFieldRenderer field={{ id: "stunts", type: "fate-stunt-list" }} />
    </>, {
      highConcept: "Older ghost story", trouble: "Legacy only", fatePoints: 0, extraMildConsequence: "Burnt fingers",
      aspects: { aspects: [{ id: "highConcept", label: "高概念", value: "Current ghost story" }] },
    }, true);
    expect(setData).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onBlur).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Current ghost story")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Legacy only")).toBeInTheDocument();
    expect(screen.getByText(/Older ghost story/)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/Unassigned extra mild \(2\): Burnt fingers/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset Character" })).not.toBeInTheDocument();
  });

  it("uses the latest raw data when editing, retains hidden rows, and never renders secret text", () => {
    const source = { aspects: { format: 2, aspects: [
      { id: "highConcept", kind: "highConcept", text: "Visible", secret: false, freeInvokes: 2 },
      { id: "hidden", kind: "free", text: "Secret trick", secret: true, freeInvokes: 1 },
    ] } };
    const { setData } = mount(<FateAspectListFieldRenderer field={aspectsField} />, source, true);
    expect(screen.queryByDisplayValue("Secret trick")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Visible"), { target: { value: "" } });
    const next = setData.mock.calls[0][0]({ aspects: { ...source.aspects, concurrent: true } });
    expect(next.aspects).toEqual({ ...source.aspects, concurrent: true, aspects: [{ ...source.aspects.aspects[0], text: "", value: "", label: "High Concept" }, { ...source.aspects.aspects[1], value: "", label: "Free Aspect" }] });
  });

  it("writes stress and stunts from updater state without dropping track marks or stunt metadata", () => {
    const stunt = { id: "v2-stunt", type: "bonus", title: "Ghost messenger", because: "Ghosts look out for me", customText: "Old note", oncePerSession: true, usedSessionId: "session-one" };
    const { setData, onBlur } = mount(<>
      <FateStressTrackFieldRenderer field={{ id: "mentalStress", type: "fate-stress-track", skillPyramidField: "skills", linkedSkillId: "will", label: "Mental" }} />
      <FateStuntListFieldRenderer field={{ id: "stunts", type: "fate-stunt-list" }} />
    </>, { mentalStress: { stress2: true, stress6: true }, stunts: { stunts: [stunt] } }, true);
    expect(screen.getByText("Marks outside current capacity: 6")).toBeInTheDocument();
    expect(screen.getByText(/Ghosts look out for me/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "1" })[0]);
    expect(onBlur).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByDisplayValue("Old note"), { target: { value: "New note" } });
    const next = setData.mock.calls[0][0]({ mentalStress: [2, 5, 6], stunts: { concurrent: true, stunts: [stunt] } });
    expect(next.mentalStress).toEqual([1, 2, 5, 6]);
    expect(setData.mock.calls[1][0](next).stunts).toEqual({ concurrent: true, stunts: [{ ...stunt, customText: "New note" }] });
  });

  it("does not reinterpret a custom field when built-in identity is unknown", () => {
    const { setData } = mount(<>
      <FateAspectListFieldRenderer field={{ ...aspectsField, defaultAspects: [{ id: "highConcept", label: "My authored label" }], allowAdd: false }} />
      <FateResetButtonRenderer field={resetField} />
    </>, { highConcept: "Not a default for this template" });
    expect(screen.getByPlaceholderText("My authored label")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Reset Character" })).toBeInTheDocument();
    expect(setData).not.toHaveBeenCalled();
  });
});
