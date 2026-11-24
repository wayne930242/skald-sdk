"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@skald/sheet-sdk/components/ui/dialog";
import { SkillPicker } from "./skill-picker";
import type {
  MasterSkillDef,
  SpecializationGroup,
  SkillItemData,
} from "@skald/types/schema";

// ============================================================================
// Types
// ============================================================================

export interface AddSkillDialogProps {
  /** 可新增的技能列表（排除已有技能） */
  availableSkills: MasterSkillDef[];
  /** 專門技能群組 */
  specializations: SpecializationGroup[];
  /** 當前時代 */
  era: string;
  /** 新增技能回調 */
  onAddSkill: (skill: SkillItemData) => void;
  /** 更新現有技能回調（用於填充空白專門技能格子） */
  onUpdateSkill?: (skillId: string, updates: Partial<SkillItemData>) => void;
  /** 當前技能列表（用於檢查空白專門技能格子） */
  currentSkills?: SkillItemData[];
  /** 觸發按鈕 */
  trigger?: React.ReactNode;
  /** 預設基礎值（自訂技能用） */
  defaultBaseValue?: number;
}

// ============================================================================
// AddSkillDialog Component
// ============================================================================

export function AddSkillDialog({
  availableSkills,
  specializations,
  era,
  onAddSkill,
  trigger,
  defaultBaseValue = 1,
}: AddSkillDialogProps) {
  const t = useTranslations("common");
  const [open, setOpen] = React.useState(false);

  const handleSelectSkill = React.useCallback(
    (skill: SkillItemData) => {
      onAddSkill(skill);
      setOpen(false);
    },
    [onAddSkill],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button
            type="button"
            className="flex items-center gap-0.5 py-[1px] px-1 text-3xs text-muted-foreground hover:text-foreground hover:bg-muted/30 border-b border-r border-border transition-colors print:hidden"
          >
            <Plus className="w-2.5 h-2.5" />
            <span>{t("addSkill")}</span>
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("addSkill")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("addSkillDescription")}
          </DialogDescription>
        </DialogHeader>

        <SkillPicker
          availableSkills={availableSkills}
          specializations={specializations}
          era={era}
          onSelectSkill={handleSelectSkill}
          defaultBaseValue={defaultBaseValue}
          showCustomTab={true}
          className="flex-1 overflow-hidden"
        />
      </DialogContent>
    </Dialog>
  );
}
