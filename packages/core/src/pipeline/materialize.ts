// packages/core/src/pipeline/materialize.ts

import { DEFAULT_TRANSITION } from "../constants";
import { freezeStateShell } from "../helpers";

import type { Canonical } from "./types";
import type { Params, SearchParams, State } from "../types";

// ⚑ Captured at module load, for the reason `helpers.ts` states over its own
// three: an application that re-points `Object.freeze` after boot must not be
// able to un-freeze what core publishes. This capture became load-bearing with
// #1928: until then `state.params` was frozen by the merge's CAPTURED
// `freeze` on the slow path, and this site only ever re-froze an already-frozen
// bag there — so a raw global here was covered by the merge. With the merge-time
// freeze gone this is the ONLY freeze `params` gets, and
// `query-strategy-formats-1796` measured the gap the moment it appeared: with
// the global neutered, `Object.isFrozen(state.params)` flipped to `false`.
const freeze = Object.freeze;

/**
 * THE shape of a router State, and the only place core spells it out.
 *
 * The shape used to live in `helpers.createStateObject`, shared with
 * `StateNamespace.makeState`; Phase 4 folded that producer onto the pipeline and
 * left the helper with a single caller and a docstring whose whole justification
 * ("one constructor for both producers") had expired. It is inlined here — ⑤b IS
 * "make the state object", so the shape belongs to the primitive that owns the
 * stage rather than to a helper one import away.
 *
 * `context` is a fresh empty object, intentionally NOT frozen — plugins publish
 * into it via `claim.write(state, value)` after creation.
 *
 * ⚑ `transition` is attached HERE, unconditionally, and that is what lets this
 * literal be ANNOTATED rather than cast (#1976). It used to be spread in behind
 * the deferral flag, so the pending shape was missing a field its own return
 * type declares required and an `as State<P, S>` laundered it — a guard author
 * writing `toState.transition.reload` compiled and threw. `DEFAULT_TRANSITION`
 * is not a claim that anything succeeded: it is the "no transition information"
 * value `matchPath` has always published through {@link materialize}, and
 * `completeTransition` overwrites it with the real meta at the commit.
 *
 * ⚑ One shape, not two, is also why the split below is free: both producers now
 * build the same hidden class, so the commit's `toState.transition = …` is an
 * overwrite rather than the shape transition it was when the field was added
 * after the fact (the cost #1684 paid for and #1694 had to undo).
 */
function buildState<P extends Params, S extends SearchParams>(
  canonical: Canonical,
  path: string,
): State<P, S> {
  // `Canonical` is deliberately NOT generic: it is one opaque intent shape, and
  // parameterising it would push the caller's `P` through the port and the merge
  // helpers for no gain. The parameter belongs to the FUNCTION, exactly as on
  // `makeState<P, S>` — a public entry point (`matchPath<P>`) instantiates it and
  // hands the result straight back to the consumer, so the chain
  // `matchPath<P>` → `materialize<P>` → `State<P>` has to carry the caller's type
  // (measured: without it `materialize` collapses the chain to `State<Params>`
  // and a consumer's `State<MyParams>` assignment fails TS2322).
  const state: State<P, S> = {
    name: canonical.name,
    params: canonical.path as P,
    search: canonical.query as S,
    path,
    context: {},
    transition: DEFAULT_TRANSITION,
  };

  // The path channel is frozen HERE, at the publication boundary — this is the
  // one place a `Canonical` becomes something user code can hold (#1598).
  //
  // `params` ONLY, and that asymmetry is measured rather than stylistic:
  // `canonical.query` is already frozen on every path — the fast path hands over
  // the `EMPTY_SEARCH` singleton, the slow one gets it back frozen from
  // `admittedSearch` — and re-freezing a frozen object is not free (~8 ns), so
  // freezing both regressed `isActiveRoute-exact` by 9.8 % while freezing one
  // wins 5-12 % on every producer that never publishes.
  freeze(state.params);

  return state;
}

/**
 * Stage ⑤b — the State of a canonical intent, ready to publish.
 * Accepts nothing but a {@link Canonical}.
 *
 * Deliberately does NOT call `makeState`: that would re-run stage ③ (idempotent
 * but a wasted pass) and rebuild the path itself, defeating ⑤a. Since Phase 4 it
 * could not, anyway — `makeState` is `canonicalize`'s literal form and would
 * recurse.
 *
 * ⚠ `path` is positional and REQUIRED. The entry points that could want a lazily
 * built path (`canNavigateTo`, `isActiveRoute`) settled the question in Phase 2
 * by calling `buildURL` themselves, so this primitive never grew the port
 * argument the milestone-1 docs left open — and with the deferral flag gone
 * (#1976) an options bag holding one required field bought nothing.
 */
export function materialize<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
>(canonical: Canonical, path: string): State<P, S> {
  return freezeStateShell(buildState<P, S>(canonical, path));
}

/**
 * Stage ⑤b for a state that is not published yet — same shape, writable shell.
 *
 * ⚑ The deferral used to be a `skipFreeze` boolean on {@link materialize}, and
 * the call table said it was two functions: three callers passed a literal
 * `true`, one omitted it, none passed an expression, and nobody passed both
 * polarities (#1976). Worse, the one flag governed TWO guarantees — the freeze
 * its name describes, and the presence of `transition`, which it did not — so
 * the only way to ask for a writable shell was to also ask for an incomplete
 * object. Splitting the name separates them; `transition` is now unconditional
 * and only the freeze is deferred, which is what the name always claimed.
 *
 * Three reasons converge on this door, and they are NOT the same reason:
 * `buildNavigateState` NEEDS the writable shell (`completeTransition` attaches
 * the real meta and freezes in one step); `Router.canNavigateTo` wants FIDELITY
 * with the navigate path, so that a capability predicate consults guards with
 * the object shape a real navigation would hand them; and
 * `RoutesNamespace.#matchesActiveStateUnsafe` wants the SPEED — its state exists
 * for the length of one `areStatesEqual` call that reads three fields, and the
 * freeze it skips is ~5 % of that benchmark.
 */
export function materializePending<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
>(canonical: Canonical, path: string): State<P, S> {
  return buildState<P, S>(canonical, path);
}
