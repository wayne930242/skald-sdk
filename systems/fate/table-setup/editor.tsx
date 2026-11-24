"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Switch } from "@skald/sheet-sdk/components/ui/switch";
import type { TableSetupCharacterRecipe, TableSetupEditorProps, TableSetupPolicy } from "@skald/sheet-sdk/modules/systems";
import {
  applyFateRecipe,
  FATE_PRESET_AXES,
  fateAxisOptions,
  loadFatePresetCatalog,
  type FatePresetAxis,
  type FatePresetCatalog,
  type FatePresetSelection,
} from "../domain/presets";
import { importFateCharacterRecipe } from "./character-recipe";
import {
  FATE_NEW_ITEM_POLICY,
  FATE_POINT_OVERRIDES,
  type FatePointOverride,
  type FateTableSetupConfig,
} from "./config";

const CONTROL = "min-h-11 min-w-0 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const BUTTON = "inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60";
/** The select's value for an axis the table leaves to the player. */
const PLAYER_CHOICE = "__player__";

/**
 * The GM's Fate recipe for a table (ADR 0016 S2): the recipe dialog's shortcuts and axis choices,
 * each set item with its policy (locked or a default players may change), and the point-buy
 * numbers. What it stores is the result, never the shortcut pressed.
 */
export function FateTableSetupEditor({ config, onChange, disabled, listCharacterRecipes }: TableSetupEditorProps<FateTableSetupConfig>) {
  const t = useTranslations("fateTableSetup");
  const [catalog, setCatalog] = useState<FatePresetCatalog | null | "failed">(null);
  const [cards, setCards] = useState<readonly TableSetupCharacterRecipe[] | "loading" | "failed" | null>(null);
  const pickerId = useId();
  useEffect(() => {
    let live = true;
    loadFatePresetCatalog().then(
      (loaded) => { if (live) setCatalog(loaded); },
      () => { if (live) setCatalog("failed"); },
    );
    return () => { live = false; };
  }, []);
  if (catalog === "failed") return <p className="text-sm text-destructive">{t("editor.failed")}</p>;
  if (!catalog) return <p className="text-sm text-muted-foreground" role="status">{t("editor.loading")}</p>;

  const preset = catalog.presets.find((entry) => entry.id === config.presetId)
    ?? catalog.presets.find((entry) => entry.id === catalog.defaultPreset)
    ?? catalog.presets[0];
  // What a new card would get: the preset's axes with the table's values over them.
  const effective: FatePresetSelection = { ...preset.axes };
  for (const axis of FATE_PRESET_AXES) {
    const value = config.selection[axis]?.value;
    if (value) effective[axis] = value;
  }
  const allocation = catalog.allocations.find((entry) => entry.id === effective.allocation);

  const setAxis = (axis: FatePresetAxis, value: string | null) => {
    const selection = { ...config.selection };
    if (value === null) delete selection[axis];
    else selection[axis] = { value, policy: config.selection[axis]?.policy ?? FATE_NEW_ITEM_POLICY };
    onChange({ ...config, presetId: preset.id, selection });
  };
  const setAxisPolicy = (axis: FatePresetAxis, policy: TableSetupPolicy) => {
    const item = config.selection[axis];
    if (item) onChange({ ...config, selection: { ...config.selection, [axis]: { ...item, policy } } });
  };
  const setOverride = (key: FatePointOverride, value: number | null) => {
    const overrides = { ...config.overrides };
    if (value === null) delete overrides[key];
    else overrides[key] = { value, policy: config.overrides[key]?.policy ?? FATE_NEW_ITEM_POLICY };
    onChange({ ...config, overrides });
  };
  const setOverridePolicy = (key: FatePointOverride, policy: TableSetupPolicy) => {
    const item = config.overrides[key];
    if (item) onChange({ ...config, overrides: { ...config.overrides, [key]: { ...item, policy } } });
  };
  const applyRecipe = (recipeId: string) => {
    const result = applyFateRecipe(effective, recipeId, catalog);
    if (!result.ok) return;
    const selection = { ...config.selection };
    for (const axis of FATE_PRESET_AXES) {
      if (result.selection[axis] !== effective[axis]) {
        selection[axis] = { value: result.selection[axis], policy: config.selection[axis]?.policy ?? FATE_NEW_ITEM_POLICY };
      }
    }
    onChange({ ...config, presetId: preset.id, selection });
  };
  const loadCards = async () => {
    if (!listCharacterRecipes) return;
    setCards("loading");
    try {
      setCards(await listCharacterRecipes(["fateV2", "preset"]));
    } catch {
      setCards("failed");
    }
  };

  return (
    <div className="space-y-4" data-fate-table-setup-editor="">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("editor.shortcuts")}</legend>
        <p className="text-xs text-muted-foreground">{t("editor.shortcutsHint")}</p>
        <div className="flex flex-wrap gap-2">
          {catalog.recipes.filter((recipe) => recipe.set).map((recipe) => (
            <button key={recipe.id} type="button" className={BUTTON} disabled={disabled} onClick={() => applyRecipe(recipe.id)}>
              {t(`recipes.${recipe.id}`)}
            </button>
          ))}
          {listCharacterRecipes && (
            <button type="button" className={BUTTON} disabled={disabled || cards === "loading"} onClick={() => void loadCards()}>
              {t("editor.importRecipe")}
            </button>
          )}
        </div>
        {cards === "loading" && <p className="text-sm text-muted-foreground" role="status">{t("editor.importLoading")}</p>}
        {cards === "failed" && <p className="text-sm text-destructive" role="alert">{t("editor.importFailed")}</p>}
        {cards && typeof cards !== "string" && (cards.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">{t("editor.importEmpty")}</p>
        ) : (
          <div className="space-y-1 sm:max-w-sm">
            <label htmlFor={pickerId} className="text-sm">{t("editor.importChoose")}</label>
            <select id={pickerId} className={CONTROL} value="" disabled={disabled} onChange={(event) => {
              const card = cards.find(({ id }) => id === event.target.value);
              if (card) onChange(importFateCharacterRecipe(config, card.recipe, catalog));
            }}>
              <option value="" disabled>{t("editor.importPlaceholder")}</option>
              {(["vault", "table"] as const).map((location) => {
                const group = cards.filter((card) => card.location === location);
                return group.length > 0 && (
                  <optgroup key={location} label={t(`editor.importLocation.${location}`)}>
                    {group.map((card) => <option value={card.id} key={card.id}>{card.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("editor.choices")}</legend>
        {FATE_PRESET_AXES.map((axis) => {
          const item = config.selection[axis];
          const known = !item || fateAxisOptions(catalog, axis).some((option) => option.id === item.value);
          return (
            <ItemRow
              key={axis}
              id={`fate-setup-${axis}`}
              label={t(`items.${axis}`)}
              policy={item?.policy}
              disabled={disabled}
              onPolicy={(policy) => setAxisPolicy(axis, policy)}
              warning={known ? undefined : t("editor.unknownOption")}
            >
              <select
                id={`fate-setup-${axis}`}
                className={CONTROL}
                value={item?.value ?? PLAYER_CHOICE}
                disabled={disabled}
                onChange={(event) => setAxis(axis, event.target.value === PLAYER_CHOICE ? null : event.target.value)}
              >
                <option value={PLAYER_CHOICE}>{t("editor.playerChoice")}</option>
                {!known && item && <option value={item.value}>{item.value}</option>}
                {fateAxisOptions(catalog, axis).map((option) => (
                  <option key={option.id} value={option.id}>{t(`options.${axis}.${option.id}`)}</option>
                ))}
              </select>
            </ItemRow>
          );
        })}
      </fieldset>
      {allocation?.kind === "pointBuy" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("editor.points")}</legend>
          <p className="text-xs text-muted-foreground">{t("editor.pointsHint")}</p>
          {FATE_POINT_OVERRIDES.map((key) => {
            const item = config.overrides[key];
            const book = key === "pointBudget" ? allocation.budget : allocation.cap;
            return (
              <ItemRow
                key={key}
                id={`fate-setup-${key}`}
                label={t(`items.${key}`)}
                policy={item?.policy}
                disabled={disabled}
                onPolicy={(policy) => setOverridePolicy(key, policy)}
              >
                <input
                  id={`fate-setup-${key}`}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className={CONTROL}
                  placeholder={String(book)}
                  value={item?.value ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setOverride(key, event.target.value === "" || !Number.isSafeInteger(value) || value < 1 ? null : value);
                  }}
                />
              </ItemRow>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

/** One item: its control, and its policy once the table sets it (D1). */
function ItemRow({ id, label, policy, disabled, onPolicy, warning, children }: {
  id: string;
  label: string;
  policy: TableSetupPolicy | undefined;
  disabled?: boolean;
  onPolicy: (policy: TableSetupPolicy) => void;
  warning?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("fateTableSetup.editor");
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)_11rem] sm:items-center sm:gap-3" data-fate-setup-item={id}>
      <label htmlFor={id} className="text-sm">{label}</label>
      {children}
      {policy ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch
            checked={policy === "locked"}
            disabled={disabled}
            aria-label={t("policy", { item: label })}
            onCheckedChange={(checked) => onPolicy(checked ? "locked" : "default")}
          />
          {policy === "locked" ? (
            <span className="inline-flex items-center gap-1"><Lock className="size-3" aria-hidden="true" />{t("locked")}</span>
          ) : (
            <span className="text-muted-foreground">{t("default")}</span>
          )}
        </label>
      ) : <span aria-hidden="true" />}
      {warning && <p className="text-xs text-destructive sm:col-start-2">{warning}</p>}
    </div>
  );
}
