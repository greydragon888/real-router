import { createContext } from "solid-js";

import type { HttpStatusSink } from "../utils/createHttpStatusSink";
import type { JSX } from "solid-js";

export const HttpStatusContext = createContext<HttpStatusSink | null>(null);

export interface HttpStatusProviderProps {
  readonly sink: HttpStatusSink;
  readonly children: JSX.Element;
}

export function HttpStatusProvider(
  props: HttpStatusProviderProps,
): JSX.Element {
  return (
    <HttpStatusContext.Provider value={props.sink}>
      {props.children}
    </HttpStatusContext.Provider>
  );
}
