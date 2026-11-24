"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { characterFrom, parseCharacterJson, type CharacterData, type CharacterSource } from "./characters";

export type { CharacterSource } from "./characters";

/** Picks the character on the sheet: blank or the sample, a JSON file in, the current one out. */
export function CharacterBar({
  slug,
  source,
  defaultData,
  onReplace,
  currentData,
}: {
  slug: string;
  source: CharacterSource;
  defaultData: CharacterData;
  onReplace: (source: CharacterSource, data: CharacterData) => void;
  currentData: () => CharacterData;
}) {
  const t = useTranslations("previewer");
  const selectId = useId();
  const [choice, setChoice] = useState<Exclude<CharacterSource, "saved">>(source === "blank" ? "blank" : "sample");
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    const data = parseCharacterJson(await file.text());
    if (!data) {
      toast.error(t("importFailed"));
      return;
    }
    onReplace("saved", { ...defaultData, ...data });
  };

  const exportFile = () => {
    const blob = new Blob([`${JSON.stringify(currentData(), null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-character.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 text-sm" data-character-bar>
      <div className="flex flex-col gap-1">
        <Label htmlFor={selectId}>{t("character")}</Label>
        <select
          id={selectId}
          className="h-9 rounded-md border bg-background px-2"
          value={choice}
          onChange={(event) => setChoice(event.target.value as typeof choice)}
        >
          <option value="sample">{t("characters.sample")}</option>
          <option value="blank">{t("characters.blank")}</option>
        </select>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onReplace(choice, characterFrom(choice, slug, defaultData))}>
        {source === "saved" ? t("reset") : t("load")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        {t("importJson")}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={exportFile}>
        {t("exportJson")}
      </Button>
      {source === "saved" && <span className="text-muted-foreground">{t("characters.saved")}</span>}
    </div>
  );
}
