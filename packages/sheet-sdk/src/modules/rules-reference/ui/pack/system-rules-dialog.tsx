"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { systemRulesPort, type SystemRulesReader } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { EntryList } from "./entry-list";
import { RuleBlocks } from "./rule-blocks";

/** Mounted with a fresh key per request; a late response never replaces a newer view. */
function Load<T>({ get, children }: { get: () => Promise<T>; children: (data: T) => ReactNode }) {
  const t = useTranslations("packRules");
  const [request] = useState(() => get);
  const [state, setState] = useState<{ data: T } | "error" | null>(null);
  useEffect(() => {
    let active = true;
    void request().then(data => { if (active) setState({ data }); }, () => { if (active) setState("error"); });
    return () => { active = false; };
  }, [request]);
  if (state === "error") return <p role="alert">{t("error")}</p>;
  return state ? children(state.data) : <p role="status">{t("loading")}</p>;
}

type View = { kind: "contents" } | { kind: "document"; target: string } | { kind: "collection"; id: string; page: number } | { kind: "search"; query: string };

function Reader({ reader }: { reader: SystemRulesReader }) {
  const t = useTranslations("packRules");
  const [view, setView] = useState<View>({ kind: "contents" });
  const [query, setQuery] = useState("");
  const navigate = (target: string) => setView({ kind: "document", target });
  const entry = (collection: string, key: string) => navigate(`entry:${collection}/${key}`);
  const key = JSON.stringify(view);
  return <>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (query.trim()) setView({ kind: "search", query: query.trim() }); }}>
      <input type="search" className="min-w-0 flex-1 rounded border px-2" aria-label={t("search")} placeholder={t("search")} value={query} maxLength={200} onChange={e => setQuery(e.target.value)} />
      <button disabled={!query.trim()}>{t("search")}</button>
    </form>
    {view.kind !== "contents" && <button className="justify-self-start underline" onClick={() => setView({ kind: "contents" })}>{t("contents")}</button>}
    {view.kind === "contents" && <Load key={key} get={() => Promise.all([reader.toc(), reader.collections()])}>{([sections, collections]) => <nav aria-label={t("contents")}><h3>{t("contents")}</h3><ul>
      {sections.map(s => <li className={s.parent_key ? "pl-4" : undefined} key={s.key}><button className="py-1 underline" onClick={() => navigate(s.key)}>{s.title}</button></li>)}
      {collections.map(c => <li key={`collection:${c.key}`}><button className="py-1 underline" onClick={() => setView({ kind: "collection", id: c.key, page: 0 })}>{c.title}</button></li>)}
    </ul></nav>}</Load>}
    {view.kind === "collection" && <Load key={key} get={() => reader.entries(view.id, view.page)}>{data => <EntryList {...data} page={view.page} changePage={page => setView({ ...view, page })} select={id => entry(view.id, id)} />}</Load>}
    {view.kind === "search" && <Load key={key} get={() => reader.search(view.query)}>{hits => hits.length ? <ul>{hits.map(hit => <li key={`${hit.collection}/${hit.key}`}><button className="underline" onClick={() => hit.collection ? entry(hit.collection, hit.key) : navigate(hit.key)}>{hit.title}</button><p>{hit.snippet}</p></li>)}</ul> : <p>{t("empty")}</p>}</Load>}
    {view.kind === "document" && <Load key={key} get={() => {
      if (!view.target.startsWith("entry:")) return reader.section(view.target);
      const [collection, id] = view.target.slice(6).split("/");
      return reader.entry(collection, id);
    }}>{doc => <article><h2 className="mb-2 text-xl font-semibold">{doc.title}</h2>{doc.summary && <p>{doc.summary}</p>}<RuleBlocks blocks={doc.blocks} navigate={navigate} /></article>}</Load>}
  </>;
}

export function SystemRulesDialog({ systemId, open, onOpenChange }: { systemId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("packRules");
  const read = useHostPort(systemRulesPort);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
    <DialogTitle>{t("title")}</DialogTitle>
    {open && (read ? <Load key={systemId} get={() => read(systemId)}>{reader => <Reader reader={reader} />}</Load> : <p>{t("error")}</p>)}
  </DialogContent></Dialog>;
}
