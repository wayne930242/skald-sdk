import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loadEnglishCorpus } from "../../reference/load-corpus";
import type { HomebrewItemRecord } from "../domain/types";
import type { HomebrewRefInfo } from "../domain/wizard-items";

async function builtinRefs() {
  const parts = await Promise.all(
    ["feat", "baseItem", "item"].map(loadEnglishCorpus),
  );
  return parts.flatMap((part) =>
    Object.values(part ?? {}).map((e) => ({
      ref: e.ref,
      name: e.name,
      meta: e.meta ?? {},
      builtin: true,
    })),
  );
}
export async function backgroundRefs(rows: HomebrewItemRecord[]) {
  const refs = new Map<string, HomebrewRefInfo>();
  for (const e of await builtinRefs()) refs.set(e.ref, e);
  for (const r of rows) {
    const e = r.payload.entry;
    if (e) {
      const ref = `${e.kind}:${e.id}`;
      if (!refs.has(ref))
        refs.set(ref, {
          ref,
          name: e.name,
          meta: e.meta ?? {},
          builtin: false,
        });
    }
  }
  return refs;
}
export function BackgroundChoices({ rows }: { rows: HomebrewItemRecord[] }) {
  const t = useTranslations("homebrew");
  const locale = useLocale();
  const [options, setOptions] = useState<
    { ref: string; label: string; list: string }[] | null
  >([]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      backgroundRefs(rows),
      locale === "zh-TW"
        ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json").then(
            (m) => m.default.ref as Record<string, Record<string, string>>,
          )
        : Promise.resolve({} as Record<string, Record<string, string>>),
    ]).then(
      ([refs, names]) => {
        const choices = [...refs.values()].flatMap((e) => {
          const [kind, id] = e.ref.split(":");
          const label = names[kind]?.[id] ?? e.name;
          if (kind === "feat")
            return e.meta.category === "origin"
              ? [{ ref: e.ref, label, list: "originFeat" }]
              : [];
          if (kind !== "item" && kind !== "baseItem") return [];
          const choice = { ref: e.ref, label, list: "ref" };
          return ["AT", "T", "GS", "INS"].includes(String(e.meta.type))
            ? [choice, { ...choice, list: "toolGrants" }]
            : [choice];
        });
        if (alive) setOptions(choices);
      },
      () => {
        if (alive) setOptions(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [rows, locale]);
  if (!options) return <p role="alert">{t("error.network")}</p>;
  return (
    <>
      {["originFeat", "ref", "toolGrants"].map((list) => (
        <datalist key={list} id={`hb-${list}`}>
          {options
            .filter((o) => o.list === list)
            .map((o) => (
              <option key={o.ref} value={o.ref}>
                {o.label}
              </option>
            ))}
        </datalist>
      ))}
    </>
  );
}
