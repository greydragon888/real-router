/**
 * Router types and interfaces.
 *
 * Factory types (PluginFactory, GuardFnFactory) and
 * route config types (Route, RouteConfigUpdate) use self-referencing Router<D>
 * within this single file to resolve circular dependencies.
 */

import type { State, Params, RouterError, Unsubscribe } from "./base";
// Augment-target interfaces are declared lexically in the entry (#1540); the
// type-only cycle with the barrel is deliberate — see the note in ./index.
import type { NavigationOptions } from "./index";
import type { LimitsConfig } from "./limits";
import type { QueryParamsMode, QueryParamsOptions } from "./route-node-types";

// Logger types — CANONICAL home. Formerly duplicated here "to avoid dependency"
// on @real-router/logger (v1 exception registry #16); that package is now folded
// into @real-router/core (`src/foundation/logger`), so this is the single source
// of the logger contract, shared by core's `RouterLogger`, its config validation,
// and any plugin/consumer that reaches the router's logger.
export type LogLevel = "log" | "warn" | "error";

export type LogLevelConfig = "all" | "warn-error" | "error-only" | "none";

export type LogCallback = (
  level: LogLevel,
  context: string,
  message: string,
  ...args: unknown[]
) => void;

export interface LoggerConfig {
  level: LogLevelConfig;
  callback?: LogCallback | undefined;
  callbackIgnoresLevel?: boolean;
}

/**
 * Per-router logging surface — the contract core writes through and plugins
 * consume.
 *
 * Core stores a concrete instance on `RouterInternals.logger` (built from
 * `options.logger` in the `Router` constructor); plugins and other consumers
 * reach that same per-instance logger via `getPluginApi(router).logger`. The
 * concrete `RouterLogger` class lives in core's `foundation/logger` — this
 * interface is the shared contract, so nothing outside core needs to import the
 * class (or depend on the former standalone `@real-router/logger` package).
 */
export interface RouterLogger {
  log: (context: string, message: string, ...args: unknown[]) => void;
  warn: (context: string, message: string, ...args: unknown[]) => void;
  error: (context: string, message: string, ...args: unknown[]) => void;
}

/**
 * Callback function for dynamically resolving the default route.
 * Receives a dependency getter function to access router dependencies.
 */
export type DefaultRouteCallback<Dependencies = object> = (
  getDependency: <K extends keyof Dependencies>(name: K) => Dependencies[K],
) => string;

/**
 * Callback function for dynamically resolving the forward target route.
 * Receives a dependency getter function and current route parameters.
 */
export type ForwardToCallback<Dependencies = object> = (
  getDependency: <K extends keyof Dependencies>(name: K) => Dependencies[K],
  params: Params,
) => string;

/**
 * Callback function for dynamically resolving the default parameters.
 * Receives a dependency getter function to access router dependencies.
 */
export type DefaultParamsCallback<Dependencies = object> = (
  getDependency: <K extends keyof Dependencies>(name: K) => Dependencies[K],
) => Params;

/**
 * Router configuration options.
 *
 * Note: For input, use `Partial<Options>` as all fields have defaults.
 * After initialization, `getOptions()` returns resolved `Options` with all fields populated.
 */
export interface Options {
  /**
   * Default route to navigate to on start.
   * Empty string means no default route.
   *
   * @default ""
   */
  defaultRoute: string | DefaultRouteCallback;

  /**
   * Default parameters for the default route.
   *
   * @default {}
   */
  defaultParams: Params | DefaultParamsCallback;

  /**
   * How to handle trailing slashes in URLs.
   * - "strict": Route must match exactly
   * - "never": Always remove trailing slash
   * - "always": Always add trailing slash
   * - "preserve": Keep the source path's trailing-slash choice, even when
   *   `rewritePathOnMatch: true` rewrites the rest of the path.
   *
   * @default "preserve"
   */
  trailingSlash: "strict" | "never" | "always" | "preserve";

  /**
   * Whether route matching is case-sensitive.
   *
   * When `false`, a mixed-case URL matches a lower-case route (`/Team` matches a
   * `/team` route). Dynamic param **values** keep their original case — only
   * static literal segments are compared case-insensitively.
   *
   * Default `true` (spec-correct: RFC 3986 §6.2.2.1 treats URL paths as
   * case-sensitive). Case-insensitive is an explicit **opt-in** for a narrow
   * niche — server-less / hash / static-hosted / legacy routing where no server
   * or edge layer can normalize the URL's case before it reaches the router. For
   * public SSR/edge apps, prefer a canonical-lowercase redirect at the server
   * instead (SEO / dedup). Note the divergence from React Router v7 / TanStack /
   * vue-router, which default to case-**insensitive**.
   *
   * @default true
   */
  caseSensitive: boolean;

  /**
   * How to encode URL parameters.
   * - "default": Standard encoding
   * - "uri": URI encoding (encodeURI)
   * - "uriComponent": Component encoding (encodeURIComponent)
   * - "none": No encoding
   *
   * @default "default"
   */
  urlParamsEncoding: "default" | "uri" | "uriComponent" | "none";

  /**
   * How to handle query parameters.
   *
   * @default "loose"
   */
  queryParamsMode: QueryParamsMode;

  /**
   * Query parameter parsing options.
   *
   * @default undefined
   */
  queryParams?: QueryParamsOptions;

  /**
   * Allow matching routes that don't exist.
   * When true, unknown routes navigate without error.
   *
   * @default true
   */
  allowNotFound: boolean;

  /**
   * Rewrite `state.path` on successful match to the canonical path built
   * from the matched route's pattern. Applies `forwardTo` aliases, encoders,
   * `defaultParams`, and `trailingSlash` normalization (`"never"` / `"always"`).
   * When `trailingSlash: "preserve"`, the source path's trailing-slash choice
   * is kept on the rewritten path.
   *
   * @default true
   */
  rewritePathOnMatch: boolean;

  /**
   * Logger configuration.
   *
   * @default undefined
   */
  logger?: Partial<LoggerConfig>;

  /**
   * Router resource limits configuration.
   * Controls maximum allowed values for various router operations.
   *
   * @default DEFAULT_LIMITS (from LimitsNamespace)
   */
  limits?: Partial<LimitsConfig>;
}

export type GuardFn = (
  toState: State,
  fromState: State | undefined,
  signal?: AbortSignal,
) => boolean | Promise<boolean>;

export type DefaultDependencies = object;

export interface Plugin {
  onStart?: () => void;
  onStop?: () => void;
  onTransitionStart?: (toState: State, fromState?: State) => void;
  onTransitionLeaveApprove?: (toState: State, fromState?: State) => void;
  onTransitionCancel?: (toState: State, fromState?: State) => void;
  onTransitionError?: (
    toState: State | undefined,
    fromState: State | undefined,
    err: RouterError,
  ) => void;
  onTransitionSuccess?: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => void;
  teardown?: () => void;
}

export interface SubscribeState {
  route: State;
  previousRoute?: State | undefined;
}

export type SubscribeFn = (state: SubscribeState) => void;

export interface LeaveState {
  route: State;
  nextRoute: State;
  signal: AbortSignal;
}

export type LeaveFn = (state: LeaveState) => void | Promise<void>;

export interface Listener {
  [key: string]: unknown;
  next: (val: unknown) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

export interface Subscription {
  unsubscribe: Unsubscribe;
}

/**
 * Navigator interface - a minimal, safe subset of Router methods.
 *
 * Provides only the essential navigation and state inspection methods.
 * Excludes lifecycle methods (start, stop), plugin management, and internal APIs.
 * Use this when you need to pass a limited router interface to components.
 *
 * For full router access, use the Router interface directly or the useRouter() hook.
 */
export interface Navigator {
  navigate: (
    routeName: string,
    routeParams?: Params,
    options?: NavigationOptions,
  ) => Promise<State>;
  getState: () => State | undefined;
  isActiveRoute: (
    name: string,
    params?: Params,
    strictEquality?: boolean,
    ignoreQueryParams?: boolean,
  ) => boolean;
  canNavigateTo: (name: string, params?: Params) => boolean;
  subscribe: (listener: SubscribeFn) => Unsubscribe;
  subscribeLeave: (listener: LeaveFn) => Unsubscribe;
  isLeaveApproved: () => boolean;
}

/**
 * Router interface — full public API for route navigation and lifecycle management.
 *
 * Generic parameter D constrains dependency injection types.
 * Factory types (PluginFactory, GuardFnFactory) self-reference this interface
 * within the same file to avoid circular dependencies.
 */
export interface Router<D extends DefaultDependencies = DefaultDependencies> {
  // Plugins add properties at runtime (e.g. browser-plugin adds buildUrl, matchUrl).
  // Index signature allows property access when module augmentation isn't in scope.
  [key: string]: unknown;

  isActiveRoute: (
    name: string,
    params?: Params,
    strictEquality?: boolean,
    ignoreQueryParams?: boolean,
  ) => boolean;

  buildPath: (route: string, params?: Params) => string;

  getState: <P extends Params = Params>() => State<P> | undefined;

  getPreviousState: () => State | undefined;

  areStatesEqual: (
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ) => boolean;

  shouldUpdateNode: (
    nodeName: string,
  ) => (toState: State, fromState?: State) => boolean;

  isActive: () => boolean;

  start: (startPath: string) => Promise<State>;

  stop: () => this;

  dispose: () => void;

  canNavigateTo: (name: string, params?: Params) => boolean;

  usePlugin: (
    ...plugins: (PluginFactory<D> | false | null | undefined)[]
  ) => Unsubscribe;

  subscribe: (listener: SubscribeFn) => Unsubscribe;

  subscribeLeave: (listener: LeaveFn) => Unsubscribe;

  isLeaveApproved: () => boolean;

  navigate: (
    routeName: string,
    routeParams?: Params,
    options?: NavigationOptions,
  ) => Promise<State>;

  navigateToDefault: (options?: NavigationOptions) => Promise<State>;

  navigateToNotFound: (path?: string) => State;
}

// =============================================================================
// Factory Types (self-reference Router<D>)
// =============================================================================

/**
 * Factory function for creating plugins.
 * Receives the router instance and a dependency getter.
 */
export type PluginFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => Plugin;

/**
 * Factory function for creating guards.
 * Receives the router instance and a dependency getter.
 */
export type GuardFnFactory<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> = (
  router: Router<Dependencies>,
  getDependency: <K extends keyof Dependencies>(key: K) => Dependencies[K],
) => GuardFn;

// =============================================================================
// Route Configuration Types (use GuardFnFactory<D> + ForwardToCallback<D>)
// =============================================================================

/**
 * Route configuration.
 */
export interface Route<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  [key: string]: unknown;
  /** Route name (dot-separated for nested routes). */
  name: string;
  /** URL path pattern for this route. */
  path: string;
  /** Factory function that returns a guard for route activation. */
  canActivate?: GuardFnFactory<Dependencies>;
  /** Factory function that returns a guard for route deactivation. */
  canDeactivate?: GuardFnFactory<Dependencies>;
  /**
   * Redirects navigation to another route.
   *
   * IMPORTANT: forwardTo creates a URL alias, not a transition chain.
   * Guards (canActivate) on the source route are NOT executed.
   * Only guards on the final destination are executed.
   *
   * This matches Vue Router and Angular Router behavior.
   */
  forwardTo?: string | ForwardToCallback<Dependencies>;
  /** Nested child routes. */
  children?: Route<Dependencies>[];
  /** Encodes state params to URL params. */
  encodeParams?: (stateParams: Params) => Params;
  /** Decodes URL params to state params. */
  decodeParams?: (pathParams: Params) => Params;
  /**
   * Default parameters for this route.
   *
   * These values are merged into state.params when creating route states.
   * Missing URL params are filled from defaultParams.
   */
  defaultParams?: Params;
}

/**
 * Configuration update options for `updateRoute()`.
 *
 * All properties are optional. For every field, `null` removes the
 * configuration, `undefined` (or omission) leaves it untouched, and any other
 * value sets it — values are shallow-merged into the route by patch key.
 *
 * Besides the structural and guard fields below, `update` also patches
 * **plugin-defined custom fields** (lifecycle hooks, `preload`, `searchSchema`,
 * …), symmetric with how `add`/`replace` register them. This interface is
 * **augmentable**: a plugin declares its updatable field via declaration
 * merging, mirroring its `Route` augmentation but with `| null` to allow removal:
 *
 * ```ts
 * declare module "@real-router/core" {
 *   interface RouteConfigUpdate<Dependencies extends DefaultDependencies> {
 *     onNavigate?: LifecycleHookFactory<Dependencies> | null;
 *   }
 * }
 * ```
 *
 * Note: `name` / `path` / `children` are route identity and are NOT patchable —
 * use `remove` + `add` to restructure. The interface stays closed (no index
 * signature) so typos in structural field names remain compile errors.
 */
export interface RouteConfigUpdate<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Set to null to remove forwardTo */
  forwardTo?: string | ForwardToCallback<Dependencies> | null;
  /** Set to null to remove defaultParams */
  defaultParams?: Params | null;
  /** Set to null to remove decoder */
  decodeParams?: ((params: Params) => Params) | null;
  /** Set to null to remove encoder */
  encodeParams?: ((params: Params) => Params) | null;
  /** Set to null to remove canActivate */
  canActivate?: GuardFnFactory<Dependencies> | null;
  /** Set to null to remove canDeactivate */
  canDeactivate?: GuardFnFactory<Dependencies> | null;
}
