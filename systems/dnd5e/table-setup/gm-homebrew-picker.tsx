"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@skald/sheet-sdk/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@skald/sheet-sdk/components/ui/alert-dialog";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Progress } from "@skald/sheet-sdk/components/ui/progress";
import { TABLE_HOMEBREW_LIMITS, type ShareAddition } from "../homebrew/domain/share";
import type { HomebrewItemKind, HomebrewItemRecord } from "../homebrew/domain/types";
import type { TableShare, TableShareItem } from "../homebrew/table-share-port";
import { isPickableKind, type ShareView } from "./gm-homebrew-model";
import type { GmHomebrewShare } from "./use-gm-homebrew-share";

/** The kinds' order in the list; any other kind falls under 「其他」. */
const KIND_ORDER = ["class", "subclass", "species", "lineage", "background", "feat", "spell", "optionalFeature", "item", "baseItem"] as const;
type KindGroup = (typeof KIND_ORDER)[number] | "other";

const groupOf = (kind: HomebrewItemKind): KindGroup => ((KIND_ORDER as readonly string[]).includes(kind) ? (kind as KindGroup) : "other");

const rowName = (row: HomebrewItemRecord, zh: boolean) => (zh ? row.payload.zhTW?.name : undefined) || row.payload.entry?.name || row.key;
const copyName = (item: TableShareItem, zh: boolean) => (zh ? item.nameZh : undefined) || item.name;

/**
 * The share picker under 「GM 的自製內容」: the viewer's own D&D homebrew by pack and kind, with
 * what each tick takes along, how each copy on the table compares with its source, the table's
 * use, and the other sharers' entries (the owner may remove them). Nothing is written here: the
 * setup's save sends the share (`useGmHomebrewShare`), except the owner's removal of someone else's.
 */
export function GmHomebrewPicker({ share, disabled }: { share: GmHomebrewShare; disabled?: boolean }) {
  const t = useTranslations("dndShare");
  const zh = useLocale() === "zh-TW";
  const { snapshot, view } = share;

  if (share.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          {t("loadFailed")}
          <Button type="button" variant="outline" className="min-h-11" onClick={share.reload} disabled={disabled}>{t("retry")}</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!snapshot || !view) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  }

  const { viewerId, ownerId } = snapshot.list;
  const others = snapshot.list.shares.filter((s) => s.sharedBy !== viewerId);
  const names = new Map(snapshot.rows.map((row) => [row.id, rowName(row, zh)]));

  return (
    <div className="grid gap-4 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{t("heading")}</h3>
      <Usage view={view} />
      {view.limits.over && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{t(view.limits.over === "items" ? "errors.limitItems" : "errors.limitBytes")}</AlertDescription>
        </Alert>
      )}
      {share.account === "account" ? (
        <OwnEntries share={share} view={view} names={names} zh={zh} disabled={disabled} />
      ) : (
        <p className="text-sm text-muted-foreground">{t(share.account === "guest" ? "guest" : "errors.signIn")}</p>
      )}
      {view.closure.links.length > 0 && (
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {view.closure.links.map((link) => (
            <li key={`${link.from}>${link.to}`} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("links", { from: names.get(link.from) ?? link.from, to: names.get(link.to) ?? link.to })}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div className="grid gap-3">
          <h4 className="text-sm font-medium">{t("others")}</h4>
          {others.map((other) => (
            <OtherShare key={other.sharedBy} other={other} zh={zh} canRemove={viewerId === ownerId}
              disabled={disabled || share.busy} onRemove={() => share.removeOther(other.sharedBy)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Usage({ view }: { view: ShareView }) {
  const t = useTranslations("dndShare");
  const { items, bytes } = view.limits;
  const kb = (value: number) => Math.ceil(value / 1024);
  return (
    <div className="grid gap-2 text-sm">
      <span className="text-muted-foreground">{t("usage.label")}</span>
      <div className="grid gap-1">
        <span>{t("usage.items", { count: items, max: TABLE_HOMEBREW_LIMITS.items })}</span>
        <Progress value={Math.min(100, (items / TABLE_HOMEBREW_LIMITS.items) * 100)} aria-label={t("usage.items", { count: items, max: TABLE_HOMEBREW_LIMITS.items })} />
      </div>
      <div className="grid gap-1">
        <span>{t("usage.bytes", { used: kb(bytes), max: kb(TABLE_HOMEBREW_LIMITS.bytes) })}</span>
        <Progress value={Math.min(100, (bytes / TABLE_HOMEBREW_LIMITS.bytes) * 100)} aria-label={t("usage.bytes", { used: kb(bytes), max: kb(TABLE_HOMEBREW_LIMITS.bytes) })} />
      </div>
    </div>
  );
}

function OwnEntries({ share, view, names, zh, disabled }: {
  share: GmHomebrewShare;
  view: ShareView;
  names: ReadonlyMap<string, string>;
  zh: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("dndShare");
  const rows = share.snapshot?.rows ?? [];
  const pickable = rows.filter((row) => isPickableKind(row.kind));
  const own = share.snapshot ? share.snapshot.list.shares.some((s) => s.sharedBy === share.snapshot!.list.viewerId) : false;
  const added = new Map<string, ShareAddition>(view.closure.added.map((a) => [a.id, a]));
  const sent = new Set(view.closure.ids);

  const statusOf = (id: string) => {
    const status = view.status.get(id);
    if (!status) return null;
    if (view.dirty && !sent.has(id)) return t("status.willRemove");
    if (status === "newer") return t(view.dirty ? "status.willUpdate" : "status.newer");
    return t("status.onTable");
  };

  return (
    <div className="grid gap-3">
      <h4 className="text-sm font-medium">{t("yours")}</h4>
      {pickable.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {view.hasNewer && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{t("refreshHint")}</span>
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => share.setRefresh(!share.draft.refresh)}>
            {share.draft.refresh ? t("refreshUndo") : t("refresh")}
          </Button>
        </div>
      )}
      {view.dirty && own && <p className="text-sm text-muted-foreground">{t("dirtyHint")}</p>}
      {share.packs.map((pack) => {
        const inPack = pickable.filter((row) => row.packUuid === pack.id);
        if (inPack.length === 0) return null;
        const groups = [...KIND_ORDER, "other" as const]
          .map((group) => ({ group, rows: inPack.filter((row) => groupOf(row.kind) === group) }))
          .filter((entry) => entry.rows.length > 0);
        return (
          <div key={pack.id} className="grid gap-2">
            <h5 className="text-sm font-medium">{pack.name}</h5>
            {groups.map(({ group, rows: groupRows }) => (
              <fieldset key={group} className="grid gap-1">
                <legend className="text-xs text-muted-foreground">{t(`kinds.${group}`)}</legend>
                {groupRows.map((row) => {
                  const picked = share.draft.picked.includes(row.id);
                  const addition = added.get(row.id);
                  const id = `gm-homebrew-${row.id}`;
                  const status = statusOf(row.id);
                  return (
                    <div key={row.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
                      <Checkbox id={id} checked={picked || !!addition} disabled={disabled || (!!addition && !picked)}
                        onCheckedChange={() => share.toggle(row.id)} />
                      <Label htmlFor={id} className="font-normal">{rowName(row, zh)}</Label>
                      {addition && !picked && (
                        <Badge variant="secondary">{t("added")}</Badge>
                      )}
                      {addition && !picked && (
                        <span className="text-xs text-muted-foreground">{t(`addedReason.${addition.reason}`, { name: names.get(addition.by) ?? "" })}</span>
                      )}
                      {status && <Badge variant="outline">{status}</Badge>}
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>
        );
      })}
      {view.deleted.length > 0 && (
        <div className="grid gap-2">
          <h5 className="text-sm font-medium">{t("deletedHeading")}</h5>
          <p className="text-sm text-muted-foreground">{t("deletedHint")}</p>
          <ul className="grid gap-1 text-sm">
            {view.deleted.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <span>{copyName(item, zh)}</span>
                <Badge variant="outline">{t(view.dirty ? "status.willRemove" : "status.deleted")}</Badge>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" className="min-h-11 w-fit" disabled={disabled}
            onClick={() => share.setRemoveDeleted(!share.draft.removeDeleted)}>
            {share.draft.removeDeleted ? t("keep") : t("remove")}
          </Button>
        </div>
      )}
    </div>
  );
}

function OtherShare({ other, zh, canRemove, disabled, onRemove }: {
  other: TableShare;
  zh: boolean;
  canRemove: boolean;
  disabled?: boolean;
  onRemove: () => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const t = useTranslations("dndShare");
  const [confirming, setConfirming] = useState(false);
  const name = other.sharerName ?? t("unnamed");
  const remove = async () => {
    const result = await onRemove();
    if (result.ok) toast.success(t("removed"));
    else toast.error(result.message);
  };
  return (
    <section className="grid gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-medium">{t("sharer", { name })}</h5>
        {other.isOwner && <Badge variant="secondary">{t("owner")}</Badge>}
        <span className="text-xs text-muted-foreground">{t("count", { count: other.itemCount })}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {other.items.map((item) => <li key={item.id}>{copyName(item, zh)}</li>)}
      </ul>
      {canRemove && (
        <>
          <Button type="button" variant="outline" className="min-h-11 w-fit" disabled={disabled} onClick={() => setConfirming(true)}>
            {t("remove")}
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("removeOther.title", { name })}</AlertDialogTitle>
                <AlertDialogDescription>{t("removeOther.description")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("removeOther.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void remove()}>{t("removeOther.confirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
