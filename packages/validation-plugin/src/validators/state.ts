// packages/validation-plugin/src/validators/state.ts

import { isString, isParams, getTypeDescription } from "../type-guards";

export function validateMakeStateArgs(
  name: unknown,
  params: unknown,
  path: unknown,
): void {
  if (!isString(name)) {
    throw new TypeError(
      `[router.makeState] Invalid name: ${getTypeDescription(name)}. Expected string.`,
    );
  }

  if (params !== undefined && !isParams(params)) {
    throw new TypeError(
      `[router.makeState] Invalid params: ${getTypeDescription(params)}. Expected plain object.`,
    );
  }

  if (path !== undefined && !isString(path)) {
    throw new TypeError(
      `[router.makeState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
    );
  }
}

/**
 * The mode gate's opt-in diagnostic (#1575).
 *
 * Core DROPS a query key the active `queryParamsMode` will not print — always-on
 * and silent, so `state.search` can never carry what `state.path` does not show.
 * The drop is correct but invisible, and the two ways to hit it look nothing
 * alike from the outside:
 *
 * - a caller passing a key the route never declared with `?name`;
 * - a `defaultSearch` entry for such a key, which is simply DEAD CONFIG under
 *   `default` / `strict` — nothing the caller wrote is wrong, the route config
 *   just cannot take effect.
 *
 * One message covers both: core cannot tell them apart at the drop, and a guess
 * would be worse than the plain fact. Warn rather than throw — the mode is a
 * serialization option, not an error policy, and turning it into one would give
 * three behaviours for a single rule (RFC §4.7).
 *
 * De-duplicated per `route + key`: the gate runs on every navigation and every
 * `matchPath`, so an un-deduped warning would flood a dev console the moment a
 * route is revisited.
 *
 * ⚠ **The cache belongs to the ROUTER, not to the module (#1583).** A `Set` at
 * module scope is one per PROCESS: the first router to report a `route + key`
 * silenced every router after it, so under SSR / SSG the diagnostic fired for
 * request #1 and stayed quiet for the life of the process — precisely backwards
 * for a dev-time signal. It also survived `teardown()`, so re-registering the
 * plugin bought silence, and it grew without bound because nothing evicted.
 *
 * A factory rather than a `WeakMap<Router, Set>`: `buildValidatorObject` already
 * runs once per registration, so closing over a fresh `Set` there gives
 * per-router lifetime, per-router isolation and collection with the router at
 * zero new module state — and it retires the two `reset*` test seams, which
 * existed only to work around the module scope.
 */
export function createDroppedQueryKeyReporter(): (
  routeName: string,
  key: string,
) => void {
  const reported = new Set<string>();

  return function reportDroppedQueryKey(routeName: string, key: string): void {
    const seen = `${routeName} ${key}`;

    if (reported.has(seen)) {
      return;
    }

    reported.add(seen);

    console.warn(
      `[router] Query key "${key}" is not declared on route "${routeName}" (\`?${key}\`), so the ` +
        `current \`queryParamsMode\` will not print it — it was dropped from \`state.search\` rather ` +
        `than published beside a \`state.path\` that cannot show it. Declare it on the route path, ` +
        `or use \`queryParamsMode: "loose"\` to keep undeclared keys. A \`defaultSearch\` entry for ` +
        `"${key}" is dead config in this mode for the same reason.`,
    );
  };
}

/**
 * The undeclared-params-bag diagnostic (#1579 — the params half of #1553).
 *
 * A key the route declares NOWHERE — neither as a path slot nor with `?` — has
 * no channel to own it, so core keeps it in `state.params` as app-level data
 * (documented: wiki `Route.md`). Correct, but it means the state does not
 * round-trip through its own `state.path`: reopen the same link and the key is
 * gone.
 *
 * Core's behaviour is deliberately UNCHANGED — dropping the key was measured
 * and rejected. It retires a shipped capability (52 tests across 6 packages plus
 * the wiki), and the "declared nowhere" predicate cannot separate that case from
 * a legitimate one: `navigate("users", { id })` on a PARENT route whose child
 * declares `:id` is indistinguishable from a typo. A diagnostic can afford that
 * ambiguity — it says what happened and lets the developer judge; a gate cannot.
 *
 * De-duplicated per `route + key`, like the mode gate's: this runs on every
 * navigation, so an un-deduped warning floods the console on a revisit — and
 * per ROUTER, for the same reasons and by the same factory shape (#1583).
 */
export function createUndeclaredParamKeyReporter(): (
  routeName: string,
  key: string,
) => void {
  const undeclaredReported = new Set<string>();

  return function reportUndeclaredParamKey(
    routeName: string,
    key: string,
  ): void {
    const seen = `${routeName} ${key}`;

    if (undeclaredReported.has(seen)) {
      return;
    }

    undeclaredReported.add(seen);

    console.warn(
      `[router] Param "${key}" is declared nowhere on route "${routeName}" — neither as a path ` +
        `slot (:${key}) nor as a query param (?${key}), so it stays in state.params but never ` +
        `reaches the URL. The state will not round-trip: matchPath(state.path) cannot recover ` +
        `it. Declare it on the route path if it belongs in the URL, or pass it through the ` +
        `search channel; keep it here only if it is deliberately app-level data.`,
    );
  };
}
