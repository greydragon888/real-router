// Note: RouteTreeState is exported from route-node-types.ts
// It uses RouteParams as default type parameter.
// Real Router code should use RouteTreeState<Params> when needed.

// StateContext / NavigationOptions live lexically in `./index` (the
// `@real-router/core/types` entry) — module augmentation merges only against
// the declaration-site of the resolved entry module, and in `dist` the entry
// must therefore BE the declaration-site (#1540, invariant proven in #1519).
import type { StateContext } from "./index";

/**
 * Detach function returned by subscription APIs.
 *
 * @description
 * Calling this function removes the associated listener. Returned by
 * `router.subscribe()`, `router.addEventListener()`, `router.subscribeLeave()`,
 * and plugin interceptors. Idempotent — calling more than once is safe and
 * has no additional effect after the first call.
 */
export type Unsubscribe = () => void;

export interface SimpleState<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
> {
  name: string;
  params: P;
  /**
   * Query channel — see {@link SearchParams}. Split out of the former single
   * `params` bag (RFC-4 M2 / #1548). Always present: a frozen empty object when
   * there are no query params.
   */
  search: S;
}

export type TransitionPhase = "deactivating" | "activating";

export type TransitionReason = "success" | "blocked" | "cancelled" | "error";

export interface TransitionMeta {
  phase: TransitionPhase;
  reason: TransitionReason;
  reload?: boolean;
  replace?: boolean;
  redirected?: boolean;
  from?: string;
  blocker?: string;
  segments: {
    deactivated: string[];
    activated: string[];
    intersection: string;
  };
}

export interface State<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
> {
  name: string;
  params: P;
  /**
   * Query channel — see {@link SearchParams}. Holds ONLY query-string params;
   * path params live in {@link State.params} (RFC-4 M2 / #1548). Always present:
   * a frozen empty object when there are no query params.
   */
  search: S;
  path: string;
  /**
   * Navigation metadata, attached at construction by every producer that BUILDS
   * a state from an intent (#1976).
   *
   * ⚠ It is still `?.`-worthy at a boundary, and not as a hedge. `getInternals`
   * is published; the commit door preserves a foreign State's ABSENCE rather
   * than fabricating meta (#1792), and `replace()`'s revalidation pair COPIES
   * whatever the committed state had — so `getState()` can legally return a
   * State with no `transition`, and `@real-router/sources` and
   * `shared/dom-utils` both threw on one before #1976.
   *
   * ⚠ Present is not the same as INFORMATIVE, and pre-commit it is not always
   * the same value either. The pipeline's pending target carries
   * `DEFAULT_TRANSITION` — `phase: "activating"`, `reason: "success"`, empty
   * segments — which means "no transition information", not "this succeeded",
   * and is the value {@link PluginApi.matchPath} has always published on states
   * that never transitioned. But `navigateToNotFound` builds its state BY HAND
   * with a real meta and hands it to `canDeactivate` before any commit, so a
   * guard on the 404 arc sees `replace: true`, a `from`, and populated
   * `segments`. `completeTransition` overwrites the default at the commit.
   */
  transition: TransitionMeta;
  /**
   * Plugin-extensible per-route data, attached by plugins via
   * `PluginApi.claimContextNamespace()` + `claim.write(state, value)`.
   *
   * @description
   * Required field — always present as at least `{}` on every State created by
   * the router (via `makeState`, `navigateToNotFound`, or `cloneRouter`).
   *
   * Typed extensions come from plugins augmenting {@link StateContext} through
   * module augmentation. The intersection with `Record<string, unknown>` allows
   * untyped namespaces (inline plugins, tests, or plugins that skip augmentation)
   * to write without compile errors.
   *
   * The `context` object itself is **not frozen** — this is intentional, so
   * plugins can attach data without cloning state. Core structural fields
   * (`name`, `params`, `path`, `transition`) remain immutable via shallow
   * `Object.freeze(state)`.
   *
   * @see {@link StateContext}
   */
  context: StateContext & Record<string, unknown>;
}

/**
 * Descriptor form of a navigation target (RFC-4 M2 / #1548). The two-channel
 * counterpart to the positional `navigate(name, params, search, opts)` form:
 * `params` is the path channel, `search` the query channel. Passed as the first
 * argument to `router.navigate(target, opts?)` / `router.buildPath(target)` /
 * `router.isActiveRoute(target)` and as the `to` prop of framework `<Link>`s,
 * so a target can be threaded as one value instead of positional arguments.
 */
export interface NavigationTarget<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
> {
  name: string;
  params?: P;
  search?: S;
}

/**
 * The two navigation channels (RFC-4 M2 / #1548): `params` is the path channel,
 * `search` the query channel. With the default arguments it is the STATE side
 * of a per-route codec (#2834): what {@link Route.decodeParams} returns and what
 * {@link Route.encodeParams} receives and returns. A codec transforms the
 * channel(s) it owns and passes the other through.
 *
 * The URL side is {@link UrlChannels}, what `decodeParams` receives.
 */
export interface ParamsSearch<
  P extends Params = Params,
  S extends SearchParams = SearchParams,
> {
  params: P;
  search: S;
}

/**
 * The URL side of a per-route codec (#2834): what {@link Route.decodeParams}
 * receives. Path slots are the strings the matcher captured; query values are
 * typed by the parser.
 *
 * `encodeParams` returns into the URL and is still typed {@link ParamsSearch}:
 * an encoder hands on a channel it does not own — `search` as it came, or
 * `{ ...search }` with nothing after it — and that channel holds state values,
 * so a URL-typed return would refuse the encoder. The wiki's Dates recipe,
 * which `codec-state-values-2834.test.ts` type-checks, hands on `params`.
 */
export type UrlChannels = ParamsSearch<
  Record<string, string>,
  Record<string, SearchParamValue | undefined>
>;

/**
 * Parsed shape produced by `serializeRouterState()` (`@real-router/ssr-utils`,
 * after `JSON.parse`). Identical to {@link State} minus `transition`
 * (per-navigation `TransitionMeta` is meaningless after hydration; the client
 * builds its own on commit). Defined here, not in `ssr-utils`, because the
 * shape is core's own `State`; `ssr-utils` re-exports it.
 *
 * ⚠ Under the default `JSON.parse`, a `Date` in a channel comes back as its ISO
 * string, and an Invalid Date as `null`.
 */
export type SerializedRouterState<P extends Params = Params> = Omit<
  State<P>,
  "transition"
>;

/**
 * RouterError interface describing the public API of the RouterError class.
 * The class itself is `RouterError.ts`; this interface is what a consumer types
 * against, so an error can be described without importing the implementation.
 */
export interface RouterError extends Error {
  [key: string]: unknown;
  readonly code: string;
  readonly segment: string | undefined;
  readonly path: string | undefined;
  setCode: (code: string) => void;
  setErrorInstance: (err: Error) => void;
  setAdditionalFields: (fields: Record<string, unknown>) => void;
  hasField: (key: string) => boolean;
  getField: (key: string) => unknown;
  toJSON: () => Record<string, unknown>;
}

/**
 * A value a state channel carries (#2834): a JSON primitive, a `Date`, a plain
 * object of state values, an array of any of those, or `undefined`. An array
 * holds no `undefined`, which JSON would print as `null`. It is what
 * {@link State.params} and {@link State.search} hold, what `navigate` and route
 * defaults take, and what a route's `decodeParams` may return.
 *
 * Core compares these by value — a `Date` by its time, a plain object by its
 * JSON (`areParamValuesEqual`) — and `@real-router/sources`' `canonicalJson`
 * builds a cache key from them and refuses any other object.
 *
 * A URL holds less: a path slot is a string and a query value a
 * {@link SearchParamValue}. A route codec converts between the two; without
 * one, a `Date` or an object does not survive the trip through the URL.
 */
export type ParamValue = ParamLeaf | ParamLeaf[] | undefined;

/**
 * A {@link ParamValue} that is neither an array nor `undefined`.
 *
 * ⚠ One array level, not a recursive `ParamValue[]`: the recursive form fails
 * core's type-check with TS2589.
 */
type ParamLeaf = string | number | boolean | null | Date | Params;

/** The path channel, {@link State.params}: path slots and app-level data. */
export interface Params {
  [key: string]: ParamValue;
}

/**
 * A primitive query value as the URL parser types it. Mirrors the engine's
 * `QueryParamPrimitive` (`engine/search-params/types.ts`).
 */
export type SearchParamPrimitive = string | number | boolean | null;

/**
 * A single query value as the URL parser types it — a primitive or an array of
 * primitives. It is what `decodeParams` receives ({@link UrlChannels}); the
 * state side carries a {@link ParamValue}.
 */
export type SearchParamValue = SearchParamPrimitive | SearchParamPrimitive[];

/**
 * The query channel, {@link State.search} (RFC-4 M2 / #1548). Its values are
 * state values (#2834); what the URL parser produces for it is a
 * {@link SearchParamValue}, which is one.
 */
export type SearchParams = Record<string, ParamValue>;
