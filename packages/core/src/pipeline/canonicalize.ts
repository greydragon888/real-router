// packages/core/src/pipeline/canonicalize.ts

import { EMPTY_PARAMS, EMPTY_SEARCH } from "../constants";
import {
  admittedSearch,
  mergeWithDefault,
  normalizeParams,
  separateChannels,
  withholdFilledSlots,
} from "../helpers";

import type { RouteResolver } from "./port";
import type { Canonical } from "./types";
import type { Params, SearchParams } from "../types";

/**
 * THE single producer of {@link Canonical}: one pass over stage ① (resolve the
 * `forwardTo` chain) and stage ③ (merge each channel's route default UNDER the
 * caller's value). There is no separating stage ② — channels arrive correct by
 * the producer contract, and the port's `resolveForward` is wired to the seam
 * that still normalises them while the legacy single-bag form is alive.
 *
 * Ordering is forced by the data, not by discipline: ③ needs the RESOLVED name
 * (target defaults cannot be read before `forwardTo` resolves), so ① always
 * precedes it.
 *
 * `undefined` is absence on both sides of the merge (`mergeWithDefault`,
 * #1550/#1551) — an explicitly-`undefined` caller value leaves the default in
 * place, and a default carrying `undefined` behaves like no entry.
 *
 * Channels are frozen here, at merge time — NOT in `materialize`. The two
 * freezes are different things: `materialize`'s `skipFreeze` governs the state
 * object (the navigate path defers it so `completeTransition` can attach
 * `transition`), while `params` / `search` must be immutable the moment a guard
 * can see them. `mergeWithDefault` also copies before freezing, so the caller's
 * own bag is never frozen out from under it.
 */
export interface CanonicalizeOptions {
  /**
   * Run stage ① (`forwardTo` resolution through the interceptor seam)?
   *
   * Defaults to `true`. `false` is the LITERAL form: the intent canonicalises
   * against the route the caller NAMED, without following its `forwardTo` chain
   * and without entering the seam. The entry points that ask a question about a
   * literal route rather than producing a destination take it — `buildPath`
   * (A.5: `buildPath("src")` stays `/src`, deliberately asymmetric with
   * `navigate`), `isActiveRoute`'s literal arm, and `makeState`.
   *
   * ⚠ Skipping the seam also skips its channel separation, which is the POINT,
   * not a side effect: a caller who rode a declared query key in the `params`
   * bag no longer has it moved to the query channel, so the URL build prints
   * from the query channel alone. That is what makes channel-correctness the
   * producer's contract on these points.
   */
  resolveForward?: boolean;
}

export function canonicalize(
  port: RouteResolver,
  name: string,
  params: Params,
  search?: SearchParams,
  opts?: CanonicalizeOptions,
): Canonical {
  // ① — forwardTo resolution + source-route default layering, through the
  // interceptor seam (plugins inject here). The literal form skips it entirely:
  // no chain, no seam, no channel separation — the caller's bags stand as given.
  const forwarded =
    opts?.resolveForward === false
      ? { name, params, search }
      : port.resolveForward(name, params, search);
  const resolvedName = forwarded.name;

  // Path-channel entry guard: drops `undefined`-valued keys and collapses an
  // empty bag onto the EMPTY_PARAMS singleton (#1027), so the zero-params hot
  // path allocates nothing downstream.
  const pathBag = normalizeParams(forwarded.params);

  // The route's OWN defaults, split by the channel the route DECLARES (#1549) —
  // the same rule #1570 applies to a forwarding hop's defaults, now applied to
  // the terminal's. `defaultParams` is a route's only default slot in v1 configs
  // and stays legal for a `?`-declared name, so a default spelled there for a
  // query key belongs to the query channel; `defaultSearch` is spread last and
  // therefore wins the collision (the explicit slot outranks the implicit one).
  // `separateChannels` short-circuits on a route with no query declarations, so
  // the zero-declaration hot path pays a length check.
  const routeDefaults = separateChannels(
    port.defaultParams(resolvedName),
    port.queryNames(resolvedName),
    port.defaultSearch(resolvedName),
  );

  // ③ — route defaults UNDER the routed value, each channel independent. Read
  // per channel (not as one `{ params, search }` bag from a combined `defaults()`
  // accessor) so the merge itself allocates nothing on the zero-defaults hot
  // path — the `Canonical` literal below is the pipeline's one added allocation.
  // In the LITERAL form no seam runs, so nothing has enforced #1570's rule that
  // a default is never applied to a slot the caller already filled — in EITHER
  // bag. Apply it here: the query default and a caller's params-twin land in
  // DIFFERENT channels, where no merge ranks them, and the default would win by
  // construction. `buildPath("x", { page: "9" })` on `defaultSearch { page: "5" }`
  // would print `?page=5` — the caller's value silently replaced by the default,
  // which is the §1.1 inversion this whole split exists to remove. Nothing is
  // rerouted: the caller's key stays in the bag they chose (and, being in the
  // path channel, is simply not printed — that IS the single-bag retirement),
  // only the default is withheld.
  const queryDefaults =
    opts?.resolveForward === false
      ? withholdFilledSlots(routeDefaults.search, pathBag)
      : routeDefaults.search;

  const query = mergeWithDefault(queryDefaults, forwarded.search, EMPTY_SEARCH);

  return {
    name: resolvedName,
    path: mergeWithDefault(routeDefaults.params, pathBag, EMPTY_PARAMS),
    // The mode gate (#1575), applied AFTER the default merge so a `defaultSearch`
    // for an undeclared key is dropped with it — under `default`/`strict` that
    // config is dead by the same rule, not a back door around it. Runs on the
    // merged bag rather than the caller's, because that is the bag ⑤a prints
    // from, and the invariant is about those two agreeing.
    query: port.admitsUndeclaredQuery()
      ? query
      : admittedSearch(
          query as SearchParams,
          port.queryNames(resolvedName),
          (key) => {
            port.reportDroppedQueryKey?.(resolvedName, key);
          },
        ),
    // The one and only cast to the brand in the codebase — reviewed once, here.
  } as Canonical;
}
