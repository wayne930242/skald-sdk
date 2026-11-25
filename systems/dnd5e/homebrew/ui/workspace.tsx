"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@skald/sheet-sdk/components/ui/switch";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import {
  dndHomebrewStorePort,
  type DndHomebrewStore,
  type HomebrewResult,
  type HomebrewErrorCode,
} from "../store-port";
import {
  HOMEBREW_FORM_KINDS,
  type HomebrewFormKind,
  type HomebrewItemRecord,
} from "../domain/types";
import { formKindOf } from "../domain/forms";
import { TransferSlot } from "./transfer-slot";
import { ItemEditor } from "./item-editor";
import { SubclassEditor } from "./subclass-editor";
import { subclassCodec } from "../domain/subclass";

type EditorKind = HomebrewFormKind | "subclass";
/** Kinds with an editor, in list order. */
const EDITOR_KINDS: readonly EditorKind[] = [...HOMEBREW_FORM_KINDS, "subclass"];

async function load(store: DndHomebrewStore) {
  if ((await store.owner()) !== "account") return { error: "signIn" } as const;
  const [packs, usage] = await Promise.all([store.listPacks(), store.usage()]);
  if (!packs.ok) return { error: packs.error };
  if (!usage.ok) return { error: usage.error };
  const results = await Promise.all(
    packs.value.map((p) => store.listItems(p.id)),
  );
  const items: Record<string, HomebrewItemRecord[]> = {};
  for (const [i, result] of results.entries()) {
    if (!result.ok) return { error: result.error };
    items[packs.value[i].id] = result.value;
  }
  return { packs: packs.value, usage: usage.value, items };
}

export function HomebrewWorkspace({ signInLink }: { signInLink?: ReactNode }) {
  const store = useHostPort(dndHomebrewStorePort);
  const t = useTranslations("homebrew");
  return (
    <main className="container mx-auto max-w-6xl space-y-5 px-4 py-8">
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      {store ? (
        <AccountWorkspace store={store} signInLink={signInLink} />
      ) : (
        <p role="status">{t("unavailable")}</p>
      )}
    </main>
  );
}
function AccountWorkspace({
  store,
  signInLink,
}: {
  store: DndHomebrewStore;
  signInLink?: ReactNode;
}) {
  const t = useTranslations("homebrew");
  const zh = useLocale() === "zh-TW";
  const [data, setData] = useState<Awaited<ReturnType<typeof load>> | null>(
    null,
  );
  const [error, setError] = useState<HomebrewErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorGeneration, resetEditor] = useState(0);
  const [packId, setPack] = useState("");
  const [selection, select] = useState<{
    kind: EditorKind;
    id?: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    let active = true;
    load(store).then(
      (next) => {
        if (active) setData(next);
      },
      () => {
        if (active) setData({ error: "network" });
      },
    );
    return () => {
      active = false;
    };
  }, [store]);
  async function run(
    write: () => Promise<HomebrewResult<unknown>>,
    done?: () => void,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await write();
      if (result.ok) done?.();
      else setError(result.error);
      setData(await load(store));
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role="status">{t("loading")}</p>;
  if (data.error === "signIn")
    return (
      <p>
        {t("error.signIn")} {signInLink}
      </p>
    );
  if (!data.packs)
    return (
      <p role="alert">
        {t(`error.${data.error}`)}{" "}
        <Button onClick={() => run(async () => ({ ok: true, value: null }))}>
          {t("reload")}
        </Button>
      </p>
    );
  const packs = data.packs;
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const rows = pack ? data.items[pack.id] : [];
  const selected = rows.find((r) => r.id === selection?.id);
  const subclassKeys = new Set(rows.filter((r) => r.kind === "subclass").map((r) => r.key));
  /** A feature row of a subclass in this pack is listed under it, not on its own. */
  const grouped = (r: HomebrewItemRecord) =>
    r.kind === "subclassFeature" && subclassKeys.has(r.key.split("/").slice(0, 2).join("/"));
  const rowName = (r: HomebrewItemRecord) =>
    (zh && r.payload.zhTW?.name) || r.payload.entry?.name || r.key;
  const open = (id: string) => {
    setPack(id);
    select(null);
    setQuery("");
    setError(null);
  };
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-5">
      <form
        className="flex max-w-lg items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await store.createPack({
              name: name.trim(),
              packId: `hb-${crypto.randomUUID()}`,
            });
            if (r.ok) {
              open(r.value.id);
              setName("");
            }
            return r;
          });
        }}
      >
        <label className="grow">
          {t("packName")}
          <Input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button disabled={!name.trim()}>{t("create")}</Button>
      </form>
      <ul className="divide-y rounded-lg border">
        {packs.map((p, i) => (
          <li key={p.id} className={`flex flex-wrap items-center gap-2 p-2 ${pack.id === p.id ? "bg-muted/60" : ""}`}>
            <Button
              variant={pack.id === p.id ? "secondary" : "ghost"}
              aria-pressed={pack.id === p.id}
              className="min-w-0 max-w-full justify-start"
              onClick={() => open(p.id)}
            >
              <span className="truncate">{p.name} ({data.items[p.id].length})</span>
            </Button>
            <div className="ml-auto flex items-center gap-1">
            <Switch
              aria-label={`${p.name}: ${t(p.enabled ? "enabled" : "disabled")}`}
              checked={p.enabled}
              onCheckedChange={() =>
                run(() => store.updatePack(p.id, { enabled: !p.enabled }))
              }
            />
            <span className="sr-only">{t(p.enabled ? "enabled" : "disabled")}</span>
            {([-1, 1] as const).map((d) => (
              <Button
                variant="ghost"
                size="icon-sm" title={t(d < 0 ? "up" : "down")}
                key={d}
                disabled={!packs[i + d]}
                onClick={() =>
                  run(async () => {
                    const neighbor = packs[i + d];
                    const r = await store.updatePack(p.id, {
                      position: neighbor.position,
                    });
                    return r.ok
                      ? store.updatePack(neighbor.id, { position: p.position })
                      : r;
                  })
                }
              >
                {d < 0 ? <ArrowUp /> : <ArrowDown />}<span className="sr-only">{t(d < 0 ? "up" : "down")}</span>
              </Button>
            ))}
            <Button
              variant="ghost" size="icon-sm" title={t("rename")}
              onClick={() => {
                const n = window.prompt(t("rename"), p.name)?.trim();
                if (n) void run(() => store.updatePack(p.id, { name: n }));
              }}
            >
              <Pencil /><span className="sr-only">{t("rename")}</span>
            </Button>
            <Button
              variant="ghost" size="icon-sm" title={t("delete")}
              onClick={() => {
                if (window.confirm(t("confirm", { name: p.name })))
                  void run(
                    () => store.deletePack(p.id),
                    () => select(null),
                  );
              }}
            >
              <Trash2 /><span className="sr-only">{t("delete")}</span>
            </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {t("usage", {
          items: data.usage.items,
          kb: Math.ceil(data.usage.bytes / 1024),
        })}
      </p>
      <TransferSlot pack={pack} onImported={async (id) => {
        open(id);
        try { setData(await load(store)); } catch { setError("network"); }
      }} />
      {error && (
        <p role="alert">
          {t(`error.${error}`)}{" "}
          {error === "conflict" && (
            <Button
              onClick={() =>
                run(
                  async () => ({ ok: true, value: null }),
                  () => resetEditor((n) => n + 1),
                )
              }
            >
              {t("reload")}
            </Button>
          )}
        </p>
      )}
      {pack && (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(14rem,1fr)_2fr]">
          <aside className="space-y-3 rounded-lg border p-4">
            <h2 className="font-heading text-xl">{pack.name}</h2>
            <Input
              aria-label={t("search")}
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {[
              ...new Set([...EDITOR_KINDS, ...rows.filter((r) => !grouped(r)).map((r) => r.kind)]),
            ].map((kind) => (
              <section key={kind} className="space-y-1">
                <h3 className="font-medium">
                  {t.has(`kind.${kind}`) ? t(`kind.${kind}`) : kind}
                </h3>
                {EDITOR_KINDS.includes(kind as EditorKind) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => select({ kind: kind as EditorKind })}
                  >
                    {t("add", { field: t(`kind.${kind}`) })}
                  </Button>
                )}
                {rows
                  .filter(
                    (r) =>
                      r.kind === kind &&
                      !grouped(r) &&
                      [r.payload.entry?.name, r.payload.zhTW?.name, r.key].some(
                        (n) =>
                          n?.toLowerCase().includes(query.trim().toLowerCase()),
                      ),
                  )
                  .map((r) => {
                    const features = r.kind === "subclass" ? subclassCodec.rowsOf(r.key, rows) : [];
                    const k: EditorKind | null = r.kind === "subclass" ? "subclass" : formKindOf(r.payload);
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between"
                      >
                        <button
                          disabled={!k}
                          onClick={() => k && select({ kind: k, id: r.id })}
                        >
                          {rowName(r)}
                        </button>
                        {r.kind === "subclass" && (
                          <span className="ml-1 mr-auto text-xs text-muted-foreground" data-feature-count>
                            {t("subclass.features", { count: features.length })}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const message =
                              r.kind === "subclass"
                                ? t("subclass.confirmDelete", { name: rowName(r), count: features.length })
                                : t("confirm", { name: rowName(r) });
                            if (window.confirm(message))
                              void run(async () => {
                                // Features first: a stopped delete leaves the subclass row listed, so deleting again finishes.
                                for (const f of features) {
                                  const gone = await store.deleteItem(f.id);
                                  if (!gone.ok) return gone;
                                }
                                return store.deleteItem(r.id);
                              }, () => select(null));
                          }}
                        >
                          {t("delete")}
                        </Button>
                      </div>
                    );
                  })}
              </section>
            ))}
          </aside>
          {selection?.kind === "subclass" && (!selection.id || selected) && (
            <SubclassEditor
              key={`${editorGeneration}/${pack.id}/subclass/${selected?.id ?? "new"}`}
              row={selected}
              pack={pack}
              rows={rows}
              allRows={Object.values(data.items).flat()}
              store={store}
              run={run}
              reload={() => select(null)}
            />
          )}
          {selection && selection.kind !== "subclass" && (!selection.id || selected) && (
            <ItemEditor
              key={`${editorGeneration}/${pack.id}/${selection.kind}/${selected?.id ?? "new"}`}
              kind={selection.kind}
              row={selected}
              pack={pack}
              rows={rows}
              allRows={Object.values(data.items).flat()}
              store={store}
              run={run}
              reload={() => select(null)}
            />
          )}
        </div>
      )}
    </fieldset>
  );
}
