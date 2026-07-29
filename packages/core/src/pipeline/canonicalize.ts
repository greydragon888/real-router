// packages/core/src/pipeline/canonicalize.ts

import { EMPTY_PARAMS, EMPTY_SEARCH } from "../constants";
import {
  admittedSearch,
  mergeWithDefault,
  normalizeParams,
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
 * that REFUSES a mis-channelled bag rather than repairing one.
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

  /**
   * Run the opt-in undeclared-key diagnostic (#1579)? Defaults to `false`.
   *
   * Explicit rather than inferred from `resolveForward`, and the difference is
   * not cosmetic: `canNavigateTo` DOES resolve `forwardTo` (so it shares the
   * form with `navigate`) yet is a PREDICATE that runs on every `<Link>` render.
   * Keying the diagnostic on the form warned from it — measured, not reasoned —
   * which is exactly the per-render flood the channel guard avoids by not
   * instrumenting predicates at all (RFC rev. 29 §5). Only the points that
   * COMMIT or hand back a state a developer will keep opt in.
   */
  diagnoseUndeclared?: boolean;
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

  // Read ONCE. Three consumers below need the route's `?`-declared names — the
  // diagnostic, the default split, and the mode gate — and `getQueryParams` is a
  // cached lookup, not a free one; a local also makes it impossible for the three
  // to disagree about which registry decided the channel (#1556).
  const declaredQuery = port.queryNames(resolvedName);

  // The undeclared-key diagnostic (#1579 — the params half of #1553). A key the
  // route declares NOWHERE stays in `state.params` as app-level data, which is
  // correct and documented — but it never reaches the URL, so the state does not
  // round-trip through its own `state.path`. Core does not change that; it only
  // offers to SAY it.
  //
  // Three things keep this from costing anything it should not:
  //  - gated on the sink being present, so bare core pays one `undefined` check
  //    and never walks the bag (the port member is a GETTER that returns
  //    `undefined` until `validation-plugin` installs the validator — a plain
  //    closure would always be truthy and the gate would be decorative);
  //  - opted in EXPLICITLY by the committing producers, so every predicate stays
  //    silent — including `canNavigateTo`, which resolves `forwardTo` and would
  //    therefore be caught by a form-based test while still running on every
  //    `<Link>` render (measured: it warned before the flag was made explicit);
  //  - read from the CALLER's bag, before route defaults are merged in, so a
  //    deliberate arbitrary `defaultParams` entry is not reported as a mistake.
  const reportUndeclared =
    opts?.diagnoseUndeclared === true
      ? port.reportUndeclaredParamKey
      : undefined;

  // The mode gate's sink, resolved ONCE and read as the gate. Bare core leaves
  // it a plain (always-truthy) closure rather than `undefined`, so the `?.`
  // below is not the gate the port's docs describe — hoisting the read here is
  // what makes "bare core pays nothing" true: without it `port.pathNames` ran
  // per dropped key with no sink to feed.
  const dropSink = port.reportDroppedQueryKey;

  // BOTH diagnostics presuppose that the route EXISTS — they answer "does route
  // X declare this key?", and for a route that is not a route the honest answer
  // is that the question does not apply (#1584). `queryNames` / `pathNames`
  // answer `[]` for a real route with no declarations, so `[]` cannot say "no
  // such route"; `pathNames` carries the `undefined` arm that can. Each
  // diagnostic reads it for itself, behind its own sink check, so bare core
  // never pays the lookup and neither reader depends on the other's ordering.
  if (reportUndeclared) {
    const declaredPath = port.pathNames(resolvedName);

    if (declaredPath !== undefined) {
      // Reporting a nonexistent route blamed the params for a typo in the ROUTE
      // name — the most misleading direction available — and burnt a de-dup slot
      // per key, silencing the genuine warning if that name later became real.
      // The committing producers still refuse the navigation on their own
      // (`undefined` from `buildNavigationState`, `ROUTE_NOT_FOUND` from
      // `navigate`); only the diagnostic was wrong.
      for (const key of Object.keys(pathBag)) {
        if (!declaredQuery.includes(key) && !declaredPath.includes(key)) {
          reportUndeclared(resolvedName, key);
        }
      }
    }
  }

  // The route's OWN defaults, split by the channel the route DECLARES (#1549) —
  // Each slot IS its channel — no split. `defaultParams` is the path channel,
  // `defaultSearch` the query channel, and the router never moves a key between
  // them: the two meet only when the URL is printed. A `defaultParams` naming a
  // `?`-declared key is refused at REGISTRATION (`assertRouteDefaultChannels`),
  // so nothing mis-channelled can reach this merge and there is nothing here to
  // repair. Splitting here used to be what made a config the router itself had
  // accepted survive its own always-on channel guard.
  const routeDefaults = {
    params: port.defaultParams(resolvedName),
    search: port.defaultSearch(resolvedName),
  };

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
  // ⚠ Scoped to `declaredQuery`, and the scope is load-bearing: only a DECLARED
  // query name can HAVE a params-bag twin. Withholding on a key the route
  // declares nowhere (`/u` + `defaultSearch { theme }`), or on one that owns a
  // path slot beside its query twin (`/items/:id?id`, the #843/#1549 carve-out),
  // takes a default no caller was competing for — and left `buildPath` the only
  // producer out of agreement, printing an href this very route's `matchPath`
  // rewrote on the spot. That is the #1552/#1578 class, re-opened.
  const queryDefaults =
    opts?.resolveForward === false
      ? withholdFilledSlots(routeDefaults.search, pathBag, declaredQuery)
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
      : admittedSearch(query as SearchParams, declaredQuery, (key) => {
          // Same existence precondition as the params-bag diagnostic above
          // (#1584): the DROP is always-on and correct either way, but saying
          // "key `q` is not declared on route `nope`" about a route that does
          // not exist blames the query for a route-name typo. Found by sweeping
          // this file's port consumers after fixing the sibling — the two
          // diagnostics read the same `[]`-means-nothing answer.
          // The sink is checked FIRST: it is the cheap half, and it is the one
          // that is absent in bare core, so the `pathNames` lookup stays off the
          // path of a router with no validator installed.
          if (
            dropSink !== undefined &&
            port.pathNames(resolvedName) !== undefined
          ) {
            dropSink(resolvedName, key);
          }
        }),
    // The one and only cast to the brand in the codebase — reviewed once, here.
  } as Canonical;
}
