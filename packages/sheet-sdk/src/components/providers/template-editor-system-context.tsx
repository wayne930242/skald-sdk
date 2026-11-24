"use client";

import { createContext, useContext } from "react";

const TemplateEditorSystemContext = createContext<string | undefined>(
  undefined,
);

export function TemplateEditorSystemProvider({
  systemSlug,
  children,
}: {
  systemSlug: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <TemplateEditorSystemContext.Provider value={systemSlug}>
      {children}
    </TemplateEditorSystemContext.Provider>
  );
}

/** The slug of the system whose template is being edited, or undefined outside an editor session. */
export function useTemplateEditorSystemSlug(): string | undefined {
  return useContext(TemplateEditorSystemContext);
}
