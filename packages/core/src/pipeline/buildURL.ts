// packages/core/src/pipeline/buildURL.ts

import type { RouteResolver } from "./port";
import type { Canonical } from "./types";

/**
 * Stage ⑤a — the URL of a canonical intent. Accepts nothing but a
 * {@link Canonical}, so "print a URL out of un-defaulted channels" cannot be
 * expressed: the query string is printed from `canonical.query` alone, never from a
 * `search ?? params` fallback.
 *
 * The actual URL assembly stays in the engine and is reached through the port.
 * Nothing interceptable sits between the two (#1938): a plugin acts on the
 * channels ABOVE the route-default merge, at the `forwardState` seam, which is
 * the one every door runs — so what it injects reaches `state.search` and this
 * URL together instead of one of them.
 */
export function buildURL(canonical: Canonical, port: RouteResolver): string {
  return port.buildPath(canonical.name, canonical.path, canonical.query);
}
