"use client";

import * as React from "react";

interface BaseImeProps {
  value: string;
  onValueChange: (value: string) => void;
}

type ImeTextInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> &
  BaseImeProps;

type ImeTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> &
  BaseImeProps;

export function ImeTextInput({
  value,
  onValueChange,
  onCompositionStart,
  onCompositionEnd,
  onBlur,
  ...props
}: ImeTextInputProps) {
  const [isComposing, setIsComposing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(value);

  React.useEffect(() => {
    if (isComposing) return;
    setDraftValue(value);
  }, [value, isComposing]);

  return (
    <input
      {...props}
      value={draftValue}
      onChange={(e) => {
        const nextValue = e.target.value;
        setDraftValue(nextValue);
        if (!isComposing) onValueChange(nextValue);
      }}
      onCompositionStart={(e) => {
        setIsComposing(true);
        onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        setIsComposing(false);
        const nextValue = e.currentTarget.value;
        setDraftValue(nextValue);
        onValueChange(nextValue);
        onCompositionEnd?.(e);
      }}
      onBlur={(e) => {
        onValueChange(draftValue);
        onBlur?.(e);
      }}
    />
  );
}

export function ImeTextarea({
  value,
  onValueChange,
  onCompositionStart,
  onCompositionEnd,
  onBlur,
  ...props
}: ImeTextareaProps) {
  const [isComposing, setIsComposing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(value);

  React.useEffect(() => {
    if (isComposing) return;
    setDraftValue(value);
  }, [value, isComposing]);

  return (
    <textarea
      {...props}
      value={draftValue}
      onChange={(e) => {
        const nextValue = e.target.value;
        setDraftValue(nextValue);
        if (!isComposing) onValueChange(nextValue);
      }}
      onCompositionStart={(e) => {
        setIsComposing(true);
        onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        setIsComposing(false);
        const nextValue = e.currentTarget.value;
        setDraftValue(nextValue);
        onValueChange(nextValue);
        onCompositionEnd?.(e);
      }}
      onBlur={(e) => {
        onValueChange(draftValue);
        onBlur?.(e);
      }}
    />
  );
}
