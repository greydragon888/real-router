/**
 * Subpath export for @real-router/validation-plugin.
 *
 * Provides access to router internals so the plugin can install
 * ctx.validator and run retrospective validation at registration time.
 */

export type { RouterValidator } from "./types/RouterValidator";

export { getInternals } from "./internals";

export type { RouterInternals } from "./internals";

// Route-tree surface the validation plugin needs, re-exported so the plugin
// depends only on @real-router/core (not the utils `route-tree` package) —
// core stays the sole consumer of the routing engine (#1301). `validateRoute` is
// a pure batch validator with no equivalent on the runtime matcher; `Matcher` /
// `RouteTree` are the node/matcher types the plugin's validators operate on
// (segment lookup + existence come from the matcher itself: getSegmentsByName /
// hasRoute). Kept on this plugin-facing subpath, off the main public index.
// The channel predicate, re-exported for the same reason as the route-tree
// surface above: the plugin reports the retired single-bag spelling (#2238) and a
// second copy of the rule would drift from this one. Its three carve-outs are the
// drift surface — `undefined` is the removal marker, a name owning a path slot is
// absent from `queryNames` by construction (#843 / #1549), and an accessor that
// throws is left to the consumer that needed the value.
export { findMisChanneledKey } from "./channels";

export { validateRoute } from "./engine";

export type { Matcher, RouteTree } from "./engine";
