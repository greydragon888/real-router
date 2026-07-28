// packages/core/src/pipeline/materialize.ts

import { createStateObject } from "../helpers";

import type { Canonical } from "./types";
import type { Params, SearchParams, State } from "../types";

export interface MaterializeOptions {
  /**
   * The already-built URL (stage ⑤a). Required on this milestone: the entry
   * points that want a lazily-built path (`canNavigateTo`, `isActiveRoute`)
   * migrate in Phase 2, and only then does it become worth deciding whether
   * they call `buildURL` themselves or `materialize` grows a port argument.
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
 * Stage ⑤b — the State of a canonical intent. Accepts nothing but a
 * {@link Canonical}, and emits through the same `createStateObject` that
 * `StateNamespace.makeState` uses, so the two producers cannot drift into two
 * state shapes.
 *
 * Deliberately does NOT call `makeState`: that would re-run stage ③ (idempotent
 * but a wasted pass) and rebuild the path itself, defeating ⑤a.
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
  return createStateObject<P, S>(
    canonical.name,
    canonical.path as P,
    canonical.query as S,
    opts.path,
    opts.skipFreeze,
  );
}
