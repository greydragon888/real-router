// packages/core/src/channels/defaults.ts

import { assertChannelCorrect } from "./guard";
import { putField } from "../utils/ingest";

import type { Params, SearchParams } from "../types";

/**
 * Intrinsics captured at module load: `hasOwn`.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module — the ordinary
 * polyfill order. Measured: a naive `Object.hasOwn` imported ahead of core
 * reproduces #1798 verbatim (`buildPath` prints the native method into the
 * URL). Two earlier revisions of this header said "before any application
 * code can run", which is the sentence a future reader would have trusted.
 */
const hasOwn = Object.hasOwn;

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
    // `Object.hasOwn` before the read, exactly as `findMisChanneledKey` does in
    // `./guard` and for the same reason: a bare `params[key]` walks
    // the PROTOTYPE, so a route declaring `?toString` / `?constructor` /
    // `?valueOf` read as "the caller already filled this slot" on an EMPTY bag.
    // The default was then withheld from every LITERAL-form producer while the
    // resolving form still applied it — `buildPath` out of agreement with
    // `navigate`, printing an href its own `matchPath` does not reproduce, which
    // is the #1552/#1578 class this very rule exists to close. (`makeState`
    // joined the literal form in Phase 4, so it withholds too; the shape is
    // unreachable there because `makeState` checks the bag it SHIPS, after the
    // canonical channels are built (#1927).
    //
    // ⚠ It used to say "because P1 refuses the triggering bag on the same
    // predicate", and "the same predicate" was the defect: P1 reads the CALLER's
    // object and the producer reads it again, so a bag answering `undefined`
    // while P1 looked shipped a value P1 never saw.)
    if (
      hasOwn(params, key) &&
      params[key] !== undefined &&
      declaredQuery.includes(key)
    ) {
      dropped = true;
      continue;
    }

    kept ??= {};
    // ⚑ `putField`: the key is whatever the route's own `defaultSearch` spells,
    // and registration accepts any name (#1852). Two things this closes that the
    // former plain store did not. `__proto__` reached the inherited setter and
    // replaced `kept`'s prototype instead of adding an entry; it is ordinary
    // data now. And an AMBIENT accessor under a perfectly normal name did worse.
    //
    // ⚑ The reachability argument this comment used to end on — "the merge
    // below walks OWN keys, so nothing this loop produces reaches a committed
    // channel" — is retired along with the plain store (#1852). It was named
    // here rather than defended, correctly: `__proto__` was never the whole
    // hazard. The key is a name from the route's own `defaultSearch`, and an
    // ambient accessor under that name made `buildPath` THROW instead of
    // printing a URL — measured, `TypeError: Cannot set property theme of
    // #<Object> which has only a getter`, from this line.
    putField(kept, key, value);
  }

  // ⚑ The COPY is returned on both arms (#1847). It used to hand the route's own
  // object back whenever nothing was dropped, and that alias is the second half
  // of the defect: the loop above has already read every key once, and
  // the channel merge downstream then read the LIVE object again. A route's
  // `defaultSearch` is held by reference and read on every navigation by design,
  // so an accessor-backed one answered those two reads independently — which is
  // how `buildPath` came to print a key `navigate` did not ship, and the reverse.
  //
  // The literal form is the only caller, so this is also the only place the two
  // doors could diverge on one intent: with one read each, they agree by
  // construction rather than by luck.
  if (kept !== undefined) {
    return kept as SearchParams;
  }

  // Nothing survived. Either every key was dropped — in which case there is no
  // default left — or `defaults` carries no own enumerable key at all, and
  // handing that one back cannot be observed: there is nothing in it to read.
  return dropped ? undefined : defaults;
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
 * caller — a small adapter holding the per-attempt caches, so the four entry
 * points do not each rebuild the closure.
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
