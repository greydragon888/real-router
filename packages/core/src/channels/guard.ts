// packages/core/src/channels/guard.ts

import type { Params } from "../types";

/**
 * Intrinsics captured at module load: `hasOwn`.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ The limit of what capture buys — and the shim order that defeats it — is
 * stated once, in `guards.ts`. Not restated here (#2091).
 */
const hasOwn = Object.hasOwn;

/**
 * THE predicate of the always-on channel guard: the first key the caller put in
 * the PATH bag while the route declares it as a QUERY param, or `undefined`
 * when the bag is channel-correct.
 *
 * A DETECTOR, not a normaliser — the key is never moved. There is no stage ②
 * and no `separateChannels`: channel-correctness is the producer's contract,
 * not a repair the pipeline performs behind everyone's back.
 *
 * Scans `queryNames` (a route's declared query names — small, cached) rather
 * than the bag, so there is no `Object.keys` allocation, and short-circuits on
 * a route with no query declarations, which is the common case.
 *
 * `undefined` is absence on both sides (#1550 / #1551), so an
 * `undefined`-valued key is NOT a mis-channel: it is the documented removal
 * marker `persistent-params` relies on, and it never reaches a built state
 * anyway. A name that also occupies a path slot (`/items/:id?id`) is absent
 * from `queryNames` by construction (#843 / #1549 carve-out), so the collision
 * form is legitimately path-owned and passes.
 *
 * @internal
 */
export function findMisChanneledKey(
  params: Params | undefined,
  queryNames: readonly string[],
): string | undefined {
  // ⚠ An absent BAG has two spellings, and `== null` is the intent: both
  // nullish values mean "there is no bag". `navigate(name, null)` is supported
  // runtime input while the signature admits only `Params | undefined`, so
  // testing `=== undefined` alone lets `Object.hasOwn` perform `ToObject` — and
  // this DIAGNOSTIC becomes the thing that throws (#1822).
  //
  // ⚑ In the predicate rather than in `assertChannelCorrect`: `canNavigateTo`
  // and `navigateToState` reach it directly, and neither may throw — the first
  // answers on the render path, the second rejects because URL plugins call it
  // from popstate handlers.
  if (queryNames.length === 0 || params == null) {
    return undefined;
  }

  for (const key of queryNames) {
    if (!hasOwn(params, key)) {
      continue;
    }

    let value: unknown;

    try {
      value = params[key];
    } catch {
      // A DIAGNOSTIC must never become the thing that throws. The bag may be
      // backed by accessors (a Proxy, a getter, a framework's reactive object),
      // and reading one here happens EARLIER than any consumer would have read
      // it — so an accessor that throws would surface from the guard instead of
      // from the code that actually needed the value, moving the origin of an
      // existing failure. Treat it as "nothing to report" and let the real
      // consumer hit the same accessor exactly as it did before.
      return undefined;
    }

    if (value !== undefined) {
      return key;
    }
  }

  return undefined;
}

/**
 * THE centralized channel check — the single place a mis-channelled bag is
 * refused, wherever it came from.
 *
 * A key the route declares with `?`, sitting in the PATH bag, is a producer's
 * mistake — the producer named the route, so it knows the declaration — and the
 * router SAYS so instead of quietly moving the field into the other object.
 * Moving it would be invisible: the caller keeps believing their bag is the one
 * that shipped, and two producers of the SAME intent can disagree about which
 * channel a key ended up in.
 *
 * `source` names WHOSE bag is wrong, which is the whole diagnostic value at a
 * seam: the caller's argument, a `forwardState` interceptor's return, or the
 * output of a route's own `decodeParams`. It takes a THUNK as well as a string
 * because the seam sits on the navigation hot path — a source that has to be
 * composed (naming the route a chain forwarded from) must not build its string
 * on every call just to discard it on the 99.99% of calls that pass.
 *
 * @internal
 */
export function assertChannelCorrect(
  method: string,
  routeName: string,
  params: Params | undefined,
  queryNames: readonly string[],
  source?: string | (() => string),
  remedy?: string,
): void {
  const key = findMisChanneledKey(params, queryNames);

  if (key !== undefined) {
    throw new TypeError(
      `[router.${method}] ${misChanneledKeyMessage(
        routeName,
        key,
        typeof source === "function" ? source() : source,
        remedy,
      )}`,
    );
  }
}

/**
 * The channel verdict, re-asked on the bag that actually SHIPS (#1927).
 *
 * Every position above a producer reads the CALLER's object — P1 at the door,
 * the `forwardState` seam, the `decodeParams` boundary. The canonical bag is
 * then built by a SECOND read of that same object, and between the two it still
 * belongs to the application: a Proxy, a framework's reactive object, a plain
 * getter. A bag answering `undefined` while the guards look — the documented
 * removal marker, correctly waved through — commits a declared query name into
 * `state.params` while `state.path` prints without it. `read-count-authority`
 * owns how many times each door reads a caller-owned key; this file does not
 * restate the counts, because a number written twice goes stale twice.
 *
 * The SAME predicate, one position later, on core's own object. A canonical bag
 * has no accessors, so this verdict cannot be overtaken: the invariant is
 * structural rather than maintained by care.
 *
 * ⚑ Called by the four doors that PUBLISH a State, and by no one else. The two
 * render-path predicates — `buildPath` (a string) and `isActiveRoute` (a boolean)
 * — ship no value for a verdict to vouch for, and #1572 / #1581 record that they
 * are deliberately not instrumented: detecting there is fine, throwing is not.
 * They express that the way they always have, by not calling.
 *
 * ⚠ `canNavigateTo` produces a State too and is deliberately NOT here — measured,
 * not assumed. It discards the state, so nothing ships for a verdict to vouch
 * for, and every bag this check would refuse it already answers `false` to: the
 * seam sees the same key one read earlier. Adding the call changed no answer for
 * any blindness from 0 to 3 reads, while costing one predicate call on the render
 * path, which runs per `<Link>` per render.
 *
 * ⚑ On a canonical bag the `value !== undefined` arm is vacuous — those keys are
 * already dropped — so `undefined` stays the removal marker (#1550 / #1551).
 *
 * ⚑ The declarations are the RESOLVED route's, which is why callers pass
 * `canonical.name`: the bag came out of the chain, and the resolved route owns
 * the URL that gets printed — the same authority the seam names.
 */
export function assertShippedChannelCorrect(
  method: string,
  routeName: string,
  shipped: Params,
  queryNames: readonly string[],
): void {
  assertChannelCorrect(
    method,
    routeName,
    shipped,
    queryNames,
    "the `params` bag this call is about to ship — the channel check above it read a different value, so the caller's object answered differently between the two reads",
  );
}

/**
 * The guard's actionable message. One builder for every position, so the
 * wording a user sees does not depend on which door they came through — the
 * facade's `TypeError`, the seam's, the decoder's, and `navigateToState`'s
 * `RouterError(WRONG_CHANNEL)`, which needs the wording WITHOUT the throw and is
 * why this is a separate function from {@link assertChannelCorrect}.
 *
 * @internal
 */
export function misChanneledKeyMessage(
  routeName: string,
  key: string,
  source = "the `params` argument",
  remedy = "Pass it in `search` instead",
): string {
  return `Route "${routeName}" declares \`${key}\` as a query param, but it was given in ${source} — the path channel. ${remedy}; the two channels are separate since RFC-4 M2 and the router never moves a key between them.`;
}
