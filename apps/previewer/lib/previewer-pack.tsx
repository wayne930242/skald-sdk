"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SystemProvider } from "@skald/sheet-sdk/components/providers";
import { SystemRulesDialog } from "@skald/sheet-sdk/modules/rules-reference/ui/pack/system-rules-dialog";
import { issuePointer, parseSystemPack, SYSTEM_PACK_LIMITS, type SystemPackIssue } from "@skald/sheet-sdk/modules/systems/domain/system-pack";
import { systemRulesPort } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { bindHostPort, HostPortsProvider } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { MODES, type PreviewMode } from "./systems";
import { SheetBody } from "./previewer-sheet";
import { preparePack } from "./system-pack";

type Prepared = ReturnType<typeof preparePack>;
function PackSheet({ preview }: { preview: Prepared }) {
  const t = useTranslations('previewer');
  const [mode, setMode] = useState<PreviewMode>('play');
  const [open, setOpen] = useState(false);
  const { system, reader } = preview;
  const slug = system.config.id;
  const ports = useMemo(() => [bindHostPort(systemRulesPort, async (id: string) => {
    if (id !== slug) throw new Error(`Unknown system: ${id}`);
    return reader;
  })], [slug, reader]);
  return <HostPortsProvider ports={ports}><SystemProvider system={system}>
    <h2 className="text-xl font-semibold">{system.config.name} · {system.config.version}</h2>
    <div className="flex flex-wrap gap-2">
      {MODES.map(m => <button key={m} className="rounded-btn border px-3 py-1 aria-pressed:bg-muted" aria-pressed={m === mode} onClick={() => setMode(m)}>{t(`modes.${m}`)}</button>)}
      <button className="rounded-btn border px-3 py-1" onClick={() => setOpen(true)}>{t('systemPack.rules')}</button>
    </div>
    <SystemRulesDialog systemId={slug} open={open} onOpenChange={setOpen} />
    <SheetBody preview={preview} slug={slug} mode={mode} initialData={system.defaultData} onClosePrint={() => setMode('play')} />
  </SystemProvider></HostPortsProvider>;
}

export function PreviewerPack({ iconNames }: { iconNames: string[] }) {
  const t = useTranslations('previewer');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Prepared | null>(null);
  const [issues, setIssues] = useState<SystemPackIssue[]>([]);
  const [error, setError] = useState('');
  const load = async (file: File) => {
    setBusy(true); setPreview(null); setIssues([]); setError('');
    try {
      if (file.size > SYSTEM_PACK_LIMITS.maxPackBytes) {
        setIssues([{ code: 'limit_exceeded', path: [], message: `${file.size} > ${SYSTEM_PACK_LIMITS.maxPackBytes} (maxPackBytes)` }]);
        return;
      }
      const result = await parseSystemPack(await file.text(), { gameIconNames: new Set(iconNames) });
      if (result.pack) setPreview(preparePack(result.pack));
      else setIssues(result.issues);
    } catch (e) { setError(e instanceof Error ? e.message : t('systemPack.failed')); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-7xl space-y-4 px-4 py-8">
    <Link href={`/${locale}`} className="underline">{t('home')}</Link>
    <h1 className="text-2xl font-semibold">{t('systemPack.title')}</h1>
    <p>{t('systemPack.note')}</p>
    <label className="block">{t('packs.load')} <input type="file" accept=".json,application/json" disabled={busy} onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (file) void load(file);
    }} /></label>
    {busy && <p role="status">{t('packs.checking')}</p>}
    {error && <p role="alert">{error}</p>}
    {issues.length > 0 && <ul role="alert">{issues.map((i, n) => <li key={n}><code>{i.code} {issuePointer(i.path)}</code>: {i.message}</li>)}</ul>}
    {preview && <PackSheet preview={preview} />}
  </main>;
}
