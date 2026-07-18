// packages/core/src/index.ts

// Public types — folded from the former @real-router/types package into
// core/src/types, re-exported from the root. The Router / RouterError
// CLASS exports below shadow the same-named type-only star entries (an explicit
// named export wins over `export *`), so `Router` / `RouterError` at the root
// resolve to the classes.
export type * from "./types";

export type { RouterValidator } from "./types/RouterValidator";

// Router class (replaces the Router interface from types)
export { Router } from "./Router";

export type { ErrorCodes, Constants } from "./constants";

export { events, constants, errorCodes, UNKNOWN_ROUTE } from "./constants";

// RouterError class (migrated from router-error package)
export { RouterError } from "./RouterError";

export { createRouter } from "./createRouter";

export { getNavigator } from "./getNavigator";

export { resolveForwardChain } from "./namespaces/RoutesNamespace/forwardChain";

export type { RouteTree } from "./engine";
