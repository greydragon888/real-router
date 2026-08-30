// packages/core/src/pipeline/buildURL.ts

import { diagnoseUndeclaredKeys } from "./canonicalize";

import type { RouteResolver } from "./port";
import type { Canonical } from "./types";

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

/**
 * ⑤a for a producer that will PUBLISH the state — the same URL, plus the second
 * look the chain makes necessary (#1928).
 *
 * `canonicalize` diagnoses the caller's keys BEFORE the interceptable
 * `buildPath` runs. An interceptor that writes into `canonical.path` after
 * calling `next` adds a key the URL — printed on the way out — cannot show, and
 * the producer commits it as `state.params`. Nothing saw that: measured with
 * `@real-router/validation-plugin` installed, the divergence produced ZERO
 * warnings, because the one layer whose job is to report it had already looked.
 *
 * Core does not stop the write. `addInterceptor` is a plugin right and the bag
 * is live by contract, exactly as a route's `decodeParams` is trusted to return
 * what it likes — but "the plugin's responsibility" only holds while the plugin
 * can SEE the result, so the divergence has to be reportable.
 *
 * ⚑ A SEPARATE FUNCTION rather than a flag on {@link buildURL}, and the name is
 * the point: the second look belongs to a ROLE — only a producer that publishes
 * a state can publish one contradicting its own path, while `buildPath` and
 * `isActiveRoute` return a string and a boolean and discard the bag. That role
 * is opted into (#1579), never inferred from the call's shape: `canNavigateTo`
 * shares the resolving form with `navigate` yet runs on every `<Link>` render.
 * Passing the same role as a boolean would have been the producers declaring it
 * twice — once to `canonicalize`, once here.
 *
 * ⚠ Only when the chain GREW the bag, so an ordinary commit asks the sink
 * exactly as many times as it did before this existed — the count is pinned by
 * `producer-agreement-phase2`, and an unconditional second pass would have
 * doubled it for every key on every navigation. A key REPLACED rather than added
 * slips through; that is a diagnostic's tolerance, not a gate's, and the shape
 * this exists for (`params.x = …` after `next`) grows the bag.
 *
 * ⚠ Same sink as `canonicalize`'s, deliberately: it de-duplicates per
 * `route + key`, so re-walking the whole bag here reports only what is new.
 */
export function buildURLForCommit(
  canonical: Canonical,
  port: RouteResolver,
): string {
  // Read BEFORE the chain, and only when there is a sink to report to: bare core
  // pays one `undefined` test and no walk.
  const report = port.reportUndeclaredParamKey;

  if (!report) {
    return buildURL(canonical, port);
  }

  const keysBefore = objectKeys(canonical.path).length;
  const url = buildURL(canonical, port);

  if (objectKeys(canonical.path).length > keysBefore) {
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
