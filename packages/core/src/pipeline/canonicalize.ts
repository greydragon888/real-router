// packages/core/src/pipeline/canonicalize.ts

import { admittedSearch, withholdFilledSlots } from "../channels";
import { EMPTY_PARAMS, EMPTY_SEARCH } from "../constants";
import {
  mergePathChannel,
  mergeQueryChannel,
  normalizeChannel,
} from "../helpers";

import type { RouteResolver } from "./port";
import type { Canonical } from "./types";
import type { Params, SearchParams } from "../types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectKeys = Object.keys;

/**
 * Options for {@link canonicalize}. Both flags are opt-in, and both are read as
 * a ROLE rather than inferred from the shape of the call — the reasons differ
 * per flag and are recorded on each.
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
   * ⚠ The literal form also skips the seam's channel CHECK. The seam does not
   * SEPARATE channels — stage ② was deleted (`ba0f6b18b`), so the resolving form
   * REFUSES a mis-channelled bag while the literal form does not look HERE.
   *
   * ⚠ That is about this function, not about the door. Since #1927 every door
   * that PUBLISHES a State — `navigate`, `makeState`, `buildNavigationState`,
   * `matchPath` — checks the canonical bag it is about to ship, literal form or
   * not. The two that do not are `buildPath` (returns a string) and
   * `isActiveRoute` (returns a boolean): nothing ships, and #1572 / #1581 record
   * that the render-path predicates are deliberately not instrumented.
   * Either way nothing is moved: a caller who rides a declared query key in the
   * `params` bag keeps it there, and the URL build prints from the query channel
   * alone. That is what makes channel-correctness the producer's contract.
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

/**
 * The undeclared-key diagnostic (#1579 — the params half of #1553), lifted out of
 * {@link canonicalize} so the fast path (#1589) fits the cognitive-complexity
 * budget beside it.
 *
 * BOTH diagnostics presuppose that the route EXISTS — they answer "does route X
 * declare this key?", and for a route that is not a route the honest answer is
 * that the question does not apply (#1584). `queryNames` / `pathNames` answer
 * `[]` for a real route with no declarations, so `[]` cannot say "no such route";
 * `pathNames` carries the `undefined` arm that can. Reporting a nonexistent route
 * blamed the params for a typo in the ROUTE name — the most misleading direction
 * available — and burnt a de-dup slot per key, silencing the genuine warning if
 * that name later became real. The committing producers still refuse the
 * navigation on their own (`undefined` from `buildNavigationState`,
 * `ROUTE_NOT_FOUND` from `navigate`); only the diagnostic was wrong.
 *
 * Called only when the sink is present, so bare core never reaches the
 * `pathNames` lookup or the bag walk.
 */
export function diagnoseUndeclaredKeys(
  port: RouteResolver,
  resolvedName: string,
  pathBag: Params,
  declaredQuery: readonly string[],
  report: (routeName: string, key: string) => void,
): void {
  const declaredPath = port.pathNames(resolvedName);

  if (declaredPath === undefined) {
    return;
  }

  for (const key of objectKeys(pathBag)) {
    if (!declaredQuery.includes(key) && !declaredPath.includes(key)) {
      report(resolvedName, key);
    }
  }
}

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
 * `undefined` is absence on both sides of the merge (`mergeDefined`,
 * #1550/#1551) — an explicitly-`undefined` caller value leaves the default in
 * place, and a default carrying `undefined` behaves like no entry.
 *
 * ⚠ **The two channels are frozen by different owners (#1598 / #1928)** —
 * "frozen at merge time" is true of one of them and false of the other:
 *
 * - `query` is frozen HERE, by {@link mergeQueryChannel} — a PERF-gated choice,
 *   not a correctness one: moving it to `materialize` beside `params` leaves the
 *   suite green, and what holds the split is a re-measured +6.3 % on
 *   `isActiveRoute-parent` (see that function's docblock);
 * - `path` is NOT, because `materialize` freezes it at the publication boundary.
 *   A second freeze here certified nothing observable and split what a
 *   `buildPath` interceptor sees by route shape (#1928).
 *
 * Neither is the {@link materializePending} / {@link materialize} split, which
 * governs the state OBJECT so the navigate path can overwrite `transition` at
 * the commit — it never defers a channel.
 *
 * ⚠ The option bags at the call sites are INLINE LITERALS on purpose (#1589).
 * Hoisting them to shared frozen module constants was tried and measured worse:
 * `buildPath` and `isActiveRoute` slowed 6.6–10.5 % while sites that pass no
 * options moved 2 %. The literal in a small hot function is not an allocation at
 * all — V8 inlines the function, escape analysis removes the object, and the flag
 * folds to a constant. A shared frozen object replaces that with a property read
 * off the heap. Do not "optimise" these back.
 */
export function canonicalize(
  port: RouteResolver,
  name: string,
  params: Params,
  search?: SearchParams,
  opts?: CanonicalizeOptions,
): Canonical {
  // ① — forwardTo resolution + source-route default layering, through the
  // interceptor seam (plugins inject here). The literal form skips it entirely:
  // no chain, no seam, no channel check — the caller's bags stand as given.
  // ⚑ ONE `ToPropertyKey`, for every producer that reaches this terminal
  // (#1883). A route name is used as a property key downstream, so the caller's
  // `name` was coerced again by each consumer of `canonical.name` — and the
  // results could disagree. Measured on bare core, `makeState(bag, {}, {}, "/x")`
  // returned a State whose `name` was the caller's OBJECT beside the coerced
  // route's `defaultParams`: one value naming two different things, which is the
  // `ARCHITECTURE.md` criterion's "an object whose own fields disagree".
  //
  // ⚑ It also closes what #1889 declared open one door over. Coercing per use,
  // `buildPath` would read four times, throw `'A' is not defined` about a route
  // that EXISTS, and run the caller's `encodeParams` on the way to that
  // guaranteed refusal; a drift could additionally split the encoder read from
  // the matcher read. With one read there is no second answer to disagree with,
  // and the door ANSWERS.
  //
  // ⚠ A COERCION, not a gate, and the difference is load-bearing rather than
  // terminological. #1881 gated three doors and #1897 reverted them; a gate here
  // would have turned `isActiveRoute`'s `true` into `false`, re-introducing one
  // of them through the back door. Measured on both fixtures: this changes
  // `isActiveRoute` not at all (its forwardTo arm reads the name ABOVE this
  // terminal), and `navigate` / `canNavigateTo` never arrive — they refuse on a
  // `Map` miss at zero reads. Pinned in
  // `tests/functional/canonical-name-read-once-1883.test.ts`.
  //
  // ⚠ The `unknown` hop is not style. `name` is DECLARED `string`, and on the
  // strength of that declaration `lint --fix` deletes the coercion — three times
  // in this family already (#1882 twice, #1889's neighbour once). The declared
  // type is the CONTRACT; trusting it is the defect.
  const raw: unknown = name;
  // eslint-disable-next-line unicorn/no-useless-coercion -- the declared `string` is a contract, not a runtime guarantee (#1883)
  const canonicalName = String(raw);
  const forwarded =
    opts?.resolveForward === false
      ? { name: canonicalName, params, search }
      : port.resolveForward(canonicalName, params, search);
  const resolvedName = forwarded.name;

  // Path-channel entry guard: drops `undefined`-valued keys and collapses an
  // empty bag onto the EMPTY_PARAMS singleton (#1027), so the zero-params hot
  // path allocates nothing downstream.
  const pathBag = normalizeChannel(forwarded.params, EMPTY_PARAMS);

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

  if (reportUndeclared) {
    // Read HERE rather than once at the top (#1589): the fast path below does not
    // use the `?`-declared names, only the fact that there are none, and hoisting
    // the read made every predicate pay a port hop for an array it discarded. The
    // diagnostic is opt-in and off on every predicate, so this read is now paid
    // only by the committing producers that asked for it.
    diagnoseUndeclaredKeys(
      port,
      resolvedName,
      pathBag,
      port.queryNames(resolvedName),
      reportUndeclared,
    );
  }

  // The route's OWN defaults. Each slot IS its channel — no split (#1549 routed
  // them by the route's declaration for one release; `ba0f6b18b` retired that
  // along with the rest of stage ②). `defaultParams` is the path channel,
  // `defaultSearch` the query channel, and the router never moves a key between
  // them: the two meet only when the URL is printed. A `defaultParams` naming a
  // `?`-declared key is refused at REGISTRATION (`assertRouteDefaultChannels`),
  // so nothing mis-channelled can reach this merge and there is nothing here to
  // repair. Splitting here is what would let a config the router itself
  // accepted survive its own always-on channel guard.
  // FAST PATH (#1589): nothing to merge and nothing to gate. A route with no
  // defaults on either slot, called without a query bag, cannot have a default
  // applied, cannot have a slot withheld, and cannot have a key dropped by the
  // mode gate — whatever the mode, `admittedSearch` would keep every key of a
  // query channel that is empty anyway. So the whole tail below is provably
  // identity, and this returns without it. Note what is NOT in that list: how
  // many names the route declares with `?`. See the gate's own comment.
  //
  // This is the `buildPath/warm-static` case, and it was the most diagnostic
  // number in the regression: a static route — no params, no query, no defaults —
  // paid the full pass and came out 2.6x slower than before the pipeline.
  //
  // ⚠ **No freeze happens in this arm**, which is not the same as handing back
  // something unfrozen: `normalizeChannel` contains zero `freeze` calls, so what
  // it returns is what this returns — the frozen `EMPTY_PARAMS` singleton when
  // nothing survives its walk, a fresh unfrozen object otherwise.
  //
  // What makes the arm correct is the OWNER, not a freeze here: `materialize`
  // freezes `params` at the publication boundary (#1598), and since #1928 it is
  // the only owner, so this arm and the merged one both leave the freeze to it.
  // `query` is the asymmetric one — `EMPTY_SEARCH` is the shared frozen
  // singleton here, and `mergeQueryChannel` freezes on the other arm, because
  // that split is perf-gated rather than required (see `mergeQueryChannel`).
  //
  // ⚠ The query test accepts the EMPTY_SEARCH singleton as well as `undefined`,
  // and that is not cosmetic: `isActiveRoute` and the `forwardState` seam both
  // hand down the singleton rather than nothing, so a test for `undefined` alone
  // left the two render-path predicates — the whole point of the exercise — on
  // the slow path. A fresh `{}` is deliberately NOT accepted: telling an empty
  // literal from a non-empty one costs a key walk, so the two call sites that
  // would otherwise mint one pass the singleton instead.
  // ⚠ TWO facts, one from each side, and between them stage ③ and the mode gate
  // are provably identity (#1589):
  //
  //   1. the CALLER brought no query bag, so the mode gate has nothing to filter
  //      and the query merge has nothing on its left;
  //   2. the ROUTE carries no default on either slot, so neither merge has
  //      anything on its right.
  //
  // The merged query bag has exactly those two sources, so both being empty is
  // the whole condition. What is NOT in it: how many names the route declares
  // with `?`. Such a term would be redundant against fact 1, because an empty
  // bag has nothing to drop however many names are declared — established, not
  // argued: a 33-probe × 3-mode matrix over a `?`-declaring route with no
  // defaults is byte-identical without it (#1589).
  // Leaving it out costs one port hop less per call
  // (`queryNames` is ~12 ns on its own — `getQueryParams` is a four-frame chain to
  // a cached Map, not a Map read) and widens the fast path to routes that declare
  // query params but carry no defaults.
  //
  // Which leaves the two defaults, and they are read ABOVE the gate on purpose:
  // they are the gate's own route half AND the slow path's first input, so the
  // fast path pays two hops and the slow path pays nothing extra. The alternative
  // — one `port.mergesNothing()` predicate here, defaults re-read below — buys the
  // fast path one more hop (measured: `isActiveRoute-exact` 101 vs 111 ns) at the
  // cost of a FOURTH hop on the defaults path, which measured +6.5 % there. Both
  // were built and measured; the symmetric one wins because it regresses nothing.
  const defaultPath = port.defaultParams(resolvedName);
  const defaultQuery = port.defaultSearch(resolvedName);

  if (
    (forwarded.search === undefined || forwarded.search === EMPTY_SEARCH) &&
    defaultPath === undefined &&
    defaultQuery === undefined
  ) {
    // Annotated rather than asserted: the literal's inferred `query` type is the
    // empty singleton's `Record<string, never>`, too narrow for `Canonical` to
    // overlap, and an inline `as SearchParams` is redundant to the receiver.
    const fastPath: { name: string; path: Params; query: SearchParams } = {
      name: resolvedName,
      path: pathBag,
      query: EMPTY_SEARCH,
    };

    // The FAST path's cast to the brand — one of the TWO this function holds
    // (#1968), the slow path's closing the literal at the bottom. Not one act
    // stamped twice: the two paths reach the brand through different work.
    return fastPath as Canonical;
  }

  // Below the gate: the SLOW path is the only consumer of the declared names, so
  // the read moved here from the top of the function (#1589) — hoisting it made
  // every predicate pay a port hop for an array it discarded. The two consumers
  // left on this side — the default split and the mode gate — share this one
  // local, so they still cannot disagree about which registry decided the channel
  // (#1556); the diagnostic further up reads its own, through the same accessor,
  // so the one-registry invariant is unchanged.
  const declaredQuery = port.queryNames(resolvedName);

  // ③ — route defaults UNDER the routed value, each channel independent. Read
  // per channel (not as one `{ params, search }` bag from a combined `defaults()`
  // accessor) so the merge itself allocates nothing on the zero-defaults hot
  // path — the `Canonical` literal below is this function's only allocation.
  // (`MaterializeOptions` is dissolved into a positional `path` since #1976, so
  // `materialize`'s call site adds no second bag and the count stays one.)
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
  // The mode gate's sink, resolved ONCE — the read IS the gate. The router
  // implements this member as a GETTER returning `undefined` while no validator
  // is installed (`wiring/wireNamespaces.ts`), so in bare core `dropSink` is
  // genuinely absent and the drop path below skips the `pathNames` existence
  // lookup entirely. Hoisting also keeps the getter from being re-invoked per
  // dropped key. (Wired as a plain closure it would be always truthy, so the
  // check reads as taken and bare core pays that lookup with no sink behind it;
  // both sinks report their absence honestly instead.)
  //
  // Read BELOW the fast path (#1589): a route with nothing to gate cannot drop a
  // key, so it has no use for the sink and should not pay the getter.
  const dropSink = port.reportDroppedQueryKey;

  const queryDefaults =
    opts?.resolveForward === false
      ? withholdFilledSlots(defaultQuery, pathBag, declaredQuery)
      : defaultQuery;

  // ⚑ Normalised BEFORE the merge, exactly as the path bag one branch below.
  // On the non-forwarding arm `forwarded.search` IS the caller's bag, and the
  // merge returns its argument untouched when the route declares no
  // `defaultSearch` — so this is where an `undefined`-valued key or `__proto__`
  // stops. The path channel arrives here already normalised; this makes the two
  // channels agree.
  const searchBag = normalizeChannel(forwarded.search, EMPTY_SEARCH);
  const query = mergeQueryChannel(queryDefaults, searchBag);

  return {
    name: resolvedName,
    // ⚑ Two channels, two freeze owners, and each says so in its own name.
    // `mergeQueryChannel` freezes — perf-gated, see its docblock, and NOT
    // required for correctness; `mergePathChannel` does not (`materialize` freezes
    // at the publication boundary, #1598). A second freeze on the path channel bought
    // nothing observable and split what a `buildPath` interceptor sees by route
    // shape — live on a route with no defaults, frozen on every other (#1928).
    //
    // Symmetry towards LIVE rather than towards frozen: `addInterceptor` is a
    // plugin right and the chain is handed the real bag by contract, the same
    // contract `decodeParams` has. A write there is the plugin's business, and
    // `buildURLForCommit` makes the state it produces reportable.
    //
    // ⚑ Both bags are `normalizeChannel`'s own fresh objects — never its input —
    // which is what lets either channel skip the defensive copy
    // {@link adoptForeignBag} makes for a bag the router does not own. ⚠ It is
    // the bag's ROUTE through `normalizeChannel` that earns the claim, not
    // which channel it is: BOTH say it, not the path channel alone (#1812).
    path: mergePathChannel(defaultPath, pathBag),
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
    // The SLOW path's cast to the brand — one of TWO, both in this function
    // (#1968). The other is `return fastPath as Canonical` near the top, and
    // nothing else in the codebase casts to `Canonical`;
    // `canonical-brand-authority-1968` is what notices if that changes.
  } as Canonical;
}
