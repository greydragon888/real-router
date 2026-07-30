// packages/core/src/pipeline/buildURL.ts

import type { RouteResolver } from "./port";
import type { Canonical } from "./types";

/**
 * Stage ⑤a — the URL of a canonical intent. Accepts nothing but a
 * {@link Canonical}, so "print a URL out of un-defaulted channels" cannot be
 * expressed: the query string is printed from `canonical.query` alone, never from a
 * `search ?? params` fallback.
 *
 * The actual URL assembly stays in the engine and is reached through the port —
 * specifically through the interceptable `ctx.buildPath`, which is a permanent
 * decision and not a milestone-1 stopgap: reaching for the engine's
 * `matcher.buildPath` would silently stop running `persistent-params`'
 * `buildPath` interceptor on the navigate path (see {@link RouteResolver}).
 */
export function buildURL(canonical: Canonical, port: RouteResolver): string {
  return port.buildPath(canonical.name, canonical.path, canonical.query);
}
