"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_FATE_SKILLS } from "@skald/sheet-sdk/modules/character/ui/renderer/utils/fate-default-skills";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { Pencil, Check, Plus, X } from "lucide-react";
import type {
  FateSkillPyramidField,
  FateSkillPyramidSkill,
  FateLinkedSkill,
} from "@skald/types/schema";
import {
  useFieldValue,
  useFieldSetter,
  useSchema,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import type { FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useRollHandler } from "@skald/sheet-sdk/modules/character/ui/renderer/hooks";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@skald/sheet-sdk/components/ui/tooltip";
import {
  SortableList,
  DragHandle,
  type SortableItem,
  type DragHandleProps,
} from "@skald/sheet-sdk/modules/character/ui/renderer/components";
import { SheetRollControl } from "@skald/sheet-sdk/modules/rolls/ui/dice/sheet-roll-control";
import { RollDialog } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-dialog";
import type { DialogConfig } from "@skald/dice/roll-expression";

// Fate skill checks are roll-over (4dF + skill vs. a GM-set difficulty), so
// unlike CoC7e's roll-under skills the target isn't inherent to the skill
// value — the roller supplies it at roll time via this dialog.
const FATE_ROLL_DIALOG_CONFIG: DialogConfig = {
  input: { id: "target", min: -4, max: 10 },
};


interface SkillsData {
  skills: FateSkillPyramidSkill[];
  skillOrder?: string[]; // 技能順序
}

// Item type for SortableList
interface SkillItem extends SortableItem {
  id: string;
}

export function FateSkillPyramidFieldRenderer({
  field,
}: FieldRendererProps<FateSkillPyramidField>) {
  const rawData = useFieldValue<SkillsData>(field.id);
  const data: SkillsData = React.useMemo(
    () => rawData ?? { skills: [] },
    [rawData]
  );
  const setValue = useFieldSetter();
  const { editable, setupMode } = useSchema();
  const { resolveI18n } = useSchemaI18n();
  const tRenderer = useTranslations("renderer");
  const rollHandler = useRollHandler();
  const [rollDialogSkill, setRollDialogSkill] = React.useState<{
    id: string;
    name: string;
    level: number;
  } | null>(null);

  const handleRollDialogConfirm = React.useCallback(
    async (values: Record<string, number | string>) => {
      if (!rollDialogSkill || !rollHandler) return;
      const target = typeof values.target === "number" ? values.target : 0;
      await rollHandler.rollExpression(
        "fate:4dF+{{@skill}}>={{@target}}",
        { skill: rollDialogSkill.level, target },
        rollDialogSkill.name,
      );
      setRollDialogSkill(null);
    },
    [rollDialogSkill, rollHandler],
  );

  const defaultSkills = field.defaultSkills ?? DEFAULT_FATE_SKILLS;
  const skillI18nPrefix = field.skillI18nPrefix ?? "skill";
  const allowCustomSkills = field.allowCustomSkills ?? true;
  const linkedSkills = React.useMemo(
    () => field.linkedSkills ?? [],
    [field.linkedSkills]
  );

  // Create a map for quick lookup of linked skills
  const linkedSkillsMap = React.useMemo(() => {
    const map = new Map<string, FateLinkedSkill>();
    for (const ls of linkedSkills) {
      map.set(ls.skillId, ls);
    }
    return map;
  }, [linkedSkills]);

  // Editing state for skill names
  const [editingSkillId, setEditingSkillId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  // Compute ordered skill list
  const orderedSkills = React.useMemo(() => {
    const defaultIds = defaultSkills.map((s) => s.id);
    const customIds = data.skills
      .filter((s) => !defaultIds.includes(s.id))
      .map((s) => s.id);

    // Use stored order if available, otherwise use default order
    if (data.skillOrder && data.skillOrder.length > 0) {
      // Filter to only include valid skill IDs
      const validIds = new Set([...defaultIds, ...customIds]);
      const orderedIds = data.skillOrder.filter((id) => validIds.has(id));
      // Add any missing IDs at the end
      const missingIds = [...defaultIds, ...customIds].filter(
        (id) => !orderedIds.includes(id)
      );
      return [...orderedIds, ...missingIds];
    }

    return [...defaultIds, ...customIds];
  }, [defaultSkills, data.skills, data.skillOrder]);

  // Convert to items format for SortableList
  const skillItems: SkillItem[] = React.useMemo(
    () => orderedSkills.map((id) => ({ id })),
    [orderedSkills]
  );

  // Handle reorder from SortableList
  const handleReorder = React.useCallback(
    (newItems: SkillItem[]) => {
      const newOrder = newItems.map((item) => item.id);
      setValue(field.id, {
        ...data,
        skillOrder: newOrder,
      });
    },
    [setValue, field.id, data]
  );

  // Generate unique ID for new skill
  const generateSkillId = () => {
    return `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  };

  // Add new custom skill
  const handleAddCustomSkill = () => {
    const newSkillId = generateSkillId();
    const newSkillName = resolveI18n("{{i18n:skill.newSkill}}");
    setValue(field.id, {
      ...data,
      skills: [
        ...data.skills,
        { id: newSkillId, name: newSkillName, level: 0 },
      ],
      skillOrder: [...orderedSkills, newSkillId],
    });
    // Start editing the new skill immediately
    setEditingSkillId(newSkillId);
    setEditingName(newSkillName);
  };

  // Remove custom skill
  const handleRemoveCustomSkill = (skillId: string) => {
    setValue(field.id, {
      ...data,
      skills: data.skills.filter((s) => s.id !== skillId),
      skillOrder: orderedSkills.filter((id) => id !== skillId),
    });
  };

  // 取得技能名稱（支援 i18n 和自訂名稱）
  const getSkillName = React.useCallback(
    (skillId: string): string => {
      // Check if there's a custom name in the data
      const savedSkill = data.skills.find((s) => s.id === skillId);
      if (savedSkill?.name) {
        return savedSkill.name;
      }
      // Check if it's a default skill
      const defaultSkill = defaultSkills.find((s) => s.id === skillId);
      if (defaultSkill) {
        const i18nKey = `${skillI18nPrefix}.${skillId}`;
        const resolved = resolveI18n(`{{i18n:${i18nKey}}}`);
        return resolved !== i18nKey ? resolved : defaultSkill.name;
      }
      return skillId;
    },
    [resolveI18n, skillI18nPrefix, data.skills, defaultSkills]
  );

  // 取得技能等級
  const getSkillLevel = (skillId: string): number => {
    const skill = data.skills.find((s) => s.id === skillId);
    return skill?.level ?? 0;
  };

  // 更新技能等級
  const handleLevelChange = (skillId: string, level: number) => {
    const existingSkill = data.skills.find((s) => s.id === skillId);
    const isDefault = defaultSkills.some((s) => s.id === skillId);

    if (level === 0 && !existingSkill?.name && isDefault) {
      // For default skills with level 0 and no custom name, remove from data but keep in order
      setValue(field.id, {
        ...data,
        skills: data.skills.filter((s) => s.id !== skillId),
      });
    } else if (existingSkill) {
      // Update existing skill
      setValue(field.id, {
        ...data,
        skills: data.skills.map((s) =>
          s.id === skillId ? { ...s, level } : s
        ),
      });
    } else {
      // Add new skill entry
      setValue(field.id, {
        ...data,
        skills: [
          ...data.skills,
          {
            id: skillId,
            name: getSkillName(skillId),
            level,
          },
        ],
      });
    }
  };

  // 更新技能名稱
  const handleNameChange = (skillId: string, name: string) => {
    const existingSkill = data.skills.find((s) => s.id === skillId);

    if (existingSkill) {
      setValue(field.id, {
        ...data,
        skills: data.skills.map((s) =>
          s.id === skillId ? { ...s, name } : s
        ),
      });
    } else {
      // Add skill with custom name
      setValue(field.id, {
        ...data,
        skills: [
          ...data.skills,
          { id: skillId, name, level: 0 },
        ],
      });
    }
  };

  const handleStartEditName = (skillId: string, currentName: string) => {
    setEditingSkillId(skillId);
    setEditingName(currentName);
  };

  const handleSaveName = (skillId: string) => {
    if (editingName.trim()) {
      handleNameChange(skillId, editingName.trim());
    }
    setEditingSkillId(null);
    setEditingName("");
  };

  // Check if a skill is custom (not in default list)
  const isCustomSkill = (skillId: string) => {
    return !defaultSkills.some((s) => s.id === skillId);
  };

  // Render a skill row
  const renderSkillRow = (
    item: SkillItem,
    _index: number,
    dragHandleProps: DragHandleProps
  ) => {
    const skillId = item.id;
    const level = getSkillLevel(skillId);
    const name = getSkillName(skillId);
    const linkedSkill = linkedSkillsMap.get(skillId);
    const isLinked = !!linkedSkill;
    const isCustom = isCustomSkill(skillId);
    const isEditing = editingSkillId === skillId;
    const linkedTooltip = linkedSkill
      ? resolveI18n(linkedSkill.linkedTo)
      : undefined;

    const skillNameElement = (
      <span
        className={cn(
          "text-sm text-left flex-1",
          level === 0 && "text-muted-foreground",
          isLinked && "border-b border-dashed border-primary/50"
        )}
      >
        {name}
      </span>
    );

    return (
      <div className="flex items-center gap-1 py-0.5 group">
        {editable && (
          <DragHandle
            {...dragHandleProps}
            className="opacity-0 group-hover:opacity-100 [&>svg]:h-3 [&>svg]:w-3"
          />
        )}

        {editable ? (
          <Input
            type="number"
            value={level || ""}
            onChange={(e) => {
              const val =
                e.target.value === "" ? 0 : parseInt(e.target.value, 10);
              handleLevelChange(skillId, isNaN(val) ? 0 : val);
            }}
            className="w-10 h-6 text-xs text-center p-0 border-0 border-b border-border rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min={-4}
            max={8}
          />
        ) : (
          <span className="w-10 text-xs text-center border-b border-border">
            {level !== 0 ? (level > 0 ? `+${level}` : level) : ""}
          </span>
        )}

        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName(skillId);
                if (e.key === "Escape") setEditingSkillId(null);
              }}
              className="h-6 text-sm flex-1"
              autoFocus
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={() => handleSaveName(skillId)}
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            {isLinked && linkedTooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>{skillNameElement}</TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{linkedTooltip}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              skillNameElement
            )}
            {editable && (
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 opacity-0 group-hover:opacity-100 print:hidden"
                onClick={() => handleStartEditName(skillId, name)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {editable && isCustom && (
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 opacity-0 group-hover:opacity-100 text-destructive print:hidden"
                onClick={() => handleRemoveCustomSkill(skillId)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            {!setupMode && rollHandler && level !== 0 && (
              <SheetRollControl
                ariaLabel={tRenderer("rollField", { name })}
                className="opacity-0 group-hover:opacity-100 print:hidden"
                onRoll={() =>
                  setRollDialogSkill({ id: skillId, name, level })
                }
              />
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <SortableList
        items={skillItems}
        onReorder={handleReorder}
        disabled={!editable}
        className="grid grid-cols-2 gap-x-4 gap-y-0.5"
        renderItem={renderSkillRow}
      />

      {editable && allowCustomSkills && (
        <Button
          variant="outline"
          size="sm"
          className="w-full print:hidden"
          onClick={handleAddCustomSkill}
        >
          <Plus className="h-4 w-4 mr-2" />
          {resolveI18n("{{i18n:skill.add}}")}
        </Button>
      )}

      {rollHandler && (
        <RollDialog
          open={rollDialogSkill !== null}
          onOpenChange={(open) => {
            if (!open) setRollDialogSkill(null);
          }}
          config={FATE_ROLL_DIALOG_CONFIG}
          onConfirm={handleRollDialogConfirm}
          title={rollDialogSkill?.name}
        />
      )}
    </div>
  );
}

// Self-register
