import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import type { ClassCatalog } from "./class-context";

export const ITEMS_LIST = "hb-class-items";
export const TOOLS_LIST = "hb-class-tools";

/** Names by ref, and refs by name, in the reader's locale. */
export function useRefNames(catalog: ClassCatalog) {
  const l = useLocale() === "zh-TW" ? "zh" : "en";
  const names = new Map(catalog.items.map((i) => [i.ref, i.name[l]]));
  const refs = new Map<string, string>();
  for (const i of catalog.items) if (!refs.has(i.name[l])) refs.set(i.name[l], i.ref);
  return {
    name: (ref: string) => names.get(ref) ?? ref,
    /** The ref a typed text names: a known name, or a known ref typed as is. */
    refOf: (text: string) => refs.get(text.trim()) ?? (names.has(text.trim()) ? text.trim() : undefined),
  };
}

/** The datalists the pickers search: every item, and the tools among them, by name. Render once per form. */
export function RefLists({ catalog }: { catalog: ClassCatalog }) {
  const l = useLocale() === "zh-TW" ? "zh" : "en";
  return (
    <>
      {[ITEMS_LIST, TOOLS_LIST].map((id) => (
        <datalist key={id} id={id}>
          {catalog.items
            .filter((i) => id === ITEMS_LIST || i.tool)
            .map((i) => (
              <option key={i.ref} value={i.name[l]} />
            ))}
        </datalist>
      ))}
    </>
  );
}

/**
 * One item, searched by name: a known name stores its ref (and shows the name); other text is a
 * custom item, kept as its display name with no ref.
 */
export function ItemPicker({
  label,
  catalog,
  value,
  custom,
  change,
}: {
  label: string;
  catalog: ClassCatalog;
  value: string;
  custom: string;
  change(next: { ref: string; displayName?: string }): void;
}) {
  const refNames = useRefNames(catalog);
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-sm">{label}</span>
      <Input
        list={ITEMS_LIST}
        // Controlled by the form: a ref shows its name, a custom item its display name.
        value={value ? refNames.name(value) : custom}
        data-ref={value || undefined}
        onChange={(e) => {
          const next = e.target.value;
          const ref = refNames.refOf(next);
          change(ref ? { ref, displayName: "" } : { ref: "", displayName: next });
        }}
      />
    </label>
  );
}

/** A list of tool refs as name chips, added by name from the tool list; other text is kept as a custom ref. */
export function ToolChips({ label, catalog, value, change }: { label: string; catalog: ClassCatalog; value: readonly string[]; change(next: string[]): void }) {
  const t = useTranslations("homebrew.class");
  const refNames = useRefNames(catalog);
  const [text, setText] = useState("");
  const add = () => {
    const ref = refNames.refOf(text) ?? text.trim();
    if (ref && !value.includes(ref)) change([...value, ref]);
    setText("");
  };
  return (
    <fieldset className="space-y-1" data-tool-chips>
      <legend className="text-sm">{label}</legend>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {value.map((ref) => (
            <li key={ref}>
              <Button type="button" size="sm" variant="secondary" aria-label={t("removeRef", { name: refNames.name(ref) })} onClick={() => change(value.filter((r) => r !== ref))}>
                {refNames.name(ref)} ×
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Input
          aria-label={t("toolSearch", { field: label })}
          list={TOOLS_LIST}
          className="min-w-0 grow basis-48"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={!text.trim()} onClick={add}>
          {t("addTool")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("toolHint")}</p>
    </fieldset>
  );
}
