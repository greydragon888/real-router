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
 * patchable via `update`; the remaining seven are the structural/guard config
 * and are exactly the members of `RouteConfigUpdate`.
 *
 * ⚑ **This list mirrors a TYPE, and the mirror is now enforced (#1738):** it must
 * equal the members `Route` DECLARES in `types/router.ts` — lexically, so a
 * plugin's augmentation stays a custom field — and
 * `tests/functional/route-key-authority-1738.test.ts` fails in BOTH directions,
 * a declared field missing here and a phantom key here that no field declares.
 * Being a hand-written list is why it needs that: `defaultSearch` was added to
 * `Route` by RFC-4 M2 (#1548) and never reached this set, so across 33 core releases (0.82.0, where the field shipped, to 0.92.1)
 * a core config field was stored in the plugin bag AND — because
 * `prepareCustomFields` reads the value of every key this set does not know, one
 * read after `commitRouteUpdate`'s own destructuring — a `defaultSearch` getter
 * was invoked twice on `update`, landing two different values in the two homes.
 *
 * ⚠ Membership here decides CLASSIFICATION only, not carriage: each structural
 * field is still written by its own explicit branch (`registerSingleRouteHandlers`
 * for registration, `commitScalarConfig` for `update`). Those branches are not
 * duplicates of this set and do not become redundant by a key being added here.
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
  "defaultSearch",
]);
