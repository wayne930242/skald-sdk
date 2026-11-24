"use client";

import * as React from "react";
import { Search, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@skald/sheet-sdk/components/ui/tabs";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type {
  MasterSkillDef,
  SpecializationGroup,
  SpecializationOption,
  SkillItemData,
} from "@skald/types/schema";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { translateSkillId } from "@skald/sheet-sdk/lib/i18n/schema-key-helpers";
import { resolveSpecializationBase } from "./specialization-base";

// ============================================================================
// Types
// ============================================================================

export interface SkillPickerProps {
  /** 可選的技能列表 */
  availableSkills: MasterSkillDef[];
  /** 專門技能群組 */
  specializations: SpecializationGroup[];
  /** 當前時代 */
  era: string;
  /** 允許選擇的技能 ID 列表（過濾用，如果為空則允許全部） */
  allowedSkillIds?: string[];
  /** 已選擇的技能 ID 列表（用於多選模式） */
  selectedSkillIds?: string[];
  /** 選擇技能回調（單選模式） */
  onSelectSkill?: (skill: SkillItemData) => void;
  /** 切換技能選擇回調（多選模式） */
  onToggleSkill?: (skillId: string, skill: SkillItemData) => void;
  /** 是否為多選模式 */
  multiSelect?: boolean;
  /** 最大選擇數量（多選模式） */
  maxSelect?: number;
  /** 預設基礎值（自訂技能用） */
  defaultBaseValue?: number;
  /** 是否顯示自訂技能 tab */
  showCustomTab?: boolean;
  /** 類別標籤 */
  className?: string;
}

// ============================================================================
// SkillPicker Component
// ============================================================================

export function SkillPicker({
  availableSkills,
  specializations,
  era,
  allowedSkillIds,
  selectedSkillIds = [],
  onSelectSkill,
  onToggleSkill,
  multiSelect = false,
  maxSelect,
  defaultBaseValue = 1,
  showCustomTab = true,
  className,
}: SkillPickerProps) {
  const { t } = useSchemaI18n();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(
    new Set(),
  );

  // 自訂技能表單狀態
  const [customName, setCustomName] = React.useState("");
  const [customBaseValue, setCustomBaseValue] =
    React.useState(defaultBaseValue);

  // 檢查技能是否在允許範圍內
  const isSkillAllowed = React.useCallback(
    (skillId: string): boolean => {
      if (!allowedSkillIds || allowedSkillIds.length === 0) return true;
      return allowedSkillIds.includes(skillId);
    },
    [allowedSkillIds],
  );

  // 過濾可用技能（根據 allowedSkillIds 和搜尋）
  const filteredSkills = React.useMemo(() => {
    let skills = availableSkills.filter((skill) => !skill.retired);

    // 先根據 allowedSkillIds 過濾
    if (allowedSkillIds && allowedSkillIds.length > 0) {
      skills = skills.filter((skill) => isSkillAllowed(skill.id));
    }

    // 再根據搜尋過濾
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      skills = skills.filter((skill) => {
        const name = translateSkillId(t, skill.id);
        return (
          name.toLowerCase().includes(query) ||
          skill.id.toLowerCase().includes(query)
        );
      });
    }

    return skills;
  }, [availableSkills, allowedSkillIds, searchQuery, t, isSkillAllowed]);

  // 過濾專門技能（根據 allowedSkillIds 和搜尋）
  const filteredSpecializations = React.useMemo(() => {
    if (!Array.isArray(specializations)) return [];
    // Retired groups and options stay out of the picker
    let groups = specializations
      .filter((group) => !group.retired)
      .map((group) => ({
        ...group,
        options: group.options.filter((opt) => !opt.retired),
      }))
      .filter((group) => group.options.length > 0);

    // 先根據 allowedSkillIds 過濾選項
    if (allowedSkillIds && allowedSkillIds.length > 0) {
      groups = groups
        .map((group) => {
          // 檢查群組本身是否被允許
          const groupAllowed = allowedSkillIds.some(
            (id) =>
              id === group.id ||
              id.startsWith(group.id) ||
              group.options.some((opt) => opt.id === id),
          );

          if (!groupAllowed) return null;

          // 過濾選項
          const filteredOptions = group.options.filter((opt) =>
            allowedSkillIds.some(
              (id) =>
                id === opt.id || id === group.id || id.startsWith(group.id),
            ),
          );

          // 如果群組被允許但沒有具體選項，返回整個群組（允許任意選擇）
          if (filteredOptions.length === 0 && groupAllowed) {
            return group;
          }

          return { ...group, options: filteredOptions };
        })
        .filter(Boolean) as SpecializationGroup[];
    }

    // 再根據搜尋過濾
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      groups = groups
        .map((group) => {
          const groupName = translateSkillId(t, group.id);

          if (groupName.toLowerCase().includes(query)) {
            return group;
          }

          const filteredOptions = group.options.filter((opt) => {
            const optName = translateSkillId(t, opt.id);
            return optName.toLowerCase().includes(query);
          });

          if (filteredOptions.length > 0) {
            return { ...group, options: filteredOptions };
          }
          return null;
        })
        .filter(Boolean) as SpecializationGroup[];
    }

    return groups;
  }, [specializations, allowedSkillIds, searchQuery, t]);

  // 判斷哪些 tab 應該顯示
  const showAvailableTab = filteredSkills.length > 0 || !allowedSkillIds;
  // Only show specialization tab if there are actually specializations
  const showSpecializationTab = filteredSpecializations.length > 0;
  const showCustom =
    showCustomTab && (!allowedSkillIds || allowedSkillIds.length === 0);

  // 計算預設 tab
  const defaultTab = React.useMemo(() => {
    if (showAvailableTab) return "available";
    if (showSpecializationTab) return "specialization";
    if (showCustom) return "custom";
    return "available";
  }, [showAvailableTab, showSpecializationTab, showCustom]);

  // 切換專門技能群組展開狀態
  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // 取得技能顯示名稱
  const getSkillName = (id: string): string => {
    return translateSkillId(t, id);
  };

  // 建立 SkillItemData
  const createSkillData = (
    skill: MasterSkillDef,
    specializationName?: string,
  ): SkillItemData => {
    const eraConfig = skill.eras[era];
    // Pulp 專屬技能使用 pulpBaseValue，否則使用時代基礎值
    const baseValue = skill.isPulpOnly
      ? (skill.pulpBaseValue ?? defaultBaseValue)
      : typeof eraConfig?.baseValue === "number"
        ? eraConfig.baseValue
        : defaultBaseValue;

    // name 欄位存儲 skill ID，用於 i18n 翻譯查詢
    // 不要存儲翻譯後的名稱，因為 skill-list-input 會再次進行翻譯

    return {
      id: skill.id,
      name: skill.id, // 使用 skill ID 作為 name，供 i18n 翻譯用
      baseValue,
      value: baseValue,
      category: skill.category,
      isSpecialization: skill.isSpecialization,
      specializationName,
      canImprove: skill.canImprove ?? true,
      hiddenByEra: false,
      isUserAdded: true, // 標記為用戶新增的技能，可刪除
    };
  };

  // 建立專門技能 SkillItemData
  const createSpecializationData = (
    group: SpecializationGroup,
    option: SpecializationOption | null,
  ): SkillItemData => {
    // name 欄位存儲 skill ID，用於 i18n 翻譯查詢
    // 不要存儲翻譯後的名稱，因為 skill-list-input 會再次進行翻譯

    if (option === null) {
      // 空白專門技能 - 使用 group.id[timestamp] 格式
      // 這個格式會被 parseSkillId 識別為空白欄位
      return {
        id: `${group.id}[${Date.now()}]`,
        name: group.id, // 使用 group ID 作為 name，供 i18n 翻譯用
        baseValue: defaultBaseValue,
        value: defaultBaseValue,
        category: group.category,
        isSpecialization: true,
        specializationName: "",
        canImprove: true,
        hiddenByEra: false,
        isUserAdded: true, // 標記為用戶新增的技能，可刪除
      };
    }

    // 取得專門名稱用於 specializationName（翻譯後的）
    const optionName = translateSkillId(t, option.id);
    const optionBase = resolveSpecializationBase(option, era);

    return {
      id: option.id,
      name: option.id, // 使用 option ID 作為 name，供 i18n 翻譯用
      baseValue: optionBase,
      value: optionBase,
      category: group.category,
      isSpecialization: true,
      specializationName: optionName,
      canImprove: true,
      hiddenByEra: false,
      isUserAdded: true, // 標記為用戶新增的技能，可刪除
    };
  };

  // 處理技能選擇
  const handleSelectSkill = (skill: MasterSkillDef) => {
    const skillData = createSkillData(skill);

    if (multiSelect && onToggleSkill) {
      onToggleSkill(skill.id, skillData);
    } else if (onSelectSkill) {
      onSelectSkill(skillData);
    }
  };

  // 處理專門技能選擇
  const handleSelectSpecialization = (
    group: SpecializationGroup,
    option: SpecializationOption | null,
  ) => {
    const skillData = createSpecializationData(group, option);
    const skillId = option?.id || group.id;

    if (multiSelect && onToggleSkill) {
      onToggleSkill(skillId, skillData);
    } else if (onSelectSkill) {
      onSelectSkill(skillData);
    }
  };

  // 處理自訂技能
  const handleAddCustom = () => {
    if (!customName.trim()) return;

    const skillData: SkillItemData = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      baseValue: customBaseValue,
      value: customBaseValue,
      category: "custom",
      isSpecialization: false,
      canImprove: true,
      hiddenByEra: false,
    };

    if (onSelectSkill) {
      onSelectSkill(skillData);
    }
    setCustomName("");
    setCustomBaseValue(defaultBaseValue);
  };

  // 檢查是否已選擇
  const isSelected = (skillId: string): boolean => {
    return selectedSkillIds.includes(skillId);
  };

  // 檢查是否可以繼續選擇
  const canSelectMore =
    maxSelect === undefined || selectedSkillIds.length < maxSelect;

  // 如果沒有任何可顯示的 tab，顯示空狀態
  if (!showAvailableTab && !showSpecializationTab && !showCustom) {
    return (
      <div className={cn("text-center text-muted-foreground py-8", className)}>
        {t("sheetUi.noSelectableSkills")}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 搜尋框 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("sheetUi.searchSkills")}
          className="pl-9"
        />
      </div>

      {/* 分頁內容 */}
      <Tabs
        defaultValue={defaultTab}
        className="flex-1 overflow-hidden flex flex-col"
      >
        <TabsList
          className={cn("grid w-full", {
            "grid-cols-3":
              showAvailableTab && showSpecializationTab && showCustom,
            "grid-cols-2":
              [showAvailableTab, showSpecializationTab, showCustom].filter(
                Boolean,
              ).length === 2,
            "grid-cols-1":
              [showAvailableTab, showSpecializationTab, showCustom].filter(
                Boolean,
              ).length === 1,
          })}
        >
          {showAvailableTab && (
            <TabsTrigger value="available">
              {t("sheetUi.tabAvailableSkills")}
            </TabsTrigger>
          )}
          {showSpecializationTab && (
            <TabsTrigger value="specialization">
              {t("sheetUi.tabSpecializationSkills")}
            </TabsTrigger>
          )}
          {showCustom && <TabsTrigger value="custom">{t("sheetUi.tabCustom")}</TabsTrigger>}
        </TabsList>

        {/* 可用技能列表 */}
        {showAvailableTab && (
          <TabsContent
            value="available"
            className="flex-1 overflow-y-auto mt-2"
          >
            {filteredSkills.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t("sheetUi.noMatchingSkills")}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredSkills.map((skill) => {
                  const eraConfig = skill.eras[era];
                  // Pulp 專屬技能使用 pulpBaseValue，否則使用時代基礎值
                  const baseValue = skill.isPulpOnly
                    ? (skill.pulpBaseValue ?? defaultBaseValue)
                    : typeof eraConfig?.baseValue === "number"
                      ? eraConfig.baseValue
                      : defaultBaseValue;
                  const selected = isSelected(skill.id);
                  const disabled = multiSelect && !canSelectMore && !selected;

                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => handleSelectSkill(skill)}
                      disabled={disabled}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors",
                        selected
                          ? "state-selected text-foreground"
                          : "hover:bg-muted",
                        disabled && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {multiSelect && selected && (
                          <Check className="w-4 h-4" />
                        )}
                        {getSkillName(skill.id)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        ({baseValue})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}

        {/* 專門技能列表 */}
        {showSpecializationTab && (
          <TabsContent
            value="specialization"
            className="flex-1 overflow-y-auto mt-2"
          >
            {filteredSpecializations.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t("sheetUi.noMatchingSpecializationSkills")}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredSpecializations.map((group) => (
                  <div key={group.id} className="border rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {expandedGroups.has(group.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span>{getSkillName(group.id)}</span>
                      <span className="text-muted-foreground text-xs ml-auto">
                        {t("sheetUi.specializationOptionsCount", {
                          count: group.options.length,
                        })}
                      </span>
                    </button>
                    {expandedGroups.has(group.id) && (
                      <div className="border-t">
                        {/* 空白選項 */}
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectSpecialization(group, null)
                          }
                          disabled={multiSelect && !canSelectMore}
                          className={cn(
                            "w-full flex items-center justify-between pl-9 pr-3 py-1.5 text-sm transition-colors text-muted-foreground italic",
                            multiSelect && !canSelectMore
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:bg-muted",
                          )}
                        >
                          <span>{t("sheetUi.specializationBlankOption")}</span>
                          <span className="text-xs">({defaultBaseValue})</span>
                        </button>
                        {/* 具體選項 */}
                        {group.options.map((option) => {
                          const selected = isSelected(option.id);
                          const disabled =
                            multiSelect && !canSelectMore && !selected;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() =>
                                handleSelectSpecialization(group, option)
                              }
                              disabled={disabled}
                              className={cn(
                                "w-full flex items-center justify-between pl-9 pr-3 py-1.5 text-sm transition-colors",
                                selected
                                  ? "state-selected text-foreground"
                                  : "hover:bg-muted",
                                disabled && "opacity-50 cursor-not-allowed",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                {multiSelect && selected && (
                                  <Check className="w-4 h-4" />
                                )}
                                {getSkillName(option.id)}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                ({resolveSpecializationBase(option, era)})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* 自訂技能 */}
        {showCustom && (
          <TabsContent value="custom" className="mt-2 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("sheetUi.customSkillName")}
              </label>
              <Input
                autoComplete="off"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t("sheetUi.customSkillNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("sheetUi.baseValue")}</label>
              <Input
                autoComplete="off"
                type="number"
                min={0}
                max={99}
                value={customBaseValue}
                onChange={(e) =>
                  setCustomBaseValue(parseInt(e.target.value, 10) || 1)
                }
              />
            </div>
            <Button
              onClick={handleAddCustom}
              disabled={!customName.trim()}
              className="w-full"
            >
              {t("sheetUi.addCustomSkill")}
            </Button>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
