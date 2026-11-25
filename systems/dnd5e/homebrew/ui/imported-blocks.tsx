import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import { EntriesRenderer } from "../../reference/entries-renderer";
import { loadOpenPackSchemaCheck } from "../../content-pack/open/load";
import { assembleOpenPack } from "../domain/assemble";
import type { HomebrewItemRecord, HomebrewPackRecord } from "../domain/types";
import type { DndHomebrewStore, HomebrewResult } from "../store-port";

/** A rich import never passes through the lossy simple-markup conversion. Replace only the edited blocks. */
export function ImportedBlocks({
  row,
  pack,
  store,
  run,
  close,
}: {
  row: HomebrewItemRecord;
  pack: HomebrewPackRecord;
  store: DndHomebrewStore;
  run(write: () => Promise<HomebrewResult<unknown>>): Promise<void>;
  close(): void;
}) {
  const t = useTranslations("homebrew");
  const zh = useLocale() === "zh-TW";
  const [initial] = useState(row);
  const entry = initial.payload.entry!;
  const [en, setEn] = useState(() => JSON.stringify(entry.entries, null, 2));
  const [local, setLocal] = useState(() =>
    JSON.stringify(initial.payload.zhTW?.entries, null, 2),
  );
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          let english, translated;
          try {
            english = JSON.parse(en);
            translated = initial.payload.zhTW ? JSON.parse(local) : null;
          } catch {
            return { ok: false, error: "invalid" };
          }
          const payload = {
            ...initial.payload,
            entry: { ...entry, entries: english },
            ...(initial.payload.zhTW
              ? { zhTW: { ...initial.payload.zhTW, entries: translated } }
              : {}),
          };
          const one = assembleOpenPack(pack, [{ ...initial, payload }]);
          one.manifest.payloadSha256 = "0".repeat(64);
          if (!(await loadOpenPackSchemaCheck())(one).ok)
            return { ok: false, error: "invalid" };
          const result = await store.saveItem(pack.id, {
            id: initial.id,
            expectedRevision: initial.revision,
            kind: initial.kind,
            key: initial.key,
            payload,
          });
          if (result.ok) close();
          return result;
        });
      }}
    >
      <h3>{(zh && initial.payload.zhTW?.name) || entry.name}</h3>
      <p>{t("readOnly")}</p>
      <EntriesRenderer
        context={{ resolveRef: () => null }}
        entries={
          zh && initial.payload.zhTW
            ? initial.payload.zhTW.entries
            : entry.entries
        }
      />
      <details>
        <summary>{t("advanced")}</summary>
        <label>
          {t("field.textEn")}
          <Textarea value={en} onChange={(e) => setEn(e.target.value)} />
        </label>
        {initial.payload.zhTW && (
          <label>
            {t("field.textZh")}
            <Textarea
              value={local}
              onChange={(e) => setLocal(e.target.value)}
            />
          </label>
        )}
        <Button type="submit">{t("save")}</Button>
      </details>
    </form>
  );
}
