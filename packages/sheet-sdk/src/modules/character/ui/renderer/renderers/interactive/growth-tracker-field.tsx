"use client";

import * as React from "react";
import type { GrowthQuestionField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Badge } from "@skald/sheet-sdk/components/ui/badge";

export function GrowthTrackerFieldRenderer({
  field,
}: FieldRendererProps<GrowthQuestionField>) {
  const { resolveI18n } = useSchemaI18n();
  const { editable } = useSchema();
  const setValue = useFieldSetter();

  // Get the source field value (e.g., selected playbook)
  const sourceField = field.sourceField || "playbook";
  const sourceValue = useFieldValue<string>(sourceField);

  // Growth question answers (checkboxes for current session)
  const answersPath = "growth.sessionAnswers";
  const answers = useFieldValue<boolean[]>(answersPath) ?? [
    false,
    false,
    false,
    false,
  ];

  // Get playbook-specific question
  const keyPattern = field.i18nKeyPattern || "playbook.{value}.growthQuestion";
  const playbookQuestion = sourceValue
    ? resolveI18n(`{{i18n:${keyPattern.replace("{value}", sourceValue)}}}`)
    : resolveI18n("{{i18n:growth.selectPlaybookFirst}}");

  // Fixed questions
  const questions = [
    resolveI18n("{{i18n:growth.question1}}"),
    resolveI18n("{{i18n:growth.question2}}"),
    resolveI18n("{{i18n:growth.question3}}"),
    playbookQuestion,
  ];

  const handleToggle = (index: number) => {
    if (!editable) return;
    const newAnswers = [...answers];
    newAnswers[index] = !newAnswers[index];
    setValue(answersPath, newAnswers);
  };

  const yesCount = answers.filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">
          {resolveI18n("{{i18n:growth.endOfSession}}")}
        </div>
        {yesCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            +{yesCount} {resolveI18n("{{i18n:growth.marks}}")}
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        {questions.map((question, index) => (
          <div
            key={index}
            className={cn(
              "flex items-start gap-2 text-xs p-1.5 rounded",
              editable && "hover:bg-muted/50 cursor-pointer",
              answers[index] && "bg-primary/5",
            )}
            onClick={() => handleToggle(index)}
          >
            <Checkbox
              checked={answers[index] || false}
              onCheckedChange={() => handleToggle(index)}
              disabled={!editable}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <span
              className={cn(
                "flex-1 leading-tight",
                index === 3 && !sourceValue && "text-muted-foreground",
              )}
            >
              {question}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

registerFieldRenderer("growth-question", GrowthTrackerFieldRenderer);
