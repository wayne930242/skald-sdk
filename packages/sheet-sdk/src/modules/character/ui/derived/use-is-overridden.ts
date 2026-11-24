"use client";

import { useContext } from "react";
import { SchemaStaticContext } from "../renderer/schema-context";

/**
 * Whether the player overrode this value; reads the stored overrides only, no evaluation. Its own
 * module so a play view's marks don't pull the formula snapshot code (B-024 budget).
 */
export function useIsOverridden(fieldId: string): boolean {
  const runtime = useContext(SchemaStaticContext)?.formulaRuntime;
  return !!runtime && Object.hasOwn(runtime.derivedOverrides, fieldId);
}
