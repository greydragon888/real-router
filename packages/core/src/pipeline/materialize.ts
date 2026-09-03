// packages/core/src/pipeline/materialize.ts

import { DEFAULT_TRANSITION } from "../constants";
import { freezeStateShell } from "../helpers";

import type { Canonical } from "./types";
import type { Params, SearchParams, State } from "../types";

// ⚑ Captured at module load, for the reason `helpers.ts` states over its own
// three: an application that re-points `Object.freeze` after boot must not be
// able to un-freeze what core publishes. This is the ONLY freeze the pipeline
// performs on `state.params` (#1928) — `mergePathChannel` performs none — so
// the whole guarantee rests on the capture, which is why
// `query-strategy-formats-1796` pins it with the global neutered.
const freeze = Object.freeze;

/**
 * THE shape of a router State — the pipeline's own, and the one the other five
 * constructors are measured against. ⚠ Not the ONLY place core spells it out:
 * `state-freeze-authority`'s census counts SIX State constructors across five
 * files, and the census is the authority on that number, not this docblock.
 *
 * The shape is inlined here rather than shared through a helper — ⑤b IS "make
 * the state object", so it belongs to the primitive that owns the stage rather
 * than to a helper one import away, which would have a single caller and no
 * justification left once `makeState` folded onto the pipeline.
 *
 * `context` is a fresh empty object, intentionally NOT frozen — plugins publish
 * into it via `claim.write(state, value)` after creation.
 *
 * ⚑ `transition` is attached HERE, unconditionally, and that is what lets this
 * literal be ANNOTATED rather than cast (#1976). Spread in behind a deferral
 * flag, the pending shape would be missing a field its own return type declares
 * required, with an `as State<P, S>` laundering it — a guard author writing
 * `toState.transition.reload` compiles and throws. `DEFAULT_TRANSITION`
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
 * ⚑ The deferral is a SECOND ENTRY POINT rather than a `skipFreeze` boolean on
 * {@link materialize}, because the call table says it is two functions: six
 * production sites, three asking for the deferral and three not, none passing an
 * expression, and nobody passing both polarities (#1976). ⚠ Count the sites by
 * NAME, not by `materialize(` — two are spelled `materialize<P>(` and
 * `materialize<P, S>(`, and both sit on the non-deferring side. One flag would
 * govern TWO guarantees — the freeze its name describes, and the presence of
 * `transition`, which it does not — so asking for a writable shell would also
 * ask for an incomplete object. Two names separate them; `transition` is
 * unconditional
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
