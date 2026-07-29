// packages/core/src/pipeline/port.ts

import type { Params, SearchParams } from "../types";

/**
 * The pipeline's read-model over the routes layer — a narrow port, not a new
 * layer. The module stays pure and mock-testable; the router implements the
 * port at wiring time (`wiring/wireNamespaces.ts`).
 *
 * ⚠ **Both ends are deliberately interceptable on milestone 1.** The signatures
 * describe the pipeline's contract, not where the implementation goes:
 *
 * - `resolveForward` is wired to the `forwardState` SEAM (`Router.ts:268-292`),
 *   i.e. the interceptable chain PLUS the channel-separation wrapper. Stage ②
 *   therefore lives inside the port implementation, never inside the pipeline —
 *   which is exactly what keeps `canonicalize` in its target shape while the
 *   ~84 legacy single-bag test pins stay green. Calling the namespace primitive
 *   directly would switch off both the interceptors and ②.
 * - `buildPath` is wired to `ctx.buildPath`, the interceptable, because today's
 *   navigate path builds `state.path` through it (measured: one `navigate()`
 *   runs BOTH the `forwardState` and the `buildPath` interceptor). Reaching for
 *   the engine's `matcher.buildPath` here would silently stop running
 *   `persistent-params`' `buildPath` interceptor on the navigate path — a
 *   behaviour change, not a refactor.
 *
 * Un-wiring those (engine-level ⑤a, ② outside the port) is Phase 2/4 work, each
 * with its own commit and its own test migration.
 *
 * Accessors arrive with their consumers: the design (RFC §4.5) also lists
 * `queryNames`, `admitsUndeclaredQuery` and `encode`, which have no caller on
 * this milestone — `queryNames` comes with the channel guard (0b-0 / 0b-2),
 * `admitsUndeclaredQuery` with the mode gate (0b-4), `encode` with Phase 2. A
 * member added early would be dead weight nothing detects: knip has no issue
 * type for unused members of an interface.
 */
export interface RouteResolver {
  /**
   * Stage ① — resolve the `forwardTo` chain (layering the source route's
   * defaults) and hand back channel-correct bags. `search` flows THROUGH the
   * interceptor zone, not past it: `search-schema` validates the query channel
   * here on the URL→State direction.
   */
  resolveForward: (
    name: string,
    params: Params,
    search?: SearchParams,
  ) => {
    name: string;
    params: Params;
    // `| undefined` alongside the `?`: a seam that simply hands its argument
    // back (no query passed in) returns the property present-but-undefined, and
    // `exactOptionalPropertyTypes` treats that as a distinct type from absent.
    search?: SearchParams | undefined;
  };

  /**
   * Stage ③ input — the route's per-channel defaults. Split by field, never
   * inferred: `defaultParams` owns the path channel, `defaultSearch` the query
   * channel (RFC-4 M2 / #1548).
   *
   * Two accessors rather than one returning `{ params, search }`: `navigate` is
   * the hot path, and the combined form allocated one throwaway object per
   * navigation. That allocation is the deterministic reason; the bench arm it
   * was measured on also carried a per-call `getInternals`, and the harness's
   * own A/A spread is wider than the delta, so no percentage is attributable to
   * this accessor alone.
   */
  defaultParams: (name: string) => Params | undefined;
  defaultSearch: (name: string) => SearchParams | undefined;

  /**
   * Stage ⑤a executor — builds the URL from already-merged channels. Kept in
   * raw-channel form (not `Canonical`) so the port never has to know about the
   * brand and stays mockable on its own; `buildURL` is the primitive that
   * accepts nothing but a `Canonical`.
   */
  buildPath: (name: string, params: Params, search: SearchParams) => string;

  /**
   * The route's declared `?query` names — the ONE registry that classifies and
   * prints (#1556), so a key enters the query channel iff the build shows it.
   * A name that also occupies a path slot (`/items/:id?id`) is absent here by
   * construction: it is legitimately path-owned (#843 / #1549).
   */
  queryNames: (name: string) => readonly string[];

  /**
   * The mode gate (#1575) — `true` exactly for `queryParamsMode: "loose"`, the
   * one mode whose build prints undeclared query keys. Read as a boolean rather
   * than leaking the mode itself into the pipeline: the pipeline's question is
   * "may an undeclared key be canonical here?", not "which mode is this?".
   */
  admitsUndeclaredQuery: () => boolean;

  /**
   * The mode gate's opt-in diagnostic sink (#1575) — `undefined` unless
   * `validation-plugin` is installed, so bare core drops silently and the
   * pipeline pays nothing. Resolved per call, not captured: the plugin
   * registers after wiring.
   *
   * ⚠ Like its sibling below, the absence has to be REAL: the router implements
   * this as a GETTER returning `undefined` while `validator === null`, not as a
   * closure that forwards into an optional-chained validator. A closure is
   * always truthy, so the pipeline's `?.` read as taken and bare core still paid
   * the `pathNames` existence lookup (#1584) once per dropped key with nothing
   * to feed. The `| undefined` in the type is what lets the getter say so under
   * `exactOptionalPropertyTypes`.
   *
   * Optional on the interface so a MOCK port (the property tests) stays a
   * four-liner: the pipeline's contract is the drop, not the report.
   */
  reportDroppedQueryKey?:
    ((routeName: string, key: string) => void) | undefined;

  /**
   * The route's PATH slot names, or `undefined` when there is NO SUCH ROUTE —
   * the other half of "is this key declared?". Needed only by the undeclared-key
   * diagnostic (#1579), which asks whether a key is declared ANYWHERE;
   * `queryNames` alone cannot answer that.
   *
   * ⚠ The `undefined` arm is load-bearing, not defensive (#1584). An empty array
   * is what an EXISTING route with no path slots returns, so `[]` cannot say
   * "no such route" — and the diagnostic, reading `[]` for both, reported every
   * key in the caller's bag as "declared nowhere on route X" for a route X that
   * has no declarations only because it has no existence. That blames the params
   * for a typo in the ROUTE name, which is the most misleading direction
   * available. The matcher already knows the difference (`getSegmentsByName`
   * answers `undefined`); this member used to discard it.
   *
   * `queryNames` is deliberately NOT given the same arm: its three consumers —
   * the diagnostic, the default merge and the mode gate — all want `[]` for a
   * missing route, and only this one asks a question that presupposes existence.
   */
  pathNames: (name: string) => readonly string[] | undefined;

  /**
   * Opt-in sink for a key the route declares NOWHERE (#1579 — the params half
   * of #1553). Absent unless `validation-plugin` is installed, and the absence
   * is what keeps the scan off the hot path: core checks one `undefined` and
   * skips the walk entirely.
   *
   * ⚠ The absence has to be REAL — the router implements this member as a
   * GETTER returning `undefined` while `validator === null`, not as a closure
   * that forwards into an optional-chained validator. A closure is always
   * truthy, so the gate would read as taken and bare core would walk the
   * caller's bag on every commit; the `| undefined` in the type is what lets
   * the getter say so under `exactOptionalPropertyTypes`.
   *
   * A diagnostic, never a gate — core keeps the key in `state.params` as
   * app-level data (wiki `Route.md`). Dropping it was measured and rejected: it
   * retires a shipped capability, and "declared nowhere" cannot tell a typo from
   * `navigate("users", { id })` on a parent whose CHILD declares `:id`.
   */
  reportUndeclaredParamKey?:
    ((routeName: string, key: string) => void) | undefined;
}
