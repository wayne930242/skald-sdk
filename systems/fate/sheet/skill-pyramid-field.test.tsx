import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { render } from "@skald/sheet-sdk/testing/intl-render";
import { FateSkillPyramidFieldRenderer } from "./skill-pyramid-field";

const state = vi.hoisted(() => ({
  valueMap: {} as Record<string, unknown>,
  editable: true,
  setupMode: true,
  setValueMock: vi.fn(),
  resolveI18nMock: vi.fn((value: string) => {
    if (value === "{{i18n:skill.add}}") return "Add Skill";
    if (value === "{{i18n:skill.newSkill}}") return "New Skill";
    const skillMatch = value.match(/^\{\{i18n:skill\.([^}]+)\}\}$/);
    if (skillMatch) return `Skill:${skillMatch[1]}`;
    return value;
  }),
  rollExpressionMock: vi.fn(),
  rollHandlerPresent: false,
}));

vi.mock("@skald/sheet-sdk/modules/character/ui/renderer/schema-context", () => ({
  useFieldValue: (path: string) => state.valueMap[path],
  useFieldSetter: () => state.setValueMock,
  useSchema: () => ({ editable: state.editable, setupMode: state.setupMode }),
}));

vi.mock("@skald/sheet-sdk/modules/character/ui/renderer/hooks", () => ({
  useRollHandler: () =>
    state.rollHandlerPresent
      ? { rollExpression: state.rollExpressionMock, isInSession: true }
      : null,
}));

vi.mock("@skald/sheet-sdk/modules/rolls/ui/dice/sheet-roll-control", () => ({
  SheetRollControl: ({
    ariaLabel,
    onRoll,
  }: {
    ariaLabel: string;
    onRoll: (bonusDice: number) => void;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={() => onRoll(0)}>
      roll
    </button>
  ),
}));

vi.mock("@skald/sheet-sdk/modules/rolls/ui/dice/roll-dialog", () => ({
  RollDialog: ({
    open,
    onConfirm,
    title,
  }: {
    open: boolean;
    onConfirm: (values: Record<string, number>) => void;
    title?: string;
  }) =>
    open ? (
      <div data-testid="roll-dialog" data-title={title}>
        <button type="button" onClick={() => onConfirm({ target: 3 })}>
          confirm-roll
        </button>
      </div>
    ) : null,
}));

vi.mock("@skald/sheet-sdk/lib/i18n/use-schema-i18n", () => ({
  useSchemaI18n: () => ({
    resolveI18n: (value: string) => state.resolveI18nMock(value),
  }),
}));

vi.mock("@skald/sheet-sdk/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@skald/sheet-sdk/modules/character/ui/renderer/components", () => ({
  SortableList: ({
    items,
    onReorder,
    renderItem,
    disabled,
    className,
  }: {
    items: Array<{ id: string }>;
    onReorder: (items: Array<{ id: string }>) => void;
    renderItem: (
      item: { id: string },
      index: number,
      dragHandleProps: Record<string, unknown>,
    ) => React.ReactNode;
    disabled?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="sortable-list"
      data-disabled={disabled ? "true" : "false"}
      className={className}
    >
      <button type="button" onClick={() => onReorder([...items].reverse())}>
        reorder
      </button>
      {items.map((item, index) => (
        <div key={item.id} data-testid={`item-${item.id}`}>
          {renderItem(item, index, {})}
        </div>
      ))}
    </div>
  ),
  DragHandle: () => <span data-testid="drag-handle">::</span>,
}));

afterEach(() => {
  state.valueMap = {};
  state.editable = true;
  state.setupMode = true;
  state.setValueMock.mockReset();
  state.resolveI18nMock.mockReset();
  state.resolveI18nMock.mockImplementation((value: string) => {
    if (value === "{{i18n:skill.add}}") return "Add Skill";
    if (value === "{{i18n:skill.newSkill}}") return "New Skill";
    const skillMatch = value.match(/^\{\{i18n:skill\.([^}]+)\}\}$/);
    if (skillMatch) return `Skill:${skillMatch[1]}`;
    return value;
  });
  state.rollExpressionMock.mockReset();
  state.rollHandlerPresent = false;
});

describe("FateSkillPyramidFieldRenderer", () => {
  it("reorders skills and persists new skillOrder", () => {
    state.valueMap = {
      fateSkills: { skills: [], skillOrder: ["a", "b"] },
    };

    render(
      <FateSkillPyramidFieldRenderer
        field={
          {
            id: "fateSkills",
            type: "fate-skill-pyramid",
            defaultSkills: [
              { id: "a", name: "A" },
              { id: "b", name: "B" },
            ],
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "reorder" }));
    expect(state.setValueMock).toHaveBeenCalledWith("fateSkills", {
      skills: [],
      skillOrder: ["b", "a"],
    });
  });

  it("adds a custom skill with generated id and appends it to skillOrder", () => {
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(123);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.12345);

    state.valueMap = {
      fateSkills: { skills: [], skillOrder: ["a", "b"] },
    };

    render(
      <FateSkillPyramidFieldRenderer
        field={
          {
            id: "fateSkills",
            type: "fate-skill-pyramid",
            defaultSkills: [
              { id: "a", name: "A" },
              { id: "b", name: "B" },
            ],
            allowCustomSkills: true,
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));

    expect(state.setValueMock).toHaveBeenCalledTimes(1);
    const payload = state.setValueMock.mock.calls[0][1] as {
      skills: Array<{ id: string; name: string; level: number }>;
      skillOrder: string[];
    };
    expect(payload.skills).toHaveLength(1);
    expect(payload.skills[0].id).toMatch(/^custom-123-/);
    expect(payload.skills[0].name).toBe("New Skill");
    expect(payload.skills[0].level).toBe(0);
    expect(payload.skillOrder).toContain(payload.skills[0].id);

    dateSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it("edits and saves an existing custom skill name", () => {
    state.valueMap = {
      fateSkills: {
        skills: [{ id: "custom-1", name: "Old Name", level: 1 }],
        skillOrder: ["custom-1"],
      },
    };

    render(
      <FateSkillPyramidFieldRenderer
        field={
          {
            id: "fateSkills",
            type: "fate-skill-pyramid",
            defaultSkills: [],
            allowCustomSkills: false,
          } as never
        }
      />,
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]);

    const nameInput = screen.getByDisplayValue("Old Name");
    fireEvent.change(nameInput, { target: { value: "Renamed Skill" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(state.setValueMock).toHaveBeenCalledWith("fateSkills", {
      skills: [{ id: "custom-1", name: "Renamed Skill", level: 1 }],
      skillOrder: ["custom-1"],
    });
  });

  it("removes custom skill from skills and skillOrder", () => {
    state.valueMap = {
      fateSkills: {
        skills: [{ id: "custom-1", name: "Custom", level: 1 }],
        skillOrder: ["custom-1"],
      },
    };

    render(
      <FateSkillPyramidFieldRenderer
        field={
          {
            id: "fateSkills",
            type: "fate-skill-pyramid",
            defaultSkills: [],
            allowCustomSkills: false,
          } as never
        }
      />,
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[2]);

    expect(state.setValueMock).toHaveBeenCalledWith("fateSkills", {
      skills: [],
      skillOrder: [],
    });
  });

  it("updates existing skill level and adds new default skill entries", () => {
    state.valueMap = {
      fateSkills: {
        skills: [{ id: "a", name: "Skill:a", level: 1 }],
        skillOrder: ["a", "b"],
      },
    };

    render(
      <FateSkillPyramidFieldRenderer
        field={
          {
            id: "fateSkills",
            type: "fate-skill-pyramid",
            defaultSkills: [
              { id: "a", name: "A" },
              { id: "b", name: "B" },
            ],
            allowCustomSkills: false,
          } as never
        }
      />,
    );

    const levelInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(levelInputs[0], { target: { value: "3" } });
    expect(state.setValueMock).toHaveBeenNthCalledWith(1, "fateSkills", {
      skills: [{ id: "a", name: "Skill:a", level: 3 }],
      skillOrder: ["a", "b"],
    });

    fireEvent.change(levelInputs[1], { target: { value: "2" } });
    expect(state.setValueMock).toHaveBeenNthCalledWith(2, "fateSkills", {
      skills: [
        { id: "a", name: "Skill:a", level: 1 },
        { id: "b", name: "Skill:b", level: 2 },
      ],
      skillOrder: ["a", "b"],
    });
  });

  describe("roll trigger (play mode)", () => {
    it("does not show a roll trigger for a skill at level 0", () => {
      state.editable = true;
      state.setupMode = false;
      state.rollHandlerPresent = true;
      state.valueMap = {
        fateSkills: {
          skills: [{ id: "a", name: "Skill:a", level: 0 }],
          skillOrder: ["a"],
        },
      };

      render(
        <FateSkillPyramidFieldRenderer
          field={
            {
              id: "fateSkills",
              type: "fate-skill-pyramid",
              defaultSkills: [{ id: "a", name: "A" }],
            } as never
          }
        />,
      );

      expect(screen.queryByRole("button", { name: /Roll/ })).toBeNull();
    });

    it("does not show a roll trigger when there is no roll handler (no session)", () => {
      state.editable = true;
      state.setupMode = false;
      state.rollHandlerPresent = false;
      state.valueMap = {
        fateSkills: {
          skills: [{ id: "a", name: "Skill:a", level: 3 }],
          skillOrder: ["a"],
        },
      };

      render(
        <FateSkillPyramidFieldRenderer
          field={
            {
              id: "fateSkills",
              type: "fate-skill-pyramid",
              defaultSkills: [{ id: "a", name: "A" }],
            } as never
          }
        />,
      );

      expect(screen.queryByRole("button", { name: /Roll/ })).toBeNull();
    });

    it("opens the target-value dialog, then rolls fate:4dF+{{@skill}}>={{@target}} with the skill's level and dialog target", async () => {
      state.editable = true;
      state.setupMode = false;
      state.rollHandlerPresent = true;
      state.valueMap = {
        fateSkills: {
          skills: [{ id: "a", name: "Skill:a", level: 3 }],
          skillOrder: ["a"],
        },
      };

      render(
        <FateSkillPyramidFieldRenderer
          field={
            {
              id: "fateSkills",
              type: "fate-skill-pyramid",
              defaultSkills: [{ id: "a", name: "A" }],
            } as never
          }
        />,
      );

      expect(screen.queryByTestId("roll-dialog")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Roll Skill:a" }));
      expect(screen.getByTestId("roll-dialog")).toHaveAttribute(
        "data-title",
        "Skill:a",
      );

      await act(async () => {
        fireEvent.click(screen.getByText("confirm-roll"));
      });

      expect(state.rollExpressionMock).toHaveBeenCalledWith(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: 3, target: 3 },
        "Skill:a",
      );
      expect(screen.queryByTestId("roll-dialog")).toBeNull();
    });
  });
});
