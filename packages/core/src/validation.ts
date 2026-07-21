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
export { validateRoute } from "./engine";

export type { Matcher, RouteTree } from "./engine";
