"use client";

import { useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@skald/sheet-sdk/components/ui/dialog";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts, type PortraitUploadPort } from "@skald/sheet-sdk/modules/systems/ui/core-ports";

const noSubscription = () => () => {};
const signedOut = () => false;

/** Whether the host's portrait upload can store a file now: it has one and someone is signed in. */
export function usePortraitUpload(): PortraitUploadPort | null {
  const port = useHostPort(corePorts.portraitUpload);
  const signedIn = useSyncExternalStore(port?.subscribe ?? noSubscription, port?.isSignedIn ?? signedOut, signedOut);
  return signedIn ? port : null;
}

export interface PortraitActionsInput {
  /** The portrait URL, or null when the character has none. */
  src: string | null;
  /** The character's name for the dialog and the trigger's label; empty when unnamed. */
  name: string;
  /** The character id the upload is stored under; null when there is nothing to store it on. */
  characterId: string | null;
  /** Whether the viewer may change the character (owner or editor, not a read-only link). */
  editable: boolean;
  /** Writes the new portrait URL ("" removes it). Absent when the viewer cannot write. */
  onChange: ((url: string) => void) | null;
}

export interface PortraitActions {
  /** Whether tapping the portrait does anything: view it, or upload a first one. */
  interactive: boolean;
  /** Whether this viewer can upload, replace or remove. */
  canUpload: boolean;
  uploading: boolean;
  /** The tap: views a portrait large (with replace/remove for editors), or picks a first one. */
  activate: () => void;
  /** Opens the file picker directly (an empty state's upload button). */
  pick: () => void;
  /** Accessible name of the tap target. */
  label: string;
  /** The hidden file input and the dialog; render once next to the trigger. */
  elements: ReactNode;
}

/**
 * Viewing and changing a character's portrait from outside its form: the sheet header avatar and
 * a play view. Anyone can view the portrait large; an editor who is signed in can also upload,
 * replace or remove it, through the host's portrait upload (the image field's too). Read-only
 * viewers, and every viewer of a host without uploads, only view it.
 */
export function usePortraitActions({ src, name, characterId, editable, onChange }: PortraitActionsInput): PortraitActions {
  const t = useTranslations("characters.chrome");
  const uploader = usePortraitUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const canUpload = editable && !!onChange && !!characterId && !!uploader;
  const shownName = name || t("portraitUnnamed");

  const pick = () => {
    if (canUpload && !uploading) inputRef.current?.click();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !characterId || !onChange || !uploader) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("portraitNotImage"));
      return;
    }
    setUploading(true);
    try {
      onChange(await uploader.upload(characterId, file));
    } catch (error) {
      console.error("Failed to upload portrait:", error);
      toast.error(t("portraitUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const activate = () => {
    if (src) setOpen(true);
    else pick();
  };

  const elements = (
    <>
      {canUpload && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          data-portrait-input
          onChange={(event) => void handleFile(event)}
        />
      )}
      <Dialog open={open && !!src} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(92vw,36rem)] gap-3 p-4 sm:p-5" data-portrait-dialog>
          <DialogHeader>
            <DialogTitle>{shownName}</DialogTitle>
            <DialogDescription className="sr-only">{t("portraitDialogTitle")}</DialogDescription>
          </DialogHeader>
          {src && (
            <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg bg-muted">
              <Image src={src} alt={t("portraitAlt")} fill unoptimized sizes="36rem" className="object-contain" />
            </div>
          )}
          {canUpload && (
            <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={uploading}
                onClick={() => {
                  onChange?.("");
                  setOpen(false);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {t("portraitRemove")}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={uploading} onClick={pick}>
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
                {uploading ? t("portraitUploading") : t("portraitReplace")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    interactive: !!src || canUpload,
    canUpload,
    uploading,
    activate,
    pick,
    label: src ? t("portraitView", { name: shownName }) : t("portraitUpload"),
    elements,
  };
}
