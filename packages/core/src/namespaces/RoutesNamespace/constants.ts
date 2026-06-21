// packages/core/src/namespaces/RoutesNamespace/constants.ts

/**
 * Default route name for the root node.
 */
export const DEFAULT_ROUTE_NAME = "";

/**
 * Keys that belong to a route's structural/config surface — everything NOT in
 * this set is a plugin-defined **custom field** (e.g. lifecycle hooks,
 * `preload`, `searchSchema`), stored in `RoutesStore.routeCustomFields`.
 *
 * Single source of truth for the custom-field split, shared by route
 * registration (`add`/`replace`) and `update` so both classify patch keys
 * identically. `name`/`path`/`children` define route identity and are not
 * patchable via `update`; the remaining six are the structural/guard config.
 */
export const STANDARD_ROUTE_KEYS: ReadonlySet<string> = new Set([
  "name",
  "path",
  "children",
  "canActivate",
  "canDeactivate",
  "forwardTo",
  "encodeParams",
  "decodeParams",
  "defaultParams",
]);
