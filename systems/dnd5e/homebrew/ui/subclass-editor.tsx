import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { nameKey } from "../../content-pack/domain/identity";
import { assembleOpenPack } from "../domain/assemble";
import { newHomebrewId } from "../domain/forms";
import { HOMEBREW_LIMITS } from "../domain/limits";
import {
  keepsAll,
  planMove,
  spellProblems,
  subclassCodec,
  type MoveStash,
  type SubclassContext,
  type SubclassForm,
} from "../domain/subclass";
import type { HomebrewItemRecord, HomebrewPackRecord } from "../domain/types";
import type { DndHomebrewStore, HomebrewResult } from "../store-port";
import { EditorHeading } from "./editor-heading";
import { ImportedBlocks } from "./imported-blocks";
import { ReparentConfirm } from "./reparent-confirm";
import { SubclassPreview } from "./subclass-preview";
import { loadSubclassCatalog, loadSubclassContext, type SubclassCatalog } from "./subclass-context";
import { FeatureSections, SpellRows, TextBox, ThirdCaster } from "./subclass-parts";

type Props = {
  row?: HomebrewItemRecord;
  rows: HomebrewItemRecord[];
  allRows: HomebrewItemRecord[];
  pack: HomebrewPackRecord;
  store: DndHomebrewStore;
  reload(): void;
  run(write: () => Promise<HomebrewResult<unknown>>, done?: () => void): Promise<void>;
};
/** `orphan`: the stored key of a subclass whose parent class is gone; it opens with no parent chosen. */
type Opened = { catalog: SubclassCatalog; context?: SubclassContext; form: SubclassForm; lossless: boolean; orphan?: string };

/** Loads the catalog (and, for a stored subclass, its context) before the form can read it back. */
export function SubclassEditor(props: Props) {
  const t = useTranslations("homebrew");
  const { row, rows, allRows } = props;
  const [opened, setOpened] = useState<Opened | "error" | null>(null);
  useEffect(() => {
    let active = true;
    (async (): Promise<Opened> => {
      const catalog = await loadSubclassCatalog(allRows);
      if (!row) return { catalog, form: subclassCodec.empty(), lossless: true };
      const parent = catalog.parents.find((p) => p.id === row.payload.entry?.meta?.parent);
      if (!parent) {
        const features = subclassCodec.rowsOf(row.key, rows);
        const base = {
          labels: catalog.labels,
          legacy: catalog.legacy,
          spellNames: catalog.spells,
          abilityNames: catalog.abilityNames,
          classNames: catalog.classNames,
        };
        const stand = subclassCodec.orphanContext(row.payload, features, base, allRows, row.key);
        if (!stand) return { catalog, form: subclassCodec.empty(), lossless: false };
        const read = subclassCodec.fromRows(row.payload, features, stand);
        return { catalog, form: { ...read.form, parent: "" }, lossless: read.lossless, orphan: row.key };
      }
      const context = await loadSubclassContext(catalog, parent, allRows, row.key);
      return { catalog, context, ...subclassCodec.fromRows(row.payload, subclassCodec.rowsOf(row.key, rows), context) };
    })().then(
      (next) => active && setOpened(next),
      () => active && setOpened("error"),
    );
    return () => {
      active = false;
    };
    // Opened once per mount; the workspace remounts the editor for another row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (opened === "error") return <p role="alert">{t("error.network")}</p>;
  if (!opened) return <p role="status">{t("loading")}</p>;
  if (row && !opened.lossless)
    return (
      <div className="space-y-3" data-subclass-readonly>
        {[row, ...subclassCodec.rowsOf(row.key, rows)].map((r) => (
          <ImportedBlocks key={r.id} row={r} pack={props.pack} store={props.store} run={props.run} close={props.reload} />
        ))}
      </div>
    );
  return (
    <SubclassFormView {...props} catalog={opened.catalog} initial={opened.form} initialContext={opened.context} orphan={opened.orphan} />
  );
}

function SubclassFormView({
  row,
  rows,
  allRows,
  pack,
  store,
  run,
  reload,
  catalog,
  initial,
  initialContext,
  orphan,
}: Props & { catalog: SubclassCatalog; initial: SubclassForm; initialContext?: SubclassContext; orphan?: string }) {
  const t = useTranslations("homebrew");
  const zh = useLocale() === "zh-TW";
  const [draft, setDraft] = useState(initial);
  const [context, setContext] = useState(initialContext);
  const [fallback] = useState(() => newHomebrewId(""));
  const [problem, setProblem] = useState("");
  // A parent change that would remove or move parts of the draft waits here for the author's confirmation.
  const [pendingParent, setPendingParent] = useState<string | null>(null);
  // What confirmed moves took, given back when a later parent fits it.
  const [stash, setStash] = useState<MoveStash>();
  // The stored subclass this editor writes: the opened row, or the one a partial save created.
  const [owned, setOwned] = useState(row?.key);
  const parent = catalog.parents.find((p) => p.id === draft.parent);
  // Recomputed on every render, so edits made while a move waits for confirmation count.
  const moveOf = (id: string) => planMove(draft, stash, catalog.parents.find((p) => p.id === id));
  const pending = pendingParent === null ? null : { parent: catalog.parents.find((p) => p.id === pendingParent), ...moveOf(pendingParent) };
  const apply = (move: ReturnType<typeof moveOf>) => {
    setProblem("");
    setDraft(move.form);
    setStash(move.stash);
    setPendingParent(null);
  };
  const reparent = Boolean(orphan) && !parent;
  // An orphan picks a new parent until a save starts writing it under that parent's key.
  const parentLocked = Boolean(owned) && !(orphan && owned === orphan);
  useEffect(() => {
    if (!parent || context?.parent.id === parent.id) return;
    let active = true;
    void loadSubclassContext(catalog, parent, allRows).then((c) => active && setContext(c));
    return () => {
      active = false;
    };
  }, [parent, context, catalog, allRows]);
  const set = (patch: Partial<SubclassForm>) => {
    setProblem("");
    setDraft({ ...draft, ...patch });
  };
  const form = { ...draft, id: draft.id || newHomebrewId(draft.nameEn).slice(0, 60).replace(/-+$/, "") || fallback };
  const ready = parent && context?.parent.id === parent.id ? context : undefined;
  const issues = subclassCodec.issues(form, parent);
  // A spell above the castable level (or a cantrip) blocks the save; the read-back of stored rows does not check it.
  const spellIssues = parent ? spellProblems(form, parent, (ref) => catalog.spellInfo[ref]) : [];
  let preview: ReturnType<typeof subclassCodec.toRows> | null = null;
  try {
    preview = ready && !issues.length ? subclassCodec.toRows(form, ready) : null;
  } catch {
    preview = null;
  }
  const issueName = (x: string) =>
    t.has(`subclass.issue.${x}`) ? t(`subclass.issue.${x}`) : t.has(`field.${x}`) ? t(`field.${x}`) : x;

  async function save(ctx: SubclassContext): Promise<HomebrewResult<unknown>> {
    const generated = subclassCodec.toRows(form, ctx);
    // Fix new features' slugs now, so a retry after a partial save rewrites the same rows.
    const leaves = generated.filter((r) => r.kind === "subclassFeature" && !r.payload.entry!.meta!.generated);
    const fixed = { ...form, features: form.features.map((f, i) => ({ ...f, key: leaves[i].key.split("/").at(-1) })) };
    setDraft(fixed);
    const rowsOut = subclassCodec.toRows(fixed, ctx);
    const head = rowsOut[0];
    const identity = await loadBuiltinIdentity();
    const key = nameKey("subclass", head.key, head.payload.entry!.name);
    const ref = `subclass:${head.key}`;
    const clash = identity.refs.has(ref) ? ref : key ? identity.nameKeys.get(key) : null;
    if (clash) {
      setProblem(t("clash", { ref: clash }));
      return { ok: true, value: null };
    }
    const duplicate = rows.some(
      (r) =>
        r.kind === "subclass" &&
        r.key !== owned &&
        r.payload.entry &&
        (r.key === head.key || (key && nameKey("subclass", r.key, r.payload.entry.name) === key)),
    );
    if (duplicate) return { ok: false, error: "duplicateKey" };
    const file = assembleOpenPack(pack, rowsOut);
    file.manifest.payloadSha256 = "0".repeat(64);
    if (!(await loadOpenPackSchemaCheck())(file).ok) return { ok: false, error: "invalid" };
    // A re-parented orphan gets a new key: its old rows are deleted once the new ones are written.
    const plan = subclassCodec.plan(fixed, ctx, rows, row?.key);
    const usage = await store.usage();
    if (!usage.ok) return usage;
    if (usage.value.items + plan.addedRows > HOMEBREW_LIMITS.items) return { ok: false, error: "limitItems" };
    if (usage.value.bytes + plan.bytesDelta > HOMEBREW_LIMITS.bytes) return { ok: false, error: "limitBytes" };
    const result = await store.saveItems(pack.id, plan, () => setOwned(head.key));
    if (!result.ok) {
      if (!Number(result.detail)) return result;
      setProblem(t("subclass.partial"));
      return { ok: true, value: null };
    }
    reload();
    return { ok: true, value: null };
  }

  return (
    <form
      className="min-w-0 space-y-5 rounded-lg border p-3 sm:p-5"
      data-subclass-editor
      onSubmit={(e) => {
        e.preventDefault();
        setProblem("");
        const blocking = [...issues, ...(spellIssues.length ? ["spellLevel"] : [])];
        if (!ready || blocking.length) {
          setProblem(t("invalidFields", { fields: (blocking.length ? blocking : ["parent"]).map(issueName).join(", ") }));
          return;
        }
        void run(() => save(ready));
      }}
    >
      <EditorHeading>{t("kind.subclass")}</EditorHeading>
      <label className="block space-y-1 text-sm">
        <span>{t("subclass.parent")}</span>
        <select
          className={`block w-full rounded border bg-background p-2 ${reparent ? "border-destructive ring-2 ring-destructive/40" : ""}`}
          value={pendingParent ?? draft.parent}
          disabled={parentLocked}
          aria-invalid={reparent || undefined}
          aria-describedby={reparent ? "subclass-reparent" : undefined}
          onChange={(e) => {
            // Applied at once only when nothing of the draft is removed or moved; else it waits for confirmation.
            const move = moveOf(e.target.value);
            if (keepsAll(move.changes)) apply(move);
            else setPendingParent(e.target.value);
          }}
        >
          <option value="">{t("subclass.pickParent")}</option>
          {catalog.parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name[zh ? "zh" : "en"]}
            </option>
          ))}
        </select>
        {owned && !orphan && <span className="text-muted-foreground">{t("subclass.parentFixed")}</span>}
      </label>
      {reparent && !pending && (
        <p id="subclass-reparent" role="alert" className="-mt-3 text-sm text-destructive">
          {t("subclass.reparent")}
        </p>
      )}
      {pending?.parent && (
        <ReparentConfirm
          parent={pending.parent}
          changes={pending.changes}
          catalog={catalog}
          zh={zh}
          confirm={() => apply(pending)}
          cancel={() => setPendingParent(null)}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextBox label={t("field.nameZh")} value={draft.nameZh} change={(nameZh) => set({ nameZh })} />
        <TextBox label={t("field.nameEn")} value={draft.nameEn} change={(nameEn) => set({ nameEn })} />
        <TextBox long label={t("field.textZh")} value={draft.textZh} change={(textZh) => set({ textZh })} />
        <TextBox long label={t("field.textEn")} value={draft.textEn} change={(textEn) => set({ textEn })} />
      </div>
      {parent && (
        <>
          <FeatureSections form={draft} set={set} parent={parent} />
          <ThirdCaster form={draft} set={set} parent={parent} catalog={catalog} />
          <SpellRows form={draft} set={set} parent={parent} catalog={catalog} />
        </>
      )}
      {preview && <SubclassPreview rows={preview} zh={zh} />}
      {problem && <p role="alert">{problem}</p>}
      <Button type="submit">{t("save")}</Button>
    </form>
  );
}
