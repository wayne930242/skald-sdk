import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { nameKey } from "../../content-pack/domain/identity";
import { EntriesRenderer } from "../../reference/entries-renderer";
import { assembleOpenPack } from "../domain/assemble";
import { newHomebrewId } from "../domain/forms";
import { HOMEBREW_LIMITS } from "../domain/limits";
import { subclassCodec, type SubclassContext, type SubclassForm } from "../domain/subclass";
import type { HomebrewItemRecord, HomebrewPackRecord } from "../domain/types";
import type { DndHomebrewStore, HomebrewResult } from "../store-port";
import { ImportedBlocks } from "./imported-blocks";
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
type Opened = { catalog: SubclassCatalog; context?: SubclassContext; form: SubclassForm; lossless: boolean };

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
      if (!parent) return { catalog, form: subclassCodec.empty(), lossless: false };
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
  return <SubclassFormView {...props} catalog={opened.catalog} initial={opened.form} initialContext={opened.context} />;
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
}: Props & { catalog: SubclassCatalog; initial: SubclassForm; initialContext?: SubclassContext }) {
  const t = useTranslations("homebrew");
  const zh = useLocale() === "zh-TW";
  const [draft, setDraft] = useState(initial);
  const [context, setContext] = useState(initialContext);
  const [fallback] = useState(() => newHomebrewId(""));
  const [problem, setProblem] = useState("");
  // The stored subclass this editor writes: the opened row, or the one a partial save created.
  const [owned, setOwned] = useState(row?.key);
  const parent = catalog.parents.find((p) => p.id === draft.parent);
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
    const plan = subclassCodec.plan(fixed, ctx, rows);
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
        if (!ready || issues.length) {
          setProblem(t("invalidFields", { fields: (issues.length ? issues : ["parent"]).map(issueName).join(", ") }));
          return;
        }
        void run(() => save(ready));
      }}
    >
      <h3 className="font-heading text-xl">{t("kind.subclass")}</h3>
      <label className="block space-y-1 text-sm">
        <span>{t("subclass.parent")}</span>
        <select
          className="block w-full rounded border bg-background p-2"
          value={draft.parent}
          disabled={Boolean(owned)}
          onChange={(e) => {
            const next = catalog.parents.find((p) => p.id === e.target.value);
            set({
              parent: e.target.value,
              spells: [],
              spellcasting: null,
              features: draft.features.map((f) =>
                next?.subclassLevels.includes(f.level) ? f : { ...f, level: next?.subclassLevels[0] ?? f.level },
              ),
            });
          }}
        >
          <option value="">{t("subclass.pickParent")}</option>
          {catalog.parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name[zh ? "zh" : "en"]}
            </option>
          ))}
        </select>
        {owned && <span className="text-muted-foreground">{t("subclass.parentFixed")}</span>}
      </label>
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
      {preview && (
        <section className="space-y-3 rounded bg-muted p-3 sm:p-4" data-subclass-preview>
          <h4 className="text-sm text-muted-foreground">{t("preview")}</h4>
          {preview.map((r) => (
            <article key={r.key} className="min-w-0 break-words">
              <strong>{(zh && r.payload.zhTW?.name) || r.payload.entry!.name}</strong>
              <EntriesRenderer
                context={{ resolveRef: () => null }}
                entries={zh && r.payload.zhTW ? r.payload.zhTW.entries : r.payload.entry!.entries}
              />
            </article>
          ))}
        </section>
      )}
      {problem && <p role="alert">{problem}</p>}
      <Button type="submit">{t("save")}</Button>
    </form>
  );
}
