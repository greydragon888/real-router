// packages/core/src/pipeline/index.ts

/**
 * The navigation delivery pipeline: three primitives over one opaque type.
 *
 * `canonicalize` (the sole producer of `Canonical`) → `buildURL` (⑤a) /
 * `materialize` (⑤b). The brand symbol is NOT exported, so nothing can reach
 * these two primitives around `canonicalize` — and since Phase 4 that is a
 * guarantee about the ROUTER, not only about this module: every producer of a
 * URL or a State reaches it, in one of two compositional forms.
 *
 * Core-internal: not part of any published subpath. Its consumers are the
 * router's own facade, namespaces and wiring.
 *
 * The two forms and who takes them, the port's wiring facts, the perf notes and
 * the one deliberate exception (`navigateToNotFound`): ./CLAUDE.md
 *
 * @module pipeline
 */
export { canonicalize } from "./canonicalize";

export { buildURL, buildURLForCommit } from "./buildURL";

export { materialize, materializePending } from "./materialize";

export type { Canonical } from "./types";

export type { RouteResolver } from "./port";
