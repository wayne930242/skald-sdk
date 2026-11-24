// modules/character/ui/renderer/renderers/display/image-field.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import type { ImageField } from "@skald/types/schema";
import {
  useSchema,
  useFieldValue,
  useFieldSetter,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";

export function ImageFieldRenderer({ field }: FieldRendererProps<ImageField>) {
  const value = useFieldValue<string>(field.id);
  const setValue = useFieldSetter();
  const { editable, viewMode } = useSchema();
  const { t } = useSchemaI18n();
  const characterId = useRollOptional()?.characterId;
  const uploader = useHostPort(corePorts.portraitUpload);
  const offersUpload = editable && field.allowUpload !== false;
  // A host without uploads (the local previewer) shows the field as not uploadable
  const uploadable = offersUpload && !!uploader;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isMobileViewport, setIsMobileViewport] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    // Keep breakpoint aligned with layout renderer (sm = 640px):
    // portrait mobile behavior should only apply below 640px.
    const query = window.matchMedia("(max-width: 639px)");
    const updateViewport = (event?: MediaQueryListEvent) => {
      setIsMobileViewport(event ? event.matches : query.matches);
    };

    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert(t("sheetUi.selectImageFile"));
      return;
    }

    if (!characterId || !uploader) {
      alert(t("sheetUi.imageProcessingFailed"));
      return;
    }

    setIsProcessing(true);
    try {
      const publicUrl = await uploader.upload(characterId, file);
      setValue(field.id, publicUrl);
    } catch (error) {
      console.error("Failed to upload image:", error);
      alert(t("sheetUi.imageProcessingFailed"));
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClick = () => {
    if (uploadable && !isProcessing) {
      fileInputRef.current?.click();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue(field.id, "");
  };

  const isPortraitMobileWeb =
    field.id === "portrait" && viewMode === "web" && isMobileViewport;
  const resolvedAspectRatio = field.aspectRatio?.replace(":", " / ");

  return (
    <div
      className={cn(
        "relative border-2 border-foreground print:border-black flex items-center justify-center text-3xs text-muted-foreground bg-background overflow-hidden",
        isPortraitMobileWeb && "w-full max-w-[20rem] mx-auto",
        uploadable &&
          !isProcessing &&
          "cursor-pointer hover:border-primary group",
        offersUpload && !uploader && "cursor-not-allowed",
        isProcessing && "opacity-50 cursor-wait",
      )}
      style={{
        width: isPortraitMobileWeb ? "100%" : field.layout?.width || "80px",
        maxWidth: isPortraitMobileWeb ? "20rem" : undefined,
        height: isPortraitMobileWeb ? "auto" : field.layout?.height || "100px",
        marginInline: isPortraitMobileWeb ? "auto" : undefined,
        aspectRatio: resolvedAspectRatio,
      }}
      onClick={handleClick}
      aria-disabled={offersUpload && !uploader ? true : undefined}
      title={offersUpload && !uploader ? t("sheetUi.uploadUnavailable") : undefined}
      data-upload-unavailable={offersUpload && !uploader ? "" : undefined}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={isProcessing}
      />

      {isProcessing ? (
        <div className="flex flex-col items-center gap-0.5">
          <svg
            className="w-4 h-4 animate-spin text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{t("sheetUi.processing")}</span>
        </div>
      ) : value ? (
        <>
          <Image
            src={value}
            alt=""
            fill
            unoptimized
            style={{ objectFit: "cover" }}
          />
          {editable && (
            <button
              onClick={handleRemove}
              className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-2xs opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
              title={t("sheetUi.removeImage")}
            >
              ×
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          {uploadable && (
            <svg
              className="w-4 h-4 text-muted-foreground/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          <span>{field.placeholder || t("sheetUi.photo")}</span>
        </div>
      )}
    </div>
  );
}

// Self-register
registerFieldRenderer("image", ImageFieldRenderer);
