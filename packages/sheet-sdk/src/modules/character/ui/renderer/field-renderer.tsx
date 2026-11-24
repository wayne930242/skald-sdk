// modules/character/ui/renderer/field-renderer.tsx
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type {
  Field,
  FieldReference,
  RollConfigShorthand,
} from "@skald/types/schema";
import type { RollConfig } from "@skald/dice/roll-expression";
import { useDerivedFormulaValue, useSchemaStatic } from "./schema-context";
import { usePrintHygiene } from "./print-hygiene";
import { getFieldRenderer } from "./registry";
import { RollableField } from "./rollable-field";
import { DerivedValueField } from "./derived-value-field";
import { FieldDisplayProvider } from "./field-display";
import {
  resolveFieldLayout,
  resolveResponsive,
  useSheetBreakpoint,
} from "./sheet-breakpoint";
import { TileRollScope, isTileDisplay } from "./stat-tile";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { resolveI18nDeep } from "@skald/sheet-sdk/lib/i18n/schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { fieldRendererKey } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";

// Import all renderers (side-effect: registers them)
import "./renderers";

/**
 * 展開 roll 設定簡寫
 * - `true` 或 `"self"` → 自動生成 `coc7:1d100<={{@fieldId}}`
 */
function expandRollConfig(
  roll: RollConfigShorthand | undefined,
  fieldId: string,
): RollConfig | undefined {
  if (!roll) return undefined;
  if (roll === true || roll === "self") {
    return {
      expression: `coc7:1d100<={{@${fieldId}}}`,
      target: "session",
    };
  }
  return roll;
}

export interface FieldRendererProps {
  field?: Field;
  fieldRef?: FieldReference;
}

/**
 * 沒有明確設定寬度時，這些型別的內容本身就短（開關、勾選格），用 `.skald-field`
 * 的預設 block 寬度（填滿容器）會留下一大片空白。`w-fit` 對 flex-col 的 stretch
 * cross-axis、grid 的 justify-items:stretch 都有效，而且不管 `.skald-field` 是
 * 直接的 flex/grid item（live sheet/Preview），還是巢狀在 CanvasElementChrome
 * 的純 block div 底下（畫布模式，`align-self` 在那裡不會生效），shrink-to-fit
 * 的寬度計算方式都一樣——這也是選 `w-fit` 而不是 `align-self` 的原因。
 *
 * number 型別故意不在這裡：預設 labelPosition:"left" + underline 是「標籤 + 底線
 * 延伸」的慣例排版，不是這個 bug；要不要把它也做成緊湊樣式是視覺方向的決定，
 * 留給 Phase 3/4。
 */
const COMPACT_FIELD_TYPES: ReadonlySet<Field["type"]> = new Set([
  "toggle",
  "checkbox-track",
]);

function FieldRendererComponent({ field, fieldRef }: FieldRendererProps) {
  const { schema, viewMode, editable, wrapCanvasElement } = useSchemaStatic();
  const { resolveI18n } = useSchemaI18n();
  const t = useTranslations("renderer");
  const { fieldRenderers } = useSystemPluginUi();
  const systemId = useSystemOptional()?.systemId;
  const hasSemanticGrid = !!fieldRef?.printGrid;
  // 只有 views.web 底下才有斷點；舊版面是 null，下面的 display／at 都不生效
  const breakpoint = useSheetBreakpoint();

  // Resolve field reference if provided
  const resolvedField = fieldRef ? schema.fields[fieldRef.fieldId] : field;
  const derived = useDerivedFormulaValue(
    resolvedField?.id ?? fieldRef?.fieldId ?? "",
  );
  const printHygiene = usePrintHygiene();

  if (!resolvedField) {
    console.warn(`Field not found: ${fieldRef?.fieldId}`);
    return null;
  }

  // 隱藏欄位（FieldBase.hidden）永久不渲染，與 visibleWhen 的條件式顯示不同——
  // 不論 live sheet、Preview 或編輯畫布都不出現；管理入口是 schema 編輯器的
  // 欄位清單，不是視覺畫布。
  if (resolvedField.hidden) {
    return null;
  }

  // Merge layout overrides and roll config from fieldRef
  const fieldId = fieldRef?.fieldId ?? "";
  const rawRoll = fieldRef?.roll ?? resolvedField.roll;
  const expandedRoll = expandRollConfig(rawRoll, fieldId);

  // Resolve i18n in labels and placeholders
  const rawLabel = fieldRef?.label ?? resolvedField.label;
  const resolvedLabel = resolveI18n(rawLabel);
  const rawPlaceholder = (resolvedField as { placeholder?: string }).placeholder;
  const resolvedPlaceholder = rawPlaceholder
    ? resolveI18n(rawPlaceholder)
    : undefined;

  const fieldRefLayout =
    fieldRef && breakpoint
      ? resolveFieldLayout(fieldRef.layout, fieldRef.at, breakpoint)
      : fieldRef?.layout;
  const display =
    fieldRef?.display !== undefined && breakpoint
      ? resolveResponsive(fieldRef.display, breakpoint)
      : undefined;

  const mergedField = fieldRef
    ? {
        ...resolvedField,
        layout: { ...resolvedField.layout, ...fieldRefLayout },
        label: resolvedLabel,
        placeholder: resolvedPlaceholder,
        roll: expandedRoll,
      }
    : {
        ...resolvedField,
        label: resolvedLabel,
        placeholder: resolvedPlaceholder,
        roll: expandedRoll,
      };

  const i18nField = resolveI18nDeep(mergedField, resolveI18n);

  // Build layout style for flexbox containers
  const layoutStyle: React.CSSProperties & Record<string, string | number> = {};
  if (i18nField.layout) {
    // When semantic 12-grid is present, width is resolved by renderer rules
    // (web + print), so legacy width should not override it.
    if (!hasSemanticGrid) {
      const width =
        viewMode === "print"
          ? i18nField.printWidth ?? i18nField.layout.width
          : i18nField.layout.width;
      if (width === "fill") {
        layoutStyle.flex = 1;
        layoutStyle.minWidth = 0;
      } else if (typeof width === "string" && width.endsWith("fr")) {
        const fr = Number.parseFloat(width.slice(0, -2));
        if (Number.isFinite(fr) && fr > 0) {
          // Flex item ratio support (e.g. "2fr") for row layouts.
          layoutStyle.flex = `${fr} ${fr} 0%`;
          layoutStyle.minWidth = 0;
        }
      } else if (width) {
        layoutStyle.width = width;
        layoutStyle.flexShrink = 0;
      }
    }
    if (i18nField.layout.height) {
      layoutStyle.height = i18nField.layout.height;
    }
  }

  // Semantic 12-column layout mapping for both print and web view.
  // Print uses fixed percentage width; web uses flex-basis ratio for row layouts.
  const printGrid = fieldRef?.printGrid;
  if (printGrid) {
    const span = Math.max(1, Math.min(12, printGrid.span));

    if (viewMode === "print") {
      // Use ratio-based flex sizing so row gaps do not cause overflow.
      layoutStyle.flex = `${span} ${span} 0`;
      layoutStyle.minWidth = 0;

      if (printGrid.start !== undefined) {
        const start = Math.max(1, Math.min(12, printGrid.start));
        // Kept for compatibility; use percentage offset only when explicitly provided.
        const offsetPercent = ((start - 1) / 12) * 100;
        layoutStyle.marginLeft = `${offsetPercent}%`;
      }
    } else {
      layoutStyle.flex = `${span} ${span} 0`;
      layoutStyle.minWidth = 0;
      // Avoid start offset in web mode to keep mobile/stacked layouts stable.
    }
  }

  // Get renderer from registry - dynamic lookup by field type is intentional design
  const scopedRenderer = systemId && fieldRenderers.get(fieldRendererKey(i18nField.type, {
    systemId, fieldId: i18nField.id,
  }));
  const Renderer = scopedRenderer || getFieldRenderer(i18nField.type, fieldRenderers);

  if (!Renderer && !derived) {
    return <div>{t("unknownFieldType", { type: i18nField.type })}</div>;
  }

  const content = derived ? (
    <DerivedValueField
      field={i18nField}
      derived={derived}
      editable={editable}
    />
  ) : Renderer ? (
    // eslint-disable-next-line react-hooks/static-components -- Renderer is dynamically resolved from registry
    <Renderer field={i18nField} />
  ) : (
    <div>{t("unknownFieldType", { type: i18nField.type })}</div>
  );

  // 顯示變體（例如 "tile"）交給欄位 renderer 自己解讀。
  // 在 web view 裡一律包一層，display 為 undefined 時也一樣：欄位 renderer
  // （列表列等）會再渲染巢狀的 FieldRenderer，不重設的話巢狀欄位會吃到外層的變體
  const displayContent = breakpoint ? (
    <FieldDisplayProvider value={display}>{content}</FieldDisplayProvider>
  ) : (
    content
  );

  // Wrap with RollableField if roll config exists。
  // tile 整塊就是擲骰鈕，不再疊 RollableField 的骰子鈕。
  const wrappedContent = i18nField.roll ? (
    isTileDisplay(display, i18nField.type, derived?.resultType) ? (
      <TileRollScope roll={i18nField.roll} label={i18nField.label} rollKey={i18nField.id}>
        {displayContent}
      </TileRollScope>
    ) : (
      <RollableField
        roll={i18nField.roll}
        fieldLabel={i18nField.label}
        fieldType={i18nField.type}
        rollKey={i18nField.id}
      >
        {displayContent}
      </RollableField>
    )
  ) : (
    displayContent
  );

  // Wrap with layout container if needed
  const normalizedFieldType = i18nField.type.replace(/[^a-z0-9-]/gi, "-");
  const fieldDataId = i18nField.id;
  const isUnsized = Object.keys(layoutStyle).length === 0;
  const wrapperClassName = cn(
    "skald-field",
    viewMode === "web" && "skald-field-web",
    `skald-field-type-${normalizedFieldType}`,
    isUnsized && COMPACT_FIELD_TYPES.has(i18nField.type) && "w-fit",
    fieldRef?.customClass ?? i18nField.customClass,
  );

  const rendered =
    Object.keys(layoutStyle).length > 0 ? (
      <div
        className={wrapperClassName}
        data-field-type={i18nField.type}
        data-field-id={fieldDataId}
        data-grid-span={printGrid ? String(Math.max(1, Math.min(12, printGrid.span))) : undefined}
        style={layoutStyle}
      >
        {wrappedContent}
      </div>
    ) : (
      <div
        className={wrapperClassName}
        data-field-type={i18nField.type}
        data-field-id={fieldDataId}
        data-grid-span={printGrid ? String(Math.max(1, Math.min(12, printGrid.span))) : undefined}
      >
        {wrappedContent}
      </div>
    );

  // 畫布層（CanvasElementChrome）用 `field-ref-${fieldId}` 當 field-ref 元素的
  // 選取／拖曳 id（跟內嵌 field 的原始 id 分開命名空間，避免撞名）；沿用既有
  // CanvasElement.tsx 的 getElementId() 規則，這樣切換到共用渲染鏈時選取狀態不會斷。
  const canvasElementId = fieldRef ? `field-ref-${fieldRef.fieldId}` : fieldDataId;

  if (wrapCanvasElement) {
    return wrapCanvasElement(canvasElementId, "field", rendered, resolvedField);
  }
  // 列印文件（通用列印）省略空欄位與 printHidden；其他宿主沒有這個 context
  return printHygiene ? (
    <printHygiene.FieldGate
      path={fieldRef?.fieldId ?? resolvedField.id}
      type={resolvedField.type}
      printHidden={fieldRef?.layout?.printHidden ?? resolvedField.layout?.printHidden}
      derived={derived !== null}
      systemDrawn={!!scopedRenderer}
    >
      {rendered}
    </printHygiene.FieldGate>
  ) : (
    rendered
  );
}

export const FieldRenderer = React.memo(
  FieldRendererComponent,
  (prev, next) => prev.field === next.field && prev.fieldRef === next.fieldRef,
);
FieldRenderer.displayName = "FieldRenderer";
