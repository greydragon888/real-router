import { getContext } from "svelte";

export const ROUTER_KEY = "real-router:router";

export const NAVIGATOR_KEY = "real-router:navigator";

export const ROUTE_KEY = "real-router:route";

// The type parameter is used by the caller to narrow the return type.
// ESLint's no-unnecessary-type-parameters sees only a single textual use of T
// (the return type) — but each call site supplies a different T, so it is not
// unnecessary. Inline generic helpers are a standard pattern for typed context.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function getContextOrThrow<T>(key: string, consumerName: string): T {
  const value = getContext<T | undefined>(key);

  if (!value) {
    throw new Error(`${consumerName} must be used within a RouterProvider`);
  }

  return value;
}
