"use client";
import { use, useState } from "react";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { loadFatePresetCatalog } from "../../domain/presets";
import { fateRecoveryStatus } from "../../domain/lifecycle";
import type { FateLateralOption } from "../../domain/advancement";
import { useFatePlay } from "../play/play-context";
import { useSkillName } from "../play/use-skill-name";
import { stuntProse } from "../stunts/commands";
import { newOperation } from "./commands";
import { useSessionLabels } from "./labels";
import { milestoneState, previewMilestone, type MilestoneDraft } from "./milestone";
let catalogPromise: ReturnType<typeof loadFatePresetCatalog> | undefined;
function getCatalog() {
  if (!catalogPromise) {
    catalogPromise = loadFatePresetCatalog();
    catalogPromise.catch(() => {
      catalogPromise = undefined;
    });
  }
  return catalogPromise;
}
export function MilestoneForm({ kind, close }: { kind: "minor" | "major"; close: () => void }) {
  const t = useSessionLabels(),
    name = useSkillName(),
    catalog = use(getCatalog()),
    { data, editable, secretAccess, update } = useFatePlay();
  const [ctx] = useState(newOperation);
  const [d, set] = useState<MilestoneDraft>({ kind, lateral: null }),
    s = milestoneState(data, catalog, secretAccess, editable),
    l = d.lateral;
  const skills = s.skills.map((k) => ({
    id: k.id,
    label: `${name({ ...k, customName: k.custom ? k.name : undefined })} (${k.rating})`,
  }));
  const options = s.aspects
    .filter((a) => a.kind !== "highConcept" && a.id !== s.extremeAspectId)
    .map((a) => ({ id: a.id, label: a.text || t("emptyAspect") }));
  const select = (
    label: string,
    value: string,
    items: { id: string; label: string }[],
    change: (id: string) => void,
  ) => (
    <label>
      {label}
      <select
        className="block w-full rounded border p-2"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">{t("select")}</option>
        {items.map((i) => (
          <option value={i.id} key={i.id}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
  const setL = (lateral: FateLateralOption | null) => set({ ...d, lateral });
  function choose(k: string) {
    const choices: Record<string, FateLateralOption> = {
      swapSkills: { kind: "swapSkills", skillA: "", skillB: "" },
      replaceAverage: { kind: "replaceAverage", from: "", to: "" },
      rewriteAspect: { kind: "rewriteAspect", aspectId: "", text: "" },
      rewriteStunt: { kind: "rewriteStunt", stuntId: "" },
      purchaseStunt: { kind: "purchaseStunt" },
    };
    set({ ...d, lateral: choices[k] ?? null, stuntText: "" });
  }
  const preview = previewMilestone(data, d, catalog, secretAccess, editable, ctx),
    gm = d.gm ?? { refresh: false, secondSkillPoint: false };
  return (
    <div className="space-y-3">
      <h3>{t(kind)}</h3>
      {select(
        t("lateral"),
        l?.kind ?? "",
        (
          [
            "swapSkills",
            "replaceAverage",
            "rewriteAspect",
            "rewriteStunt",
            "purchaseStunt",
          ] as const
        ).map((id) => ({ id, label: t(id) })),
        choose,
      )}
      {l?.kind === "swapSkills" && (
        <>
          {select(t("from"), l.skillA, skills, (id) => setL({ ...l, skillA: id }))}
          {select(t("to"), l.skillB, skills, (id) => setL({ ...l, skillB: id }))}
        </>
      )}
      {l?.kind === "replaceAverage" && (
        <>
          {select(
            t("from"),
            l.from,
            skills.filter((_, i) => s.skills[i].rating === 1),
            (id) => setL({ ...l, from: id }),
          )}
          {select(
            t("to"),
            l.to,
            skills.filter((_, i) => s.skills[i].rating === 0),
            (id) => setL({ ...l, to: id }),
          )}
        </>
      )}
      {l?.kind === "rewriteAspect" && (
        <>
          {select(t("aspect"), l.aspectId, options, (id) => setL({ ...l, aspectId: id }))}
          <Input
            aria-label={t("newText")}
            value={l.text}
            onChange={(e) => setL({ ...l, text: e.target.value })}
          />
        </>
      )}
      {l?.kind === "rewriteStunt" &&
        select(
          t("stunt"),
          l.stuntId,
          s.stunts.map((st) => ({ id: st.id, label: st.title || stuntProse(st) || t("stunt") })),
          (id) => setL({ ...l, stuntId: id }),
        )}
      {(l?.kind === "rewriteStunt" || l?.kind === "purchaseStunt") && (
        <Input
          aria-label={t("newText")}
          value={d.stuntText ?? ""}
          onChange={(e) => set({ ...d, stuntText: e.target.value })}
        />
      )}
      {kind === "major" && (
        <>
          <div>
            {(["refresh", "secondSkillPoint"] as const).map((k) => (
              <label key={k} className="block">
                <input
                  type="checkbox"
                  checked={gm[k]}
                  onChange={(e) => set({ ...d, gm: { ...gm, [k]: e.target.checked } })}
                />
                {t(k)}
              </label>
            ))}
          </div>
          {s.aspects.some((a) => a.kind === "highConcept") && (
            <label>
              {t("highConcept")}
              <Input
                value={d.highConcept ?? ""}
                onChange={(e) => set({ ...d, highConcept: e.target.value || undefined })}
              />
            </label>
          )}
          {s.extremeAspectId && (
            <label>
              {t("extreme")}
              <Input
                value={d.extremeRename ?? ""}
                onChange={(e) => set({ ...d, extremeRename: e.target.value || undefined })}
              />
            </label>
          )}
          {s.injuries
            .filter((i) => i.severity !== "mild")
            .map((i) => {
              const recovering = fateRecoveryStatus(i, s.boundaries) !== "untreated";
              return (
                <div key={i.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        recovering
                          ? (d.clear?.includes(i.key) ?? false)
                          : Object.hasOwn(d.beginRecovery ?? {}, i.key)
                      }
                      onChange={(e) => {
                        if (recovering)
                          set({
                            ...d,
                            clear: e.target.checked
                              ? [...(d.clear ?? []), i.key]
                              : d.clear?.filter((k) => k !== i.key),
                          });
                        else {
                          const begin = { ...d.beginRecovery };
                          if (e.target.checked) begin[i.key] = i.renamable ? "" : i.text;
                          else delete begin[i.key];
                          set({ ...d, beginRecovery: begin });
                        }
                      }}
                    />
                    {i.text} · {t(recovering ? "clear" : "treat")}
                  </label>
                  {i.renamable && Object.hasOwn(d.beginRecovery ?? {}, i.key) && (
                    <Input
                      aria-label={t("newText")}
                      value={d.beginRecovery?.[i.key]}
                      onChange={(e) =>
                        set({
                          ...d,
                          beginRecovery: { ...d.beginRecovery, [i.key]: e.target.value },
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
          <details>
            <summary>{t("growth")}</summary>
            {s.skills.map((k) => (
              <label key={k.id} className="flex items-center justify-between">
                {name({ ...k, customName: k.custom ? k.name : undefined })}
                <Input
                  className="w-20"
                  type="number"
                  placeholder={String(k.rating)}
                  value={d.increases?.[k.id] ?? ""}
                  onChange={(e) => {
                    const increases = { ...d.increases };
                    if (e.target.value === "") delete increases[k.id];
                    else increases[k.id] = Number(e.target.value);
                    set({ ...d, increases });
                  }}
                />
              </label>
            ))}
          </details>
        </>
      )}
      <aside className="rounded-lg border p-3" aria-live="polite">
        <strong>{t("preview")}</strong>
        {preview.ok ? (
          <>
            <p>
              {t("bank", { points: preview.delta.bankedSkillRanks, refresh: preview.card.refresh })}
            </p>
            {Object.entries(preview.delta.skills).map(([id, value]) => (
              <p key={id}>
                {skills.find((k) => k.id === id)?.label} → {value}
              </p>
            ))}
            {Object.entries(preview.delta.aspects).map(([id, text]) => (
              <p key={id}>
                {s.aspects.find((a) => a.id === id)?.text} → {text}
              </p>
            ))}
            {(preview.delta.purchaseStunt || preview.delta.rewriteStuntId) && <p>{d.stuntText}</p>}
          </>
        ) : (
          <p>{t("invalid")}</p>
        )}
      </aside>
      <Button
        disabled={!editable || !preview.ok}
        onClick={() => {
          // Re-plan on the card the runtime hands over (its working copy, not necessarily this
          // render's object); a draft that no longer fits it changes nothing.
          if (editable && preview.ok)
            update((card) => {
              const next = previewMilestone(card, d, catalog, secretAccess, editable, ctx);
              return next.ok ? next.card : card;
            });
          close();
        }}
      >
        {t("apply")}
      </Button>
      <Button variant="outline" onClick={close}>
        {t("cancel")}
      </Button>
    </div>
  );
}
