// packages/core/src/channels/defaults.ts

import { assertChannelCorrect } from "./guard";

import type { Params, SearchParams } from "../types";

/**
 * Withholds a query default whose key the caller already filled with the RETIRED
 * single-bag spelling — the rule #1570 states for a `forwardTo` chain's
 * defaults, applied where no seam runs to enforce it.
 *
 * Nothing is moved between channels: the caller's key stays in the bag the
 * caller chose, only the default is declined. Without this the default and the
 * caller's params-twin sit in DIFFERENT channels, where no merge ranks them, and
 * the query default wins by default — the §1.1 priority inversion the channel
 * split exists to remove.
 *
 * ⚠ Scoped to `declaredQuery` — the route's `?`-declared names — and the scope
 * is what keeps `buildPath` in step with every other producer. Only a DECLARED
 * query name can have a params-bag "twin" at all: that spelling is the v1
 * single-bag form the migrated entry points retired, so withholding is the whole
 * point. A key the route declares NOWHERE (`/u` + `defaultSearch { theme }`) or
 * one that owns a PATH SLOT beside its query twin (`/items/:id?id`, the
 * #843/#1549 carve-out) is not a twin — the caller's params entry and the query
 * default describe different things, and withholding there printed an href the
 * route's own `matchPath` immediately rewrote (the #1552/#1578 class: href ≠
 * destination, with `buildPath` the only producer out of agreement).
 *
 * `undefined` is absence (#1550 / #1551), so a caller's removal marker does not
 * count as "already filled" and the default survives it.
 *
 * Returns the input untouched (no allocation) when nothing is withheld — the
 * common path, and the only one the zero-default hot path ever takes.
 */
export function withholdFilledSlots(
  defaults: SearchParams | undefined,
  params: Params,
  declaredQuery: readonly string[],
): SearchParams | undefined {
  if (defaults === undefined || declaredQuery.length === 0) {
    return defaults;
  }

  let kept: Record<string, unknown> | undefined;
  let dropped = false;

  for (const [key, value] of Object.entries(defaults)) {
    // `Object.hasOwn` before the read, exactly as {@link findMisChanneledKey}
    // does two functions up and for the same reason: a bare `params[key]` walks
    // the PROTOTYPE, so a route declaring `?toString` / `?constructor` /
    // `?valueOf` read as "the caller already filled this slot" on an EMPTY bag.
    // The default was then withheld from every LITERAL-form producer while the
    // resolving form still applied it — `buildPath` out of agreement with
    // `navigate`, printing an href its own `matchPath` does not reproduce, which
    // is the #1552/#1578 class this very rule exists to close. (`makeState`
    // joined the literal form in Phase 4, so it withholds too; the shape stayed
    // unreachable there because `PluginApi.makeState`'s P1 guard refuses the
    // triggering bag on the same predicate.)
    if (
      Object.hasOwn(params, key) &&
      params[key] !== undefined &&
      declaredQuery.includes(key)
    ) {
      dropped = true;
      continue;
    }

    kept ??= {};
    kept[key] = value;
  }

  return dropped ? (kept as SearchParams | undefined) : defaults;
}

/**
 * Config-time channel check: a route's `defaultParams` may not name a key the
 * route declares with `?`.
 *
 * The static half of "params and search meet only in the URL". Without it the
 * router builds a state out of its OWN config that its OWN always-on channel
 * guard then rejects — `start()` throwing `WRONG_CHANNEL` about a bag the user
 * never passed, which is the deferred-crash shape core's invariant guards exist
 * to prevent. The dynamic half (a forwarding hop whose target is only known at
 * resolution) is caught at the `forwardState` seam instead.
 *
 * Runs over the WHOLE config after every rebuild rather than over the routes
 * just added: `setRootPath("?lang")` declares a name on every route at once, so
 * a config that was legal a moment ago can stop being legal without any route
 * changing.
 *
 * Takes `queryNamesOf` as DATA rather than reaching for a matcher, so this
 * subsystem imports nothing from the namespaces or the engine — the same
 * inversion `src/pipeline` makes with its `RouteResolver` port. The caller owns
 * the derivation AND its caches, which matters here: every call site runs on
 * PREPARED artifacts before any swap, with caches local to the attempt, because
 * checking against the live store would validate a tree the rejected batch has
 * not installed. `RoutesNamespace/helpers.assertRouteDefaultChannelsFor` is that
 * caller — a five-line adapter, so the four entry points do not each rebuild the
 * closure.
 */
export function assertRouteDefaultChannels(
  defaultParams: Readonly<Record<string, Params>>,
  queryNamesOf: (name: string) => readonly string[],
  method: string,
): void {
  for (const [name, defaults] of Object.entries(defaultParams)) {
    assertChannelCorrect(
      method,
      name,
      defaults,
      queryNamesOf(name),
      "this route's `defaultParams`",
      "Move it to `defaultSearch`",
    );
  }
}
