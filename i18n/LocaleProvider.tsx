"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Dict, type TFunction } from "./t";

const DictContext = createContext<Dict | null>(null);

/**
 * Rendered once by the root layout with the current language's dictionary
 * — only that one, so the other language's strings never ship to the
 * browser. The locale itself comes from the URL (./useLocale).
 */
export function LocaleProvider({ dict, children }: { dict: Dict; children: ReactNode }) {
  return <DictContext.Provider value={dict}>{children}</DictContext.Provider>;
}

/** `t` for client components. Call it in the component body, like any hook. */
export function useT(): TFunction {
  const dict = useContext(DictContext);
  if (!dict) throw new Error("useT() used outside <LocaleProvider>");
  return useMemo(() => makeT(dict), [dict]);
}
