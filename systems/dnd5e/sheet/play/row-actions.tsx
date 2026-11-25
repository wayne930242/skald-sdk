"use client";

import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@skald/sheet-sdk/components/ui/dropdown-menu";
import { useSheetMode } from "@skald/sheet-sdk/modules/character/ui/renderer/sheet-mode";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { dndHomebrewStorePort, type DndHomebrewStore } from "../../homebrew/store-port";
import { asHomebrewRow, hasNewerHomebrew, stampOf } from "../../homebrew/domain/rows";
import { PACK_LIMITS } from "../../content-pack/domain/limits";
import { packSnapshotBytes } from "../../content-pack/domain/overlay";
import { packLabel } from "../pack-label";
import { homebrewKey } from "../../homebrew/domain/limits";
import { useHostPackNames } from "../reference-intl";
import { copySpellFields, type CompendiumStart } from "../compendium-rows";
import { CUSTOM_FORM_FIELDS, appendRow, buildCustomRow, buildSrdRow, patchRow, removeRow, restoreRow, rowIndex, type CustomList } from "../custom-rows";
import { usePlay } from "./play-context";
import { rows, text } from "./play-model";
import { PLAYER_TEXT_LISTS } from "./row-body";
import { catalogName, displayName, gameSpellOf, useRowText, withPackRowText } from "./row-text";
import type { ReferenceContextValue } from "../use-reference-context";

/**
 * Adding and changing rows in play (plan-uat2 §3.2): 「＋ 新增」, the custom entry link, the row
 * 「⋯」 menu and its dialogs. Rides the lazy play tabs; the dialogs load when opened.
 */

const CustomEntryDialog = lazy(() => import("../custom-entry-form").then((module) => ({ default: module.CustomEntryDialog })));
const RowTextDialog = lazy(() => import("./text-editor").then((module) => ({ default: module.RowTextDialog })));

type Row = Record<string, unknown>;

const HomebrewContext = createContext<DndHomebrewStore | null>(null);
const PackNamesContext = createContext<Readonly<Record<string, string>> | null>(null);
const homebrewList = (list: string): list is "feats" | "spells" => list === "feats" || list === "spells";

const hasForm = (list: string): list is CustomList => Object.hasOwn(CUSTOM_FORM_FIELDS, list);
const hasPlayerText = (list: string) => (PLAYER_TEXT_LISTS as readonly string[]).includes(list);

/** A list's name in the add and custom labels: the tab's own word for spells and attacks. */
function useListLabel(list: CustomList): string {
  const t = useTranslations("edit");
  const tPlay = useTranslations("play");
  const tField = useTranslations("field");
  return list === "weapons" ? t("custom.attack") : list === "spells" ? tPlay("tabs.spells") : tField(list);
}

/**
 * The row fields the sheet shows from the catalog, not from the row: 編輯欄位 leaves them out, as
 * an edit there would change nothing on screen. A built-in row's name (`displayName`), and a
 * built-in spell's casting time and range (`spellLine`). Here, not in row-text: only the lazy
 * row menu reads it.
 */
function catalogFields(context: ReferenceContextValue, row: Row): string[] {
  const fields = catalogName(context, row) !== null ? ["name"] : [];
  const game = gameSpellOf(context, row);
  if (game?.castingTime) fields.push("castingTime");
  if (game?.range) fields.push("range");
  return fields;
}

/** Writes through the play view's whole-data path, with the toasts the row menu promises. */
export function useRowWrites() {
  const t = useTranslations("edit");
  const tPack = useTranslations("pack");
  const { update, schema, reference, data } = usePlay();
  function withinCap(next: Row) {
    const bytes = packSnapshotBytes(next);
    if (bytes <= PACK_LIMITS.snapshotBytes) return true;
    queueMicrotask(() => toast.error(tPack("tooMuchText", { kb: Math.ceil(bytes / 1024) })));
    return false;
  }
  const store = useContext(HomebrewContext);
  async function saveHomebrew(list: string, row: Row) {
    if (!store || !homebrewList(list)) return null;
    // The unstamped custom row does not count yet. Check its new snapshot before creating a library item.
    const index = rowIndex(data[list], row);
    const snapshot = { ...row, origin: "pack" };
    if (!withinCap(index < 0 ? appendRow(data, list, snapshot) : patchRow(data, list, index, snapshot))) return null;
    try {
      const { saveCustomHomebrew } = await import("../custom-entry-form");
      return await saveCustomHomebrew(store, list, row, reference.locale);
    } catch {
      toast.error(t("custom.homebrewFailed"));
      return null;
    }
  }
  return {
    canWrite: update !== null,
    canSaveHomebrew: (list: string) => !!store && homebrewList(list),
    canUpdateHomebrew: !!store,
    saveHomebrew,
    addCustom: async (list: CustomList, values: Row, alsoHomebrew = false, onAdded?: () => void) => {
      if (!update) return;
      const row = buildCustomRow(schema, list, values);
      if (alsoHomebrew) {
        const stamp = await saveHomebrew(list, row);
        if (!stamp) return;
        Object.assign(row, stamp);
      }
      update((previous) => appendRow(previous, list, row));
      toast.success(t("custom.added", { name: String(row.name) }));
      onAdded?.();
    },
    patch: (list: string, row: Row, patch: Row) => {
      update?.((previous) => {
        const next = patchRow(previous, list, rowIndex(previous[list], row), patch);
        return stampOf(patch) && !withinCap(next) ? previous : next;
      });
    },
    /** Deletes at once; the toast's 復原 puts the row back at its index. */
    remove: (list: string, row: Row, name: string) => {
      if (!update) return;
      let removed: ReturnType<typeof removeRow>["removed"] = null;
      update((previous) => {
        const result = removeRow(previous, list, rowIndex(previous[list], row));
        removed = result.removed;
        return result.data;
      });
      toast(t("row.deleted", { name }), {
        action: {
          label: t("row.undo"),
          onClick: () => {
            const restore = removed;
            if (restore) update((previous) => restoreRow(previous, restore));
          },
        },
      });
    },
  };
}

/** A row editor: the row's text (編輯文字) or its fields (編輯欄位). */
export interface RowEditor {
  kind: "text" | "fields";
  list: string;
  row: Row;
  name: string;
  /** The text the card shows (a weapon's is its own); null: the row's own text only. */
  shown?: string | null;
}

const OpenRowEditorContext = createContext<((editor: RowEditor) => void) | null>(null);

/** Opens a row's text or fields editor: the tab's `RowEditorHost` (B-023, the 「⋯」 menu). */
export function useOpenRowEditor(): (editor: RowEditor) => void {
  const open = useContext(OpenRowEditorContext);
  if (!open) throw new Error("useOpenRowEditor must be used inside a RowEditorHost");
  return open;
}

/** The text editor of a row whose card shows its rules text: the text as it loads. */
function LiveRowTextDialog({ editor, onClose, onSave }: { editor: RowEditor; onClose: () => void; onSave: (field: string, value: string) => void }) {
  const { reference } = usePlay();
  const body = useRowText(reference, editor.row);
  // A table copy's pack row shows the viewer's pack text beside the editor (D9); saves patch the stored row.
  return <RowTextDialog name={editor.name} row={withPackRowText(reference, editor.row)} shown={body.text} loading={body.loading} onClose={onClose} onSave={onSave} />;
}

/**
 * One tab's row editors (plan §4.1): the 「⋯」 menu and, in edit mode, a row's roll buttons open
 * them here, so a tab has one dialog instance. Each lazy tab body wraps its rows in one.
 */
export function RowEditorHost({ children }: { children: ReactNode }) {
  const tCustom = useTranslations("edit.custom");
  const tField = useTranslations("field");
  const { schema, reference } = usePlay();
  const store = useHostPort(dndHomebrewStorePort);
  const [account, setAccount] = useState<DndHomebrewStore | null>(null);
  const names = useHostPackNames(reference.locale, reference.packIds);
  useEffect(() => {
    let live = true;
    store?.owner().then((owner) => { if (live) setAccount(owner === "account" ? store : null); }, () => { if (live) setAccount(null); });
    return () => { live = false; };
  }, [store]);
  const writes = useRowWrites();
  const [open, setOpen] = useState<RowEditor | null>(null);
  const close = () => setOpen(null);
  const saveText = (field: string, value: string) => {
    if (open) writes.patch(open.list, open.row, { [field]: value });
    close();
  };
  return (
    <OpenRowEditorContext.Provider value={setOpen}>
      <HomebrewContext.Provider value={account === store ? store : null}>
        <PackNamesContext.Provider value={names}>{children}</PackNamesContext.Provider>
      </HomebrewContext.Provider>
      <Suspense fallback={null}>
        {open?.kind === "text" &&
          (open.shown === null || open.shown === undefined ? (
            <RowTextDialog name={open.name} row={open.row} shown={null} loading={false} onClose={close} onSave={saveText} />
          ) : (
            <LiveRowTextDialog editor={open} onClose={close} onSave={saveText} />
          ))}
        {open?.kind === "fields" && hasForm(open.list) && (
          <CustomEntryDialog
            schema={schema}
            list={open.list}
            listLabel={tField(open.list)}
            row={open.row}
            rowName={open.name}
            locked={catalogFields(reference, open.row)}
            onClose={close}
            onSubmit={(values) => {
              writes.patch(open.list, open.row, values);
              toast.success(tCustom("saved", { name: String(values.name ?? open.name) }));
              close();
            }}
          />
        )}
      </Suspense>
    </OpenRowEditorContext.Provider>
  );
}

/** The row 「⋯」 menu: 編輯文字, 編輯欄位 (a custom row; any row in edit mode) and 刪除. */
export function RowMenu({ list, row, name, shown = null, className }: { list: string; row: Row; name: string; shown?: string | null; loading?: boolean; className?: string }) {
  const t = useTranslations("edit.row");
  const { editable, reference } = usePlay();
  const names = useContext(PackNamesContext);
  const tPlay = useTranslations("play");
  const mode = useSheetMode();
  const writes = useRowWrites();
  const openEditor = useOpenRowEditor();
  const own = stampOf(row);
  const ref = text(row.ref);
  const latest = own && reference.homebrewOf?.(ref);
  const pack = own && homebrewKey(own.pack);
  const badge = pack ? <span className="rounded-full border px-2 text-xs">{names?.[pack] ? packLabel(tPlay, pack, names[pack]) : tPlay("homebrewBadge")}</span> : null;
  if (!editable || !writes.canWrite) return badge;
  const fields = hasForm(list) && (row.origin === "custom" || (!row.origin && !row.ref) || mode === "edit");
  return (
    <>
      {badge}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("menu", { name })}
          className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:size-9", className)}
          data-row-menu={list}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasPlayerText(list) && <DropdownMenuItem onSelect={() => openEditor({ kind: "text", list, row, name, shown })}>{t("editText")}</DropdownMenuItem>}
          {writes.canUpdateHomebrew && latest && reference.packText && hasNewerHomebrew(row, { [ref]: latest }) && <DropdownMenuItem onSelect={() => {
            const resolved = reference.resolveRef(ref) ?? ref;
            const spell = list === "spells" ? reference.gameSpells.get(resolved.slice(6)) : undefined;
            const fields = spell ? copySpellFields(spell, reference.token) : {};
            writes.patch(list, row, asHomebrewRow(fields, reference.packText!.rowText({ ...row, ref: resolved }), latest));
          }}>{t("updateHomebrew")}</DropdownMenuItem>}
          {!own && row.origin === "custom" && writes.canSaveHomebrew(list) && <DropdownMenuItem onSelect={async () => {
            const patch = await writes.saveHomebrew(list, row);
            if (patch) writes.patch(list, row, patch);
          }}>{t("saveHomebrew")}</DropdownMenuItem>}
          {fields && <DropdownMenuItem onSelect={() => openEditor({ kind: "fields", list, row, name })}>{t("editFields")}</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onSelect={() => writes.remove(list, row, name)}>
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

const ADD_BUTTON = "inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-accent hover:bg-muted sm:min-h-9";

/**
 * A list section's 「＋ 新增」: the library on that list's category (`library`), or the custom form
 * when the list has no library (種族特性, 工具). `customLink` adds 「找不到？自訂一筆{list}」 below.
 */
export function AddControls({
  list,
  library,
  label,
  chips,
  onPickChip,
}: {
  list: CustomList;
  library?: CompendiumStart;
  /** The button's own label (「新增攻擊」); 「新增」 by default. */
  label?: string;
  chips?: Array<{ ref: string; name: string }>;
  onPickChip?: (chip: { ref: string; name: string }) => void;
}) {
  const t = useTranslations("edit");
  const { editable, openCompendium, schema } = usePlay();
  const writes = useRowWrites();
  const [form, setForm] = useState(false);
  const listLabel = useListLabel(list);
  if (!editable || !writes.canWrite) return null;
  const viaLibrary = library !== undefined && openCompendium !== null;
  return (
    <>
      <button
        type="button"
        onClick={() => (viaLibrary ? openCompendium(library) : setForm(true))}
        aria-label={label ?? t("addTo", { list: listLabel })}
        className={ADD_BUTTON}
        data-add-list={list}
      >
        <Plus className="size-4" aria-hidden="true" />
        {label ?? t("add")}
      </button>
      {form && (
        <Suspense fallback={null}>
          <CustomEntryDialog
            schema={schema}
            list={list}
            listLabel={listLabel}
            allowHomebrew={writes.canSaveHomebrew(list)}
            chips={chips}
            onPick={(chip) => {
              onPickChip?.(chip);
              setForm(false);
            }}
            onClose={() => setForm(false)}
            onSubmit={(values, also) => writes.addCustom(list, values, also, () => setForm(false))}
          />
        </Suspense>
      )}
    </>
  );
}

/** 「找不到？自訂一筆{list}」: the custom form of a list the library also serves. */
export function CustomLink({ list }: { list: CustomList }) {
  const t = useTranslations("edit");
  const { editable, schema } = usePlay();
  const writes = useRowWrites();
  const [form, setForm] = useState(false);
  const listLabel = useListLabel(list);
  if (!editable || !writes.canWrite) return null;
  return (
    <>
      <button type="button" onClick={() => setForm(true)} className="min-h-11 rounded-md px-1 text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-9" data-custom-link={list}>
        {t("custom.link", { list: listLabel })}
      </button>
      {form && (
        <Suspense fallback={null}>
          <CustomEntryDialog
            schema={schema}
            list={list}
            listLabel={listLabel}
            allowHomebrew={writes.canSaveHomebrew(list)}
            onClose={() => setForm(false)}
            onSubmit={(values, also) => writes.addCustom(list, values, also, () => setForm(false))}
          />
        </Suspense>
      )}
    </>
  );
}

/** A leveled spell's 準備 toggle (one name, the state in aria-pressed); the prepared counter follows it. */
export function PrepareToggle({ spell, name }: { spell: Row; name: string }) {
  const t = useTranslations("edit.spells");
  const { editable } = usePlay();
  const writes = useRowWrites();
  if (!editable || !writes.canWrite) return null;
  const prepared = spell.prepared === true;
  return (
    <button
      type="button"
      aria-pressed={prepared}
      aria-label={t("prepare", { name })}
      onClick={() => writes.patch("spells", spell, { prepared: !prepared })}
      className={cn("min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium sm:min-h-9", prepared ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted-foreground hover:bg-muted")}
      data-prepare-toggle
    >
      {prepared ? t("prepared") : t("unprepared")}
    </button>
  );
}

/** The 角色 tab's language editor (✎): each chip gets ×, and 「＋」 offers the SRD languages and a custom one. */
export function LanguageEditor({ onDone }: { onDone: () => void }) {
  const t = useTranslations("edit");
  const { values, reference, system, schema, update } = usePlay();
  const writes = useRowWrites();
  const languages = rows(values.languages);
  const known = new Set(languages.map((row) => text(row.ref)).filter(Boolean));
  const chips = rows(system.gameData?.languages)
    .map((item) => text(item.ref))
    .filter((ref) => ref.startsWith("language:") && !known.has(ref))
    .map((ref) => ({ ref, name: reference.nameOf(ref) }));
  return (
    <div className="mt-2 space-y-2" data-play-language-editor>
      <ul className="flex flex-wrap items-center gap-1.5">
        {languages.map((row, index) => {
          const name = displayName(reference, row);
          return (
            <li key={text(row.id) || index} className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 py-0.5 pl-2.5 pr-0.5 text-sm">
              {name}
              <button type="button" onClick={() => writes.remove("languages", row, name)} aria-label={t("row.remove", { name })} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted">
                ×
              </button>
            </li>
          );
        })}
        <li>
          <AddControls
            list="languages"
            chips={chips}
            onPickChip={(chip) => {
              update?.((previous) => appendRow(previous, "languages", buildSrdRow(schema, "languages", chip.ref, chip.name)));
              toast.success(t("custom.added", { name: chip.name }));
            }}
          />
        </li>
      </ul>
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">
          {t("done")}
        </button>
      </div>
    </div>
  );
}
