// packages/core/src/pipeline/buildURL.ts

import { diagnoseUndeclaredKeys } from "./canonicalize";

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
export function buildURL(
  canonical: Canonical,
  port: RouteResolver,
  diagnoseUndeclared = false,
): string {
  // Read BEFORE the chain, and only when there is a sink to report to: bare core
  // pays one `undefined` test and no walk. The producers pass the flag
  // unconditionally, so gating on the flag alone would put a key count on every
  // commit whether or not anyone is listening.
  const report = diagnoseUndeclared ? port.reportUndeclaredParamKey : undefined;
  const keysBefore = report ? Object.keys(canonical.path).length : 0;

  const url = port.buildPath(canonical.name, canonical.path, canonical.query);

  // ⚑ The SECOND look, and it exists because the chain above can change the bag
  // (#1928). `canonicalize` diagnoses the caller's keys BEFORE the interceptable
  // runs; an interceptor that writes into `canonical.path` after calling `next`
  // adds a key the URL — already printed on the line above — cannot show, and
  // core commits it as `state.params`. Nothing saw that: measured with
  // `@real-router/validation-plugin` installed, the divergence produced ZERO
  // warnings.
  //
  // Core does not stop the write. `addInterceptor` is a plugin right and the bag
  // is live by contract, exactly as a route's `decodeParams` is trusted to
  // return what it likes — but "the plugin's responsibility" only holds while
  // the plugin can SEE the result, so the divergence has to be reportable.
  //
  // ⚠ Only when the chain GREW the bag, so the ordinary commit asks the sink
  // exactly as many times as it did before this existed — the count is pinned by
  // `producer-agreement-phase2`, and a second unconditional pass would have
  // doubled it for every key on every navigation. A key REPLACED rather than
  // added slips through; that is a diagnostic's tolerance, not a gate's, and the
  // shape this exists for (`params.x = …` after `next`) grows the bag.
  //
  // ⚠ Same sink as `canonicalize`'s, deliberately: it de-duplicates per
  // `route + key`, so re-walking the whole bag here reports only what is new.
  if (report && Object.keys(canonical.path).length > keysBefore) {
    diagnoseUndeclaredKeys(
      port,
      canonical.name,
      canonical.path,
      port.queryNames(canonical.name),
      report,
    );
  }

  return url;
}
