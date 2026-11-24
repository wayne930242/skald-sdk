"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateStressTrackField, FateSkillPyramidSkill } from "@skald/types/schema";
import {
  useFieldValue,
  useFieldSetter,
  useSchema,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import type { FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { TrackCell } from "@skald/sheet-sdk/modules/character/ui/renderer/primitives/track-cell";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { readFateStress, updateFateSplitStress } from "../domain/normalize";

// 預設壓力格門檻
const DEFAULT_THRESHOLDS = [
  { skillLevel: 0, totalBoxes: 3 },
  { skillLevel: 1, totalBoxes: 4 },
  { skillLevel: 3, totalBoxes: 6 },
];

interface SkillsData {
  skills: FateSkillPyramidSkill[];
}

export function FateStressTrackFieldRenderer({
  field,
}: FieldRendererProps<FateStressTrackField>) {
  const rawData = useFieldValue<number[] | Record<string, boolean>>(field.id);
  const system = useSystemOptional();
  const builtinTrack = system?.systemId === "fate-condensed" && system.builtinTemplate === true &&
    (field.id === "physicalStress" || field.id === "mentalStress") ? field.id : undefined;

  // Handle both array format (new) and object format (legacy)
  const checkedBoxes: number[] = React.useMemo(() => {
    if (builtinTrack) return readFateStress(rawData);
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    // Convert legacy object format { stress1: true, stress2: false } to array [1]
    if (typeof rawData === "object") {
      return Object.entries(rawData)
        .filter(([, checked]) => checked)
        .map(([key]) => {
          const match = key.match(/stress(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => n > 0);
    }
    return [];
  }, [rawData, builtinTrack]);

  const setValue = useFieldSetter();
  const { editable, data: characterData, setData, onBlur } = useSchema();
  const canToggle = editable && (!builtinTrack || Boolean(setData));
  const { resolveI18n, t } = useSchemaI18n();

  // 取得配置
  const baseBoxes = field.baseBoxes ?? 3;
  const thresholds = field.bonusThresholds ?? DEFAULT_THRESHOLDS;

  // 取得關聯技能等級
  const linkedSkillLevel = React.useMemo(() => {
    if (!field.skillPyramidField || !field.linkedSkillId) return 0;

    const skillData = characterData?.[field.skillPyramidField] as
      | SkillsData
      | undefined;
    if (!skillData?.skills) return 0;

    const skill = skillData.skills.find((s) => s.id === field.linkedSkillId);
    return skill?.level ?? 0;
  }, [field.skillPyramidField, field.linkedSkillId, characterData]);

  // 計算總格數
  const totalBoxes = React.useMemo(() => {
    let boxes = baseBoxes;
    for (const threshold of thresholds) {
      if (linkedSkillLevel >= threshold.skillLevel) {
        boxes = threshold.totalBoxes;
      }
    }
    return boxes;
  }, [linkedSkillLevel, baseBoxes, thresholds]);

  // 處理勾選
  const handleToggle = (boxIndex: number) => {
    if (!canToggle) return;
    const toggle = (marks: readonly number[]) => marks.includes(boxIndex)
      ? marks.filter(mark => mark !== boxIndex) : [...marks, boxIndex];
    if (builtinTrack && setData) {
      setData(previous => updateFateSplitStress(previous, builtinTrack, toggle));
      onBlur?.();
    } else {
      setValue(field.id, toggle(checkedBoxes));
    }
  };

  // 取得顯示標籤
  const getLabel = () => {
    if (!field.label) return "";
    const label = resolveI18n(field.label);
    const normalizedLabel = label.toLowerCase();
    const normalizedFieldId = field.id.toLowerCase();
    const linkedSkillId = field.linkedSkillId?.toLowerCase();

    // Physical track
    if (
      normalizedFieldId.includes("physical") ||
      normalizedLabel.includes("physical") ||
      linkedSkillId === "physique"
    ) {
      return t("sheetUi.physicalShort");
    }
    // Mental track
    if (
      normalizedFieldId.includes("mental") ||
      normalizedLabel.includes("mental") ||
      linkedSkillId === "will"
    ) {
      return t("sheetUi.mentalShort");
    }
    return label;
  };

  const outOfCapacity = builtinTrack ? checkedBoxes.filter(mark => mark > totalBoxes) : [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium w-8">{getLabel()}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: totalBoxes }, (_, i) => {
          const boxIndex = i + 1;
          const isChecked = checkedBoxes.includes(boxIndex);
          // 前 3 格恆常存在，其後是靠技能等級解鎖的加成格
          const isBonus = boxIndex > 3;

          return (
            <TrackCell
              key={boxIndex}
              size="md"
              active={isChecked}
              dashed={isBonus && !isChecked}
              disabled={!canToggle}
              onClick={() => handleToggle(boxIndex)}
              className={cn(isBonus && !isChecked && "text-muted-foreground")}
            >
              1
            </TrackCell>
          );
        })}
      </div>
      {outOfCapacity.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {t("stress.inactive", {
            marks: outOfCapacity.map(String).reduce((previous, mark) => t("stress.markPair", { previous, mark })),
          })}
        </span>
      )}
    </div>
  );
}

// Self-register
