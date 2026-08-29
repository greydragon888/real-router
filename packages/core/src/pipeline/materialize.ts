// packages/core/src/pipeline/materialize.ts

import { DEFAULT_TRANSITION } from "../constants";
import { freezeStateShell } from "../helpers";

import type { Canonical } from "./types";
import type { Params, SearchParams, State } from "../types";

// ⚑ Captured at module load, for the reason `helpers.ts` states over its own
// three: an application that re-points `Object.freeze` after boot must not be
// able to un-freeze what core publishes. This capture became load-bearing with
// #1928: until then `state.params` was frozen by `mergeWithDefault`'s CAPTURED
// `freeze` on the slow path, and this site only ever re-froze an already-frozen
// bag there — so a raw global here was covered by the merge. With the merge-time
// freeze gone this is the ONLY freeze `params` gets, and
// `query-strategy-formats-1796` measured the gap the moment it appeared: with
// the global neutered, `Object.isFrozen(state.params)` flipped to `false`.
const freeze = Object.freeze;

export interface MaterializeOptions {
  /**
   * The already-built URL (stage ⑤a). Required: the entry points that could
   * want a lazily-built path (`canNavigateTo`, `isActiveRoute`) settled the
   * question in Phase 2 by calling `buildURL` themselves, so `materialize`
   * never grew the port argument the milestone-1 docs left open.
   */
  path: string;
  /**
   * Defer `Object.freeze` of the STATE OBJECT — the navigate path passes `true`
   * so `completeTransition` can attach `transition`. It does NOT affect the
   * channels: `params` / `search` are frozen at merge time in `canonicalize`.
   */
  skipFreeze?: boolean;
}

/**
 * Stage ⑤b — the State of a canonical intent, and THE shape of a router State.
 * Accepts nothing but a {@link Canonical}.
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
 * Deliberately does NOT call `makeState`: that would re-run stage ③ (idempotent
 * but a wasted pass) and rebuild the path itself, defeating ⑤a. Since Phase 4 it
 * could not, anyway — `makeState` is `canonicalize`'s literal form and would
 * recurse.
 */
export function materialize<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
>(canonical: Canonical, opts: MaterializeOptions): State<P, S> {
  // `Canonical` is deliberately NOT generic: it is one opaque intent shape, and
  // parameterising it would push the caller's `P` through the port and the merge
  // helpers for no gain. The parameter belongs to the FUNCTION, exactly as on
  // `makeState<P, S>` — a public entry point (`matchPath<P>`) instantiates it and
  // hands the result straight back to the consumer, so the chain
  // `matchPath<P>` → `materialize<P>` → `State<P>` has to carry the caller's type
  // (measured: without it `materialize` collapses the chain to `State<Params>`
  // and a consumer's `State<MyParams>` assignment fails TS2322).
  const state = {
    name: canonical.name,
    params: canonical.path as P,
    search: canonical.query as S,
    path: opts.path,
    context: {},
    ...(!opts.skipFreeze && { transition: DEFAULT_TRANSITION }),
  } as State<P, S>;

  // The path channel is frozen HERE, at the publication boundary — `materialize`
  // is the one place a `Canonical` becomes something user code can hold (#1598).
  // BEFORE the `skipFreeze` branch on purpose: that flag defers the state SHELL
  // (the navigate path attaches `transition` and lets plugins write `context`
  // after the fact), never the channels, so guards see frozen bags either way.
  //
  // `params` ONLY, and that asymmetry is measured rather than stylistic:
  // `canonical.query` is already frozen on every path — the fast path hands over
  // the `EMPTY_SEARCH` singleton, the slow one gets it back frozen from
  // `admittedSearch` — and re-freezing a frozen object is not free (~8 ns), so
  // freezing both regressed `isActiveRoute-exact` by 9.8 % while freezing one
  // wins 5-12 % on every producer that never publishes.
  freeze(state.params);

  return opts.skipFreeze ? state : freezeStateShell(state);
}
