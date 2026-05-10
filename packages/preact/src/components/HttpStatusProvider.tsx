import { createContext } from "preact";

import type { HttpStatusSink } from "../utils/createHttpStatusSink";
import type { ComponentChildren } from "preact";

export const HttpStatusContext = createContext<HttpStatusSink | null>(null);

export interface HttpStatusProviderProps {
  readonly sink: HttpStatusSink;
  readonly children: ComponentChildren;
}

export function HttpStatusProvider({
  sink,
  children,
}: HttpStatusProviderProps): ComponentChildren {
  return (
    <HttpStatusContext.Provider value={sink}>
      {children}
    </HttpStatusContext.Provider>
  );
}
