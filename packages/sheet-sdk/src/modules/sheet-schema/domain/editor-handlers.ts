import type { SelectOption } from "@skald/types/schema";

// ============================================================================
// Types
// ============================================================================

/**
 * What a handler gets besides `data`. A field action inside a list row runs with the row as
 * `data`; `character` is then the whole character. Other calls pass no context.
 */
export interface EditorHandlerContext {
  character: Record<string, unknown>;
}

export type EditorHandler = (
  data: Record<string, unknown>,
  setData: (
    updater:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void,
  context?: EditorHandlerContext,
) => void | Promise<void>;

export interface EditorHandlers {
  [key: string]: EditorHandler;
}

export interface OptionSource {
  [key: string]: SelectOption[] | unknown[] | Record<string, unknown>;
}
