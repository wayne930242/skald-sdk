import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { nameKey } from "../../content-pack/domain/identity";
import { assembleOpenPack } from "../domain/assemble";
import { classCodec, EN_TABLE_LABELS, generatedFeatures, type ClassForm, type ClassLabels, type GeneratedFeature } from "../domain/class";
import { newHomebrewId } from "../domain/forms";
import { HOMEBREW_LIMITS } from "../domain/limits";
import { fillSpaced } from "../domain/spacing";
import type { HomebrewItemInput, HomebrewItemRecord, HomebrewPackRecord } from "../domain/types";
import type { DndHomebrewStore, HomebrewResult } from "../store-port";
import { loadClassCatalog, type ClassCatalog } from "./class-context";
import { CastingStep, ChassisStep, FeatureSteps, LadderStep } from "./class-parts";
import { ClassTable, GeneratedFeatures } from "./class-table";
import { EditorHeading } from "./editor-heading";
import { ImportedBlocks } from "./imported-blocks";
import { TextBox } from "./subclass-parts";

type Props = {
  row?: HomebrewItemRecord;
  rows: HomebrewItemRecord[];
  allRows: HomebrewItemRecord[];
  pack: HomebrewPackRecord;
  store: DndHomebrewStore;
  reload(): void;
  run(write: () => Promise<HomebrewResult<unknown>>, done?: () => void): Promise<void>;
};
type Opened = { catalog: ClassCatalog; form: ClassForm; lossless: boolean };

const NAME_LABEL: Record<GeneratedFeature["generated"], keyof ClassLabels> = {
  spellcasting: "spellcastingName", pactMagic: "pactMagicName", weaponMastery: "weaponMastery", subclass: "subclassName",
  subclassFeature: "subclassFeatureName", asi: "asiName", extraAttack: "extraAttackName", epicBoon: "epicBoonName",
};

/** Loads the built-in classes (and reads a stored class back) before the form opens. */
export function ClassEditor(props: Props) {
  const t = useTranslations("homebrew");
  const { row, rows, allRows } = props;
  const [opened, setOpened] = useState<Opened | "error" | null>(null);
  useEffect(() => {
    let active = true;
    (async (): Promise<Opened> => {
      const catalog = await loadClassCatalog(allRows);
      if (!row) return { catalog, form: classCodec.empty(), lossless: true };
      return { catalog, ...classCodec.fromRows(row.payload, classCodec.rowsOf(row.key, rows), catalog.context) };
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
      <div className="space-y-3" data-class-readonly>
        {[row, ...classCodec.rowsOf(row.key, rows)].map((r) => (
          <ImportedBlocks key={r.id} row={r} pack={props.pack} store={props.store} run={props.run} close={props.reload} />
        ))}
      </div>
    );
  return <ClassFormView {...props} catalog={opened.catalog} initial={opened.form} />;
}

function ClassFormView({ row, rows, pack, store, run, reload, catalog, initial }: Props & { catalog: ClassCatalog; initial: ClassForm }) {
  const t = useTranslations("homebrew");
  const zh = useLocale() === "zh-TW";
  const ctx = catalog.context;
  const [draft, setDraft] = useState(initial);
  const [fallback] = useState(() => newHomebrewId(""));
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // The stored class this editor writes: the opened row, or the one a partial save created.
  const [owned, setOwned] = useState(row?.key);
  const set = (patch: Partial<ClassForm>) => {
    setProblem("");
    setDraft({ ...draft, ...patch });
  };
  const slug = newHomebrewId(draft.nameEn).slice(0, 60).replace(/-+$/, "") || fallback;
  // A name like a built-in class keeps its own id, so the save reports the name clash instead of a bad id.
  const id = draft.id || (Object.hasOwn(ctx.builtin, slug) ? `${slug.slice(0, 56)}-own` : slug);
  const form = { ...draft, id };
  const issues = classCodec.issues(form, ctx);
  let preview: HomebrewItemInput[] | null = null;
  try {
    preview = issues.length ? null : classCodec.toRows(form, ctx);
  } catch {
    preview = null;
  }
  const className = { en: draft.nameEn.trim() || draft.nameZh.trim(), zh: draft.nameZh.trim() || draft.nameEn.trim() };
  const generated = generatedFeatures(form, ctx).map((g) => ({
    level: g.level,
    name: fillSpaced(ctx.labels[zh ? "zh" : "en"][NAME_LABEL[g.generated]], { class: className[zh ? "zh" : "en"] }),
  }));
  const issueName = (x: string) => (t.has(`class.issue.${x}`) ? t(`class.issue.${x}`) : t.has(`field.${x}`) ? t(`field.${x}`) : x);

  async function save(): Promise<HomebrewResult<unknown>> {
    const generatedRows = classCodec.toRows(form, ctx);
    // Fix the id and new features' slugs now, so a retry after a partial save rewrites the same rows.
    const leaves = generatedRows.filter((r) => r.kind === "classFeature" && !r.payload.entry!.meta!.generated);
    const fixed = { ...form, features: form.features.map((f, i) => ({ ...f, key: leaves[i].key.split("/").at(-1) })) };
    setDraft(fixed);
    const rowsOut = classCodec.toRows(fixed, ctx);
    const head = rowsOut[0];
    const identity = await loadBuiltinIdentity();
    const key = nameKey("class", head.key, head.payload.entry!.name);
    const ref = `class:${head.key}`;
    const clash = identity.refs.has(ref) ? ref : key ? identity.nameKeys.get(key) : null;
    if (clash) {
      setProblem(t("clash", { ref: clash }));
      return { ok: true, value: null };
    }
    const duplicate = rows.some(
      (r) =>
        r.kind === "class" &&
        r.key !== owned &&
        r.payload.entry &&
        (r.key === head.key || (key && nameKey("class", r.key, r.payload.entry.name) === key)),
    );
    if (duplicate) return { ok: false, error: "duplicateKey" };
    const file = assembleOpenPack(pack, rowsOut);
    file.manifest.payloadSha256 = "0".repeat(64);
    if (!(await loadOpenPackSchemaCheck())(file).ok) return { ok: false, error: "invalid" };
    const plan = classCodec.plan(fixed, ctx, rows);
    const usage = await store.usage();
    if (!usage.ok) return usage;
    if (usage.value.items + plan.addedRows > HOMEBREW_LIMITS.items) return { ok: false, error: "limitItems" };
    if (usage.value.bytes + plan.bytesDelta > HOMEBREW_LIMITS.bytes) return { ok: false, error: "limitBytes" };
    setProgress({ done: 0, total: plan.writes.length + plan.deletes.length });
    const result = await store.saveItems(pack.id, plan, (done, total) => {
      setOwned(head.key);
      setProgress({ done, total });
    });
    if (!result.ok) {
      if (!Number(result.detail)) return result;
      setProblem(t("class.partial"));
      return { ok: true, value: null };
    }
    reload();
    return { ok: true, value: null };
  }

  const parts = { form: draft, set, catalog };
  return (
    <form
      className="min-w-0 space-y-5 rounded-lg border p-3 sm:p-5"
      data-class-editor
      onSubmit={(e) => {
        e.preventDefault();
        setProblem("");
        if (issues.length) {
          setProblem(t("invalidFields", { fields: issues.map(issueName).join(", ") }));
          return;
        }
        if (saving) return;
        setSaving(true);
        void run(save).finally(() => {
          setSaving(false);
          setProgress(null);
        });
      }}
    >
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start xl:gap-5">
        <div className="min-w-0 space-y-5">
          <EditorHeading>{t("kind.class")}</EditorHeading>
          {!owned && (
            <label className="block space-y-1 text-sm">
              <span>{t("class.copyFrom")}</span>
              <select
                className="block w-full rounded border bg-background p-2"
                defaultValue=""
                onChange={(e) => {
                  const from = e.target.value;
                  const base = from ? classCodec.copyFrom(from, ctx.builtin) : classCodec.empty();
                  const { id: _id, nameEn, nameZh, textEn, textZh, features } = draft;
                  set({ ...base, id: draft.id, nameEn, nameZh, textEn, textZh, features });
                }}
              >
                <option value="">{t("class.copyNone")}</option>
                {catalog.ids.map((c) => (
                  <option key={c} value={c}>
                    {ctx.classNames[c]?.[zh ? "zh" : "en"] ?? c}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!owned && <p className="text-sm text-muted-foreground">{t("class.copyNote")}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextBox label={t("field.nameZh")} value={draft.nameZh} change={(nameZh) => set({ nameZh })} />
            <TextBox label={t("field.nameEn")} value={draft.nameEn} change={(nameEn) => set({ nameEn })} />
            <TextBox long label={t("field.textZh")} value={draft.textZh} change={(textZh) => set({ textZh })} />
            <TextBox long label={t("field.textEn")} value={draft.textEn} change={(textEn) => set({ textEn })} />
          </div>
          {(["chassis", "casting", "ladder", "features"] as const).map((step) => (
            <details key={step} open={step === "chassis"} className="rounded border p-3">
              <summary className="cursor-pointer font-medium">{t(`class.step.${step}`)}</summary>
              <div className="mt-3">
                {step === "chassis" && <ChassisStep {...parts} />}
                {step === "casting" && <CastingStep {...parts} />}
                {step === "ladder" && <LadderStep {...parts} />}
                {step === "features" && <FeatureSteps form={draft} set={set} generated={generated} />}
              </div>
            </details>
          ))}
        </div>
        {/* Desktop: the live table stays beside the form while it scrolls; phones keep it after the steps. */}
        <aside
          className={`mt-5 min-w-0 space-y-2 xl:sticky xl:top-4 xl:mt-0 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto ${preview ? "" : "hidden xl:block"}`}
          data-class-table-aside
        >
          <h4 className="text-sm text-muted-foreground">{t("class.table")}</h4>
          {preview ? (
            <div data-class-preview>
              <ClassTable head={preview[0]} zh={zh} labels={{ en: EN_TABLE_LABELS, zh: ctx.labels.zh }} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("class.tablePending")}</p>
          )}
        </aside>
      </div>
      {preview && <GeneratedFeatures rows={preview} zh={zh} />}
      {progress && <p role="status">{t("class.progress", progress)}</p>}
      {problem && <p role="alert">{problem}</p>}
      <Button type="submit" disabled={saving} aria-busy={saving}>
        {saving && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
        {t("save")}
      </Button>
    </form>
  );
}
