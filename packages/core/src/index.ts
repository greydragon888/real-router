// packages/core/src/index.ts

// Public types — folded from the former @real-router/types package into
// core/src/types, re-exported from the root. The Router / RouterError
// CLASS exports below shadow the same-named type-only star entries (an explicit
// named export wins over `export *`), so `Router` / `RouterError` at the root
// resolve to the classes.
// eslint-disable-next-line import-x/export -- the star deliberately overlaps the two class exports below (Router / RouterError) — the documented shadow, flagged from both sides by the revived export-map analysis (#1525)
export type * from "./types";

export type { RouterValidator } from "./types/RouterValidator";

// Router class (replaces the Router interface from types)
// eslint-disable-next-line import-x/export -- deliberate shadow (see header): the explicit CLASS export wins over the same-named interface from `export type *` — TS resolves the precedence, the rule cannot model it (#1525 revived the export-map analysis that now sees both names)
export { Router } from "./Router";

export type { ErrorCodes, Constants } from "./constants";

export { events, constants, errorCodes, UNKNOWN_ROUTE } from "./constants";

// RouterError class (migrated from router-error package)
// eslint-disable-next-line import-x/export -- deliberate shadow, same as Router above
export { RouterError } from "./RouterError";

export { createRouter } from "./createRouter";

export { getNavigator } from "./getNavigator";

export { resolveForwardChain } from "./namespaces/RoutesNamespace/forwardChain";

export type { RouteTree } from "./engine";
