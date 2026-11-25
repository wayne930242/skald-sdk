// modules/character/ui/renderer/renderers/interactive/character-reference-field.tsx
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  TABLE_CHARACTERS_OPTION_SOURCE,
  type CharacterReferenceField,
  type TableCharacterOption,
  type TableCharacterReference,
  type TableCharacterSource,
  type TableCharacterStatus,
} from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@skald/sheet-sdk/components/ui/select";
import { Plus, User, X } from "lucide-react";

/**
 * Character Reference Field Renderer
 *
 * Renders a field for referencing other characters (PC or NPC).
 * Without a scope it is a text input for a name.
 *
 * Used for relationships between characters, such as a mentor or someone a
 * character protects.
 *
 * With `scope: "table"` (ADR 0014, an organization's investigator members) the value is a list of
 * soft references `{ id, characterId, name }` to the table's characters, which the host supplies
 * under `tableCharacters` in the option sources. Outside a table (the Template Editor's test data)
 * the list takes typed names instead.
 */
export function CharacterReferenceFieldRenderer({
  field,
}: FieldRendererProps<CharacterReferenceField>) {
  if (field.scope === "table") return <TableCharacterReferenceList field={field} />;
  return <CharacterNameInput field={field} />;
}

function CharacterNameInput({ field }: { field: CharacterReferenceField }) {
  const value = useFieldValue<string>(field.id) ?? "";
  const setValue = useFieldSetter();
  const { editable } = useSchema();
  const t = useTranslations("characterReferenceField");

  return (
    <div className="space-y-1.5">
      {field.label && (
        <Label htmlFor={field.id} className="flex items-center gap-1.5">
          <User className="h-4 w-4" />
          {field.label}
        </Label>
      )}
      <Input
        id={field.id}
        value={value}
        onChange={(e) => setValue(field.id, e.target.value)}
        placeholder={field.placeholder ?? t("namePlaceholder")}
        readOnly={!editable}
        className="max-w-xs"
      />
      {field.characterType && (
        <p className="text-xs text-muted-foreground">
          {field.characterType === "pc" && t("selectPc")}
          {field.characterType === "npc" && t("selectNpc")}
          {field.characterType === "both" && t("selectAny")}
        </p>
      )}
    </div>
  );
}

function isTableCharacterSource(value: unknown): value is TableCharacterSource {
  return !!value && typeof value === "object" && Array.isArray((value as TableCharacterSource).characters);
}

function readReferences(value: unknown): TableCharacterReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is TableCharacterReference =>
    !!entry && typeof entry === "object" && typeof (entry as TableCharacterReference).id === "string");
}

function newEntryId(): string {
  return `member-${crypto.randomUUID()}`;
}

/** How an entry reads: the character's current name and standing, or its snapshot when it is gone. */
export function resolveTableCharacterReference(
  entry: TableCharacterReference,
  characters: readonly TableCharacterOption[] | undefined,
): { name: string; status: TableCharacterStatus | "gone" | "typed" } {
  if (!characters) return { name: entry.name, status: "typed" };
  const match = entry.characterId ? characters.find((c) => c.characterId === entry.characterId) : undefined;
  if (!match) return { name: entry.name, status: entry.characterId ? "gone" : "typed" };
  return { name: match.name || entry.name, status: match.status };
}

function TableCharacterReferenceList({ field }: { field: CharacterReferenceField }) {
  const entries = readReferences(useFieldValue<unknown>(field.id));
  const setValue = useFieldSetter();
  const { editable, optionSources } = useSchema();
  const t = useTranslations("characterReferenceField");
  const source = optionSources?.[TABLE_CHARACTERS_OPTION_SOURCE];
  const table = isTableCharacterSource(source) ? source : undefined;
  const [typedName, setTypedName] = React.useState("");

  const write = (next: TableCharacterReference[]) => setValue(field.id, next);
  const remove = (id: string) => write(entries.filter((entry) => entry.id !== id));
  const referenced = new Set(entries.map((entry) => entry.characterId).filter(Boolean));
  // An archived copy keeps its standing on a sheet that lists it, but is not offered for adding.
  const candidates = table?.characters.filter((c) => c.status !== "archived" && !referenced.has(c.characterId)) ?? [];

  const addCharacter = (characterId: string) => {
    const character = table?.characters.find((c) => c.characterId === characterId);
    if (!character) return;
    write([...entries, { id: newEntryId(), characterId, name: character.name }]);
  };
  const addTypedName = () => {
    const name = typedName.trim();
    if (!name) return;
    write([...entries, { id: newEntryId(), characterId: "", name }]);
    setTypedName("");
  };

  return (
    <div className="space-y-1.5" data-field-id={field.id}>
      {field.label && (
        <Label className="flex items-center gap-1.5">
          <User className="h-4 w-4" />
          {field.label}
        </Label>
      )}
      {entries.length === 0 && !editable && (
        <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
      )}
      {entries.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={field.label}>
          {entries.map((entry) => {
            const resolved = resolveTableCharacterReference(entry, table?.characters);
            const canOpen = !!table?.openCharacter && resolved.status !== "gone" && resolved.status !== "typed";
            return (
              <li key={entry.id} className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-sm">
                {canOpen ? (
                  <button
                    type="button"
                    className="min-h-8 font-medium underline-offset-2 hover:underline"
                    onClick={() => table?.openCharacter?.(entry.characterId)}
                    title={t("openSheet")}
                  >
                    {resolved.name}
                  </button>
                ) : (
                  <span className="font-medium">{resolved.name}</span>
                )}
                {resolved.status === "notPlaying" && <Badge variant="outline">{t("status.notPlaying")}</Badge>}
                {resolved.status === "archived" && <Badge variant="outline">{t("status.archived")}</Badge>}
                {resolved.status === "gone" && <Badge variant="outline">{t("status.gone")}</Badge>}
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t("remove", { name: resolved.name })}
                    onClick={() => remove(entry.id)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && table && (
        candidates.length > 0 ? (
          <Select value="" onValueChange={addCharacter}>
            <SelectTrigger className="max-w-xs" aria-label={t("addMember")}>
              <SelectValue placeholder={t("addMember")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((character) => (
                <SelectItem key={character.characterId} value={character.characterId}>
                  {character.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">{t("noCandidates")}</p>
        )
      )}
      {editable && !table && (
        <div className="flex max-w-xs gap-2">
          <Input
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                addTypedName();
              }
            }}
            placeholder={field.placeholder ?? t("namePlaceholder")}
            aria-label={t("addByName")}
          />
          <Button type="button" variant="outline" size="icon" onClick={addTypedName} aria-label={t("addByName")}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Self-register
registerFieldRenderer("character-reference", CharacterReferenceFieldRenderer);
