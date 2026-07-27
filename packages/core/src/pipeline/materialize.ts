// packages/core/src/pipeline/materialize.ts

import { createStateObject } from "../helpers";

import type { Canonical } from "./types";
import type { State } from "../types";

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
export function materialize(
  canonical: Canonical,
  opts: MaterializeOptions,
): State {
  return createStateObject(
    canonical.name,
    canonical.path,
    canonical.query,
    opts.path,
    opts.skipFreeze,
  );
}
