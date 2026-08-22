// packages/core/src/channels/guard.ts

import type { Params } from "../types";

/**
 * Intrinsics captured before any application code can run.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these after boot. Measured on the uncaptured
 * form: one naive `Object.hasOwn` polyfill walked straight through five sibling
 * readers of the same intrinsic while the single captured guard held.
 */
const hasOwn = Object.hasOwn;

/**
 * THE predicate of the always-on channel guard: the first key the caller put in
 * the PATH bag while the route declares it as a QUERY param, or `undefined`
 * when the bag is channel-correct.
 *
 * A DETECTOR, not a normaliser — the key is never moved. Moving it is what
 * `separateChannels` (stage ②) used to do — a function that no longer exists.
 * Channel-correctness is the producer's contract now, not a repair the pipeline
 * performs behind everyone's back.
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
  if (queryNames.length === 0 || params === undefined) {
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
 * Replaces the repair `separateChannels` (stage ②, since deleted) used to
 * perform at the `forwardState` seam. A key the route declares with `?`, sitting in the PATH
 * bag, is a producer's mistake — the producer named the route, so it knows the
 * declaration — and the router now says so instead of quietly moving the field
 * into the other object. Moving it was invisible: the caller kept believing
 * their bag was the one that shipped, and two producers of the SAME intent
 * could disagree about which channel a key ended up in.
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
