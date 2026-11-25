import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { assembleOpenPack } from "../domain/assemble";
import { loadBuiltinIdentity, loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { nameKey } from "../../content-pack/domain/identity";
import { EntriesRenderer } from "../../reference/entries-renderer";
import {
  HOMEBREW_FORMS,
  newHomebrewId,
  type HomebrewForms,
} from "../domain/forms";
import type { HomebrewFormKind, HomebrewItemRecord } from "../domain/types";
import type { DndHomebrewStore, HomebrewResult } from "../store-port";
import { slugId } from "../../reference/tags";
import { backgroundRefs, BackgroundChoices } from "./background-refs";
import { ImportedBlocks } from "./imported-blocks";
import type { HomebrewPackRecord } from "../domain/types";
import { Field } from "./form-fields";

type Props<K extends HomebrewFormKind> = {
  kind: K;
  row?: HomebrewItemRecord;
  rows: HomebrewItemRecord[];
  allRows: HomebrewItemRecord[];
  pack: HomebrewPackRecord;
  store: DndHomebrewStore;
  reload(): void;
  run(
    write: () => Promise<HomebrewResult<unknown>>,
    done?: () => void,
  ): Promise<void>;
};
export function ItemEditor<K extends HomebrewFormKind>({
  kind,
  row,
  rows,
  allRows,
  pack,
  store,
  run,
  reload,
}: Props<K>) {
  const t = useTranslations("homebrew");
  const zh = useLocale() === "zh-TW";
  const codec = HOMEBREW_FORMS[kind];
  const [original] = useState(() =>
    row
      ? codec.fromPayload(row.payload)
      : { lossless: true, form: codec.empty() },
  );
  const [draft, setDraft] = useState<HomebrewForms[K]>(original.form);
  const [revision] = useState(row?.revision);
  const [fallback] = useState(() => newHomebrewId(""));
  const [problem, setProblem] = useState("");
  const form = {
    ...draft,
    id:
      draft.id ||
      (slugId(draft.nameEn) ? newHomebrewId(draft.nameEn) : fallback),
  };
  const issues = codec.issues(form);
  const preview = issues.length ? null : codec.toPayload(form);
  if (!original.lossless && row)
    return (
      <ImportedBlocks
        row={row}
        pack={pack}
        store={store}
        run={run}
        close={reload}
      />
    );
  const core = new Set([
    "nameZh",
    "nameEn",
    "category",
    "rarity",
    "level",
    "school",
    "size",
    "speed",
    "originFeat",
    "skills",
    "classes",
    "traits",
    "textZh",
    "textEn",
  ]);
  const fields = (primary: boolean) =>
    Object.entries(draft)
      .filter(([k]) => core.has(k) === primary && (k !== "id" || !row))
      .map(([k, v]) => (
        <Field
          key={k}
          kind={kind}
          name={k}
          value={v}
          change={(x) => {
            setProblem("");
            setDraft({ ...draft, [k]: x });
          }}
        />
      ));
  return (
    <form
      className="space-y-5 rounded-lg border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setProblem("");
        if (!preview?.entry) {
          setProblem(
            t("invalidFields", {
              fields: issues.map((x) => t(`field.${x}`)).join(", "),
            }),
          );
          return;
        }
        void run(async () => {
          const identity = await loadBuiltinIdentity();
          const entry = preview.entry!;
          const key = nameKey(kind, entry.id, entry.name);
          const ref = `${kind}:${entry.id}`;
          const clash = identity.refs.has(ref)
            ? ref
            : key
              ? identity.nameKeys.get(key)
              : null;
          if (clash) {
            setProblem(t("clash", { ref: clash }));
            return { ok: true, value: null };
          }
          if (
            rows.some(
              (r) =>
                r.id !== row?.id &&
                r.kind === kind &&
                r.payload.entry &&
                (r.key === entry.id ||
                  (key && nameKey(kind, r.key, r.payload.entry.name) === key)),
            )
          )
            return { ok: false, error: "duplicateKey" };
          const refs =
            kind === "background" ? await backgroundRefs(allRows) : null;
          if (
            refs &&
            "originFeat" in form &&
            (refs.get(form.originFeat)?.meta.category !== "origin" ||
              [
                ...form.toolGrants,
                ...form.equipmentA.items.map((i) => i.ref).filter(Boolean),
              ].some((ref) => !refs.has(ref)))
          )
            return { ok: false, error: "invalid" };
          const payload = codec.toPayload(form, {
            lookup(ref) {
              if (refs) return refs.get(ref);
              const other = allRows.find((r) => `${r.kind}:${r.key}` === ref)
                ?.payload.entry;
              return identity.refs.has(ref)
                ? { ref, builtin: true, name: ref, meta: {} }
                : other
                  ? {
                      ref,
                      builtin: false,
                      name: other.name,
                      meta: other.meta ?? {},
                    }
                  : undefined;
            },
          });
          const one = assembleOpenPack(pack, [{ kind, key: entry.id, payload }]);
          one.manifest.payloadSha256 = "0".repeat(64);
          if (!(await loadOpenPackSchemaCheck())(one).ok)
            return { ok: false, error: "invalid" };
          const saved = await store.saveItem(pack.id, {
            id: row?.id,
            expectedRevision: revision,
            kind,
            key: entry.id,
            payload,
          });
          if (saved.ok) reload();
          return saved;
        });
      }}
    >
      <h3 className="font-heading text-xl">
        {t(`kind.${kind as HomebrewFormKind}`)}
      </h3>
      {kind === "background" && <BackgroundChoices rows={allRows} />}
      <div className="grid gap-4 sm:grid-cols-2">{fields(true)}</div>
      <details>
        <summary className="cursor-pointer font-medium">{t("details")}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">{fields(false)}</div>
      </details>
      {preview?.entry && (
        <section className="rounded bg-muted p-4">
          <h4 className="text-sm text-muted-foreground">{t("preview")}</h4>
          <strong>{(zh && preview.zhTW?.name) || preview.entry.name}</strong>
          <EntriesRenderer
            context={{ resolveRef: () => null }}
            entries={
              zh && preview.zhTW ? preview.zhTW.entries : preview.entry.entries
            }
          />
        </section>
      )}
      {problem && <p role="alert">{problem}</p>}
      <Button type="submit">{t("save")}</Button>
    </form>
  );
}
