// packages/core/src/pipeline/index.ts

/**
 * The navigation delivery pipeline: three primitives over one opaque type.
 *
 * `canonicalize` (the sole producer of `Canonical`) → `buildURL` (⑤a) /
 * `materialize` (⑤b). The brand symbol is NOT exported, so nothing can reach
 * these two primitives around `canonicalize`. That is a guarantee about the
 * MODULE, not yet about the router: only `navigate` is on the pipeline so far —
 * the other entry points still build their state through `makeState`, and they
 * migrate one per commit.
 *
 * Core-internal: the module is not part of any published subpath. Its consumer
 * is the router's own wiring.
 */
export { canonicalize } from "./canonicalize";

export { buildURL } from "./buildURL";

export { materialize } from "./materialize";

export type { Canonical } from "./types";

export type { RouteResolver } from "./port";

export type { MaterializeOptions } from "./materialize";
