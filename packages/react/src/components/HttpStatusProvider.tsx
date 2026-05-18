import { createContext } from "react";

import type { HttpStatusSink } from "../utils/createHttpStatusSink";
import type { ReactNode } from "react";

export const HttpStatusContext = createContext<HttpStatusSink | null>(null);

export interface HttpStatusProviderProps {
  readonly sink: HttpStatusSink;
  readonly children: ReactNode;
}

export function HttpStatusProvider({
  sink,
  children,
}: HttpStatusProviderProps): ReactNode {
  // `<HttpStatusContext.Provider value>` (not the React 19 `<HttpStatusContext value>`
  // shorthand) — same component file is exported via `/legacy/ssr` for React 18
  // consumers, where the shorthand throws "Element type is invalid: expected
  // a string but got: object".
  return (
    <HttpStatusContext.Provider value={sink}>
      {children}
    </HttpStatusContext.Provider>
  );
}
