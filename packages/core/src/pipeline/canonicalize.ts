// packages/core/src/pipeline/canonicalize.ts

import { EMPTY_PARAMS, EMPTY_SEARCH } from "../constants";
import { admittedSearch, mergeWithDefault, normalizeParams } from "../helpers";

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
export function canonicalize(
  port: RouteResolver,
  name: string,
  params: Params,
  search?: SearchParams,
): Canonical {
  // ① — forwardTo resolution + source-route default layering, through the
  // interceptor zone (plugins inject here).
  const forwarded = port.resolveForward(name, params, search);
  const resolvedName = forwarded.name;

  // Path-channel entry guard: drops `undefined`-valued keys and collapses an
  // empty bag onto the EMPTY_PARAMS singleton (#1027), so the zero-params hot
  // path allocates nothing downstream.
  const pathBag = normalizeParams(forwarded.params);

  // ③ — route defaults UNDER the routed value, each channel independent. Read
  // per channel (not as one `{ params, search }` bag from a combined `defaults()`
  // accessor) so the merge itself allocates nothing on the zero-defaults hot
  // path — the `Canonical` literal below is the pipeline's one added allocation.
  const query = mergeWithDefault(
    port.defaultSearch(resolvedName),
    forwarded.search,
    EMPTY_SEARCH,
  );

  return {
    name: resolvedName,
    path: mergeWithDefault(
      port.defaultParams(resolvedName),
      pathBag,
      EMPTY_PARAMS,
    ),
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
