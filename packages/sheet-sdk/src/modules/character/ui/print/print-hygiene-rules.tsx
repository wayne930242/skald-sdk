"use client";

import type { ReactNode } from "react";
import type { Field, FieldReference, Section } from "@skald/types/schema";
import { evaluateCondition } from "@skald/sheet-sdk/lib/condition-utils";
import {
  PrintHygieneContext,
  usePrintHygiene,
  type PrintFieldGateProps,
  type PrintHygiene,
  type PrintSectionContext,
} from "@skald/sheet-sdk/modules/character/ui/renderer/print-hygiene";
import { useFieldValue } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { isBlankValue } from "./kit/blanks";

/** Text, textarea and select fields without a value, and lists without rows. Numbers never count as empty. */
export function isEmptyInPrint(type: Field["type"], value: unknown): boolean {
  switch (type) {
    case "text":
    case "select":
    case "multi-select":
      return isBlankValue(value);
    case "list":
      return !Array.isArray(value) || value.length === 0;
    default:
      return false;
  }
}

function omitsField(
  omitEmpty: boolean,
  type: Field["type"],
  value: unknown,
  { printHidden, derived, systemDrawn }: { printHidden?: boolean; derived?: boolean; systemDrawn?: boolean },
): boolean {
  if (printHidden) return true;
  return omitEmpty && !derived && !systemDrawn && isEmptyInPrint(type, value);
}

function valueAt(data: Record<string, unknown>, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

type ContentState = "content" | "empty" | "decorative";

interface SectionWalk {
  omitEmpty: boolean;
  context: PrintSectionContext;
  derived: ReadonlySet<string>;
}

function fieldState(field: Field, printHidden: boolean | undefined, walk: SectionWalk): ContentState | null {
  if (field.hidden) return null;
  if (field.type === "heading" || field.type === "divider") return "decorative";
  const omitted = omitsField(walk.omitEmpty, field.type, valueAt(walk.context.data, field.id), {
    printHidden: printHidden ?? field.layout?.printHidden,
    derived: walk.derived.has(field.id),
    systemDrawn: walk.context.systemDraws?.(field.type, field.id) ?? false,
  });
  return omitted ? "empty" : "content";
}

function sectionState(section: Pick<Section, "children">, walk: SectionWalk): ContentState {
  let sawEmpty = false;
  for (const child of section.children) {
    if (child.visibleWhen && !evaluateCondition(child.visibleWhen, walk.context.data)) continue;
    let state: ContentState | null;
    if (child.type === "section") {
      state = sectionState(child as Section, walk);
    } else if (child.type === "field-ref") {
      const reference = child as FieldReference;
      const field = walk.context.schema.fields[reference.fieldId];
      state = field ? fieldState({ ...field, id: reference.fieldId }, reference.layout?.printHidden, walk) : null;
    } else {
      const field = child as Field;
      state = field.type === "heading" || field.type === "divider" || !field.id
        ? "decorative"
        : fieldState(field, undefined, walk);
    }
    if (state === "content") return "content";
    if (state === "empty") sawEmpty = true;
  }
  return sawEmpty ? "empty" : "decorative";
}

function FieldGate({ path, type, printHidden, derived, systemDrawn, children }: PrintFieldGateProps) {
  const value = useFieldValue(path);
  const omitEmpty = usePrintHygiene()?.omitEmpty ?? false;
  return omitsField(omitEmpty, type, value, { printHidden, derived, systemDrawn }) ? null : <>{children}</>;
}

function hygiene(omitEmpty: boolean): PrintHygiene {
  return {
    omitEmpty,
    FieldGate,
    omitsSection(section, context) {
      const derived = new Set(
        (context.formulaRuntime?.artifact.programs ?? [])
          .filter((program) => program.kind === "derived")
          .map((program) => program.targetFieldId),
      );
      // A section of headings and dividers alone stays.
      return sectionState(section, { omitEmpty, context, derived }) === "empty";
    },
  };
}

const COMPACT = hygiene(true);
const BLANKS = hygiene(false);

/**
 * Generic print: omits empty text, textarea and select fields, row-less lists, empty row cells and
 * sections left with nothing, unless the blanks are kept; `printHidden` fields never print.
 */
export function PrintHygieneProvider({ omitEmpty, children }: { omitEmpty: boolean; children: ReactNode }) {
  return <PrintHygieneContext.Provider value={omitEmpty ? COMPACT : BLANKS}>{children}</PrintHygieneContext.Provider>;
}
