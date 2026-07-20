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

export interface SimpleState<P extends Params = Params> {
  name: string;
  params: P;
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

export interface State<P extends Params = Params> {
  name: string;
  params: P;
  path: string;
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

export interface StateMetaInput<P extends Params = Params> {
  params: P;
}

/**
 * RouterError interface describing the public API of the RouterError class.
 * The actual class implementation is in the real-router package.
 * This interface enables structural typing compatibility between
 * core-types and real-router packages.
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

export interface Params {
  [key: string]:
    | string
    | string[]
    | number
    | number[]
    | boolean
    | boolean[]
    | Params
    | Params[]
    | Record<string, string | number | boolean>
    | null
    | undefined;
}
