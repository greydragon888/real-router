// packages/core/src/pipeline/index.ts

/**
 * The navigation delivery pipeline: three primitives over one opaque type.
 *
 * `canonicalize` (the sole producer of `Canonical`) → `buildURL` (⑤a) /
 * `materialize` (⑤b). The brand symbol is NOT exported, so nothing can reach
 * these two primitives around `canonicalize`.
 *
 * Since Phase 4 that is a guarantee about the ROUTER, not only about this
 * module: every producer of a URL or a State reaches it — `navigate`,
 * `matchPath`, `canNavigateTo` and `buildNavigationState` in the resolving
 * form, `buildPath`, `isActiveRoute`'s literal arm and `makeState` in the
 * literal one. `makeState` is not a second terminal beside the pipeline any
 * more; it IS `canonicalize`'s literal form. The one deliberate exception is
 * `navigateToNotFound`, which wraps a URL string rather than building a state
 * from an intent, so it has no channels to canonicalise (INVARIANTS
 * navigateToNotFound #2).
 *
 * Core-internal: the module is not part of any published subpath (`exports` is
 * `.` / `./types` / `./api` / `./validation`). Its consumers are the router's
 * own facade, namespaces and wiring.
 */
export { canonicalize } from "./canonicalize";

export { buildURL } from "./buildURL";

export { materialize } from "./materialize";

export type { Canonical } from "./types";

export type { RouteResolver } from "./port";
