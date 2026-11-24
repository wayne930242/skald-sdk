"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { ICON_BUTTON } from "./card-styles";

export interface InlineTextProps {
  value: string;
  /** The field's name in the edit button's label (編輯{field}). */
  field: string;
  editable: boolean;
  onCommit: (value: string) => void;
  /** How the value reads when not editing. */
  children: ReactNode;
  multiline?: boolean;
  /** On an empty value: a labelled “+ write” button instead of the pencil. */
  emptyAction?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Play is editable: text reads as text, and the text block itself is the edit control (a small
 * pencil in its corner shows it), so the pencil takes no column beside narrow text. The button
 * lies over the text, which stays in the page as ordinary text for assistive tech. Enter (or
 * Cmd/Ctrl+Enter in a long text) and leaving the input save; Escape cancels. Either way the focus
 * goes back to the control, so a keyboard user keeps their place. The input stays where the text
 * was (no dialog), at 16 px so a phone does not zoom in.
 */
export function InlineText({ value, field, editable, onCommit, children, multiline, emptyAction, className, inputClassName }: InlineTextProps) {
  const t = useTranslations("fatePlay");
  const [draft, setDraft] = useState<string | null>(null);
  const closing = useRef(false);
  const restore = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const editing = draft !== null && editable;

  useEffect(() => {
    if (!editing && restore.current) {
      restore.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  const close = (save: boolean) => {
    if (closing.current || draft === null) return;
    closing.current = true;
    restore.current = true;
    if (save && draft !== value) onCommit(draft);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(false);
    } else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      close(true);
    }
  };

  if (editing) {
    const shared = {
      autoFocus: true,
      value: draft,
      "aria-label": t("edit", { field }),
      onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
      onKeyDown,
      onBlur: () => close(true),
      className: cn(
        "w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring",
        inputClassName,
      ),
    };
    return multiline ? <textarea rows={4} {...shared} /> : <input type="text" enterKeyHint="done" {...shared} />;
  }

  const open = () => {
    closing.current = false;
    setDraft(value);
  };
  const empty = !value.trim();
  if (editable && empty && emptyAction) {
    return (
      <div className={cn("flex min-w-0 flex-col items-start gap-1", className)}>
        <div className="min-w-0 self-stretch">{children}</div>
        <button ref={trigger} type="button" onClick={open} className={cn(ICON_BUTTON, "gap-1 px-2 text-accent")}>
          <Plus className="size-4" aria-hidden />
          <span>{emptyAction}</span>
        </button>
      </div>
    );
  }
  return (
    <div className={cn("relative min-w-0", editable && "min-h-11 @3xl:min-h-8", className)}>
      <div className={cn("min-w-0", editable && "pr-5")}>{children}</div>
      {editable && (
        <button
          ref={trigger}
          type="button"
          onClick={open}
          aria-label={t("edit", { field })}
          className="group absolute inset-0 min-h-11 w-full rounded-md hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @3xl:min-h-8"
        >
          <Pencil className="absolute bottom-0.5 right-0.5 size-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden />
        </button>
      )}
    </div>
  );
}
