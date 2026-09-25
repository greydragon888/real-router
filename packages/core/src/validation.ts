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
// a pure batch validator with no equivalent on the runtime matcher; `RouteTree`
// is the node type of the tree the plugin's validators walk through
// `PluginApi.getTree()`, and `Matcher` is re-exported beside it. Kept on this
// plugin-facing subpath, off the main public index.
// The channel predicate, re-exported for the same reason as the route-tree
// surface above: the plugin reports the retired single-bag spelling (#2238) and a
// second copy of the rule would drift from this one. Its three carve-outs are the
// drift surface — `undefined` is the removal marker, a name owning a path slot is
// absent from `queryNames` by construction (#843 / #1549), and an accessor that
// throws is left to the consumer that needed the value.
export { findMisChanneledKey } from "./channels";

export { validateRoute } from "./engine";

// The params a path declares. Core builds a registered route's `paramMeta` with
// it, from the path with a leading `~` removed, and `getUrlParams` answers from
// those; the plugin reads a route of its batch with it, so a forward's two ends
// are read alike wherever each end is (#2569).
export { buildParamMeta } from "./engine";

export type { Matcher, RouteTree } from "./engine";
